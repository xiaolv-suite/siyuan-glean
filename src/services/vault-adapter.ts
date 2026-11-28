/**
 * 小驴拾遗 · 全生态跨机容灾底座适配器 (lvSnapshotVault)
 *
 * 覆盖拾遗库全部核心持久化状态：
 * - 读库索引（待分拣 / 稍后读 / 阅读中 / 已读 / 已归档 / 候选队列 / 断点进度）
 * - 已制卡高亮持久化记录（custom-lv-glean-carded="true"）与制卡恢复检查点
 * - 移动端阅读断点缓存（localStorage glean_pos_*）与离线暂存队列（glean_pending_clip_queue）
 * - 阅读器/工作台界面偏好（ui-prefs.json）与设置（settings.json）
 *
 * 安全红线：导出前严格剔除任何 AI API Key / Webhook / 认证 Token / 明文密钥特征。
 */
import type { Plugin } from "siyuan";
import { batchGetBlockAttrs, querySql } from "../api/client.ts";
import { FLASHCARD_RECOVERY_FILE, parseFlashcardRecovery } from "../domain/flashcard-recovery.ts";
import { IMPORT_PROGRESS_FILE } from "../domain/import-progress.ts";
import { INBOX_RECOVERY_FILE } from "../domain/inbox-recovery.ts";
import { parseReadingPosition, resolveLatestReadingPosition, type ReadingPosition } from "../domain/reading-position.ts";
import { todayStamp } from "../domain/resurface.ts";
import { ATTR } from "../domain/schema.ts";
import { lvSnapshotVault, type LvVaultPluginAdapter } from "../libs/lv-notice-kit.ts";
import { markHighlightCarded } from "./clip-store.ts";
import { getPendingClips, type PendingClipItem } from "./clip-sync-queue.ts";
import { emptyIndex, loadIndex, saveIndex, withIndexLock, type CandidateEntry, type ClipIndexEntry, type GleanIndex } from "./index-store.ts";
import { loadUiPrefs, normalizeUiPrefs, saveUiPrefs, type UiPrefs } from "./prefs.ts";
import { loadSettings, mergeSettingsDraft, normalizeSettings, saveSettings, type GleanSettings } from "./settings.ts";
import { registerVaultAutoBackupHook, withoutVaultAutoBackup } from "./vault-schedule.ts";

export const GLEAN_VAULT_PLUGIN_ID = "siyuan-glean";
export const GLEAN_VAULT_LABEL = "小驴拾遗";
export const GLEAN_VAULT_SCHEMA_VERSION = 1;

