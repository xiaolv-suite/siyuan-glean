/**
 * 5 阶语义折叠交互阅读器（Folded Reader）领域层纯函数
 *
 * 核心哲学：借鉴 GitHub 优秀标杆 chenxiachan/textfold 的“保真优先，拒绝虚构重写 (Fidelity over AI Rewriting)”哲学。
 *
 * FoldLevel (1|2|3|4|5)：
 * - Level 1: 完整原文整段 (Full Paragraph) - 100% 原始段落排版
 * - Level 2: 逐字金句 (Verbatim Brief) - 100% 纯作者原句子串，强制校验必须为原文逐字子串（Verbatim Guard）
 * - Level 3: 论点支撑 (Key Points) - 关键论据与核心论点提取
 * - Level 4: 单行要旨 (One-line Gist) - 段落单行精炼概括
 * - Level 5: 概念卡片 (Concept Card) - 核心概念与思维印记
 *
 * 严守分层单向依赖架构：纯函数层禁 import svelte/siyuan/api/services/ui。
 */

export type FoldLevel = 1 | 2 | 3 | 4 | 5;

export interface FoldNode {
    id: string; // 唯一节点标识，严格对应思源段落 blockId
    blockId: string; // 思源块 ID
    level: FoldLevel; // 当前折叠层级
    fullText: string; // Level 1: 完整原文
    brief: string; // Level 2: 100% 逐字原句子串 (Verbatim Guard 强制检验)
    points?: string[]; // Level 3: 论点与支撑从句
    gist?: string; // Level 4: 单行要旨
    concept?: string; // Level 5: 核心概念标签
    expanded?: boolean; // 单段卡片是否单独展开/折叠
    type?: string; // 段落类型 (NodeParagraph, NodeHeading 等)
}

export interface FoldLevelConfig {
    level: FoldLevel;
    nameKey: string;
    descKey: string;
    badgeKey: string;
    badge: string;
    shortcut: string;
}

export const FOLD_LEVEL_CONFIGS: readonly FoldLevelConfig[] = [
    { level: 1, nameKey: "foldReader.level1Name", descKey: "foldReader.level1Desc", badgeKey: "foldReader.level1Badge", badge: "全文", shortcut: "1" },
    { level: 2, nameKey: "foldReader.level2Name", descKey: "foldReader.level2Desc", badgeKey: "foldReader.level2Badge", badge: "逐字", shortcut: "2" },
    { level: 3, nameKey: "foldReader.level3Name", descKey: "foldReader.level3Desc", badgeKey: "foldReader.level3Badge", badge: "论点", shortcut: "3" },
    { level: 4, nameKey: "foldReader.level4Name", descKey: "foldReader.level4Desc", badgeKey: "foldReader.level4Badge", badge: "要旨", shortcut: "4" },
    { level: 5, nameKey: "foldReader.level5Name", descKey: "foldReader.level5Desc", badgeKey: "foldReader.level5Badge", badge: "概念", shortcut: "5" },
];

/**
 * 规范化文本空白（将连续空白压缩为单空格，去除首尾空白）
 */
export function normalizeText(text: string): string {
    return (text || "").replace(/\s+/g, " ").trim();
}

/**
 * Verbatim 保真校验：判定候选短语是否 100% 为原文的逐字子串（拒绝 AI 幻觉和虚构改写）
 * 消除排版换行与多余空格影响，严格按字符序列进行保真子串校验
 */
export function isVerbatimSubstring(candidate: string, fullText: string): boolean {
    const cand = (candidate || "").trim();
    const source = (fullText || "").trim();
    if (!cand || !source) return false;
    if (source.includes(cand)) return true;
    const compactSource = source.replace(/\s+/g, "");
    const compactCand = cand.replace(/\s+/g, "");
    return compactCand.length > 0 && compactSource.includes(compactCand);
}

/**
 * 从段落原文中提取 100% 保真的首句逐字子串（Level 2 Brief）
 */
export function extractVerbatimBrief(fullText: string, maxLen = 140): string {
    const raw = (fullText || "").trim();
    if (!raw) return "";

    // 寻找段落中的首个完整句子
    const sentenceMatch = raw.match(/^[^。！？!?\n]+[。！？!?]?/);
    const candidate = sentenceMatch ? sentenceMatch[0].trim() : raw;

    if (candidate.length <= maxLen && isVerbatimSubstring(candidate, raw)) {
        return candidate;
    }

    // 若首句超长，寻找自然停顿分句符（逗号、分号、破折号）截取真正子串
    const subMatch = candidate.slice(0, maxLen).match(/^[^，,；; ——]+[，,；;]?/);
    if (subMatch && subMatch[0].trim().length >= 10) {
        const sub = subMatch[0].trim();
        if (isVerbatimSubstring(sub, raw)) return sub;
    }

    // 终极安全保底：直接切片原文前 maxLen 字符，确保 100% 是原文的逐字前缀
    const sliced = raw.slice(0, Math.min(raw.length, maxLen)).trim();
    return sliced;
}

