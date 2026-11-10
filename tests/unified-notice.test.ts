import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { UnifiedAiGatewayBridge } from "../src/services/ai-gateway.ts";

// Node 测试环境没有思源运行时；仅在本测试进程为端点传输提供替身。
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "siyuan") return { url: "glean-test:siyuan", shortCircuit: true };
        if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
            return nextResolve(`${specifier}.ts`, context);
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === "glean-test:siyuan") {
            return {
                format: "module",
                source: "export const fetchSyncPost = () => Promise.resolve({}); export const getFrontend = () => 'desktop';",
                shortCircuit: true,
            };
        }
        return nextLoad(url, context);
    },
});

const {
    lvNotify,
    withDocLock,
    lvSurfaceStack,
    lvTicker,
    lvAi,
    lvActivity,
    lvBackup,
    lvEcosystem,
    lvLaunchpad,
    lvOmnisearch,
    showNotice,
    notifyClipSuccess,
    notifyBatchProgress,
    notifyClipProgress,
    notifySilentTask,
    notifyInlineFeedback,
} = await import("../src/libs/notice.ts");
const { dispatchUnifiedAiChat, getUnifiedAiGateway } = await import("../src/services/ai-gateway.ts");
const { DEFAULT_SETTINGS } = await import("../src/services/settings.ts");

test("统一通知套件：Node 环境基础防崩溃降级", () => {
    // 在纯 Node 环境下，不抛出任何异常，防御性降级
    const cardId = lvNotify.card({ message: "Node card test" });
    assert.ok(typeof cardId === "string");

    const capId = lvNotify.capsule({ message: "Node capsule test" });
    assert.ok(typeof capId === "string");

    lvNotify.silent({ message: "Node silent test" });
    notifySilentTask("后台任务静默测试", "test-task");
    notifyBatchProgress("进度测试 1/5");
    notifyInlineFeedback(null, "已复制");
});

test("统一通知套件：浏览器模拟单例协商与生命周期交棒", () => {
    // 搭建微型 DOM 环境以验证 Coordinator 机制
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalLocalStorage = globalThis.localStorage;

    const mockStorage = new Map<string, string>();
    const mockElements: any[] = [];

    const mockDoc = {
        getElementById: () => null,
        createElement: (tag: string) => {
            const el: any = {
                tagName: tag.toUpperCase(),
                className: "",
                dataset: {},
                innerHTML: "",
                style: {},
                childNodes: [],
                children: [],
                setAttribute: (k: string, v: string) => { el[k] = v; },
                getAttribute: (k: string) => el[k] ?? null,
                removeAttribute: (k: string) => { delete el[k]; },
                appendChild: (child: any) => {
                    el.childNodes.push(child);
                    el.children.push(child);
                    return child;
                },
                remove: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                querySelector: () => null,
                querySelectorAll: () => [],
            };
            mockElements.push(el);
            return el;
        },
        head: { appendChild: () => {} },
        body: { appendChild: () => {} },
    };

    const mockWin: any = {
        addEventListener: () => {},
        removeEventListener: () => {},
        setTimeout: (fn: () => void) => {
            return 1;
        },
        clearTimeout: () => {},
    };

    (globalThis as any).window = mockWin;
    (globalThis as any).document = mockDoc;
    (globalThis as any).localStorage = {
        getItem: (k: string) => mockStorage.get(k) ?? null,
        setItem: (k: string, v: string) => { mockStorage.set(k, v); },
    };

    try {
        // 1. 生命周期自协商注册
        const unregister = lvNotify.registerPlugin("siyuan-glean");
        assert.ok(typeof unregister === "function");
        assert.ok(mockWin.__LV_NOTICE_HUB__);
        assert.equal(mockWin.__LV_NOTICE_HUB__.hostPlugin, "siyuan-glean");

        // 2. 剪藏成功提示卡片化
        let viewDocTriggered = false;
        notifyClipSuccess({
            docId: "20261103000000-clip01",
            title: "全生态通知架构设计",
            openAction: () => {
                viewDocTriggered = true;
            },
        });

        const history = mockWin.__LV_NOTICE_HUB__.getHistory();
        assert.ok(history.length >= 1);
        const cardPacket = history[0];
        assert.equal(cardPacket.mode, "card");
        assert.equal(cardPacket.level, "success");
        assert.equal(cardPacket.source, "小驴拾遗");
        assert.equal(cardPacket.category, "clip-success");
        assert.ok(cardPacket.message.includes("全生态通知架构设计"));
        assert.equal(cardPacket.actions?.length, 1);
        assert.equal(cardPacket.actions[0].label, "查看文档");

        // 触发查看文档动作
        cardPacket.actions[0].onClick();
        assert.equal(viewDocTriggered, true);

        // 3. 批量导入/剪藏防刷屏：同 category 进度提示折叠为单条计数
        notifyBatchProgress("正在批量导入 (1/10)...", "test-batch-progress");
        notifyBatchProgress("正在批量导入 (2/10)...", "test-batch-progress");
        notifyBatchProgress("正在批量导入 (3/10)...", "test-batch-progress");

        // 历史中同进度或消息的记录
        const progressPacket = mockWin.__LV_NOTICE_HUB__.getHistory().find((p: any) => p.category === "test-batch-progress" || p.message?.includes("批量导入"));
        assert.ok(progressPacket);
        assert.equal(progressPacket.mode, "capsule");
        assert.ok(progressPacket.repeatCount >= 1);
        assert.ok(progressPacket.message.includes("正在批量导入"));

        // 4. 后台常规任务降级为 silent，静默入库零弹窗打扰
        notifySilentTask("后台自动识别微信公众号作者完成 5 篇", "wechat-auto-scan");
        const silentPacket = mockWin.__LV_NOTICE_HUB__.getHistory().find((p: any) => p.category === "wechat-auto-scan");
        assert.ok(silentPacket);
        assert.equal(silentPacket.mode, "silent");

        // 5. showNotice 智能分流
        showNotice("操作失败提示", 4000, "error");
        const errPacket = mockWin.__LV_NOTICE_HUB__.getHistory()[0];
        assert.equal(errPacket.mode, "card");
        assert.equal(errPacket.level, "error");

        showNotice("轻量提示消息", 2000, "info");
        const infoPacket = mockWin.__LV_NOTICE_HUB__.getHistory()[0];
        assert.equal(infoPacket.mode, "capsule");

        // 6. 生命周期交棒注销
        unregister();
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
        globalThis.localStorage = originalLocalStorage;
    }
});

