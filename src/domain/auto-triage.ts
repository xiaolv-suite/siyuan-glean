/**
 * 入库自动分拣规则引擎与既有词表复用（Auto-Triage & Tag Vocabulary Reuse）
 *
 * 借鉴 GitHub 优秀标杆 omnivore 与 hoarder：
 * 1. 入库时基于来源域名、标题关键词、预计阅读时长等规则，自动分配初始五态与追加预设标签；
 * 2. 智能标签生成时，强化对既有高频标签词表的复用与对齐，彻底防止标签膨胀爆炸。
 *
 * 严守分层单向依赖架构：纯函数层禁 import svelte/siyuan/api/services/ui。
 */

import type { ClipStatus } from "./schema.ts";

export interface AutoTriageRule {
    id: string;
    name: string;
    enabled: boolean;
    priority: number; // 数值越小优先级越高
    matchers: {
        domains?: string[]; // 域名匹配 (例如 mp.weixin.qq.com, arxiv.org)
        titleKeywords?: string[]; // 标题关键词匹配
        minMinutes?: number; // 预计阅读时长下限
        maxMinutes?: number; // 预计阅读时长上限
        minWords?: number; // 字数下限
        maxWords?: number; // 字数上限
    };
    actions: {
        targetStatus?: ClipStatus; // 分配初始五态 (inbox / later / reading 等)
        appendTags?: string[]; // 自动追加初始标签
        setPriority?: number; // 初始优先级 (0-5)
    };
}

export const DEFAULT_AUTO_TRIAGE_RULES: readonly AutoTriageRule[] = [
    {
        id: "rule-wechat",
        name: "微信公众号专栏",
        enabled: true,
        priority: 10,
        matchers: {
            domains: ["mp.weixin.qq.com", "weixin.qq.com"],
        },
        actions: {
            appendTags: ["微信"],
        },
    },
    {
        id: "rule-academic",
        name: "学术长文与论文",
        enabled: true,
        priority: 20,
        matchers: {
            domains: ["arxiv.org", "biorxiv.org", "nature.com", "sciencedirect.com", "acm.org"],
            titleKeywords: ["论文", "paper", "preprint", "journal", "research"],
        },
        actions: {
            targetStatus: "later",
            appendTags: ["学术论文"],
            setPriority: 3,
        },
    },
    {
        id: "rule-deep-read",
        name: "深度长文精读",
        enabled: true,
        priority: 30,
        matchers: {
            minMinutes: 15,
        },
        actions: {
            targetStatus: "later",
            appendTags: ["深度长文"],
        },
    },
    {
        id: "rule-quick-read",
        name: "碎片短文速读",
        enabled: true,
        priority: 40,
        matchers: {
            maxMinutes: 5,
        },
        actions: {
            targetStatus: "inbox",
            appendTags: ["速读"],
        },
    },
];

export interface TriageItemInput {
    url?: string;
    title?: string;
    site?: string;
    words?: number;
    estimatedMinutes?: number;
    currentStatus?: ClipStatus;
    currentTags?: string[];
}

export interface EvaluatedTriageResult {
    status: ClipStatus;
    tags: string[];
    matchedRuleIds: string[];
    appliedPriority?: number;
}

/**
 * 校验单条分拣规则是否命中目标条目
 */
