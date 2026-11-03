import test from "node:test";
import assert from "node:assert/strict";
import {
    lvNotify,
    showNotice,
    notifyClipSuccess,
    notifyBatchProgress,
    notifySilentTask,
    notifyInlineFeedback,
} from "../src/libs/notice.ts";

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
