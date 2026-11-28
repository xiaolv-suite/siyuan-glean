/**
 * 小驴全生态统一 AI 网关调度与适配器 (Lv Ecosystem AI Gateway Adapter)
 * Epoch 7 / Protocol v200
 *
 * 核心规范：
 * 1. 零私有 API Key 硬编码依赖：插件自身绝不硬编码、不留存明文 API Key；
 * 2. 单一真相隐私闸门：全部 AI 调用接入 assertLvAiChannelAllowed + resolveLvAiDestinationLabel，
 *    当 aiSiyuanOnly=true 或未授权共享 Key 时硬拦截并给出清晰说明；
 * 3. 多级自协商与平滑调度：
 *    - Level 1: 生态统一 AI 网关 (window.xiaolvAiGateway / window.lvAiGateway / window.siyuanAiGateway)
 *    - Level 2: 思源内置官方 AI (chatGPT 端点，开箱即用免配密钥)
 *    - Level 3: 思源安全密钥库加密通道 (plugin.getSecret 运行时安全读取)
 * 4. 失败静默降级：模型未配置、网络超时或未授权均返回结构化 failure，绝不阻断主流程。
 */

import type { Plugin } from "siyuan";
import { chatGPT } from "../api/ai.ts";
import { chatCompletionDirect } from "../api/ai-direct.ts";
import type { GleanSettings } from "./settings.ts";
import { classifyAiFailure, type AiCallFailure } from "../domain/enrich.ts";
import { formatLvAiPolicyBlockMessage } from "../libs/ai-feedback.ts";
import {
    assertLvAiChannelAllowed,
    getLvEcosystemToggles,
    LvAiPolicyBlockedError,
    lvAi,
    resolveLvAiDestinationLabel,
} from "../libs/notice.ts";

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

export const GLEAN_PLUGIN_ID = "siyuan-glean";
export const GLEAN_SOURCE_LABEL = "小驴拾遗";

function isPolicyBlockError(error: unknown): error is LvAiPolicyBlockedError | (Error & { code?: string }) {
    if (error instanceof LvAiPolicyBlockedError) return true;
    if (error && typeof error === "object" && "code" in error) {
        const code = (error as { code?: unknown }).code;
        return code === "ai_siyuan_only" || code === "ai_shared_key_denied" || code === "ai_origin_mismatch";
    }
    const msg = error instanceof Error ? error.message : String(error ?? "");
    return /仅允许思源本体 AI|未被授权读取生态共享 AI Key|目标域名已偏离/.test(msg);
}

export function formatPolicyBlockedMessage(error: unknown, destinationLabel: string): string {
    return formatLvAiPolicyBlockMessage(error, destinationLabel);
}

/** 解析当前拾遗设置的真实 AI 外发目标去向标签 */
export function resolveGleanAiDestination(settings: GleanSettings): {
    kind: "siyuan" | "user_custom" | "ollama" | "public_free" | "rule_fallback";
    label: string;
    hostname: string;
    origin: string;
} {
    if (settings.ai.channel === "custom") {
        return resolveLvAiDestinationLabel({
            channel: "user_custom",
            endpoint: settings.ai.customBaseUrl,
        });
    }
    const toggles = getLvEcosystemToggles();
    const aiConfig = typeof lvAi?.getConfig === "function" ? lvAi.getConfig() : null;
    if (!toggles.aiSiyuanOnly && (aiConfig?.hasSecret || aiConfig?.endpoint || aiConfig?.model)) {
        return resolveLvAiDestinationLabel({
            channel: "user_custom",
            endpoint: aiConfig?.endpoint || "https://api.deepseek.com/v1",
        });
    }
    return resolveLvAiDestinationLabel({
        channel: "siyuan",
    });
}

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
 * 优先校验单一真相隐私闸门（assertLvAiChannelAllowed），再按用户通道、统一网关（lvAi）或思源内置 AI 通道执行。
 */
