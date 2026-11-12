export interface ReadingPosition {
    version: 1;
    blockId: string;
    offset: number;
    at: string;
}

export function parseReadingPosition(raw: unknown): ReadingPosition | null {
    let value: unknown = raw;
    if (typeof raw === "string") {
        if (raw.length > 1024) return null;
        try { value = JSON.parse(raw); } catch { return null; }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const entry = value as Partial<ReadingPosition>;
    const keys = Object.keys(entry);
    if (keys.length !== 4 || keys.some((key) => !["version", "blockId", "offset", "at"].includes(key))) return null;
    if (entry.version !== 1 || typeof entry.blockId !== "string" || !/^\d{14}-[a-z0-9]{7}$/.test(entry.blockId)
        || typeof entry.offset !== "number" || !Number.isSafeInteger(entry.offset) || entry.offset < 0 || entry.offset > 10000
        || typeof entry.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.at)
        || !Number.isFinite(Date.parse(entry.at)) || new Date(entry.at).toISOString() !== entry.at) return null;
    return { version: 1, blockId: entry.blockId, offset: entry.offset, at: entry.at };
}

export function serializeReadingPosition(value: unknown): string {
    const parsed = parseReadingPosition(value);
    if (!parsed) throw new RangeError("Invalid reading position");
    return JSON.stringify(parsed);
}

/**
 * 根据正文滚动视口高度轻量估算阅读进度百分比（T-3336 / T-3380）：
 * 1. 只有当正文内容高度大于视口高度（scrollHeight > clientHeight）且 clientHeight > 0 时才计算；
 * 2. 以已读可视底部 (scrollTop + clientHeight) / scrollHeight 派生 0–100 的整数百分比；
 * 3. 无滚动短文、未渲染或参数非法时返回 null，避免伪造虚假进度。
 */
export function estimateReadingRatio(scrollTop: number, scrollHeight: number, clientHeight: number): number | null {
    if (!Number.isFinite(scrollTop) || !Number.isFinite(scrollHeight) || !Number.isFinite(clientHeight)) return null;
    if (clientHeight <= 0 || scrollHeight <= clientHeight) return null;
    const offset = Math.max(0, scrollTop);
    const visibleBottom = Math.min(scrollHeight, offset + clientHeight);
    const ratio = visibleBottom / scrollHeight;
    return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}

export function estimateReadingPercentage(scrollTop: number, scrollHeight: number, clientHeight: number): number | null {
    if (!Number.isFinite(scrollTop) || !Number.isFinite(scrollHeight) || !Number.isFinite(clientHeight)) return null;
    if (clientHeight <= 0 || scrollHeight <= clientHeight) return null;
    const offset = Math.max(0, scrollTop);
    const visibleBottom = Math.min(scrollHeight, offset + clientHeight);
    const ratio = visibleBottom / scrollHeight;
    return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}

/**
 * 双向跨端阅读进度对齐（Mobile Spec v1 深化）：
 * 对比移动端与桌面端或多端同步回来的阅读断点，以较晚时间戳（最新产生）的断点为准。
 */
export function resolveLatestReadingPosition(
    posA: ReadingPosition | null | undefined,
    posB: ReadingPosition | null | undefined
): ReadingPosition | null {
    const validA = parseReadingPosition(posA);
    const validB = parseReadingPosition(posB);
    if (!validA) return validB;
    if (!validB) return validA;
    const timeA = Date.parse(validA.at);
    const timeB = Date.parse(validB.at);
    if (!Number.isFinite(timeA)) return validB;
    if (!Number.isFinite(timeB)) return validA;
    return timeB > timeA ? validB : validA;
}

export type ReadingMilestonePhase = "unread" | "browsing" | "indepth" | "concluding" | "completed";

export interface ReadingMilestoneInfo {
    phase: ReadingMilestonePhase;
    label: string;
    badge: string;
    isCompleted: boolean;
    progressPercentage: number;
}

/**
 * 依据阅读进度百分比派生阅读里程碑阶段（对标微信读书 / Readwise 阅读内化阶梯）
 */
export function deriveReadingMilestone(progress: number | null | undefined): ReadingMilestoneInfo {
    const p = typeof progress === "number" && Number.isFinite(progress) ? Math.min(100, Math.max(0, Math.round(progress))) : 0;

    if (p >= 100) {
        return {
            phase: "completed",
            label: "已读完",
            badge: "✅",
            isCompleted: true,
            progressPercentage: 100,
        };
    }
    if (p >= 75) {
        return {
            phase: "concluding",
            label: "即将读完",
            badge: "🏁",
            isCompleted: false,
            progressPercentage: p,
        };
    }
    if (p >= 25) {
        return {
            phase: "indepth",
            label: "深入研读",
            badge: "📖",
            isCompleted: false,
            progressPercentage: p,
        };
    }
    if (p > 0) {
        return {
            phase: "browsing",
            label: "导读起步",
            badge: "🛫",
            isCompleted: false,
            progressPercentage: p,
        };
    }
    return {
        phase: "unread",
        label: "未读",
        badge: "⚪",
        isCompleted: false,
        progressPercentage: 0,
    };
}

/**
 * 格式化接续上次阅读断点的轻量反馈提示文本
 */
export function formatReadPointResumeNotice(
    position: ReadingPosition | null | undefined,
    ratio: number | null = null
): string {
    const valid = parseReadingPosition(position);
    if (!valid) return "";

    const pctStr = (typeof ratio === "number" && ratio > 0) ? `（已读 ${ratio}%）` : "";
    return `已为您自动接续至上次阅读位置${pctStr}`;
}

