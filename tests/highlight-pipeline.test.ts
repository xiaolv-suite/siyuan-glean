import test from "node:test";
import assert from "node:assert/strict";
import {
    stripHtmlTags,
    normalizeFlashcardTags,
    buildHighlightFlashcardPayload,
    formatFlashcardMarkdown,
} from "../src/domain/highlight-pipeline.ts";

test("highlight-pipeline: stripHtmlTags 准确剥离 HTML 标签、解码实体并净化空白", () => {
    assert.equal(stripHtmlTags(""), "");
    assert.equal(
        stripHtmlTags("<span data-type=\"mark\">核心&nbsp;<strong>要点</strong></span>"),
        "核心 要点"
    );
    assert.equal(
        stripHtmlTags("<p>换行测试\r\n\n   多余空格   </p>"),
        "换行测试 多余空格"
    );
    assert.equal(
        stripHtmlTags("特殊&lt;符号&gt;&amp;&quot;引述&#39;"),
        '特殊<符号>&"引述\''
    );
});

test("highlight-pipeline: normalizeFlashcardTags 继承文章标签并自动补充 #来自拾遗", () => {
    assert.deepEqual(normalizeFlashcardTags([]), ["来自拾遗"]);
    assert.deepEqual(normalizeFlashcardTags(["#深度阅读", "AI技术", "#深度阅读"]), [
        "深度阅读",
        "AI技术",
        "来自拾遗",
    ]);
});

test("highlight-pipeline: buildHighlightFlashcardPayload 组装标准跨端载荷与深链", () => {
    const payload = buildHighlightFlashcardPayload({
        highlightText: "<mark>跨端自协商通知架构是未来基石</mark>",
        contextText: "在去中心化体系中，跨端自协商通知架构是未来基石，必须严格保持解耦。",
        sourceBlockId: "20261104100000-abcd123",
        sourceTitle: "小驴全家桶架构演进",
        docTags: ["架构设计", "#体系"],
    });

    // 正面核心语句纯文本化
    assert.equal(payload.front, "跨端自协商通知架构是未来基石");

    // 背面包含上下文 + 来源文章标题 + 思源深链
    assert.ok(payload.back.includes("在去中心化体系中，跨端自协商通知架构是未来基石，必须严格保持解耦。"));
    assert.ok(payload.back.includes("来源：《小驴全家桶架构演进》"));
    assert.ok(payload.back.includes("(( 20261104100000-abcd123 '查看文章原块' ))"));

    // 标签继承
    assert.deepEqual(payload.tags, ["架构设计", "体系", "来自拾遗"]);
    assert.equal(payload.sourceBlockId, "20261104100000-abcd123");
    assert.equal(payload.sourceTitle, "小驴全家桶架构演进");
});

test("highlight-pipeline: formatFlashcardMarkdown 格式化降级复制文本", () => {
    const payload = buildHighlightFlashcardPayload({
        highlightText: "知识飞轮第一公里",
        sourceBlockId: "20261104120000-xyz9876",
        sourceTitle: "读书方法论",
        docTags: ["方法"],
    });

    const md = formatFlashcardMarkdown(payload);
    assert.ok(md.includes("# 拾遗闪卡"));
    assert.ok(md.includes("## 正面 (Front)\n知识飞轮第一公里"));
    assert.ok(md.includes("## 背面 (Back)"));
    assert.ok(md.includes("来源：《读书方法论》 (( 20261104120000-xyz9876 '查看文章原块' ))"));
    assert.ok(md.includes("标签: #方法 #来自拾遗"));
});
