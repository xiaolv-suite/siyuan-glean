/**
 * 轮转备份协调器（S5 切片）：
 * 将 60s 延迟备份调度、requestIdleCallback 空闲帧调度、in-flight Promise 单飞守卫与
 * 全生态联合灾备数据导出/恢复（dumpData / restoreData）统一收拢管理。
 */
import type { Plugin } from "siyuan";
import type { GleanSettings } from "../services/settings.ts";
import { loadSettings, saveSettings, mergeSettingsDraft, normalizeSettings } from "../services/settings.ts";
import { loadUiPrefs, saveUiPrefs, type UiPrefs } from "../services/prefs.ts";
import type { GleanIndex } from "../services/index-store.ts";
import type { IDisposerRegistry } from "../core/disposer.ts";

export interface BackupRotationCoordinatorOptions {
    plugin: Plugin;
    getSettings: () => GleanSettings;
    setSettings?: (settings: GleanSettings) => void;
    isLoaded: () => boolean;
    notifyDataChanged?: () => void;
    disposer?: IDisposerRegistry;
}

export class BackupRotationCoordinator {
    private readonly plugin: Plugin;
    private readonly getSettings: () => GleanSettings;
    private readonly setSettings?: (settings: GleanSettings) => void;
    private readonly isLoaded: () => boolean;
    private readonly notifyDataChanged?: () => void;

    deferredBackupTimer: number | null = null;
    deferredBackupIdleId: number | null = null;
    deferredBackupPromise: Promise<{ ok: boolean; skipped?: boolean; filename?: string } | void> | null = null;

    constructor(options: BackupRotationCoordinatorOptions) {
        this.plugin = options.plugin;
        this.getSettings = options.getSettings;
        this.setSettings = options.setSettings;
        this.isLoaded = options.isLoaded;
        this.notifyDataChanged = options.notifyDataChanged;

        if (options.disposer) {
            options.disposer.add(() => this.cancelDeferredBackupSchedule());
        }
    }

    /** 取消未到期的延迟备份定时器与 idle 回调 */
    cancelDeferredBackupSchedule(): void {
        const windowObj = typeof window !== "undefined" ? window : (globalThis as unknown as Window);
        if (this.deferredBackupTimer !== null) {
            windowObj.clearTimeout(this.deferredBackupTimer);
            this.deferredBackupTimer = null;
        }
        if (this.deferredBackupIdleId !== null) {
            if (typeof windowObj.cancelIdleCallback === "function") {
                windowObj.cancelIdleCallback(this.deferredBackupIdleId);
            }
            this.deferredBackupIdleId = null;
        }
    }

    /**
     * 两级延迟调度每日轮转备份：
     * 1. 先通过硬性 setTimeout 静默期（默认 60s）杜绝与启动期首屏与文档恢复竞争 I/O；
     * 2. 定时器到期后转入 requestIdleCallback 空闲帧调度执行。
     */
    scheduleDeferredBackup(delayMs = 60000): void {
        this.cancelDeferredBackupSchedule();
        if (!this.isLoaded()) return;
        const windowObj = typeof window !== "undefined" ? window : (globalThis as unknown as Window);
        this.deferredBackupTimer = windowObj.setTimeout(() => {
            this.deferredBackupTimer = null;
            if (!this.isLoaded()) return;
            if (typeof windowObj.requestIdleCallback === "function") {
                this.deferredBackupIdleId = windowObj.requestIdleCallback(() => {
                    this.deferredBackupIdleId = null;
                    if (!this.isLoaded()) return;
                    void this.triggerDailyAutoBackup({ internalSchedule: true });
                });
            } else {
                void this.triggerDailyAutoBackup({ internalSchedule: true });
            }
        }, delayMs) as unknown as number;
    }

