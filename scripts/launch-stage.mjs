/**
 * 小驴拾遗 · 独立靶场与可视化实机体验环境启动脚本
 *
 * 1. 默认在 D 盘建立专属独立思源工作区 (D:\SiYuan-Glean-Stage)；
 * 2. 分配独立测试端口 (46919，与小驴管家 43919 及作者主实例 6806 严格区隔)；
 * 3. 部署生产 dist/ 产物并注册 petals.json 信任插件；
 * 4. 自动生成专属测试笔记本与带有「正文导读档案卡」的示范长文；
 * 5. 在后台持久运行，输出可在浏览器中直接打开的桌面端完整网页入口：
 *    http://127.0.0.1:46919/stage/build/desktop/
 *
 * 用法：
 *   node scripts/launch-stage.mjs          # 启动或保鲜独立靶场
 *   node scripts/launch-stage.mjs --stop   # 停止当前靶场内核实例
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMetaCalloutMarkdown } from "../src/domain/meta-callout.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(REPO, "dist");
const PLUGIN_ID = "siyuan-glean";
const HOST = "127.0.0.1";
const DEFAULT_PORT = 46919;
const DEFAULT_WORKSPACE = "D:\\SiYuan-Glean-Stage";
const MARKER_FILE = "siyuan-glean-stage.json";
const SESSION_FILE = "stage-session.json";

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        stop: args.includes("--stop"),
        port: DEFAULT_PORT,
        workspace: DEFAULT_WORKSPACE,
    };
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === "--port" && args[i + 1]) {
            options.port = Number(args[i + 1]);
            i += 1;
        } else if (args[i] === "--workspace" && args[i + 1]) {
            options.workspace = path.resolve(args[i + 1]);
            i += 1;
        }
    }
    return options;
}

function resolvePowerShell() {
    const paths = [
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "C:\\Windows\\System32\\powershell.exe",
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return "powershell.exe";
}

function resolveTaskkill() {
    const p = "C:\\Windows\\System32\\taskkill.exe";
    return fs.existsSync(p) ? p : "taskkill";
}

function resolveKernel() {
    const candidates = [
        process.env.SIYUAN_KERNEL,
        "D:\\RJ\\SiYuan\\resources\\kernel\\SiYuan-Kernel.exe",
        "D:\\biji\\SiYuan\\resources\\kernel\\SiYuan-Kernel.exe",
        path.join(process.env.ProgramFiles || "C:\\Program Files", "SiYuan", "resources", "kernel", "SiYuan-Kernel.exe"),
    ].filter(Boolean);
    const kernel = candidates.find((c) => fs.existsSync(c));
    if (!kernel) throw new Error("未找到 SiYuan-Kernel.exe，请检查思源安装路径");
    const appDir = path.resolve(path.dirname(kernel), "..");
    for (const req of ["stage", "appearance"]) {
        if (!fs.existsSync(path.join(appDir, req))) throw new Error(`思源 resources 缺少 ${req}: ${appDir}`);
    }
    return { kernel, appDir };
}

function checkPortFree(port) {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.once("error", reject);
        srv.listen({ host: HOST, port, exclusive: true }, () => srv.close((e) => (e ? reject(e) : resolve())));
    });
}

function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function readSession(workspace) {
    const sessionPath = path.join(workspace, SESSION_FILE);
    if (!fs.existsSync(sessionPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    } catch {
        return null;
    }
}

function stopRunningInstance(workspace) {
    const session = readSession(workspace);
    if (!session?.pid) {
        console.log(`[stage] 工作区 ${workspace} 未发现活跃的 session 记录`);
        return;
    }
    if (isPidAlive(session.pid)) {
        try {
            if (process.platform === "win32") {
                execSync(`"${resolveTaskkill()}" /F /PID ${session.pid}`, { stdio: "ignore" });
            } else {
                process.kill(session.pid, "SIGKILL");
            }
            console.log(`[stage] 已成功停止内核进程 PID=${session.pid} (端口 ${session.port})`);
        } catch (e) {
            console.warn(`[stage] 停止内核进程失败: ${e.message}`);
        }
    } else {
        console.log(`[stage] 记录中的 PID=${session.pid} 已经退出`);
    }
    try {
        fs.unlinkSync(path.join(workspace, SESSION_FILE));
    } catch {}
}

function prepareWorkspace(workspace) {
    fs.mkdirSync(path.join(workspace, "data", "storage", "petal"), { recursive: true });
    fs.mkdirSync(path.join(workspace, "data", "plugins", PLUGIN_ID), { recursive: true });
    fs.writeFileSync(
        path.join(workspace, MARKER_FILE),
        JSON.stringify({ createdBy: "siyuan-glean-stage", createdAt: new Date().toISOString() }, null, 2) + "\n"
    );
}

function copyPluginDist(workspace) {
    if (!fs.existsSync(path.join(DIST, "index.js"))) {
        throw new Error("dist/index.js 不存在，请先运行 pnpm build");
    }
    const target = path.join(workspace, "data", "plugins", PLUGIN_ID);
    fs.cpSync(DIST, target, { recursive: true });

    const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "plugin.json"), "utf8"));
    const petalsPath = path.join(workspace, "data", "storage", "petal", "petals.json");
    const petals = [
        {
            name: PLUGIN_ID,
            displayName: manifest.displayName?.["zh-CN"] || manifest.displayName?.default || "小驴拾遗",
            version: manifest.version || "1.4.2",
            enabled: true,
            incompatible: false,
            disabledInPublish: true,
            userDisabledInPublish: false,
            disallowInstall: false,
            js: "",
            css: "",
            i18n: null,
            kernel: { js: "", existed: true, incompatible: false },
        },
    ];
    fs.writeFileSync(petalsPath, JSON.stringify(petals, null, "\t"));
}

async function requestKernel(base, token, route, body = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Token ${token}`;
    const res = await fetch(`${base}${route}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });
    return res.json();
}

async function waitForKernel(base, token) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        try {
            const p = await requestKernel(base, token, "/api/system/bootProgress");
            if (p?.code === 0 && Number(p?.data?.progress) >= 100) return true;
        } catch {}
        await new Promise((r) => setTimeout(r, 400));
    }
    return false;
}

function readToken(workspace) {
    try {
        const conf = JSON.parse(fs.readFileSync(path.join(workspace, "conf", "conf.json"), "utf8"));
        return conf?.api?.token || "";
    } catch {
        return "";
    }
}

async function main() {
    const opts = parseArgs();

    if (opts.stop) {
        stopRunningInstance(opts.workspace);
        return;
    }

    // 检查是否有仍在运行的本靶场实例
    const existing = readSession(opts.workspace);
    if (existing && isPidAlive(existing.pid)) {
        console.log(`[stage] 检测到已有靶场实例在运行中:`);
        console.log(`  - 地址: ${existing.appUrl}`);
        console.log(`  - 端口: ${existing.port}`);
        console.log(`  - 进程: PID=${existing.pid}`);
        console.log(`  - 目录: ${existing.workspace}`);
        console.log(`[stage] 正在热更新最新插件代码到隔离目录...`);
        copyPluginDist(opts.workspace);
        console.log(`[stage] 插件代码已同步！请直接刷新网页体验：${existing.appUrl}`);
        return;
    }

    const { kernel, appDir } = resolveKernel();

    // 检查端口是否被占用
    try {
        await checkPortFree(opts.port);
    } catch {
        throw new Error(`端口 ${opts.port} 已被占用，请指定其他端口（如 node scripts/launch-stage.mjs --port 47919）`);
    }

    console.log(`[stage] 正在初始化 D 盘独立靶场: ${opts.workspace}`);
    prepareWorkspace(opts.workspace);
    copyPluginDist(opts.workspace);

    console.log(`[stage] 启动 SiYuan 内核 (端口 ${opts.port})...`);
    let pid = 0;
    if (process.platform === "win32") {
        const ps = resolvePowerShell();
        const pidOutput = execSync(
            `"${ps}" -NoProfile -Command "(Start-Process -FilePath '${kernel}' -ArgumentList 'serve','--workspace','${opts.workspace.replace(/'/g, "''")}','--wd','${appDir.replace(/'/g, "''")}','--port','${opts.port}','--lang','zh-CN' -WindowStyle Hidden -PassThru).Id"`,
            { encoding: "utf8" }
        ).trim();
        pid = Number(pidOutput) || 0;
    } else {
        const child = spawn(
            kernel,
            ["serve", "--workspace", opts.workspace, "--wd", appDir, "--port", String(opts.port), "--lang", "zh-CN"],
            { detached: true, stdio: "ignore" }
        );
        child.unref();
        pid = child.pid || 0;
    }

    const base = `http://${HOST}:${opts.port}`;
    const appUrl = `${base}/stage/build/desktop/`;

    console.log(`[stage] 等待内核就绪 (PID=${pid})...`);
    let token = "";
    const booted = await waitForKernel(base, token);
    if (!booted) {
        throw new Error(`内核在 ${base} 启动超时`);
    }

    token = readToken(opts.workspace);
    // 信任集市插件
    await requestKernel(base, token, "/api/setting/setBazaar", { trust: true, petal: true });

    // 初始化测试笔记本与精读文章
    try {
        const lsRes = await requestKernel(base, token, "/api/notebook/lsNotebooks");
        let notebookId = lsRes?.data?.notebooks?.[0]?.id;
        if (!notebookId) {
            const nbRes = await requestKernel(base, token, "/api/notebook/createNotebook", { name: "📖 拾遗测试工坊" });
            notebookId = nbRes?.data?.notebook?.id;
        }

        if (notebookId) {
            // 写入两篇示范文章
            const demoDocMd = `# 深度工作与注意力管理

> 🌐 来源：[https://example.com/articles/deep-work](https://example.com/articles/deep-work)
> ✍️ 作者：卡尔·纽波特

在信息高度碎片化的时代，深度工作能力正变得像工业时代的机器生产力一样稀缺。

### 第一节：注意力残留的代价
当你从一项任务快速切换到另一项任务时，你的注意力并不会瞬间完整转移。总有一部分认知带宽滞留在上一项工作中，这就是注意力残留。

> 💡 即使是一秒钟的通知打断，也会在神经层面留下长达数分钟的认知碎片。

### 第二节：构建深度工作仪式
真正的专注并不依靠脆弱的意志力，而是依靠结构化的仪式。固定时段、物理隔离、明确边界。
`;
            const docRes = await requestKernel(base, token, "/api/filetree/createDocWithMd", {
                notebook: notebookId,
                path: "/深度工作与注意力管理",
                markdown: demoDocMd,
            });
            const docId = docRes?.data;
            if (docId) {
                // 打上剪藏属性
                await requestKernel(base, token, "/api/attr/setBlockAttrs", {
                    id: docId,
                    attrs: {
                        "custom-clip-status": "reading",
                        "custom-clip-url": "https://example.com/articles/deep-work",
                        "custom-clip-site": "example.com",
                        "custom-clip-author": "卡尔·纽波特",
                        "custom-clip-priority": "4",
                        "custom-clip-rating": "5",
                        "custom-clip-words": "3200",
                        "custom-clip-minutes": "8",
                        "custom-clip-summary": "深入剖析注意力残留对脑力工作的结构性破坏，并提供建立仪式化专注的具体法则。",
                        "custom-clip-content-type": "fulltext",
                        "custom-clip-time": "20261031120000",
                    },
                });

                // 同步正文导读档案卡
                const calloutMd = buildMetaCalloutMarkdown({
                    id: docId,
                    title: "深度工作与注意力管理",
                    url: "https://example.com/articles/deep-work",
                    site: "example.com",
                    author: "卡尔·纽波特",
                    status: "reading",
                    priority: 4,
                    rating: 5,
                    words: 3200,
                    minutes: 8,
                    tags: ["深度阅读", "效率", "思维模型"],
                    summary: "深入剖析注意力残留对脑力工作的结构性破坏，并提供建立仪式化专注的具体法则。",
                });

                await requestKernel(base, token, "/api/block/prependBlock", {
                    dataType: "markdown",
                    parentID: docId,
                    data: calloutMd,
                });

                // 写入第 2 篇示范长文（稍后读）
                const demoDoc2Md = `# 为什么我们需要构建第二大脑

大脑是用来思考的，而不是用来记事的。通过结构化记录外包记忆，释放无限创造力。

### 第一节：数字时代的认知超载
每天我们接收的海量信息远超大脑的进化负荷。没有外部知识系统，我们只能陷入收藏夹的死胡同。

### 第二节：CODE 模型闭环
抓取 (Capture) ➔ 组织 (Organize) ➔ 提炼 (Distill) ➔ 表达 (Express)。
`;
                const doc2Res = await requestKernel(base, token, "/api/filetree/createDocWithMd", {
                    notebook: notebookId,
                    path: "/为什么我们需要构建第二大脑",
                    markdown: demoDoc2Md,
                });
                const doc2Id = doc2Res?.data;
                if (doc2Id) {
                    await requestKernel(base, token, "/api/attr/setBlockAttrs", {
                        id: doc2Id,
                        attrs: {
                            "custom-clip-status": "later",
                            "custom-clip-url": "https://example.com/articles/second-brain",
                            "custom-clip-site": "example.com",
                            "custom-clip-author": "蒂亚戈·福特",
                            "custom-clip-priority": "5",
                            "custom-clip-rating": "0",
                            "custom-clip-words": "2600",
                            "custom-clip-minutes": "7",
                            "custom-clip-summary": "介绍 CODE 知识流转模型，通过数字笔记系统建立个人第二大脑，实现从被动收藏到主动创造的飞跃。",
                            "custom-clip-content-type": "fulltext",
                            "custom-clip-time": "20261031121000",
                        },
                    });

                    const callout2Md = buildMetaCalloutMarkdown({
                        id: doc2Id,
                        title: "为什么我们需要构建第二大脑",
                        url: "https://example.com/articles/second-brain",
                        site: "example.com",
                        author: "蒂亚戈·福特",
                        status: "later",
                        priority: 5,
                        rating: 0,
                        words: 2600,
                        minutes: 7,
                        tags: ["知识管理", "心智模型"],
                        summary: "介绍 CODE 知识流转模型，通过数字笔记系统建立个人第二大脑，实现从被动收藏到主动创造的飞跃。",
                    });

                    await requestKernel(base, token, "/api/block/prependBlock", {
                        dataType: "markdown",
                        parentID: doc2Id,
                        data: callout2Md,
                    });
                }

                // 固化设置与索引到靶场存储中
                const petalStorage = path.join(opts.workspace, "data", "storage", "petal", PLUGIN_ID);
                fs.mkdirSync(petalStorage, { recursive: true });
                const defaultSettings = {
                    version: 1,
                    anchorNotebooks: [notebookId],
                    ai: {
                        enrichMode: "manual",
                        aiDailyCap: 20,
                        dedupOnEnrich: false,
                        relatedWhileReading: false,
                        formattingEnabled: false,
                        authorSuggestionEnabled: false,
                        questionCardEnabled: false,
                        articleQuestionEnabled: false,
                        presetActions: false,
                        channel: "siyuan",
                        customBaseUrl: "",
                        customModel: "",
                        customSecretName: "glean",
                    },
                    resurface: { dailyCount: 3, includeDoneHighlights: false },
                    inboxQuota: 50,
                    staleDays: 90,
                    migrateBatchSize: 25,
                    integration: { checkinEnabled: false, checkinItemId: "", bridgeWriteEnabled: false, dailyNoteEnabled: true },
                    reader: { openInTab: false, defaultMode: "read" },
                };
                fs.writeFileSync(path.join(petalStorage, "settings.json"), JSON.stringify(defaultSettings, null, 2));
                fs.writeFileSync(path.join(petalStorage, "ui-prefs.json"), JSON.stringify({
                    onboardingDone: true,
                    onboardingStep: 1,
                    onboardingInterrupted: false,
                    themePalette: "teal",
                }, null, 2));

                const initialIndex = {
                    version: 1,
                    updatedAt: new Date().toISOString(),
                    clips: {
                        [docId]: {
                            id: docId,
                            title: "深度工作与注意力管理",
                            hpath: "/深度工作与注意力管理",
                            box: notebookId,
                            status: "reading",
                            url: "https://example.com/articles/deep-work",
                            site: "example.com",
                            author: "卡尔·纽波特",
                            time: "20261031120000",
                            words: 3200,
                            minutes: 8,
                            priority: 4,
                            rating: 5,
                            summary: "深入剖析注意力残留对脑力工作的结构性破坏，并提供建立仪式化专注的具体法则。",
                            contentType: "fulltext",
                            timeSource: "document",
                            updated: "20261031120000",
                            tags: ["深度阅读", "效率"],
                            aiTags: [],
                        },
                        ...(doc2Id ? {
                            [doc2Id]: {
                                id: doc2Id,
                                title: "为什么我们需要构建第二大脑",
                                hpath: "/为什么我们需要构建第二大脑",
                                box: notebookId,
                                status: "later",
                                url: "https://example.com/articles/second-brain",
                                site: "example.com",
                                author: "蒂亚戈·福特",
                                time: "20261031121000",
                                words: 2600,
                                minutes: 7,
                                priority: 5,
                                rating: 0,
                                summary: "介绍 CODE 知识流转模型，通过数字笔记系统建立个人第二大脑，实现从被动收藏到主动创造的飞跃。",
                                contentType: "fulltext",
                                timeSource: "document",
                                updated: "20261031121000",
                                tags: ["知识管理", "心智模型"],
                                aiTags: [],
                            }
                        } : {}),
                    },
                    candidates: {},
                };
                fs.writeFileSync(path.join(petalStorage, "glean-index.json"), JSON.stringify(initialIndex, null, 2));
            }
        }
    } catch (e) {
        console.debug("[stage] 初始化示范文档略过:", e.message);
    }

    // 记录 Session
    const sessionData = {
        pid,
        port: opts.port,
        base,
        appUrl,
        workspace: opts.workspace,
        token,
        createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(opts.workspace, SESSION_FILE), JSON.stringify(sessionData, null, 2) + "\n");

    console.log(`\n======================================================`);
    console.log(`🎉 小驴拾遗 · 独立靶场实机环境已就绪！`);
    console.log(`======================================================`);
    console.log(`📂 工作区目录：${opts.workspace} (D盘专用，绝不干扰主笔记)`);
    console.log(`🔌 内核端口：  ${opts.port} (PID: ${pid})`);
    console.log(`🌐 网页直达入口（请在浏览器打开测试）：`);
    console.log(`   👉 ${appUrl}`);
    console.log(`======================================================\n`);
}

main().catch((err) => {
    console.error("[stage] 启动失败:", err);
    process.exit(1);
});
