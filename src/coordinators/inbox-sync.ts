/**
 * 收集箱与剪藏同步协调器（S8 切片）：
 * 将收集箱迁入、右键菜单收录、外部 URL 命令解析与手动 AI 富化移出入口上帝类。
 */
import type { Plugin } from "siyuan";
import type { GleanSettings } from "../services/settings.ts";
import type { I18nBundle } from "../libs/i18n.ts";
import { t } from "../libs/i18n.ts";
import { showMessage, showNotice, lvActivity, lvNotify, notifyClipSuccess, notifyClipProgress, withLvAiWait } from "../libs/notice.ts";
import { captureDocument, readClipContext } from "../services/clip-store.ts";
import { autoEnrich, enrichClip } from "../services/enrich-service.ts";
import { getShorthand } from "../api/inbox.ts";
import { migrateShorthand } from "../services/inbox-service.ts";
import { isKernelRequestError, kernelErrorKind } from "../api/client.ts";

export interface InboxSyncHost {
    readonly pluginInstance: Plugin;
    readonly i18n: I18nBundle;
    readonly settings: GleanSettings;
    currentDocId: () => string;
    openReadingDocument: (docId: string) => void;
    notifyDataChanged: () => void;
    openPanel: (view?: string) => void;
    openSettings: () => void;
    cardSelection: () => { quote: string; docId: string; blockId: string } | null;
    makeCardFromSelection: () => Promise<void>;
}

export class InboxSyncCoordinator {
    private readonly plugin: InboxSyncHost;
    private inboxMigrating = false;
    private readonly capturingDocIds = new Set<string>();

    constructor(plugin: InboxSyncHost) {
        this.plugin = plugin;
    }

    async addCurrentDocToLibrary(): Promise<void> {
        const docId = this.plugin.currentDocId();
        if (!docId) {
            showNotice(t(this.plugin.i18n, "msg.noSelection"), 3000, "warn");
            return;
        }
        if (this.capturingDocIds.has(docId)) return;
        this.capturingDocIds.add(docId);
        try {
            const result = await captureDocument(this.plugin.pluginInstance, docId, { src: "manual" });
            if (result.conflict) {
                const confTitle = result.conflict.title || result.conflict.hpath || "";
                lvNotify.card({
                    source: "小驴拾遗",
                    category: "clip-conflict",
                    title: t(this.plugin.i18n, "inbox.duplicate"),
                    message: confTitle ? t(this.plugin.i18n, "inbox.duplicateSameSource", { title: confTitle }) : t(this.plugin.i18n, "inbox.duplicateSameUrl"),
                    level: "warn",
                    duration: 6000,
                    actions: [
                        {
                            label: t(this.plugin.i18n, "inbox.viewExistingDoc"),
                            primary: true,
                            onClick: () => this.plugin.openReadingDocument(result.conflict!.id),
                            dismissAfterClick: true,
                        },
                    ],
                });
            } else if (result.captured) {
                const context = await readClipContext(docId);
                const docTitle = context?.title || "未命名文章";
                lvActivity.record({
                    source: "拾遗",
                    category: "clip",
                    title: t(this.plugin.i18n, "capture.activityClipTitle", { title: docTitle }),
                    linkBlockId: docId,
                });
                notifyClipSuccess({
                    docId,
                    title: docTitle,
                    openAction: () => this.plugin.openReadingDocument(docId),
                });
                autoEnrich(this.plugin.pluginInstance, docId, this.plugin.settings, () => this.plugin.notifyDataChanged());
            } else {
                showNotice(t(this.plugin.i18n, "msg.alreadyIn"), 2500, "info");
            }
            this.plugin.notifyDataChanged();
        } catch (error) {
            console.warn("[glean] 手动收录失败:", error);
            showNotice(t(this.plugin.i18n, "msg.captureFailed"), 3500, "error");
        } finally {
            this.capturingDocIds.delete(docId);
        }
    }

