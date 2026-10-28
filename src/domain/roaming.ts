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
}

export interface RoamingPick {
    item: RoamingCandidate;
    score: number;
    reason: string;
}

export function calculateRoamingScore(
    item: RoamingCandidate,
    randomFactor: number = Math.random()
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

    const totalScore = Math.round((priorityScore + ratingScore + sliceScore + randScore) * 10) / 10;
    return { score: totalScore, reason };
}

export function pickRoamingArticle(
    candidates: readonly RoamingCandidate[],
    excludedIds: Iterable<string> = [],
    random: () => number = Math.random
): RoamingPick | null {
    const excludeSet = new Set(excludedIds);
    // 仅从待读/稍后读/阅读中且未排除的候选池挑选
    const pool = candidates.filter((c) =>
        (c.status === "inbox" || c.status === "later" || c.status === "reading") &&
        !excludeSet.has(c.id)
    );

    if (pool.length === 0) return null;

    let bestItem: RoamingCandidate = pool[0];
    let bestScore = -1;
    let bestReason = "";

    for (const item of pool) {
        const { score, reason } = calculateRoamingScore(item, random());
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