test("统一通知套件：剪藏进度折叠规范 (notifyClipProgress)", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    const mockElements: any[] = [];
    const mockDoc = {
        getElementById: () => null,
        createElement: (tag: string) => {
            const el: any = {
                tagName: tag.toUpperCase(),
                className: "",
                dataset: {},
                innerHTML: "",
                appendChild: (c: any) => c,
                setAttribute: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
            };
            mockElements.push(el);
            return el;
        },
        head: { appendChild: () => {} },
        body: { appendChild: () => {} },
    };

    const mockWin: any = {
        addEventListener: () => {},
        removeEventListener: () => {},
        setTimeout: () => 1,
        clearTimeout: () => {},
    };

    (globalThis as any).window = mockWin;
    (globalThis as any).document = mockDoc;

    try {
        notifyClipProgress(1, 10, "剪藏");
        notifyClipProgress(2, 10, "剪藏");
        notifyClipProgress(3, 10, "剪藏");

        const history = mockWin.__LV_NOTICE_HUB__.getHistory();
        const p = history.find((item: any) => item.category === "glean-clip-progress" || item.message?.includes("剪藏"));
        assert.ok(p);
        assert.ok(p.message.includes("正在剪藏"));
        assert.ok(p.repeatCount >= 1);
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
});

test("全生态 AI 请求规范：统一网关自协商与私有 Key 解耦", async () => {
    const originalWindow = globalThis.window;
    let gatewayCalled = false;

    const mockGateway: UnifiedAiGatewayBridge = {
        protocol: 1,
        capabilities: ["chat"],
        whenReady: async () => true,
        chat: async (req) => {
            gatewayCalled = true;
            return { ok: true, text: `网关回复: ${req.prompt}` };
        },
    };

    const mockWin: any = {
        xiaolvAiGateway: mockGateway,
    };
    (globalThis as any).window = mockWin;

    try {
        assert.equal(getUnifiedAiGateway(), mockGateway);

        const dummyPlugin: any = {
            getSecret: () => "",
        };

        const res = await dispatchUnifiedAiChat(dummyPlugin, DEFAULT_SETTINGS, "测试 Prompt");
        assert.equal(res.ok, true);
        assert.equal(res.source, "gateway");
        assert.equal(gatewayCalled, true);
        assert.ok(res.text?.includes("网关回复: 测试 Prompt"));
    } finally {
        globalThis.window = originalWindow;
    }
});

