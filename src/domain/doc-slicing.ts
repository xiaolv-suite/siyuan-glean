import type { OutlineItem } from "./outline.ts";

export interface DocSlice {
    /** 切片序号，从 1 开始 */
    index: number;
    /** 切片标题 */
    title: string;
    /** 起始大纲块 ID（跳转与锚定用） */
    startBlockId: string;
    /** 包含的章节块 ID 列表 */
    sectionIds: string[];
    /** 包含的章节标题列表 */
    sectionTitles: string[];
    /** 预估字数 */
    estimatedWords: number;
    /** 预估阅读时长（分钟） */
    estimatedMinutes: number;
}

export interface SlicePlanOptions {
    /** 目标每片阅读分钟数，默认 8 分钟 */
    targetMinutesPerSlice?: number;
    /** 每片最小字数，默认 600 字 */
    minWordsPerSlice?: number;
    /** 文章总字数 */
    totalWords?: number;
    /** 文章总预估时长（分钟） */
    totalMinutes?: number;
    /** 自定义切片标题层级：0 为自动，1 为 H1，2 为 H2，3 为 H3（BL-40） */
    headingLevel?: number;
}

export interface DocSlicePlan {
    totalSlices: number;
    targetMinutes: number;
    slices: DocSlice[];
}

/**
 * 长文渐进阅读切片规划算法（纯函数层）
 * 遵循 Issue #17 统领指令第 4 条。
 */
export function planDocSlices(
    outline: readonly OutlineItem[],
    options: SlicePlanOptions = {},
): DocSlicePlan {
    const targetMinutes = Math.max(3, Math.min(30, Math.round(options.targetMinutesPerSlice ?? 8)));
    const totalWords = Math.max(0, options.totalWords ?? 0);
    const estimatedTotalMinutes = Math.max(1, options.totalMinutes ?? Math.max(1, Math.round(totalWords / 400)));

    // 无大纲时降级方案
    if (!outline || outline.length === 0) {
        return {
            totalSlices: 1,
            targetMinutes,
            slices: [
                {
                    index: 1,
                    title: "全篇研读",
                    startBlockId: "",
                    sectionIds: [],
                    sectionTitles: [],
                    estimatedWords: totalWords,
                    estimatedMinutes: estimatedTotalMinutes,
                },
            ],
        };
    }

    // BL-40: 若指定自定义切片标题层级（H1/H2/H3），按该层级精确独立分切
    if (options.headingLevel && options.headingLevel >= 1) {
        const matchingHeadings = outline.filter((o) => o.level === options.headingLevel);
        if (matchingHeadings.length > 0) {
            const avgWordsPerSlice = Math.round(totalWords / matchingHeadings.length);
            const avgMinutesPerSlice = Math.max(1, Math.round(estimatedTotalMinutes / matchingHeadings.length));
            const slices: DocSlice[] = matchingHeadings.map((h, i) => ({
                index: i + 1,
                title: h.title || `切片 ${i + 1}`,
                startBlockId: h.id,
                sectionIds: [h.id],
                sectionTitles: [h.title],
                estimatedWords: avgWordsPerSlice,
                estimatedMinutes: avgMinutesPerSlice,
            }));
            return {
                totalSlices: slices.length,
                targetMinutes,
                slices,
            };
        }
    }

    // 寻找最佳分片层级：优先选择 H2，若无 H2 则选出现最多的顶级层级
    const minLevel = Math.min(...outline.map((o) => o.level));
    const targetLevel = outline.some((o) => o.level === 2) ? 2 : minLevel;

    // 将大纲项按顶级章节分组
    interface SectionGroup {
        heading: OutlineItem;
        subItems: OutlineItem[];
    }

    const groups: SectionGroup[] = [];
    let currentGroup: SectionGroup | null = null;

    for (const item of outline) {
        if (item.level <= targetLevel || currentGroup === null) {
            currentGroup = { heading: item, subItems: [] };
            groups.push(currentGroup);
        } else {
            currentGroup.subItems.push(item);
        }
    }

    // 根据总时长和目标切片时长确定切片总数
    const desiredSliceCount = Math.max(1, Math.min(groups.length, Math.round(estimatedTotalMinutes / targetMinutes)));
    const groupsPerSlice = Math.max(1, Math.ceil(groups.length / desiredSliceCount));

    const slices: DocSlice[] = [];
    let sliceIdx = 1;

    for (let i = 0; i < groups.length; i += groupsPerSlice) {
        const batch = groups.slice(i, i + groupsPerSlice);
        if (batch.length === 0) continue;

        const firstHeading = batch[0].heading;
        const allHeadings = batch.flatMap((g) => [g.heading, ...g.subItems]);
        const sectionIds = allHeadings.map((h) => h.id);
        const sectionTitles = allHeadings.map((h) => h.title);

        // 智能命名切片：单个章节用章节名，多个章节用"起始章节 ~ 结束章节"
        let sliceTitle = firstHeading.title;
        if (batch.length > 1) {
            const lastHeading = batch[batch.length - 1].heading;
            sliceTitle = `${firstHeading.title} ~ ${lastHeading.title}`;
        }

        // 分配估算字数与时间
        const ratio = batch.length / groups.length;
        const sliceWords = totalWords > 0 ? Math.max(100, Math.round(totalWords * ratio)) : 800;
        const sliceMinutes = Math.max(1, Math.round(sliceWords / 400));

        slices.push({
            index: sliceIdx++,
            title: `第 ${sliceIdx - 1} 片：${sliceTitle}`,
            startBlockId: firstHeading.id,
            sectionIds,
            sectionTitles,
            estimatedWords: sliceWords,
            estimatedMinutes: sliceMinutes,
        });
    }

    return {
        totalSlices: slices.length,
        targetMinutes,
        slices,
    };
}

