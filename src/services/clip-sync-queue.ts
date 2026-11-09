/**
 * 离线/弱网剪藏暂存与静默重试队列（Mobile Spec v1 容错增强）。
 * 网络断开或内核超时失败时自动进入待同步队列，网络恢复或切回前台自动静默同步。
 */
import type { GleanFacade } from "../types.ts";
import { lvLaunchpad, notifyClipSuccess, lvActivity, showNotice, lvNotify } from "../libs/notice.ts";

export interface PendingClipItem {
    id: string;
    notebookId: string;
    title: string;
    md: string;
    url?: string;
    isUrl: boolean;
    createdAt: string;
}

const STORAGE_KEY = "glean_pending_clip_queue";

export function getPendingClips(): PendingClipItem[] {
    if (typeof localStorage === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function savePendingClips(items: PendingClipItem[]): void {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
        // ignore
    }
}

/** 入队暂存 */
export function enqueuePendingClip(clip: Omit<PendingClipItem, "id" | "createdAt">): PendingClipItem {
    const item: PendingClipItem = {
        ...clip,
        id: `pend_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
    };
    const current = getPendingClips();
    current.push(item);
    savePendingClips(current);
    lvLaunchpad.haptic(10);
    showNotice("网络暂不可用，已存入离线待同步队列，恢复后将自动入库", 4000, "info");
    return item;
}

/** 移除已同步项 */
export function removePendingClip(id: string): void {
    const current = getPendingClips();
    const next = current.filter((i) => i.id !== id);
    savePendingClips(next);
}

let isFlushing = false;

/** 静默刷新并重试离线队列 */
export async function flushPendingClips(facade: GleanFacade): Promise<number> {
    if (isFlushing) return 0;
    const items = getPendingClips();
    if (items.length === 0) return 0;

    isFlushing = true;
    let syncedCount = 0;

    try {
        const { createDocWithMd, listNotebooks } = await import("../api/client");
        const { captureDocument } = await import("./clip-store");
        const { resolveGleanRootPrefix } = await import("./settings");
        const notebooks = await listNotebooks().catch(() => []);

        for (const item of items) {
            try {
                const rootPrefix = resolveGleanRootPrefix(facade.settings, notebooks, item.notebookId);
                const docId = await createDocWithMd(item.notebookId, `${rootPrefix}/剪藏/${item.title}`, item.md);
                if (docId) {
                    const captured = await captureDocument(facade.pluginInstance, docId, {
                        src: "manual",
                        url: item.url,
                    });
                    removePendingClip(item.id);
                    syncedCount++;

                    if (captured.conflict) {
                        lvNotify.card({
                            source: "小驴拾遗",
                            category: "clip-conflict",
                            title: "离线剪藏冲突",
                            message: `离线剪藏《${item.title}》与已有文章《${captured.conflict.title || captured.conflict.hpath}》来源相同`,
                            level: "warn",
                            duration: 6000,
                            actions: [
                                {
                                    label: "查看已有文章",
                                    onClick: () => facade.openReadingDocument(captured.conflict!.id),
                                },
                            ],
                        });
                        continue;
                    }

                    lvLaunchpad.haptic(10);
                    notifyClipSuccess({
                        docId,
                        title: item.title,
                        openAction: () => facade.openReadingDocument(docId),
                    });
                    lvActivity.record({
                        source: "拾遗",
                        category: "clip",
                        title: `离线剪藏已自动同步：《${item.title}》`,
                        linkBlockId: docId,
                    });
                }
            } catch (err) {
                // 单篇失败保留在队列中等待下次重试
                console.debug("[glean] 离线剪藏重试跳过:", item.title, err);
                break;
            }
        }
    } finally {
        isFlushing = false;
        if (syncedCount > 0) {
            facade.notifyDataChanged();
        }
    }

    return syncedCount;
}

/** 安装网络恢复与切回前台的自动同步监听器 */
export function installClipSyncQueue(facade: GleanFacade): () => void {
    if (typeof window === "undefined") return () => {};

    const tryFlush = () => {
        void flushPendingClips(facade);
    };

    const handleOnline = () => {
        tryFlush();
    };

    const handleVisibility = () => {
        if (!document.hidden) {
            tryFlush();
        }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    // 初次加载延迟尝试清理残留队列
    setTimeout(tryFlush, 3000);

    return () => {
        window.removeEventListener("online", handleOnline);
        document.removeEventListener("visibilitychange", handleVisibility);
    };
}
