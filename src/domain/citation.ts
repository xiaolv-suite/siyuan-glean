/**
 * 学术引用与文献著录条目格式化纯函数层
 * 支持格式：
 * 1. BibTeX (@article)
 * 2. GB/T 7714-2015 中文学术文献著录规范
 * 3. APA (American Psychological Association) 引用规范
 */

export interface CitationItem {
    id: string;
    title: string;
    author?: string;
    site?: string;
    url?: string;
    time?: string; // YYYYMMDDHHmmss 或 YYYY-MM-DD
}

function cleanCiteKey(author: string, year: string, title: string): string {
    const pinyinOrEng = (author || "Anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "anon";
    const shortTitle = (title || "article").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "doc";
    return `${pinyinOrEng.toLowerCase()}${year}${shortTitle.toLowerCase()}`;
}

function extractYear(timeStr?: string): string {
    if (!timeStr) return String(new Date().getFullYear());
    const m = /^(\d{4})/.exec(timeStr.trim());
    return m ? m[1] : String(new Date().getFullYear());
}

function extractFullDate(timeStr?: string, fallbackNow = new Date()): string {
    const validNow = fallbackNow instanceof Date && !Number.isNaN(fallbackNow.getTime()) ? fallbackNow : new Date();
    if (!timeStr) return validNow.toISOString().slice(0, 10);
    const cleaned = timeStr.trim().replace(/[-/.]/g, "");
    if (cleaned.length >= 8) {
        return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
    }
    return timeStr.slice(0, 10);
}

/**
 * 格式化为标准 BibTeX 文献条目
 */
export function formatBibTeX(item: CitationItem): string {
    const title = item.title?.trim() || "Untitled";
    const author = item.author?.trim() || "Anonymous";
    const site = item.site?.trim() || "Online";
    const year = extractYear(item.time);
    const url = item.url?.trim() || "";
    const citeKey = cleanCiteKey(author, year, title);

    const lines: string[] = [
        `@article{${citeKey},`,
        `  title = {${title}},`,
        `  author = {${author}},`,
        `  journal = {${site}},`,
        `  year = {${year}},`,
    ];
    if (url) {
        lines.push(`  url = {${url}},`);
    }
    lines.push(`}`);
    return lines.join("\n");
}

/**
 * 格式化为中国国家标准 GB/T 7714-2015 电子文献著录格式
 */
export function formatGBT7714(item: CitationItem, now = new Date()): string {
    const author = item.author?.trim() || "佚名";
    const title = item.title?.trim() || "无标题";
    const site = item.site?.trim() || "网络资源";
    const pubDate = extractFullDate(item.time, now);
    const validNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const accessDate = validNow.toISOString().slice(0, 10);
    const url = item.url?.trim() || "";

    return `${author}. ${title}[EB/OL]. ${site}, ${pubDate}[${accessDate}].${url ? ` ${url}` : ""}`;
}

/**
 * 格式化为 APA 规范引用
 */
export function formatAPA(item: CitationItem): string {
    const author = item.author?.trim() || "Anonymous";
    const title = item.title?.trim() || "Untitled";
    const site = item.site?.trim() || "Web";
    const year = extractYear(item.time);
    const url = item.url?.trim() || "";

    return `${author}. (${year}). ${title}. ${site}.${url ? ` ${url}` : ""}`;
}

/**
 * 格式化为 MLA 规范引用（Modern Language Association 9th Edition）
 */
export function formatMLA(item: CitationItem): string {
    const author = item.author?.trim() || "Anonymous";
    const title = item.title?.trim() || "Untitled";
    const site = item.site?.trim() || "Web";
    const fullDate = extractFullDate(item.time);
    const url = item.url?.trim() || "";

    return `${author}. "${title}." ${site}, ${fullDate}.${url ? ` ${url}` : ""}`;
}

export type CitationFormat = "gbt" | "bibtex" | "apa" | "mla";

/**
 * 根据著录格式解析成功提示的 i18n 键名
 */
export function citationSuccessKey(format: CitationFormat): string {
    switch (format) {
        case "bibtex":
            return "citation.bibtexCopied";
        case "apa":
            return "citation.apaCopied";
        case "mla":
            return "citation.mlaCopied";
        case "gbt":
        default:
            return "citation.gbtCopied";
    }
}

/**
 * 统一引用格式化门面纯函数
 */
export function formatCitation(item: CitationItem, format: CitationFormat = "gbt", now = new Date()): string {
    switch (format) {
        case "bibtex":
            return formatBibTeX(item);
        case "apa":
            return formatAPA(item);
        case "mla":
            return formatMLA(item);
        case "gbt":
        default:
            return formatGBT7714(item, now);
    }
}
