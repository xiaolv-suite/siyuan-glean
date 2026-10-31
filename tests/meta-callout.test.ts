import test from "node:test";
import assert from "node:assert/strict";
import {
    buildMetaCalloutMarkdown,
    escapeMetaCalloutText,
    formatMetaStars,
    formatStatusLabel,
    META_CALLOUT_SLOT_KEY,
    META_CALLOUT_SLOT_VALUE,
    type MetaCalloutArticle,
} from "../src/domain/meta-callout.ts";

test("formatMetaStars：精确渲染星级评分", () => {
    assert.equal(formatMetaStars(0), "未评分");
    assert.equal(formatMetaStars(undefined), "未评分");
    assert.equal(formatMetaStars(1), "⭐");
    assert.equal(formatMetaStars(3), "⭐⭐⭐");
    assert.equal(formatMetaStars(5), "⭐⭐⭐⭐⭐");
    assert.equal(formatMetaStars(6), "⭐⭐⭐⭐⭐");
});

test("formatStatusLabel：准确映射五态文本", () => {
    assert.equal(formatStatusLabel("inbox"), "收集箱 (inbox)");
    assert.equal(formatStatusLabel("later"), "稍后读 (later)");
    assert.equal(formatStatusLabel("reading"), "阅读中 (reading)");
    assert.equal(formatStatusLabel("done"), "已读完 (done)");
    assert.equal(formatStatusLabel("archived"), "已归档 (archived)");
});

test("escapeMetaCalloutText：安全转义 Markdown 敏感字符并去除换行", () => {
    assert.equal(escapeMetaCalloutText("Hello [World]"), "Hello \\[World\\]");
    assert.equal(escapeMetaCalloutText("Line1\nLine2"), "Line1 Line2");
    assert.equal(escapeMetaCalloutText("Test *bold* _italic_"), "Test \\*bold\\* \\_italic\\_");
});

test("buildMetaCalloutMarkdown：构造包含元数据、反链、AI 摘要与 IAL 锚点的标准导读卡", () => {
    const article: MetaCalloutArticle = {
        id: "20261028120000-doc0001",
        title: "大模型推理优化工程实战",
        url: "https://example.com/posts/llm-inference",
        site: "Example Tech",
        author: "张工",
        status: "reading",
        priority: 2,
        rating: 4,
        words: 4800,
        minutes: 12,
        readMinutes: 5,
        tags: ["架构", "AI"],
        aiTags: ["大模型", "KV-Cache"],
        summary: "深入讲解了大模型在服务端部署时 KV Cache 的显存占用优化与 PagedAttention 算子实现机制。",
        readingPosition: {
            version: 1,
            blockId: "20261028120000-blk0088",
            offset: 0,
            at: "2026-10-28T12:30:00Z",
        },
    };

    const md = buildMetaCalloutMarkdown(article);

    // 导读标题
    assert.ok(md.includes("> 📌 **小驴拾遗 · 导读档案**"));
    // 来源与作者
    assert.ok(md.includes("[Example Tech](<https://example.com/posts/llm-inference>)"));
    assert.ok(md.includes("张工"));
    // 状态与评分
    assert.ok(md.includes("阅读中 (reading)"));
    assert.ok(md.includes("P2"));
    assert.ok(md.includes("⭐⭐⭐⭐"));
    // 体量与时长
    assert.ok(md.includes("4,800 字"));
    assert.ok(md.includes("12 分钟"));
    assert.ok(md.includes("5 分钟"));
    // 标签
    assert.ok(md.includes("#架构#"));
    assert.ok(md.includes("#AI#"));
    assert.ok(md.includes("#大模型#"));
    // AI 核心导读
    assert.ok(md.includes("> 💡 **AI 核心导读**：深入讲解了大模型在服务端部署时 KV Cache"));
    // 原生续读断点块引用反链
    assert.ok(md.includes("(( 20261028120000-blk0088 '点击直达正文续读位置' ))"));
    // 幂等属性锚点
    assert.ok(md.includes(`{: ${META_CALLOUT_SLOT_KEY}="${META_CALLOUT_SLOT_VALUE}" }`));
});

test("buildMetaCalloutMarkdown：处理边界空值与缺省字段", () => {
    const article: MetaCalloutArticle = {
        id: "20261028120000-doc0002",
    };

    const md = buildMetaCalloutMarkdown(article);
    assert.ok(md.includes("> 📌 **小驴拾遗 · 导读档案**"));
    assert.ok(md.includes("未记录"));
    assert.ok(md.includes(`{: ${META_CALLOUT_SLOT_KEY}="${META_CALLOUT_SLOT_VALUE}" }`));
    // 无 AI 摘要时不生成摘要行
    assert.ok(!md.includes("AI 核心导读"));
    // 无书签时不生成断点行
    assert.ok(!md.includes("续读断点"));
});