export async function dispatchUnifiedAiChat(
    plugin: Plugin,
    settings: GleanSettings,
    prompt: string,
    options: { priority?: "high" | "low"; signal?: AbortSignal } = {}
): Promise<{
    ok: boolean;
    text?: string;
    failure?: AiCallFailure;
    aborted?: boolean;
    policyReason?: string;
    destinationLabel?: string;
    source?: "gateway" | "custom" | "siyuan";
}> {
    if (options.signal?.aborted) {
        return { ok: false, aborted: true };
    }

    // 1. 若用户显式配置了自定义 OpenAI 兼容通道，先经隐私闸门校验，再走插件密钥库通道
    if (settings.ai.channel === "custom") {
        const dest = resolveLvAiDestinationLabel({
            channel: "user_custom",
            endpoint: settings.ai.customBaseUrl,
        });
        try {
            assertLvAiChannelAllowed({
                pluginId: GLEAN_PLUGIN_ID,
                source: GLEAN_SOURCE_LABEL,
                channel: "user_custom",
                endpoint: settings.ai.customBaseUrl,
                usesSharedKey: false,
            });
        } catch (error) {
            return {
                ok: false,
                failure: "permission",
                policyReason: formatPolicyBlockedMessage(error, dest.label),
                destinationLabel: dest.label,
                source: "custom",
            };
        }

        const outcome = await chatCompletionDirect(plugin, settings, prompt, { signal: options.signal });
        if (outcome.ok) return { ok: true, text: outcome.text, destinationLabel: dest.label, source: "custom" };
        if (options.signal?.aborted || outcome.reason === "aborted") {
            return { ok: false, aborted: true, destinationLabel: dest.label, source: "custom" };
        }
        if (outcome.reason?.startsWith("policy-blocked:")) {
            return {
                ok: false,
                failure: "permission",
                policyReason: outcome.reason.slice("policy-blocked:".length),
                destinationLabel: dest.label,
                source: "custom",
            };
        }
        const failure = outcome.kind === "permission" ? "permission"
            : outcome.kind === "timeout" ? "timeout"
                : outcome.kind === "network" || outcome.kind === "browser" ? "network"
                    : classifyAiFailure(new Error(String(outcome.status ?? "")));
        return { ok: false, ...(failure ? { failure } : {}), destinationLabel: dest.label, source: "custom" };
    }

    const toggles = getLvEcosystemToggles();

    // 2. 默认思源通道下尝试小驴全生态统一 AI 网关 (lvAi)，受 aiSiyuanOnly 与按插件共享 Key 授权严格约束
    if (typeof lvAi?.chat === "function") {
        const aiConfig = lvAi.getConfig?.();
        if (aiConfig?.hasSecret || aiConfig?.endpoint || aiConfig?.model) {
            const gatewayEndpoint = aiConfig?.endpoint || "https://api.deepseek.com/v1";
            const dest = resolveLvAiDestinationLabel({
                channel: "user_custom",
                endpoint: gatewayEndpoint,
            });
            if (!toggles.aiSiyuanOnly) {
                try {
                    assertLvAiChannelAllowed({
                        pluginId: GLEAN_PLUGIN_ID,
                        source: GLEAN_SOURCE_LABEL,
                        channel: "user_custom",
                        endpoint: gatewayEndpoint,
                        usesSharedKey: true,
                    });
                } catch (error) {
                    return {
                        ok: false,
                        failure: "permission",
                        policyReason: formatPolicyBlockedMessage(error, dest.label),
                        destinationLabel: dest.label,
                        source: "gateway",
                    };
                }
                try {
                    const res = await lvAi.chat({
                        source: GLEAN_PLUGIN_ID,
                        messages: [{ role: "user", content: prompt }],
                        priority: options.priority ?? "low",
                        signal: options.signal,
                    });
                    if (res?.content) {
                        return { ok: true, text: res.content, destinationLabel: dest.label, source: "gateway" };
                    }
                } catch (error) {
                    if (options.signal?.aborted) {
                        return { ok: false, aborted: true, source: "gateway" };
                    }
                    if (isPolicyBlockError(error)) {
                        return {
                            ok: false,
                            failure: "permission",
                            policyReason: formatPolicyBlockedMessage(error, dest.label),
                            destinationLabel: dest.label,
                            source: "gateway",
                        };
                    }
                    console.warn("[LvGlean] lvAi.chat 网关调度失败，自动降级:", error);
                }
                if (options.signal?.aborted) {
                    return { ok: false, aborted: true, source: "gateway" };
                }
            }
        }
    }

    // 3. 备用尝试全局 window 网关别名 (window.xiaolvAiGateway / window.lvAiGateway 等)，aiSiyuanOnly 下禁止外发
    if (!toggles.aiSiyuanOnly) {
        const gateway = getUnifiedAiGateway();
        if (gateway) {
            const dest = resolveLvAiDestinationLabel({ channel: "user_custom" });
            try {
                assertLvAiChannelAllowed({
                    pluginId: GLEAN_PLUGIN_ID,
                    source: GLEAN_SOURCE_LABEL,
                    channel: "user_custom",
                    usesSharedKey: true,
                });
            } catch (error) {
                return {
                    ok: false,
                    failure: "permission",
                    policyReason: formatPolicyBlockedMessage(error, dest.label),
                    destinationLabel: dest.label,
                    source: "gateway",
                };
            }
            try {
                if (typeof gateway.whenReady === "function") {
                    await Promise.race([
                        gateway.whenReady(),
                        new Promise((resolve) => setTimeout(resolve, 1500)),
                    ]);
                }
                if (options.signal?.aborted) {
                    return { ok: false, aborted: true, source: "gateway" };
                }
                if (typeof gateway.chat === "function") {
                    const res = await gateway.chat({ prompt });
                    if (res.ok && res.text) return { ok: true, text: res.text, destinationLabel: dest.label, source: "gateway" };
                } else if (typeof gateway.chatCompletion === "function") {
                    const res = await gateway.chatCompletion({ prompt });
                    if (res.ok && res.text) return { ok: true, text: res.text, destinationLabel: dest.label, source: "gateway" };
                }
            } catch (error) {
                if (options.signal?.aborted) {
                    return { ok: false, aborted: true, source: "gateway" };
                }
                if (isPolicyBlockError(error)) {
                    return {
                        ok: false,
                        failure: "permission",
                        policyReason: formatPolicyBlockedMessage(error, dest.label),
                        destinationLabel: dest.label,
                        source: "gateway",
                    };
                }
                console.warn("[LvGlean] 生态统一 AI 网关响应异常，自动降级:", error);
            }
            if (options.signal?.aborted) {
                return { ok: false, aborted: true, source: "gateway" };
            }
        }
    }

    // 4. 思源官方统一内置通道（默认推荐：思源内置 AI，零 Key 依赖，共享思源本体配置）
    const siyuanDest = resolveLvAiDestinationLabel({ channel: "siyuan" });
    try {
        assertLvAiChannelAllowed({
            pluginId: GLEAN_PLUGIN_ID,
            source: GLEAN_SOURCE_LABEL,
            channel: "siyuan",
        });
        const text = await chatGPT(prompt, { signal: options.signal });
        return { ok: true, text, destinationLabel: siyuanDest.label, source: "siyuan" };
    } catch (error) {
        if (options.signal?.aborted) {
            return { ok: false, aborted: true, destinationLabel: siyuanDest.label, source: "siyuan" };
        }
        if (isPolicyBlockError(error)) {
            return {
                ok: false,
                failure: "permission",
                policyReason: formatPolicyBlockedMessage(error, siyuanDest.label),
                destinationLabel: siyuanDest.label,
                source: "siyuan",
            };
        }
        const failure = classifyAiFailure(error);
        return { ok: false, ...(failure ? { failure } : {}), destinationLabel: siyuanDest.label, source: "siyuan" };
    }
}