/**
 * 从段落原文中提取论点与支撑从句（Level 3 Points）
 */
export function extractFoldPoints(fullText: string): string[] {
    const raw = (fullText || "").trim();
    if (!raw) return [];

    // 按分号、句号、顿号、逗号拆分出支持论据片段
    const clauses = raw
        .split(/[；;。！？\n]/)
        .map((c) => c.trim())
        .filter((c) => c.length >= 6 && c.length <= 80 && isVerbatimSubstring(c, raw));

    if (clauses.length >= 2) {
        return clauses.slice(0, 3);
    }

    // 次选逗号切分
    const subClauses = raw
        .split(/[，,]/)
        .map((c) => c.trim())
        .filter((c) => c.length >= 6 && c.length <= 60 && isVerbatimSubstring(c, raw));

    if (subClauses.length >= 2) {
        return subClauses.slice(0, 3);
    }

    const brief = extractVerbatimBrief(raw);
    return brief ? [brief] : [];
}

/**
 * 提取段落单行要旨（Level 4 Gist）：与 Level 2 完整首句区分，优先提取精炼结论分句或 48 字内短句
 */
export function extractGist(fullText: string): string {
    const raw = (fullText || "").trim();
    if (!raw) return "";
    const clauses = raw
        .split(/[。！？!?\n；;]/)
        .map((c) => c.trim())
        .filter((c) => c.length >= 6 && c.length <= 54 && isVerbatimSubstring(c, raw));
    if (clauses.length >= 2) {
        return clauses[clauses.length - 1];
    }
    return extractVerbatimBrief(raw, 48);
}

/**
 * 提取段落核心概念 / 主题标签（Level 5 Concept）
 */
