/**
 * 小驴全生态统一 AI 网关调度与适配器 (Lv Ecosystem AI Gateway Adapter)
 * Epoch 7 Standard
 *
 * 核心规范：
 * 1. 零私有 API Key 硬编码依赖：插件自身绝不硬编码、不留存明文 API Key；
 * 2. 多级自协商与平滑调度：
 *    - Level 1: 生态统一 AI 网关 (window.xiaolvAiGateway / window.lvAiGateway / window.siyuanAiGateway)
 *    - Level 2: 思源内置官方 AI (chatGPT 端点，开箱即用免配密钥)
 *    - Level 3: 思源安全密钥库加密通道 (plugin.getSecret 运行时安全读取)
 * 3. 失败静默降级：模型未配置、网络超时或未授权均返回结构化 failure，绝不阻断主流程。
 */

import type { Plugin } from "siyuan";
import { chatGPT } from "../api/ai.ts";
import { chatCompletionDirect } from "../api/ai-direct.ts";
import type { GleanSettings } from "./settings.ts";
import { classifyAiFailure, type AiCallFailure } from "../domain/enrich.ts";
import { lvAi } from "../libs/notice.ts";

export interface UnifiedAiGatewayBridge {
    protocol?: number;
    capabilities?: string[];
    hasCapability?: (name: string) => boolean;
    whenReady?: () => Promise<boolean>;
    chat?(request: { prompt: string; model?: string; stream?: boolean }): Promise<{ ok: boolean; text?: string; error?: string }>;
    chatCompletion?(request: { prompt: string; model?: string }): Promise<{ ok: boolean; text?: string; error?: string }>;
}

const AI_GATEWAY_ALIASES = [
    "xiaolvAiGateway",
    "lvAiGateway",
    "siyuanAiGateway",
    "xiaolvAi",
    "lvAi",
] as const;

/**
 * 探测宿主窗口上是否存在小驴生态统一 AI 网关
 */
export function getUnifiedAiGateway(): UnifiedAiGatewayBridge | null {
    if (typeof window === "undefined") return null;
    const host = window as unknown as Record<string, unknown>;
    for (const alias of AI_GATEWAY_ALIASES) {
        const candidate = host[alias];
        if (candidate && typeof candidate === "object") {
            const gateway = candidate as UnifiedAiGatewayBridge;
            if (typeof gateway.chat === "function" || typeof gateway.chatCompletion === "function") {
                return gateway;
            }
        }
    }
    return null;
}

/**
 * 全生态统一 AI 调度入口：
 * 优先协商统一网关（lvAi 自动排队防冲频），次选用户配置的思源安全密钥库通道，默认走思源官方免配 AI 通道
 */
export async function dispatchUnifiedAiChat(
    plugin: Plugin,
    settings: GleanSettings,
    prompt: string,
    options: { priority?: "high" | "low"; signal?: AbortSignal } = {}
): Promise<{ ok: boolean; text?: string; failure?: AiCallFailure; source?: "gateway" | "custom" | "siyuan" }> {
    // 1. 优先尝试小驴全生态统一 AI 网关 (lvAi)，支持全局凭据共享、限流队列与 429 自动指数退避
    if (typeof lvAi?.chat === "function") {
        try {
            const aiConfig = lvAi.getConfig?.();
            if (aiConfig?.apiKey) {
                const res = await lvAi.chat({
                    source: "拾遗",
                    messages: [{ role: "user", content: prompt }],
                    priority: options.priority ?? "low",
                    signal: options.signal,
                });
                if (res?.content) {
                    return { ok: true, text: res.content, source: "gateway" };
                }
            }
        } catch (error) {
            console.warn("[LvGlean] lvAi.chat 网关调度失败，自动降级:", error);
        }
    }

    // 2. 备用尝试全局 window 网关别名 (window.xiaolvAiGateway / window.lvAiGateway 等)
    const gateway = getUnifiedAiGateway();
    if (gateway) {
        try {
            if (typeof gateway.whenReady === "function") {
                await Promise.race([
                    gateway.whenReady(),
                    new Promise((resolve) => setTimeout(resolve, 1500)),
                ]);
            }
            if (typeof gateway.chat === "function") {
                const res = await gateway.chat({ prompt });
                if (res.ok && res.text) return { ok: true, text: res.text, source: "gateway" };
            } else if (typeof gateway.chatCompletion === "function") {
                const res = await gateway.chatCompletion({ prompt });
                if (res.ok && res.text) return { ok: true, text: res.text, source: "gateway" };
            }
        } catch (error) {
            console.warn("[LvGlean] 生态统一 AI 网关响应异常，自动降级:", error);
        }
    }

    // 3. 自定义 OpenAI 兼容端点（仅通过思源密钥库安全读取，严禁插件私有明文存储）
    if (settings.ai.channel === "custom") {
        const outcome = await chatCompletionDirect(plugin, settings, prompt, { signal: options.signal });
        if (outcome.ok) return { ok: true, text: outcome.text, source: "custom" };
        const failure = outcome.kind === "permission" ? "permission"
            : outcome.kind === "timeout" ? "timeout"
                : outcome.kind === "network" || outcome.kind === "browser" ? "network"
                    : classifyAiFailure(new Error(String(outcome.status ?? "")));
        return { ok: false, ...(failure ? { failure } : {}), source: "custom" };
    }

    // 4. 思源官方统一内置通道（默认推荐：思源内置 AI，零 Key 依赖，共享思源本体配置）
    try {
        const text = await chatGPT(prompt);
        return { ok: true, text, source: "siyuan" };
    } catch (error) {
        const failure = classifyAiFailure(error);
        return { ok: false, ...(failure ? { failure } : {}), source: "siyuan" };
    }
}
