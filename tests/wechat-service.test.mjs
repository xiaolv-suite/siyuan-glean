import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "siyuan") return { url: "glean-wechat:siyuan", shortCircuit: true };
        if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === "glean-wechat:siyuan") return { format: "module", source: "export const fetchSyncPost = (...args) => globalThis.__gleanWechatPost?.(...args) ?? Promise.resolve({}); export const getFrontend = () => 'desktop';", shortCircuit: true };
        return nextLoad(url, context);
    },
});

const { scanAndFillWechatAuthor, batchRecognizeWechatAuthors } = await import("../src/services/wechat-service.ts");

test("scanAndFillWechatAuthor：从传入的正文或 DOM 片段精准提取微信公众号并回填作者", async () => {
    const written = [];
    globalThis.__gleanWechatPost = async (route, body) => {
        if (route === "/api/attr/getBlockAttrs") return { code: 0, data: {} };
        if (route === "/api/attr/setBlockAttrs") {
            written.push(body);
            return { code: 0, data: null };
        }
        return { code: 0, data: null };
    };

    const fakePlugin = {
        loadData: async () => ({ version: 1, updatedAt: new Date().toISOString(), clips: {}, candidates: {} }),
        saveData: async () => {},
    };
    const markdown = `# 行业重磅动态
<div class="rich_media_meta_list">
    <a href="javascript:void(0);" id="js_name">量子位</a>
</div>
这是一篇关于 AI 大模型的深度报道。`;

    const detected = await scanAndFillWechatAuthor(fakePlugin, "20261025120000-wechat1", {
        url: "https://mp.weixin.qq.com/s/sample123",
        markdown,
    });

    assert.equal(detected, "量子位");
    assert.equal(written.length, 1);
    assert.equal(written[0].attrs["custom-clip-author"], "量子位");
});

test("batchRecognizeWechatAuthors：精准过滤已有作者或非微信文章，只针对未识别的微信文章进行批处理", async () => {
    const entries = [
        { id: "1", url: "https://mp.weixin.qq.com/s/1", author: "" },
        { id: "2", url: "https://mp.weixin.qq.com/s/2", author: "已有公众号" }, // 已有作者，跳过
        { id: "3", site: "mp.weixin.qq.com", author: "  " }, // 无前缀 site 微信文章，待处理
        { id: "4", url: "https://zhihu.com/p/123", author: "" }, // 非微信文章，跳过
    ];

    const fakePlugin = {};
    const progressLog = [];

    const result = await batchRecognizeWechatAuthors(fakePlugin, entries, (processed, total, count) => {
        progressLog.push({ processed, total, count });
    });

    // 应该只筛选出 id: 1 和 id: 3 两篇目标
    assert.equal(result.processed, 2);
    assert.equal(progressLog.length, 2);
    assert.equal(progressLog[0].total, 2);
});

test("InboxSection 契约守门：不可用时静默隐藏，消除读库首屏错误横条", () => {
    const source = fs.readFileSync(new URL("../src/ui/InboxSection.svelte", import.meta.url), "utf8");
    // 严格确保不再包含 inboxCheckFailed 渲染分支
    assert.doesNotMatch(source, /\{#if checked && inboxCheckFailed\}/);
    assert.match(source, /\{#if checked && available\}/);
});

test("DockPanel 读库工作台接入自动识别微信公众号横条与单卡快速识别动作", () => {
    const dock = fs.readFileSync(new URL("../src/ui/DockPanel.svelte", import.meta.url), "utf8");
    assert.match(dock, /startBatchWechatScan/);
    assert.match(dock, /glean-wechat-banner/);
    assert.match(dock, /\{t\(i18n, "wechat\.unrecognizedBanner",/);
    assert.match(dock, /\{t\(i18n, "wechat\.recognizeSingle"\)\}/);
});

test("WorkbenchPreview 预览区接入微信公众号自动强行识别", () => {
    const preview = fs.readFileSync(new URL("../src/ui/WorkbenchPreview.svelte", import.meta.url), "utf8");
    assert.match(preview, /autoDetectWechatAuthor/);
    assert.match(preview, /scanAndFillWechatAuthor/);
});