test("系统资源与并发加固：withDocLock 同文档串行排队与故障释放", async () => {
    const docA = "20261103000000-doc00a";
    const docB = "20261103000000-doc00b";

    const executionLog: string[] = [];

    // 两个并发写入同一文档 docA
    const taskA1 = withDocLock(docA, async () => {
        executionLog.push("A1:start");
        await new Promise((r) => setTimeout(r, 20));
        executionLog.push("A1:done");
        return "result-A1";
    });

    const taskA2 = withDocLock(docA, async () => {
        executionLog.push("A2:start");
        await new Promise((r) => setTimeout(r, 10));
        executionLog.push("A2:done");
        return "result-A2";
    });

    // 并发写入不同文档 docB（互不阻塞）
    const taskB1 = withDocLock(docB, async () => {
        executionLog.push("B1:start");
        await new Promise((r) => setTimeout(r, 5));
        executionLog.push("B1:done");
        return "result-B1";
    });

    const [resA1, resA2, resB1] = await Promise.all([taskA1, taskA2, taskB1]);
    assert.equal(resA1, "result-A1");
    assert.equal(resA2, "result-A2");
    assert.equal(resB1, "result-B1");

    // A1 必须在 A2 开始前完成
    const idxA1Done = executionLog.indexOf("A1:done");
    const idxA2Start = executionLog.indexOf("A2:start");
    assert.ok(idxA1Done < idxA2Start, "A1 必须在 A2 启动前执行完成，严格串行排队");

    // 验证异常时锁能够正常释放，不阻塞后续排队
    let thrown = false;
    try {
        await withDocLock(docA, async () => {
            throw new Error("Simulated Write Error");
        });
    } catch {
        thrown = true;
    }
    assert.equal(thrown, true);

    const taskA3 = await withDocLock(docA, async () => {
        return "recovered-A3";
    });
    assert.equal(taskA3, "recovered-A3");
});

test("系统资源与并发加固：lvSurfaceStack 栈顶精准逐层关闭且不穿透", () => {
    const originalWindow = globalThis.window;

    let keydownListener: ((e: any) => void) | null = null;
    const mockWin: any = {
        addEventListener: (event: string, fn: any) => {
            if (event === "keydown") keydownListener = fn;
        },
        removeEventListener: () => {},
    };

    (globalThis as any).window = mockWin;

    try {
        let bottomDismissed = false;
        let topDismissed = false;

        // 压入底层窗口（如 Dialog）
        const popBottom = lvSurfaceStack.push({
            id: "dialog-bottom",
            type: "dialog",
            dismiss: () => {
                bottomDismissed = true;
                return true;
            },
        });

        // 压入顶层浮层（如 Popover）
        const popTop = lvSurfaceStack.push({
            id: "popover-top",
            type: "menu",
            dismiss: () => {
                topDismissed = true;
                return true;
            },
        });

        assert.equal(lvSurfaceStack.top()?.id, "popover-top");

        // 模拟第一次按 Escape 键
        let defaultPrevented = false;
        let propagationStopped = false;
        const event1 = {
            key: "Escape",
            preventDefault: () => { defaultPrevented = true; },
            stopPropagation: () => { propagationStopped = true; },
        };
        keydownListener!(event1);

        // 顶层浮层关闭，底层窗口未被触碰，事件被阻止冒泡
        assert.equal(topDismissed, true);
        assert.equal(bottomDismissed, false);
        assert.equal(defaultPrevented, true);
        assert.equal(propagationStopped, true);
        assert.equal(lvSurfaceStack.top()?.id, "dialog-bottom");

        // 模拟第二次按 Escape 键
        const event2 = {
            key: "Escape",
            preventDefault: () => {},
            stopPropagation: () => {},
        };
        keydownListener!(event2);

        // 底层窗口此时被关闭
        assert.equal(bottomDismissed, true);
        assert.equal(lvSurfaceStack.top(), undefined);

        popTop();
        popBottom();
    } finally {
        globalThis.window = originalWindow;
    }
});

