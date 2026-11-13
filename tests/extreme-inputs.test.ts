import test from "node:test";
import assert from "node:assert/strict";
import { formatCitation, formatGBT7714, formatBibTeX, formatAPA, formatMLA } from "../src/domain/citation.ts";
import { countWords, estimateMinutes } from "../src/domain/schema.ts";
import { filterCompletedItems, aggregateStats } from "../src/domain/stats.ts";
import { pickRoamingArticle } from "../src/domain/roaming.ts";
import { cleanWechatArticleUrl, isWechatUrl } from "../src/domain/wechat.ts";

test("极端输入：空字符串与只有空白的元数据著录", () => {
    const item = {
        id: "",
        title: "",
        author: "   ",
        site: "",
        url: "",
        time: "",
    };
    const gbt = formatGBT7714(item);
    const bib = formatBibTeX(item);
    const apa = formatAPA(item);
    const mla = formatMLA(item);

    assert.ok(typeof gbt === "string" && gbt.length > 0);
    assert.ok(typeof bib === "string" && bib.includes("@article"));
    assert.ok(typeof apa === "string" && apa.length > 0);
    assert.ok(typeof mla === "string" && mla.length > 0);
});

test("极端输入：超长文本（10000字标题与摘要）", () => {
    const superLongTitle = "超长标题".repeat(1000);
    const superLongAuthor = "超长作者".repeat(200);
    const item = {
        id: "20261029120000-long001",
        title: superLongTitle,
        author: superLongAuthor,
        site: "example.com",
        url: "https://example.com/long",
        time: "20261029120000",
    };
    const bib = formatBibTeX(item);
    assert.ok(bib.includes("@article{"));
    const words = countWords(superLongTitle);
    assert.ok(words > 3000);
    const mins = estimateMinutes(words);
    assert.ok(mins > 5);
});

test("极端输入：Emoji 与多语言混合标点符号", () => {
    const complexTitle = "🌟【深度】AI & Web3：如何看待“智能体”革命？——从GPT到Claude (2026最新) 🔥";
    const author = "小驴 🫏 · Alex “The Builder” & Co.";
    const item = {
        id: "20261029120000-emoji01",
        title: complexTitle,
        author,
        site: "mp.weixin.qq.com",
        url: "https://mp.weixin.qq.com/s/test?utm_source=foo#anchor",
        time: "20261029120000",
    };
    const gbt = formatGBT7714(item);
    const mla = formatMLA(item);
    assert.ok(gbt.includes("🌟【深度】"));
    assert.ok(mla.includes("Alex"));
});

test("极端输入：极值与零值字数耗时计算", () => {
    assert.equal(estimateMinutes(0), 0); // 无字数时为 0
    assert.equal(estimateMinutes(-100), 0);
    assert.equal(estimateMinutes(NaN), 0);
    assert.equal(estimateMinutes(Infinity), 0);
    assert.equal(estimateMinutes(100), 1); // 有字数时最少 1 分钟
    assert.equal(estimateMinutes(999999999), 2500000);
});

test("极端输入：微信链接清洗抗畸形输入", () => {
    assert.equal(cleanWechatArticleUrl(""), "");
    assert.equal(cleanWechatArticleUrl("https://example.com/not-wechat"), "https://example.com/not-wechat");
    const wechatUrl = "https://mp.weixin.qq.com/s?__biz=MzA4Nz&mid=26&idx=1&sn=abc123456&chksm=789#rd";
    const cleaned = cleanWechatArticleUrl(wechatUrl);
    assert.ok(!cleaned.includes("chksm="));
    assert.ok(cleaned.includes("__biz=MzA4Nz"));
});

test("极端输入：漫游盲盒候选池为空、仅一条数据、全部已读", () => {
    // 空候选池
    const pickEmpty = pickRoamingArticle([]);
    assert.equal(pickEmpty, null);

    // 仅一条数据且已读
    const doneItem = {
        id: "20261029120000-done001",
        title: "已读好文",
        status: "done" as const,
        time: "20261029120000",
    };
    const pickDoneOnly = pickRoamingArticle([doneItem]);
    assert.equal(pickDoneOnly, null); // 默认不漫游已读

    // 仅一条未读数据
    const unreadItem = {
        id: "20261029120000-read001",
        title: "未读文章",
        status: "later" as const,
        time: "20261029120000",
        priority: 5,
        rating: 5,
    };
    const pickOne = pickRoamingArticle([unreadItem]);
    assert.ok(pickOne !== null);
    assert.equal(pickOne?.item.id, unreadItem.id);
});