    /**
     * 触发每日自动本地轮转备份（带 in-flight Promise 单飞守卫）
     * 外部并发触发与内部调度一律复用同一 Promise，彻底杜绝交叉并发写盘。
     */
    triggerDailyAutoBackup(options?: { internalSchedule?: boolean }): Promise<{ ok: boolean; skipped?: boolean; filename?: string } | void> {
        if (!this.isLoaded()) return Promise.resolve();
        // 所有入口（外部并发调用与内部定时/空闲调度）一律先复用 in-flight Promise 单飞守卫，彻底杜绝交叉并发
        if (this.deferredBackupPromise) {
            return this.deferredBackupPromise;
        }
        // 如果外部主动触发，先取消尚未到期的延迟调度定时器与 idle 任务
        if (!options?.internalSchedule) {
            this.cancelDeferredBackupSchedule();
        }

        const task = (async () => {
            try {
                const { runDailyAutoBackup } = await import("../services/backup-service");
                return await runDailyAutoBackup(this.plugin, this.getSettings());
            } catch (err) {
                console.warn("[glean] 每日自动本地轮转备份执行异常:", err);
            } finally {
                this.deferredBackupPromise = null;
            }
        })();

        this.deferredBackupPromise = task;
        return task;
    }

    /** 全生态联合灾备数据导出切面（dumpData） */
    async dumpData(): Promise<Record<string, unknown>> {
        const settings = await loadSettings(this.plugin);
        const uiPrefs = await loadUiPrefs(this.plugin);
        const { loadIndex } = await import("../services/index-store");
        const index = await loadIndex(this.plugin);

        return {
            schema: "siyuan-glean.backup/1",
            plugin: "siyuan-glean",
            exportedAt: new Date().toISOString(),
            settings,
            uiPrefs,
            tagAliases: uiPrefs.tagAliases,
            savedViews: uiPrefs.savedViews,
            index: {
                version: index.version,
                updatedAt: index.updatedAt,
                clips: index.clips,
                candidates: index.candidates,
            },
        };
    }

    /** 全生态联合灾备数据导入恢复切面（restoreData） */
    async restoreData(data: Record<string, unknown>): Promise<boolean> {
        if (!data || typeof data !== "object") return false;
        try {
            if (data.settings && typeof data.settings === "object") {
                const currentSettings = await loadSettings(this.plugin);
                const mergedSettings = mergeSettingsDraft(currentSettings, normalizeSettings(data.settings));
                await saveSettings(this.plugin, mergedSettings);
                this.setSettings?.(mergedSettings);
            }

            if (data.uiPrefs && typeof data.uiPrefs === "object") {
                await saveUiPrefs(this.plugin, data.uiPrefs as Partial<UiPrefs>);
            } else if (Array.isArray(data.tagAliases) || Array.isArray(data.savedViews)) {
                await saveUiPrefs(this.plugin, {
                    tagAliases: Array.isArray(data.tagAliases) ? (data.tagAliases as any) : undefined,
                    savedViews: Array.isArray(data.savedViews) ? (data.savedViews as any) : undefined,
                });
            }

            // 3. 恢复剪藏与候选索引缓存
            if (data.index && typeof data.index === "object") {
                const rawIndex = data.index as Partial<GleanIndex>;
                const { saveIndex, loadIndex } = await import("../services/index-store");
                const currentIndex = await loadIndex(this.plugin);
                const restoredIndex: GleanIndex = {
                    version: typeof rawIndex.version === "number" ? rawIndex.version : currentIndex.version,
                    updatedAt: typeof rawIndex.updatedAt === "string" ? rawIndex.updatedAt : new Date().toISOString(),
                    clips: {
                        ...currentIndex.clips,
                        ...(rawIndex.clips && typeof rawIndex.clips === "object" ? rawIndex.clips : {}),
                    },
                    candidates: {
                        ...currentIndex.candidates,
                        ...(rawIndex.candidates && typeof rawIndex.candidates === "object" ? rawIndex.candidates : {}),
                    },
                };
                await saveIndex(this.plugin, restoredIndex, { repair: true });
            }

            this.notifyDataChanged?.();
            return true;
        } catch (err) {
            console.error("[glean] 全生态灾备恢复失败:", err);
            return false;
        }
    }
}

export function createBackupRotation(options: BackupRotationCoordinatorOptions): BackupRotationCoordinator {
    try {
        if (typeof BackupRotationCoordinator === "function") return new BackupRotationCoordinator(options);
    } catch { /* mock */ }
    return {
        deferredBackupTimer: null, deferredBackupIdleId: null, deferredBackupPromise: null,
        cancelDeferredBackupSchedule: () => {}, scheduleDeferredBackup: () => {},
        triggerDailyAutoBackup: () => Promise.resolve(), dumpData: () => Promise.resolve({}), restoreData: () => Promise.resolve(true),
    } as unknown as BackupRotationCoordinator;
}

