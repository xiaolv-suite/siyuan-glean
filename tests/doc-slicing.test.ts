import test from "node:test";
import assert from "node:assert/strict";
import { planDocSlices, formatSliceMarkdown, buildSliceStartMap, buildOutlineMindmapMarkdown } from "../src/domain/doc-slicing.ts";
import type { OutlineItem } from "../src/domain/outline.ts";

test("planDocSlices 在空大纲时平滑降级为单片全篇", () => {
    const plan = planDocSlices([], { totalWords: 2400, totalMinutes: 6 });
    assert.equal(plan.totalSlices, 1);
    assert.equal(plan.slices[0].title, "全篇研读");
    assert.equal(plan.slices[0].estimatedWords, 2400);
    assert.equal(plan.slices[0].estimatedMinutes, 6);
});

test("planDocSlices 依据 H2 章节合理划分切片与分配时长", () => {
    const outline: OutlineItem[] = [
        { id: "20261027120000-h200001", level: 2, title: "一、前言与背景" },
        { id: "20261027120000-h300001", level: 3, title: "1.1 现状分析" },
        { id: "20261027120000-h200002", level: 2, title: "二、核心架构原理" },
        { id: "20261027120000-h300002", level: 3, title: "2.1 状态机设计" },
        { id: "20261027120000-h200003", level: 2, title: "三、工程落地与调优" },
        { id: "20261027120000-h200004", level: 2, title: "四、总结与展望" },
    ];

    const plan = planDocSlices(outline, {
        targetMinutesPerSlice: 5,
        totalWords: 8000,
        totalMinutes: 20,
    });

    assert.ok(plan.totalSlices >= 3);
    assert.equal(plan.slices[0].startBlockId, "20261027120000-h200001");
    assert.ok(plan.slices[0].title.includes("一、前言与背景"));
    assert.ok(plan.slices[0].sectionTitles.includes("1.1 现状分析"));
    assert.ok(plan.slices[0].estimatedMinutes > 0);
});

test("planDocSlices 支持指定 headingLevel（H1/H2/H3）自定义层级精确切片（BL-40）", () => {
    const outline = [
        { id: "h1-1", level: 1 as const, title: "第一章：基础理论" },
        { id: "h2-1", level: 2 as const, title: "1.1 认知机制" },
        { id: "h2-2", level: 2 as const, title: "1.2 实验结论" },
        { id: "h1-2", level: 1 as const, title: "第二章：系统实践" },
        { id: "h2-3", level: 2 as const, title: "2.1 架构设计" },
    ];

    // 按 H1 分切：恰好分为 2 个大片（两章）
    const planH1 = planDocSlices(outline, { headingLevel: 1, totalWords: 6000, totalMinutes: 15 });
    assert.equal(planH1.totalSlices, 2);
    assert.equal(planH1.slices[0].title, "第一章：基础理论");
    assert.equal(planH1.slices[1].title, "第二章：系统实践");

    // 按 H2 分切：恰好分为 3 个小片（三节）
    const planH2 = planDocSlices(outline, { headingLevel: 2, totalWords: 6000, totalMinutes: 15 });
    assert.equal(planH2.totalSlices, 3);
    assert.equal(planH2.slices[0].title, "1.1 认知机制");
    assert.equal(planH2.slices[1].title, "1.2 实验结论");
    assert.equal(planH2.slices[2].title, "2.1 架构设计");
});

test("formatSliceMarkdown 生成包含标准思源块引用与原长文链接的内容", () => {
    const slice = {
        index: 1,
        title: "第 1 片：一、前言与背景",
        startBlockId: "20261027120000-blk0001",
        sectionIds: ["20261027120000-blk0001"],
        sectionTitles: ["一、前言与背景", "1.1 发展历程"],
        estimatedWords: 1500,
        estimatedMinutes: 4,
    };

    const md = formatSliceMarkdown(slice, "深度长文标题", "20261027120000-doc0001", "https://example.com/article");
    assert.ok(md.includes("# 第 1 片：一、前言与背景"));
    assert.ok(md.includes("siyuan://blocks/20261027120000-doc0001"));
    assert.ok(md.includes("((20261027120000-blk0001 '点击直达正文小节'))"));
    assert.ok(md.includes("https://example.com/article"));
    assert.ok(md.includes("1.1 发展历程"));
});

test("buildSliceStartMap 构建起始块映射索引", () => {
    const slices = [
        { index: 1, title: "切片1", startBlockId: "blk-1", sectionIds: ["blk-1"], sectionTitles: ["T1"], estimatedWords: 100, estimatedMinutes: 1 },
        { index: 2, title: "切片2", startBlockId: "blk-2", sectionIds: ["blk-2"], sectionTitles: ["T2"], estimatedWords: 200, estimatedMinutes: 2 },
    ];
    const map = buildSliceStartMap(slices);
    assert.equal(map.size, 2);
    assert.equal(map.get("blk-1")?.index, 1);
    assert.equal(map.get("blk-2")?.index, 2);
    assert.equal(map.get("non-exist"), undefined);
});

test("buildOutlineMindmapMarkdown 生成挂载 custom-sy-list-mindmap 的思源原生思维导图 Markdown", () => {
    const outline = [
        { id: "blk-h1", title: "核心论点", level: 1, depth: 1, count: 100 },
        { id: "blk-h2-1", title: "实践方法A", level: 2, depth: 2, count: 50 },
        { id: "blk-h2-2", title: "实践方法B", level: 2, depth: 2, count: 50 },
    ];
    const md = buildOutlineMindmapMarkdown("大模型架构思考", "20261027120000-doc0001", outline);
    assert.ok(md.includes('# 《大模型架构思考》· 思维导图'));
    assert.ok(md.includes('{: custom-sy-list-mindmap="true" }'));
    assert.ok(md.includes('- 🧠 大模型架构思考'));
    assert.ok(md.includes("  - 核心论点 (( blk-h1 '直达正文' ))"));
    assert.ok(md.includes("    - 实践方法A (( blk-h2-1 '直达正文' ))"));
    assert.ok(md.includes("    - 实践方法B (( blk-h2-2 '直达正文' ))"));
});
