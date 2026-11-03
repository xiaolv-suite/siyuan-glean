import type { Plugin } from "siyuan";
import { getBlockAttrs, listChildBlocks, prependBlockMarkdown, querySql, updateBlock, deleteBlock } from "../api/client.ts";
import { withDocLock } from "../libs/notice.ts";
import {
    buildMetaCalloutMarkdown,
    META_CALLOUT_SLOT_KEY,
    META_CALLOUT_SLOT_VALUE,
    type MetaCalloutArticle,
    type MetaCalloutLabels,
} from "../domain/meta-callout.ts";
import { parseUserTags } from "../domain/schema.ts";
import { fetchDocMeta, readClip, setMetaCalloutSlotAttr } from "./clip-store.ts";

export interface SyncMetaCalloutResult {
    ok: boolean;
    blockId?: string;
    created?: boolean;
    error?: string;
}

/**
 * 查询文档中是否已存在导读卡片块（通过 custom-glean-slot="meta-callout" 属性快速索引）
 * 优先 SQL 检索，当处在内核异步索引窗口时回退检查前排子块实时 IAL
 */
export async function findMetaCalloutBlockId(docId: string): Promise<string | null> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(docId)) return null;
    try {
        const rows = await querySql<{ id: string }>(
            `SELECT id FROM blocks WHERE root_id = '${docId}' AND ial LIKE '%${META_CALLOUT_SLOT_KEY}="${META_CALLOUT_SLOT_VALUE}"%' LIMIT 1`
        );
        if (rows[0]?.id) return rows[0].id;
        // 异步索引容灾回退：直接检查前排子块 IAL
        const children = await listChildBlocks(docId).catch(() => []);
        for (const child of children.slice(0, 3)) {
            const ial = await getBlockAttrs(child.id).catch(() => ({} as Record<string, string>));
            if ((ial as Record<string, string>)[META_CALLOUT_SLOT_KEY] === META_CALLOUT_SLOT_VALUE) {
                return child.id;
            }
        }
        return null;
    } catch (e) {
        console.debug("[glean] 查询导读卡片块失败:", e);
        return null;
    }
}

/**
 * 一键/自动将当前文章的元数据、状态、评分与 AI 摘要同步为文档正文顶部的导读卡片
 * 严格幂等：已有则原地 updateBlock 更新，未有则在正文开头 prependBlock 插入
 */
export async function syncMetaCalloutToDocument(
    _plugin: Plugin,
    docId: string,
    labels?: MetaCalloutLabels,
): Promise<SyncMetaCalloutResult> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(docId)) {
        return { ok: false, error: "文档 ID 非法" };
    }

    return withDocLock(docId, async () => {
        try {
            const [meta, attrs, rawIal] = await Promise.all([
                fetchDocMeta(docId),
                readClip(docId),
                getBlockAttrs(docId).catch(() => ({} as Record<string, string>)),
            ]);

            const userTags = parseUserTags((rawIal as Record<string, string> | undefined)?.tags);

            const article: MetaCalloutArticle = {
                id: docId,
                title: meta.title || "",
                url: attrs.url,
                site: attrs.site,
                author: attrs.author,
                status: attrs.status,
                priority: attrs.priority,
                rating: attrs.rating,
                words: attrs.words,
                minutes: attrs.minutes,
                readMinutes: attrs.readMinutes,
                tags: userTags,
                aiTags: attrs.aiTags,
                summary: attrs.summary,
                readingPosition: attrs.readingPosition,
            };

            const markdown = buildMetaCalloutMarkdown(article, labels);
            const existingId = await findMetaCalloutBlockId(docId);

            if (existingId) {
                await updateBlock(existingId, markdown, "markdown");
                // 保障块级属性受控
                await setMetaCalloutSlotAttr(existingId);
                return { ok: true, blockId: existingId, created: false };
            } else {
                const newId = await prependBlockMarkdown(docId, markdown);
                if (newId) {
                    await setMetaCalloutSlotAttr(newId);
                }
                return { ok: true, blockId: newId, created: true };
            }
        } catch (error) {
            console.warn("[glean] 同步导读卡片至正文失败:", error);
            return { ok: false, error: error instanceof Error ? error.message : "同步失败" };
        }
    });
}

/**
 * 从文档中移除导读卡片块
 */
export async function removeMetaCalloutFromDocument(docId: string): Promise<boolean> {
    return withDocLock(docId, async () => {
        const existingId = await findMetaCalloutBlockId(docId);
        if (!existingId) return false;
        try {
            await deleteBlock(existingId);
            return true;
        } catch (error) {
            console.warn("[glean] 移除正文导读卡片失败:", error);
            return false;
        }
    });
}
