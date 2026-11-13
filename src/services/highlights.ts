import type { App, Plugin } from "siyuan";
import {
    createDocWithMd, deleteBlock, findBlockIdByTextInDoc, getBlockAttrs, getHighlightBlocks, listCrossDocSiyuanComments,
    listHighlightBlocks, listHighlightDocuments, newNodeId, querySql, updateBlock, type BlockRow,
} from "../api/client";
import {
    cleanHighlightText, highlightColor, highlightMarker, isHighlightId, parseIalAttr, parseSiyuanCommentReplies,
    renderHighlightsCsv, renderHighlightsMarkdown, selectHighlights,
    renderArticleHighlightsMarkdown, type AnnotationReply, type ArticleHighlightGroup,
    type HighlightExportLabels, type HighlightItem, type HighlightRoot,
} from "../domain/highlights";
import { CLIP_STATUSES, parseClipAttrs, parseUserTags } from "../domain/schema";
import { withDocLock } from "../libs/notice";
import {
    batchReadClipAttrs, readClip, readHighlightColor, reconcileIndex,
    writeAnnotationAttrs, writeClip, writeHighlightColor,
} from "./clip-store";
import { getSiyuanCommentPlugin, notifyWhaleCommentUpdated } from "./siyuan-comment-bridge";
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

interface ToHighlightOptions {
    allowCrossDoc?: boolean;
}

function mapWhaleColorToChipColor(styleColor: string, customColor: string): string {
    if (styleColor === "red" || styleColor === "blue" || styleColor === "green" || styleColor === "yellow") {
        return styleColor;
    }
    if (styleColor === "orange") return "yellow";
    if (styleColor === "pink") return "red";
    if (styleColor === "purple" || styleColor === "gray") return "blue";
    if (styleColor === "custom" && customColor) return "blue";
    return styleColor || "";
}

