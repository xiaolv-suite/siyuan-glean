import { createDailyNote, getBlockAttrs, insertBlockMarkdownAfter, listChildBlocks, postKernelEnvelope, querySql, updateBlock } from "../api/client.ts";
import { withDocLock } from "../libs/notice.ts";
import {
    DAILY_NOTE_SLOT_KEY,
    formatDailyNoteReadingMarkdown,
    type DailyNoteLabels,
    type DailyNoteReadingEntry,
} from "../domain/daily-note.ts";
import { buildXiaolvLifeLogAttrs, ensureXiaolvDiaryZone } from "../libs/lv-notice-kit.ts";
import { fetchDocMeta, readClip, setDailyNoteSlotAttr } from "./clip-store.ts";

export interface RecordDailyNoteResult {
    ok: boolean;
    dailyDocId?: string;
    blockId?: string;
    updated?: boolean;
    error?: string;
}

/**
 * 查询今日 Daily Note 中是否已有该文章的阅读记录块
 * 优先 SQL 检索，当处于异步索引窗口时回退检查子块 IAL
 */
export async function findDailyNoteReadingEntryId(dailyDocId: string, articleDocId: string): Promise<string | null> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(dailyDocId) || !/^\d{14}-[0-9a-z]{7}$/.test(articleDocId)) return null;
    try {
        const rows = await querySql<{ id: string }>(
            `SELECT id FROM blocks WHERE root_id = '${dailyDocId}' AND ial LIKE '%${DAILY_NOTE_SLOT_KEY}="${articleDocId}"%' LIMIT 1`
        );
        if (rows[0]?.id) return rows[0].id;
        // 容灾检查：当 SQL 索引异步延迟时，检查子块的实时 IAL
        const children = await listChildBlocks(dailyDocId).catch(() => []);
        for (const child of children) {
            const ial = await getBlockAttrs(child.id).catch(() => ({} as Record<string, string>));
            if ((ial as Record<string, string>)?.[DAILY_NOTE_SLOT_KEY] === articleDocId) {
                return child.id;
            }
        }
        return null;
    } catch (e) {
        console.debug("[glean] 查询日记阅读记录失败:", e);
        return null;
    }
}

/**
 * 将文章阅读记录幂等追加或原地更新到今日 Daily Note（日记）中
 * 保持严格幂等：已有则 updateBlock 原地刷新评分和状态，未有则统一落入 #### 🐴 小驴记录 折叠区
 */
export async function recordDailyNoteReading(
    notebookId: string,
    articleDocId: string,
    labels?: Partial<DailyNoteLabels>,
): Promise<RecordDailyNoteResult> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(articleDocId)) {
        return { ok: false, error: "文章 ID 非法" };
    }

    // 优先探查全生态已有的今日日记正身（避让冲突副本，已有日记绝不新建）
    let dailyDocId: string | null = null;
    try {
        const { findTodayDailyNoteDocId, resolveDailyNotebookId } = await import("../libs/lv-notice-kit.ts");
        let targetNb = notebookId;
        const resolved = await resolveDailyNotebookId();
        if (resolved) targetNb = resolved;
        dailyDocId = await findTodayDailyNoteDocId(targetNb);
    } catch { /* ignore */ }

    // 若全库尚无今日日记，才调用端点创建（绝不无参发 {} 触发 v3.8.12 notebook 必填报错）
    if (!dailyDocId) {
        let targetNb = notebookId;
        try {
            const { resolveDailyNotebookId } = await import("../libs/lv-notice-kit.ts");
            const resolved = await resolveDailyNotebookId();
            if (resolved) targetNb = resolved;
        } catch { /* ignore */ }
        if (!targetNb?.trim()) {
            try {
                const { listNotebooks } = await import("../api/client.ts");
                const notebooks = await listNotebooks().catch(() => []);
                const openNb = notebooks.find((n) => !n.closed) ?? notebooks[0];
                if (openNb?.id) targetNb = openNb.id;
            } catch { /* ignore */ }
        }
        if (targetNb?.trim()) {
            dailyDocId = await createDailyNote(targetNb.trim()).catch(() => null);
        }
    }

    if (!dailyDocId) {
        return { ok: false, error: "未找到或无法创建有效的今日日记文档" };
    }

    try {
        return await withDocLock(dailyDocId, async () => {
            const [meta, attrs] = await Promise.all([
                fetchDocMeta(articleDocId),
                readClip(articleDocId),
            ]);

            const entry: DailyNoteReadingEntry = {
                docId: articleDocId,
                title: meta.title || "",
                author: attrs.author,
                site: attrs.site,
                url: attrs.url,
                status: attrs.status,
                rating: attrs.rating,
                readMinutes: attrs.readMinutes,
                words: attrs.words,
                summary: attrs.summary,
                time: attrs.time,
            };

            const markdown = formatDailyNoteReadingMarkdown(entry, labels);
            const existingEntryId = await findDailyNoteReadingEntryId(dailyDocId!, articleDocId);

            if (existingEntryId) {
                await updateBlock(existingEntryId, markdown, "markdown");
                return { ok: true, dailyDocId: dailyDocId!, blockId: existingEntryId, updated: true };
            }

            const zone = await ensureXiaolvDiaryZone(dailyDocId, { postFn: postKernelEnvelope });
            const createdBlockId = await insertBlockMarkdownAfter(zone.anchorBlockId, markdown);

            if (createdBlockId) {
                const unifiedAttrs = buildXiaolvLifeLogAttrs({
                    type: "阅读拾遗",
                    body: meta.title || articleDocId,
                    source: "siyuan-glean",
                    module: "reading",
                    target: articleDocId,
                    refDocId: articleDocId,
                    refDocTitle: meta.title || "",
                });
                await setDailyNoteSlotAttr(createdBlockId, articleDocId, unifiedAttrs);
            }

            return { ok: true, dailyDocId, blockId: createdBlockId, updated: false };
        });
    } catch (error) {
        console.warn("[glean] 记录阅读足迹至今日日记失败:", error);
        return { ok: false, error: error instanceof Error ? error.message : "记录失败" };
    }
}

/**
 * 批量将今日必读文章计划写入今日日记（BL-37）
 */
export async function recordBatchDailyNotePlan(
    notebookId: string,
    articleDocIds: string[],
    labels?: Partial<DailyNoteLabels>,
): Promise<{ ok: boolean; count: number; dailyDocId?: string; error?: string }> {
    if (!notebookId?.trim() || articleDocIds.length === 0) {
        return { ok: false, count: 0, error: "参数不合法" };
    }
    try {
        let count = 0;
        let lastDailyDocId = "";
        for (const docId of articleDocIds) {
            const res = await recordDailyNoteReading(notebookId, docId, labels);
            if (res.ok) {
                count++;
                if (res.dailyDocId) lastDailyDocId = res.dailyDocId;
            }
        }
        return { ok: true, count, dailyDocId: lastDailyDocId };
    } catch (error) {
        return { ok: false, count: 0, error: error instanceof Error ? error.message : "批量写入日记失败" };
    }
}
