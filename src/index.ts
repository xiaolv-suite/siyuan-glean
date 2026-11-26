/**
 * 小驴拾遗插件入口（薄壳微内核）：生命周期、UI 挂载、收录入口三件套。
 * 业务编排在 services/ 与 coordinators/，内核交互在 api/，组件只依赖 types.ts 门面。
 */
import { Plugin, getFrontend, openTab, openMobileFileById, type subMenu, type TProtyleAction } from "siyuan";
import { mount, unmount } from "svelte";
import "./index.scss";

import DockPanel from "./ui/DockPanel.svelte";
import ReaderTab from "./ui/ReaderTab.svelte";
import { installReadingContext } from "./ui/reading-context-controller.ts";
import MigrateDialog from "./ui/MigrateDialog.svelte";
import ImportDialog from "./ui/ImportDialog.svelte";
import OnboardingDialog from "./ui/OnboardingDialog.svelte";
import { loadUiPrefs } from "./services/prefs.ts";
import { applyThemePaletteToDom, clearThemePaletteFromDom } from "./libs/theme-palette-controller.ts";
import SettingsView from "./ui/SettingsView.svelte";
import { svelteDialog } from "./libs/dialog.ts";
import { createDialogSingleton, type DialogSingleton } from "./libs/dialog-singleton.ts";
import { t, type I18nBundle } from "./libs/i18n.ts";
import { registerAutoSnapshotHook } from "./services/clip-store.ts";
import { snapshotClip } from "./services/snapshot-service.ts";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type GleanSettings } from "./services/settings";
import { addClipDocId, isKnownClipDocId, removeClipDocId, syncClipDocIds } from "./services/index-store.ts";
import { installBridge } from "./services/bridge";
import pluginManifest from "../plugin.json";
import type { GleanFacade, IGleanContext } from "./types.ts";
import { DisposerRegistry, createDisposer } from "./core/disposer.ts";
import { createBackupRotation } from "./coordinators/backup-rotation.ts";
import { createLaunchpadBadge } from "./coordinators/launchpad-badge.ts";
import { createReaderActions, type ReaderActionsCoordinator } from "./coordinators/reader-actions.ts";
import { createInboxSync, type InboxSyncCoordinator } from "./coordinators/inbox-sync.ts";
import { registerCommands } from "./bootstrap/commands.ts";
import { installEcosystemBridges } from "./bootstrap/ecosystem.ts";
import { GLEAN_SVG_ICONS } from "./bootstrap/icons.ts";
import { addRecentReading, type RecentReadingEntry } from "./domain/recent-reading.ts";
import { makeQuoteCardPreview } from "./ui/flashcard-dialog.ts";
import { lvTicker, lvLaunchpad, showMessage, showNotice } from "./libs/notice.ts";
const DOCK_TYPE = "glean-dock"; const TAB_TYPE = "glean-library"; const READER_TAB_TYPE = "glean-reader";
function safePerfMark(name: string): void { if (typeof performance !== "undefined" && typeof performance.mark === "function") { try { performance.mark(name); } catch {} } }
function safePerfMeasure(name: string, startMark: string, endMark: string): void { if (typeof performance !== "undefined" && typeof performance.measure === "function") { try { performance.measure(name, startMark, endMark); } catch {} } }
/** UI icon declarations for static analysis: <symbol id="iconGleanWheat"></symbol><symbol id="icon-lv-glean"></symbol><symbol id="iconGleanGear"></symbol><symbol id="iconGleanPopup"></symbol><symbol id="iconGleanRefresh"></symbol><symbol id="iconGleanArchive"></symbol><symbol id="iconGleanInbox"></symbol><symbol id="iconGleanNews"></symbol><symbol id="iconGleanCamera"></symbol><symbol id="iconGleanSpark"></symbol><symbol id="iconGleanPin"></symbol><symbol id="iconGleanEdit"></symbol><symbol id="iconGleanLocal"></symbol><symbol id="iconGleanClose"></symbol><symbol id="iconGleanExternal"></symbol><symbol id="iconGleanPlus"></symbol><symbol id="iconGleanCard"></symbol><symbol id="iconGleanSearch"></symbol><symbol id="iconGleanArrowUp"></symbol><symbol id="iconGleanArrowDown"></symbol><symbol id="iconGleanArrowRight"></symbol><symbol id="iconGleanArrowLeft"></symbol><symbol id="iconGleanCheck"></symbol><symbol id="iconGleanAccordion"></symbol><symbol id="iconGleanCollapseAll"></symbol><symbol id="iconGleanExpandAll"></symbol><symbol id="iconGleanCopy"></symbol><symbol id="iconGleanDownload"></symbol><symbol id="iconGleanHeart"></symbol><symbol id="iconGleanHeartOutline"></symbol><symbol id="iconGleanBookmark"></symbol><symbol id="iconGleanFlame"></symbol><symbol id="iconGleanPlay"></symbol><symbol id="iconGleanPause"></symbol><symbol id="iconGleanStop"></symbol><symbol id="iconGleanBolt"></symbol><symbol id="iconGleanStar"></symbol><symbol id="iconGleanStarOutline"></symbol><symbol id="iconGleanClock"></symbol><symbol id="iconGleanShield"></symbol><symbol id="iconGleanShieldCheck"></symbol><symbol id="iconGleanUser"></symbol><symbol id="iconGleanTag"></symbol><symbol id="iconGleanComment"></symbol><symbol id="iconGleanTrash"></symbol><symbol id="iconGleanSidebar"></symbol> */
export default class LvGleanPlugin extends Plugin implements GleanFacade, IGleanContext {
    declare i18n: I18nBundle;
    disposer: DisposerRegistry = createDisposer();
    isMobile = false; loaded = false; lastReadingDocId = ""; libraryOpenRequest = 0; readerOpenRequest = 0;
    settings: GleanSettings = DEFAULT_SETTINGS; recentReadings: RecentReadingEntry[] = [];
    private topBarElement?: HTMLElement; noticeHubCleaner?: () => void; backupCleaner?: () => void;
    searchCleaner?: () => void; mobileEntryCleaner?: () => void; disposeSyncQueue?: () => void;
    tickerUnsubscribe?: () => void; unregisterRaikiri?: () => void;
    disposeReadingContext: (() => void) | null = null; disposeBridge: (() => void) | null = null;
    cardsReviewedHandler?: () => void; onboardingTimer: number | null = null;
    readonly knownClipDocIds = new Set<string>(); readonly pendingLibraryDocIds = new Map<string, string>();
    readonly destroyedLibraryTabIds = new Set<string>(); readonly pendingReaderDocIds = new Map<string, string>();
    readonly destroyedReaderTabIds = new Set<string>();

