import test from "node:test";
import assert from "node:assert/strict";
import {
    DEFAULT_AUTO_TRIAGE_RULES,
    matchesAutoTriageRule,
    evaluateAutoTriage,
    alignTagsWithVocabulary,
    type AutoTriageRule,
} from "../src/domain/auto-triage.ts";
import { calculateSnapshotHealth } from "../src/domain/snapshot-health.ts";
import { parseEnrichResponse } from "../src/domain/enrich.ts";
import { resolveLibraryShortcut } from "../src/domain/library-keyboard.ts";
import { readerShortcut } from "../src/domain/reader-shortcuts.ts";

test("DEFAULT_AUTO_TRIAGE_RULES：包含微信、学术论文、深度长文与碎片速读分拣规则", () => {
    assert.equal(DEFAULT_AUTO_TRIAGE_RULES.length, 4);
    const ids = DEFAULT_AUTO_TRIAGE_RULES.map((r) => r.id);
    assert.deepEqual(ids, ["rule-wechat", "rule-academic", "rule-deep-read", "rule-quick-read"]);
});

test("matchesAutoTriageRule：按域名、关键词、时长与字数精准匹配", () => {
    const wechatRule = DEFAULT_AUTO_TRIAGE_RULES.find((r) => r.id === "rule-wechat")!;
    assert.equal(matchesAutoTriageRule(wechatRule, { url: "https://mp.weixin.qq.com/s/abc1234" }), true);
    assert.equal(matchesAutoTriageRule(wechatRule, { url: "https://example.com/post" }), false);

    const academicRule = DEFAULT_AUTO_TRIAGE_RULES.find((r) => r.id === "rule-academic")!;
    assert.equal(matchesAutoTriageRule(academicRule, { url: "https://arxiv.org/abs/2401.0001", title: "Attention Is All You Need" }), true);
    assert.equal(matchesAutoTriageRule(academicRule, { url: "https://blog.com/post", title: "机器学习顶会论文速览" }), true);
    assert.equal(matchesAutoTriageRule(academicRule, { url: "https://blog.com/post", title: "日常随笔" }), false);

    const deepRule = DEFAULT_AUTO_TRIAGE_RULES.find((r) => r.id === "rule-deep-read")!;
    assert.equal(matchesAutoTriageRule(deepRule, { words: 8000, estimatedMinutes: 20 }), true);
    assert.equal(matchesAutoTriageRule(deepRule, { words: 1200, estimatedMinutes: 3 }), false);
    assert.equal(matchesAutoTriageRule(deepRule, { url: "https://example.com/unknown-len" }), false);

    const quickRule = DEFAULT_AUTO_TRIAGE_RULES.find((r) => r.id === "rule-quick-read")!;
    assert.equal(matchesAutoTriageRule(quickRule, { words: 300, estimatedMinutes: 2 }), true);
    assert.equal(matchesAutoTriageRule(quickRule, { url: "https://example.com/unknown-len" }), false);
});

test("evaluateAutoTriage：未知时长与字数的外部导入条目不误触发时长分拣规则（防标签污染）", () => {
    const unknownLen = evaluateAutoTriage({
        url: "https://example.com/bookmark",
        title: "普通收藏链接",
        site: "example.com",
        currentStatus: "inbox",
        currentTags: ["技术"],
    });
    assert.equal(unknownLen.status, "inbox");
    assert.deepEqual(unknownLen.tags, ["技术"]);
    assert.deepEqual(unknownLen.matchedRuleIds, []);
});

