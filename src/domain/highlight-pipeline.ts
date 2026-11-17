/**
 * 高亮转闪卡流水线（Highlight-to-Flashcard Pipeline）领域模型与纯函数。
 * 纯函数层：严禁 import svelte/siyuan/api/services。
 */

export interface HighlightFlashcardPayload {
    front: string;
    back: string;
    tags: string[];
    sourceBlockId: string;
    sourceTitle: string;
}

export interface BuildFlashcardInput {
    highlightText: string;
    contextText?: string;
    sourceBlockId: string;
    sourceTitle?: string;
    docTags?: readonly string[];
}

/** 剥离 HTML 标签并净化空白与实体字符 */
export function stripHtmlTags(input: string): string {
    if (!input) return "";
    return input
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** 净化标签并确保 #来自拾遗 */
export function normalizeFlashcardTags(docTags: readonly string[] = []): string[] {
    const set = new Set<string>();
    for (const tag of docTags) {
        const clean = tag.replace(/^[#＃\s]+/, "").trim();
        if (clean) set.add(clean);
    }
    set.add("来自拾遗");
    return Array.from(set);
}

/**
 * 组装符合闪卡仓消费先例的标准载荷（create-card-request）
 * - 正面 (front)：高亮核心语句（去除 HTML 标签后纯文本）
 * - 背面 (back)：高亮所在自然段上下文 + 文章标题 + 思源深链 ((block-id "查看文章原块"))
 * - 标签 (tags)：继承文章分类标签 + 来自拾遗
 */
export function buildHighlightFlashcardPayload(input: BuildFlashcardInput): HighlightFlashcardPayload {
    const front = stripHtmlTags(input.highlightText);
    const cleanTitle = (input.sourceTitle || "未命名文章").trim() || "未命名文章";
    const cleanBlockId = input.sourceBlockId.trim();

    // 背面上部：所在自然段上下文（若无额外上下文则使用高亮本身）
    const rawContext = input.contextText ? stripHtmlTags(input.contextText) : front;
    const contextBody = rawContext || front;

    // 背面下部：来源文章与思源深链
    const sourceDeepLink = cleanBlockId
        ? `(( ${cleanBlockId} '查看文章原块' ))`
        : "";
    const metaFooter = `> 来源：《${cleanTitle}》 ${sourceDeepLink}`.trim();

    const back = contextBody ? `${contextBody}\n\n${metaFooter}` : metaFooter;
    const tags = normalizeFlashcardTags(input.docTags);

    return {
        front,
        back,
        tags,
        sourceBlockId: cleanBlockId,
        sourceTitle: cleanTitle,
    };
}

/**
 * 格式化为闪卡 Markdown（供未安装闪卡或无规则消费时复制至剪贴板降级）
 */
export function formatFlashcardMarkdown(payload: HighlightFlashcardPayload): string {
    const tagsLine = payload.tags.length > 0
        ? payload.tags.map((t) => `#${t.replace(/^[#＃]/, "")}`).join(" ")
        : "#来自拾遗";

    return [
        "# 拾遗闪卡",
        "",
        "## 正面 (Front)",
        payload.front,
        "",
        "## 背面 (Back)",
        payload.back,
        "",
        `标签: ${tagsLine}`,
    ].join("\n");
}