const SECRET_ALLOW_KEYS = /^(?:hasSecret|secretSlot|secretSlots|configuredSecretSlots|secretSlotsToRebind|tokenCount|totalTokens|promptTokens|completionTokens|maxTokens|tokensUsed|tokenUsage|tokenBudget|tokenLimit|tokensPerMinute)$/i;
const SECRET_KEY_EXACT = /^(?:api[-_]?key|fallback[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|bearer[-_]?token|gist[-_]?token|bot[-_]?token|client[-_]?secret|app[-_]?secret|secret[-_]?key|private[-_]?key|password|passwd|credential|aiKey|backupKey|wereadApiKey|wereadIntegration|webhookUrl|barkUrl|token|secret)$/i;
const SECRET_KEY_PARTIAL = /(?:api[-_]?key|fallback[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|bearer[-_]?token|gist[-_]?token|bot[-_]?token|client[-_]?secret|app[-_]?secret|secret[-_]?key|private[-_]?key|password|passwd|credential|webhookUrl)$/i;
const PLAINTEXT_SECRET_PATTERNS = [
    /sk-[A-Za-z0-9_-]{8,}/g,
    /Bearer\s+[A-Za-z0-9._-]{6,}/gi,
    /ghp_[A-Za-z0-9]{10,}/g,
    /xox[baprs]-[A-Za-z0-9-]{8,}/g,
];

const NODE_ID_RE = /^\d{14}-[0-9a-z]{7}$/;
const POS_KEY_PREFIX = "glean_pos_";
const PENDING_QUEUE_STORAGE_KEY = "glean_pending_clip_queue";

function isSecretField(key: string, value: unknown): boolean {
    if (SECRET_ALLOW_KEYS.test(key)) return false;
    if (SECRET_KEY_EXACT.test(key) || SECRET_KEY_PARTIAL.test(key)) {
        return !(typeof value === "number" || typeof value === "boolean");
    }
    return typeof value === "string"
        && /(?:token|secret|key|password)$/i.test(key)
        && !/(?:count|limit|budget|usage|slot|slots|name|label|mode|type)$/i.test(key);
}

function redactSecretString(raw: string): string {
    let out = raw;
    for (const pattern of PLAINTEXT_SECRET_PATTERNS) {
        out = out.replace(pattern, "[REDACTED_SECRET]");
    }
    // 剔除 URL 查询参数中可能夹带的 key/token/secret
    if (/^https?:\/\//i.test(out) && out.includes("?")) {
        try {
            const url = new URL(out);
            let changed = false;
            for (const paramKey of Array.from(url.searchParams.keys())) {
                if (/(?:api[-_]?key|token|secret|password|key)/i.test(paramKey)) {
                    url.searchParams.delete(paramKey);
                    changed = true;
                }
            }
            if (changed) out = url.toString();
        } catch {
            // 非完整 URL 时保留脱敏后的字符串
        }
    }
    return out;
}

/** 递归剔除任何敏感凭据键与明文密钥模式，确保快照零明文 Key/Token。 */
export function sanitizeSnapshotValue<T>(value: T): T {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return redactSecretString(value) as unknown as T;
    if (Array.isArray(value)) return value.map((item) => sanitizeSnapshotValue(item)) as unknown as T;
    if (typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (isSecretField(k, v)) continue;
            out[k] = sanitizeSnapshotValue(v);
        }
        return out as T;
    }
    return value;
}

export interface GleanVaultHost extends Plugin {
    settings?: GleanSettings;
    notifyDataChanged?: () => void;
    refreshUnreadCount?: () => Promise<void>;
}

export interface VaultAdapterDeps {
    queryCardedBlockIds?: () => Promise<string[]>;
    queryHighlightIndex?: () => Promise<Array<{ id: string; rootId: string; carded?: boolean }>>;
    batchGetBlockAttrs?: (ids: string[]) => Promise<Array<{ id: string; attrs: Record<string, string> }>>;
    markHighlightCarded?: (blockId: string) => Promise<void>;
    getStorage?: () => Storage | null;
}

function defaultGetStorage(explicit?: () => Storage | null): Storage | null {
    if (explicit) return explicit();
    try {
        if (typeof localStorage !== "undefined") return localStorage;
    } catch { /* ignore */ }
    return null;
}

async function defaultQueryCardedBlockIds(): Promise<string[]> {
    try {
        const rows = await querySql<{ id?: string }>(
            `SELECT id FROM blocks WHERE ial LIKE '%${ATTR.gleanCarded}="true"%' LIMIT 5000`,
        );
        return Array.from(new Set(rows.map((r) => String(r?.id ?? "").trim()).filter((id) => NODE_ID_RE.test(id))));
    } catch {
        return [];
    }
}

async function defaultQueryHighlightIndex(): Promise<Array<{ id: string; rootId: string; carded?: boolean }>> {
    try {
        const rows = await querySql<{ id?: string; root_id?: string; ial?: string }>(
            `SELECT id, root_id, ial FROM blocks WHERE ial LIKE '%${ATTR.gleanHighlight}%' OR ial LIKE '%${ATTR.highlightColor}%' OR ial LIKE '%${ATTR.gleanCarded}%' LIMIT 5000`,
        );
        const out: Array<{ id: string; rootId: string; carded?: boolean }> = [];
        for (const row of rows) {
            const id = String(row?.id ?? "").trim();
            const rootId = String(row?.root_id ?? "").trim();
            if (!NODE_ID_RE.test(id)) continue;
            const ial = String(row?.ial ?? "");
            const carded = ial.includes(`${ATTR.gleanCarded}="true"`) || ial.includes(`${ATTR.gleanCarded}=true`);
            out.push({ id, rootId, ...(carded ? { carded: true } : {}) });
        }
        return out;
    } catch {
        return [];
    }
}

function readLocalReadingPositions(storage: Storage | null): Record<string, ReadingPosition> {
    const out: Record<string, ReadingPosition> = {};
    if (!storage) return out;
    try {
        for (let i = 0; i < storage.length; i += 1) {
            const key = storage.key(i);
            if (!key || !key.startsWith(POS_KEY_PREFIX)) continue;
            const docId = key.slice(POS_KEY_PREFIX.length).trim();
            if (!docId) continue;
            const raw = storage.getItem(key);
            if (!raw) continue;
            const parsed = parseReadingPosition(JSON.parse(raw));
            if (parsed) out[docId] = parsed;
        }
    } catch { /* ignore */ }
    return out;
}

function readPendingClipsFromStorage(storage: Storage | null): PendingClipItem[] {
    if (!storage) return getPendingClips();
    try {
        const raw = storage.getItem(PENDING_QUEUE_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
    } catch {
        return [];
    }
}

async function safeLoadData(plugin: Plugin, filename: string): Promise<unknown> {
    if (typeof plugin?.loadData !== "function") return null;
    try {
        return await plugin.loadData(filename);
    } catch {
        return null;
    }
}

interface SnapshotStats {
    readingQueue: number;
    done: number;
    archived: number;
    carded: number;
    total: number;
}

function summarizeSnapshotStats(snapshot: Record<string, unknown> | null | undefined): SnapshotStats {
    if (!snapshot || typeof snapshot !== "object") {
        return { readingQueue: 0, done: 0, archived: 0, carded: 0, total: 0 };
    }
    const rawIndex = snapshot.index && typeof snapshot.index === "object"
        ? (snapshot.index as Partial<GleanIndex>)
        : null;
    const rawClips = rawIndex?.clips && typeof rawIndex.clips === "object"
        ? (rawIndex.clips as Record<string, Partial<ClipIndexEntry>>)
        : {};
    const rawCandidates = rawIndex?.candidates && typeof rawIndex.candidates === "object"
        ? (rawIndex.candidates as Record<string, Partial<CandidateEntry>>)
        : {};

    let readingQueue = 0;
    let done = 0;
    let archived = 0;
    for (const clip of Object.values(rawClips)) {
        if (!clip || typeof clip !== "object" || clip.internal === true) continue;
        if (clip.status === "archived") archived += 1;
        else if (clip.status === "done") done += 1;
        else if (clip.status === "inbox" || clip.status === "later" || clip.status === "reading") readingQueue += 1;
    }

    const candidateCount = Object.values(rawCandidates).filter((c) => Boolean(c && typeof c === "object")).length;
    const pendingQueueCount = Array.isArray(snapshot.pendingClips) ? snapshot.pendingClips.length : 0;
    readingQueue += candidateCount + pendingQueueCount;

    const cardedSet = new Set<string>();
    if (Array.isArray(snapshot.cardedBlockIds)) {
        for (const id of snapshot.cardedBlockIds) {
            if (typeof id === "string" && id.trim()) cardedSet.add(id.trim());
        }
    }
    if (Array.isArray(snapshot.highlightIndex)) {
        for (const item of snapshot.highlightIndex) {
            if (item && typeof item === "object" && (item as { carded?: boolean }).carded === true) {
                const id = String((item as { id?: unknown }).id ?? "").trim();
                if (id) cardedSet.add(id);
            }
        }
    }
    const recovery = parseFlashcardRecovery(snapshot.flashcardRecovery);
    if (recovery?.cardBlockId) cardedSet.add(recovery.cardBlockId);

    const carded = cardedSet.size;
    const total = readingQueue + done + archived + carded;
    return { readingQueue, done, archived, carded, total };
}

export function createGleanVaultAdapter(plugin: GleanVaultHost, deps: VaultAdapterDeps = {}): LvVaultPluginAdapter {
    const queryCarded = deps.queryCardedBlockIds ?? defaultQueryCardedBlockIds;
    const queryHighlights = deps.queryHighlightIndex ?? defaultQueryHighlightIndex;
    const readBlockAttrs = deps.batchGetBlockAttrs ?? batchGetBlockAttrs;
    const markCarded = deps.markHighlightCarded ?? markHighlightCarded;

    const adapter: LvVaultPluginAdapter = {
        pluginId: GLEAN_VAULT_PLUGIN_ID,
        label: GLEAN_VAULT_LABEL,
        schemaVersion: GLEAN_VAULT_SCHEMA_VERSION,

        countRecords(snapshot: Record<string, unknown>): number {
            return summarizeSnapshotStats(snapshot).total;
        },

        async exportSnapshot(): Promise<Record<string, unknown>> {
            const storage = defaultGetStorage(deps.getStorage);
            const [
                settings,
                uiPrefs,
                index,
                aiUsage,
                flashcardRecovery,
                inboxRecovery,
                importProgress,
                migrateProgress,
                cardedBlockIds,
                highlightIndex,
            ] = await Promise.all([
                loadSettings(plugin),
                loadUiPrefs(plugin),
                loadIndex(plugin),
                safeLoadData(plugin, "ai-usage.json"),
                safeLoadData(plugin, FLASHCARD_RECOVERY_FILE),
                safeLoadData(plugin, INBOX_RECOVERY_FILE),
                safeLoadData(plugin, IMPORT_PROGRESS_FILE),
                safeLoadData(plugin, "migrate-progress.json"),
                queryCarded(),
                queryHighlights(),
            ]);

            const readingPositions = readLocalReadingPositions(storage);
            const pendingClips = readPendingClipsFromStorage(storage);

            // 同步合并 highlightIndex 中的已制卡 ID，去重保完备
            const mergedCardedIds = Array.from(new Set([
                ...cardedBlockIds,
                ...highlightIndex.filter((h) => h.carded).map((h) => h.id),
            ]));

            return sanitizeSnapshotValue({
                schema: "siyuan-glean.vault/1",
                pluginId: GLEAN_VAULT_PLUGIN_ID,
                exportedAt: new Date().toISOString(),
                settings,
                uiPrefs,
                index: {
                    version: index.version,
                    updatedAt: index.updatedAt,
                    clips: index.clips,
                    candidates: index.candidates,
                },
                cardedBlockIds: mergedCardedIds,
                highlightIndex,
                readingPositions,
                pendingClips,
                ...(aiUsage && typeof aiUsage === "object" ? { aiUsage } : {}),
                ...(flashcardRecovery && typeof flashcardRecovery === "object" ? { flashcardRecovery } : {}),
                ...(inboxRecovery && typeof inboxRecovery === "object" ? { inboxRecovery } : {}),
                ...(importProgress && typeof importProgress === "object" ? { importProgress } : {}),
                ...(migrateProgress && typeof migrateProgress === "object" ? { migrateProgress } : {}),
            });
        },

        async previewDiff(incoming: Record<string, unknown>): Promise<{ currentCount: number; incomingCount: number; summary: string }> {
            const current = await adapter.exportSnapshot();
            const cur = summarizeSnapshotStats(current);
            const inc = summarizeSnapshotStats(incoming);
            const summary = `当前：待读 ${cur.readingQueue} / 已读 ${cur.done} / 已归档 ${cur.archived} / 已制卡 ${cur.carded} ｜ 快照：待读 ${inc.readingQueue} / 已读 ${inc.done} / 已归档 ${inc.archived} / 已制卡 ${inc.carded}`;
            return {
                currentCount: cur.total,
                incomingCount: inc.total,
                summary,
            };
        },

        async importMerge(incoming: Record<string, unknown>): Promise<boolean> {
            if (!incoming || typeof incoming !== "object") return false;
            return await withoutVaultAutoBackup(async () => {
                try {
                    const storage = defaultGetStorage(deps.getStorage);

                    // 1. 合并设置（保留本机锚点笔记本与本机密钥槽名，绝不覆写敏感配置）
                    if (incoming.settings && typeof incoming.settings === "object") {
                        const currentSettings = await loadSettings(plugin);
                        const incomingSettings = normalizeSettings(incoming.settings);
                        const mergedAnchors = Array.from(new Set([
                            ...currentSettings.anchorNotebooks,
                            ...incomingSettings.anchorNotebooks,
                        ]));
                        const mergedSettings = mergeSettingsDraft(currentSettings, {
                            ...incomingSettings,
                            anchorNotebooks: mergedAnchors,
                            ai: {
                                ...incomingSettings.ai,
                                customSecretName: currentSettings.ai.customSecretName || incomingSettings.ai.customSecretName,
                            },
                        });
                        const saved = await saveSettings(plugin, mergedSettings);
                        plugin.settings = saved;
                    }

                    // 2. 合并 UI 偏好与阅读器外观/保存视图/标签别名
                    if (incoming.uiPrefs && typeof incoming.uiPrefs === "object") {
                        const currentPrefs = await loadUiPrefs(plugin);
                        const incPrefs = normalizeUiPrefs(incoming.uiPrefs);
                        const mergedSavedViewsMap = new Map(incPrefs.savedViews.map((v) => [v.id, v]));
                        for (const v of currentPrefs.savedViews) mergedSavedViewsMap.set(v.id, v);
                        const mergedAliasesMap = new Map(incPrefs.tagAliases.map((a) => [a.id, a]));
                        for (const a of currentPrefs.tagAliases) mergedAliasesMap.set(a.id, a);

                        const mergedPrefs: Partial<UiPrefs> = {
                            ...incPrefs,
                            ...currentPrefs,
                            readerAppearance: currentPrefs.readerAppearance ?? incPrefs.readerAppearance,
                            mobileReaderAppearance: currentPrefs.mobileReaderAppearance ?? incPrefs.mobileReaderAppearance,
                            savedViews: Array.from(mergedSavedViewsMap.values()).slice(0, 20),
                            tagAliases: Array.from(mergedAliasesMap.values()),
                            defaultSavedViewId: currentPrefs.defaultSavedViewId || incPrefs.defaultSavedViewId,
                            onboardingDone: currentPrefs.onboardingDone || incPrefs.onboardingDone,
                        };
                        await saveUiPrefs(plugin, mergedPrefs);
                    }

                    // 3. 幂等合并读库索引（clips / candidates / readingPosition / readMinutes）
                    if (incoming.index && typeof incoming.index === "object") {
                        const rawIndex = incoming.index as Partial<GleanIndex>;
                        await withIndexLock(async () => {
                            const currentIndex = await loadIndex(plugin).catch(() => emptyIndex());
                            const nextClips: Record<string, ClipIndexEntry> = { ...currentIndex.clips };
                            if (rawIndex.clips && typeof rawIndex.clips === "object") {
                                for (const [id, incClip] of Object.entries(rawIndex.clips)) {
                                    if (!incClip || typeof incClip !== "object") continue;
                                    const curClip = nextClips[id];
                                    if (!curClip) {
                                        nextClips[id] = { ...incClip };
                                        continue;
                                    }
                                    const preferIncoming = (incClip.updated || "") > (curClip.updated || "");
                                    const base = preferIncoming ? { ...curClip, ...incClip } : { ...incClip, ...curClip };
                                    const latestPos = resolveLatestReadingPosition(
                                        curClip.readingPosition ?? null,
                                        incClip.readingPosition ?? null,
                                    );
                                    nextClips[id] = {
                                        ...base,
                                        ...(latestPos ? { readingPosition: latestPos } : {}),
                                        ...(curClip.readPoint || incClip.readPoint
                                            ? { readPoint: preferIncoming ? (incClip.readPoint || curClip.readPoint) : (curClip.readPoint || incClip.readPoint) }
                                            : {}),
                                        favorite: Boolean(curClip.favorite || incClip.favorite),
                                    };
                                }
                            }
                            const nextCandidates: Record<string, CandidateEntry> = {
                                ...(rawIndex.candidates && typeof rawIndex.candidates === "object" ? rawIndex.candidates : {}),
                                ...currentIndex.candidates,
                            };
                            await saveIndex(plugin, {
                                version: typeof rawIndex.version === "number" ? rawIndex.version : currentIndex.version,
                                updatedAt: new Date().toISOString(),
                                clips: nextClips,
                                candidates: nextCandidates,
                            }, { repair: true });
                        });
                    }

                    // 4. 合并本地阅读断点（localStorage glean_pos_* 取较晚时间戳）
                    if (storage && incoming.readingPositions && typeof incoming.readingPositions === "object") {
                        for (const [docId, rawPos] of Object.entries(incoming.readingPositions as Record<string, unknown>)) {
                            if (!docId) continue;
                            const incPos = parseReadingPosition(rawPos);
                            if (!incPos) continue;
                            let curPos: ReadingPosition | null = null;
                            try {
                                const curRaw = storage.getItem(`${POS_KEY_PREFIX}${docId}`);
                                if (curRaw) curPos = parseReadingPosition(JSON.parse(curRaw));
                            } catch { /* ignore */ }
                            const latest = resolveLatestReadingPosition(curPos, incPos);
                            if (latest) {
                                try {
                                    storage.setItem(`${POS_KEY_PREFIX}${docId}`, JSON.stringify(latest));
                                } catch { /* ignore */ }
                            }
                        }
                    }

                    // 5. 合并离线待同步队列（按 id 幂等去重）
                    if (storage && Array.isArray(incoming.pendingClips) && incoming.pendingClips.length > 0) {
                        const existing = readPendingClipsFromStorage(storage);
                        const existingIds = new Set(existing.map((item) => item.id));
                        const mergedQueue = [...existing];
                        for (const item of incoming.pendingClips as PendingClipItem[]) {
                            if (item && typeof item === "object" && typeof item.id === "string" && !existingIds.has(item.id)) {
                                existingIds.add(item.id);
                                mergedQueue.push(item);
                            }
                        }
                        try {
                            storage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(mergedQueue));
                        } catch { /* ignore */ }
                    }

                    // 6. 幂等恢复已制卡块标记（仅对当前工作空间真实存在的块补写缺失标记）
                    const cardedToRestore = new Set<string>();
                    if (Array.isArray(incoming.cardedBlockIds)) {
                        for (const id of incoming.cardedBlockIds) {
                            if (typeof id === "string" && NODE_ID_RE.test(id)) cardedToRestore.add(id);
                        }
                    }
                    if (Array.isArray(incoming.highlightIndex)) {
                        for (const item of incoming.highlightIndex) {
                            if (item && typeof item === "object" && (item as { carded?: boolean }).carded === true) {
                                const id = String((item as { id?: unknown }).id ?? "").trim();
                                if (NODE_ID_RE.test(id)) cardedToRestore.add(id);
                            }
                        }
                    }
                    if (cardedToRestore.size > 0) {
                        try {
                            const ids = Array.from(cardedToRestore);
                            const existingPairs = await readBlockAttrs(ids);
                            for (const pair of existingPairs) {
                                if (pair?.id && pair.attrs?.[ATTR.gleanCarded] !== "true") {
                                    await markCarded(pair.id).catch(() => undefined);
                                }
                            }
                        } catch {
                            // 离线/单测无内核时跳过块属性补写
                        }
                    }

                    // 7. 合并当日 AI 额度计数（防跨机恢复重置当日限额）
                    if (incoming.aiUsage && typeof incoming.aiUsage === "object" && typeof plugin.saveData === "function") {
                        const incUsage = incoming.aiUsage as { date?: unknown; count?: unknown };
                        const today = todayStamp();
                        if (incUsage.date === today && typeof incUsage.count === "number" && Number.isSafeInteger(incUsage.count) && incUsage.count >= 0) {
                            const curUsage = (await safeLoadData(plugin, "ai-usage.json")) as { date?: unknown; count?: unknown } | null;
                            const curCount = curUsage?.date === today && typeof curUsage.count === "number" && Number.isSafeInteger(curUsage.count)
                                ? curUsage.count
                                : 0;
                            if (incUsage.count > curCount) {
                                await plugin.saveData("ai-usage.json", { date: today, count: incUsage.count }).catch(() => undefined);
                            }
                        }
                    }

                    plugin.notifyDataChanged?.();
                    void plugin.refreshUnreadCount?.().catch(() => undefined);
                    return true;
                } catch (err) {
                    console.warn("[glean] lvSnapshotVault 合并恢复失败:", err);
                    return false;
                }
            });
        },
    };

    return adapter;
}

export function installGleanVaultAdapter(plugin: GleanVaultHost, deps: VaultAdapterDeps = {}): () => void {
    const adapter = createGleanVaultAdapter(plugin, deps);
    const unregisterVault = lvSnapshotVault.register(adapter);
    registerVaultAutoBackupHook(() => {
        lvSnapshotVault.scheduleAutoBackup(GLEAN_VAULT_PLUGIN_ID);
    });
    return () => {
        registerVaultAutoBackupHook(null);
        unregisterVault();
        lvSnapshotVault.unregister(GLEAN_VAULT_PLUGIN_ID);
    };
}