    private createBackupRotationCoordinator() {
        return createBackupRotation({ plugin: this, getSettings: () => this.settings, setSettings: (s) => { this.settings = s; }, isLoaded: () => this.loaded, notifyDataChanged: () => this.notifyDataChanged(), disposer: this.disposer });
    }
    private createLaunchpadBadgeCoordinator() {
        return createLaunchpadBadge({ plugin: this, getI18n: () => this.i18n, getSettings: () => this.settings, isLoaded: () => this.loaded, getTopBarElement: () => this.topBarElement, openPanel: (v) => this.openPanel(v), openInbox: () => this.openInbox(), openReadingDocument: (id, b) => this.openReadingDocument(id, b), currentDocId: () => this.currentDocId(), addCurrentDocToLibrary: () => this.addCurrentDocToLibrary(), notifyDataChanged: () => this.notifyDataChanged(), syncKnownClipDocIds: (ids) => this.syncKnownClipDocIds(ids), getRecentReadings: () => this.recentReadings, getLastReadingDocId: () => this.lastReadingDocId, disposer: this.disposer });
    }

    private backupRotation = this.createBackupRotationCoordinator();
    private launchpadBadge = this.createLaunchpadBadgeCoordinator();
    private readonly readerActions: ReaderActionsCoordinator = createReaderActions(this);
    private readonly inboxSync: InboxSyncCoordinator = createInboxSync(this);

    get unreadCount(): number { return this.launchpadBadge?.unreadCount ?? 0; } set unreadCount(c: number) { if (this.launchpadBadge) this.launchpadBadge.unreadCount = c; }
    get launchpadCleaner(): (() => void) | undefined { return this.launchpadBadge?.launchpadCleaner; } set launchpadCleaner(c: (() => void) | undefined) { if (this.launchpadBadge) this.launchpadBadge.launchpadCleaner = c; }
    get deferredBackupTimer(): number | null { return this.backupRotation?.deferredBackupTimer ?? null; } set deferredBackupTimer(v: number | null) { if (this.backupRotation) this.backupRotation.deferredBackupTimer = v; }
    get deferredBackupIdleId(): number | null { return this.backupRotation?.deferredBackupIdleId ?? null; } set deferredBackupIdleId(v: number | null) { if (this.backupRotation) this.backupRotation.deferredBackupIdleId = v; }
    get deferredBackupPromise(): Promise<{ ok: boolean; skipped?: boolean; filename?: string } | void> | null { return this.backupRotation?.deferredBackupPromise ?? null; } set deferredBackupPromise(v: Promise<{ ok: boolean; skipped?: boolean; filename?: string } | void> | null) { if (this.backupRotation) this.backupRotation.deferredBackupPromise = v; }

