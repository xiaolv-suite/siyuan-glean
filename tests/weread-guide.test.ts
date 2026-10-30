import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { wechatArticleToWereadUrl, cleanWechatArticleUrl, isWechatUrl } from "../src/domain/wechat.ts";

test("wechatArticleToWereadUrl 契约守门：绝不拼接外部 URL 导致 404，安全引导至微信读书书架", () => {
    const rawWechatUrl = "https://mp.weixin.qq.com/s/abcdef123456?chksm=999&scene=21";
    assert.equal(isWechatUrl(rawWechatUrl), true);
    const wereadUrl = wechatArticleToWereadUrl(rawWechatUrl);
    assert.equal(wereadUrl, "https://weread.qq.com/web/shelf");
    assert.equal(wechatArticleToWereadUrl("https://example.com/not-wechat"), null);
    assert.equal(wechatArticleToWereadUrl(""), null);
});

test("WeReadGuideDialog 契约守门：三步流转引导、纯净短链复制与思源纯净阅读保底", () => {
    const dialogSource = fs.readFileSync(new URL("../src/ui/WeReadGuideDialog.svelte", import.meta.url), "utf8");
    assert.match(dialogSource, /cleanWechatArticleUrl/);
    assert.match(dialogSource, /navigator\.clipboard\.writeText/);
    assert.match(dialogSource, /https:\/\/weread\.qq\.com\/web\/shelf/);
    assert.match(dialogSource, /facade\.openReadingDocument/);
    assert.match(dialogSource, /wechat\.step1Title/);
    assert.match(dialogSource, /wechat\.step2Title/);
    assert.match(dialogSource, /wechat\.step3Title/);
    assert.match(dialogSource, /wechat\.localReaderOption/);
    assert.match(dialogSource, /onKeyDown/);
    assert.match(dialogSource, /if \(e\.repeat\) return;/);
    assert.match(dialogSource, /e\.key === "c" \|\| e\.key === "C"/);
    assert.match(dialogSource, /e\.key === "Enter"/);
    assert.match(dialogSource, /e\.key === "r" \|\| e\.key === "R"/);
    assert.match(dialogSource, /glean-kbdhint/);
    assert.match(dialogSource, /<kbd>C<\/kbd>/);
    assert.match(dialogSource, /<kbd>Enter<\/kbd>/);
    assert.match(dialogSource, /<kbd>R<\/kbd>/);
    assert.match(dialogSource, /<kbd>Esc<\/kbd>/);
});

test("WorkbenchPreview 与 ReaderTab 契约守门：全场景接入微信读书向导与纯净阅读", () => {
    const previewSource = fs.readFileSync(new URL("../src/ui/WorkbenchPreview.svelte", import.meta.url), "utf8");
    assert.match(previewSource, /openWeReadGuideDialog/);
    assert.match(previewSource, /glean-preview__source-link--weread/);
    assert.match(previewSource, /reading\.openInReader/);

    const readerSource = fs.readFileSync(new URL("../src/ui/ReaderTab.svelte", import.meta.url), "utf8");
    assert.match(readerSource, /openWeReadGuideDialog/);
    assert.match(readerSource, /openWeread/);
});

test("双语 i18n 覆盖：微信读书向导文案全集合对齐", () => {
    const zh = JSON.parse(fs.readFileSync(new URL("../public/i18n/zh_CN.json", import.meta.url), "utf8"));
    const en = JSON.parse(fs.readFileSync(new URL("../public/i18n/en_US.json", import.meta.url), "utf8"));
    const keys = [
        "wechat.wereadGuideTitle",
        "wechat.wereadGuideDesc",
        "wechat.step1Title",
        "wechat.step1Desc",
        "wechat.copyCleanLink",
        "wechat.copiedLink",
        "wechat.step2Title",
        "wechat.step2Desc",
        "wechat.step2DescAuthor",
        "wechat.step3Title",
        "wechat.step3Desc",
        "wechat.openWereadShelf",
        "wechat.localReaderOption",
        "wechat.localReaderDesc",
        "wechat.openLocalReader",
    ];
    for (const key of keys) {
        assert.ok(typeof zh[key] === "string" && zh[key].length > 0, `zh_CN missing ${key}`);
        assert.ok(typeof en[key] === "string" && en[key].length > 0, `en_US missing ${key}`);
    }
});
