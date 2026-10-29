import test from "node:test";
import assert from "node:assert/strict";
import { formatBibTeX, formatGBT7714, formatAPA, formatMLA, formatCitation, citationSuccessKey, type CitationItem } from "../src/domain/citation.ts";

const sample: CitationItem = {
    id: "20261025120000-doc0001",
    title: "大语言模型分布式训练系统架构",
    author: "机器之心",
    site: "微信公众平台",
    url: "https://mp.weixin.qq.com/s/sample123",
    time: "20261025120000",
};

test("formatBibTeX：生成标准 BibTeX @article 著录", () => {
    const bib = formatBibTeX(sample);
    assert.ok(bib.startsWith("@article{"));
    assert.ok(bib.includes("title = {大语言模型分布式训练系统架构}"));
    assert.ok(bib.includes("author = {机器之心}"));
    assert.ok(bib.includes("journal = {微信公众平台}"));
    assert.ok(bib.includes("year = {2026}"));
    assert.ok(bib.includes("url = {https://mp.weixin.qq.com/s/sample123}"));
});

test("formatGBT7714：生成 GB/T 7714 电子文献标准格式", () => {
    const gbt = formatGBT7714(sample, new Date("2026-10-27T12:00:00Z"));
    assert.equal(
        gbt,
        "机器之心. 大语言模型分布式训练系统架构[EB/OL]. 微信公众平台, 2026-10-25[2026-10-27]. https://mp.weixin.qq.com/s/sample123"
    );
});

test("formatAPA：生成 APA 规范引用", () => {
    const apa = formatAPA(sample);
    assert.equal(
        apa,
        "机器之心. (2026). 大语言模型分布式训练系统架构. 微信公众平台. https://mp.weixin.qq.com/s/sample123"
    );
});

test("formatMLA：生成 MLA 规范引用（Modern Language Association 9th Edition）", () => {
    const mla = formatMLA(sample);
    assert.equal(
        mla,
        '机器之心. "大语言模型分布式训练系统架构." 微信公众平台, 2026-10-25. https://mp.weixin.qq.com/s/sample123'
    );
});

test("formatCitation：统一门面纯函数支持 gbt / bibtex / apa / mla 四种格式分发", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    assert.equal(formatCitation(sample, "gbt", now), formatGBT7714(sample, now));
    assert.equal(formatCitation(sample, "bibtex"), formatBibTeX(sample));
    assert.equal(formatCitation(sample, "apa"), formatAPA(sample));
    assert.equal(formatCitation(sample, "mla"), formatMLA(sample));
    // 默认回退为 gbt
    assert.equal(formatCitation(sample), formatGBT7714(sample));
});

test("citationSuccessKey：返回各学术著录格式对应的成功提示键名", () => {
    assert.equal(citationSuccessKey("gbt"), "citation.gbtCopied");
    assert.equal(citationSuccessKey("bibtex"), "citation.bibtexCopied");
    assert.equal(citationSuccessKey("apa"), "citation.apaCopied");
    assert.equal(citationSuccessKey("mla"), "citation.mlaCopied");
});

test("formatGBT7714：非法 Date 对象安全兜底，不抛出 RangeError 异常", () => {
    const invalidDate = new Date(Number.NaN);
    assert.doesNotThrow(() => {
        const result = formatGBT7714(sample, invalidDate);
        assert.ok(result.includes("机器之心"));
    });
});