export function extractConcept(fullText: string): string {
    const raw = (fullText || "").trim();
    if (!raw) return "概念";

    // 1. 优先提取书名号或引号中的术语
    const quotedMatch = raw.match(/[《“「『]([^》”」』]{2,12})[》”」』]/);
    if (quotedMatch && quotedMatch[1].trim()) {
        return quotedMatch[1].trim();
    }

    // 2. 优先提取加粗 **术语**
    const boldMatch = raw.match(/\*\*([^*]{2,12})\*\*/);
    if (boldMatch && boldMatch[1].trim()) {
        return boldMatch[1].trim();
    }

    // 3. 提取前 4-8 个字核心词
    const leading = raw.replace(/^#+\s*/, "").replace(/^[-*+]\s*/, "").trim();
    const cleanWord = leading.split(/[\s，,。！？!?；;：:（(]/)[0] || "";
    if (cleanWord.length >= 2 && cleanWord.length <= 10) {
        return cleanWord;
    }

    return leading.slice(0, 6) || "论点";
}

/**
 * 创建并校验单个 FoldNode
 */
export function createFoldNode(
    blockId: string,
    fullText: string,
    partial?: Partial<FoldNode>
): FoldNode {
    const cleanFullText = (fullText || "").trim();
    let brief = partial?.brief;

    // Verbatim Guard 强校验：如果不满足 100% 原文子串，强制重新提取原文子串
    if (!brief || !isVerbatimSubstring(brief, cleanFullText)) {
        brief = extractVerbatimBrief(cleanFullText);
    }

    const points = partial?.points && partial.points.length > 0 && partial.points.every((p) => isVerbatimSubstring(p, cleanFullText))
        ? partial.points
        : extractFoldPoints(cleanFullText);

    const gist = partial?.gist || extractGist(cleanFullText);
    const concept = partial?.concept || extractConcept(cleanFullText);

    return {
        id: blockId,
        blockId,
        level: partial?.level ?? 2,
        fullText: cleanFullText,
        brief,
        points,
        gist,
        concept,
        expanded: partial?.expanded ?? false,
        type: partial?.type,
    };
}

/**
 * 将思源子块列表解析为折叠节点序列
 */
export function parseBlocksToFoldNodes(
    blocks: readonly { id: string; content?: string; type?: string; subType?: string }[],
    initialLevel: FoldLevel = 2
): FoldNode[] {
    const nodes: FoldNode[] = [];
    for (const block of blocks) {
        const text = (block.content || "").replace(/<[^>]+>/g, "").trim();
        // 过滤空块与极短噪音
        if (text.length < 3) continue;
        nodes.push(createFoldNode(block.id, text, {
            level: initialLevel,
            type: block.type,
            expanded: false,
        }));
    }
    return nodes;
}

/**
 * 应用全局折叠层级并收起各个单段的临时展开状态
 */
export function applyGlobalFoldLevel(
    nodes: readonly FoldNode[],
    level: FoldLevel
): FoldNode[] {
    return nodes.map((node) => ({
        ...node,
        level,
        expanded: false,
    }));
}

/**
 * 切换单个节点的展开/折叠状态
 */
export function toggleNodeFold(node: FoldNode): FoldNode {
    return {
        ...node,
        expanded: !node.expanded,
    };
}

/**
 * 获取单个节点在指定折叠层级下的呈现文本
 */
export function resolveNodeDisplayContent(node: FoldNode, level: FoldLevel): string {
    if (level === 1) return node.fullText;
    if (level === 2) return node.brief || node.fullText;
    if (level === 3) return (node.points && node.points.length > 0) ? node.points.join("；") : (node.brief || node.fullText);
    if (level === 4) return node.gist || node.brief || node.fullText;
    return node.concept || node.gist || node.brief || node.fullText;
}

export interface FoldMetricsResult {
    /** 当前折叠层级 (1~5) */
    level: FoldLevel;
    /** 全文原始总字符数（Level 1） */
    totalOriginalChars: number;
    /** 当前折叠呈现字符数 */
    foldedChars: number;
    /** 字符保留率（0 ~ 1.0） */
    retentionRatio: number;
    /** 篇幅浓缩/节省百分比（0 ~ 100） */
    savedPercentage: number;
    /** 原文预估阅读分钟数（按 400 字/分钟） */
    originalMinutes: number;
    /** 当前层级预估速读分钟数 */
    foldedMinutes: number;
    /** 节省的预估阅读分钟数 */
    savedMinutes: number;
}

/**
 * 计算当前阶数语义折叠下的篇幅压缩率与时间节省度量看板指标
 */
export function calculateFoldLevelMetrics(
    nodes: readonly FoldNode[],
    level: FoldLevel,
    wordsPerMinute = 400
): FoldMetricsResult {
    if (!nodes || nodes.length === 0) {
        return {
            level,
            totalOriginalChars: 0,
            foldedChars: 0,
            retentionRatio: 1,
            savedPercentage: 0,
            originalMinutes: 0,
            foldedMinutes: 0,
            savedMinutes: 0,
        };
    }

    let origChars = 0;
    let foldChars = 0;

    for (const node of nodes) {
        const fullLen = (node.fullText || "").length;
        const dispText = resolveNodeDisplayContent(node, level);
        const dispLen = (dispText || "").length;

        origChars += fullLen;
        foldChars += dispLen;
    }

    const safeOrig = Math.max(1, origChars);
    const retentionRatio = Math.min(1, Math.max(0, foldChars / safeOrig));
    const savedPercentage = Math.round((1 - retentionRatio) * 100);

    const origMins = Math.max(1, Math.ceil(origChars / wordsPerMinute));
    const foldMins = foldChars > 0 ? Math.max(1, Math.ceil(foldChars / wordsPerMinute)) : 0;
    const savedMins = Math.max(0, origMins - foldMins);

    return {
        level,
        totalOriginalChars: origChars,
        foldedChars: foldChars,
        retentionRatio: Number(retentionRatio.toFixed(3)),
        savedPercentage,
        originalMinutes: origMins,
        foldedMinutes: foldMins,
        savedMinutes: savedMins,
    };
}

/**
 * 将当前阶数的折叠大纲节点格式化为 Markdown 笔记草稿（BL-35，支持大纲标题分层导出）
 */
export function formatFoldNodesToMarkdown(nodes: readonly FoldNode[], level: FoldLevel): string {
    const lines: string[] = [];
    for (const node of nodes) {
        const content = resolveNodeDisplayContent(node, level);
        if (content && content.trim()) {
            const isHeading = node.type === "NodeHeading";
            if (isHeading) {
                lines.push(`\n### ${content.trim()}\n`);
            } else if (node.blockId) {
                lines.push(`- ${content.trim()} ((${node.blockId} '*'))`);
            } else {
                lines.push(`- ${content.trim()}`);
            }
        }
    }
    return lines.join("\n").trim();
}
