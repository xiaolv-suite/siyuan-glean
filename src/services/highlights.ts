import type { Plugin } from "siyuan";
import { createDocWithMd, getHighlightBlocks, listHighlightBlocks, listHighlightDocuments, newNodeId, querySql, type BlockRow } from "../api/client";
import {
    cleanHighlightText, highlightColor, highlightMarker, isHighlightId, renderHighlightsCsv, renderHighlightsMarkdown, selectHighlights,
    renderArticleHighlightsMarkdown, type ArticleHighlightGroup,
    type HighlightExportLabels, type HighlightItem, type HighlightRoot,
} from "../domain/highlights";
import { CLIP_STATUSES, parseClipAttrs, parseUserTags } from "../domain/schema";
import { batchReadClipAttrs, readClip, readHighlightColor, reconcileIndex, writeClip, writeHighlightColor } from "./clip-store";
import type { GleanSettings } from "./settings";

/** 引述块颜色标记沿用 schema 的单一事实源；颜色写入仍经 clip-store。 */
export { CLIP_HIGHLIGHT_COLORS as HL_COLORS } from "../domain/schema";
export type { ClipHighlightColor as HlColor } from "../domain/schema";

export type { HighlightItem, HighlightExportLabels } from "../domain/highlights";
export type HighlightExportReason = "changed" | "readFailed" | "empty" | "invalid";
export type HighlightSaveReason = HighlightExportReason | "busy" | "createUnknown" | "markFailed";

export class HighlightExportError extends Error {
    readonly reason: HighlightExportReason;
    constructor(reason: HighlightExportReason, cause?: unknown) {
        super(reason, { cause });
        this.reason = reason;
    }
}

export interface HighlightExportSession {
    items: HighlightItem[];
    labels: HighlightExportLabels;
    markdown: string;
    csv: string;
    box: string;
    hpath: string;
    createdDocId: string;
    state: "ready" | "created" | "saved" | "unknown";
    busy: boolean;
}

interface QualifiedRoot {
    root: HighlightRoot;
    qualified: boolean;
}

async function readRoots(
    ids: readonly string[],
    requireClipAttrs = true,
    fallbackClips?: Record<string, { title?: string; box?: string; hpath?: string }>,
): Promise<Map<string, QualifiedRoot>> {
    if (ids.some((id) => !isHighlightId(id))) throw new HighlightExportError("invalid");
    const roots = new Map<string, QualifiedRoot>();
    for (let offset = 0; offset < ids.length; offset += 200) {
        const batch = ids.slice(offset, offset + 200);
        const [documents, pairs] = await Promise.all([listHighlightDocuments(batch), batchReadClipAttrs([...batch])]);
        const attributes = new Map(pairs.map((pair) => [pair.id, pair.attrs]));
        for (const id of batch) {
            const docRow = documents.find((row) => row.id === id);
            const fallback = fallbackClips?.[id];
            const box = docRow?.box || fallback?.box || "";
            const hpath = docRow?.hpath || fallback?.hpath || "";
            const title = docRow?.content || fallback?.title || "";
            const ial = attributes.get(id);
            if (!box || !hpath || (requireClipAttrs && !ial)) throw new HighlightExportError("readFailed");
            const attrs = parseClipAttrs(ial ?? {});
            roots.set(id, {
                root: { id, title, box, hpath, site: attrs.site ?? "", tags: parseUserTags(ial?.tags), aiTags: attrs.aiTags, url: attrs.url ?? "" },
                qualified: Boolean(attrs.status) && !attrs.internal,
            });
        }
    }
    return roots;
}

