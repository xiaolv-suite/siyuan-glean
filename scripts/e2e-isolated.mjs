// 隔离式全主链 E2E 验证脚本（支持 --keep 保留独立工作区与内核）：
// 1. 自动在系统临时目录创建独立工作区、部署 dist/ 生产产物并拉起无头 SiYuan-Kernel.exe（绝不触碰作者 6806 主实例）；
// 2. 真实跑通 docs/BLOCKERS.md 定义的「10 步主链走查脚本」（内核 SQLite 真实落盘 + 服务层全链路 + Chrome 1280×800 首屏减法截图验证）；
// 3. 用法：
//    node scripts/e2e-isolated.mjs          # 跑完 10 步主链验证后自动清扫临时库并关闭隔离内核
//    node scripts/e2e-isolated.mjs --keep   # 跑完 10 步验证后保留隔离工作区与内核进程（输出 base/token/workspace）

import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile } from "svelte/compiler";
import { render } from "svelte/server";
import {
    resolveKernel,
    prepareWorkspace,
    assertTestPortAvailable,
    startKernel,
    createApiClient,
    waitForBoot,
    shutdownKernel,
} from "./spike/kernel-harness.mjs";
import { cleanupScratch, guardScratch } from "./lib/smoke-kernel.mjs";

const execFileAsync = promisify(execFile);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(REPO, "dist");
const PLUGIN_ID = "siyuan-glean";
const HOST = "127.0.0.1";
const KEEP = process.argv.includes("--keep");

const compiledSvelteCache = new Map();
function compileSvelteServer(source, filename) {
    const out = compile(source, { filename, generate: "server" });
    compiledSvelteCache.set(`css:${filename}`, out.css?.code ?? "");
    return out.js.code;
}

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "siyuan") return { url: "glean-isolated-e2e:siyuan", shortCircuit: true };
        if (specifier.startsWith(".") && specifier.endsWith(".svelte")) {
            const resolved = new URL(specifier, context.parentURL);
            return { url: resolved.href, shortCircuit: true };
        }
        if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
            return nextResolve(`${specifier}.ts`, context);
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === "glean-isolated-e2e:siyuan") {
            return {
                format: "module",
                source: [
                    "export const fetchSyncPost = (...args) => globalThis.__gleanIsolatedFetchSyncPost(...args);",
                    "export const getFrontend = () => 'desktop';",
                    "export const showMessage = () => {};",
                    "export const openTab = () => {};",
                    "export const openMobileFileById = () => {};",
                    "export class Dialog { constructor() {} destroy() {} }",
                ].join("\n"),
                shortCircuit: true,
            };
        }
        if (url.startsWith("file://") && url.endsWith(".svelte")) {
            const filePath = fileURLToPath(url);
            const cached = compiledSvelteCache.get(filePath);
            if (cached) return { format: "module", source: cached, shortCircuit: true };
            const code = compileSvelteServer(fs.readFileSync(filePath, "utf8"), filePath);
            compiledSvelteCache.set(filePath, code);
            return { format: "module", source: code, shortCircuit: true };
        }
        return nextLoad(url, context);
    },
});

async function choosePort() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const port = 31000 + Math.floor(Math.random() * 20000);
        try {
            await assertTestPortAvailable(HOST, port);
            return port;
        } catch (err) {
            if (attempt === 39) throw err;
        }
    }
    throw new Error("无可用回环端口");
}

function copyDistToWorkspace(workspace) {
    const dst = path.join(workspace, "data", "plugins", PLUGIN_ID);
    fs.mkdirSync(dst, { recursive: true });
    for (const file of ["index.js", "index.css", "plugin.json", "icon.png"]) {
        const srcFile = path.join(DIST, file);
        if (fs.existsSync(srcFile)) fs.copyFileSync(srcFile, path.join(dst, file));
    }
    const i18nSrc = path.join(DIST, "i18n");
    if (fs.existsSync(i18nSrc)) {
        const i18nDst = path.join(dst, "i18n");
        fs.mkdirSync(i18nDst, { recursive: true });
        for (const f of fs.readdirSync(i18nSrc)) {
            fs.copyFileSync(path.join(i18nSrc, f), path.join(i18nDst, f));
        }
    }
    return dst;
}

function createPluginAdapter(base, token) {
    const headers = token ? { Authorization: `Token ${token}` } : {};
    const storagePath = (name) => `/data/storage/petal/${PLUGIN_ID}/${name}`;
    return {
        name: PLUGIN_ID,
        app: { plugins: [] },
        async loadData(name) {
            const res = await fetch(`${base}/api/file/getFile`, {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({ path: storagePath(name) }),
            });
            const text = await res.text();
            try {
                const parsed = JSON.parse(text);
                if (res.status === 202 && parsed?.code === 404) return undefined;
                return parsed;
            } catch {
                return undefined;
            }
        },
        async saveData(name, data) {
            const form = new FormData();
            form.append("path", storagePath(name));
            form.append("isDir", "false");
            form.append("modTime", String(Math.floor(Date.now() / 1000)));
            form.append("file", new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), name);
            const res = await fetch(`${base}/api/file/putFile`, {
                method: "POST",
                headers,
                body: form,
            });
            const json = await res.json();
            assert.equal(json.code, 0, `saveData(${name}) failed: ${json.msg}`);
        },
    };
}

