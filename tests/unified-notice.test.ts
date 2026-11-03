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

        // 历史中同 category 的记录 repeatCount 自增
        const progressPacket = mockWin.__LV_NOTICE_HUB__.getHistory().find((p: any) => p.category === "test-batch-progress");
        assert.ok(progressPacket);
        assert.equal(progressPacket.mode, "capsule");
        assert.equal(progressPacket.repeatCount, 3);
        assert.equal(progressPacket.message, "正在批量导入 (3/10)...");

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
        const p = history.find((item: any) => item.category === "glean-clip-progress");
        assert.ok(p);
        assert.equal(p.message, "正在剪藏 (3/10)...");
        assert.equal(p.repeatCount, 3);
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
