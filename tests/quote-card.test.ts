import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    QUOTE_CARD_THEMES,
    formatQuoteCardAttribution,
    formatQuoteShareText,
    type QuoteCardSource,
} from "../src/domain/quote-card.ts";

test("QUOTE_CARD_THEMES：包含四种主流设计主题", () => {
    assert.equal(QUOTE_CARD_THEMES.length, 4);
    const keys = QUOTE_CARD_THEMES.map((theme) => theme.key);
    assert.deepEqual(keys, ["teal", "paper", "obsidian", "minimal"]);
});

test("formatQuoteCardAttribution：规范化组合标题与作者", () => {
    assert.equal(formatQuoteCardAttribution("深度思考", "李开复"), "—— 《深度思考》 · 李开复");
    assert.equal(formatQuoteCardAttribution("经济学原理", "", "豆瓣读书"), "—— 《经济学原理》 · 豆瓣读书");
    assert.equal(formatQuoteCardAttribution("", "鲁迅"), "—— 鲁迅");
    assert.equal(formatQuoteCardAttribution("", "", ""), "");
});

test("formatQuoteShareText：生成包含引言与出处的分享文本", () => {
    const source: QuoteCardSource = {
        quote: "人生苦短，我用 Python。",
        title: "编程随想",
        author: "Guido",
        blockId: "20261020100000-blk1234",
    };
    assert.equal(source.blockId, "20261020100000-blk1234");
    const text = formatQuoteShareText(source);
    assert.match(text, /“人生苦短，我用 Python。”/);
    assert.match(text, /—— 《编程随想》 · Guido/);
});

test("QuoteCardDialog 键盘流与块引用支持契约（T-3511）", () => {
    const dialog = fs.readFileSync(new URL("../src/ui/QuoteCardDialog.svelte", import.meta.url), "utf8");
    assert.match(dialog, /<svelte:window onkeydown=\{onKeyDown\} \/>/);
    assert.match(dialog, /e\.key === "1"/);
    assert.match(dialog, /e\.key === "2"/);
    assert.match(dialog, /e\.key === "3"/);
    assert.match(dialog, /e\.key === "4"/);
    assert.match(dialog, /copyCardImage\(\)/);
    assert.match(dialog, /saveCardImage\(\)/);
    assert.match(dialog, /copyCardText\(\)/);
    assert.match(dialog, /copyCardBlockRef\(\)/);
    assert.match(dialog, /copyCardCitation\(\)/);
    assert.match(dialog, /<kbd>1-4<\/kbd>/);
    assert.match(dialog, /<kbd>C<\/kbd>/);
    assert.match(dialog, /<kbd>S<\/kbd>/);
    assert.match(dialog, /<kbd>Y<\/kbd>/);
    assert.match(dialog, /<kbd>Alt\+C<\/kbd>/);
});