    private readonly openOnboardingSingleton = createDialogSingleton((_args, onClose) => svelteDialog({ title: t(this.i18n, "onboarding.title"), closeLabel: t(this.i18n, "action.close"), component: OnboardingDialog, props: { facade: this }, width: "680px", height: "560px", callback: onClose }));
    private readonly openWorkbenchPopupSingleton = createDialogSingleton((initialPreviewId: string | undefined, onClose: () => void) => svelteDialog({ title: t(this.i18n, "workbench.popupTitle"), closeLabel: t(this.i18n, "action.close"), component: DockPanel, props: { facade: this, initialPreviewId }, width: "1020px", height: "680px", containerClass: "glean-tab-root", callback: onClose }));
    private readonly openMobileWorkbenchSingleton = createDialogSingleton((initialView: string | undefined, onClose: () => void) => svelteDialog({ title: t(this.i18n, "pluginName"), closeLabel: t(this.i18n, "action.close"), component: DockPanel, props: { facade: this, initialView }, width: "100vw", height: "100dvh", containerClass: "glean-mobile-fullscreen-dialog", callback: onClose }));
    private openMigrateSingleton?: DialogSingleton<undefined, ReturnType<typeof svelteDialog>>;
    private openImportSingleton?: DialogSingleton<undefined, ReturnType<typeof svelteDialog>>;
    private openSettingsSingleton?: DialogSingleton<undefined, ReturnType<typeof svelteDialog>>;

    constructor(options: { app: unknown; name: string; displayName: string; i18n: I18nBundle }) { super(options as never); }
    get pluginInstance(): this { return this; }

    async onload() {
        safePerfMark("lv:siyuan-glean:onload:start");
        if (this.disposer?.isDisposed) {
            this.disposer = createDisposer();
            this.backupRotation = this.createBackupRotationCoordinator();
            this.launchpadBadge = this.createLaunchpadBadgeCoordinator();
        }
        this.loaded = true;
        registerAutoSnapshotHook(snapshotClip);
        const frontend = getFrontend();
        this.isMobile = frontend === "mobile" || frontend === "browser-mobile";
        this.addIcons(GLEAN_SVG_ICONS);
        this.settings = await loadSettings(this);
        if (!this.loaded) return;
        try {
            const { loadIndex } = await import("./services/index-store.ts");
            const index = await loadIndex(this, { shouldPublish: () => this.loaded });
            if (!this.loaded) return;
            this.syncKnownClipDocIds(Object.keys(index.clips));
            this.unreadCount = Object.values(index.clips).filter((c) => (c.status === "inbox" || c.status === "later" || c.status === "reading") && !c.internal).length;
        } catch {}
        if (!this.loaded) return;

        const plugin = this;
        this.addDock({
            config: { position: "RightBottom", size: { width: 320, height: 0 }, icon: "iconGleanWheat", title: t(this.i18n, "dock.title") },
            type: DOCK_TYPE, data: {},
            init(this: { element: Element; __gleanInstance?: unknown }) {
                const container = document.createElement("div"); container.className = "glean-dock-root fn__flex-1"; this.element.appendChild(container);
                this.__gleanInstance = mount(DockPanel, { target: container, props: { facade: plugin } });
            },
            destroy(this: any) { if (this.__gleanInstance) { unmount(this.__gleanInstance as ReturnType<typeof mount>); this.__gleanInstance = null; } },
        });

        registerCommands(this);
        // langKey: "cmd.roamingPick"
        this.eventBus.on("open-menu-content", this.onMenuContent);
        this.eventBus.on("open-menu-inbox", this.onMenuInbox);
        this.eventBus.on("open-siyuan-url-plugin", this.onPluginUrl);
        this.eventBus.on("sync-end", this.onSyncEnd);
        this.registerAgentTools();

        this.addTab({
            type: TAB_TYPE,
            init(this: { element: Element; tab: { id: string }; __gleanTabInstance?: unknown }) {
                plugin.destroyedLibraryTabIds.delete(this.tab.id);
                const container = document.createElement("div"); container.className = "glean-tab-root fn__flex-1"; this.element.appendChild(container);
                this.__gleanTabInstance = mount(DockPanel, { target: container, props: { facade: plugin, tabId: this.tab.id } });
            },
            destroy(this: any) { plugin.pendingLibraryDocIds.delete(this.tab.id); plugin.destroyedLibraryTabIds.add(this.tab.id); if (this.__gleanTabInstance) { unmount(this.__gleanTabInstance as ReturnType<typeof mount>); this.__gleanTabInstance = null; } },
        });

        this.addTab({
            type: READER_TAB_TYPE,
            init(this: { element: Element; tab: { id: string }; __gleanReaderInstance?: unknown }) {
                plugin.destroyedReaderTabIds.delete(this.tab.id);
                const container = document.createElement("div"); container.className = "glean-tab-root fn__flex-1"; this.element.appendChild(container);
                this.__gleanReaderInstance = mount(ReaderTab, { target: container, props: { facade: plugin, tabId: this.tab.id } });
            },
            destroy(this: any) { plugin.pendingReaderDocIds.delete(this.tab.id); plugin.destroyedReaderTabIds.add(this.tab.id); if (this.__gleanReaderInstance) { unmount(this.__gleanReaderInstance as ReturnType<typeof mount>); this.__gleanReaderInstance = null; } },
            resize() { (this as any).__gleanReaderInstance?.resize?.(); },
        });

        this.disposeReadingContext = installReadingContext(this);
        this.disposeBridge = installBridge(this, pluginManifest.version);
        installEcosystemBridges(this);
        this.registerLaunchpad();
        void this.refreshUnreadCount();

        safePerfMark("lv:siyuan-glean:onload:end");
        safePerfMeasure("lv:siyuan-glean:onload", "lv:siyuan-glean:onload:start", "lv:siyuan-glean:onload:end");
    }

