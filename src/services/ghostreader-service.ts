/**
 * Ghostreader 行内伴读 AI 服务层
 * 
 * 基于全生态 lvAiRouter 智能调度中枢（5级自适应流水线）：
 * - 优先调用思源原生 AI 或用户配置的 Key
 * - 离线时自动探测本地 Ollama
 * - 无 Key 时优雅直连免密通道，外发前在纯本地完成 PII 脱敏
 * - 断网时规则兜底，系统永不弹报错红框
 */

import { getSharedAiRouter } from "../libs/lv-ai-router";
import { insertBlockMarkdownAfter, appendBlock } from "../api/client";
import { withDocLock } from "../libs/notice";
import {
    buildGhostreaderPrompt,
    formatGhostreaderCalloutMarkdown,
    GHOSTREADER_ACTIONS,
    type GhostreaderAction,
    type GhostreaderResult,
} from "../domain/ghostreader";

/**
 * 执行 Ghostreader 伴读问答流
 */
export async function executeGhostreader(
    action: GhostreaderAction,
    sourceText: string,
    sourceBlockId?: string,
    articleTitle?: string,
    customQuery?: string,
    onChunk?: (text: string) => void
): Promise<GhostreaderResult> {
    const meta = GHOSTREADER_ACTIONS.find((a) => a.id === action) || GHOSTREADER_ACTIONS[0];
    const { systemPrompt, prompt } = buildGhostreaderPrompt(action, sourceText, articleTitle, customQuery);
    const timestamp = new Date().toISOString();

    try {
        const router = getSharedAiRouter();
        let accumulated = "";

        const aiResponse = await router.chat({
            taskType: "socratic",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
            ],
            stream: Boolean(onChunk),
            onChunk: (chunk: string) => {
                accumulated += chunk;
                onChunk?.(accumulated);
            },
        });

        const answer = (accumulated || aiResponse.content || "").trim() || "暂无解读内容";
        return {
            action,
            actionLabel: meta.label,
            sourceText,
            sourceBlockId,
            answer,
            timestamp,
            status: aiResponse.ok ? "ready" : "failed",
            ...(aiResponse.error ? { error: aiResponse.error } : {}),
        };
    } catch (error) {
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