    async migrateFromInbox(ids: string[]): Promise<void> {
        if (this.inboxMigrating) return;
        let notebookId = this.plugin.settings.anchorNotebooks[0];
        if (notebookId && this.plugin.settings.anchorNotebooks.length > 0) {
            try {
                const { listNotebooks } = await import("../api/client.ts");
                const { resolveDefaultAnchorNotebook } = await import("../services/settings.ts");
                const openNbs = await listNotebooks().catch(() => []);
                if (openNbs.length > 0) {
                    notebookId = resolveDefaultAnchorNotebook(openNbs, this.plugin.settings.anchorNotebooks) || notebookId;
                }
            } catch {}
        }
        if (!notebookId) {
            showNotice(t(this.plugin.i18n, "panel.noAnchorHint"), 4000, "warn");
            return;
        }
        this.inboxMigrating = true;
        try {
            let ok = 0;
            let duplicates = 0;
            let lastDocId = "";
            let lastTitle = "";
            const total = ids.length;
            let currentIdx = 0;

            for (const id of ids) {
                currentIdx += 1;
                if (total > 1) {
                    notifyClipProgress(currentIdx, total, "剪藏");
                }
                try {
                    const shorthand = await getShorthand(id);
                    if (!shorthand) continue;
                    const result = await migrateShorthand(this.plugin.pluginInstance, shorthand, { notebookId });
                    if (result.duplicate) {
                        duplicates += 1;
                        continue;
                    }
                    ok += 1;
                    lastDocId = result.docId;
                    lastTitle = shorthand.shorthandTitle || shorthand.shorthandDesc?.slice(0, 30) || "未命名文章";
                    lvActivity.record({
                        source: "拾遗",
                        category: "clip",
                        title: `剪藏《${lastTitle}》`,
                        linkBlockId: result.docId,
                    });
                } catch (error) {
                    console.warn("[glean] 收集箱迁入失败:", error);
                    const kind = isKernelRequestError(error) ? error.kind : kernelErrorKind(error);
                    const messageKey =
                        kind === "permission"
                            ? "inbox.permissionRequired"
                            : kind === "network"
                              ? "inbox.networkFailed"
                              : kind === "timeout"
                                ? "inbox.timeout"
                                : "msg.actionFailed";
                    showNotice(t(this.plugin.i18n, messageKey), 4500, "error");
                }
            }

            if (ok > 0) {
                if (ok === 1 && lastDocId) {
                    notifyClipSuccess({
                        docId: lastDocId,
                        title: lastTitle,
                        openAction: () => this.plugin.openReadingDocument(lastDocId),
                    });
                } else {
                    lvNotify.card({
                        source: "小驴拾遗",
                        category: "inbox-migrate-done",
                        title: "收集箱迁入完成",
                        message:
                            duplicates > 0
                                ? `成功迁入 ${ok} 篇待读文章（已跳过 ${duplicates} 篇重复）`
                                : `成功迁入 ${ok} 篇待读文章`,
                        level: "success",
                        duration: 6000,
                        actions: [
                            {
                                label: "打开读库",
                                primary: true,
                                onClick: () => this.plugin.openPanel(),
                                dismissAfterClick: true,
                            },
                        ],
                    });
                }
            } else if (duplicates > 0) {
                showNotice(`${t(this.plugin.i18n, "inbox.duplicate")}（${duplicates} 篇）`, 3500, "warn");
            }
            this.plugin.notifyDataChanged();
        } finally {
            this.inboxMigrating = false;
        }
    }

    onPluginUrl(event: { detail?: { url?: string } }): void {
        const raw = event?.detail?.url;
        if (!raw || typeof raw !== "string") return;
        try {
            const parsed = new URL(raw);
            const action = parsed.searchParams.get("action");
            if (
                action === "workbench" ||
                action === "library" ||
                action === "resurface" ||
                action === "highlights" ||
                action === "stats"
            ) {
                this.plugin.openPanel(action === "workbench" ? undefined : action);
            } else if (action === "settings") {
                this.plugin.openSettings();
            } else if (action === "open") {
                const id = parsed.searchParams.get("id")?.trim();
                if (id && /^[\w-]+$/.test(id)) this.plugin.openReadingDocument(id);
            } else if (action === "capture") {
                void this.addCurrentDocToLibrary();
            }
        } catch {
            // 忽略非标准 URL
        }
    }

    onMenuInbox(event: { detail: { ids?: string[]; menu: { addItem: (item: unknown) => void } } }): void {
        if (!event?.detail?.menu) return;
        const ids = event.detail.ids ?? [];
        if (ids.length === 0) return;
        event.detail.menu.addItem({
            id: "glean-inbox-migrate",
            iconHTML: "",
            label: t(this.plugin.i18n, "pluginName") + "：" + t(this.plugin.i18n, "inbox.menuMigrate", { n: ids.length }),
            click: () => void this.migrateFromInbox(ids),
        });
    }

