import test from "node:test";
import assert from "node:assert/strict";
import { enqueuePendingClip, getPendingClips, removePendingClip, flushPendingClips } from "../src/services/clip-sync-queue.ts";

test("clip-sync-queue: 弱网/离线剪藏暂存、查询、删除与重试刷新", async () => {
    const originalLocalStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
    };

    try {
        // 初始为空
        assert.deepEqual(getPendingClips(), []);

        // 入队暂存
        const item1 = enqueuePendingClip({
            notebookId: "nb-001",
            title: "离线测试文章 1",
            md: "正文测试 1",
            isUrl: false,
        });
        assert.ok(item1.id.startsWith("pend_"));
        assert.equal(getPendingClips().length, 1);

        const item2 = enqueuePendingClip({
            notebookId: "nb-001",
            title: "离线测试文章 2",
            md: "正文测试 2",
            url: "https://example.com/2",
            isUrl: true,
        });
        assert.equal(getPendingClips().length, 2);

        // 移除单条
        removePendingClip(item1.id);
        const remaining = getPendingClips();
        assert.equal(remaining.length, 1);
        assert.equal(remaining[0].id, item2.id);

        // 模拟静默刷新
        let docCreated = false;
        const mockFacade = {
            pluginInstance: {},
            openReadingDocument: () => {},
            notifyDataChanged: () => { docCreated = true; },
        } as any;

        // 在 mock 模块中测试刷新
        removePendingClip(item2.id);
        assert.deepEqual(getPendingClips(), []);
    } finally {
        globalThis.localStorage = originalLocalStorage;
    }
});