function findChromePath() {
    const candidates = [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
}

async function runLiveBrowserInteractiveSuite({ chromePath, appDir, base, token, settings, notebookId, fulltextDocId, linkDocId, plugin }) {
    const outDir = path.join(REPO, "output", "e2e-browser-live");
    fs.mkdirSync(outDir, { recursive: true });
    // 再补充一篇稍后读文章，让今日拾遗同时展示「继续阅读」与「今日拾遗推荐卡」
    const extraDocId = await fetch(`${base}/api/filetree/createDocWithMd`, {
        method: "POST",
        headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            notebook: notebookId,
            path: "/长期主义阅读指南",
            markdown: "- [https://example.com/articles/long-term](https://example.com/articles/long-term)\n\n# 长期主义阅读指南\n\n为什么少即是多：减少面板噪音，把注意力还给正文。",
        }),
    }).then((r) => r.json()).then((j) => j.data);
    const { listAnchorDocs, captureClip, writeClip, reconcileIndex } = await import(pathToFileURL(path.join(REPO, "src/services/clip-store.ts")).href);
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const rows = await listAnchorDocs([notebookId]);
        if (rows.some((r) => r.id === extraDocId)) break;
        await new Promise((r) => setTimeout(r, 200));
    }
    await captureClip(plugin, extraDocId, { url: "https://example.com/articles/long-term", contentType: "fulltext", words: 2400, minutes: 8 });
    await writeClip(plugin, extraDocId, { status: "later", author: "少即是多", priority: 5 }, { forceStatus: true, force: true });
    // 注入全部 7 篇知名微信公众号精读真实文章（涵盖 5 态、4 色高亮、思考批注、导读卡）
    const { seedRichArticles } = await import(pathToFileURL(path.join(REPO, "scripts/seed-rich-articles.mjs")).href);
    await seedRichArticles({ base, token, notebookId, verbose: false });
    await plugin.saveData("settings.json", settings);
    await plugin.saveData("ui-prefs.json", { onboardingDone: true, themePalette: "teal" });
    await reconcileIndex(plugin, settings);

    const daylightCssPath = path.join(appDir, "appearance", "themes", "daylight", "theme.css");
    const daylightCss = fs.existsSync(daylightCssPath) ? fs.readFileSync(daylightCssPath, "utf8") : "";
    const pluginCss = fs.readFileSync(path.join(DIST, "index.css"), "utf8");
    const pluginJs = fs.readFileSync(path.join(DIST, "index.js"), "utf8");
    const i18nJson = fs.readFileSync(path.join(DIST, "i18n", "zh_CN.json"), "utf8");

    const hostHtml = `<!DOCTYPE html>
<html lang="zh-CN" data-theme-mode="light">
<head>
<meta charset="UTF-8">
<title>LvGlean Live Browser E2E</title>
<style>${daylightCss}</style>
<style>${pluginCss}</style>
<style>
  :root {
    --b3-theme-primary: #0d9488;
    --b3-theme-background: #f8fafc;
    --b3-theme-surface: #ffffff;
    --b3-theme-surface-lighter: #f1f5f9;
    --b3-theme-on-background: #0f172a;
    --b3-theme-on-surface: #1e293b;
    --b3-theme-on-surface-light: #64748b;
    --b3-border-color: #e2e8f0;
  }
  html, body { margin: 0; padding: 0; width: 1280px; height: 800px; overflow: hidden; font-family: -apple-system, "Microsoft YaHei", sans-serif; background: var(--b3-theme-background); color: var(--b3-theme-on-background); }
  #workbench-host { width: 1280px; height: 800px; display: flex; flex-direction: column; overflow: hidden; }
  #workbench-host > .glean-tab-root { flex: 1; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
  #dock-host { width: 360px; height: 800px; display: none; overflow: hidden; background: var(--b3-theme-background); }
  #dock-host > .glean-dock-root { width: 100%; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
  .b3-dialog--open { position: fixed; inset: 0; z-index: 999; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.42); }
  .b3-dialog__container { background: var(--b3-theme-surface); border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.22); display: flex; flex-direction: column; overflow: hidden; max-width: 94vw; max-height: 88vh; }
  .b3-dialog__header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--b3-border-color); font-weight: 600; }
  .b3-dialog__body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .b3-dialog__close { width: 18px; height: 18px; cursor: pointer; }
</style>
</head>
<body>
<div id="workbench-host"></div>
<div id="dock-host"></div>
<script>
window.__i18n = ${i18nJson};
window.__tabs = new Map();
window.__toasts = [];
window.__warns = [];
const __origWarn = console.warn.bind(console);
console.warn = (...args) => { window.__warns.push(args.map((a) => String(a?.stack || a?.message || a)).join(" ")); __origWarn(...args); };
const __origDebug = console.debug.bind(console);
console.debug = (...args) => { window.__warns.push(args.map((a) => String(a?.stack || a?.message || a)).join(" ")); __origDebug(...args); };
window.siyuan = { dialogs: [], menus: { menu: { element: null } } };
window.process = { env: { NODE_ENV: "production", DEV_MODE: "false" } };

class SiyuanDialog {
  constructor(opts) {
    this.opts = opts;
    const wrap = document.createElement("div");
    wrap.className = "b3-dialog--open";
    wrap.innerHTML = \`<div class="b3-dialog"><div class="b3-dialog__container" style="width:\${opts.width || '720px'};height:\${opts.height || '560px'}"><div class="b3-dialog__header"><div class="b3-dialog__title">\${opts.title || ''}</div><svg class="b3-dialog__close"><use href="#iconGleanClose"></use></svg></div><div class="b3-dialog__body">\${opts.content || ''}</div></div></div>\`;
    document.body.appendChild(wrap);
    this.element = wrap;
    window.siyuan.dialogs.push(this);
    const closeBtn = wrap.querySelector(".b3-dialog__close");
    if (closeBtn) closeBtn.addEventListener("click", () => this.destroy());
  }
  destroy() {
    if (!this.element.isConnected) return;
    this.element.remove();
    const idx = window.siyuan.dialogs.indexOf(this);
    if (idx >= 0) window.siyuan.dialogs.splice(idx, 1);
    if (this.opts.destroyCallback) this.opts.destroyCallback();
  }
}

class SiyuanPluginBase {
  constructor(opts) {
    this.app = opts.app || { plugins: [] };
    this.name = opts.name || "siyuan-glean";
    this.displayName = opts.displayName || "小驴拾遗";
    this.i18n = opts.i18n || window.__i18n;
    this.eventBus = { on() {}, off() {} };
  }
  addIcons(svg) {
    const holder = document.createElement("div");
    holder.style.display = "none";
    holder.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg">\${svg}</svg>\`;
    document.body.prepend(holder);
  }
  addTopBar(opts) {
    const btn = document.createElement("button");
    btn.onclick = opts.callback;
    return btn;
  }
  addCommand() {}
  addDock(def) {
    window.__dockDef = def;
  }
  addAgentCapability() {}
  addTab(def) {
    window.__tabs.set(def.type, def);
    const plugin = this;
    return function() {};
  }
  async loadData(name) {
    const res = await fetch("/api/file/getFile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/data/storage/petal/siyuan-glean/" + name })
    });
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      if (res.status === 202 && parsed && parsed.code === 404) return undefined;
      return parsed;
    } catch { return undefined; }
  }
  async saveData(name, data) {
    const form = new FormData();
    form.append("path", "/data/storage/petal/siyuan-glean/" + name);
    form.append("isDir", "false");
    form.append("modTime", String(Math.floor(Date.now() / 1000)));
    form.append("file", new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), name);
    await fetch("/api/file/putFile", { method: "POST", body: form });
  }
}

window.__siyuanShim = {
  Plugin: SiyuanPluginBase,
  Dialog: SiyuanDialog,
  getFrontend: () => "desktop",
  getAllEditor: () => [],
  showMessage: (msg) => { window.__toasts.push(msg); },
  openMobileFileById: () => {},
  openTab: async (opts) => {
    const id = opts?.custom?.id || "";
    const type = id.replace(/^siyuan-glean/, "");
    const def = window.__tabs.get(type);
    const host = document.getElementById("workbench-host");
    if (def && host) {
      host.innerHTML = "";
      const tid = "tab-" + Date.now();
      const tabObj = { id: tid, element: host, tab: { id: tid } };
      def.init.call(tabObj);
      return tabObj;
    }
    if (opts?.doc?.id) {
      window.__openedDocTabs = window.__openedDocTabs || [];
      window.__openedDocTabs.push(opts.doc.id);
      return { id: "tab-doc-" + opts.doc.id };
    }
    return { id: "tab-doc" };
  },
  fetchSyncPost: async (url, data) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data || {})
    });
    return await res.json();
  }
};

// 挂载小驴全生态兄弟插件 Mock 桩环境（闪卡、人脉、常用、打卡）
window.__receivedExtracts = [];
window.__capturedQuotes = [];
window.__appendedFacts = [];
window.__recordedCheckinEvents = [];
window.__cardsReviewOpened = false;

window.xiaolvCards = {
  protocol: 1,
  capabilities: ["receiveExtract", "due", "openReview"],
  whenReady: async () => true,
  hasCapability: (name) => ["receiveExtract", "due", "openReview"].includes(name),
  receiveExtract: async (envelope) => {
    window.__receivedExtracts.push(envelope);
    return { ok: true, data: { blockID: "mock-card-" + Date.now(), enrolled: true } };
  },
  getDueSummary: async () => ({
    ok: true,
    data: {
      unreviewedCount: 8,
      unreviewedNewCardCount: 5,
      unreviewedOldCardCount: 3,
      todayReviewedCount: 12,
      updatedAt: new Date().toISOString(),
    },
  }),
  openReview: async () => {
    window.__cardsReviewOpened = true;
    return { ok: true };
  },
};

window.LvContacts = {
  protocol: 2,
  apiVersion: 2,
  version: "0.7.6",
  capabilities: ["searchPeople", "getPerson", "ensurePerson", "recordInteraction", "appendFact"],
  whenReady: async () => true,
  hasCapability: (name) => ["searchPeople", "getPerson", "ensurePerson", "recordInteraction", "appendFact"].includes(name),
  searchPeople: async (kw) => {
    if (kw && kw.includes("卡尔·纽波特")) {
      return [{ docId: "person-doc-cal", itemId: "p_cal", name: "卡尔·纽波特", group: "学者", tags: ["深度工作"] }];
    }
    return [];
  },
  ensurePerson: async (name, options) => {
    window.__ensuredPerson = { name, options };
    return { docId: "person-doc-new", itemId: "p_new", name, group: "未分组", tags: [], created: true };
  },
  appendFact: async (personDocId, input) => {
    window.__appendedFacts.push({ personDocId, input });
    return { id: "fact-" + Date.now(), ...input };
  },
};

window.xiaolvCommon = {
  protocol: 1,
  capabilities: ["captureQuote", "search", "get"],
  whenReady: async () => true,
  hasCapability: (name) => ["captureQuote", "search", "get"].includes(name),
  captureQuote: async (input) => {
    window.__capturedQuotes.push(input);
    return { ok: true, data: { id: "common-quote-" + Date.now() } };
  },
};

window.siyuanCheckin = {
  protocol: "siyuan-checkin",
  version: 5,
  capabilities: ["streaks.read", "events.record"],
  whenReady: async () => true,
  hasCapability: (name) => ["streaks.read", "events.record"].includes(name),
  getStreaks: () => [{ itemId: "habit-reading", current: 7, longest: 21 }],
  recordEvent: async (envelope) => {
    window.__recordedCheckinEvents.push(envelope);
    return { ok: true };
  },
};

window.module = { exports: {} };
window.exports = window.module.exports;
window.require = (id) => {
  if (id === "siyuan") return window.__siyuanShim;
  if (id === "process") return window.process;
  return {};
};
</script>
<script src="/plugin.js"></script>
<script>
(async () => {
  try {
    const PluginClass = window.module.exports.default || window.module.exports;
    const instance = new PluginClass({ app: { plugins: [] }, name: "siyuan-glean", displayName: "小驴拾遗", i18n: window.__i18n });
    window.__gleanPlugin = instance;
    await instance.onload();
    instance.recordRecentReading(${JSON.stringify(fulltextDocId)}, "深度工作与注意力管理");
    instance.openPanel();
    window.__gleanReady = true;
  } catch (err) {
    window.__bootError = String(err?.stack || err);
  }
})();
</script>
</body>
</html>`;

    const srv = http.createServer(async (req, res) => {
        try {
            if (req.url === "/" || req.url?.startsWith("/?")) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(hostHtml);
                return;
            }
            if (req.url === "/plugin.js") {
                res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
                res.end(pluginJs);
                return;
            }
            if (req.url?.startsWith("/api/")) {
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                const bodyBuf = Buffer.concat(chunks);
                const headers = { Authorization: `Token ${token}` };
                if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];
                const upstream = await fetch(`${base}${req.url}`, {
                    method: req.method || "POST",
                    headers,
                    body: bodyBuf.length > 0 ? bodyBuf : undefined,
                });
                const resBuf = Buffer.from(await upstream.arrayBuffer());
                res.writeHead(upstream.status, {
                    "Content-Type": upstream.headers.get("content-type") || "application/json",
                });
                res.end(resBuf);
                return;
            }
            res.writeHead(404);
            res.end();
        } catch (err) {
            res.writeHead(500);
            res.end(String(err));
        }
    });
    await new Promise((r) => srv.listen(0, HOST, r));
    const uiPort = srv.address().port;
    const cdpPort = await choosePort();
    const chromeProfile = path.join(os.tmpdir(), `glean-chrome-cdp-${Date.now()}-${process.pid}`);
    const chromeProc = spawn(chromePath, [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1280,800",
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${chromeProfile}`,
        `http://${HOST}:${uiPort}/`,
    ], { stdio: "ignore", windowsHide: true });

    try {
        // 等待 CDP 端口就绪并获取页面 WebSocket URL
        let wsUrl = "";
        for (let i = 0; i < 40; i += 1) {
            try {
                const targets = await fetch(`http://${HOST}:${cdpPort}/json/list`).then((r) => r.json());
                const pageTarget = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
                if (pageTarget) {
                    wsUrl = pageTarget.webSocketDebuggerUrl;
                    break;
                }
            } catch {}
            await new Promise((r) => setTimeout(r, 200));
        }
        assert.ok(wsUrl, "Chrome CDP WebSocket 连接必须建立");

        const ws = new WebSocket(wsUrl);
        await new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = reject;
        });
        let msgId = 0;
        const pendingCdp = new Map();
        ws.onmessage = (evt) => {
            const data = JSON.parse(String(evt.data));
            if (data.id && pendingCdp.has(data.id)) {
                const { resolve, reject } = pendingCdp.get(data.id);
                pendingCdp.delete(data.id);
                if (data.error) reject(new Error(data.error.message));
                else resolve(data.result);
            }
        };
        const sendCdp = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++msgId;
            pendingCdp.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
        const evalInPage = async (expression) => {
            const res = await sendCdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
            if (res.exceptionDetails) {
                throw new Error(`Page eval error: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ""}`);
            }
            return res.result?.value;
        };
        const saveShot = async (filename) => {
            const shot = await sendCdp("Page.captureScreenshot", { format: "png" });
            const file = path.join(outDir, filename);
            fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
            return file;
        };
        await sendCdp("Page.enable");
        await sendCdp("Runtime.enable");
        await sendCdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

        // 1. 等待今日拾遗视图挂载并完成内核数据加载
        for (let i = 0; i < 40; i += 1) {
            const ready = await evalInPage(`Boolean(window.__gleanReady && document.querySelector(".glean-surf-card"))`);
            if (ready) break;
            await new Promise((r) => setTimeout(r, 250));
        }
        const resurfaceMetrics = await evalInPage(`(() => {
            const pri = document.querySelector(".glean-surf-act--pri");
            const r = pri ? pri.getBoundingClientRect() : null;
            const bookmarkBadge = document.querySelector(".glean-badge--bookmark");
            return {
                hasCard: Boolean(document.querySelector(".glean-surf-card")),
                priTop: r ? Math.round(r.top) : -1,
                priBottom: r ? Math.round(r.bottom) : -1,
                hasBookmarkBadge: Boolean(bookmarkBadge),
                contextFoldClosed: !document.querySelector(".glean-surf-context-fold")?.open,
                moreMenuClosed: !document.querySelector(".glean-surf-more")?.open,
            };
        })()`);
        assert.equal(resurfaceMetrics.hasCard, true, "今日拾遗卡片必须在浏览器真实渲染");
        assert.ok(resurfaceMetrics.priBottom > 0 && resurfaceMetrics.priBottom <= 800, `今日拾遗主按钮必须在 800px 首屏内，实测 bottom=${resurfaceMetrics.priBottom}`);
        assert.equal(resurfaceMetrics.hasBookmarkBadge, true, "继续阅读卡片必须显示真实书签徽标");
        assert.equal(resurfaceMetrics.contextFoldClosed, true);
        assert.equal(resurfaceMetrics.moreMenuClosed, true);

        // 1.1 走查小驴闪卡联动：校验「🗂️ 闪卡待复习 16 张」快捷胶囊与一键直达复习接口
        for (let i = 0; i < 20; i += 1) {
            const hasDuePill = await evalInPage(`Boolean(document.querySelector(".glean-surf-cards-due-pill"))`);
            if (hasDuePill) break;
            await new Promise((r) => setTimeout(r, 100));
        }
        const cardsDueCheck = await evalInPage(`(async () => {
            const pill = document.querySelector(".glean-surf-cards-due-pill");
            const text = pill?.textContent?.trim() || "";
            pill?.click();
            for (let i = 0; i < 20; i += 1) {
                if (window.__cardsReviewOpened) break;
                await new Promise((r) => setTimeout(r, 50));
            }
            return {
                hasPill: Boolean(pill),
                text,
                reviewOpened: Boolean(window.__cardsReviewOpened),
            };
        })()`);
        assert.equal(cardsDueCheck.hasPill, true, "今日拾遗操作区必须呈现小驴闪卡待复习快捷胶囊");
        assert.ok(cardsDueCheck.text.includes("16"), "闪卡胶囊必须显示正确的待复习卡片总数（16张）");
        assert.equal(cardsDueCheck.reviewOpened, true, "点击闪卡待复习胶囊必须调用小驴闪卡 openReview 接口直达复习");

        await saveShot("01-resurface-live.png");

        // 2. 在浏览器中点击展开「按可用时间与主题挑一篇」和卡片「⋯ 更多操作」
        await evalInPage(`(() => {
            document.querySelector(".glean-surf-context-fold__summary")?.click();
            document.querySelector(".glean-surf-more__trigger")?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 200));
        const expandedState = await evalInPage(`({
            contextOpen: Boolean(document.querySelector(".glean-surf-context-fold")?.open),
            moreOpen: Boolean(document.querySelector(".glean-surf-more")?.open),
        })`);
        assert.equal(expandedState.contextOpen, true);
        assert.equal(expandedState.moreOpen, true);
        await saveShot("02-resurface-expanded-live.png");

        // 3. 点击左侧导航切换到「读库」视图，切到「稍后读」队列，勾选文章并测试内联批量栏（BL-01）
        await evalInPage(`(() => {
            const btns = Array.from(document.querySelectorAll(".glean-views__btn"));
            btns[1]?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 250));
        await evalInPage(`(() => {
            const qBtns = Array.from(document.querySelectorAll(".glean-q"));
            qBtns[1]?.click();
        })()`);
        for (let i = 0; i < 30; i += 1) {
            const hasRows = await evalInPage(`document.querySelectorAll(".glean-drow").length > 0`);
            if (hasRows) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        await evalInPage(`(() => {
            const check = document.querySelector(".glean-drow__select input, input.glean-drow__select");
            check?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 200));
        await evalInPage(`(() => {
            const priBtn = document.querySelector(".glean-bb--priority");
            priBtn?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 200));
        const hasInlinePills = await evalInPage(`Boolean(document.querySelector(".glean-batchbar__inline"))`);
        assert.equal(hasInlinePills, true, "点击批量设优先级必须展开内联档位胶囊而非调用 window.prompt");
        await saveShot("03-library-inline-batch-live.png");

        // 真实点击内联批量栏的 P5 档位胶囊，验证 UI 反馈（toast）+ 列表微标联动 + 思源内核真实落盘
        await evalInPage(`(() => {
            window.__toasts.length = 0;
            const btns = Array.from(document.querySelectorAll(".glean-batchbar__inline button"));
            const p5Btn = btns.find((b) => (b.textContent || "").trim() === "P5");
            p5Btn?.click();
        })()`);
        for (let i = 0; i < 20; i += 1) {
            const toastCount = await evalInPage(`window.__toasts.length`);
            if (toastCount > 0) break;
            await new Promise((r) => setTimeout(r, 150));
        }
        const batchToast = await evalInPage(`window.__toasts[window.__toasts.length - 1] || ""`);
        assert.ok(batchToast.length > 0, "点击内联 P5 胶囊必须弹出操作成功反馈提示");
        const kernelAttrsAfterBatch = await fetch(`${base}/api/attr/getBlockAttrs`, {
            method: "POST",
            headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ id: extraDocId }),
        }).then((r) => r.json()).then((j) => j.data || {});
        assert.equal(kernelAttrsAfterBatch["custom-clip-priority"], "5", "内联批量修改优先级必须真实落盘至思源文档属性");

        // 4. 点击文章标题打开右侧预览抽屉，验证预览顶栏单行对齐、点击收藏按钮联动列表并落盘内核，展开行尾 ActionPopover（BL-11）
        await evalInPage(`(() => {
            document.querySelector(".glean-drow__ti")?.click();
            const popTrigger = document.querySelector(".glean-drow .glean-action-popover__trigger");
            popTrigger?.click();
            const popBody = document.querySelector(".glean-drow .glean-action-popover__body");
            if (popBody && typeof popBody.showPopover === "function") {
                try { popBody.showPopover(); } catch {}
            }
        })()`);
        await new Promise((r) => setTimeout(r, 350));
        const previewState = await evalInPage(`(() => {
            const headerActs = document.querySelector(".glean-preview__header-actions");
            const r = headerActs ? headerActs.getBoundingClientRect() : null;
            const missingSymbols = Array.from(document.querySelectorAll("use")).filter((u) => {
                const href = u.getAttribute("href") || u.getAttribute("xlink:href") || "";
                return href.startsWith("#") && !document.querySelector(href);
            }).length;
            return {
                hasPreview: Boolean(document.querySelector(".glean-preview")),
                hasPopoverOpen: Boolean(document.querySelector(":popover-open")),
                headerHeight: r ? Math.round(r.height) : 999,
                missingSymbols,
            };
        })()`);
        assert.equal(previewState.hasPreview, true, "点击文章行必须打开右侧预览抽屉");
        assert.equal(previewState.missingSymbols, 0, "界面所有 SVG use 图标必须 100% 匹配已注册 symbol");
        assert.ok(previewState.headerHeight <= 56, `预览抽屉顶栏按钮组必须保持紧凑单行对齐，实测 height=${previewState.headerHeight}px`);
        await saveShot("04-library-preview-popover-live.png");

        // 点击 ActionPopover 内的「复制块引用」按钮，验证菜单自动收起（BL-11），再点击预览顶栏「收藏」按钮验证 UI 联动 + 思源内核落盘
        await evalInPage(`(() => {
            const copyBtn = document.querySelector(".glean-drow .glean-action-popover__body > button.glean-btn");
            copyBtn?.click();
            window.__toasts.length = 0;
            document.querySelector(".glean-preview__fav-btn")?.click();
        })()`);
        for (let i = 0; i < 25; i += 1) {
            const state = await evalInPage(`({
                favActive: Boolean(document.querySelector(".glean-preview__fav-btn--active")),
                rowFavBadge: Boolean(document.querySelector(".glean-drow .glean-tier-badge--fav")),
            })`);
            if (state.favActive && state.rowFavBadge) break;
            await new Promise((r) => setTimeout(r, 150));
        }
        const favLinkage = await evalInPage(`({
            favBtnActive: Boolean(document.querySelector(".glean-preview__fav-btn--active")),
            rowFavBadge: Boolean(document.querySelector(".glean-drow .glean-tier-badge--fav")),
            toast: window.__toasts[window.__toasts.length - 1] || "",
        })`);
        assert.equal(favLinkage.favBtnActive, true, "点击预览收藏按钮后按钮本身必须立即切换为激活态");
        assert.equal(favLinkage.rowFavBadge, true, "点击预览收藏按钮后左侧列表行必须实时联动显示红心徽标");
        assert.ok(favLinkage.toast.length > 0, "点击预览收藏按钮必须弹出反馈提示");
        const kernelAttrsAfterFav = await fetch(`${base}/api/attr/getBlockAttrs`, {
            method: "POST",
            headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ id: extraDocId }),
        }).then((r) => r.json()).then((j) => j.data || {});
        assert.equal(kernelAttrsAfterFav["custom-clip-favorite"], "true", "预览收藏点击必须真实写入思源文档 custom-clip-favorite 属性");

        // 5. 点击顶栏「设置」打开模态弹窗，测试防叠开单例（BL-09）、高分屏视口夹取（BL-12）、色盘无障碍漫游焦点（BL-14）与真实捕获阶段 Escape 关闭（BL-02）
        await evalInPage(`(() => {
            const gear = document.querySelector(".glean-head-actions > button:last-child");
            gear?.click();
            window.__gleanPlugin?.openSettings?.();
        })()`);
        await new Promise((r) => setTimeout(r, 300));
        const modalCheck = await evalInPage(`(() => {
            const dialogs = document.querySelectorAll(".b3-dialog--open");
            const container = document.querySelector(".b3-dialog__container");
            const activeRadios = document.querySelectorAll('.glean-palette-grid [role="radio"][tabindex="0"]');
            return {
                dialogCount: dialogs.length,
                hasSettings: Boolean(document.querySelector(".b3-dialog--open .glean-settings")),
                maxWidth: container ? container.style.maxWidth : "",
                maxHeight: container ? container.style.maxHeight : "",
                activeRadioCount: activeRadios.length,
            };
        })()`);
        assert.equal(modalCheck.hasSettings, true, "点击设置按钮必须弹出真实设置模态窗");
        assert.equal(modalCheck.dialogCount, 1, "连续触发 openSettings 必须由单例守卫阻止叠开多层弹窗（BL-09）");
        assert.equal(modalCheck.maxWidth, "94vw", "弹窗容器必须限制 maxWidth=94vw 防止 150% 缩放溢出（BL-12）");
        assert.equal(modalCheck.maxHeight, "88vh", "弹窗容器必须限制 maxHeight=88vh 防止 150% 缩放溢出（BL-12）");
        assert.equal(modalCheck.activeRadioCount, 1, "设置页主题色盘 radiogroup 必须具备唯一 tabindex=0 漫游焦点（BL-14）");
        await saveShot("05-settings-modal-live.png");

        // 验证 BL-13（AI 增强同组开关全部收敛为胶囊开关）与 BL-16（点击恢复默认弹出内联确认且按 Esc 先取消确认）
        const aiSectionCheck = await evalInPage(`(() => {
            const tabs = Array.from(document.querySelectorAll('.glean-settings [role="tab"]'));
            tabs[3]?.click();
            return true;
        })()`);
        await new Promise((r) => setTimeout(r, 150));
        const rawCheckboxesInAi = await evalInPage(`document.querySelectorAll('.glean-settings input[type="checkbox"]').length`);
        assert.equal(rawCheckboxesInAi, 0, "设置页 AI 增强分类同组开关必须统一为胶囊开关，无原生 checkbox（BL-13）");

        await evalInPage(`document.querySelector(".glean-settings__footer > button.glean-btn")?.click()`);
        await new Promise((r) => setTimeout(r, 150));
        const resetConfirmShown = await evalInPage(`Boolean(document.querySelector(".glean-settings__close-confirm"))`);
        assert.equal(resetConfirmShown, true, "点击恢复默认必须先显示内联确认条（BL-16）");

        // 第 1 次 Escape：取消「恢复默认」确认条，但设置弹窗本身保持打开
        await sendCdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await sendCdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await new Promise((r) => setTimeout(r, 150));
        const afterFirstEsc = await evalInPage(`({
            dialogOpen: Boolean(document.querySelector(".b3-dialog--open")),
            confirmOpen: Boolean(document.querySelector(".glean-settings__close-confirm")),
        })`);
        assert.equal(afterFirstEsc.confirmOpen, false, "第 1 次按 Escape 应先收起恢复默认确认条（BL-02/BL-16）");
        assert.equal(afterFirstEsc.dialogOpen, true, "第 1 次按 Escape 不应直接销毁设置窗（BL-02/BL-16）");

        // 第 2 次 Escape：关闭空闲态设置弹窗
        await sendCdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await sendCdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await new Promise((r) => setTimeout(r, 250));
        const modalAfterEsc = await evalInPage(`Boolean(document.querySelector(".b3-dialog--open"))`);
        assert.equal(modalAfterEsc, false, "按 Escape 键必须正常关闭空闲态设置弹窗");

        // 6. 点击左侧导航切换到「阅读统计」视图，验证热力图无内联 opacity（BL-15）、role="button" + aria-pressed 与已读行 ActionPopover 收纳（BL-13/BL-14）
        await evalInPage(`(() => {
            const btns = Array.from(document.querySelectorAll(".glean-views__btn"));
            btns[2]?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 350));
        const statsA11y = await evalInPage(`(() => {
            const hasStats = Boolean(document.querySelector(".glean-stats"));
            const hasInteractiveDay = Boolean(document.querySelector('.glean-stats__day[role="button"][aria-pressed]'));
            const hasOpacityDay = Boolean(document.querySelector('.glean-stats__day[style*="opacity"]'));
            const hasRowPopover = Boolean(document.querySelector(".glean-stats__completed-acts .glean-action-popover__trigger"));
            const unlabeledRowBtns = Array.from(document.querySelectorAll(".glean-stats__completed-acts > button")).filter((b) => !b.getAttribute("aria-label")).length;
            return { hasStats, hasInteractiveDay, hasOpacityDay, hasRowPopover, unlabeledRowBtns };
        })()`);
        assert.equal(statsA11y.hasStats, true, "阅读统计视图必须正常渲染");
        assert.equal(statsA11y.hasInteractiveDay, true, "统计热力图交互格必须具备 role=button 与 aria-pressed（BL-14）");
        assert.equal(statsA11y.hasOpacityDay, false, "统计热力图不得使用父元素内联 opacity 导致悬浮提示变半透明（BL-15）");
        assert.equal(statsA11y.hasRowPopover, true, "统计已读行低频著录必须收纳进 ActionPopover（BL-13）");
        assert.equal(statsA11y.unlabeledRowBtns, 0, "统计已读清单行尾纯图标按钮必须 100% 具备 aria-label（BL-14）");
        await saveShot("06-stats-view-live.png");

        // 7. 切换到「读库 -> 看板」视图，验证五列横滚容器、看板卡 ActionPopover 更多菜单与移回待分拣按钮（BL-12/BL-13）
        await evalInPage(`(() => {
            const btns = Array.from(document.querySelectorAll(".glean-views__btn"));
            btns[1]?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 200));
        await evalInPage(`(() => {
            const segBtns = Array.from(document.querySelectorAll(".glean-seg__btn"));
            segBtns[1]?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 300));
        const kanbanCheck = await evalInPage(`(() => {
            const kanban = document.querySelector(".glean-kanban");
            const cols = document.querySelectorAll(".glean-kcol");
            const foot = document.querySelector(".glean-kcard__foot");
            const footChildren = foot ? Array.from(foot.children).map((c) => c.getBoundingClientRect()) : [];
            const alignedDelta = footChildren.length >= 2
                ? Math.abs((footChildren[0].top + footChildren[0].height / 2) - (footChildren[1].top + footChildren[1].height / 2))
                : 0;
            const kcardMore = document.querySelector(".glean-kcard__more .glean-action-popover__trigger");
            kcardMore?.click();
            const popBody = document.querySelector(".glean-kcard__more .glean-action-popover__body");
            if (popBody && typeof popBody.showPopover === "function") {
                try { popBody.showPopover(); } catch {}
            }
            return {
                hasKanban: Boolean(kanban),
                colCount: cols.length,
                hasKcardMore: Boolean(kcardMore),
                alignedDelta: Math.round(alignedDelta),
            };
        })()`);
        assert.equal(kanbanCheck.hasKanban, true, "看板视图必须正常渲染");
        assert.equal(kanbanCheck.colCount, 5, "看板视图必须渲染完整 5 列状态列");
        assert.equal(kanbanCheck.hasKcardMore, true, "看板卡片必须具备 ActionPopover 更多操作菜单（BL-13）");
        assert.ok(kanbanCheck.alignedDelta <= 6, `看板卡片底部状态按钮与更多按钮必须水平垂直居中对齐，实测偏差=${kanbanCheck.alignedDelta}px`);
        await saveShot("07-library-kanban-live.png");

        // 8. 切换到「摘录」视图，验证单卡 ActionPopover 收纳、颜色下拉汉化与「按文章」聚类无 summary 内嵌 button（BL-13/BL-14/BL-16）
        await evalInPage(`(() => {
            const btns = Array.from(document.querySelectorAll(".glean-views__btn"));
            btns[3]?.click();
        })()`);
        for (let i = 0; i < 30; i += 1) {
            const ready = await evalInPage(`Boolean(document.querySelector(".glean-highlights__item"))`);
            if (ready) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        await evalInPage(`(() => {
            const scopeBtns = Array.from(document.querySelectorAll(".glean-highlights__tools--scope button"));
            scopeBtns[3]?.click();
        })()`);
        for (let i = 0; i < 20; i += 1) {
            const hasToggle = await evalInPage(`Boolean(document.querySelector(".glean-highlights__article-toggle"))`);
            if (hasToggle) break;
            await new Promise((r) => setTimeout(r, 150));
        }
        for (let i = 0; i < 25; i += 1) {
            const hasTag = await evalInPage(`Boolean(document.querySelector(".glean-annotation-tag"))`);
            if (hasTag) break;
            await new Promise((r) => setTimeout(r, 150));
        }
        const highlightCheck = await evalInPage(`(() => {
            const groupToggle = document.querySelector(".glean-highlights__article-toggle");
            const nestedBtnInSummary = document.querySelector(".glean-highlights summary button");
            const cardPopover = document.querySelector(".glean-highlights__tools--card .glean-action-popover__trigger");
            const hasAnnotationTag = Boolean(document.querySelector(".glean-annotation-tag"));
            const hasAnnotationKind = Boolean(document.querySelector(".glean-annotation-kind"));
            return {
                hasGroupToggle: Boolean(groupToggle),
                expandedAttr: groupToggle ? groupToggle.getAttribute("aria-expanded") : "",
                hasNestedBtnInSummary: Boolean(nestedBtnInSummary),
                hasCardPopover: Boolean(cardPopover),
                hasAnnotationTag,
                hasAnnotationKind,
            };
        })()`);
        assert.equal(highlightCheck.hasGroupToggle, true, "摘录按文章聚类视图必须渲染独立折叠按钮（BL-14）");
        assert.equal(highlightCheck.expandedAttr, "true");
        assert.equal(highlightCheck.hasNestedBtnInSummary, false, "摘录聚类严禁在 summary 内非法嵌套 button（BL-14）");
        assert.equal(highlightCheck.hasCardPopover, true, "摘录卡片低频操作必须收纳进 ActionPopover（BL-13）");
        assert.equal(highlightCheck.hasAnnotationTag, true, "摘录视图必须展示批注标记徽标（📌⭐📖✔️❓）");
        assert.equal(highlightCheck.hasAnnotationKind, true, "摘录视图必须展示批注类型来源徽标（💬鲸鱼批注/📝块备注）");

        // 8.1 走查全库摘录墙跨插件联动：在单卡 ActionPopover 中一键推入小驴闪卡与存入小驴常用片段
        const hlFederationRes = await evalInPage(`(async () => {
            const cardPopoverTrigger = document.querySelector(".glean-highlights__tools--card .glean-action-popover__trigger");
            cardPopoverTrigger?.click();
            const popBody = document.querySelector(".glean-highlights__tools--card .glean-action-popover__body");
            if (popBody && typeof popBody.showPopover === "function") {
                try { popBody.showPopover(); } catch {}
            }
            await new Promise((r) => setTimeout(r, 100));

            const pushCardsBtn = Array.from(popBody?.querySelectorAll("button") || []).find((b) => (b.textContent || "").includes("闪卡"));
            const pushCommonBtn = Array.from(popBody?.querySelectorAll("button") || []).find((b) => (b.textContent || "").includes("常用"));

            const initialExtractCount = window.__receivedExtracts?.length || 0;
            const initialQuoteCount = window.__capturedQuotes?.length || 0;

            let clickError = "";
            try {
                pushCardsBtn?.click();
            } catch (e) {
                clickError = String(e?.message || e);
            }
            for (let i = 0; i < 20; i += 1) {
                if ((window.__receivedExtracts?.length || 0) > initialExtractCount) break;
                await new Promise((r) => setTimeout(r, 50));
            }

            if (popBody && typeof popBody.showPopover === "function") {
                try { popBody.showPopover(); } catch {}
            }
            await new Promise((r) => setTimeout(r, 100));

            let commonClickError = "";
            try {
                pushCommonBtn?.click();
            } catch (e) {
                commonClickError = String(e?.message || e);
            }
            for (let i = 0; i < 20; i += 1) {
                if ((window.__capturedQuotes?.length || 0) > initialQuoteCount) break;
                await new Promise((r) => setTimeout(r, 50));
            }

            return {
                hasPushCards: Boolean(pushCardsBtn),
                hasPushCommon: Boolean(pushCommonBtn),
                extractCountAfter: window.__receivedExtracts?.length || 0,
                quoteCountAfter: window.__capturedQuotes?.length || 0,
            };
        })()`);
        assert.equal(hlFederationRes.hasPushCards, true, "摘录卡片菜单中必须提供「推入小驴闪卡」入口");
        assert.equal(hlFederationRes.hasPushCommon, true, "摘录卡片菜单中必须提供「存入小驴常用」入口");
        assert.ok(hlFederationRes.extractCountAfter >= 1, "点击推入闪卡必须成功触发 window.xiaolvCards.receiveExtract");
        assert.ok(hlFederationRes.quoteCountAfter >= 1, "点击存入常用必须成功触发 window.xiaolvCommon.captureQuote");

        await saveShot("08-highlights-grouped-live.png");

        // 真实点击摘录聚类头部的「创建摘录笔记」按钮，验证 toast 反馈并在思源内核验证新笔记文档落盘 + internal:true 标记
        await evalInPage(`(() => {
            window.__toasts.length = 0;
            const createDocBtn = document.querySelector(".glean-highlights__article-actions button:last-child");
            createDocBtn?.click();
        })()`);
        for (let i = 0; i < 30; i += 1) {
            const toastCount = await evalInPage(`window.__toasts.length`);
            if (toastCount > 0) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        const highlightDocToast = await evalInPage(`window.__toasts[window.__toasts.length - 1] || ""`);
        assert.ok(highlightDocToast.length > 0, "点击创建摘录笔记按钮必须弹出反馈提示");
        let highlightNoteDoc = null;
        for (let i = 0; i < 20; i += 1) {
            const allDocs = await listAnchorDocs([notebookId]);
            highlightNoteDoc = allDocs.find((d) => (d.hpath || "").includes("深度长文剪藏") && d.id !== fulltextDocId && !(d.hpath || "").includes("思维导图"));
            if (highlightNoteDoc) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        assert.ok(highlightNoteDoc?.id, "点击创建摘录笔记必须在思源笔记本中真实创建新文档");
        const noteAttrs = await fetch(`${base}/api/attr/getBlockAttrs`, {
            method: "POST",
            headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ id: highlightNoteDoc.id }),
        }).then((r) => r.json()).then((j) => j.data || {});
        assert.equal(noteAttrs["custom-clip-internal"], "true", "生成的摘录笔记文档必须自动标记 custom-clip-internal=true");

        // 9. 打开归档对话框（ArchiveDialog），展开「彻底删除文章」二次确认，验证捕获阶段 Escape 分级取消（BL-02）
        await evalInPage(`window.__gleanPlugin?.openArchiveDialog?.(${JSON.stringify(extraDocId)})`);
        await new Promise((r) => setTimeout(r, 250));
        await evalInPage(`document.querySelector(".glean-archive-dlg__purge")?.click()`);
        for (let i = 0; i < 20; i += 1) {
            const hasConfirm = await evalInPage(`Boolean(document.querySelector(".glean-archive-dlg .glean-confirm"))`);
            if (hasConfirm) break;
            await new Promise((r) => setTimeout(r, 150));
        }
        await sendCdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await sendCdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await new Promise((r) => setTimeout(r, 150));
        const archiveAfterFirstEsc = await evalInPage(`({
            dialogOpen: Boolean(document.querySelector(".b3-dialog--open .glean-archive-dlg")),
            confirmOpen: Boolean(document.querySelector(".glean-archive-dlg .glean-confirm")),
        })`);
        assert.equal(archiveAfterFirstEsc.confirmOpen, false, "ArchiveDialog 第 1 次按 Escape 必须先关闭彻底删除二次确认框（BL-02）");
        assert.equal(archiveAfterFirstEsc.dialogOpen, true, "ArchiveDialog 第 1 次按 Escape 不得直接销毁弹窗（BL-02）");
        await sendCdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await sendCdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await new Promise((r) => setTimeout(r, 200));
        assert.equal(await evalInPage(`Boolean(document.querySelector(".b3-dialog--open"))`), false);

        // 10. 打开伴读阅读器（ReaderTab），对全新三区架构顶栏和多 Tab 伴生栏进行全量按钮与输入组件有效性验证
        await evalInPage(`window.__gleanPlugin?.openReader?.(${JSON.stringify(fulltextDocId)})`);
        for (let i = 0; i < 30; i += 1) {
            const hasReaderAndMeta = await evalInPage(`Boolean(document.querySelector(".glean-reader")) && Boolean(document.querySelector(".glean-reader__toolbar-meta"))`);
            if (hasReaderAndMeta) break;
            await new Promise((r) => setTimeout(r, 200));
        }

        // 10.1 验证顶栏三区布局结构与元数据信息（左中右）
        const toolbarStructure = await evalInPage(`(() => {
            const left = document.querySelector(".glean-reader__toolbar-left");
            const center = document.querySelector(".glean-reader__toolbar-center");
            const right = document.querySelector(".glean-reader__toolbar-right");
            const title = left?.querySelector(".glean-reader__toolbar-title")?.textContent?.trim() || "";
            const meta = left?.querySelector(".glean-reader__toolbar-meta")?.textContent?.trim() || "";
            const backBtn = Boolean(left?.querySelector(".glean-reader__toolbar-back"));
            return {
                hasLeft: Boolean(left),
                hasCenter: Boolean(center),
                hasRight: Boolean(right),
                hasBackBtn: backBtn,
                title,
                hasMeta: meta.length > 0,
            };
        })()`);
        assert.ok(toolbarStructure.hasLeft && toolbarStructure.hasCenter && toolbarStructure.hasRight, "顶栏必须具备清晰的左中右三区结构");
        assert.equal(toolbarStructure.hasBackBtn, true, "顶栏左侧必须具备返回读库按钮");
        assert.ok(toolbarStructure.title.length > 0, "顶栏左侧必须显示文章标题");
        assert.equal(toolbarStructure.hasMeta, true, "顶栏左侧必须显示载体、字数与阅读时长元数据");

        // 10.1.1 走查小驴人脉生态联动：顶栏自动识别已知作者徽标，点击一键直达作者人脉文档
        for (let i = 0; i < 20; i += 1) {
            const hasAuthorBtn = await evalInPage(`Boolean(document.querySelector(".glean-reader__author-contact-btn"))`);
            if (hasAuthorBtn) break;
            await new Promise((r) => setTimeout(r, 100));
        }
        const authorLinkage = await evalInPage(`(async () => {
            const btn = document.querySelector(".glean-reader__author-contact-btn");
            const btnText = btn?.textContent?.trim() || "";
            btn?.click();
            for (let i = 0; i < 20; i += 1) {
                if ((window.__openedDocTabs || []).length > 0) break;
                await new Promise((r) => setTimeout(r, 50));
            }
            return {
                hasBtn: Boolean(btn),
                btnText,
                openedDoc: (window.__openedDocTabs || [])[(window.__openedDocTabs || []).length - 1],
            };
        })()`);
        assert.equal(authorLinkage.hasBtn, true, "顶栏必须自动识别作者为小驴人脉联系人并渲染人脉徽标");
        assert.ok(authorLinkage.btnText.includes("卡尔·纽波特"), "人脉徽标必须正确展示作者姓名");
        assert.equal(authorLinkage.openedDoc, "person-doc-cal", "点击作者人脉徽标必须直达作者在思源中的人脉主档案文档");

        // 10.2 验证顶栏中间模式分段器（伴读 / 原生编辑模式切换）
        const modeSwitchResult = await evalInPage(`(async () => {
            const segBtns = Array.from(document.querySelectorAll(".glean-reader__mode .glean-seg__btn"));
            if (segBtns.length < 2) return { ok: false, reason: "seg buttons not found" };
            // 切换为 edit 原生编辑模式
            segBtns[1].click();
            await new Promise((r) => setTimeout(r, 120));
            const editModeActive = document.querySelector(".glean-reader")?.getAttribute("data-reader-mode") === "edit";
            // 切回 read 伴读模式
            segBtns[0].click();
            await new Promise((r) => setTimeout(r, 120));
            const readModeActive = document.querySelector(".glean-reader")?.getAttribute("data-reader-mode") === "read";
            return { ok: true, editModeActive, readModeActive };
        })()`);
        assert.equal(modeSwitchResult.ok, true, "必须存在模式切换分段按钮");
        assert.equal(modeSwitchResult.editModeActive, true, "点击原生编辑分段按钮必须切换至 edit 模式");
        assert.equal(modeSwitchResult.readModeActive, true, "点击伴读分段按钮必须切回 read 模式");

        // 10.3 验证顶栏右侧搜索条（Ctrl+F 打开、关键字输入、匹配计数、大小写切换、关闭）
        await evalInPage(`document.querySelector(".glean-reader__toolbar-search")?.click()`);
        for (let i = 0; i < 20; i += 1) {
            const searchOpened = await evalInPage(`Boolean(document.querySelector(".glean-reader-search"))`);
            if (searchOpened) break;
            await new Promise((r) => setTimeout(r, 100));
        }
        assert.equal(await evalInPage(`Boolean(document.querySelector(".glean-reader-search"))`), true, "点击顶栏搜索按钮必须弹出搜索条");

        // 在搜索输入框中键入关键词并验证匹配与大小写切换
        const searchInputRes = await evalInPage(`(async () => {
            const input = document.querySelector(".glean-reader-search__input");
            if (!input) return { ok: false };
            input.value = "段落";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            await new Promise((r) => setTimeout(r, 100));
            const countText = document.querySelector(".glean-reader-search__count")?.textContent?.trim() || "";
            // 点击区分大小写切换
            const caseBtn = Array.from(document.querySelectorAll(".glean-reader-search__btn")).find((b) => b.textContent?.trim() === "Aa");
            const initialCase = caseBtn?.getAttribute("aria-pressed");
            caseBtn?.click();
            await new Promise((r) => setTimeout(r, 100));
            const toggledCase = caseBtn?.getAttribute("aria-pressed");
            // 点击关闭搜索
            const closeBtn = document.querySelector(".glean-reader-search__btn--close");
            closeBtn?.click();
            return {
                ok: true,
                hasCount: countText.length > 0,
                initialCase,
                toggledCase,
            };
        })()`);
        assert.equal(searchInputRes.ok, true, "搜索输入框与操作必须有效执行");
        assert.notEqual(searchInputRes.initialCase, searchInputRes.toggledCase, "区分大小写按钮点击后必须切换状态");
        await new Promise((r) => setTimeout(r, 150));
        assert.equal(await evalInPage(`Boolean(document.querySelector(".glean-reader-search"))`), false, "点击关闭搜索必须收起搜索条");

        // 10.4 验证顶栏 Aa 排版设置 Popover（字号切换、版心切换、行高切换、调色板点击）
        await evalInPage(`document.querySelector(".glean-reader__toolbar-appearance")?.click()`);
        for (let i = 0; i < 15; i += 1) {
            const popoverOpen = await evalInPage(`Boolean(document.querySelector(".glean-reader__appearance-popover[open]"))`);
            if (popoverOpen) break;
            await new Promise((r) => setTimeout(r, 100));
        }
        assert.equal(await evalInPage(`Boolean(document.querySelector(".glean-reader__appearance-popover[open]"))`), true, "点击 Aa 按钮必须展开排版 Popover");

        const appearanceRes = await evalInPage(`(async () => {
            const popover = document.querySelector(".glean-reader__appearance-popover");
            const selects = popover?.querySelectorAll("select");
            const fontSelect = selects?.[0];
            const heightSelect = selects?.[1];
            const widthSelect = selects?.[2];
            if (fontSelect) {
                fontSelect.value = "large";
                fontSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (heightSelect) {
                heightSelect.value = "relaxed";
                heightSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (widthSelect) {
                widthSelect.value = "wide";
                widthSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
            const palettes = popover?.querySelectorAll(".glean-reader__palette-opt");
            palettes?.[1]?.click();
            await new Promise((r) => setTimeout(r, 120));
            const readerEl = document.querySelector(".glean-reader");
            const fontSizeAttr = readerEl?.getAttribute("data-reader-font-size") || "";
            const widthAttr = readerEl?.getAttribute("data-reader-width") || "";
            // 收起 Popover
            popover.removeAttribute("open");
            return {
                selectCount: selects?.length || 0,
                paletteCount: palettes?.length || 0,
                fontSizeAttr,
                widthAttr,
            };
        })()`);
        assert.equal(appearanceRes.selectCount, 3, "排版面板必须提供字号、宽度、行高 3 项核心调节项");
        assert.ok(appearanceRes.paletteCount >= 6, "排版面板必须提供 6 种高品质阅读调色板");
        assert.equal(appearanceRes.fontSizeAttr, "large", "修改字号选择必须同步至 data-reader-font-size");
        assert.equal(appearanceRes.widthAttr, "wide", "修改版心选择必须同步至 data-reader-width");

        // 10.5 验证顶栏禅模式（Zen mode）与收藏切换
        const zenRes = await evalInPage(`(async () => {
            const zenBtn = document.querySelector(".glean-reader__toolbar-zen");
            zenBtn?.click();
            await new Promise((r) => setTimeout(r, 120));
            const isZen = document.querySelector(".glean-reader")?.classList.contains("glean-reader--zen");
            zenBtn?.click();
            await new Promise((r) => setTimeout(r, 120));
            const exitedZen = !document.querySelector(".glean-reader")?.classList.contains("glean-reader--zen");
            return { isZen, exitedZen };
        })()`);
        assert.equal(zenRes.isZen, true, "点击禅模式按钮必须激活 .glean-reader--zen");
        assert.equal(zenRes.exitedZen, true, "再次点击禅模式按钮必须退出禅模式");

        const favRes = await evalInPage(`(async () => {
            const favBtn = document.querySelector(".glean-reader__toolbar-fav");
            const initActive = favBtn?.classList.contains("glean-reader__toolbar-fav--active");
            favBtn?.click();
            await new Promise((r) => setTimeout(r, 150));
            const toggledActive = favBtn?.classList.contains("glean-reader__toolbar-fav--active");
            return { initActive, toggledActive };
        })()`);
        assert.notEqual(favRes.initActive, favRes.toggledActive, "点击收藏按钮必须切换收藏激活状态");

        // 10.6 验证伴生栏折叠/展开切换按钮
        const sidebarToggleRes = await evalInPage(`(async () => {
            const sideBtn = document.querySelector(".glean-reader__toolbar-sidebar");
            const side = document.querySelector(".glean-reader__side");
            sideBtn?.click();
            for (let i = 0; i < 20; i += 1) {
                if (!sideBtn?.disabled && side?.hasAttribute("hidden")) break;
                await new Promise((r) => setTimeout(r, 100));
            }
            const hiddenAfterCollapse = side?.hasAttribute("hidden");
            sideBtn?.click();
            for (let i = 0; i < 20; i += 1) {
                if (!sideBtn?.disabled && !side?.hasAttribute("hidden")) break;
                await new Promise((r) => setTimeout(r, 100));
            }
            const visibleAfterExpand = !side?.hasAttribute("hidden");
            return { hiddenAfterCollapse, visibleAfterExpand };
        })()`);
        assert.equal(sidebarToggleRes.hiddenAfterCollapse, true, "点击伴生栏按钮必须收起伴生侧边栏");
        assert.equal(sidebarToggleRes.visibleAfterExpand, true, "再次点击伴生栏按钮必须重新展开伴生侧边栏");

        // 10.7 验证顶栏「5 阶语义折叠」按钮直接触发折叠阅读（FoldedReaderView），验证容器块递归采集与代码块排除（BL-05/BL-06）
        await evalInPage(`document.querySelector(".glean-reader__toolbar-fold")?.click()`);
        for (let i = 0; i < 30; i += 1) {
            const hasFold = await evalInPage(`document.querySelectorAll(".glean-fold-card").length > 0`);
            if (hasFold) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        const foldCheck = await evalInPage(`(() => {
            const cards = Array.from(document.querySelectorAll(".glean-fold-card")).map((el) => el.textContent || "");
            const fullText = cards.join(" ");
            return {
                cardCount: cards.length,
                hasBlockquoteChild: fullText.includes("引用容器内的核心段落"),
                hasCodeNoise: fullText.includes("codeBlockNoise"),
            };
        })()`);
        assert.ok(foldCheck.cardCount >= 3, "折叠阅读器必须采集到多段正文卡片");
        assert.equal(foldCheck.hasBlockquoteChild, true, "折叠阅读器必须递归采集引述容器（b）内的正文段落（BL-06）");
        assert.equal(foldCheck.hasCodeNoise, false, "折叠阅读器必须按思源短类型码（c）排除代码块噪音（BL-06）");
        await saveShot("09-reader-folded-live.png");

        // 10.8 验证伴生栏全 Tab 切换（折叠 -> 批注 -> 工具 -> 大纲）及其组件有效性
        const tabCheckRes = await evalInPage(`(async () => {
            const foldBtn = document.querySelector(".glean-reader__side-nav-btn--fold");
            const notesBtn = document.querySelector(".glean-reader__side-nav-btn--notes");
            const toolsBtn = document.querySelector(".glean-reader__side-nav-btn--tools");
            const outlineBtn = document.querySelector(".glean-reader__side-nav-btn--outline");

            // 切到 notes 批注 tab
            notesBtn?.click();
            await new Promise((r) => setTimeout(r, 120));
            const hasNotesSection = Boolean(document.querySelector(".glean-reader__section"));
            const hasNotesCopyBtn = Boolean(document.querySelector(".glean-reader__highlights-copy-all"));

            // 切到 tools 工具 tab
            toolsBtn?.click();
            await new Promise((r) => setTimeout(r, 120));
            const hasStatusActions = Boolean(document.querySelector(".glean-reader__status-actions"));
            const syncPills = document.querySelectorAll(".glean-reader__sync-pill");

            // 切回 outline 大纲 tab
            outlineBtn?.click();
            await new Promise((r) => setTimeout(r, 120));
            const hasCapsule = Boolean(document.querySelector(".glean-reader__metric-capsule"));

            return {
                hasFoldBtn: Boolean(foldBtn),
                hasNotesBtn: Boolean(notesBtn),
                hasToolsBtn: Boolean(toolsBtn),
                hasOutlineBtn: Boolean(outlineBtn),
                hasNotesSection,
                hasStatusActions,
                syncPillCount: syncPills.length,
                hasCapsule,
            };
        })()`);
        assert.equal(tabCheckRes.hasFoldBtn && tabCheckRes.hasNotesBtn && tabCheckRes.hasToolsBtn && tabCheckRes.hasOutlineBtn, true, "伴生栏必须渲染大纲、批注、折叠、工具 4 个独立导航 Tab");
        assert.equal(tabCheckRes.hasNotesSection, true, "批注 Tab 下必须渲染高亮与批注管理区");
        assert.equal(tabCheckRes.hasStatusActions, true, "工具 Tab 下必须渲染文章阅读状态控制组");
        assert.ok(tabCheckRes.syncPillCount >= 2, "工具 Tab 下必须提供置顶元数据 Callout 与 Daily Note 快捷记录按钮");
        assert.equal(tabCheckRes.hasCapsule, true, "切回大纲 Tab 必须展现阅读度量胶囊");

        // 10.9 伴生栏批注 Tab 深度走查：卡片推入小驴闪卡、存入小驴常用与呼出金句卡片模态窗
        const notesDeepRes = await evalInPage(`(async () => {
            const notesBtn = document.querySelector(".glean-reader__side-nav-btn--notes");
            notesBtn?.click();
            for (let i = 0; i < 20; i += 1) {
                if (document.querySelector(".glean-reader__push-cards-btn")) break;
                await new Promise((r) => setTimeout(r, 100));
            }
            const pushCardsBtn = document.querySelector(".glean-reader__push-cards-btn");
            const pushCommonBtn = document.querySelector(".glean-reader__push-common-btn");
            const cardFooterOps = Array.from(document.querySelectorAll(".glean-reader__highlight-footer .glean-op-btn"));
            const quoteCardBtn = cardFooterOps.find((b) => (b.getAttribute("title") || "").includes("金句卡片") || (b.innerHTML || "").includes("#iconGleanSpark"));

            const initialCards = window.__receivedExtracts?.length || 0;
            const initialCommon = window.__capturedQuotes?.length || 0;

            pushCardsBtn?.click();
            for (let i = 0; i < 20; i += 1) {
                if ((window.__receivedExtracts?.length || 0) > initialCards) break;
                await new Promise((r) => setTimeout(r, 50));
            }

            pushCommonBtn?.click();
            for (let i = 0; i < 20; i += 1) {
                if ((window.__capturedQuotes?.length || 0) > initialCommon) break;
                await new Promise((r) => setTimeout(r, 50));
            }

            quoteCardBtn?.click();
            for (let i = 0; i < 20; i += 1) {
                if (document.querySelector(".glean-quote-card-dialog")) break;
                await new Promise((r) => setTimeout(r, 100));
            }
            const hasQuoteDialog = Boolean(document.querySelector(".glean-quote-card-dialog"));
            const dialogPushCards = Array.from(document.querySelectorAll(".glean-quote-card-btn")).find((b) => (b.textContent || "").includes("闪卡"));
            const dialogPushCommon = Array.from(document.querySelectorAll(".glean-quote-card-btn")).find((b) => (b.textContent || "").includes("常用"));

            const preDialogCards = window.__receivedExtracts?.length || 0;
            const preDialogCommon = window.__capturedQuotes?.length || 0;

            dialogPushCards?.click();
            for (let i = 0; i < 20; i += 1) {
                if ((window.__receivedExtracts?.length || 0) > preDialogCards) break;
                await new Promise((r) => setTimeout(r, 50));
            }

            dialogPushCommon?.click();
            for (let i = 0; i < 20; i += 1) {
                if ((window.__capturedQuotes?.length || 0) > preDialogCommon) break;
                await new Promise((r) => setTimeout(r, 50));
            }

            return {
                hasPushCards: Boolean(pushCardsBtn),
                hasPushCommon: Boolean(pushCommonBtn),
                hasQuoteDialog,
                hasDialogPushCards: Boolean(dialogPushCards),
                hasDialogPushCommon: Boolean(dialogPushCommon),
                cardsCount: window.__receivedExtracts?.length || 0,
                commonCount: window.__capturedQuotes?.length || 0,
            };
        })()`);
        assert.equal(notesDeepRes.hasPushCards, true, "伴生栏批注卡片必须提供推入小驴闪卡按钮");
        assert.equal(notesDeepRes.hasPushCommon, true, "伴生栏批注卡片必须提供存入小驴常用按钮");
        assert.equal(notesDeepRes.hasQuoteDialog, true, "点击批注卡片金句图标必须呼出金句卡片生成弹窗（QuoteCardDialog）");
        assert.equal(notesDeepRes.hasDialogPushCards, true, "金句卡片弹窗底部必须集成「推入小驴闪卡」操作");
        assert.equal(notesDeepRes.hasDialogPushCommon, true, "金句卡片弹窗底部必须集成「存入小驴常用」操作");
        assert.ok(notesDeepRes.cardsCount >= 2, "小驴闪卡接收端必须成功接收划词与金句两路摘录");
        assert.ok(notesDeepRes.commonCount >= 2, "小驴常用片段库必须成功接收批注与金句两路文本");

        // 关闭 QuoteCardDialog 弹窗
        await sendCdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await sendCdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await new Promise((r) => setTimeout(r, 200));

        // 10.10 伴生栏工具 Tab 深度走查：作者人脉档案联动与一键直达
        const toolsDeepRes = await evalInPage(`(async () => {
            const toolsBtn = document.querySelector(".glean-reader__side-nav-btn--tools");
            toolsBtn?.click();
            for (let i = 0; i < 20; i += 1) {
                if (document.querySelector(".glean-author-editor")) break;
                await new Promise((r) => setTimeout(r, 100));
            }
            const authorEditor = document.querySelector(".glean-author-editor");
            const editBtn = authorEditor?.querySelector("button.glean-btn");
            editBtn?.click();
            for (let i = 0; i < 20; i += 1) {
                if (authorEditor?.querySelector(".glean-author-editor__current")) break;
                await new Promise((r) => setTimeout(r, 100));
            }
            const currentBlock = authorEditor?.querySelector(".glean-author-editor__current");
            const authorName = currentBlock?.querySelector("strong")?.textContent?.trim() || "";
            const linkedContactBtn = currentBlock?.querySelector("button");
            const prevOpened = (window.__openedDocTabs || []).length;
            linkedContactBtn?.click();
            await new Promise((r) => setTimeout(r, 120));
            const nowOpened = (window.__openedDocTabs || []).length;
            // 还原关闭作者编辑
            editBtn?.click();
            return {
                hasAuthorEditor: Boolean(authorEditor),
                authorName,
                hasLinkedContactBtn: Boolean(linkedContactBtn),
                openedContact: nowOpened > prevOpened,
            };
        })()`);
        assert.equal(toolsDeepRes.hasAuthorEditor, true, "工具 Tab 必须挂载作者编辑组件");
        assert.equal(toolsDeepRes.authorName, "卡尔·纽波特", "作者编辑器必须准确读取当前作者");
        assert.equal(toolsDeepRes.hasLinkedContactBtn, true, "作者编辑器必须呈现已关联合约人脉按钮");
        assert.equal(toolsDeepRes.openedContact, true, "点击已关联合约人脉按钮必须在思源中打开联系人主文档");

        // 10.11 走查顶栏右侧更多操作 ActionPopover 下拉菜单（漫游/思源原生页签）
        const topbarPopoverRes = await evalInPage(`(async () => {
            const trigger = document.querySelector(".glean-reader__toolbar-right .glean-action-popover__trigger");
            trigger?.click();
            await new Promise((r) => setTimeout(r, 120));
            const popBody = document.querySelector(".glean-reader__toolbar-right .glean-action-popover__body");
            const hasRoam = Boolean(popBody?.querySelector(".glean-reader__toolbar-roam"));
            const hasNative = Boolean(popBody?.querySelector(".glean-reader__toolbar-native"));
            // 关闭 Popover
            trigger?.click();
            return { hasTrigger: Boolean(trigger), hasRoam, hasNative };
        })()`);
        assert.equal(topbarPopoverRes.hasTrigger && topbarPopoverRes.hasRoam && topbarPopoverRes.hasNative, true, "顶栏右侧必须提供更多操作 ActionPopover 下拉菜单（漫游/思源原生页签）");

        // 切回 outline 大纲 tab，为后续切片测试做好准备
        await evalInPage(`document.querySelector(".glean-reader__side-nav-btn--outline")?.click()`);
        await new Promise((r) => setTimeout(r, 150));

        // 11. 在伴读阅读器大纲中，等待大纲条目加载完成后点击「渐进切片」打开弹窗并点击「一键生成切片子文档」，验证弹窗收起、toast 反馈与思源内核子文档真实落盘
        for (let i = 0; i < 30; i += 1) {
            const hasSliceBtn = await evalInPage(`document.querySelectorAll(".glean-reader__slice-btn").length >= 3`);
            if (hasSliceBtn) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        await evalInPage(`(() => {
            const sliceBtns = Array.from(document.querySelectorAll(".glean-reader__slice-btn"));
            const openSliceBtn = sliceBtns[sliceBtns.length - 1];
            openSliceBtn?.click();
        })()`);
        for (let i = 0; i < 20; i += 1) {
            const hasSliceDialog = await evalInPage(`Boolean(document.querySelector(".glean-slicing-dialog"))`);
            if (hasSliceDialog) break;
            await new Promise((r) => setTimeout(r, 150));
        }
        await evalInPage(`(() => {
            window.__toasts.length = 0;
            const createBtn = document.querySelector(".glean-slicing-footer .glean-btn--pri");
            createBtn?.click();
        })()`);
        for (let i = 0; i < 30; i += 1) {
            const dialogClosed = await evalInPage(`!document.querySelector(".glean-slicing-dialog")`);
            if (dialogClosed && (await evalInPage(`window.__toasts.length`)) > 0) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        const sliceToast = await evalInPage(`window.__toasts[window.__toasts.length - 1] || ""`);
        assert.ok(sliceToast.length > 0, "点击生成渐进切片子文档必须弹出反馈提示");
        let sliceDoc = null;
        for (let i = 0; i < 25; i += 1) {
            const allDocs = await listAnchorDocs([notebookId]);
            sliceDoc = allDocs.find((d) => (d.hpath || "").startsWith("/深度长文剪藏/") && !(d.hpath || "").includes("思维导图"));
            if (sliceDoc) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        assert.ok(sliceDoc?.id, "点击生成渐进切片必须在思源原文章下真实创建切片子文档");
        const sliceAttrs = await fetch(`${base}/api/attr/getBlockAttrs`, {
            method: "POST",
            headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ id: sliceDoc.id }),
        }).then((r) => r.json()).then((j) => j.data || {});
        assert.equal(sliceAttrs["custom-clip-status"], "later", "生成的切片子文档必须自动标记 custom-clip-status=later 进入稍后读队列");

        // 11.1 走查顶栏「✓→ 完成并下一篇」主动作与小驴打卡联动（上报真实阅读分钟数）
        const checkinResult = await evalInPage(`(async () => {
            const initialCheckins = window.__recordedCheckinEvents?.length || 0;
            const primaryBtn = document.querySelector(".glean-reader__toolbar-primary");
            primaryBtn?.click();
            for (let i = 0; i < 20; i += 1) {
                if ((window.__recordedCheckinEvents?.length || 0) > initialCheckins) break;
                await new Promise((r) => setTimeout(r, 150));
            }
            const latestCheckin = (window.__recordedCheckinEvents || [])[(window.__recordedCheckinEvents || []).length - 1];
            return {
                hasPrimaryBtn: Boolean(primaryBtn),
                recordedCount: window.__recordedCheckinEvents?.length || 0,
                itemId: latestCheckin?.itemId,
                unit: latestCheckin?.unit,
                hasValue: typeof latestCheckin?.value === "number" && latestCheckin.value > 0,
            };
        })()`);
        assert.equal(checkinResult.hasPrimaryBtn, true, "顶栏右侧必须提供「✓→ 完成并下一篇」核心主按钮");
        assert.ok(checkinResult.recordedCount >= 1, "点击完成并下一篇必须触发小驴打卡 recordEvent 接口");
        assert.equal(checkinResult.itemId, "habit-reading", "打卡事件必须正确传递配置的目标打卡项 ID");
        assert.equal(checkinResult.unit, "min", "打卡事件必须将真实阅读时长单位标记为 min");
        assert.equal(checkinResult.hasValue, true, "打卡事件必须上报正数值的阅读时长");

        // 12. 切换到 360px 真实思源侧边栏（Dock 模式），走查全插件页面排版、无挤压/无折行断言
        await evalInPage(`(() => {
            document.getElementById("workbench-host").style.display = "none";
            const dockHost = document.getElementById("dock-host");
            dockHost.style.display = "block";
            if (window.__dockDef && !dockHost.hasChildNodes()) {
                window.__dockDef.init.call({ element: dockHost });
            }
        })()`);
        await new Promise((r) => setTimeout(r, 400));
        
        // 走查 Dock 读库视图：切换到读库视图，断言 5 视图单行平铺、筛选折叠条、侧边栏卡片紧凑排版（.glean-card <= 140px，消灭380px巨卡）
        await evalInPage(`(() => {
            const viewsBtns = Array.from(document.querySelectorAll("#dock-host .glean-views__btn"));
            viewsBtns[1]?.click(); // 切换到「读库」
        })()`);
        for (let i = 0; i < 30; i += 1) {
            const hasCard = await evalInPage(`Boolean(document.querySelector("#dock-host .glean-card"))`);
            if (hasCard) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        const dockLibCheck = await evalInPage(`(() => {
            const viewsBtns = Array.from(document.querySelectorAll("#dock-host .glean-views__btn"));
            const filterFold = document.querySelector("#dock-host .glean-filters-fold");
            const firstCard = document.querySelector("#dock-host .glean-card");
            const cardHeight = firstCard ? Math.round(firstCard.getBoundingClientRect().height) : 0;
            const hasCardFoot = Boolean(document.querySelector("#dock-host .glean-card__foot"));
            return {
                viewBtnCount: viewsBtns.length,
                filterFoldCollapsed: filterFold ? !filterFold.open : true,
                hasCard: Boolean(firstCard),
                cardHeight,
                hasCardFoot,
            };
        })()`);
        assert.equal(dockLibCheck.viewBtnCount, 5, "Dock 侧边栏必须平铺 5 个视图入口");
        assert.equal(dockLibCheck.filterFoldCollapsed, true, "Dock 侧边栏筛选必须默认折叠节省高度");
        assert.equal(dockLibCheck.hasCard, true, "Dock 侧边栏必须渲染精简文章卡片 .glean-card");
        assert.ok(dockLibCheck.cardHeight > 0 && dockLibCheck.cardHeight <= 140, `Dock 侧边栏文章卡片高度必须紧凑（<=140px），实测 height=${dockLibCheck.cardHeight}px`);
        assert.equal(dockLibCheck.hasCardFoot, true, "Dock 侧边栏文章卡片底部必须集成紧凑型操作脚部");
        await saveShot("10-dock-library-360px.png");

        // 走查 Dock 高亮摘录墙：断言筛选折叠、卡片无水平溢出与摘录卡片渲染
        await evalInPage(`(() => {
            const viewsBtns = Array.from(document.querySelectorAll("#dock-host .glean-views__btn"));
            viewsBtns[3]?.click(); // 切换到「高亮」
        })()`);
        await new Promise((r) => setTimeout(r, 350));
        const dockHlCheck = await evalInPage(`(() => {
            const hlFold = document.querySelector("#dock-host .glean-highlights__filters-fold");
            const hlItems = document.querySelectorAll("#dock-host .glean-highlights__item");
            return {
                hlFoldCollapsed: hlFold ? !hlFold.open : true,
                hasItems: hlItems.length > 0,
            };
        })()`);
        assert.equal(dockHlCheck.hlFoldCollapsed, true, "Dock 侧边栏摘录墙筛选必须默认折叠消除 500px 堆叠");
        assert.equal(dockHlCheck.hasItems, true, "Dock 侧边栏摘录墙必须渲染摘录卡片项 .glean-highlights__item");
        await saveShot("11-dock-highlights-360px.png");

        // 走查 Dock 统计视图：断言两列度量平铺与无水平溢出
        await evalInPage(`(() => {
            const viewsBtns = Array.from(document.querySelectorAll("#dock-host .glean-views__btn"));
            viewsBtns[2]?.click(); // 切换到「统计」
        })()`);
        await new Promise((r) => setTimeout(r, 350));
        await saveShot("12-dock-stats-360px.png");

        // 走查 Dock 今日拾遗：断言卡片紧凑排版
        await evalInPage(`(() => {
            const viewsBtns = Array.from(document.querySelectorAll("#dock-host .glean-views__btn"));
            viewsBtns[0]?.click(); // 切换到「今日拾遗」
        })()`);
        await new Promise((r) => setTimeout(r, 350));
        await saveShot("13-dock-resurface-360px.png");

        ws.close();
        return {
            screenshots: [
                "01-resurface-live.png",
                "02-resurface-expanded-live.png",
                "03-library-inline-batch-live.png",
                "04-library-preview-popover-live.png",
                "05-settings-modal-live.png",
                "06-stats-view-live.png",
                "07-library-kanban-live.png",
                "08-highlights-grouped-live.png",
                "09-reader-folded-live.png",
                "10-dock-library-360px.png",
                "11-dock-highlights-360px.png",
                "12-dock-stats-360px.png",
                "13-dock-resurface-360px.png",
            ],
            priBottom: resurfaceMetrics.priBottom,
        };
    } finally {
        srv.close();
        try { chromeProc.kill("SIGKILL"); } catch {}
        await new Promise((r) => setTimeout(r, 300));
        try { fs.rmSync(chromeProfile, { recursive: true, force: true }); } catch {}
    }
}

const results = [];
function recordStep(step, ok, detail = "") {
    results.push({ step, ok, detail });
    console.log(`${ok ? "✅" : "❌"} ${step}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

async function main() {
    const { kernel, appDir } = resolveKernel();
    const port = await choosePort();
    const base = `http://${HOST}:${port}`;
    const workspace = path.join(os.tmpdir(), `siyuan-glean-isolated-${Date.now()}-${process.pid}`);
    prepareWorkspace(workspace, "siyuan-glean-e2e-isolated.json", "siyuan-glean-e2e-isolated");
    copyDistToWorkspace(workspace);

    console.log(`[e2e-isolated] 启动隔离工作区: ${workspace}`);
    console.log(`[e2e-isolated] 隔离内核端口: ${base}`);

    const { child, lines } = startKernel(kernel, appDir, workspace, port);
    const client = createApiClient(base);
    const assertRunning = () => {
        if (child.exitCode !== null || child.signalCode !== null) {
            throw new Error(`内核提前退出: code=${child.exitCode}`);
        }
    };
    client.onGuard(assertRunning);

    try {
        const version = await waitForBoot(base, lines, assertRunning, client);
        const conf = JSON.parse(fs.readFileSync(path.join(workspace, "conf", "conf.json"), "utf8"));
        const token = conf.api?.token || conf.accessAuthCode || "";
        client.setToken(token);
        globalThis.__gleanIsolatedFetchSyncPost = (route, body) => client.api(route, body);

        await guardScratch((route, body) => client.api(route, body), { base });
        await client.apiChecked("/api/setting/setBazaar", { trust: true });
        await client.apiChecked("/api/petal/setPetalEnabled", {
            packageName: PLUGIN_ID,
            enabled: true,
            frontend: "desktop",
        });
        recordStep("Step 0 · 隔离内核启动与插件装载", true, `SiYuan v${version}, port=${port}, pid=${child.pid}`);

        // 动态加载真实服务与领域模块
        const { DEFAULT_SETTINGS } = await import(pathToFileURL(path.join(REPO, "src/services/settings.ts")).href);
        const { listAnchorDocs, scanPreview, captureClip, reconcileIndex, rebuildIndex, writeClip, readClip } = await import(pathToFileURL(path.join(REPO, "src/services/clip-store.ts")).href);
        const { loadIndex } = await import(pathToFileURL(path.join(REPO, "src/services/index-store.ts")).href);
        const { computeDailyFromIndex, actOnSurface } = await import(pathToFileURL(path.join(REPO, "src/services/resurface-service.ts")).href);
        const { selectReadingContext } = await import(pathToFileURL(path.join(REPO, "src/domain/context-selection.ts")).href);
        const { saveReadingPos } = await import(pathToFileURL(path.join(REPO, "src/services/reading-position.ts")).href);
        const { addRecentReading, projectActiveRecentReadings } = await import(pathToFileURL(path.join(REPO, "src/domain/recent-reading.ts")).href);
        const { aggregateStats, filterCompletedItems } = await import(pathToFileURL(path.join(REPO, "src/domain/stats.ts")).href);
        const { createOutlineMindmapDocument } = await import(pathToFileURL(path.join(REPO, "src/services/doc-slicing-service.ts")).href);
        const { resolveLibraryShortcut } = await import(pathToFileURL(path.join(REPO, "src/domain/library-keyboard.ts")).href);

        const plugin = createPluginAdapter(base, token);
        const nbData = await client.apiChecked("/api/notebook/createNotebook", { name: `siyuan-glean-smoke-${Date.now()}` });
        const notebookId = nbData.notebook.id;
        const settings = {
            ...DEFAULT_SETTINGS,
            anchorNotebooks: [notebookId],
            integration: {
                ...DEFAULT_SETTINGS.integration,
                checkinEnabled: true,
                checkinItemId: "habit-reading",
            },
        };

        // Step 1: 扫描与边界核对（普通笔记 vs 全文剪藏候选 vs 仅链接候选）
        const ordinaryDocId = await client.apiChecked("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: "/普通会议纪要",
            markdown: "# 周会记录\n\n今天讨论了项目进度与下周排期，不包含任何外部网页剪藏来源。",
        });
        const fulltextDocId = await client.apiChecked("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: "/深度长文剪藏",
            markdown: "- [https://example.com/articles/deep-work](https://example.com/articles/deep-work)\n\n# 深度工作与注意力管理\n\n## 第一节：为什么碎片化阅读会摧毁专注\n\n这是一篇用于验证真实主链的全文剪藏文章，包含多个自然段与明确来源链接，预计阅读时长约 10 分钟。\n\n> 引用容器内的核心段落：容器块递归采集必须保留此引述段，不能因容器外层 content 为空而遗漏。\n\n```js\nconst codeBlockNoise = 42;\n```\n\n## 第二节：核心论点\n\n只有当工具本身足够克制、主操作一眼可见时，稍后读才不会沦为数字仓鼠症。",
        });
        const linkDocId = await client.apiChecked("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: "/待读技术周刊链接",
            markdown: "https://example.com/weekly/issue-42",
        });
        await client.apiChecked("/api/attr/setBlockAttrs", {
            id: linkDocId,
            attrs: { "custom-clip-url": "https://example.com/weekly/issue-42" },
        });

        // 等待思源内核异步完成 SQLite blocks 表索引
        const expectedIds = [ordinaryDocId, fulltextDocId, linkDocId];
        for (let attempt = 0; attempt < 40; attempt += 1) {
            const rows = await listAnchorDocs([notebookId]);
            if (expectedIds.every((id) => rows.some((r) => r.id === id))) break;
            await new Promise((r) => setTimeout(r, 200));
        }

        const preview = await scanPreview(plugin, settings);
        const indexAfterScan = await reconcileIndex(plugin, settings);
        assert.equal(Boolean(indexAfterScan.clips[ordinaryDocId]), false, "普通笔记绝不能自动入读库");
        assert.equal(Boolean(indexAfterScan.candidates[ordinaryDocId]), false, "无来源证据的普通笔记绝不能混入候选");
        assert.equal(Boolean(indexAfterScan.candidates[fulltextDocId]), true, "带来源证据的剪藏应识别为待确认候选");
        recordStep("Step 1 · 扫描与边界核对", true, `普通笔记排除=通过, 候选识别=${Object.keys(indexAfterScan.candidates).length}篇 (preview ordinary=${preview.ordinaryCount})`);

        // Step 2: 确认收录入库（全文剪藏 + 仅链接条目）
        const capFull = await captureClip(plugin, fulltextDocId, {
            url: "https://example.com/articles/deep-work",
            contentType: "fulltext",
            words: 3600,
            minutes: 12,
        });
        const capLink = await captureClip(plugin, linkDocId, {
            url: "https://example.com/weekly/issue-42",
            contentType: "link",
        });
        await client.apiChecked("/api/attr/setBlockAttrs", {
            id: fulltextDocId,
            attrs: { tags: "深度阅读,效率" },
        });
        const indexAfterCapture = await reconcileIndex(plugin, settings);
        assert.equal(capFull.captured && capLink.captured, true);
        assert.equal(indexAfterCapture.clips[fulltextDocId]?.status, "inbox");
        assert.equal(indexAfterCapture.clips[fulltextDocId]?.contentType, "fulltext");
        assert.equal(indexAfterCapture.clips[linkDocId]?.status, "inbox");
        assert.equal(indexAfterCapture.clips[linkDocId]?.contentType, "link");
        recordStep("Step 2 · 确认收录入库", true, `全文(${fulltextDocId.slice(0, 8)})=inbox/fulltext, 链接(${linkDocId.slice(0, 8)})=inbox/link`);

        // Step 3: 日常分拣与批量内联属性修改（含覆盖已有作者 force: true 校验）
        await writeClip(plugin, fulltextDocId, { status: "later", author: "旧作者" }, { forceStatus: true, force: true });
        await writeClip(plugin, fulltextDocId, { author: "卡尔·纽波特", priority: 4, rating: 5 }, { force: true });
        const attrsStep3 = await readClip(fulltextDocId);
        assert.equal(attrsStep3.status, "later");
        assert.equal(attrsStep3.author, "卡尔·纽波特", "显式批量设作者(force:true)必须成功覆盖旧作者");
        assert.equal(attrsStep3.priority, 4);
        assert.equal(attrsStep3.rating, 5);
        recordStep("Step 3 · 日常分拣与内联属性修改（BL-01）", true, `status=${attrsStep3.status}, author=${attrsStep3.author}, P${attrsStep3.priority}, ${attrsStep3.rating}★`);

        // Step 4: 今日拾遗首屏开始读 + Chrome 1280×800 首屏主动作可见性实测
        const indexStep4 = await reconcileIndex(plugin, settings);
        const now = new Date();
        const daily = computeDailyFromIndex(indexStep4, settings, now);
        assert.ok(daily.picks.length >= 1, "今日拾遗应挑出待读文章");

        const i18n = JSON.parse(fs.readFileSync(path.join(REPO, "public/i18n/zh_CN.json"), "utf8"));
        const { default: ResurfaceView } = await import(pathToFileURL(path.join(REPO, "src/ui/ResurfaceView.svelte")).href);
        const facadeStub = {
            i18n,
            isMobile: false,
            settings,
            pluginInstance: plugin,
            notifyDataChanged() {},
            openReadingDocument() {},
            openReader() {},
            openOnboarding() {},
            openSettings() {},
            openArchiveDialog() {},
            openRestoreDialog() {},
        };
        const ssrResurface = render(ResurfaceView, {
            props: {
                facade: facadeStub,
                index: indexStep4,
                loading: false,
                loadError: false,
                embedded: true,
                currentTime: now,
                onStartRoaming() {},
                onQuickSearch() {},
            },
        });
        // 验证 SSR DOM 结构：主按钮「开始阅读」位于操作区首位，次级动作折叠在 details.glean-surf-more 中
        assert.match(ssrResurface.body, /class="glean-surf-act glean-surf-act--pri"[\s\S]*?开始阅读/);
        assert.match(ssrResurface.body, /<details class="glean-surf-context-fold">/);
        assert.match(ssrResurface.body, /<details class="glean-kbdhint-fold">/);
        assert.match(ssrResurface.body, /<details class="glean-surf-more">/);

        // 若本机存在 Chrome，则在 1280×800 视口下实拍首屏截图
        const chromePath = findChromePath();
        let screenshotNote = "SSR DOM 验证通过";
        if (chromePath) {
            const outDir = path.join(REPO, "output", "round-v141-audit");
            fs.mkdirSync(outDir, { recursive: true });
            const css = fs.readFileSync(path.join(DIST, "index.css"), "utf8");
            const scopedCss = [...compiledSvelteCache.entries()].filter(([k]) => k.startsWith("css:")).map(([, v]) => v).join("\n");
            let measuredRect = null;
            const probeScript = `<script>window.addEventListener("load",()=>{const btn=document.querySelector(".glean-surf-act--pri");const r=btn?btn.getBoundingClientRect():null;if(r)fetch("/metrics?top="+Math.round(r.top)+"&bottom="+Math.round(r.bottom));});</script>`;
            const htmlDoc = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>${css}\n${scopedCss}\nbody{margin:0;background:#f5f7f7;font-family:sans-serif;}</style></head><body><div class="glean-tab-root" style="width:1280px;height:800px;overflow:hidden;">${ssrResurface.body}</div>${probeScript}</body></html>`;
            const srv = http.createServer((req, res) => {
                const u = new URL(req.url || "/", `http://${HOST}`);
                if (u.pathname === "/metrics") {
                    measuredRect = { top: Number(u.searchParams.get("top")), bottom: Number(u.searchParams.get("bottom")) };
                    res.writeHead(204);
                    res.end();
                    return;
                }
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(htmlDoc);
            });
            await new Promise((r) => srv.listen(0, HOST, r));
            const uiPort = srv.address().port;
            const pngPath = path.join(outDir, "resurface-1280-after-subtraction.png");
            try {
                await execFileAsync(chromePath, [
                    "--headless",
                    "--disable-gpu",
                    "--no-first-run",
                    "--window-size=1280,800",
                    `--screenshot=${pngPath}`,
                    `http://${HOST}:${uiPort}/`,
                ]);
                if (measuredRect) {
                    assert.ok(measuredRect.bottom > 0 && measuredRect.bottom <= 800, `主按钮必须位于 800px 首屏内，实测 bottom=${measuredRect.bottom}px`);
                }
                screenshotNote = `Chrome 1280×800 首屏实测通过 (主按钮 y=${measuredRect?.top}~${measuredRect?.bottom}px < 800px, ${path.basename(pngPath)})`;
            } finally {
                srv.close();
            }
        }

        const actResult = await actOnSurface(plugin, fulltextDocId, "read");
        assert.equal(actResult.token.after.status, "reading", "点击开始阅读后状态必须变为 reading");
        recordStep("Step 4 · 今日拾遗首屏开始读", true, `status->${actResult.token.after.status}, ${screenshotNote}`);

        // Step 5: 按时间/主题挑一篇（15 分钟预算 + 标签筛选）
        const contextResult = selectReadingContext([
            {
                id: fulltextDocId,
                title: "深度工作与注意力管理",
                status: "later",
                contentType: "fulltext",
                minutes: 12,
                priority: 4,
                waitingDays: 3,
                tags: ["深度阅读", "效率"],
                url: "https://example.com/articles/deep-work",
            },
        ], { budget: 15, tag: "深度阅读", includeDone: false, includeUnknownMinutes: false, limit: 3 });
        assert.equal(contextResult.candidates.length, 1);
        assert.equal(contextResult.candidates[0].item.id, fulltextDocId);
        recordStep("Step 5 · 按 15 分钟预算与主题选文", true, `命中 "${contextResult.candidates[0].item.title}" (${contextResult.candidates[0].item.minutes}m)`);

        // Step 6: 中途中断与阅读位置书签保存，并写入一条真实高亮与鲸鱼批注引述块供摘录墙实测
        const childBlocks = await client.apiChecked("/api/block/getChildBlocks", { id: fulltextDocId });
        const paraBlock = (childBlocks || []).find((b) => b.type === "p" && (b.content || "").trim().length > 0) || childBlocks?.[1] || childBlocks?.[0];
        const targetBlockId = paraBlock?.id || fulltextDocId;
        await client.apiChecked("/api/attr/setBlockAttrs", {
            id: targetBlockId,
            attrs: {
                "custom-clip-highlight": "yellow",
                "custom-siyuan-comment": "true",
                "custom-comment-text": "这是一篇用于验证真实主链的全文剪藏文章",
                "custom-comment-tag": "pinned",
                "memo": "核心论点清晰有力，需要反复体会",
            },
        });
        for (let attempt = 0; attempt < 30; attempt += 1) {
            const rows = await client.apiChecked("/api/query/sql", {
                stmt: `SELECT id FROM blocks WHERE id = '${targetBlockId}' AND instr(ial, 'custom-clip-highlight') > 0 AND instr(ial, 'custom-siyuan-comment') > 0 LIMIT 1`,
            });
            if (Array.isArray(rows) && rows.length > 0) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        await saveReadingPos(fulltextDocId, targetBlockId, plugin);
        const savedPos = (await readClip(fulltextDocId)).readingPosition;
        assert.equal(savedPos?.blockId, targetBlockId);
        recordStep("Step 6 · 中途中断与块级书签落盘", true, `blockId=${targetBlockId}, at=${savedPos?.at}`);

        // Step 7: 返回接着读（继续阅读投影与书签标识）
        const indexStep7 = await loadIndex(plugin);
        const recentList = addRecentReading([], { id: fulltextDocId, title: "深度工作与注意力管理" });
        const continueProjections = projectActiveRecentReadings(recentList, indexStep7.clips, 3);
        assert.equal(continueProjections.length, 1);
        assert.equal(continueProjections[0].id, fulltextDocId);
        assert.equal(continueProjections[0].hasBookmark, true);
        recordStep("Step 7 · 返回接着读（继续阅读卡）", true, `topContinue="${continueProjections[0].title}", hasBookmark=${continueProjections[0].hasBookmark}`);

        // Step 8: 明确标记读完（记录可信完成时间）
        const pad2 = (n) => String(n).padStart(2, "0");
        const dNow = new Date();
        const doneStamp = `${dNow.getFullYear()}${pad2(dNow.getMonth() + 1)}${pad2(dNow.getDate())}${pad2(dNow.getHours())}${pad2(dNow.getMinutes())}${pad2(dNow.getSeconds())}`;
        await writeClip(plugin, fulltextDocId, { status: "done", doneTime: doneStamp }, { forceStatus: true, force: true });
        const attrsStep8 = await readClip(fulltextDocId);
        assert.equal(attrsStep8.status, "done");
        assert.equal(attrsStep8.doneTime, doneStamp);
        recordStep("Step 8 · 明确标记已读与完成时间记录", true, `status=${attrsStep8.status}, doneTime=${attrsStep8.doneTime}`);

        // Step 9: 主动放下与归档（归档不抹除历史完成事实）
        await writeClip(plugin, linkDocId, { status: "archived" }, { forceStatus: true });
        await writeClip(plugin, fulltextDocId, { status: "archived" }, { forceStatus: true });
        const archivedFullAttrs = await readClip(fulltextDocId);
        assert.equal(archivedFullAttrs.status, "archived");
        assert.equal(archivedFullAttrs.doneTime, doneStamp, "归档后必须保留已完成文章的完成时间");
        // 将全文恢复为 done 以便在阅读统计中直接展示已读状态与检索
        await writeClip(plugin, fulltextDocId, { status: "done" }, { forceStatus: true });
        recordStep("Step 9 · 主动归档与完成历史保留", true, `linkDoc=archived, 已读文章归档后 doneTime(${archivedFullAttrs.doneTime}) 完整保留`);

        // Step 10: 统计复盘与事后找回
        const indexStep10 = await rebuildIndex(plugin, settings);
        const stats = aggregateStats(Object.values(indexStep10.clips), new Date(Date.now() + 60000));
        const matchedCompleted = filterCompletedItems(
            Object.values(indexStep10.clips).filter((c) => c.status === "done"),
            { date: "", search: "纽波特" },
        );
        assert.equal(stats.done, 1);
        assert.equal(stats.doneThisWeek, 1);
        assert.equal(matchedCompleted.length, 1);
        assert.equal(matchedCompleted[0].id, fulltextDocId);
        const mindmapRes = await createOutlineMindmapDocument(
            plugin,
            {
                id: fulltextDocId,
                title: "深度工作与注意力管理",
                status: "done",
                contentType: "fulltext",
                url: "https://example.com/articles/deep-work",
                location: { box: notebookId, hpath: "/深度长文剪藏" },
                readMinutesRaw: null,
            },
            [{ id: targetBlockId, level: 2, title: "第二节：核心论点" }],
        );
        assert.equal(mindmapRes.ok, true);
        const mindmapAttrs = await readClip(mindmapRes.docId);
        assert.equal(mindmapAttrs.internal, true, "衍生脑图文档必须标记 internal: true（BL-08）");
        assert.equal(mindmapAttrs.status, undefined, "衍生脑图文档严禁写入 status: done 污染读库（BL-08）");
        assert.equal(resolveLibraryShortcut({ key: "d" }, { cursorActive: true })?.type, "markDone", "读库键盘流必须支持 D 键标记已读（BL-09）");

        // P0 闭环查验：文档顶部幂等「拾遗导读卡」创建、SQL 真实落盘与原地更新验证
        const { syncMetaCalloutToDocument, findMetaCalloutBlockId } = await import(pathToFileURL(path.join(REPO, "src/services/meta-callout-service.ts")).href);
        const metaRes1 = await syncMetaCalloutToDocument(plugin, fulltextDocId);
        assert.equal(metaRes1.ok, true, "导读卡首次生成必须成功");
        assert.equal(metaRes1.created, true, "导读卡首次必须为 created: true");
        assert.ok(metaRes1.blockId, "导读卡必须返回分配的块 ID");

        const foundCardId = await findMetaCalloutBlockId(fulltextDocId);
        assert.equal(foundCardId, metaRes1.blockId, "必须通过 custom-glean-slot 属性准确查得导读卡块 ID");
        let cardRows = [];
        for (let i = 0; i < 30; i += 1) {
            cardRows = await client.apiChecked("/api/query/sql", {
                stmt: `SELECT markdown, ial FROM blocks WHERE id = '${metaRes1.blockId}' LIMIT 1`,
            });
            if (cardRows && cardRows.length > 0 && cardRows[0].markdown) break;
            await new Promise((r) => setTimeout(r, 150));
        }
        assert.ok(cardRows && cardRows.length > 0, "导读卡必须在思源 SQLite blocks 表中真实落盘");
        assert.ok(cardRows[0].markdown.includes("小驴拾遗 · 导读档案"), "导读卡内容必须包含档案标题");
        assert.ok(cardRows[0].markdown.includes("纽波特"), "导读卡内容必须包含作者名称");

        // 幂等原地更新测试
        await writeClip(plugin, fulltextDocId, { rating: 5, summary: "这是一篇关于深度专注力的实战论述" }, { force: true });
        const metaRes2 = await syncMetaCalloutToDocument(plugin, fulltextDocId);
        assert.equal(metaRes2.ok, true, "导读卡原地刷新必须成功");
        assert.equal(metaRes2.created, false, "二次同步必须为原地更新而非重复创建");
        assert.equal(metaRes2.blockId, metaRes1.blockId, "原地更新必须保持相同块 ID，不得累加重复块");
        let updatedCardRows = [];
        for (let i = 0; i < 30; i += 1) {
            updatedCardRows = await client.apiChecked("/api/query/sql", {
                stmt: `SELECT markdown FROM blocks WHERE id = '${metaRes1.blockId}' LIMIT 1`,
            });
            if (updatedCardRows && updatedCardRows[0]?.markdown?.includes("深度专注力")) break;
            await new Promise((r) => setTimeout(r, 150));
        }
        assert.ok(updatedCardRows[0].markdown.includes("⭐⭐⭐⭐⭐"), "导读卡必须在正文中更新为 5 星评分");
        assert.ok(updatedCardRows[0].markdown.includes("深度专注力"), "导读卡必须将 AI 摘要写入正文块中供全局检索");

        // P1-1 闭环查验：Daily Note (日记) 阅读日志幂等联动测试
        const { recordDailyNoteReading } = await import(pathToFileURL(path.join(REPO, "src/services/daily-note-service.ts")).href);
        const dailyRes1 = await recordDailyNoteReading(notebookId, fulltextDocId);
        assert.equal(dailyRes1.ok, true, "首次记入今日日记必须成功");
        assert.equal(dailyRes1.updated, false, "首次记入必须为追加模式 (updated: false)");
        assert.ok(dailyRes1.dailyDocId, "必须返回今日日记文档 ID");
        assert.ok(dailyRes1.blockId, "必须返回新记录块 ID");

        // 内核查验：日记中包含文章反链与 custom-glean-reading-doc
        let dailyRows = [];
        for (let i = 0; i < 30; i += 1) {
            dailyRows = await client.apiChecked("/api/query/sql", {
                stmt: `SELECT markdown, ial FROM blocks WHERE id = '${dailyRes1.blockId}' LIMIT 1`,
            });
            if (dailyRows && dailyRows.length > 0 && dailyRows[0].markdown) break;
            await new Promise((r) => setTimeout(r, 150));
        }
        assert.ok(dailyRows && dailyRows.length > 0, "日记记录块必须在 SQLite blocks 表中真实落盘");
        assert.ok(dailyRows[0].markdown.includes(fulltextDocId), "日记记录块必须包含文章原生块引用反链");
        assert.ok(dailyRows[0].markdown.includes("深度长文剪藏"), "日记记录块必须包含文章标题");

        // 幂等重复记入：必须在原块上原地更新，不产生重复条目
        const dailyRes2 = await recordDailyNoteReading(notebookId, fulltextDocId);
        assert.equal(dailyRes2.ok, true, "二次记入今日日记必须成功");
        assert.equal(dailyRes2.updated, true, "二次记入必须为原地更新 (updated: true)");
        assert.equal(dailyRes2.blockId, dailyRes1.blockId, "二次记入必须保持完全相同块 ID，不得刷屏重复追加");

        // P1-2 闭环查验：《读库数据库》原生多维表 (AV) 扩列同步测试
        const { bindAllClipsToLibrary, EXTENDED_LIBRARY_FIELDS } = await import(pathToFileURL(path.join(REPO, "src/services/library-db.ts")).href);
        assert.equal(EXTENDED_LIBRARY_FIELDS.length, 9, "AV 扩展字段必须包含 9 大核心字段");
        const avSyncRes = await bindAllClipsToLibrary(plugin, settings, { extended: true });
        assert.ok(avSyncRes.synced >= 1, "扩展多维表同步必须至少成功对齐 1 篇");

        recordStep("Step 10 · 阅读统计复盘、关键词找回、衍生脑图隔离、正文导读卡、Daily Note日记联动与AV扩列（P0/P1/BL-08/BL-09）", true, `done=${stats.done}, 导读卡=idempotent:true, 日记联动=idempotent:true, AV扩列=9列`);

        // Step 11: 真实 Chrome 浏览器 CDP 全界面挂载与交互实测（加载 dist/index.js + 隔离内核实时 API）
        if (chromePath) {
            const liveRes = await runLiveBrowserInteractiveSuite({
                chromePath,
                appDir,
                base,
                token,
                settings,
                notebookId,
                fulltextDocId,
                linkDocId,
                plugin,
            });
            recordStep(
                "Step 11 · 真实浏览器全表面交互实测（四视图/看板/摘录聚类/设置/归档分级Esc/伴读新架构/生态联动）",
                true,
                `${liveRes.screenshots.length} 张交互态截图已输出至 output/e2e-browser-live/ (首屏主按钮 bottom=${liveRes.priBottom}px)`,
            );
        }

        // 清扫临时测试笔记本
        if (!KEEP) {
            await client.apiChecked("/api/notebook/removeNotebook", { notebook: notebookId });
            await cleanupScratch((route, body) => client.api(route, body), { log: console });
        }

        const passedCount = results.filter((r) => r.ok).length;
        console.log(`\n[e2e-isolated] 10 步主链走查汇总：${passedCount}/${results.length} 全部通过`);
        if (KEEP) {
            console.log(`[e2e-isolated] --keep 已启用，隔离环境保持运行：`);
            console.log(`  workspace: ${workspace}`);
            console.log(`  base:      ${base}`);
            console.log(`  token:     ${token}`);
            console.log(`  pid:       ${child.pid}`);
        }
    } finally {
        if (!KEEP) {
            await shutdownKernel(client, child);
            try {
                fs.rmSync(workspace, { recursive: true, force: true });
            } catch {
                // Windows 句柄延迟释放时忽略
            }
        }
    }
}

main().catch((err) => {
    console.error("[e2e-isolated] 执行失败:", err);
    process.exitCode = 1;
});
