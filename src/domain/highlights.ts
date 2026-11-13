import { normalizeUrl } from "./url.ts";

export interface HighlightRoot {
    id: string;
    title: string;
    box: string;
    hpath: string;
    site: string;
    tags: string[];
    aiTags: string[];
    url: string;
}

export type AnnotationKind = "glean" | "siyuan-comment" | "native-memo";
export type AnnotationTag = "pinned" | "important" | "reading" | "todo" | "question";

export interface AnnotationReply {
    id: string;
    time?: string;
    author?: string;
    md: string;
}

export interface AnnotationTagDef {
    value: string;
    label: string;
    icon: string;
    color?: string;
    builtin?: boolean;
}

export const BUILTIN_ANNOTATION_TAGS: readonly AnnotationTagDef[] = [
    { value: "pinned", label: "置顶", icon: "📌", color: "#FF9500", builtin: true },
    { value: "important", label: "重要", icon: "⭐", color: "#FF3B30", builtin: true },
    { value: "reading", label: "阅读", icon: "📖", color: "#34C759", builtin: true },
    { value: "todo", label: "待办", icon: "✔️", color: "#007AFF", builtin: true },
    { value: "question", label: "存疑", icon: "❓", color: "#AF52DE", builtin: true },
];

export interface HighlightItem extends HighlightRoot {
    rootId: string;
    text: string;
    markdown: string;
    color?: string;
    memo?: string;
    sourceBlockId?: string;
    commentBlockId?: string;
    commentDocId?: string;
    underlineStyle?: string;
    customColor?: string;
    textBefore?: string;
    textAfter?: string;
    replies?: AnnotationReply[];
    groupId?: string;
    groupMasterId?: string;
    annotationKind?: AnnotationKind;
    annotationTag?: AnnotationTag | string;
    source: { content: string; markdown: string; type: string; highlight: string };
}

export interface HighlightFilter {
    search?: string;
    site?: string;
    tag?: string;
    aiTag?: string;
    color?: string;
    annotationTag?: string;
    annotationKind?: "" | AnnotationKind;
    sort?: "id" | "title" | "site";
    direction?: "asc" | "desc";
}

export interface HighlightExportLabels {
    title: string;
    original: string;
    source: string;
}

export function isHighlightId(value: string): boolean {
    return typeof value === "string" && /^\d{14}-[0-9a-z]{7}$/.test(value);
}

/** 解码 siyuan-comment / 思源 IAL 属性中的 HTML 实体与 _esc_newline_ 换行标记。 */
export function decodeSiyuanCommentIalValue(raw: string): string {
    if (!raw) return "";
    return raw
        .replace(/&#(\d+);/g, (full, num) => {
            const code = Number(num);
            if (!Number.isSafeInteger(code) || code <= 0 || code > 0x10ffff) return full;
            try { return String.fromCodePoint(code); } catch { return full; }
        })
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/_esc_newline_/g, "\n");
}

/** 精确提取 IAL 中的指定属性值并解码，避免部分前缀误匹配。 */
export function parseIalAttr(ial: string, attrName: string): string {
    if (!ial || !attrName) return "";
    const escaped = attrName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const match = new RegExp(`(?:^|[\\s{])${escaped}="([^"]*)"`).exec(ial);
    if (!match) return "";
    return decodeSiyuanCommentIalValue(match[1]).trim();
}

/** 安全解析 custom-comment-replies / custom-clip-hl-replies JSON 回复数组。 */
export function parseSiyuanCommentReplies(rawValue: string): AnnotationReply[] {
    if (!rawValue) return [];
    const decoded = decodeSiyuanCommentIalValue(rawValue).trim();
    if (!decoded) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(decoded);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: AnnotationReply[] = [];
    for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id.trim() : "";
        const md = typeof record.md === "string" ? record.md.trim() : "";
        if (!id || !md) continue;
        out.push({
            id,
            time: typeof record.time === "string" ? record.time.trim() : undefined,
            author: typeof record.author === "string" ? record.author.trim() : undefined,
            md,
        });
    }
    return out;
}