/**
 * 构建起始块 ID 到切片对象的快速查找表（供大纲树与阅读器导轨秒级渲染）
 */
export function buildSliceStartMap(slices: readonly DocSlice[]): Map<string, DocSlice> {
    const map = new Map<string, DocSlice>();
    for (const slice of slices) {
        if (slice.startBlockId) {
            map.set(slice.startBlockId, slice);
        }
    }
    return map;
}
export function formatSliceMarkdown(
    slice: DocSlice,
    articleTitle: string,
    articleId: string,
    sourceUrl?: string,
): string {
    const lines: string[] = [];
    lines.push(`# ${slice.title}`);
    lines.push("");
    lines.push(`> 📖 原文长文：(( ${articleId} '${articleTitle}' )) [${articleTitle}](siyuan://blocks/${articleId})`);
    if (slice.startBlockId) {
        lines.push(`> 📍 本节锚点：((${slice.startBlockId} '点击直达正文小节'))`);
    }
    if (sourceUrl) {
        lines.push(`> 🔗 原始来源：${sourceUrl}`);
    }
    lines.push(`> ⏱️ 预估用时：约 ${slice.estimatedMinutes} 分钟（${slice.estimatedWords} 字）`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("### 本片包含小节");
    for (const title of slice.sectionTitles) {
        lines.push(`- ${title}`);
    }
    lines.push("");
    lines.push("### 研读笔记与思考");
    lines.push("");
    return lines.join("\n");
}

/**
 * 将文章大纲转化为思源原生折叠思维导图的 Markdown 格式（挂载 custom-sy-list-mindmap）
 */
export function buildOutlineMindmapMarkdown(
    articleTitle: string,
    articleId: string,
    outline: readonly OutlineItem[],
): string {
    const title = articleTitle.trim() || "文章大纲";
    const lines: string[] = [];
    lines.push(`# 《${title}》· 思维导图`);
    lines.push("");
    lines.push(`> 📖 原文长文：(( ${articleId} '《${title}》' )) [${title}](siyuan://blocks/${articleId})`);
    lines.push("");
    lines.push(`{: custom-sy-list-mindmap="true" }`);
    lines.push(`- 🧠 ${title}`);
    for (const item of outline) {
        const indent = "  ".repeat(Math.max(1, item.level));
        const refSnippet = item.id ? ` (( ${item.id} '直达正文' ))` : "";
        lines.push(`${indent}- ${item.title}${refSnippet}`);
    }
    lines.push("");
    return lines.join("\n");
}
