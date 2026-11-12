import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// 为 siyuan 端点提供替身
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
                source: "export const showMessage = (msg) => msg; export const getFrontend = () => 'desktop';",
                shortCircuit: true,
            };
        }
        return nextLoad(url, context);
    },
});

const { dispatchHighlightToFlashcard } = await import("../src/services/highlight-pipeline-service.ts");
const { buildHighlightFlashcardPayload } = await import("../src/domain/highlight-pipeline.ts");
const { lvAutomation } = await import("../src/libs/notice.ts");

const dummyPayload = buildHighlightFlashcardPayload({
    highlightText: "知识飞轮核心要点",
    contextText: "在沉淀体系中，知识飞轮核心要点是快速制卡与间隔复习。",
    sourceBlockId: "20261104-block01",
    sourceTitle: "精读实践",
    docTags: ["学习方法"],
});

test("highlight-pipeline-service: public atomic receipt confirms creation", async () => {
    const originalWindow = globalThis.window;
    (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {}, xiaolvCards: { protocol: 1, capabilities: ["createCard"], whenReady: async () => true, hasCapability: () => true, createCard: async () => ({ok:true,data:{createdBlockID:"new-card",kind:"atomic",enrolled:true}}) } };

    // 注册一条模拟闪卡规则
    const unregister = lvAutomation.registerRule({
        id: "mock-cards-rule",
        name: "拾遗高亮转闪卡",
        desc: "测试高亮自动转闪卡规则",
        triggerSource: "siyuan-glean",
        triggerType: "create-card-request",
        actionPlugin: "siyuan-lv-cards",
        actionName: "create-card",
        enabled: true,
        execute: async (_payload) => true,
    });

    try {
        const mockFacade = {
            i18n: {
                "pipeline.cardCreatedSuccess": "已成功派发至小驴闪卡",
            },
        } as any;

        const result = await dispatchHighlightToFlashcard(mockFacade, dummyPayload);
        assert.equal(result.success, true);
        assert.equal(result.mode, "automated");
    } finally {
        unregister();
        globalThis.window = originalWindow;
    }
});

test("highlight-pipeline-service: 无规则消费时 (triggered === 0) 优雅降级为复制 Markdown 到剪贴板", async () => {
    let copiedText = "";
    const originalDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
        value: {
            clipboard: {
                writeText: async (text: string) => {
                    copiedText = text;
                },
            },
        },
        configurable: true,
        writable: true,
    });

    try {
        const mockFacade = {
            i18n: {
                "pipeline.cardCopiedFallback": "未安装闪卡规则，已复制闪卡 Markdown 到剪贴板",
            },
        } as any;

        const result = await dispatchHighlightToFlashcard(mockFacade, dummyPayload);
        assert.equal(result.success, true);
        assert.equal(result.mode, "clipboard");
        assert.ok(copiedText.includes("# 拾遗闪卡"));
        assert.ok(copiedText.includes("知识飞轮核心要点"));
        assert.ok(copiedText.includes("(( 20261104-block01 '查看文章原块' ))"));
    } finally {
        if (originalDesc) Object.defineProperty(globalThis, "navigator", originalDesc);
        else delete (globalThis as any).navigator;
    }
});

test("highlight-pipeline-service: 剪贴板异常时进入失败分支并给出提示", async () => {
    const originalDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
        value: {
            clipboard: {
                writeText: async () => {
                    throw new Error("Clipboard permission denied");
                },
            },
        },
        configurable: true,
        writable: true,
    });

    try {
        const mockFacade = {
            i18n: {
                "pipeline.copyFailed": "复制到剪贴板失败，请检查剪贴板权限",
            },
        } as any;

        const result = await dispatchHighlightToFlashcard(mockFacade, dummyPayload);
        assert.equal(result.success, false);
        assert.equal(result.mode, "failed");
    } finally {
        if (originalDesc) Object.defineProperty(globalThis, "navigator", originalDesc);
        else delete (globalThis as any).navigator;
    }
});