function toHighlight(row: BlockRow, root: HighlightRoot): HighlightItem | null {
    const ial = row.ial ?? "";
    const highlight = highlightMarker(ial);
    const isSiyuanComment = ial.includes('custom-siyuan-comment="true"') || ial.includes("custom-siyuan-comment=true");
    const ialMemo = /memo="([^"]*)"/.exec(ial)?.[1]?.trim() || "";
    const isMemoBlock = Boolean(ialMemo) && !ial.includes('custom-glean-slot=');

    if (row.type === "d" || (row.type !== "b" && !highlight.trim() && !isSiyuanComment && !isMemoBlock)) return null;
    if (!isHighlightId(row.id) || row.root_id !== root.id || row.box !== root.box || typeof row.content !== "string" || typeof row.markdown !== "string") throw new HighlightExportError("readFailed");

    // 排除系统导读档案卡与元数据插槽
    if (ial.includes('custom-glean-slot="meta-callout"')) return null;
    if (row.content.includes("小驴拾遗 · 导读档案") || row.markdown.includes("小驴拾遗 · 导读档案")) return null;

    // 排除纯剪藏来源行（如 > 来源：https://... 或 > 🌐 来源：...）
    const trimmedContent = row.content.trim();
    const trimmedMd = row.markdown.trim();
    if (/^(?:🌐\s*)?(?:来源|URL|Link|Source)[：:]\s*(?:\[[^\]]*\]\(|<)?https?:\/\//i.test(trimmedContent)
        || /^>\s*(?:🌐\s*)?(?:来源|URL|Link|Source)[：:]/i.test(trimmedMd)) {
        return null;
    }

    let quoteText = cleanHighlightText(row.content);
    let memoText = "";
    let sourceBlockId = row.id;
    let annotationKind: "glean" | "siyuan-comment" | "native-memo" = "glean";
    let annotationTag: string | undefined = undefined;
    let color = highlightColor(ial);

    if (isSiyuanComment) {
        annotationKind = "siyuan-comment";
        const commentTextAttr = /custom-comment-text="([^"]*)"/.exec(ial)?.[1]?.trim() || "";
        const sourceAttr = /custom-comment-source="([^"]*)"/.exec(ial)?.[1]?.trim() || "";
        const tagAttr = /custom-comment-tag="([^"]*)"/.exec(ial)?.[1]?.trim() || "";
        const customColor = /custom-comment-highlight-custom-color="([^"]*)"/.exec(ial)?.[1]?.trim() || "";
        if (commentTextAttr) quoteText = commentTextAttr;
        memoText = cleanHighlightText(row.content);
        if (sourceAttr) sourceBlockId = sourceAttr;
        if (tagAttr) annotationTag = tagAttr;
        if (customColor) color = customColor;
    } else if (isMemoBlock) {
        annotationKind = "native-memo";
        memoText = ialMemo;
    } else {
        const memoSplit = quoteText.split(/(?:\r?\n)+\s*💡\s*/);
        if (memoSplit.length > 1) {
            quoteText = memoSplit[0].trim();
            memoText = memoSplit.slice(1).join("\n").trim();
        } else if (ialMemo) {
            memoText = ialMemo;
        }
    }

    if (!quoteText) return null;

    return {
        ...root,
        color: color || undefined,
        tags: [...root.tags],
        aiTags: [...root.aiTags],
        id: row.id,
        rootId: root.id,
        text: quoteText,
        memo: memoText || undefined,
        sourceBlockId,
        annotationKind,
        annotationTag,
        markdown: row.markdown,
        source: { content: row.content, markdown: row.markdown, type: row.type, highlight },
    };
}

