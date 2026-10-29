import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    QUOTE_CARD_THEMES,
    QUOTE_CARD_FONTS,
    resolveQuoteCardFont,
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

test("QUOTE_CARD_FONTS 与 resolveQuoteCardFont：包含三档字号与行高配置（T-3525）", () => {
    assert.deepEqual(resolveQuoteCardFont("sm"), QUOTE_CARD_FONTS.sm);
    assert.deepEqual(resolveQuoteCardFont("md"), QUOTE_CARD_FONTS.md);
    assert.deepEqual(resolveQuoteCardFont("lg"), QUOTE_CARD_FONTS.lg);
    assert.equal(resolveQuoteCardFont("md").fontSize, 17);
    assert.equal(resolveQuoteCardFont("sm").fontSize, 15);
    assert.equal(resolveQuoteCardFont("lg").fontSize, 21);
    // 非法值回退到 md
    // @ts-expect-error fallback test
    assert.deepEqual(resolveQuoteCardFont("unknown"), QUOTE_CARD_FONTS.md);
});

test("QuoteCardDialog 键盘流与块引用支持契约（T-3511 / T-3525）", () => {
    const dialog = fs.readFileSync(new URL("../src/ui/QuoteCardDialog.svelte", import.meta.url), "utf8");
    assert.match(dialog, /<svelte:window onkeydown=\{onKeyDown\} \/>/);
    assert.match(dialog, /e\.key === "1"/);
    assert.match(dialog, /e\.key === "2"/);
    assert.match(dialog, /e\.key === "3"/);
    assert.match(dialog, /e\.key === "4"/);
    assert.match(dialog, /copyCardImage\(\)/);
    assert.match(dialog, /saveCardImage\(\)/);
    assert.match(dialog, /quoteCard\.savedImage/);
    assert.match(dialog, /showMessage\(t\(i18n, "quoteCard\.savedImage"\)/);
    assert.match(dialog, /copyCardText\(\)/);
    assert.match(dialog, /copyCardBlockRef\(\)/);
    assert.match(dialog, /copyCardCitation\("gbt"\)/);
    assert.match(dialog, /copyCardCitation\("bibtex"\)/);
    assert.match(dialog, /copyCardCitation\("apa"\)/);
    assert.match(dialog, /copyCardCitation\("mla"\)/);
    assert.match(dialog, /activeFontSize/);
    assert.match(dialog, /showWatermark/);
    assert.match(dialog, /e\.key === "w"/);
    assert.match(dialog, /e\.key === "\["/);
    assert.match(dialog, /e\.key === "\]"/);
    assert.match(dialog, /glean-quote-card-font-btn/);
    assert.match(dialog, /glean-quote-card-wm-btn/);
    assert.match(dialog, /<kbd>1-4<\/kbd>/);
    assert.match(dialog, /<kbd>W<\/kbd>/);
    assert.match(dialog, /<kbd>C<\/kbd>/);
    assert.match(dialog, /<kbd>S<\/kbd>/);
    assert.match(dialog, /<kbd>Y<\/kbd>/);
    assert.match(dialog, /<kbd>Alt\+C<\/kbd>/);
});
