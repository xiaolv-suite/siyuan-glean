import test from "node:test";
import assert from "node:assert/strict";
import { calculateRoamingScore, pickRoamingArticle, type RoamingCandidate } from "../src/domain/roaming.ts";

test("calculateRoamingScore：综合计算重要度、评分、切片与随机扰动", () => {
    const itemSlice: RoamingCandidate = {
        id: "doc-1",
        title: "大模型切片1",
        status: "later",
        priority: 5,
        rating: 5,
        aiTags: ["渐进切片"],
    };
    const { score, reason } = calculateRoamingScore(itemSlice, 0.5);
    // 优先级 40 + 评分 30 + 切片 20 + 随机 5 = 95
    assert.equal(score, 95);
    assert.equal(reason, "✂️ 渐进切片 · 轻松读完");

    const itemShort: RoamingCandidate = {
        id: "doc-2",
        title: "短文",
        status: "inbox",
        priority: 3,
        minutes: 5,
    };
    const resShort = calculateRoamingScore(itemShort, 0);
    // 优先级 24 + 默认评分 18 + 短文 18 + 随机 0 = 60
    assert.equal(resShort.score, 60);
    assert.equal(resShort.reason, "⏱️ 5 分钟短篇 · 快速阅读");

    const itemReadPoint: RoamingCandidate = {
        id: "doc-3",
        title: "未读完长文",
        status: "later",
        priority: 4,
        readPoint: "20261028120000-xxxxxxx",
    };
    const resReadPoint = calculateRoamingScore(itemReadPoint, 0);
    // 优先级 32 + 默认评分 18 + 续读点 19 + 随机 0 = 69
    assert.equal(resReadPoint.score, 69);
    assert.equal(resReadPoint.reason, "🔖 断点续读 · 接续灵感");
});

test("pickRoamingArticle：在未读候选池中挑选最优漫游文章并支持排除项", () => {
    const pool: RoamingCandidate[] = [
        { id: "doc-a", title: "低优先长文", status: "later", priority: 1, minutes: 40 },
        { id: "doc-b", title: "高优先切片", status: "later", priority: 5, aiTags: ["渐进切片"] },
        { id: "doc-c", title: "已读归档项", status: "done", priority: 5 },
    ];

    // 确定性随机数函数 0.5
    const pick1 = pickRoamingArticle(pool, [], () => 0.5);
    assert.ok(pick1);
    assert.equal(pick1.item.id, "doc-b");

    // 排除 doc-b 之后，应挑中 doc-a（因为 doc-c 状态为 done 不入池）
    const pick2 = pickRoamingArticle(pool, ["doc-b"], () => 0.5);
    assert.ok(pick2);
    assert.equal(pick2.item.id, "doc-a");

    // 全排除后返回 null
    const pickNone = pickRoamingArticle(pool, ["doc-a", "doc-b"], () => 0.5);
    assert.equal(pickNone, null);
});