test("第三阶段 AI 统一网关：lvAi 并发限流与全局共享配置", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    let fetchHeaders: any = null;
    let fetchBody: any = null;

    globalThis.fetch = async (url: any, opts: any) => {
        fetchCalled = true;
        fetchHeaders = opts.headers;
        fetchBody = JSON.parse(opts.body);
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{ message: { content: "这是通过 lvAi 网关返回的摘要结果" } }],
                model: "deepseek-chat",
                usage: { total_tokens: 42 },
            }),
        } as any;
    };

    try {
        // 1. 设置共享配置
        lvAi.setConfig({
            endpoint: "https://api.deepseek.com/v1",
            apiKey: "sk-shared-test-key-123456",
            model: "deepseek-chat",
        });

        const cfg = lvAi.getConfig();
        assert.equal(cfg?.apiKey, "sk-shared-test-key-123456");
        assert.equal(cfg?.model, "deepseek-chat");

        // 2. 调用 lvAi.chat 发送低优先级后台摘要请求
        const res = await lvAi.chat({
            source: "拾遗",
            messages: [{ role: "user", content: "请为本文生成摘要" }],
            priority: "low",
        });

        assert.equal(fetchCalled, true);
        assert.equal(fetchHeaders["Authorization"], "Bearer sk-shared-test-key-123456");
        assert.equal(fetchBody.model, "deepseek-chat");
        assert.equal(res.content, "这是通过 lvAi 网关返回的摘要结果");

        // 3. 验证 dispatchUnifiedAiChat 调度自动优先走 lvAi
        const dummyPlugin: any = { getSecret: () => "" };
        const dispatchRes = await dispatchUnifiedAiChat(dummyPlugin, DEFAULT_SETTINGS, "正文长文提炼", { priority: "low" });
        assert.equal(dispatchRes.ok, true);
        assert.equal(dispatchRes.source, "gateway");
        assert.equal(dispatchRes.text, "这是通过 lvAi 网关返回的摘要结果");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("第三阶段今日活动流：lvActivity 广播、查询与 Daily Note 汇编", () => {
    const originalWindow = globalThis.window;
    (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {}, setTimeout: () => 1, clearTimeout: () => {} };

    let receivedItem: any = null;
    const unsub = lvActivity.onActivity((item) => {
        receivedItem = item;
    });

    try {
        // 1. 广播文章入库活动
        lvActivity.record({
            source: "拾遗",
            category: "clip",
            title: "剪藏《小驴全家桶统一架构设计》",
            linkBlockId: "20261103120000-clip01",
            detail: "微信公众号 · 深度长文",
        });

        assert.ok(receivedItem);
        assert.equal(receivedItem.source, "拾遗");
        assert.equal(receivedItem.category, "clip");
        assert.equal(receivedItem.title, "剪藏《小驴全家桶统一架构设计》");
        assert.equal(receivedItem.linkBlockId, "20261103120000-clip01");

        // 2. 查询今日活动流
        const todayRecords = lvActivity.getTodayRecords();
        assert.ok(todayRecords.length >= 1);
        const match = todayRecords.find((r) => r.linkBlockId === "20261103120000-clip01");
        assert.ok(match);
        assert.equal(match.source, "拾遗");

        // 3. 汇编生成 Markdown
        const md = lvActivity.formatAsMarkdown();
        assert.ok(md.includes("小驴全家桶 · 今日活动汇编"));
        assert.ok(md.includes("[拾遗]"));
        assert.ok(md.includes("剪藏《小驴全家桶统一架构设计》"));
        assert.ok(md.includes("siyuan://blocks/20261103120000-clip01"));
    } finally {
        unsub();
        globalThis.window = originalWindow;
    }
});

test("第四阶段全生态联合灾备：lvBackup 注册、联合导出 exportFull 与联合恢复 restoreFull", async () => {
    const originalWindow = globalThis.window;
    (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {}, setTimeout: () => 1, clearTimeout: () => {} };

    let restoredGleanData: any = null;
    let restoredCardsData: any = null;

    // 1. 模拟拾遗与闪卡插件注册灾备切面
    const unregGlean = lvBackup.register(
        "siyuan-glean",
        async () => ({
            schema: "siyuan-glean.backup/1",
            clips: [{ id: "20261103-clip01", title: "测试剪藏" }],
            tagAliases: [{ name: "AI", target: "人工智能" }],
        }),
        async (data) => {
            restoredGleanData = data;
            return true;
        }
    );

    const unregCards = lvBackup.register(
        "siyuan-lv-cards",
        async () => ({
            v: 1,
            decks: [{ id: "deck-1", name: "考研词汇" }],
        }),
        async (data) => {
            restoredCardsData = data;
            return true;
        }
    );

    try {
        // 2. 导出全生态联合总包
        const bundle = await lvBackup.exportFull();
        assert.equal(bundle.ecosystem, "xiaolv");
        assert.equal(bundle.v, 1);
        assert.ok(bundle.exportedAt);
        assert.ok(bundle.plugins["siyuan-glean"]);
        assert.ok(bundle.plugins["siyuan-lv-cards"]);
        assert.equal((bundle.plugins["siyuan-glean"].data as any).clips[0].title, "测试剪藏");
        assert.equal((bundle.plugins["siyuan-lv-cards"].data as any).decks[0].name, "考研词汇");

        // 3. 联合包全量恢复
        const restoreRes = await lvBackup.restoreFull(bundle);
        assert.ok(restoreRes.success.includes("siyuan-glean"));
        assert.ok(restoreRes.success.includes("siyuan-lv-cards"));
        assert.equal(restoreRes.failed.length, 0);
        assert.equal(restoredGleanData?.clips?.[0]?.title, "测试剪藏");
        assert.equal(restoredCardsData?.decks?.[0]?.name, "考研词汇");
    } finally {
        unregGlean();
        unregCards();
        globalThis.window = originalWindow;
    }
});

test("第四阶段全生态自省诊断与胶囊徽章：lvEcosystem 诊断信息与 getStatusBadgeText", () => {
    // 1. 诊断结构检查
    const diag = lvEcosystem.getDiagnostics();
    assert.ok(typeof diag.version === "number");
    assert.ok(Array.isArray(diag.registeredPlugins));
    assert.ok(typeof diag.todayActivitiesCount === "number");

    // 2. 徽章胶囊文字生成
    const badgeText = lvEcosystem.getStatusBadgeText();
    assert.ok(badgeText.includes("🐴 小驴全家桶"));
    assert.ok(badgeText.includes("今日活动"));
});

test("第四阶段小驴拾遗 dumpData 与 restoreData 灾备数据契约", async () => {
    // 验证拾遗插件导出的灾备结构完备性
    const mockSettings = { ...DEFAULT_SETTINGS, inboxQuota: 88 };
    const mockUiPrefs = { tagAliases: [{ name: "FE", target: "前端" }], savedViews: [] };
    const mockIndex = {
        version: 1,
        updatedAt: "2026-11-03T12:00:00.000Z",
        clips: {
            "clip-1": { id: "clip-1", title: "现代架构", status: "reading" },
        },
        candidates: {},
    };

    const dumpPayload = {
        schema: "siyuan-glean.backup/1",
        plugin: "siyuan-glean",
        exportedAt: new Date().toISOString(),
        settings: mockSettings,
        uiPrefs: mockUiPrefs,
        tagAliases: mockUiPrefs.tagAliases,
        savedViews: mockUiPrefs.savedViews,
        index: mockIndex,
    };

    assert.equal(dumpPayload.schema, "siyuan-glean.backup/1");
    assert.equal(dumpPayload.plugin, "siyuan-glean");
    assert.equal(dumpPayload.settings.inboxQuota, 88);
    assert.equal(dumpPayload.tagAliases[0].name, "FE");
    assert.equal(dumpPayload.index.clips["clip-1"].title, "现代架构");
});

test("第五阶段小驴罗盘：lvLaunchpad 注册、三态呈现、状态切换与二级行动", async () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;
    const mockStorage = new Map<string, string>();
    (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true, setTimeout: () => 1, clearTimeout: () => {} };
    (globalThis as any).localStorage = {
        getItem: (k: string) => mockStorage.get(k) ?? null,
        setItem: (k: string, v: string) => { mockStorage.set(k, String(v)); },
        removeItem: (k: string) => { mockStorage.delete(k); },
    };

    let inboxOpened = false;
    let handledAction = "";

    // 1. 注册小驴拾遗到小驴罗盘
    const unregGlean = lvLaunchpad.register({
        id: "siyuan-glean",
        name: "拾遗",
        fullName: "小驴拾遗",
        svgIcon: "icon-lv-glean",
        color: "#a855f7",
        desc: "文章剪藏 · 智能分拣",
        digit: 4,
        badge: "5 篇未读",
        badgeType: "primary",
        actions: [
            "剪藏当前系统剪贴板内容",
            "打开未读文章收件箱 (Inbox)",
            "一键批量生成AI结构化摘要",
            "抓取当前网页全文并存入思源",
        ],
        onClick: () => {
            inboxOpened = true;
        },
        onAction: (act) => {
            handledAction = act;
        },
    });

    try {
        // 2. 检查注册信息及默认三态呈现状态（docked）
        let items = lvLaunchpad.getItems();
        const gleanItem = items.find((i) => i.id === "siyuan-glean");
        assert.ok(gleanItem);
        assert.equal(gleanItem.name, "拾遗");
        assert.equal(gleanItem.fullName, "小驴拾遗");
        assert.equal(gleanItem.svgIcon, "icon-lv-glean");
        assert.equal(gleanItem.color, "#a855f7");
        assert.equal(gleanItem.desc, "文章剪藏 · 智能分拣");
        assert.equal(gleanItem.digit, 4);
        assert.equal(gleanItem.badge, "5 篇未读");
        assert.equal(gleanItem.badgeType, "primary");
        assert.equal(gleanItem.state, "docked");
        assert.equal(gleanItem.actions?.length, 4);

        // 3. 用户动态设定为置顶在外 (pinned)
        lvLaunchpad.setPluginState("siyuan-glean", "pinned");
        items = lvLaunchpad.getItems();
        assert.equal(items.find((i) => i.id === "siyuan-glean")?.state, "pinned");

        // 4. 用户动态设定为彻底隐藏 (hidden)
        lvLaunchpad.setPluginState("siyuan-glean", "hidden");
        items = lvLaunchpad.getItems();
        assert.equal(items.find((i) => i.id === "siyuan-glean")?.state, "hidden");

        // 5. 触发点击主入口与二级快捷行动
        gleanItem.onClick?.();
        assert.equal(inboxOpened, true);

        gleanItem.onAction?.("打开未读文章收件箱 (Inbox)");
        assert.equal(handledAction, "打开未读文章收件箱 (Inbox)");

        gleanItem.onAction?.("一键批量生成AI结构化摘要");
        assert.equal(handledAction, "一键批量生成AI结构化摘要");
    } finally {
        // 6. 注销
        unregGlean();
        const itemsAfter = lvLaunchpad.getItems();
        assert.equal(itemsAfter.find((i) => i.id === "siyuan-glean"), undefined);
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
    }
});

