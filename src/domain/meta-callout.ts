import type { ReadingPosition } from "./reading-position.ts";
import type { ClipStatus } from "./schema.ts";

export const META_CALLOUT_SLOT_KEY = "custom-glean-slot" as const;
export const META_CALLOUT_SLOT_VALUE = "meta-callout" as const;

export interface MetaCalloutLabels {
    title: string;
    source: string;
    author: string;
    status: string;
    priority: string;
    rating: string;
    words: string;
    minutes: string;
    readMinutes: string;
    tags: string;
    summary: string;
    bookmark: string;
    unknown: string;
    untitled: string;
    clickToResume: string;
}

export const DEFAULT_META_CALLOUT_LABELS: MetaCalloutLabels = {
    title: "小驴拾遗 · 导读档案",
    source: "来源",
    author: "作者",
    status: "状态",
    priority: "优先级",
    rating: "评分",
    words: "字数体量",
    minutes: "预估用时",
    readMinutes: "实读用时",
    tags: "分类标签",
    summary: "AI 核心导读",
    bookmark: "续读断点",
    unknown: "未记录",
    untitled: "未命名文档",
    clickToResume: "点击直达正文续读位置",
};

export interface MetaCalloutArticle {
    id: string;
    title?: string;
    url?: string;
    site?: string;
    author?: string;
    status?: ClipStatus;
    priority?: number;
    rating?: number;
    words?: number;
    minutes?: number;
    readMinutes?: number;
    tags?: string[];
    aiTags?: string[];
    summary?: string;
    readingPosition?: ReadingPosition;
}

export function escapeMetaCalloutText(text: string): string {
    return String(text ?? "")
        .replace(/[\r\n\u0000-\u001f]/g, " ")
        .replace(/[\\`*_{}\[\]()#+.!<>|]/g, "\\$&")
        .trim();
}

export function formatMetaStars(rating?: number): string {
    const r = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
    if (r <= 0) return "未评分";
    return "⭐".repeat(r);
}

export function formatStatusLabel(status?: ClipStatus): string {
    switch (status) {
        case "inbox": return "收集箱 (inbox)";
        case "later": return "稍后读 (later)";
        case "reading": return "阅读中 (reading)";
        case "done": return "已读完 (done)";
        case "archived": return "已归档 (archived)";
        default: return "未设状态";
    }
}

/**
 * 构建思源原生 Blockquote 导读卡片 Markdown
 * 包含完整文章档案，末尾挂载 {: custom-glean-slot="meta-callout" } 保证幂等识别
 */
export function buildMetaCalloutMarkdown(
    article: MetaCalloutArticle,
    labels: MetaCalloutLabels = DEFAULT_META_CALLOUT_LABELS,
): string {
    const lines: string[] = [];

    // Line 1: 标题 + 来源 + 作者
    const siteRaw = article.site?.trim() || "";
    const urlRaw = article.url?.trim() || "";
    let sourceSegment = "";
    if (urlRaw && /^https?:\/\//i.test(urlRaw)) {
        const displayHost = siteRaw || (() => {
            try { return new URL(urlRaw).hostname; } catch { return urlRaw; }
        })();
        sourceSegment = `[${escapeMetaCalloutText(displayHost)}](<${urlRaw}>)`;
    } else if (siteRaw) {
        sourceSegment = escapeMetaCalloutText(siteRaw);
    } else {
        sourceSegment = escapeMetaCalloutText(labels.unknown);
    }

    const authorText = article.author?.trim() ? escapeMetaCalloutText(article.author.trim()) : "";
    const authorSegment = authorText ? ` · ✍️ **${escapeMetaCalloutText(labels.author)}**：${authorText}` : "";
    lines.push(`> 📌 **${escapeMetaCalloutText(labels.title)}** · 🌐 **${escapeMetaCalloutText(labels.source)}**：${sourceSegment}${authorSegment}`);

    // Line 2: 状态 + 优先级 + 评分
    const statusText = formatStatusLabel(article.status);
    const priorityLevel = Math.max(1, Math.min(5, Math.round(article.priority ?? 3)));
    const ratingStars = formatMetaStars(article.rating);
    const ratingSegment = article.rating && article.rating > 0 ? ` · ⭐ **${escapeMetaCalloutText(labels.rating)}**：${ratingStars}` : "";
    lines.push(`> 📊 **${escapeMetaCalloutText(labels.status)}**：${statusText} · 🎯 **${escapeMetaCalloutText(labels.priority)}**：P${priorityLevel}${ratingSegment}`);

    // Line 3: 字数体量与阅读时长（平衡排版，杜绝单行超长挤压断裂）
    const wordsCount = Number.isSafeInteger(article.words) && (article.words ?? 0) > 0 ? (article.words ?? 0) : 0;
    const minutesCount = Number.isSafeInteger(article.minutes) && (article.minutes ?? 0) > 0 ? (article.minutes ?? 0) : Math.max(1, Math.round(wordsCount / 400));
    const wordsSegment = wordsCount > 0 ? `约 ${wordsCount.toLocaleString()} 字` : escapeMetaCalloutText(labels.unknown);
    const readMinutesCount = Number.isSafeInteger(article.readMinutes) && (article.readMinutes ?? 0) > 0 ? (article.readMinutes ?? 0) : 0;
    const readMinutesSegment = readMinutesCount > 0 ? ` · ${escapeMetaCalloutText(labels.readMinutes)} ${readMinutesCount} 分钟` : "";
    lines.push(`> ⏱️ **${escapeMetaCalloutText(labels.words)}**：${wordsSegment} · ${escapeMetaCalloutText(labels.minutes)} 约 ${minutesCount} 分钟${readMinutesSegment}`);

    // Line 3: 标签聚合（仅当有标签时）
    const allTags = [
        ...(article.tags ?? []).map((t) => t.trim()),
        ...(article.aiTags ?? []).map((t) => t.trim()),
    ].filter(Boolean);
    const uniqueTags = [...new Set(allTags)];
    if (uniqueTags.length > 0) {
        const tagTokens = uniqueTags.map((tag) => `#${tag.replace(/[#\s]/g, "")}#`);
        lines.push(`> 🏷️ **${escapeMetaCalloutText(labels.tags)}**：${tagTokens.join(" ")}`);
    }

    // Line 4: AI 核心导读（紧凑单行，消除空行）
    if (article.summary?.trim()) {
        const cleanSummary = article.summary.trim().replace(/[\r\n]+/g, " ");
        lines.push(`> 💡 **${escapeMetaCalloutText(labels.summary)}**：${cleanSummary}`);
    }

    // Line 5: 续读断点（仅当存在时）
    if (article.readingPosition?.blockId && /^\d{14}-[0-9a-z]{7}$/.test(article.readingPosition.blockId)) {
        lines.push(`> 🔖 **${escapeMetaCalloutText(labels.bookmark)}**：(( ${article.readingPosition.blockId} '${escapeMetaCalloutText(labels.clickToResume)}' ))`);
    }

    // 挂载 IAL 自定义属性，实现幂等定位与原地刷新
    lines.push(`{: ${META_CALLOUT_SLOT_KEY}="${META_CALLOUT_SLOT_VALUE}" }`);

    return lines.join("\n");
}
