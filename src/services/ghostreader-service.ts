/**
 * Ghostreader 行内伴读 AI 服务层
 * 
 * 基于全生态 lvAiRouter 智能调度中枢（5级自适应流水线）：
 * - 优先调用思源原生 AI 或用户配置的 Key
 * - 离线时自动探测本地 Ollama
 * - 无 Key 时优雅直连免密通道，外发前在纯本地完成 PII 脱敏
 * - 断网时规则兜底，系统永不弹报错红框
 */

import type { Plugin } from "siyuan";
import { getSharedAiRouter } from "../libs/lv-ai-router";
import { insertBlockMarkdownAfter, appendBlock } from "../api/client";
import { assertLvAiChannelAllowed, LvAiPolicyBlockedError, resolveLvAiDestinationLabel, withDocLock } from "../libs/notice";
import type { AiCallFailure } from "../domain/enrich";
import {
    buildGhostreaderPrompt,
    formatGhostreaderCalloutMarkdown,
    GHOSTREADER_ACTIONS,
    type GhostreaderAction,
    type GhostreaderResult,
} from "../domain/ghostreader";
import { dispatchUnifiedAiChat, formatPolicyBlockedMessage, GLEAN_PLUGIN_ID, GLEAN_SOURCE_LABEL } from "./ai-gateway";
import { activeAiSettings, aiQuotaAvailable, logAiEvent, recordAiUsage } from "./enrich-service";
import { DEFAULT_SETTINGS, type GleanSettings } from "./settings";

export interface ExecuteGhostreaderContext {
    plugin?: Plugin;
    settings?: GleanSettings;
    docId?: string;
    signal?: AbortSignal;
}

export type GhostreaderExecutionOutcome = GhostreaderResult & {
    skipped?: "off" | "cap" | "error" | AiCallFailure;
    aborted?: boolean;
};

/**
 * 执行 Ghostreader 伴读问答流（遵循全局 AI 总开关、每日额度与通道优先级）
 */
