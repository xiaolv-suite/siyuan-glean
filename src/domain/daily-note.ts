import type { ClipStatus } from "./schema.ts";

export const DAILY_NOTE_SLOT_KEY = "custom-glean-reading-doc" as const;

export interface DailyNoteReadingEntry {
    docId: string;
    title: string;
    author?: string;
    site?: string;
    url?: string;
    status?: ClipStatus;
    rating?: number;
    readMinutes?: number;
    words?: number;
    summary?: string;
    time?: string;
}

export interface DailyNoteLabels {
    sectionHeader: string;
    done: string;
    reading: string;
    rating: string;
    author: string;
    timeSpent: string;
    minutes: string;
    untitled: string;
}

export const DEFAULT_DAILY_NOTE_LABELS: DailyNoteLabels = {
    sectionHeader: "## 📖 今日阅读",
    done: "已读完",
    reading: "正在读",
    rating: "评分",
    author: "作者",
    timeSpent: "耗时",
    minutes: "分钟",
    untitled: "未命名文档",
};

export function escapeDailyNoteText(text: string): string {
    return String(text ?? "")
        .replace(/[\r\n\u0000-\u001f]/g, " ")
        .replace(/[\\`*_{}\[\]()#+.!<>|]/g, "\\$&")
        .trim();
}

/**
 * 格式化每日笔记（Daily Note）中的阅读轨迹 Markdown 条目
 * 带有标准原生块引用反链 (( docId '《标题》' )) 与受控 IAL 锚点
 */
export function formatDailyNoteReadingMarkdown(
    entry: DailyNoteReadingEntry,
    labels: Partial<DailyNoteLabels> = DEFAULT_DAILY_NOTE_LABELS,
): string {
    const effectiveLabels: DailyNoteLabels = { ...DEFAULT_DAILY_NOTE_LABELS, ...labels };
    const titleText = escapeDailyNoteText(entry.title || effectiveLabels.untitled);
    const ref = `(( ${entry.docId} '《${titleText}》' ))`;
    const statusIcon = entry.status === "done" ? `✅ ${effectiveLabels.done}` : `📖 ${effectiveLabels.reading}`;
    const authorText = entry.author?.trim() ? ` · ✍️ ${escapeDailyNoteText(entry.author.trim())}` : "";
    const ratingNum = Math.max(0, Math.min(5, Math.round(entry.rating ?? 0)));
    const ratingStars = ratingNum > 0 ? ` · ⭐ ${"⭐".repeat(ratingNum)}` : "";
    const readMinutesCount = Number.isSafeInteger(entry.readMinutes) && (entry.readMinutes ?? 0) > 0 ? (entry.readMinutes ?? 0) : 0;
    const minutesText = readMinutesCount > 0 ? ` · ⏱️ ${effectiveLabels.timeSpent} ${readMinutesCount} ${effectiveLabels.minutes}` : "";

    let content = `- ${statusIcon} ${ref}${authorText}${ratingStars}${minutesText}`;
    if (entry.summary?.trim()) {
        const cleanSummary = entry.summary.trim().replace(/[\r\n]+/g, " ");
        content += `\n  > 💡 ${escapeDailyNoteText(cleanSummary)}`;
    }
    content += `\n{: ${DAILY_NOTE_SLOT_KEY}="${entry.docId}" }`;
    return content;
}