async function collectHighlights(roots: Map<string, QualifiedRoot>): Promise<HighlightItem[]> {
    const ids = [...roots.keys()].sort();
    const items: HighlightItem[] = [];
    for (let offset = 0; offset < ids.length; offset += 200) {
        const batch = ids.slice(offset, offset + 200);
        const allowed = new Set(batch);
        let cursor = "";
        while (true) {
            const pageStartCursor = cursor;
            const page = await listHighlightBlocks(batch, cursor, 500);
            if (page.length > 500) throw new HighlightExportError("readFailed");
            for (const row of page) {
                if (!isHighlightId(row.id) || row.id < cursor || (pageStartCursor && row.id <= pageStartCursor) || !allowed.has(row.root_id)) {
                    throw new HighlightExportError("readFailed");
                }
                if (row.id === cursor) continue;
                cursor = row.id;
                const item = toHighlight(row, roots.get(row.root_id)!.root);
                if (item) items.push(item);
            }
            if (page.length < 500) break;
        }
    }
    return items.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/** 引述块列表行：供摘录墙使用的轻量、只读投影。 */
export interface LibraryQuoteRow {
    id: string;
    rootId: string;
    text: string;
    markdown: string;
}

const BLOCK_ID_PATTERN = /^\d{14}-[0-9a-z]{7}$/;

/** 引述块 content 会带引用首行杂音（"&nbsp;" 等），做轻清洗。 */
function cleanQuoteText(raw: string): string {
    return raw.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** 全库引述块分页。只读查询，root 元数据由调用方经索引/标题查询映射。 */
export async function listLibraryQuotes(limit = 500, offset = 0): Promise<LibraryQuoteRow[]> {
    const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 500;
    const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const rows = await querySql<{ id?: unknown; root_id?: unknown; content?: unknown; markdown?: unknown }>(
        `SELECT id, root_id, content, markdown FROM blocks
         WHERE type = 'b'
         ORDER BY updated DESC, id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    );
    return rows.flatMap((row) => {
        if (typeof row.id !== "string" || !BLOCK_ID_PATTERN.test(row.id)
            || typeof row.root_id !== "string" || !BLOCK_ID_PATTERN.test(row.root_id)
            || typeof row.content !== "string") return [];
        const text = cleanQuoteText(row.content);
        if (!text) return [];
        return [{ id: row.id, rootId: row.root_id, text, markdown: typeof row.markdown === "string" ? row.markdown : "" }];
    });
}

/** 批量读取引述所属文档标题；输入 ID 先做严格校验以避免拼接 SQL。 */
export async function listQuoteRoots(rootIds: string[]): Promise<Map<string, string>> {
    const titles = new Map<string, string>();
    const unique = [...new Set(rootIds)].filter((id) => BLOCK_ID_PATTERN.test(id));
    for (let offset = 0; offset < unique.length; offset += 200) {
        const batch = unique.slice(offset, offset + 200);
        const rows = await querySql<{ id?: unknown; content?: unknown }>(
            `SELECT id, content FROM blocks WHERE type = 'd' AND id IN (${batch.map((id) => `'${id}'`).join(",")})`,
        );
        for (const row of rows) {
            if (typeof row.id === "string" && BLOCK_ID_PATTERN.test(row.id)) {
                titles.set(row.id, typeof row.content === "string" ? row.content : "");
            }
        }
    }
    return titles;
}

/** 读取引述块颜色标记；权限/网络异常按空色降级。 */
export async function getQuoteColor(quoteBlockId: string): Promise<string> {
    return readHighlightColor(quoteBlockId);
}

/** 设置或清除引述块颜色标记，写属性统一经 clip-store。 */
export async function setQuoteColor(quoteBlockId: string, color: string): Promise<void> {
    await writeHighlightColor(quoteBlockId, color);
}

export async function highlightDocumentTitle(rootDocId: string): Promise<string> {
    if (!isHighlightId(rootDocId)) throw new HighlightExportError("invalid");
    const documents = await listHighlightDocuments([rootDocId]);
    if (!documents[0]) throw new HighlightExportError("readFailed");
    return documents[0].content || "";
}

export async function listDocHighlights(rootDocId: string): Promise<HighlightItem[]> {
    if (!isHighlightId(rootDocId)) throw new HighlightExportError("invalid");
    return collectHighlights(await readRoots([rootDocId], false));
}

export async function listLibraryHighlights(plugin: Plugin, settings: GleanSettings): Promise<HighlightItem[]> {
    const index = await reconcileIndex(plugin, settings);
    const ids = Object.values(index.clips).filter((entry) => CLIP_STATUSES.some((status) => status === entry.status)).map((entry) => entry.id);
    const roots = await readRoots([...new Set(ids)], true, index.clips);
    for (const [id, value] of roots) if (!value.qualified) roots.delete(id);
    return collectHighlights(roots);
}

function snapshot(item: HighlightItem): string {
    return JSON.stringify([item.id, item.rootId, item.text, item.markdown, item.title, item.box, item.hpath, item.site, item.tags, item.aiTags, item.url, item.source]);
}

export async function revalidateHighlights(items: readonly HighlightItem[]): Promise<void> {
    if (!items.length) throw new HighlightExportError("empty");
    if (items.some((item) => !isHighlightId(item.id) || !isHighlightId(item.rootId)) || new Set(items.map((item) => item.id)).size !== items.length) throw new HighlightExportError("invalid");
    try {
        const roots = await readRoots([...new Set(items.map((item) => item.rootId))]);
        for (const value of roots.values()) if (!value.qualified) throw new HighlightExportError("changed");
        for (let offset = 0; offset < items.length; offset += 200) {
            const batch = items.slice(offset, offset + 200);
            const rows = await getHighlightBlocks(batch.map((item) => item.id));
            if (rows.length !== batch.length || new Set(rows.map((row) => row.id)).size !== rows.length) throw new HighlightExportError("changed");
            for (const item of batch) {
                const row = rows.find((candidate) => candidate.id === item.id);
                if (!row || row.root_id !== item.rootId || row.box !== item.box) throw new HighlightExportError("changed");
                const fresh = toHighlight(row, roots.get(item.rootId)!.root);
                if (!fresh || snapshot(fresh) !== snapshot(item)) throw new HighlightExportError("changed");
            }
        }
    } catch (error) {
        if (error instanceof HighlightExportError) throw error;
        throw new HighlightExportError("readFailed", error);
    }
}

function exportSelection(items: readonly HighlightItem[], selectedIds: readonly string[]): HighlightItem[] {
    try {
        const selected = selectHighlights(items, selectedIds);
        if (!selected.length) throw new HighlightExportError("empty");
        return selected.map((item) => ({ ...item, tags: [...item.tags], aiTags: [...item.aiTags], source: { ...item.source } }));
    } catch (error) {
        if (error instanceof HighlightExportError) throw error;
        throw new HighlightExportError("invalid", error);
    }
}

export async function prepareHighlightExport(items: readonly HighlightItem[], selectedIds: readonly string[], labels: HighlightExportLabels): Promise<HighlightExportSession> {
    const selected = exportSelection(items, selectedIds);
    await revalidateHighlights(selected);
    const title = labels.title.replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 100);
    if (!title) throw new HighlightExportError("invalid");
    const parent = selected[0].hpath.slice(0, selected[0].hpath.lastIndexOf("/"));
    return { items: selected, labels: { ...labels }, markdown: renderHighlightsMarkdown(selected, labels), csv: renderHighlightsCsv(selected), box: selected[0].box, hpath: `${parent}/${title} ${newNodeId()}`, createdDocId: "", state: "ready", busy: false };
}

export async function exportHighlightsCsv(items: readonly HighlightItem[], selectedIds: readonly string[]): Promise<string> {
    const selected = exportSelection(items, selectedIds);
    await revalidateHighlights(selected);
    return renderHighlightsCsv(selected);
}

export async function copyHighlights(items: readonly HighlightItem[], selectedIds: readonly string[], labels: HighlightExportLabels, writeText: (text: string) => Promise<void>): Promise<void> {
    const selected = exportSelection(items, selectedIds);
    await revalidateHighlights(selected);
    await writeText(renderHighlightsMarkdown(selected, labels));
}

export async function saveHighlightDraft(plugin: Plugin, session: HighlightExportSession): Promise<{ ok: boolean; docId?: string; reason?: HighlightSaveReason }> {
    if (session.busy) return { ok: false, reason: "busy" };
    if (session.state === "saved") return { ok: true, docId: session.createdDocId };
    if (session.state === "unknown") return { ok: false, reason: "createUnknown" };
    session.busy = true;
    try {
        if (!session.createdDocId) {
            try {
                await revalidateHighlights(session.items);
                if (renderHighlightsMarkdown(session.items, session.labels) !== session.markdown || session.box !== session.items[0].box) return { ok: false, reason: "invalid" };
            } catch (error) {
                return { ok: false, reason: error instanceof HighlightExportError ? error.reason : "readFailed" };
            }
            try {
                const docId = await createDocWithMd(session.box, session.hpath, session.markdown);
                if (!isHighlightId(docId)) throw new Error("Invalid created document ID");
                session.createdDocId = docId;
                session.state = "created";
            } catch {
                session.state = "unknown";
                return { ok: false, reason: "createUnknown" };
            }
        }
        try {
            const documents = await listHighlightDocuments([session.createdDocId]);
            if (documents[0]?.box !== session.box || documents[0].hpath !== session.hpath) throw new Error("Created document identity changed");
            const attrs = await readClip(session.createdDocId);
            if (attrs.status || attrs.url?.trim()) throw new Error("Created document became an article");
            await writeClip(plugin, session.createdDocId, attrs.internal ? {} : { internal: true });
            session.state = "saved";
            return { ok: true, docId: session.createdDocId };
        } catch {
            return { ok: false, docId: session.createdDocId, reason: "markFailed" };
        }
    } finally {
        session.busy = false;
    }
}

const articleHighlightDraftCache = new Map<string, { docId: string; box: string; hpath: string }>();

/**
 * 将整篇文章的所有摘录直接沉淀为思源笔记文档（知识回流闭环）。
 * 文档标为 internal 避免被误入读库候选，严格遵守数据主权。
 */
export async function createArticleHighlightsDoc(
    plugin: Plugin,
    group: ArticleHighlightGroup,
    labels: HighlightExportLabels,
): Promise<{ ok: boolean; docId?: string; reason?: string }> {
    if (!group.items.length) return { ok: false, reason: "empty" };
    const firstItem = group.items[0];
    let box = firstItem.box;
    let hpath = firstItem.hpath;
    if (!box || !hpath) {
        try {
            const documents = await listHighlightDocuments([group.rootId]);
            const doc = documents[0];
            if (doc) {
                box = box || doc.box;
                hpath = hpath || doc.hpath;
            }
        } catch {
            // fallback if doc meta cannot be retrieved
        }
    }
    if (!box) return { ok: false, reason: "invalidBox" };
    const lastSlash = (hpath || "").lastIndexOf("/");
    const parent = lastSlash > 0 ? hpath.slice(0, lastSlash) : "";
    const safeTitle = (group.title || "未命名").replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 100);

    try {
        let docId = "";
        let targetHpath = "";
        const cached = articleHighlightDraftCache.get(group.rootId);
        if (cached && cached.box === box) {
            const docs = await listHighlightDocuments([cached.docId]).catch(() => []);
            if (docs[0]?.id === cached.docId) {
                docId = cached.docId;
                targetHpath = cached.hpath;
            }
        }
        if (!docId) {
            targetHpath = `${parent}/[${labels.title}] ${safeTitle} ${newNodeId()}`;
            const markdown = renderArticleHighlightsMarkdown(group, labels);
            docId = await createDocWithMd(box, targetHpath, markdown);
            if (!isHighlightId(docId)) return { ok: false, reason: "createFailed" };
            articleHighlightDraftCache.set(group.rootId, { docId, box, hpath: targetHpath });
        }
        await writeClip(plugin, docId, { internal: true });
        return { ok: true, docId };
    } catch (error) {
        console.warn("[glean] 创建读书笔记文档失败:", error);
        return { ok: false, reason: "error" };
    }
}
