/**
 * 多维加权无压漫游阅读算法（纯函数层）
 * 核心哲学：无压力漫游，借鉴 SuperMemo 渐进阅读与思源社区漫游阅读模式。
 * 动态综合加权：
 * - 重要度权重 40% (priority 1~5)
 * - 兴趣度/评分权重 30% (rating 1~5，未评级默认适中期望)
 * - 轻量切片/未读进度权重 20% (渐进切片或 5~10m 轻量短文优先推荐，消除长文心理门槛)
 * - 随机扰动 10% (引入适度随机性，防止首几篇持续死锁，赋予盲盒探索感)
 */

export interface RoamingCandidate {
    id: string;
    title: string;
    status: string;
    priority?: number;
    rating?: number;
    minutes?: number;
    words?: number;
    aiTags?: string[];
    tags?: string[];
    url?: string;
    site?: string;
    author?: string;
    time?: string;
    summary?: string;
    readPoint?: string;
    favorite?: boolean;
    snapshot?: string;
}

export interface RoamingPick {
    item: RoamingCandidate;
    score: number;
    reason: string;
}

export type RoamingTimeBudget = "all" | "short" | "medium" | "long";

export interface RoamingPickOptions {
    excludedIds?: Iterable<string>;
    timeBudget?: RoamingTimeBudget;
    tag?: string;
    favoriteOnly?: boolean;
    highRatingPriority?: boolean;
    random?: () => number;
}

export function calculateRoamingScore(
    item: RoamingCandidate,
    randomFactor: number = Math.random(),
    highRatingPriority: boolean = false
): { score: number; reason: string } {
    // 1. 重要度 (40分)
    const p = Math.max(1, Math.min(5, item.priority || 3));
    const priorityScore = (p / 5) * 40;

    // 2. 兴趣/评分 (30分)
    const r = Math.max(0, Math.min(5, item.rating || 0));
    const ratingScore = r > 0 ? (r / 5) * 30 : 18; // 未评分给默认 60% 基础分

    // 3. 切片/篇幅适度 (20分)
    const isSlice = (item.aiTags || []).some((t) => t.toLowerCase() === "渐进切片" || t.toLowerCase() === "doc-slice");
    const m = item.minutes || 0;
    let sliceScore = 10;
    let reason = "漫游推荐";
    if (isSlice) {
        sliceScore = 20;
        reason = "✂️ 渐进切片 · 轻松读完";
    } else if (item.readPoint) {
        sliceScore = 19;
        reason = "🔖 断点续读 · 接续灵感";
    } else if (item.favorite) {
        sliceScore = 19;
        reason = "❤️ 珍藏精选 · 值得重读";
    } else if (m > 0 && m <= 10) {
        sliceScore = 18;
        reason = `⏱️ ${m} 分钟短篇 · 快速阅读`;
    } else if (p >= 4) {
        reason = "⭐ 高优先级精选";
    } else if (r >= 4) {
        reason = "💖 高评分推荐";
    }

    // 4. 随机扰动 (10分)
    const randScore = Math.max(0, Math.min(1, randomFactor)) * 10;

    // BL-36: 高星级与评分加权高频重浮加分
    let bonus = 0;
    if (highRatingPriority) {
        if (r >= 4) bonus += (r - 3) * 15;
        if (p >= 4) bonus += (p - 3) * 10;
        if (item.favorite) bonus += 15;
        if (r >= 4) reason = "💖 高评分重温";
        else if (p >= 4) reason = "⭐ 高价值推荐";
    }

    const totalScore = Math.round((priorityScore + ratingScore + sliceScore + randScore + bonus) * 10) / 10;
    return { score: totalScore, reason };
}

export function pickRoamingArticle(
    candidates: readonly RoamingCandidate[],
    options?: RoamingPickOptions | Iterable<string>,
    legacyRandom?: () => number
): RoamingPick | null {
    let excludedIds: Iterable<string> = [];
    let timeBudget: RoamingTimeBudget = "all";
    let targetTag = "";
    let favoriteOnly = false;
    let highRatingPriority = false;
    let random = Math.random;

    if (options) {
        if (typeof (options as any)[Symbol.iterator] === "function" && !(options as RoamingPickOptions).timeBudget && !(options as RoamingPickOptions).excludedIds && !(options as RoamingPickOptions).tag && !(options as RoamingPickOptions).favoriteOnly) {
            excludedIds = options as Iterable<string>;
            if (legacyRandom) random = legacyRandom;
        } else {
            const opts = options as RoamingPickOptions;
            if (opts.excludedIds) excludedIds = opts.excludedIds;
            if (opts.timeBudget) timeBudget = opts.timeBudget;
            if (opts.tag) targetTag = opts.tag;
            if (opts.favoriteOnly) favoriteOnly = Boolean(opts.favoriteOnly);
            if (opts.highRatingPriority) highRatingPriority = Boolean(opts.highRatingPriority);
            if (opts.random) random = opts.random;
        }
    }

    const excludeSet = new Set(excludedIds);
    // 仅从待读/稍后读/阅读中且未排除的候选池挑选，并应用可用时间预算与主题约束
    const pool = candidates.filter((c) => {
        if (c.status !== "inbox" && c.status !== "later" && c.status !== "reading") return false;
        if (excludeSet.has(c.id)) return false;
        if (favoriteOnly && !c.favorite) return false;
        const m = c.minutes ?? 0;
        if (timeBudget === "short" && !(m > 0 && m <= 5)) return false;
        if (timeBudget === "medium" && !(m > 5 && m <= 15)) return false;
        if (timeBudget === "long" && !(m > 15)) return false;
        if (targetTag && !(c.tags || []).includes(targetTag) && !(c.aiTags || []).includes(targetTag)) return false;
        return true;
    });

    if (pool.length === 0) return null;

    let bestItem: RoamingCandidate = pool[0];
    let bestScore = -1;
    let bestReason = "";

    for (const item of pool) {
        const { score, reason } = calculateRoamingScore(item, random(), highRatingPriority);
        if (score > bestScore) {
            bestScore = score;
            bestItem = item;
            bestReason = reason;
        }
    }

    return {
        item: bestItem,
        score: bestScore,
        reason: bestReason,
    };
}