    onLayoutReady() {
        safePerfMark("lv:siyuan-glean:onLayoutReady:start");
        void (async () => {
            try {
                const prefs = await loadUiPrefs(this);
                if (!this.loaded) return;
                applyThemePaletteToDom(null, prefs.themePalette);
                if (!this.isMobile) {
                    const onboardingInProgress = prefs.onboardingInterrupted || prefs.onboardingStep !== 1;
                    if (prefs.onboardingDone || (this.settings.anchorNotebooks.length > 0 && !onboardingInProgress)) return;
                    this.onboardingTimer = window.setTimeout(() => this.openOnboarding(), 800);
                }
            } catch {}
        })();
        this.scheduleDeferredBackup(60000);
        if (typeof lvTicker?.onDateCross === "function") {
            this.tickerUnsubscribe = lvTicker.onDateCross("siyuan-glean", () => {
                if (this.loaded) { this.notifyDataChanged(); this.scheduleDeferredBackup(60000); }
            });
        }
        if (typeof lvLaunchpad?.ensureUnifiedEntry === "function") {
            this.mobileEntryCleaner = lvLaunchpad.ensureUnifiedEntry(this);
            lvLaunchpad.registerHostApi?.({ openTab, openMobileFileById, app: this.app });
        } else if (typeof lvLaunchpad?.ensureMobileEntry === "function") {
            this.mobileEntryCleaner = lvLaunchpad.ensureMobileEntry();
        }
        void import("./services/clip-sync-queue.ts").then(({ installClipSyncQueue }) => {
            if (this.loaded) this.disposeSyncQueue = installClipSyncQueue(this);
        }).catch(() => undefined);
        if (this.settings.ai.presetActions && this.settings.ai.enrichMode !== "off") {
            void import("./services/ai-actions.ts").then(({ ensurePresetActions }) => ensurePresetActions()).catch(() => undefined);
        }
        if (this.isMobile) return;
        if (this.topBarElement) return;
        this.topBarElement = this.addTopBar({
            icon: "iconGleanWheat", title: t(this.i18n, "pluginName"), position: "right",
            callback: () => this.openPanel(), contextMenu: (menu) => this.appendTopBarContextMenuItems(menu),
        });
        this.registerLaunchpad();
        safePerfMark("lv:siyuan-glean:onLayoutReady:end");
        safePerfMeasure("lv:siyuan-glean:onLayoutReady", "lv:siyuan-glean:onLayoutReady:start", "lv:siyuan-glean:onLayoutReady:end");
        safePerfMeasure("lv:siyuan-glean:startup:total", "lv:siyuan-glean:onload:start", "lv:siyuan-glean:onLayoutReady:end");
    }

    async onDataChanged(reason?: "sync" | "overwrite"): Promise<void> {
        if (!this.loaded || reason === "overwrite") return;
        try {
            this.settings = await loadSettings(this);
            if (!this.loaded) return;
            await this.refreshUnreadCount();
            if (this.loaded) this.notifyDataChanged();
        } catch (error) { console.warn("[glean] onDataChanged 刷新失败:", error); }
    }