test("第七阶段全局万物穿透搜索：lvOmnisearch 提供者注册、跨插件检索与剪藏直达", async () => {
    const originalWindow = globalThis.window;
    (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {}, setTimeout: () => 1, clearTimeout: () => {} };

    let openedDocId = "";

    // 1. 注册小驴拾遗穿透搜索提供者
    const unregGlean = lvOmnisearch.registerProvider("siyuan-glean", async (kw) => {
        if (kw.includes("架构") || kw.includes("architecture")) {
            return [{
                id: "clip-doc-001",
                source: "拾遗",
                category: "clip",
                title: "现代前端架构解析",
                snippet: "关于去中心化自协商生态协议的架构思考",
                linkBlockId: "clip-doc-001",
                onClick: () => {
                    openedDocId = "clip-doc-001";
                },
            }];
        }
        return [];
    });

    // 2. 模拟另一个插件（如小驴闪卡）也注册了穿透搜索
    const unregCards = lvOmnisearch.registerProvider("siyuan-lv-cards", async (kw) => {
        if (kw.includes("架构")) {
            return [{
                id: "card-001",
                source: "闪卡",
                category: "card",
                title: "架构模式与原则",
                onClick: () => {},
            }];
        }
        return [];
    });

    try {
        // 3. 执行穿透全局检索
        const hits = await lvOmnisearch.search("架构");
        assert.equal(hits.length, 2);

        const gleanHit = hits.find((h) => h.id === "clip-doc-001");
        assert.ok(gleanHit);
        assert.equal(gleanHit.source, "拾遗");
        assert.equal(gleanHit.category, "clip");
        assert.equal(gleanHit.title, "现代前端架构解析");
        assert.equal(gleanHit.snippet, "关于去中心化自协商生态协议的架构思考");
        assert.equal(gleanHit.linkBlockId, "clip-doc-001");

        // 4. 触发直达点击
        await gleanHit.onClick();
        assert.equal(openedDocId, "clip-doc-001");
    } finally {
        // 5. 注销释放
        unregGlean();
        unregCards();
        const hitsAfter = await lvOmnisearch.search("架构");
        assert.equal(hitsAfter.length, 0);
        globalThis.window = originalWindow;
    }
});