function toHighlight(row: BlockRow, root: HighlightRoot, options: ToHighlightOptions = {}): HighlightItem | null {
    const ial = row.ial ?? "";
    const highlight = highlightMarker(ial);
    const isSiyuanComment = ial.includes('custom-siyuan-comment="true"') || ial.includes("custom-siyuan-comment=true");
    const ialMemo = parseIalAttr(ial, "memo");
    const isMemoBlock = Boolean(ialMemo) && !ial.includes("custom-glean-slot=");

    if (row.type === "d" || (row.type !== "b" && !highlight.trim() && !isSiyuanComment && !isMemoBlock)) return null;
    if (!isHighlightId(row.id) || typeof row.content !== "string" || typeof row.markdown !== "string") {
        throw new HighlightExportError("readFailed");
    }
    if (!options.allowCrossDoc && (row.root_id !== root.id || row.box !== root.box)) {
        throw new HighlightExportError("readFailed");
    }

    // 排除鲸鱼批注区容器、隐藏附属块及多块组非主条目
    if (isSiyuanComment) {
        if (ial.includes("custom-siyuan-comment-zone")) return null;
        if (parseIalAttr(ial, "custom-comment-block-hidden") === "true") return null;
        const groupMasterId = parseIalAttr(ial, "custom-comment-group-master");
        if (groupMasterId && groupMasterId !== row.id) return null;
    }

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
    let commentBlockId: string | undefined = undefined;
    let commentDocId: string | undefined = undefined;
    let annotationKind: "glean" | "siyuan-comment" | "native-memo" = "glean";
    let annotationTag: string | undefined = undefined;
    let color = highlightColor(ial);
    let underlineStyle: string | undefined = undefined;
    let customColor: string | undefined = undefined;
    let textBefore: string | undefined = undefined;
    let textAfter: string | undefined = undefined;
    let replies: AnnotationReply[] | undefined = undefined;
    let groupId: string | undefined = undefined;
    let groupMasterId: string | undefined = undefined;

    if (isSiyuanComment) {
        annotationKind = "siyuan-comment";
        commentBlockId = row.id;
        if (row.root_id !== root.id) {
            commentDocId = row.root_id;
        }
        const commentTextAttr = parseIalAttr(ial, "custom-comment-text");
        const sourceAttr = parseIalAttr(ial, "custom-comment-source");
        const tagAttr = parseIalAttr(ial, "custom-comment-tag");
        const styleColor = parseIalAttr(ial, "custom-comment-highlight-style");
        const deco = parseIalAttr(ial, "custom-comment-highlight-decoration");
        const customCol = parseIalAttr(ial, "custom-comment-highlight-custom-color");
        const beforeAttr = parseIalAttr(ial, "custom-comment-before");
        const afterAttr = parseIalAttr(ial, "custom-comment-after");
        const repliesRaw = parseIalAttr(ial, "custom-comment-replies");
        const grp = parseIalAttr(ial, "custom-comment-group");
        const grpMaster = parseIalAttr(ial, "custom-comment-group-master");

        if (commentTextAttr) quoteText = commentTextAttr;
        const bodyNote = cleanHighlightText(row.content);
        if (commentTextAttr && bodyNote && bodyNote !== commentTextAttr) {
            memoText = bodyNote;
        } else if (!commentTextAttr && bodyNote) {
            memoText = "";
        }
        if (sourceAttr && isHighlightId(sourceAttr)) sourceBlockId = sourceAttr;
        if (tagAttr) annotationTag = tagAttr;
        if (deco) underlineStyle = deco;
        if (customCol) customColor = customCol;
        const mappedColor = mapWhaleColorToChipColor(styleColor, customCol);
        if (mappedColor) color = mappedColor;
        if (beforeAttr) textBefore = beforeAttr;
        if (afterAttr) textAfter = afterAttr;
        const parsedReplies = parseSiyuanCommentReplies(repliesRaw);
        if (parsedReplies.length > 0) replies = parsedReplies;
        if (grp) groupId = grp;
        if (grpMaster) groupMasterId = grpMaster;
    } else if (isMemoBlock) {
        annotationKind = "native-memo";
        memoText = ialMemo;
        const gleanTag = parseIalAttr(ial, "custom-clip-hl-tag");
        if (gleanTag) annotationTag = gleanTag;
        const gleanReplies = parseSiyuanCommentReplies(parseIalAttr(ial, "custom-clip-hl-replies"));
        if (gleanReplies.length > 0) replies = gleanReplies;
    } else {
        const memoSplit = quoteText.split(/(?:\r?\n)+\s*💡\s*/);
        if (memoSplit.length > 1) {
            quoteText = memoSplit[0].trim();
            memoText = memoSplit.slice(1).join("\n").trim();
        } else if (ialMemo) {
            memoText = ialMemo;
        }
        const gleanTag = parseIalAttr(ial, "custom-clip-hl-tag");
        if (gleanTag) annotationTag = gleanTag;
        const gleanReplies = parseSiyuanCommentReplies(parseIalAttr(ial, "custom-clip-hl-replies"));
        if (gleanReplies.length > 0) replies = gleanReplies;
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
        commentBlockId,
        commentDocId,
        underlineStyle,
        customColor,
        textBefore,
        textAfter,
        replies,
        groupId,
        groupMasterId,
        annotationKind,
        annotationTag,
        markdown: row.markdown,
        source: { content: row.content, markdown: row.markdown, type: row.type, highlight },
    };
}