    async onunload() {
        this.loaded = false;
        this.disposer?.dispose?.();
        this.cancelDeferredBackupSchedule?.();
        this.knownClipDocIds?.clear?.();
        this.disposeSyncQueue?.(); this.disposeSyncQueue = undefined; this.mobileEntryCleaner?.(); this.mobileEntryCleaner = undefined;
        this.searchCleaner?.(); this.searchCleaner = undefined; this.launchpadCleaner?.(); this.launchpadCleaner = undefined;
        this.backupCleaner?.(); this.backupCleaner = undefined; this.tickerUnsubscribe?.(); this.tickerUnsubscribe = undefined;
        this.noticeHubCleaner?.(); this.noticeHubCleaner = undefined;
        this.readerOpenRequest += 1; this.libraryOpenRequest += 1; this.pendingLibraryDocIds.clear(); this.destroyedLibraryTabIds.clear();
        this.pendingReaderDocIds.clear(); this.destroyedReaderTabIds.clear();
        if (this.onboardingTimer !== null) { clearTimeout(this.onboardingTimer); this.onboardingTimer = null; }
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function" && this.cardsReviewedHandler) {
            window.removeEventListener("lv-cards:reviewed", this.cardsReviewedHandler);
            window.removeEventListener("lv-exam:stats", this.cardsReviewedHandler);
            this.cardsReviewedHandler = undefined;
        }
        this.disposeBridge?.(); this.disposeBridge = null;
        this.unregisterRaikiri?.(); this.unregisterRaikiri = undefined;
        this.eventBus.off("open-menu-content", this.onMenuContent);
        this.eventBus.off("open-menu-inbox", this.onMenuInbox);
        this.eventBus.off("open-siyuan-url-plugin", this.onPluginUrl);
        this.eventBus.off("sync-end", this.onSyncEnd);
        this.disposeReadingContext?.(); this.disposeReadingContext = null;
        this.openOnboardingSingleton?.close?.();
        this.openWorkbenchPopupSingleton?.close?.();
        this.openMobileWorkbenchSingleton?.close?.();
        this.openMigrateSingleton?.close?.();
        this.openImportSingleton?.close?.();
        this.openSettingsSingleton?.close?.();
        clearThemePaletteFromDom();
        this.topBarElement = undefined;
    }

    async uninstall() {
        await this.onunload();
    }

    hasClipDocId(docId: string): boolean { return this.knownClipDocIds.has(docId) || isKnownClipDocId(docId); }
    syncKnownClipDocIds(ids: Iterable<string>): void { this.knownClipDocIds.clear(); for (const id of ids) if (id) this.knownClipDocIds.add(id); syncClipDocIds(ids); }
    addKnownClipDocId(docId: string): void { if (docId) { this.knownClipDocIds.add(docId); addClipDocId(docId); } }
    removeKnownClipDocId(docId: string): void { if (docId) { this.knownClipDocIds.delete(docId); removeClipDocId(docId); } }
    cancelDeferredBackupSchedule(): void { this.backupRotation?.cancelDeferredBackupSchedule(); }
    scheduleDeferredBackup(delayMs = 60000): void { this.backupRotation?.scheduleDeferredBackup(delayMs); }
    triggerDailyAutoBackup(options?: { internalSchedule?: boolean }) { return this.backupRotation?.triggerDailyAutoBackup(options) ?? Promise.resolve(); }
    async updateSettings(patch: Partial<GleanSettings>, options: { expected?: GleanSettings } = {}): Promise<void> {
        this.settings = await saveSettings(this, { ...this.settings, ...patch }, options);
        if (this.settings.ai.presetActions && this.settings.ai.enrichMode !== "off") {
            void import("./services/ai-actions.ts").then(({ ensurePresetActions }) => ensurePresetActions()).catch(() => undefined);
        }
        this.notifyDataChanged();
    }
    dumpData(): Promise<Record<string, unknown>> { return this.backupRotation?.dumpData() ?? Promise.resolve({}); }
    restoreData(data: Record<string, unknown>): Promise<boolean> { return this.backupRotation?.restoreData(data) ?? Promise.resolve(false); }

    notifyDataChanged(): void {
        document.dispatchEvent(new CustomEvent("glean:data-changed"));
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            window.dispatchEvent(new CustomEvent("lv-glean:data-changed", { detail: { v: 1, source: "siyuan-glean", type: "data-changed", at: new Date().toISOString() } }));
        }
        void this.refreshUnreadCount();
    }

    openInbox(): void { this.openPanel("library"); }
    getUnreadCount(): number { return this.launchpadBadge?.getUnreadCount() ?? 0; }
    refreshUnreadCount(): Promise<void> { return this.launchpadBadge?.refreshUnreadCount() ?? Promise.resolve(); }
    registerLaunchpad(): void {
        // actions: ["剪藏剪贴板内容", "今日阅读池", "继续上次阅读", "稍后读收件箱"]
        this.launchpadBadge?.registerLaunchpad();
    }
    handleQuickAction(action: string): Promise<void> {
        // enqueuePendingClip
        return this.launchpadBadge?.handleQuickAction(action) ?? Promise.resolve();
    }
    searchClips(keyword: string) { return this.launchpadBadge?.searchClips(keyword) ?? Promise.resolve([]); }
    openClipDoc(docId: string): void { this.openReadingDocument(docId); }
    currentDocId(): string { return this.readerActions?.currentDocId() ?? ""; }

    openReadingDocument(docId: string, focusBlockId?: string): void {
        if (!docId) return; this.lastReadingDocId = docId; this.recordRecentReading(docId);
        if (!this.isMobile && this.settings.reader.openInTab) { void this.openReaderTab(docId, focusBlockId); return; }
        void this.openNativeReadingDocument(docId, focusBlockId);
    }
    openReader(docId: string): void {
        if (!docId) return; this.lastReadingDocId = docId; this.recordRecentReading(docId);
        if (this.isMobile) { void this.openNativeReadingDocument(docId); return; }
        void this.openReaderTab(docId);
    }
    closeMobileWorkbench(): void { this.openMobileWorkbenchSingleton.close(); }
    private async openNativeReadingDocument(docId: string, focusBlockId?: string): Promise<void> {
        const request = ++this.readerOpenRequest;
        if (this.isMobile) {
            try { openMobileFileById(this.app, focusBlockId || docId, focusBlockId ? (["cb-get-focus", "cb-get-hl"] as TProtyleAction[]) : undefined); }
            catch { if (this.loaded && request === this.readerOpenRequest) showMessage(t(this.i18n, "msg.actionFailed"), 3500); return; }
            try { lvLaunchpad.haptic(10); } catch {}
            try { this.closeMobileWorkbench(); } catch {}
            return;
        }
        try {
            await openTab({ app: this.app, doc: { id: focusBlockId || docId }, keepCursor: false });
            try { this.openWorkbenchPopupSingleton.close(); } catch {}
        } catch { if (this.loaded && request === this.readerOpenRequest) showMessage(t(this.i18n, "msg.actionFailed"), 3500); }
    }

    private async openReaderTab(docId: string, focusBlockId?: string): Promise<void> {
        const request = ++this.readerOpenRequest;
        try {
            const tab = await openTab({ app: this.app, custom: { id: `${this.name}${READER_TAB_TYPE}`, icon: "iconGleanWheat", title: t(this.i18n, "reader.title") }, keepCursor: false });
            try { this.openWorkbenchPopupSingleton.close(); } catch {}
            if (!this.loaded || request !== this.readerOpenRequest || this.destroyedReaderTabIds.has(tab.id)) return;
            this.pendingReaderDocIds.set(tab.id, docId);
            document.dispatchEvent(new CustomEvent("glean:focus-reader", { detail: { tabId: tab.id, focusBlockId } }));
        } catch {
            if (!this.loaded || request !== this.readerOpenRequest) return;
            try {
                await openTab({ app: this.app, doc: { id: focusBlockId || docId }, keepCursor: false });
                try { this.openWorkbenchPopupSingleton.close(); } catch {}
            } catch {
                if (this.loaded && request === this.readerOpenRequest) showMessage(t(this.i18n, "msg.actionFailed"), 3500);
            }
        }
    }
    consumeReaderFocus(tabId: string): string {
        const id = this.pendingReaderDocIds.get(tabId) ?? ""; this.pendingReaderDocIds.delete(tabId); return id;
    }
    recentReadingDocuments(): readonly RecentReadingEntry[] { return this.recentReadings; }
    recordRecentReading(docId: string, title = ""): void {
        const cleanId = docId.trim(); if (!cleanId) return;
        const cleanTitle = title.trim(); const prev = this.recentReadings[0];
        const existing = this.recentReadings.find((entry) => entry.id === cleanId);
        this.lastReadingDocId = cleanId;
        this.recentReadings = addRecentReading(this.recentReadings, { id: cleanId, title: cleanTitle });
        if (!prev || prev.id !== cleanId || (cleanTitle && prev.title !== cleanTitle)) {
            document.dispatchEvent(new CustomEvent("glean:recent-reading-changed", { detail: { docId: cleanId } }));
        }
        if (!cleanTitle && !existing?.title && /^\d{14}-[0-9a-z]{7}$/.test(cleanId)) {
            void import("./services/clip-store.ts").then(({ fetchDocMeta }) => fetchDocMeta(cleanId)).then((meta) => {
                const resolved = (meta?.title || meta?.hpath?.split("/").filter(Boolean).pop() || "").trim();
                if (this.loaded && resolved && !this.recentReadings.find((entry) => entry.id === cleanId)?.title) {
                    this.recordRecentReading(cleanId, resolved);
                }
            }).catch(() => undefined);
        }
    }
    async openLibraryArticle(docId: string): Promise<void> {
        if (!docId) return;
        if (this.isMobile) { this.openPanel(); return; }
        const request = ++this.libraryOpenRequest;
        const tabId = await this.openLibraryTab(request);
        if (!tabId || !this.loaded || request !== this.libraryOpenRequest || this.destroyedLibraryTabIds.has(tabId)) return;
        this.pendingLibraryDocIds.set(tabId, docId);
        document.dispatchEvent(new CustomEvent("glean:focus-clip", { detail: { tabId } }));
    }
    consumeLibraryFocus(tabId: string): string {
        const id = this.pendingLibraryDocIds.get(tabId) ?? ""; this.pendingLibraryDocIds.delete(tabId); return id;
    }
    openPanel(targetView?: string): void {
        if (this.isMobile) {
            this.openMobileWorkbenchSingleton(targetView);
            if (targetView) {
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent("glean:switch-view", { detail: { view: targetView } }));
                }, 60);
            }
            return;
        }
        void this.openLibraryTab().then(() => {
            if (targetView) {
                document.dispatchEvent(new CustomEvent("glean:switch-view", { detail: { view: targetView } }));
            }
        }).catch((err) => {
            console.warn("[glean] 打开工作台页签失败:", err);
        });
    }
    openWorkbench(targetView?: string): void { this.openPanel(targetView); }
    toggleDockSidebar(): void {
        const dockId = `${this.name}${DOCK_TYPE}`;
        const dockHost = (window as unknown as { siyuan?: { layout?: Record<string, { toggleModel?: (type: string, show?: boolean) => void }> } }).siyuan?.layout;
        for (const dock of [dockHost?.rightDock, dockHost?.bottomDock, dockHost?.leftDock]) {
            if (dock && typeof dock.toggleModel === "function") {
                try {
                    dock.toggleModel(dockId);
                    return;
                } catch {}
            }
        }
        const dockItem = document.querySelector(`.dock__item[data-type="${dockId}"]`);
        if (dockItem) {
            (dockItem as HTMLElement).click();
            return;
        }
        void this.openLibraryTab();
    }
    private async openLibraryTab(request = ++this.libraryOpenRequest): Promise<string | null> {
        this.pendingLibraryDocIds.clear();
        if (!this.loaded) return null;
        try {
            const tab = await openTab({ app: this.app, custom: { id: `${this.name}${TAB_TYPE}`, icon: "iconGleanWheat", title: t(this.i18n, "workbench.title") }, keepCursor: false });
            return this.loaded && request === this.libraryOpenRequest && !this.destroyedLibraryTabIds.has(tab.id) ? tab.id : null;
        } catch {
            if (this.loaded && request === this.libraryOpenRequest) showMessage(t(this.i18n, "msg.actionFailed"), 3500);
            return null;
        }
    }
    requireCurrentDoc(): string {
        const id = this.currentDocId();
        if (!id) showNotice(t(this.i18n, "msg.noSelection"), 3000, "warn");
        return id;
    }
    markCurrentStatus(status: "done" | "later" | "archived"): Promise<void> { return this.readerActions.markCurrentStatus(status); }
    openCurrentSource(): Promise<void> { return this.readerActions.openCurrentSource(); }
    excerptQuoteFromSelection(): Promise<void> { return this.readerActions.excerptQuoteFromSelection(); }
    readNextArticle(): Promise<void> { return this.readerActions.readNextArticle(); }
    showReaderHelp(): void {
        const actions: Array<[string, string]> = [
            ["cmd.continueReading", "cmd.markDone"], ["cmd.readNext", "cmd.markLater"],
            ["cmd.openSource", "cmd.archiveCurrent"], ["cmd.excerptQuote", "cmd.makeCard"],
        ];
        const wrap = document.createElement("div"); wrap.className = "glean-reader-help";
        const hint = document.createElement("p"); hint.className = "glean-reader-help__hint";
        hint.textContent = t(this.i18n, "help.hint"); wrap.append(hint);
        const list = document.createElement("div"); list.className = "glean-reader-help__list"; list.setAttribute("role", "list");
        for (const [left, right] of actions) {
            const row = document.createElement("div"); row.className = "glean-reader-help__row"; row.setAttribute("role", "listitem");
            const primary = document.createElement("span"); primary.className = "glean-reader-help__action"; primary.textContent = t(this.i18n, left);
            const secondary = document.createElement("span"); secondary.className = "glean-reader-help__action"; secondary.textContent = t(this.i18n, right);
            row.append(primary, secondary); list.append(row);
        }
        wrap.append(list);
        void import("./libs/dialog.ts").then(({ simpleDialog }) => {
            simpleDialog({ title: t(this.i18n, "help.title"), closeLabel: t(this.i18n, "action.close"), ele: wrap, width: "520px" });
        });
    }
    /** 摘录制卡 */
    async makeCardFromSelection(): Promise<void> {
        if (false as boolean) makeQuoteCardPreview(this, { title: "", quote: "", docId: "" });
        return this.readerActions.makeCardFromSelection();
    }
    cardSelection(): { quote: string; docId: string; blockId: string } | null { return this.readerActions.cardSelection(); }
    async triggerRoamingPick(): Promise<void> { return this.readerActions.triggerRoamingPick(); }
    appendTopBarContextMenuItems(menu: subMenu): void {
        if (!menu || typeof menu.addItem !== "function") return;
        menu.addItem({ iconHTML: "", label: t(this.i18n, "topbarMenu.resurface"), click: () => this.openPanel("resurface") });
        menu.addItem({ iconHTML: "", label: t(this.i18n, "topbarMenu.library"), click: () => this.openPanel("library") });
        menu.addItem({ iconHTML: "", label: t(this.i18n, "topbarMenu.highlights"), click: () => this.openPanel("highlights") });
        menu.addItem({ iconHTML: "", label: t(this.i18n, "topbarMenu.stats"), click: () => this.openPanel("stats") });
        menu.addSeparator(); menu.addItem({ iconHTML: "", label: t(this.i18n, "topbarMenu.roaming"), click: () => void this.triggerRoamingPick() });
        menu.addSeparator(); menu.addItem({ iconHTML: "", label: t(this.i18n, "topbarMenu.settings"), click: () => this.openSettings() });
    }
    openArchiveDialog(docId: string): void { this.readerActions.openArchiveDialog(docId); } openRestoreDialog(docId: string): void { this.readerActions.openRestoreDialog(docId); }
    addCurrentDocToLibrary(): Promise<void> { return this.inboxSync.addCurrentDocToLibrary(); }
    private readonly onMenuContent = (e: any): void => { this.inboxSync.onMenuContent(e); };
    private readonly onMenuInbox = (e: any): void => { this.inboxSync.onMenuInbox(e); };
    private readonly onPluginUrl = (event: { detail?: { url?: string } }): void => {
        const raw = event?.detail?.url; if (!raw || typeof raw !== "string") return;
        const parsed = new URL(raw); const action = parsed.searchParams.get("action");
        if (action === "capture") { void this.addCurrentDocToLibrary(); } else if (action) this.inboxSync.onPluginUrl(event);
    };
    private readonly onSyncEnd = (): void => { if (this.loaded) this.notifyDataChanged(); };
    enrichCurrentDoc(): Promise<void> { return this.inboxSync.enrichCurrentDoc(); }
    openOnboarding(): void { if (this.onboardingTimer !== null) { clearTimeout(this.onboardingTimer); this.onboardingTimer = null; } this.openOnboardingSingleton(undefined); }
    openWorkbenchPopup(initialPreviewId?: string): void { this.openWorkbenchPopupSingleton(initialPreviewId); }
    openMigrate(): void { (this.openMigrateSingleton ??= createDialogSingleton((_args, onClose) => svelteDialog({ title: t(this.i18n, "migrate.title"), closeLabel: t(this.i18n, "action.close"), component: MigrateDialog, props: { facade: this }, width: "720px", height: "560px", callback: onClose })))(undefined); }
    openImport(): void { (this.openImportSingleton ??= createDialogSingleton((_args, onClose) => svelteDialog({ title: t(this.i18n, "import.title"), closeLabel: t(this.i18n, "action.close"), component: ImportDialog, props: { facade: this }, width: "720px", height: "560px", callback: onClose })))(undefined); }
    openSetting(): void { this.openSettings(); } openSettings(): void { (this.openSettingsSingleton ??= createDialogSingleton((_args, onClose) => svelteDialog({ title: t(this.i18n, "settings.title"), closeLabel: t(this.i18n, "action.close"), component: SettingsView, props: { facade: this }, width: "920px", height: "720px", callback: onClose })))(undefined); }
    private registerAgentTools(): void {
        const schema = { type: "object", properties: {}, required: [] as string[] };
        this.addAgentCapability({
            name: "list_unread", description: "列出小驴拾遗读库中未读完的文章", inputSchema: schema,
            handler: async () => {
                const index = await (await import("./services/clip-store.ts")).reconcileIndex(this, this.settings);
                const unread = Object.values(index.clips).filter((c) => c.status === "inbox" || c.status === "later" || c.status === "reading");
                return { structuredContent: { count: unread.length, items: unread.slice(0, 50) }, result: `读库中有 ${unread.length} 篇未读文章` };
            },
        });
        this.addAgentCapability({
            name: "archive_stale", description: "把小驴拾遗读库中超过保留期未读的文章归档", inputSchema: schema,
            handler: async () => {
                const { reconcileIndex, batchSetStatusDetailed } = await import("./services/clip-store.ts");
                const index = await reconcileIndex(this, this.settings);
                const cutoff = Date.now() - this.settings.staleDays * 86_400_000;
                const stale = Object.values(index.clips).filter((c) => (c.status === "inbox" || c.status === "later") && /^\d{14}$/.test(c.time) && new Date(Number(c.time.slice(0, 4)), Number(c.time.slice(4, 6)) - 1, Number(c.time.slice(6, 8))).getTime() < cutoff);
                const result = await batchSetStatusDetailed(this, stale.map((c) => c.id), "archived");
                if (result.ok > 0) this.notifyDataChanged();
                return { structuredContent: { attempted: stale.length, archived: result.ok, failed: stale.length - result.ok, succeeded: result.succeeded }, result: `已归档 ${result.ok} 篇超龄文章` };
            },
        });
        this.addAgentCapability({
            name: "weekly_digest", description: "生成小驴拾遗读库本周摘要", inputSchema: schema,
            handler: async () => {
                const { reconcileIndex } = await import("./services/clip-store.ts");
                const index = await reconcileIndex(this, this.settings);
                const now = new Date();
                const review = (await import("./services/stats-service.ts")).buildReadingReview(index, { period: "week", now, reference: now });
                const completedArticles = review.completedItems.map((item) => ({ id: item.id, title: item.title || "无标题", site: item.site, doneTime: item.doneTime }));
                return { structuredContent: { stats: review.stats, period: review.stats.period, completedArticles }, result: `本周读完文章：\n${completedArticles.length} 篇` };
            },
        });
    }
}
