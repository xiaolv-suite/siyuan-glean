import { appendBlock, createDailyNote, getBlockAttrs, insertBlockAfter, listChildBlocks, querySql, updateBlock } from "../api/client.ts";
import { withDocLock } from "../libs/notice.ts";
import {
    DAILY_NOTE_SLOT_KEY,
    DEFAULT_DAILY_NOTE_LABELS,
    formatDailyNoteReadingMarkdown,
    type DailyNoteLabels,
    type DailyNoteReadingEntry,
} from "../domain/daily-note.ts";
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
 * 查询今日 Daily Note 中是否存在阅读专区标题（如 ## 📖 今日阅读）
 */
export async function findDailyNoteReadingHeadingId(dailyDocId: string): Promise<string | null> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(dailyDocId)) return null;
    try {
        const rows = await querySql<{ id: string }>(
            `SELECT id FROM blocks WHERE root_id = '${dailyDocId}' AND type = 'h' AND (content LIKE '%今日阅读%' OR content LIKE '%阅读%') ORDER BY sort ASC LIMIT 1`
        );
        return rows[0]?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * 将文章阅读记录幂等追加或原地更新到今日 Daily Note（日记）中
 * 保持严格幂等：已有则 updateBlock 原地刷新评分和状态，未有则在阅读专区下追加
 */
export async function recordDailyNoteReading(
    notebookId: string,
    articleDocId: string,
    labels?: Partial<DailyNoteLabels>,
): Promise<RecordDailyNoteResult> {
    if (!notebookId?.trim() || !/^\d{14}-[0-9a-z]{7}$/.test(articleDocId)) {
        return { ok: false, error: "笔记本或文章 ID 非法" };
    }

    try {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const dailyDocId = await createDailyNote(notebookId);
                if (!dailyDocId) throw new Error("获取今日日记文档失败");

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
                    const existingEntryId = await findDailyNoteReadingEntryId(dailyDocId, articleDocId);

                    if (existingEntryId) {
                        await updateBlock(existingEntryId, markdown, "markdown");
                        return { ok: true, dailyDocId, blockId: existingEntryId, updated: true };
                    }

                    const headingId = await findDailyNoteReadingHeadingId(dailyDocId);
                    let createdBlockId = "";
                    if (headingId) {
                        createdBlockId = await insertBlockAfter(headingId, markdown);
                    } else {
                        const sectionHeader = labels?.sectionHeader || DEFAULT_DAILY_NOTE_LABELS.sectionHeader;
                        const newHeadingId = await appendBlock(dailyDocId, sectionHeader, "markdown");
                        createdBlockId = await insertBlockAfter(newHeadingId, markdown);
                    }

                    if (createdBlockId) {
                        await setDailyNoteSlotAttr(createdBlockId, articleDocId);
                    }

                    return { ok: true, dailyDocId, blockId: createdBlockId, updated: false };
                });
            } catch (error) {
                lastError = error;
                const isTransient = /(?:Access is denied|locked|busy)/i.test(String((error as any)?.message || error));
                if (isTransient && attempt < 2) {
                    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
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
