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

    const itemFav: RoamingCandidate = {
        id: "doc-4",
        title: "珍藏长文",
        status: "later",
        priority: 4,
        favorite: true,
    };
    const resFav = calculateRoamingScore(itemFav, 0);
    // 优先级 32 + 默认评分 18 + 收藏 19 + 随机 0 = 69
    assert.equal(resFav.score, 69);
    assert.equal(resFav.reason, "❤️ 珍藏精选 · 值得重读");
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

test("pickRoamingArticle 支持 RoamingTimeBudget 时间预算（short/medium/long）精确定向挑选", () => {
    const pool: RoamingCandidate[] = [
        { id: "doc-short", title: "3分钟速读", status: "later", priority: 3, minutes: 3 },
        { id: "doc-medium", title: "10分钟中篇", status: "later", priority: 3, minutes: 10 },
        { id: "doc-long", title: "30分钟长文", status: "later", priority: 3, minutes: 30 },
    ];

    const pickShort = pickRoamingArticle(pool, { timeBudget: "short", random: () => 0 });
    assert.ok(pickShort);
    assert.equal(pickShort.item.id, "doc-short");

    const pickMedium = pickRoamingArticle(pool, { timeBudget: "medium", random: () => 0 });
    assert.ok(pickMedium);
    assert.equal(pickMedium.item.id, "doc-medium");

    const pickLong = pickRoamingArticle(pool, { timeBudget: "long", random: () => 0 });
    assert.ok(pickLong);
    assert.equal(pickLong.item.id, "doc-long");

    // 不限时间 budget='all'
    const pickAll = pickRoamingArticle(pool, { timeBudget: "all", random: () => 0 });
    assert.ok(pickAll);
});

test("pickRoamingArticle 支持 tag 专属主题定向漫游与时间预算复合约束", () => {
    const pool: RoamingCandidate[] = [
        { id: "doc-ai", title: "AI大模型短文", status: "later", priority: 3, minutes: 4, tags: ["AI"] },
        { id: "doc-web", title: "前端开发长文", status: "later", priority: 3, minutes: 20, tags: ["前端"] },
        { id: "doc-ai-long", title: "AI深度研报", status: "later", priority: 4, minutes: 25, tags: ["AI"] },
    ];

    // 仅按 tag='AI' 漫游
    const pickAi = pickRoamingArticle(pool, { tag: "AI", random: () => 0 });
    assert.ok(pickAi);
    assert.ok(pickAi.item.tags?.includes("AI"));

    // 复合约束：tag='AI' 且 timeBudget='short'，应精准命中 doc-ai
    const pickAiShort = pickRoamingArticle(pool, { tag: "AI", timeBudget: "short", random: () => 0 });
    assert.ok(pickAiShort);
    assert.equal(pickAiShort.item.id, "doc-ai");

    // 不存在的 tag 返回 null
    const pickUnknown = pickRoamingArticle(pool, { tag: "未知标签", random: () => 0 });
    assert.equal(pickUnknown, null);
});

test("pickRoamingArticle 支持 favoriteOnly 仅漫游星标好文（T-3514）", () => {
    const pool: RoamingCandidate[] = [
        { id: "doc-1", title: "普通文章", status: "later", priority: 5, favorite: false },
        { id: "doc-2", title: "珍藏好文", status: "later", priority: 3, favorite: true },
    ];
    const pick = pickRoamingArticle(pool, { favoriteOnly: true, random: () => 0 });
    assert.ok(pick);
    assert.equal(pick.item.id, "doc-2");

    // 若无收藏文章则返回 null
    const pickNone = pickRoamingArticle([{ id: "doc-1", title: "普通文章", status: "later" }], { favoriteOnly: true });
    assert.equal(pickNone, null);
});

test("pickRoamingArticle 支持 highRatingPriority 高星级与评分加权高频重浮（BL-36）", () => {
    const pool: RoamingCandidate[] = [
        { id: "doc-low", title: "普通文章", status: "later", priority: 3, rating: 2 },
        { id: "doc-high", title: "五星精读", status: "later", priority: 3, rating: 5 },
    ];
    // 开启高星级优先加权时，评分 5 星的文章获得显著加分并被挑中
    const pick = pickRoamingArticle(pool, { highRatingPriority: true, random: () => 0 });
    assert.ok(pick);
    assert.equal(pick.item.id, "doc-high");
    assert.equal(pick.reason, "💖 高评分重温");
});
