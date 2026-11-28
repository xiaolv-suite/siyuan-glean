/**
 * 本地快照健康度与离线防腐（Snapshot Health & Link Rot Guard）领域层纯函数
 *
 * 借鉴 GitHub 优秀标杆 hoarder：
 * 评估文档正文字数完整度与本地快照离线归档状态，防止原文 URL 404 失效后资料丢失。
 *
 * 严守分层单向依赖架构：纯函数层禁 import svelte/siyuan/api/services/ui。
 */

export type SnapshotHealthGrade = "healthy" | "partial" | "missing";

export interface SnapshotHealth {
    score: number; // 0 - 100
    grade: SnapshotHealthGrade;
    hasSnapshot: boolean;
    words: number;
    labelKey: string;
    descKey: string;
}

export interface SnapshotHealthInput {
    words?: number;
    snapshot?: boolean | string | null;
    url?: string;
    hasBody?: boolean;
}

/**
 * 计算文档的本地快照健康度评分 (0-100) 与评级
 */
export function calculateSnapshotHealth(input: SnapshotHealthInput): SnapshotHealth {
    let score = 0;
    const hasSnapshot = Boolean(input.snapshot);
    const words = Math.max(0, input.words ?? 0);
    const hasBody = input.hasBody !== false && words > 20;

    // 1. 本地快照离线权重（防原文 404 关键权重）
    if (hasSnapshot) {
        score += 45;
    }

    // 2. 正文完整度权重
    if (hasBody) {
        score += 15;
    }

    // 3. 文本体量充盈度分段递增
    if (words >= 1500) {
        score += 40;
    } else if (words >= 600) {
        score += 30;
    } else if (words >= 200) {
        score += 20;
    } else if (words > 50) {
        score += 10;
    }

    score = Math.min(100, Math.max(0, score));

    let grade: SnapshotHealthGrade = "missing";
    let labelKey = "snapshotHealth.missing";
    let descKey = "snapshotHealth.missingDesc";

    if (score >= 70) {
        grade = "healthy";
        labelKey = "snapshotHealth.healthy";
        descKey = "snapshotHealth.healthyDesc";
    } else if (score >= 35) {
        grade = "partial";
        labelKey = "snapshotHealth.partial";
        descKey = "snapshotHealth.partialDesc";
    }

    return {
        score,
        grade,
        hasSnapshot,
        words,
        labelKey,
        descKey,
    };
}
