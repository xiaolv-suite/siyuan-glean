/**
 * 结构化高亮大纲领域模型 (Highlight Outline Model)
 * 
 * 对标 Cubox / Readwise Reader 核心能力：
 * 终结边读边划线的碎片分散痛点，将长文中散落的高亮划线
 * 按照出现的章节结构聚合为树状思维大纲，
 * 并携带思源原生双向块链接 ((blockId)) 反向穿透定位。
 */

import type { HighlightItem } from "./highlights";

export interface OutlineHeading {
    id: string;
    text: string;
    level: number;
}

export interface HighlightOutlineSection {
    /** 章节标题信息（为 undefined 时表示文首引言/前言高亮） */
    heading?: OutlineHeading;
    /** 归属在该章节下的高亮项列表 */
    highlights: HighlightItem[];
}

export interface HighlightOutlineTree {
    docId: string;
    docTitle: string;
    site?: string;
    url?: string;
    totalHighlights: number;
    sections: HighlightOutlineSection[];
}

const COLOR_EMOJIS: Record<string, string> = {
    yellow: "🟡",
    red: "🔴",
    blue: "🔵",
    green: "🟢",
};

/**
 * 根据文档标题列表与正文块拓扑顺序，将高亮项挂载聚合至对应的章节小节下
 * 
 * @param docId 文章文档 ID
 * @param docTitle 文章标题
 * @param headings 文档标题大纲数组（按顺序排列）
 * @param highlights 文档内的高亮划线数组
 * @param orderedBlockIds 可选的文档内块 ID 拓扑顺序（有序全量）
 */
export function buildHighlightOutlineTree(
    docId: string,
    docTitle: string,
    headings: readonly OutlineHeading[],
    highlights: readonly HighlightItem[],
    orderedBlockIds?: readonly string[],
    meta?: { site?: string; url?: string }
): HighlightOutlineTree {
    if (!highlights || highlights.length === 0) {
        return {
            docId,
            docTitle,
            site: meta?.site,
            url: meta?.url,
            totalHighlights: 0,
            sections: [],
        };
    }

    // 若无标题，全部归入单节
    if (!headings || headings.length === 0) {
        return {
            docId,
            docTitle,
            site: meta?.site,
            url: meta?.url,
            totalHighlights: highlights.length,
            sections: [{
                heading: undefined,
                highlights: [...highlights],
            }],
        };
    }

    // 若有块拓扑排序，按拓扑先后严格归类到前序最近的一个标题下
    if (orderedBlockIds && orderedBlockIds.length > 0) {
        const headingById = new Map<string, OutlineHeading>();
        for (const h of headings) headingById.set(h.id, h);

        const highlightByTargetId = new Map<string, HighlightItem[]>();
        for (const hl of highlights) {
            const targetId = hl.sourceBlockId || hl.id;
            const list = highlightByTargetId.get(targetId) || [];
            list.push(hl);
            highlightByTargetId.set(targetId, list);
        }

        const sections: HighlightOutlineSection[] = [];
        let currentSection: HighlightOutlineSection = {
            heading: undefined,
            highlights: [],
        };

        for (const blockId of orderedBlockIds) {
            if (headingById.has(blockId)) {
                // 开启新的小节
                if (currentSection.highlights.length > 0 || currentSection.heading !== undefined) {
                    if (currentSection.highlights.length > 0) {
                        sections.push(currentSection);
                    }
                }
                currentSection = {
                    heading: headingById.get(blockId),
                    highlights: [],
                };
            }

            const matchedHls = highlightByTargetId.get(blockId);
            if (matchedHls && matchedHls.length > 0) {
                currentSection.highlights.push(...matchedHls);
            }
        }

        if (currentSection.highlights.length > 0) {
            sections.push(currentSection);
        }

        // 收集未被拓扑匹配到的遗漏高亮（如异步新增），安全兜底追加
        const includedIds = new Set(sections.flatMap((s) => s.highlights.map((h) => h.id)));
        const missing = highlights.filter((h) => !includedIds.has(h.id));
        if (missing.length > 0) {
            if (sections.length > 0) {
                sections[sections.length - 1].highlights.push(...missing);
            } else {
                sections.push({ heading: undefined, highlights: [...missing] });
            }
        }

        return {
            docId,
            docTitle,
            site: meta?.site,
            url: meta?.url,
            totalHighlights: highlights.length,
            sections,
        };
    }

    // 默认均匀启发式归类（若无拓扑块 ID）：如果只有标题列表，按等分或前缀聚集
    const sections: HighlightOutlineSection[] = [];
    const firstSection: HighlightOutlineSection = {
        heading: headings[0],
        highlights: [...highlights],
    };
    sections.push(firstSection);

    return {
        docId,
        docTitle,
        site: meta?.site,
        url: meta?.url,
        totalHighlights: highlights.length,
        sections,
    };
}

/**
 * 将高亮结构化大纲生成为思源原生 Markdown 笔记文本
 * 自带章节层级、颜色圆点、批注感悟与反向定位块引用 ((blockId '📍 原文'))
 */
export function renderStructuredOutlineMarkdown(tree: HighlightOutlineTree): string {
    const title = tree.docTitle || "无标题文章";
    const metaParts: string[] = [];
    if (tree.site) metaParts.push(`来源：${tree.site}`);
    if (tree.url) metaParts.push(`[原文链接](${tree.url})`);
    metaParts.push(`高亮精萃：${tree.totalHighlights} 条`);

    const lines: string[] = [
        `# 📖 《${title}》· 结构化划线大纲`,
        "",
        `> 💡 ${metaParts.join(" · ")}`,
        `> (( ${tree.docId} '📍 点击直接跳转回原文全文' ))`,
        "",
        "---",
        "",
    ];

    for (const section of tree.sections) {
        if (section.heading) {
            const prefix = "#".repeat(Math.min(6, Math.max(2, section.heading.level + 1)));
            lines.push(`${prefix} ${section.heading.text}`);
            lines.push("");
        } else if (section.highlights.length > 0) {
            lines.push(`## 📌 引言与核心提要`);
            lines.push("");
        }

        for (const hl of section.highlights) {
            const dot = COLOR_EMOJIS[hl.color || ""] || "💡";
            const targetId = hl.sourceBlockId || hl.id;
            const quote = hl.text.split(/\r?\n/).map((l) => `> ${l}`).join("\n");

            lines.push(`> ${dot} **划线重点**：`);
            lines.push(quote);

            if (hl.memo && hl.memo.trim()) {
                lines.push(`> 💭 *思考批注：${hl.memo.trim()}*`);
            }

            if (hl.replies && hl.replies.length > 0) {
                for (const reply of hl.replies) {
                    lines.push(`> 💬 *追评：${reply.md.trim()}*`);
                }
            }

            if (targetId && /^\d{14}-[0-9a-z]{7}$/.test(targetId)) {
                lines.push(`> (( ${targetId} '📍 原文锚点' ))`);
            }

            lines.push("");
        }
    }

    return lines.join("\n").trim() + "\n";
}