export function resolveAnnotationTagDisplay(
    tagValue: string | undefined,
    customTags?: readonly AnnotationTagDef[],
): AnnotationTagDef | null {
    const val = (tagValue ?? "").trim();
    if (!val) return null;
    const customHit = customTags?.find((item) => item.value === val);
    if (customHit) return customHit;
    const builtinHit = BUILTIN_ANNOTATION_TAGS.find((item) => item.value === val);
    if (builtinHit) return builtinHit;
    return { value: val, label: val, icon: "🏷️" };
}

export function highlightMarker(ial: string): string {
    return /(?:^|[\s{])custom-clip-highlight="([^"]*)"/.exec(ial)?.[1] ?? "";
}

export function highlightColor(ial: string): string {
    return /(?:^|[\s{])custom-clip-hl-color="([^"]*)"/.exec(ial)?.[1]
        ?? /(?:^|[\s{])custom-clip-highlight="([^"]*)"/.exec(ial)?.[1]
        ?? "";
}

export function cleanHighlightText(content: string): string {
    return content.replace(/&nbsp;|\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

export function filterHighlights(items: readonly HighlightItem[], filter: HighlightFilter = {}): HighlightItem[] {
    const terms = (filter.search ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    const result = items.filter((item) => {
        if (filter.site && item.site !== filter.site) return false;
        if (filter.tag && !(item.tags || []).includes(filter.tag)) return false;
        if (filter.aiTag && !(item.aiTags || []).includes(filter.aiTag)) return false;
        if (filter.color && (item.color || "yellow") !== filter.color) return false;
        if (filter.annotationTag && item.annotationTag !== filter.annotationTag) return false;
        if (filter.annotationKind && (item.annotationKind ?? "glean") !== filter.annotationKind) return false;
        const replyText = (item.replies || []).map((r) => r.md).join("\n");
        const searchable = [item.text, item.memo || "", replyText, item.title, item.site, item.url, ...(item.tags || []), ...(item.aiTags || [])].join("\n").toLowerCase();
        return terms.every((term) => searchable.includes(term));
    });
    const field = filter.sort ?? "id";
    const direction = filter.direction === "desc" ? -1 : 1;
    return result.sort((left, right) => direction * compareText(left[field], right[field]) || compareText(left.id, right.id));
}

export function highlightFacets(items: readonly HighlightItem[]): { sites: string[]; tags: string[]; aiTags: string[]; annotationTags: string[] } {
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort(compareText);
    return {
        sites: unique(items.map((item) => item.site)),
        tags: unique(items.flatMap((item) => item.tags || [])),
        aiTags: unique(items.flatMap((item) => item.aiTags || [])),
        annotationTags: unique(items.map((item) => item.annotationTag ?? "")),
    };
}

export function highlightAnnotationKinds(items: readonly HighlightItem[]): AnnotationKind[] {
    const set = new Set<AnnotationKind>();
    for (const item of items) {
        set.add(item.annotationKind ?? "glean");
    }
    return [...set];
}

export function pageHighlights(items: readonly HighlightItem[], page = 1, pageSize = 20): { items: HighlightItem[]; page: number; pages: number; total: number } {
    const size = Number.isSafeInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 500) : 20;
    const pages = Math.max(1, Math.ceil(items.length / size));
    const current = Math.min(pages, Number.isSafeInteger(page) && page > 0 ? page : 1);
    return { items: items.slice((current - 1) * size, current * size), page: current, pages, total: items.length };
}

export function selectHighlights(items: readonly HighlightItem[], selectedIds: readonly string[]): HighlightItem[] {
    const selected = new Set(selectedIds);
    const result = items.filter((item) => selected.has(item.id));
    if (result.length !== selected.size || new Set(result.map((item) => item.id)).size !== result.length) throw new Error("Invalid highlight selection");
    return result;
}

export function retainHighlightSelection(items: readonly HighlightItem[], selectedIds: readonly string[]): string[] {
    const available = new Set(items.map((item) => item.id));
    return [...new Set(selectedIds)].filter((id) => available.has(id));
}

export function escapeHighlightText(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/([`*_{}\[\]()#!+\-.|~$])/g, "\\$1");
}

function inlineHighlightText(value: string): string {
    return escapeHighlightText(value.replace(/[\r\n\u0000-\u001f]+/g, " "));
}

export function highlightBlockLink(id: string): string {
    if (!isHighlightId(id)) throw new Error("Invalid highlight ID");
    return `siyuan://blocks/${id}`;
}

function safeSourceUrl(value: string): string {
    return normalizeUrl(value) && !/[\s<>"'\\\u0000-\u001f]/.test(value) ? value : "";
}

function formatAnnotationExtrasMarkdown(item: HighlightItem): string[] {
    const extras: string[] = [];
    const tagDef = resolveAnnotationTagDisplay(item.annotationTag);
    if (tagDef) {
        extras.push(`- ${tagDef.icon} ${inlineHighlightText(tagDef.label)}`);
    }
    if (item.memo?.trim()) {
        const memoLines = item.memo.trim().split(/\r?\n/).map((line, i) =>
            i === 0 ? `> 💡 ${escapeHighlightText(line)}` : `> ${escapeHighlightText(line)}`
        );
        extras.push(memoLines.join("\n"));
    }
    if (item.replies?.length) {
        const replyLines = item.replies.map((r) => {
            const stamp = [r.author, r.time].filter(Boolean).join(" · ");
            return `  - 💬 ${stamp ? `(${inlineHighlightText(stamp)}) ` : ""}${inlineHighlightText(r.md)}`;
        });
        extras.push(replyLines.join("\n"));
    }
    return extras;
}

export function renderHighlightsMarkdown(items: readonly HighlightItem[], labels: HighlightExportLabels): string {
    const sections = items.map((item) => {
        const quote = item.text.split(/\r?\n/).map((line) => `> ${escapeHighlightText(line)}`).join("\n");
        const sourceUrl = safeSourceUrl(item.url);
        const rootTitle = inlineHighlightText(item.title || item.rootId);
        const origLabel = inlineHighlightText(labels.original);
        const targetBlockId = item.sourceBlockId && isHighlightId(item.sourceBlockId) ? item.sourceBlockId : item.id;
        return [
            quote,
            ...formatAnnotationExtrasMarkdown(item),
            `(( ${item.rootId} '${rootTitle}' )) [${rootTitle}](${highlightBlockLink(item.rootId)}) · (( ${targetBlockId} '📍 ${origLabel}' )) [${origLabel}](${highlightBlockLink(targetBlockId)})`,
            ...(sourceUrl ? [`${inlineHighlightText(labels.source)}: [${inlineHighlightText(new URL(sourceUrl).host)}](<${sourceUrl}>)`] : []),
        ].join("\n\n");
    });
    return [`# ${inlineHighlightText(labels.title)}`, ...sections].join("\n\n");
}

export function safeHighlightCsvCell(value: string): string {
    const safe = /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
}

export function renderHighlightsCsv(items: readonly HighlightItem[]): string {
    const headers = ["blockId", "rootId", "title", "text", "site", "userTags", "aiTags", "sourceUrl", "blockLink"];
    const rows = items.map((item) => [item.id, item.rootId, item.title, item.text, item.site, (item.tags || []).join(", "), (item.aiTags || []).join(", "), item.url, highlightBlockLink(item.id)]);
    return [headers, ...rows].map((row) => row.map(safeHighlightCsvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * 格式化单条摘录分享卡（T-1803）：
 * - 引述纯文本前缀 `> `；
 * - 如有批注思考/追记，附带 `> 💡 ` 行；
 * - 来源行前缀 `> —— `，注明标题与站点；
 * - 思源确切引述块链接 `> siyuan://blocks/${item.id}`。
 */
export function formatHighlightShare(item: HighlightItem): string {
    const title = item.title || "未命名文档";
    const source = item.site ? (title + "（" + item.site + "）") : title;
    const quoteLines = item.text.split(String.fromCharCode(10))
        .map((line) => line.replaceAll(String.fromCharCode(13), "").trim())
        .filter(Boolean)
        .map((line) => "> " + line);
    const memoLines = item.memo?.trim()
        ? item.memo.trim().split(/\r?\n/).map((line, idx) => idx === 0 ? `> 💡 ${line.trim()}` : `> ${line.trim()}`)
        : [];
    const targetId = item.sourceBlockId && isHighlightId(item.sourceBlockId) ? item.sourceBlockId : item.id;
    return [
        ...(quoteLines.length ? quoteLines : ["> " + item.text.trim()]),
        ...memoLines,
        "> —— " + source,
        "> " + highlightBlockLink(targetId),
    ].join(String.fromCharCode(10));
}

/**
 * 从思源块 ID（YYYYMMDDHHmmss-xxxxxxx）解析时间线索（T-1753）。
 * 非法 ID 返回空串。
 */
export function formatHighlightTime(blockId: string): string {
    if (!isHighlightId(blockId)) return "";
    const y = blockId.slice(0, 4);
    const m = blockId.slice(4, 6);
    const d = blockId.slice(6, 8);
    const hh = blockId.slice(8, 10);
    const mm = blockId.slice(10, 12);
    return y + "-" + m + "-" + d + " " + hh + ":" + mm;
}

export interface ArticleHighlightGroup {
    rootId: string;
    title: string;
    site: string;
    url: string;
    tags: string[];
    aiTags: string[];
    items: HighlightItem[];
}

/**
 * 将已筛选的摘录按来源文章（rootId）聚合为分组（T-3415）。
 * 保持首次出现的文章顺序及组内条目顺序。
 */
export function groupHighlightsByArticle(items: readonly HighlightItem[]): ArticleHighlightGroup[] {
    const map = new Map<string, ArticleHighlightGroup>();
    for (const item of items) {
        const existing = map.get(item.rootId);
        if (existing) {
            existing.items.push(item);
        } else {
            map.set(item.rootId, {
                rootId: item.rootId,
                title: item.title,
                site: item.site,
                url: item.url,
                tags: item.tags ? [...item.tags] : [],
                aiTags: item.aiTags ? [...item.aiTags] : [],
                items: [item],
            });
        }
    }
    return Array.from(map.values());
}

/**
 * 将单篇文章的所有摘录渲染为合集 Markdown（T-3415）。
 */
export function renderArticleHighlightsMarkdown(
    group: ArticleHighlightGroup,
    labels: HighlightExportLabels,
): string {
    const title = group.title || group.rootId;
    const headerLines = [
        `# ${inlineHighlightText(title)}`,
        "",
        ...(group.site ? [`*${inlineHighlightText(labels.source)}: ${inlineHighlightText(group.site)}*`, ""] : []),
        ...(isHighlightId(group.rootId)
            ? [`(( ${group.rootId} '《${inlineHighlightText(title)}》' )) [${inlineHighlightText(labels.title)}](${highlightBlockLink(group.rootId)})`]
            : [inlineHighlightText(labels.title)]),
        "",
        "---",
        "",
    ];

    const quotes = group.items.map((item, index) => {
        const quote = item.text.split(/\r?\n/).map((line) => `> ${escapeHighlightText(line)}`).join("\n");
        const origText = `${inlineHighlightText(labels.original)} #${index + 1}`;
        const targetBlockId = item.sourceBlockId && isHighlightId(item.sourceBlockId) ? item.sourceBlockId : item.id;
        return [
            quote,
            ...formatAnnotationExtrasMarkdown(item),
            `(( ${targetBlockId} '📍 ${origText}' )) [${origText}](${highlightBlockLink(targetBlockId)})`,
        ].join("\n\n");
    });

    return headerLines.join("\n") + quotes.join("\n\n---\n\n");
}