test("evaluateAutoTriage：多规则加权评估，自动推导初始五态与标签追加", () => {
    // 微信深度长文：命中微信规则与深度长文规则
    const resWechatDeep = evaluateAutoTriage({
        url: "https://mp.weixin.qq.com/s/xyz",
        title: "万字长文解读分布式架构",
        words: 7000,
        estimatedMinutes: 18,
    });
    assert.equal(resWechatDeep.status, "later"); // 深度长文自动转稍后读
    assert.ok(resWechatDeep.tags.includes("微信"));
    assert.ok(resWechatDeep.tags.includes("深度长文"));

    // 学术论文：自动转 later，设置优先级 P3
    const resPaper = evaluateAutoTriage({
        url: "https://arxiv.org/abs/2601.1234",
        title: "Large Language Model Reasoning Paper",
    });
    assert.equal(resPaper.status, "later");
    assert.ok(resPaper.tags.includes("学术论文"));
    assert.equal(resPaper.appliedPriority, 3);

    // 碎片短讯：自动转 inbox，追加速读
    const resShort = evaluateAutoTriage({
        url: "https://news.ycombinator.com/item?id=123",
        title: "Quick Update",
        words: 300,
        estimatedMinutes: 1,
    });
    assert.equal(resShort.status, "inbox");
    assert.ok(resShort.tags.includes("速读"));
});

test("alignTagsWithVocabulary：对齐既有标签词表，杜绝大小写与近义词膨胀", () => {
    const existingVocab = ["JavaScript", "React", "人工智能", "Web 开发", "设计模式"];

    const rawSuggested = ["javascript", "REACT", "人工智能技术", "新奇独立词", "web 开发"];
    const aligned = alignTagsWithVocabulary(rawSuggested, existingVocab);

    // 必须复用已有大小写和标准术语
    assert.ok(aligned.includes("JavaScript"));
    assert.ok(aligned.includes("React"));
    assert.ok(aligned.includes("人工智能"));
    assert.ok(aligned.includes("Web 开发"));
    assert.ok(aligned.includes("新奇独立词"));
    assert.equal(aligned.length, 5);
});

test("parseEnrichResponse 接入既有词表复用对齐能力", () => {
    const rawAiResponse = JSON.stringify({
        summary: "这是一篇前端架构深度解析文章。",
        tags: ["typescript", "前端架构", "react"],
    });

    const vocab = ["TypeScript", "React", "Vue"];
    const result = parseEnrichResponse(rawAiResponse, vocab);
    assert.ok(result);
    assert.ok(result.tags.includes("TypeScript"));
    assert.ok(result.tags.includes("React"));
    assert.ok(result.tags.includes("前端架构"));
});

test("calculateSnapshotHealth：精准评估本地快照健康度与抗 404 防腐分值", () => {
    // 完整快照 + 充盈字数 -> 满分 100，健康绿盾
    const full = calculateSnapshotHealth({
        snapshot: true,
        words: 2500,
        hasBody: true,
    });
    assert.equal(full.score, 100);
    assert.equal(full.grade, "healthy");
    assert.equal(full.hasSnapshot, true);

    // 有正文但无独立快照 -> 良好黄盾
    const moderate = calculateSnapshotHealth({
        snapshot: false,
        words: 800,
        hasBody: true,
    });
    assert.ok(moderate.score >= 35 && moderate.score < 70);
    assert.equal(moderate.grade, "partial");

    // 仅外链无快照无正文 -> 缺失红盾
    const thin = calculateSnapshotHealth({
        snapshot: false,
        words: 0,
        hasBody: false,
    });
    assert.ok(thin.score < 35);
    assert.equal(thin.grade, "missing");
});

test("全键盘 Inbox Zero 极速分拣流：j/k/e/l 快捷键仲裁契约", () => {
    // 读库工作台按键：j 下移、k 上移、e 归档、l 稍后读
    assert.deepEqual(resolveLibraryShortcut({ key: "j" }, { cursorActive: true }), { type: "move", delta: 1 });
    assert.deepEqual(resolveLibraryShortcut({ key: "k" }, { cursorActive: true }), { type: "move", delta: -1 });
    assert.deepEqual(resolveLibraryShortcut({ key: "e" }, { cursorActive: true }), { type: "archive" });
    assert.deepEqual(resolveLibraryShortcut({ key: "l" }, { cursorActive: true }), { type: "later" });
    assert.deepEqual(resolveLibraryShortcut({ key: "a" }, { cursorActive: true }), { type: "later" });

    // 阅读器内单键：l 移入稍后读
    const readerKey = { mode: "read" as const, focused: true, blocked: false };
    assert.equal(readerShortcut({ ...readerKey, key: "l" }), "later");
    assert.equal(readerShortcut({ ...readerKey, key: "a" }), "later");
});