export async function executeGhostreader(
    action: GhostreaderAction,
    sourceText: string,
    sourceBlockId?: string,
    articleTitle?: string,
    customQuery?: string,
    onChunk?: (text: string) => void,
    context?: ExecuteGhostreaderContext
): Promise<GhostreaderExecutionOutcome> {
    const meta = GHOSTREADER_ACTIONS.find((a) => a.id === action) || GHOSTREADER_ACTIONS[0];
    const { systemPrompt, prompt } = buildGhostreaderPrompt(action, sourceText, articleTitle, customQuery);
    const timestamp = new Date().toISOString();
    const plugin = context?.plugin;
    const currentSettings = plugin
        ? activeAiSettings(plugin, context?.settings ?? DEFAULT_SETTINGS)
        : context?.settings;

    if (currentSettings && currentSettings.ai.enrichMode === "off") {
        return {
            action,
            actionLabel: meta.label,
            sourceText,
            sourceBlockId,
            answer: "",
            timestamp,
            status: "failed",
            skipped: "off",
            error: "AI 已关闭：可在设置 → AI 富化模式开启",
        };
    }

    if (plugin && currentSettings) {
        try {
            if (!(await aiQuotaAvailable(plugin, currentSettings))) {
                return {
                    action,
                    actionLabel: meta.label,
                    sourceText,
                    sourceBlockId,
                    answer: "",
                    timestamp,
                    status: "failed",
                    skipped: "cap",
                    error: `今日 AI 调用次数已达上限（${currentSettings.ai.enrichDailyCap}）`,
                };
            }
        } catch {
            return {
                action,
                actionLabel: meta.label,
                sourceText,
                sourceBlockId,
                answer: "",
                timestamp,
                status: "failed",
                skipped: "error",
                error: "AI 额度校验失败，请稍后重试",
            };
        }
    }

    try {
        if (context?.signal?.aborted) {
            return {
                action,
                actionLabel: meta.label,
                sourceText,
                sourceBlockId,
                answer: "",
                timestamp,
                status: "failed",
                aborted: true,
                error: "已取消生成",
            };
        }

        if (currentSettings && currentSettings.ai.channel === "custom") {
            if (!plugin) {
                const dest = resolveLvAiDestinationLabel({ channel: "user_custom", endpoint: currentSettings.ai.customBaseUrl });
                try {
                    assertLvAiChannelAllowed({
                        pluginId: GLEAN_PLUGIN_ID,
                        source: GLEAN_SOURCE_LABEL,
                        channel: "user_custom",
                        endpoint: currentSettings.ai.customBaseUrl,
                        usesSharedKey: false,
                    });
                } catch (err) {
                    return {
                        action,
                        actionLabel: meta.label,
                        sourceText,
                        sourceBlockId,
                        answer: "",
                        timestamp,
                        status: "failed",
                        skipped: "permission",
                        error: formatPolicyBlockedMessage(err, dest.label),
                    };
                }
                return {
                    action,
                    actionLabel: meta.label,
                    sourceText,
                    sourceBlockId,
                    answer: "",
                    timestamp,
                    status: "failed",
                    skipped: "error",
                    error: "当前上下文缺少插件实例，无法读取自定义 AI 密钥",
                };
            }
            const combinedPrompt = `${systemPrompt}\n\n${prompt}`;
            const res = await dispatchUnifiedAiChat(plugin, currentSettings, combinedPrompt, {
                priority: "high",
                signal: context?.signal,
            });
            if (res.aborted || context?.signal?.aborted) {
                return {
                    action,
                    actionLabel: meta.label,
                    sourceText,
                    sourceBlockId,
                    answer: "",
                    timestamp,
                    status: "failed",
                    aborted: true,
                    error: "已取消生成",
                };
            }
            if (!res.ok) {
                if (context?.docId) {
                    await logAiEvent(plugin, context.docId, "ghostreader", res.policyReason || res.failure || "custom_error");
                }
                return {
                    action,
                    actionLabel: meta.label,
                    sourceText,
                    sourceBlockId,
                    answer: "",
                    timestamp,
                    status: "failed",
                    skipped: res.failure ?? "error",
                    error: res.policyReason || "自定义 AI 通道请求失败",
                };
            }
            const answer = (res.text || "").trim() || "暂无解读内容";
            onChunk?.(answer);
            await recordAiUsage(plugin);
            return {
                action,
                actionLabel: meta.label,
                sourceText,
                sourceBlockId,
                answer,
                timestamp,
                status: "ready",
            };
        }

        const router = getSharedAiRouter();
        let accumulated = "";

        const aiResponse = await router.chat({
            source: GLEAN_PLUGIN_ID,
            taskType: "socratic",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
            ],
            stream: Boolean(onChunk),
            signal: context?.signal,
            onChunk: (chunk: string) => {
                if (context?.signal?.aborted) return;
                accumulated += chunk;
                onChunk?.(accumulated);
            },
        });

        if (context?.signal?.aborted || aiResponse.error === "aborted") {
            return {
                action,
                actionLabel: meta.label,
                sourceText,
                sourceBlockId,
                answer: "",
                timestamp,
                status: "failed",
                aborted: true,
                error: "已取消生成",
            };
        }

        const policyBlockedEntry = aiResponse.fallbackHistory?.find((h) =>
            /仅允许思源本体 AI|未被授权读取生态共享 AI Key|目标域名已偏离/.test(h?.error || "")
        );
        const answer = (accumulated || aiResponse.content || "").trim() || "暂无解读内容";
        if (aiResponse.ok && plugin && aiResponse.provider !== "rule_fallback") {
            await recordAiUsage(plugin);
        } else if (!aiResponse.ok && plugin && context?.docId) {
            await logAiEvent(plugin, context.docId, "ghostreader", policyBlockedEntry?.error || aiResponse.error || "router_failed");
        }
        return {
            action,
            actionLabel: meta.label,
            sourceText,
            sourceBlockId,
            answer,
            timestamp,
            status: aiResponse.ok ? "ready" : "failed",
            ...(!aiResponse.ok && policyBlockedEntry ? { skipped: "permission" as const, error: policyBlockedEntry.error } : (aiResponse.error ? { error: aiResponse.error } : {})),
        };
    } catch (error) {
        if (error instanceof LvAiPolicyBlockedError) {
            return {
                action,
                actionLabel: meta.label,
                sourceText,
                sourceBlockId,
                answer: "",
                timestamp,
                status: "failed",
                skipped: "permission",
                error: error.message,
            };
        }
        return {
            action,
            actionLabel: meta.label,
            sourceText,
            sourceBlockId,
            answer: "",
            timestamp,
            status: "failed",
            error: error instanceof Error ? error.message : "AI 伴读请求失败",
        };
    }
}

/**
 * 将 Ghostreader 解读结果作为原生 Callout 便签块回写插入到思源文档中
 * 优先插入在当前选中块下方，并携带反向定位锚点
 */
export async function insertGhostreaderCallout(
    docId: string,
    result: GhostreaderResult,
    previousBlockId?: string
): Promise<{ ok: boolean; blockId?: string }> {
    if (!docId || !result.answer) return { ok: false };
    const markdown = formatGhostreaderCalloutMarkdown(result);

    return withDocLock(docId, async () => {
        if (previousBlockId && /^\d{14}-[0-9a-z]{7}$/.test(previousBlockId)) {
            try {
                const blockId = await insertBlockMarkdownAfter(previousBlockId, markdown);
                if (blockId) return { ok: true, blockId };
            } catch {
                // 插入相邻块失败时降级追加
            }
        }

        try {
            const blockId = await appendBlock(docId, markdown, "markdown");
            return { ok: true, blockId };
        } catch {
            return { ok: false };
        }
    });
}