export function matchesAutoTriageRule(rule: AutoTriageRule, item: TriageItemInput): boolean {
    if (!rule.enabled) return false;
    const { domains, titleKeywords, minMinutes, maxMinutes, minWords, maxWords } = rule.matchers;

    // 1. 域名与标题匹配：命中任意已配置的域名或标题关键词维度
    const hasDomainFilter = Boolean(domains && domains.length > 0);
    const hasKeywordFilter = Boolean(titleKeywords && titleKeywords.length > 0);

    if (hasDomainFilter || hasKeywordFilter) {
        const itemDomain = (item.site || item.url || "").toLowerCase();
        const domainHit = hasDomainFilter && domains!.some((d) => itemDomain.includes(d.toLowerCase()));

        const itemTitle = (item.title || "").toLowerCase();
        const keywordHit = hasKeywordFilter && titleKeywords!.some((kw) => itemTitle.includes(kw.toLowerCase()));

        if (!domainHit && !keywordHit) return false;
    }

    // 2. 阅读时长区间校验 (硬约束：规则显式声明时长阈值时，未知时长不误判命中)
    const minutes = item.estimatedMinutes ?? (item.words ? Math.max(1, Math.round(item.words / 400)) : undefined);
    if (minMinutes !== undefined && (minutes === undefined || minutes < minMinutes)) {
        return false;
    }
    if (maxMinutes !== undefined && (minutes === undefined || minutes > maxMinutes)) {
        return false;
    }

    // 3. 字数区间校验 (硬约束：规则显式声明字数阈值时，未知字数不误判命中)
    if (minWords !== undefined && (item.words === undefined || item.words < minWords)) {
        return false;
    }
    if (maxWords !== undefined && (item.words === undefined || item.words > maxWords)) {
        return false;
    }

    return true;
}

/**
 * 对单篇文章执行自动分拣评估，返回推导出的初始五态与标签追加
 */
export function evaluateAutoTriage(
    item: TriageItemInput,
    rules: readonly AutoTriageRule[] = DEFAULT_AUTO_TRIAGE_RULES
): EvaluatedTriageResult {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    let resolvedStatus: ClipStatus = item.currentStatus || "inbox";
    const mergedTags = new Set<string>(item.currentTags || []);
    const matchedRuleIds: string[] = [];
    let priority: number | undefined;

    let statusAssigned = Boolean(item.currentStatus);

    for (const rule of sorted) {
        if (matchesAutoTriageRule(rule, item)) {
            matchedRuleIds.push(rule.id);
            if (!statusAssigned && rule.actions.targetStatus) {
                resolvedStatus = rule.actions.targetStatus;
                statusAssigned = true;
            }
            if (rule.actions.appendTags) {
                for (const t of rule.actions.appendTags) {
                    if (t.trim()) mergedTags.add(t.trim());
                }
            }
            if (priority === undefined && rule.actions.setPriority !== undefined) {
                priority = rule.actions.setPriority;
            }
        }
    }

    return {
        status: resolvedStatus,
        tags: Array.from(mergedTags),
        matchedRuleIds,
        appliedPriority: priority,
    };
}

/**
 * 标签归一化 key：小写且去除多余空白和 # 符号
 */
function normalizeTagKey(tag: string): string {
    return (tag || "").toLowerCase().replace(/^#/, "").replace(/\s+/g, "");
}

/**
 * 智能标签防膨胀：将建议的新标签与既有高频标签词表对齐，优先复用库内已有词汇
 */
export function alignTagsWithVocabulary(
    suggestedTags: readonly string[],
    existingVocabulary: readonly string[]
): string[] {
    if (!existingVocabulary || existingVocabulary.length === 0) {
        return [...suggestedTags];
    }

    const vocabMap = new Map<string, string>();
    for (const v of existingVocabulary) {
        const key = normalizeTagKey(v);
        if (key && !vocabMap.has(key)) {
            vocabMap.set(key, v.trim());
        }
    }

    const aligned: string[] = [];
    const seen = new Set<string>();

    for (const tag of suggestedTags) {
        const trimmed = (tag || "").trim();
        if (!trimmed) continue;
        const key = normalizeTagKey(trimmed);

        let match = vocabMap.get(key);

        // 若无完全精准对应，尝试单向包含匹配（如库内已有“机器学习”，新标签“机器学习技术”复用既有词）
        if (!match && key.length >= 2) {
            for (const [vKey, vVal] of vocabMap.entries()) {
                if (vKey.length >= 2 && (key.includes(vKey) || vKey.includes(key))) {
                    match = vVal;
                    break;
                }
            }
        }

        const finalTag = match || trimmed;
        const finalKey = normalizeTagKey(finalTag);
        if (!seen.has(finalKey)) {
            seen.add(finalKey);
            aligned.push(finalTag);
        }
    }

    return aligned;
}