    onMenuContent(event: { detail: { protyle?: { block?: { rootID?: string } }; menu: { addItem: (item: unknown) => void } } }): void {
        if (!event?.detail?.menu) return;
        const rootId = event.detail.protyle?.block?.rootID;
        if (!rootId) return;
        const selected = this.plugin.cardSelection();
        const selectionText = selected?.docId === rootId ? selected.quote : "";
        if (selectionText) {
            event.detail.menu.addItem({
                id: "glean-make-card",
                iconHTML: "",
                label: t(this.plugin.i18n, "flashcard.menuMake", { n: [...selectionText.trim()].length }),
                click: () => void this.plugin.makeCardFromSelection(),
            });
        }
        event.detail.menu.addItem({
            id: "glean-add-to-library",
            iconHTML: "",
            label: `${t(this.plugin.i18n, "pluginName")}：${t(this.plugin.i18n, "action.addToInbox")}`,
            click: async () => {
                try {
                    const result = await captureDocument(this.plugin.pluginInstance, rootId, { src: "manual" });
                    if (result.conflict) {
                        const confTitle = result.conflict.title || result.conflict.hpath || "";
                        lvNotify.card({
                            source: "小驴拾遗",
                            category: "clip-conflict",
                            title: t(this.plugin.i18n, "inbox.duplicate"),
                            message: confTitle ? t(this.plugin.i18n, "inbox.duplicateSameSource", { title: confTitle }) : t(this.plugin.i18n, "inbox.duplicateSameUrl"),
                            level: "warn",
                            duration: 6000,
                            actions: [
                                {
                                    label: t(this.plugin.i18n, "inbox.viewExistingDoc"),
                                    primary: true,
                                    onClick: () => this.plugin.openReadingDocument(result.conflict!.id),
                                    dismissAfterClick: true,
                                },
                            ],
                        });
                    } else if (result.captured) {
                        const context = await readClipContext(rootId);
                        const docTitle = context?.title || "未命名文章";
                        lvActivity.record({
                            source: "拾遗",
                            category: "clip",
                            title: t(this.plugin.i18n, "capture.activityClipTitle", { title: docTitle }),
                            linkBlockId: rootId,
                        });
                        notifyClipSuccess({
                            docId: rootId,
                            title: docTitle,
                            openAction: () => this.plugin.openReadingDocument(rootId),
                        });
                        autoEnrich(this.plugin.pluginInstance, rootId, this.plugin.settings, () => this.plugin.notifyDataChanged());
                    } else {
                        showNotice(t(this.plugin.i18n, "msg.alreadyIn"), 2500, "info");
                    }
                    this.plugin.notifyDataChanged();
                } catch (error) {
                    console.warn("[glean] 右键收录失败:", error);
                    showNotice(t(this.plugin.i18n, "msg.captureFailed"), 3500, "error");
                }
            },
        });
    }

    async enrichCurrentDoc(): Promise<void> {
        const docId = this.plugin.currentDocId();
        if (!docId) {
            showMessage(t(this.plugin.i18n, "msg.noSelection"), 3000);
            return;
        }
        try {
            const outcome = await withLvAiWait(
                {
                    scenario: "general",
                    title: t(this.plugin.i18n, "ai.actionEnrich"),
                    subtitle: t(this.plugin.i18n, "ai.enriching"),
                },
                (signal) => enrichClip(this.plugin.pluginInstance, docId, this.plugin.settings, { signal }),
            );
            if (outcome.aborted) {
                return;
            }
            if (outcome.ok) {
                showMessage(
                    outcome.duplicates.length > 0
                        ? t(this.plugin.i18n, "ai.similarFound", { title: outcome.duplicates[0].title })
                        : t(this.plugin.i18n, "ai.enrichDone"),
                    3500,
                );
            } else if (outcome.skipped === "cap") {
                showMessage(t(this.plugin.i18n, "ai.capReached", { n: this.plugin.settings.ai.enrichDailyCap }), 4000);
            } else {
                showMessage(t(this.plugin.i18n, "ai.enrichFailed"), 3000);
            }
        } catch (error) {
            console.warn("[glean] 手动富化失败:", error);
            showMessage(t(this.plugin.i18n, "ai.enrichFailed"), 3000);
        }
        this.plugin.notifyDataChanged();
    }
}

export function createInboxSync(plugin: InboxSyncHost): InboxSyncCoordinator {
    return new InboxSyncCoordinator(plugin);
}
