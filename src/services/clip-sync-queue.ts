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
    createdDocId?: string;
    retryCount?: number;
    status?: "pending" | "failed-retryable";
    lastError?: string;
    nextRetryAt?: string;
}

const STORAGE_KEY = "glean_pending_clip_queue";
const unpersistedDrafts: PendingClipItem[] = [];

export function getUnpersistedClipDrafts(): PendingClipItem[] {
    return unpersistedDrafts.map((item) => ({ ...item }));
}

export function clearUnpersistedClipDraft(id: string): void {
    const idx = unpersistedDrafts.findIndex((item) => item.id === id);
    if (idx !== -1) unpersistedDrafts.splice(idx, 1);
}

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
    if (typeof localStorage === "undefined") {
        throw new Error("当前环境不支持本地持久化存储");
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function copyDraftToClipboard(text: string): void {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).then(() => {
            showNotice("已复制草稿正文到剪贴板", 2500, "info");
        }).catch(() => {
            showNotice("无法自动复制，请手动保存当前草稿内容", 3500, "error");
        });
    } else {
        showNotice("当前环境不支持剪贴板写入，请手动保存正文", 3500, "error");
    }
}

/** 入队暂存：持久化失败绝不吞错假成功，保留可复制草稿并冒泡异常 */
export function enqueuePendingClip(clip: Omit<PendingClipItem, "id" | "createdAt">): PendingClipItem {
    const item: PendingClipItem = {
        ...clip,
        id: `pend_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        status: "pending",
    };
    const current = getPendingClips();
    current.push(item);
    try {
        savePendingClips(current);
    } catch (err) {
        unpersistedDrafts.push(item);
        const reason = err instanceof Error ? err.message : String(err);
        try {
            lvNotify.card({
                source: "小驴拾遗",
                category: "clip-queue-error",
                title: "离线剪藏持久化失败",
                message: `本地离线队列写入失败（${reason}），请复制草稿正文避免内容丢失`,
                level: "error",
                duration: 10000,
                actions: [
                    {
                        label: "复制草稿正文",
                        primary: true,
                        onClick: () => copyDraftToClipboard(item.md),
                    },
                ],
            });
        } catch {
            // ignore notice card failure in headless environments
        }
        try {
            showNotice(`离线队列保存失败（${reason}），请先复制《${item.title}》草稿`, 6000, "error");
        } catch {
            // ignore
        }
        throw err;
    }
    lvLaunchpad.haptic(10);
    showNotice("网络暂不可用，已存入离线待同步队列，恢复后将自动入库", 4000, "info");
    return item;
}

/** 更新暂存条目属性（记录已创建文档 ID、退避状态或重试次数） */
export function updatePendingClip(id: string, patch: Partial<PendingClipItem>): void {
    const current = getPendingClips();
    const idx = current.findIndex((i) => i.id === id);
    if (idx !== -1 && current[idx]) {
        current[idx] = { ...current[idx], ...patch };
        savePendingClips(current);
    }
}

/** 移除已同步项 */
export function removePendingClip(id: string): void {
    const current = getPendingClips();
    const next = current.filter((i) => i.id !== id);
    savePendingClips(next);
}

/** 用户显式点击丢弃失败条目时才清除本地副本 */
export function discardPendingClip(id: string): void {
    removePendingClip(id);
}

let isFlushing = false;
let hasPendingReflush = false;
let pendingReflushForce = false;
let activeFlushPromise: Promise<number> | null = null;

async function cleanupUnmarkedConflictDoc(docId: string): Promise<void> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(docId)) return;
    try {
        const { getBlockAttrs, querySql, removeDoc, deleteBlock } = await import("../api/client");
        const attrs = await getBlockAttrs(docId).catch(() => ({} as Record<string, string>));
        if (attrs?.["custom-clip-status"]) return;
        const rows = await querySql<{ box?: string; path?: string }>(
            `SELECT box, path FROM blocks WHERE id = '${docId}' AND type = 'd' LIMIT 1`,
        ).catch(() => []);
        const row = rows?.[0];
        if (row?.box && row?.path) {
            await removeDoc(row.box, row.path);
        } else {
            await deleteBlock(docId);
        }
    } catch {
        // 清理冲突临时文档失败不阻断队列推进
    }
}

/** 静默刷新并重试离线队列 */
export async function flushPendingClips(facade: GleanFacade, options: { force?: boolean } = {}): Promise<number> {
    if (isFlushing) {
        hasPendingReflush = true;
        if (options.force) pendingReflushForce = true;
        if (activeFlushPromise) return activeFlushPromise;
        return 0;
    }

    const runPass = async (passOptions: { force?: boolean }): Promise<number> => {
        const items = getPendingClips();
        if (items.length === 0) return 0;

        let syncedCount = 0;
        const { createDocWithMd, listNotebooks } = await import("../api/client");
        const { captureDocument } = await import("./clip-store");
        const { resolveDefaultAnchorNotebook, resolveGleanRootPrefix } = await import("./settings");
        const notebooks = await listNotebooks().catch(() => []);

        for (const item of items) {
            if (!passOptions.force && item.nextRetryAt) {
                const retryAtMs = Date.parse(item.nextRetryAt);
                if (Number.isFinite(retryAtMs) && Date.now() < retryAtMs) {
                    continue;
                }
            }
            try {
                // 幂等复用：若上次重试已经创建了文档，则直接复用已建文档 ID，严禁重复建同名文档
                let docId = item.createdDocId;
                if (!docId) {
                    const targetNotebook = item.notebookId?.trim()
                        || resolveDefaultAnchorNotebook(notebooks, facade.settings?.anchorNotebooks ?? [])
                        || notebooks.find((n) => !n.closed)?.id
                        || notebooks[0]?.id
                        || "";
                    if (!targetNotebook) {
                        throw new Error("暂无可用笔记本，等待内核或工作区就绪后重试");
                    }
                    const rootPrefix = resolveGleanRootPrefix(facade.settings, notebooks, targetNotebook);
                    const safeTitle = (item.title || "未命名剪藏").replace(/[/\\:<>|?*"~\p{Cc}\p{Cf}\r\n]+/gu, " ").trim().slice(0, 80) || "未命名剪藏";
                    docId = await createDocWithMd(targetNotebook, `${rootPrefix}/剪藏/${safeTitle}`, item.md);
                    if (docId) {
                        item.createdDocId = docId;
                        updatePendingClip(item.id, { createdDocId: docId, notebookId: targetNotebook });
                    }
                }
                if (docId) {
                    const captured = await captureDocument(facade.pluginInstance, docId, {
                        src: "manual",
                        url: item.url,
                    });
                    removePendingClip(item.id);

                    if (captured.conflict) {
                        if (!captured.attrs?.status && docId !== captured.conflict.id) {
                            await cleanupUnmarkedConflictDoc(docId);
                        }
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

                    syncedCount++;
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
                // 临时故障绝不自动删除用户唯一正文：转为 failed-retryable 退避状态，跳过本条继续处理后续队列
                const nextRetries = (item.retryCount || 0) + 1;
                const backoffMs = Math.min(30 * 60_000, 15_000 * (2 ** Math.min(nextRetries - 1, 7)));
                const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
                const lastError = err instanceof Error ? err.message : String(err);
                try {
                    updatePendingClip(item.id, {
                        status: "failed-retryable",
                        retryCount: nextRetries,
                        lastError,
                        nextRetryAt,
                    });
                } catch {
                    // ignore storage error on metadata update
                }
                if (nextRetries === 1 || nextRetries % 3 === 0) {
                    try {
                        lvNotify.card({
                            source: "小驴拾遗",
                            category: "clip-queue-retryable",
                            title: "离线剪藏待重试（已保留正文）",
                            message: `《${item.title}》同步暂未成功（第 ${nextRetries} 次），正文已安全保留在本地队列`,
                            level: "warn",
                            duration: 8000,
                            actions: [
                                {
                                    label: "立即重试",
                                    primary: true,
                                    onClick: () => { void flushPendingClips(facade, { force: true }); },
                                },
                                {
                                    label: "复制正文",
                                    onClick: () => copyDraftToClipboard(item.md),
                                },
                                {
                                    label: "丢弃副本",
                                    onClick: () => discardPendingClip(item.id),
                                },
                            ],
                        });
                    } catch {
                        // ignore
                    }
                }
                console.debug("[glean] 离线剪藏转入退避重试（继续处理后续队列）:", item.title, err);
                continue;
            }
        }
        return syncedCount;
    };

    isFlushing = true;
    let task!: Promise<number>;
    task = (async () => {
        let totalSynced = 0;
        try {
            totalSynced += await runPass(options);
            while (hasPendingReflush) {
                const nextForce = pendingReflushForce;
                hasPendingReflush = false;
                pendingReflushForce = false;
                totalSynced += await runPass({ force: nextForce });
            }
        } finally {
            isFlushing = false;
            hasPendingReflush = false;
            pendingReflushForce = false;
            if (activeFlushPromise === task) activeFlushPromise = null;
            if (totalSynced > 0) {
                facade.notifyDataChanged();
            }
        }
        return totalSynced;
    })();
    activeFlushPromise = task;
    return task;
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
    const initialTimer = window.setTimeout(tryFlush, 3000);

    return () => {
        window.clearTimeout(initialTimer);
        window.removeEventListener("online", handleOnline);
        document.removeEventListener("visibilitychange", handleVisibility);
    };
}
