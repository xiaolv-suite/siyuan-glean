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

const { scanAndFillWechatAuthor, batchRecognizeWechatAuthors, purifyWechatArticle } = await import("../src/services/wechat-service.ts");

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
<meta property="og:description" content="这是一篇关于大语言模型架构创新的深度独家报道。" />
收录于合集 #大模型深度前沿
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
    assert.equal(written[0].attrs["custom-clip-summary"], "这是一篇关于大语言模型架构创新的深度独家报道。");
    assert.match(written[0].attrs["custom-clip-ai-tags"], /大模型深度前沿/);
});

test("scanAndFillWechatAuthor：当传入 url 时仍必须完整保留文档存量 aiTags 与 summary（防止抹除数据）", async () => {
    const written = [];
    globalThis.__gleanWechatPost = async (route, body) => {
        if (route === "/api/attr/getBlockAttrs") {
            return {
                code: 0,
                data: {
                    "custom-clip-ai-tags": "自然语言处理,深度学习",
                    "custom-clip-summary": "既有核心摘要",
                },
            };
        }
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
    const markdown = `# 深度好文
收录于合集 #前沿算法
<div class="rich_media_meta_list"><a href="javascript:void(0);" id="js_name">机器之心</a></div>
正文段落。`;

    const detected = await scanAndFillWechatAuthor(fakePlugin, "20261025120000-wechat2", {
        url: "https://mp.weixin.qq.com/s/sample456",
        markdown,
    });

    assert.equal(detected, "机器之心");
    assert.equal(written.length, 1);
    assert.equal(written[0].attrs["custom-clip-author"], "机器之心");
    assert.equal(written[0].attrs["custom-clip-summary"], undefined);
    const savedAiTags = written[0].attrs["custom-clip-ai-tags"].split(",");
    assert.deepEqual(savedAiTags, ["自然语言处理", "深度学习", "前沿算法"]);
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

test("purifyWechatArticle：执行微信文章深度提纯与字数时长重新校准", async () => {
    const written = [];
    globalThis.__gleanWechatPost = async (route, body) => {
        if (route === "/api/export/exportMdContent") {
            return {
                code: 0,
                data: {
                    content: `# 微信文章标题
<img data-src="https://mmbiz.qpic.cn/img001.png" alt="配图" />
<div class="rich_media_meta_list"><a id="js_name">差评君</a></div>
<mp-common-profile nickname="差评君" desc="探索科技世界"></mp-common-profile>
正文核心内容段落。
点击上方蓝字关注我们
`,
                },
            };
        }
        if (route === "/api/attr/getBlockAttrs") {
            return {
                code: 0,
                data: {
                    "custom-clip-url": "https://mp.weixin.qq.com/s/sample001",
                    "custom-clip-status": "reading",
                },
            };
        }
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

    const res = await purifyWechatArticle(fakePlugin, "20261027120000-wechat2");
    assert.equal(res.ok, true);
    assert.equal(res.modified, true);
    assert.equal(res.author, "差评君");
    assert.ok(res.words > 0);
    assert.ok(written.length > 0);
});