async function collectHighlights(roots: Map<string, QualifiedRoot>): Promise<HighlightItem[]> {
    const ids = [...roots.keys()].sort();
    const items: HighlightItem[] = [];
    const seenIds = new Set<string>();
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
                if (item && !seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    items.push(item);
                }
            }
            if (page.length < 500) break;
        }
    }

    // 合并跨文档放置的鲸鱼快速批注（今日日记、指定目标文档、子文档）
    try {
        const crossDocHits = await listCrossDocSiyuanComments(ids);
        for (const hit of crossDocHits) {
            const rootEntry = roots.get(hit.sourceRootId);
            if (!rootEntry || seenIds.has(hit.row.id)) continue;
            const item = toHighlight(hit.row, rootEntry.root, { allowCrossDoc: true });
            if (item) {
                seenIds.add(item.id);
                items.push(item);
            }
        }
    } catch {
        /* 跨文档补查降级 */
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
                const expectedRoot = item.commentDocId || item.rootId;
                if (!row || row.root_id !== expectedRoot || (!item.commentDocId && row.box !== item.box)) throw new HighlightExportError("changed");
                const fresh = toHighlight(row, roots.get(item.rootId)!.root, { allowCrossDoc: Boolean(item.commentDocId) });
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

/** 预览态等无法直接拿到 data-node-id 时，按正文片段反查所在块 ID。 */
export async function resolveExcerptBlockId(docId: string, text: string): Promise<string> {
    return findBlockIdByTextInDoc(docId, text);
}

/** 更新批注想法（支持拾遗引述块 💡 批注、原生 memo 属性块与鲸鱼批注正文）。 */
export async function updateHighlightMemo(item: HighlightItem, nextMemoRaw: string, app?: App | null): Promise<string> {
    const nextMemo = nextMemoRaw.trim();
    const targetId = item.commentBlockId || item.id;
    if (!isHighlightId(targetId)) throw new Error("无效批注块 ID");

    return withDocLock(item.commentDocId || item.rootId || targetId, async () => {
        if (item.annotationKind === "siyuan-comment") {
            const md = nextMemo || item.text;
            await updateBlock(targetId, md, "markdown");
            notifyWhaleCommentUpdated();
            return nextMemo;
        }
        if (item.annotationKind === "native-memo") {
            await writeAnnotationAttrs(targetId, { memo: nextMemo });
            return nextMemo;
        }
        // 拾遗引述块：优先保持引述原文 + 更新或移除 💡 批注行，同时同步 memo 属性方便原生预览
        if (item.source?.type === "b") {
            const quoteLines = item.text.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
            const nextMd = nextMemo ? `${quoteLines}\n>\n> 💡 ${nextMemo}` : quoteLines;
            await updateBlock(targetId, nextMd, "markdown");
        } else {
            await writeAnnotationAttrs(targetId, { memo: nextMemo });
        }
        void app;
        return nextMemo;
    });
}

/** 为批注设置或清除分类标签（📌置顶 / ⭐重要 / 📖阅读 / ✔️待办 / ❓存疑 或鲸鱼自定义标签）。 */
export async function setAnnotationTag(item: HighlightItem, nextTag: string, app?: App | null): Promise<string> {
    const targetId = item.commentBlockId || item.id;
    if (!isHighlightId(targetId)) throw new Error("无效批注块 ID");
    const cleanTag = nextTag.trim();

    if (item.annotationKind === "siyuan-comment") {
        const whale = getSiyuanCommentPlugin(app);
        if (whale && typeof whale.setCommentTag === "function") {
            await whale.setCommentTag(targetId, cleanTag, item.annotationTag ?? "");
            return cleanTag;
        }
        await writeAnnotationAttrs(targetId, { "custom-comment-tag": cleanTag });
        notifyWhaleCommentUpdated();
        return cleanTag;
    }

    await writeAnnotationAttrs(targetId, { "custom-clip-hl-tag": cleanTag });
    return cleanTag;
}

/** 为批注追加一条追记回复（鲸鱼批注直接写入 custom-comment-replies，拾遗批注写入 custom-clip-hl-replies）。 */
export async function addAnnotationReply(item: HighlightItem, replyMdRaw: string, app?: App | null): Promise<AnnotationReply[]> {
    const md = replyMdRaw.trim();
    if (!md) return item.replies ?? [];
    const targetId = item.commentBlockId || item.id;
    if (!isHighlightId(targetId)) throw new Error("无效批注块 ID");

    if (item.annotationKind === "siyuan-comment") {
        const whale = getSiyuanCommentPlugin(app);
        if (whale && typeof whale.addReply === "function") {
            await whale.addReply(targetId, md);
            const attrs = await getBlockAttrs(targetId).catch(() => ({}));
            const fresh = parseSiyuanCommentReplies(String((attrs as Record<string, unknown>)["custom-comment-replies"] ?? ""));
            if (fresh.length > 0) return fresh;
        }
    }

    const attrKey = item.annotationKind === "siyuan-comment" ? "custom-comment-replies" : "custom-clip-hl-replies";
    const attrs = await getBlockAttrs(targetId).catch(() => ({} as Record<string, string>));
    const fromAttrs = parseSiyuanCommentReplies(String((attrs as Record<string, unknown>)[attrKey] ?? ""));
    const existing = fromAttrs.length > 0 ? fromAttrs : (item.replies ?? []);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const user = typeof window !== "undefined"
        ? ((window as unknown as { siyuan?: { user?: { userName?: string } } }).siyuan?.user?.userName ?? "")
        : "";
    const nextEntry: AnnotationReply = {
        id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        time,
        author: user || undefined,
        md,
    };
    const nextList = [...existing, nextEntry];
    await writeAnnotationAttrs(targetId, { [attrKey]: JSON.stringify(nextList) });
    if (item.annotationKind === "siyuan-comment") {
        notifyWhaleCommentUpdated();
    }
    return nextList;
}

/** 切换批注颜色（拾遗写 custom-clip-hl-color，鲸鱼写 custom-comment-highlight-style + 颜色）。 */
export async function setAnnotationColor(
    item: HighlightItem,
    nextColor: "yellow" | "red" | "blue" | "green",
): Promise<"yellow" | "red" | "blue" | "green"> {
    const targetId = item.commentBlockId || item.id;
    if (!isHighlightId(targetId)) throw new Error("无效批注块 ID");
    if (item.annotationKind === "siyuan-comment") {
        await writeAnnotationAttrs(targetId, {
            "custom-comment-highlight-style": nextColor,
            "custom-comment-highlight-custom-color": "",
        });
        notifyWhaleCommentUpdated();
        return nextColor;
    }
    await writeHighlightColor(targetId, nextColor);
    return nextColor;
}

/** 删除批注中的指定一条追记回复。 */
export async function removeAnnotationReply(
    item: HighlightItem,
    replyId: string,
): Promise<AnnotationReply[]> {
    const targetId = item.commentBlockId || item.id;
    if (!isHighlightId(targetId)) throw new Error("无效批注块 ID");
    const attrKey = item.annotationKind === "siyuan-comment" ? "custom-comment-replies" : "custom-clip-hl-replies";
    const attrs = await getBlockAttrs(targetId).catch(() => ({} as Record<string, string>));
    const fromAttrs = parseSiyuanCommentReplies(String((attrs as Record<string, unknown>)[attrKey] ?? ""));
    const existing = fromAttrs.length > 0 ? fromAttrs : (item.replies ?? []);
    const nextList = existing.filter((entry) => entry.id !== replyId);
    await writeAnnotationAttrs(targetId, { [attrKey]: nextList.length ? JSON.stringify(nextList) : "" });
    if (item.annotationKind === "siyuan-comment") {
        notifyWhaleCommentUpdated();
    }
    return nextList;
}

/** 删除或取消高亮批注。 */
export async function deleteAnnotation(
    item: HighlightItem,
    mode: "delete-block" | "unmark" = "delete-block",
): Promise<void> {
    const targetId = item.commentBlockId || item.id;
    if (!isHighlightId(targetId)) throw new Error("无效批注块 ID");

    if (item.annotationKind === "siyuan-comment") {
        // 清理源块上的 custom-comment-refs 与批注块本身
        if (item.sourceBlockId && isHighlightId(item.sourceBlockId) && item.sourceBlockId !== targetId) {
            try {
                const srcAttrs = await getBlockAttrs(item.sourceBlockId);
                const rawRefs = String((srcAttrs as Record<string, unknown>)["custom-comment-refs"] ?? "");
                if (rawRefs) {
                    const nextRefs = rawRefs.split(",").map((s) => s.trim()).filter((id) => id && id !== targetId);
                    await writeAnnotationAttrs(item.sourceBlockId, { "custom-comment-refs": nextRefs.join(",") });
                }
            } catch {
                /* 源块可能已被删除 */
            }
        }
        await deleteBlock(targetId);
        notifyWhaleCommentUpdated();
        return;
    }

    if (mode === "unmark" || item.source?.type !== "b") {
        await writeAnnotationAttrs(targetId, {
            "custom-clip-highlight": "",
            "custom-clip-hl-color": "",
            "custom-clip-hl-tag": "",
            "custom-clip-hl-replies": "",
            ...(item.annotationKind === "native-memo" ? { memo: "" } : {}),
        });
        return;
    }
    await deleteBlock(targetId);
}

