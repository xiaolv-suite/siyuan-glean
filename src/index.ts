/**
 * 小驴拾遗插件入口（薄壳）：生命周期、UI 挂载、收录入口三件套。
 * 业务编排在 services/，内核交互在 api/，纯函数在 domain/，组件只依赖 types.ts 门面。
 */
import { Plugin, getFrontend, openTab, openMobileFileById, getAllEditor, type subMenu, type TProtyleAction } from "siyuan";
import { mount, unmount } from "svelte";
import "./index.scss";

import DockPanel from "./ui/DockPanel.svelte";
import ReaderTab from "./ui/ReaderTab.svelte";
import { installReadingContext } from "./ui/reading-context-controller";
import MigrateDialog from "./ui/MigrateDialog.svelte";
import ArchiveDialog from "./ui/ArchiveDialog.svelte";
import RestoreDialog from "./ui/RestoreDialog.svelte";
import ImportDialog from "./ui/ImportDialog.svelte";
import OnboardingDialog from "./ui/OnboardingDialog.svelte";
import { loadUiPrefs, saveUiPrefs, type UiPrefs } from "./services/prefs";
import { applyThemePaletteToDom } from "./libs/theme-palette-controller";
import SettingsView from "./ui/SettingsView.svelte";
import { svelteDialog } from "./libs/dialog";
import { createDialogSingleton } from "./libs/dialog-singleton";
import { t, type I18nBundle } from "./libs/i18n";
import { captureDocument, batchSetStatusDetailed, readClip, readClipContext } from "./services/clip-store";
import { autoEnrich, enrichClip } from "./services/enrich-service";
import { excerptFromSelection, insertQuoteExcerpt } from "./services/excerpt-service";
import { pickNextUnread } from "./services/resurface-service";
import { recordReadingDone } from "./services/checkin-bridge";
import { sourceUrlForCarrier } from "./domain/carrier";
import { ensurePresetActions } from "./services/ai-actions";
import { makeQuoteCardPreview } from "./ui/flashcard-dialog";
import { migrateShorthand } from "./services/inbox-service";
import { getShorthand } from "./api/inbox";
import { isKernelRequestError, kernelErrorKind } from "./api/client";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, mergeSettingsDraft, normalizeSettings, type GleanSettings } from "./services/settings";
import type { GleanIndex } from "./services/index-store";
import { installBridge } from "./services/bridge";
import pluginManifest from "../plugin.json";
import type { GleanFacade } from "./types";
import { addRecentReading, pickContinueReadingDocId, type RecentReadingEntry } from "./domain/recent-reading";
import { docUnderHostKind } from "./services/lifecycle-service";
import { registerRaikiriModuleSafely } from "./libs/ecosystem-bridge-kit";
import { showMessage, lvNotify, lvTicker, lvActivity, lvBackup, lvLaunchpad, lvOmnisearch, notifyClipSuccess, notifyClipProgress, showNotice } from "./libs/notice";

const DOCK_TYPE = "glean-dock";
const TAB_TYPE = "glean-library";
const READER_TAB_TYPE = "glean-reader";

export default class LvGleanPlugin extends Plugin implements GleanFacade {
    /** 基类构造器已注入 i18n；declare 只收窄类型，不生成会覆盖基类赋值的运行时字段 */
    declare i18n: I18nBundle;

    isMobile = false;
    settings: GleanSettings = DEFAULT_SETTINGS;

    /** 首启引导延迟弹出的句柄，onunload 时取消 */
    private onboardingTimer: number | null = null;
    /** 首启引导可从多个空态/设置入口打开；所有入口共用一个弹窗实例。 */
    private readonly openOnboardingSingleton = createDialogSingleton<undefined, ReturnType<typeof svelteDialog>>(
        (_args, onClose) => svelteDialog({
            title: t(this.i18n, "onboarding.title"),
            closeLabel: t(this.i18n, "action.close"),
            component: OnboardingDialog,
            props: { facade: this },
            width: "680px",
            height: "560px",
            callback: onClose,
        }),
    );
    private disposeReadingContext: (() => void) | null = null;
    private disposeBridge: (() => void) | null = null;
    private cardsReviewedHandler?: () => void;
    private loaded = false;
    private lastReadingDocId = "";
    private recentReadings: RecentReadingEntry[] = [];
    private inboxMigrating = false;
    private readonly capturingDocIds = new Set<string>();
    private readonly statusBusyDocIds = new Set<string>();
    private readonly pendingLibraryDocIds = new Map<string, string>();
    private readonly destroyedLibraryTabIds = new Set<string>();
    private libraryOpenRequest = 0;
    private readonly pendingReaderDocIds = new Map<string, string>();
    private readonly destroyedReaderTabIds = new Set<string>();
    private readerOpenRequest = 0;
    private topBarElement?: HTMLElement;
    private noticeHubCleaner?: () => void;
    private backupCleaner?: () => void;
    private launchpadCleaner?: () => void;
    private searchCleaner?: () => void;
    private mobileEntryCleaner?: () => void;
    private disposeSyncQueue?: () => void;
    private unreadCount = 0;
    private tickerUnsubscribe?: () => void;
    private unregisterRaikiri?: () => void;
    private readonly openWorkbenchPopupSingleton = createDialogSingleton(
        (initialPreviewId: string | undefined, onClose: () => void) => svelteDialog({
            title: t(this.i18n, "workbench.popupTitle"),
            closeLabel: t(this.i18n, "action.close"),
            component: DockPanel,
            props: { facade: this, initialPreviewId },
            width: "1020px",
            height: "680px",
            containerClass: "glean-tab-root",
            callback: onClose,
        }),
    );
    private readonly openMobileWorkbenchSingleton = createDialogSingleton(
        (initialView: string | undefined, onClose: () => void) => svelteDialog({
            title: t(this.i18n, "pluginName"),
            closeLabel: t(this.i18n, "action.close"),
            component: DockPanel,
            props: { facade: this, initialView },
            width: "100vw",
            height: "100dvh",
            containerClass: "glean-mobile-fullscreen-dialog",
            callback: onClose,
        }),
    );

    constructor(options: { app: unknown; name: string; displayName: string; i18n: I18nBundle }) {
        super(options as never);
    }

    get pluginInstance(): this {
        return this;
    }

    async onload() {
        this.loaded = true;
        const frontend = getFrontend();
        this.isMobile = frontend === "mobile" || frontend === "browser-mobile";

        this.addIcons(`<symbol id="iconGleanWheat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 7v14" fill="none"/>
  <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" fill="none"/>
</symbol>
<symbol id="icon-lv-glean" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 7v14" fill="none"/>
  <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" fill="none"/>
</symbol>
<symbol id="iconGleanGear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>
</symbol>
<symbol id="iconGleanPopup" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
</symbol>
<symbol id="iconGleanRefresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
</symbol>
<symbol id="iconGleanArchive" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>
</symbol>
<symbol id="iconGleanInbox" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
</symbol>
<symbol id="iconGleanNews" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>
</symbol>
<symbol id="iconGleanCamera" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
</symbol>
<symbol id="iconGleanSpark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>
</symbol>
<symbol id="iconGleanPin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
</symbol>
<symbol id="iconGleanEdit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>
</symbol>
<symbol id="iconGleanLocal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>
</symbol>
<symbol id="iconGleanClose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
</symbol>
<symbol id="iconGleanExternal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
</symbol>
<symbol id="iconGleanPlus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M5 12h14"/><path d="M12 5v14"/>
</symbol>
<symbol id="iconGleanCard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M9 15h12"/>
</symbol>
<symbol id="iconGleanSearch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>
</symbol>
<symbol id="iconGleanArrowUp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="m18 15-6-6-6 6"/>
</symbol>
<symbol id="iconGleanArrowDown" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="m6 9 6 6 6-6"/>
</symbol>
<symbol id="iconGleanArrowRight" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="m9 18 6-6-6-6"/>
</symbol>
<symbol id="iconGleanArrowLeft" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="m15 18-6-6 6-6"/>
</symbol>
<symbol id="iconGleanCheck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 6 9 17l-5-5"/>
</symbol>
<symbol id="iconGleanAccordion" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 6h18M3 12h18M3 18h18"/>
</symbol>
<symbol id="iconGleanCollapseAll" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="m7 15 5-5 5 5M7 9l5-5 5 5"/>
</symbol>
<symbol id="iconGleanExpandAll" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="m7 9 5 5 5-5M7 15l5 5 5-5"/>
</symbol>
<symbol id="iconGleanCopy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M16 4h2a2 2 0 0 1 2 2v4"/><path d="M21 14H11"/><path d="m15 10-4 4 4 4"/>
</symbol>
<symbol id="iconGleanDownload" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>
</symbol>
<symbol id="iconGleanHeart" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>
</symbol>
<symbol id="iconGleanHeartOutline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>
</symbol>
<symbol id="iconGleanBookmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>
</symbol>
<symbol id="iconGleanFlame" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2c-.6 2.2-2.2 3.8-3.8 5.4-1.4 1.4-2.5 3.3-2.5 5.4 0 3.5 2.9 5.7 6.3 5.7s6.3-2.2 6.3-5.7c0-2.9-1.6-5.1-3.8-6.7-.6-.6-1.3-1.6-1.6-2.5-.3 1.3-1.3 2.2-2.2 2.5-.6-2.2.3-4.1 1.3-5.1z"/>
</symbol>
<symbol id="iconGleanPlay" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
  <path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
</symbol>
<symbol id="iconGleanPause" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>
</symbol>
<symbol id="iconGleanStop" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <rect width="16" height="16" x="4" y="4" rx="2" />
</symbol>
<symbol id="iconGleanBolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />
</symbol>
<symbol id="iconGleanStar" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>
</symbol>
<symbol id="iconGleanStarOutline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>
</symbol>
<symbol id="iconGleanClock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
</symbol>
<symbol id="iconGleanShield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
</symbol>
<symbol id="iconGleanShieldCheck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>
</symbol>
<symbol id="iconGleanUser" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17.925 20.056a6 6 0 0 0-11.851.001"/><circle cx="12" cy="11" r="4"/><circle cx="12" cy="12" r="10"/>
</symbol>
<symbol id="iconGleanTag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>
</symbol>
<symbol id="iconGleanComment" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
</symbol>
<symbol id="iconGleanTrash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
</symbol>
<symbol id="iconGleanSidebar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>
</symbol>`);

        // 设置只在此处加载一次；面板/弹窗都读这个缓存
        this.settings = await loadSettings(this);
        if (!this.loaded) return;

        const plugin = this;
        this.addDock({
            config: {
                position: "RightBottom",
                size: { width: 320, height: 0 },
                icon: "iconGleanWheat",
                title: t(this.i18n, "dock.title"),
                // 不设默认热键：⌥⌘G 已注册给"打开工作台"命令，同一和弦挂两套机制会同时触发
            },
            type: DOCK_TYPE,
            data: {},
            // Custom.element 是 Element；挂载实例挂到 this 上，destroy 时卸载
            init(this: { element: Element; __gleanInstance?: unknown }) {
                const container = document.createElement("div");
                container.className = "glean-dock-root fn__flex-1";
                this.element.appendChild(container);
                this.__gleanInstance = mount(DockPanel, { target: container, props: { facade: plugin } });
            },
            destroy(this: any) {
                if (this.__gleanInstance) {
                    unmount(this.__gleanInstance as ReturnType<typeof mount>);
                    this.__gleanInstance = null;
                }
            },
        });

        const isMac = typeof navigator !== "undefined" && Boolean(navigator.platform?.toUpperCase().includes("MAC") || navigator.userAgent?.toUpperCase().includes("MAC"));
        const defaultHotkey = isMac ? "⌥⌘G" : "Ctrl+Alt+G";
        this.addCommand({
            langKey: "cmd.openPanel",
            hotkey: defaultHotkey,
            hotkeys: [defaultHotkey],
            callback: () => this.openPanel(),
        });

        this.addCommand({
            langKey: "cmd.continueReading",
            callback: () => {
                const cur = this.currentDocId();
                const targetId = pickContinueReadingDocId(this.recentReadings, cur, this.lastReadingDocId);
                if (targetId) {
                    this.openReadingDocument(targetId);
                    return;
                }
                // 会话历史为空时，尝试从当前索引查找第一篇 reading 状态的文章进行接续
                void (async () => {
                    try {
                        const { loadIndex } = await import("./services/index-store");
                        const index = await loadIndex(this);
                        const readingDoc = Object.values(index.clips).find((c) => c.status === "reading" && !c.internal);
                        if (readingDoc?.id) {
                            this.openReadingDocument(readingDoc.id);
                            return;
                        }
                    } catch {}
                    showMessage(t(this.i18n, "reading.noRecent"), 3000);
                })();
            },
        });

        this.addCommand({
            langKey: "cmd.addToList",
            callback: () => void this.addCurrentDocToLibrary(),
        });

        this.addCommand({
            langKey: "cmd.openMigrate",
            callback: () => this.openMigrate(),
        });

        this.addCommand({
            langKey: "cmd.makeCard",
            callback: () => void this.makeCardFromSelection(),
        });

        // T-1724：命令面板阅读动作（低风险单篇动作；快捷键在思源 设置→快捷键 自定义）
        this.addCommand({ langKey: "cmd.markDone", callback: () => void this.markCurrentStatus("done") });
        this.addCommand({ langKey: "cmd.readNext", callback: () => void this.readNextArticle() });
        this.addCommand({ langKey: "cmd.markLater", callback: () => void this.markCurrentStatus("later") });
        this.addCommand({ langKey: "cmd.archiveCurrent", callback: () => { const id = this.requireCurrentDoc(); if (id) this.openArchiveDialog(id); } });
        this.addCommand({ langKey: "cmd.openSource", callback: () => void this.openCurrentSource() });
        this.addCommand({ langKey: "cmd.excerptQuote", callback: () => void this.excerptQuoteFromSelection() });
        this.addCommand({ langKey: "cmd.readerHelp", callback: () => this.showReaderHelp() });
        this.addCommand({ langKey: "cmd.roamingPick", callback: () => void this.triggerRoamingPick() });

        // 右键菜单"加入读库"（收录入口三件套之一）
        this.eventBus.on("open-menu-content", this.onMenuContent);

        // M5：收集箱右键"迁入读库"
        this.eventBus.on("open-menu-inbox", this.onMenuInbox);

        // 官方自定义协议 siyuan://plugins/siyuan-glean 与云同步完成事件
        this.eventBus.on("open-siyuan-url-plugin", this.onPluginUrl);
        this.eventBus.on("sync-end", this.onSyncEnd);

        // M3：预置 AI 动作（总结/要点/反方观点），幂等静默
        if (this.settings.ai.presetActions) {
            void ensurePresetActions().catch(() => undefined);
        }

        // M3：智能体工具（思源 AI 可发现的读库能力）
        this.registerAgentTools();

        // tab 形态（移动端 / dock 缺席时的回退）：注册 model，openTab 用 custom.id 唤起
        this.addTab({
            type: TAB_TYPE,
            init(this: { element: Element; tab: { id: string }; __gleanTabInstance?: unknown }) {
                plugin.destroyedLibraryTabIds.delete(this.tab.id);
                const container = document.createElement("div");
                container.className = "glean-tab-root fn__flex-1";
                this.element.appendChild(container);
                this.__gleanTabInstance = mount(DockPanel, { target: container, props: { facade: plugin, tabId: this.tab.id } });
            },
            destroy(this: any) {
                plugin.pendingLibraryDocIds.delete(this.tab.id);
                plugin.destroyedLibraryTabIds.add(this.tab.id);
                if (this.__gleanTabInstance) {
                    unmount(this.__gleanTabInstance as ReturnType<typeof mount>);
                    this.__gleanTabInstance = null;
                }
            },
        });

        // 阅读页签（D-0029）：内嵌真实 Protyle + 伴生栏；resize 时让实例自适应。
        this.addTab({
            type: READER_TAB_TYPE,
            init(this: { element: Element; tab: { id: string }; __gleanReaderInstance?: unknown }) {
                plugin.destroyedReaderTabIds.delete(this.tab.id);
                const container = document.createElement("div");
                container.className = "glean-reader-root fn__flex-1";
                this.element.appendChild(container);
                this.__gleanReaderInstance = mount(ReaderTab, { target: container, props: { facade: plugin, tabId: this.tab.id } });
            },
            destroy(this: any) {
                plugin.pendingReaderDocIds.delete(this.tab.id);
                plugin.destroyedReaderTabIds.add(this.tab.id);
                if (this.__gleanReaderInstance) {
                    unmount(this.__gleanReaderInstance as ReturnType<typeof mount>);
                    this.__gleanReaderInstance = null;
                }
            },
            resize() {
                document.dispatchEvent(new CustomEvent("glean:reader-resize"));
            },
        });

        // 阅读上下文挂在原生编辑器容器，事件回调按编辑器根块切换和销毁清理。
        this.disposeReadingContext = installReadingContext(this);
        this.disposeBridge = installBridge(this, pluginManifest.version);

        // 联邦生态：向小驴雷切工作台安全注册待读流小组件
        this.unregisterRaikiri = registerRaikiriModuleSafely({
            moduleId: "glean-later-list",
            title: "小驴拾遗 · 待读列表",
            icon: "iconGleanWheat",
            category: "reading",
            supportedDevices: ["desktop", "sidebar", "mobile"],
            sizes: ["medium", "tall", "wide"],
            description: "展示小驴拾遗待读文章与重浮队列",
            source: { pluginId: "siyuan-glean", name: "小驴拾遗" },
            read: async () => {
                const { loadIndex } = await import("./services/index-store");
                const index = await loadIndex(this);
                const laterClips = Object.values(index.clips)
                    .filter((c) => c.status === "later" || c.status === "inbox")
                    .slice(0, 5);
                return {
                    title: "小驴拾遗 · 待读流",
                    items: laterClips.map((c) => ({
                        label: c.title || "未命名文章",
                        value: c.site || "",
                        command: `siyuan://plugins/siyuan-glean?action=open&id=${c.id}`,
                    })),
                };
            },
            open: () => this.openPanel(),
        });

        this.cardsReviewedHandler = () => {
            this.notifyDataChanged();
        };
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("lv-cards:reviewed", this.cardsReviewedHandler);
            window.addEventListener("lv-exam:stats", this.cardsReviewedHandler);
        }

        // Epoch 7 去中心化通知自协商接入与交棒生命周期
        this.noticeHubCleaner = typeof lvNotify?.registerPlugin === "function"
            ? lvNotify.registerPlugin("siyuan-glean")
            : undefined;

        // Epoch 7 Phase 4 Protocol v1.3.0: 注册全生态灾备切面
        this.backupCleaner = typeof lvBackup?.register === "function"
            ? lvBackup.register(
                "siyuan-glean",
                async () => this.dumpData(),
                async (data) => this.restoreData(data)
            )
            : undefined;

        // Epoch 7 Phase 5 Protocol v1.4.0: 注册小驴罗盘（顶栏收敛与极速二级行动直达）
        this.registerLaunchpad();
        void this.refreshUnreadCount();

        // Epoch 7 Phase 7 Protocol v1.6.0: 注册全局万物穿透搜索提供者（覆盖手机高频剪藏与待读实体）
        this.searchCleaner = typeof lvOmnisearch?.registerProvider === "function"
            ? lvOmnisearch.registerProvider("siyuan-glean", async (keyword) => {
                const hits = await this.searchClips(keyword);
                return hits.slice(0, 8).map(c => ({
                    id: c.id,
                    source: "拾遗",
                    category: c.category || "clip",
                    title: c.title,
                    snippet: c.summary,
                    linkBlockId: c.docId,
                    onClick: () => {
                        if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
                        this.openClipDoc(c.docId);
                    },
                }));
            })
            : undefined;
    }

    onLayoutReady() {
        void (async () => {
            const prefs = await loadUiPrefs(this);
            if (!this.loaded) return;
            applyThemePaletteToDom(null, prefs.themePalette);
            if (!this.isMobile) {
                const onboardingInProgress = prefs.onboardingInterrupted || prefs.onboardingStep !== 1;
                if (prefs.onboardingDone || (this.settings.anchorNotebooks.length > 0 && !onboardingInProgress)) return;
                this.onboardingTimer = window.setTimeout(() => this.openOnboarding(), 800);
            }
        })();

        // BL-43: 每日自动本地轮转备份（7 份快照）
        void import("./services/backup-service").then(({ runDailyAutoBackup }) => {
            void runDailyAutoBackup(this, this.settings);
        }).catch(() => undefined);

        // Epoch 7 Phase 2: 接入全生态统一主时钟跨日监听，零点自动刷新今日池与每日备份
        if (typeof lvTicker?.onDateCross === "function") {
            this.tickerUnsubscribe = lvTicker.onDateCross("siyuan-glean", (_todayKey) => {
                if (!this.loaded) return;
                this.notifyDataChanged();
                void import("./services/backup-service").then(({ runDailyAutoBackup }) => {
                    void runDailyAutoBackup(this, this.settings);
                }).catch(() => undefined);
            });
        }

        // Epoch 7 Phase 5 / Protocol v1.7.5: 统一全端入口挂载（小驴罗盘顶栏+悬浮球双入口收敛）
        if (typeof lvLaunchpad?.ensureUnifiedEntry === "function") {
            this.mobileEntryCleaner = lvLaunchpad.ensureUnifiedEntry(this);
            lvLaunchpad.registerHostApi?.({ openTab, openMobileFileById, app: this.app });
        } else if (typeof lvLaunchpad?.ensureMobileEntry === "function") {
            this.mobileEntryCleaner = lvLaunchpad.ensureMobileEntry();
        }

        // 弱网容错：安装离线剪藏待同步队列监听
        void import("./services/clip-sync-queue").then(({ installClipSyncQueue }) => {
            if (this.loaded) {
                this.disposeSyncQueue = installClipSyncQueue(this);
            }
        }).catch(() => undefined);

        if (this.isMobile) return;
        if (this.topBarElement) return;
        this.topBarElement = this.addTopBar({
            icon: "iconGleanWheat",
            title: t(this.i18n, "pluginName"),
            position: "right",
            callback: () => this.openPanel(),
            // 官方 contextMenu 通道（BL-27）：右键快捷菜单并入思源原生顶栏条目菜单，
            // 不再自建 contextmenu 监听拦截原生菜单（3.8.x 的固定/隐藏条目管理得以保留）
            contextMenu: (menu) => this.appendTopBarContextMenuItems(menu),
        });
        this.registerLaunchpad();
    }

    /**
     * 官方前端插件生命周期契约（覆盖基类空实现，防止数据同步或多窗口写入时整插件被暴力卸载重载）：
     * 收到多端云同步（sync）或外部窗口覆写（overwrite）时，平滑重新拉取配置与索引并通知 UI 响应式就地刷新。
     */
    async onDataChanged(reason?: "sync" | "overwrite"): Promise<void> {
        if (!this.loaded || reason === "overwrite") return;
        try {
            this.settings = await loadSettings(this);
            this.notifyDataChanged();
        } catch (error) {
            console.warn("[glean] onDataChanged 刷新失败:", error);
        }
    }

    async onunload() {
        this.disposeSyncQueue?.();
        this.disposeSyncQueue = undefined;
        this.mobileEntryCleaner?.();
        this.mobileEntryCleaner = undefined;
        this.searchCleaner?.();
        this.searchCleaner = undefined;
        this.launchpadCleaner?.();
        this.launchpadCleaner = undefined;
        this.backupCleaner?.();
        this.backupCleaner = undefined;
        this.tickerUnsubscribe?.();
        this.tickerUnsubscribe = undefined;
        this.noticeHubCleaner?.();
        this.noticeHubCleaner = undefined;
        this.loaded = false;
        this.readerOpenRequest += 1;
        this.libraryOpenRequest += 1;
        this.pendingLibraryDocIds.clear();
        this.destroyedLibraryTabIds.clear();
        this.pendingReaderDocIds.clear();
        this.destroyedReaderTabIds.clear();
        this.capturingDocIds?.clear();
        this.statusBusyDocIds?.clear();
        this.inboxMigrating = false;
        if (this.onboardingTimer !== null) {
            clearTimeout(this.onboardingTimer);
            this.onboardingTimer = null;
        }
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function" && this.cardsReviewedHandler) {
            window.removeEventListener("lv-cards:reviewed", this.cardsReviewedHandler);
            window.removeEventListener("lv-exam:stats", this.cardsReviewedHandler);
            this.cardsReviewedHandler = undefined;
        }
        this.disposeBridge?.();
        this.disposeBridge = null;
        this.unregisterRaikiri?.();
        this.unregisterRaikiri = undefined;
        this.eventBus.off("open-menu-content", this.onMenuContent);
        this.eventBus.off("open-menu-inbox", this.onMenuInbox);
        this.eventBus.off("open-siyuan-url-plugin", this.onPluginUrl);
        this.eventBus.off("sync-end", this.onSyncEnd);
        this.disposeReadingContext?.();
        this.disposeReadingContext = null;
        this.topBarElement = undefined;
        // dock/tab 的 Svelte 实例由 addDock/addTab 的 destroy 回调负责卸载
    }

    /* ---------- GleanFacade ---------- */

    async updateSettings(patch: Partial<GleanSettings>, options: { expected?: GleanSettings } = {}): Promise<void> {
        this.settings = await saveSettings(this, { ...this.settings, ...patch }, options);
        this.notifyDataChanged();
    }

    /**
     * 全生态联合灾备切面（lvBackup 导出）
     * 导出剪藏规则、分类标签、界面偏好与剪藏索引数据的全量切面
     */
    async dumpData(): Promise<Record<string, unknown>> {
        const settings = await loadSettings(this);
        const uiPrefs = await loadUiPrefs(this);
        const { loadIndex } = await import("./services/index-store");
        const index = await loadIndex(this);

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

    /**
     * 全生态联合灾备切面（lvBackup 导入恢复）
     * 将全生态灾备包中的拾遗数据平滑恢复并通知界面即时刷新
     */
    async restoreData(data: Record<string, unknown>): Promise<boolean> {
        if (!data || typeof data !== "object") return false;
        try {
            // 1. 恢复插件设置（剪藏规则、笔记本锚点、重浮策略等）
            if (data.settings && typeof data.settings === "object") {
                const currentSettings = await loadSettings(this);
                const mergedSettings = mergeSettingsDraft(currentSettings, normalizeSettings(data.settings));
                await saveSettings(this, mergedSettings);
                this.settings = mergedSettings;
            }

            // 2. 恢复分类标签与界面偏好
            if (data.uiPrefs && typeof data.uiPrefs === "object") {
                await saveUiPrefs(this, data.uiPrefs as Partial<UiPrefs>);
            } else if (Array.isArray(data.tagAliases) || Array.isArray(data.savedViews)) {
                await saveUiPrefs(this, {
                    tagAliases: Array.isArray(data.tagAliases) ? (data.tagAliases as any) : undefined,
                    savedViews: Array.isArray(data.savedViews) ? (data.savedViews as any) : undefined,
                });
            }

            // 3. 恢复剪藏与候选索引缓存
            if (data.index && typeof data.index === "object") {
                const rawIndex = data.index as Partial<GleanIndex>;
                const { saveIndex, loadIndex } = await import("./services/index-store");
                const currentIndex = await loadIndex(this);
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
                await saveIndex(this, restoredIndex, { repair: true });
            }

            this.notifyDataChanged();
            return true;
        } catch (err) {
            console.error("[glean] 全生态灾备恢复失败:", err);
            return false;
        }
    }

    notifyDataChanged(): void {
        // 在 document 上派发（事件只向上冒泡，不能从父容器传到子面板）
        document.dispatchEvent(new CustomEvent("glean:data-changed"));
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            const detail = {
                v: 1,
                source: "siyuan-glean",
                type: "data-changed",
                eventId: `glean_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                at: new Date().toISOString(),
            };
            window.dispatchEvent(new CustomEvent("lv-glean:data-changed", { detail }));
        }
        void this.refreshUnreadCount();
    }

    /** 打开未读文章收件箱（工作台读库） */
    openInbox(): void {
        this.openPanel("library");
    }

    /** 获取当前未读文章总数（收件箱+稍后读+阅读中） */
    getUnreadCount(): number {
        return this.unreadCount;
    }

    private async refreshUnreadCount(): Promise<void> {
        try {
            const { loadIndex } = await import("./services/index-store");
            const index = await loadIndex(this);
            const unread = Object.values(index.clips)
                .filter((c) => (c.status === "inbox" || c.status === "later" || c.status === "reading") && !c.internal);
            const count = unread.length;
            if (count !== this.unreadCount) {
                this.unreadCount = count;
                this.registerLaunchpad();
            }
        } catch {
            // 静默降级
        }
    }

    /** 向小驴罗盘注册极速直达入口与二级行动 */
    private registerLaunchpad(): void {
        if (typeof lvLaunchpad?.register !== "function") return;
        const unread = this.getUnreadCount();
        this.launchpadCleaner = lvLaunchpad.register({
            id: "siyuan-glean",
            name: "拾遗",
            fullName: "小驴拾遗",
            svgIcon: "icon-lv-glean",
            color: "#a855f7",
            desc: "文章剪藏 · 智能分拣",
            digit: 4,
            badge: unread > 0 ? `${unread} 篇未读` : undefined,
            badgeType: "primary",
            /* 罗盘每次打开实时拉取未读数，读完自动隐藏徽章 */
            badgeProvider: () => {
                const n = this.getUnreadCount();
                return n > 0 ? `${n} 篇未读` : undefined;
            },
            actions: ["今日阅读池", "继续上次阅读", "稍后读收件箱", "剪藏剪贴板内容"],
            topBarElement: this.topBarElement,
            onClick: () => this.openInbox(),
            onAction: (action) => void this.handleQuickAction(action),
        });
    }

    /** 处理小驴罗盘二级快捷行动直达（支持手机直办） */
    async handleQuickAction(action: string): Promise<void> {
        if (action === "今日阅读池" || action === "打开今日阅读池") {
            if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
            this.openPanel("resurface");
            return;
        }

        if (action === "继续上次阅读") {
            const cur = this.currentDocId();
            const targetId = pickContinueReadingDocId(this.recentReadings, cur, this.lastReadingDocId);
            if (targetId) {
                if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
                this.openReadingDocument(targetId);
                return;
            }
            void (async () => {
                try {
                    const { loadIndex } = await import("./services/index-store");
                    const index = await loadIndex(this);
                    const readingDoc = Object.values(index.clips).find((c) => c.status === "reading" && !c.internal);
                    if (readingDoc?.id) {
                        if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
                        this.openReadingDocument(readingDoc.id);
                        return;
                    }
                } catch {}
                showMessage(t(this.i18n, "reading.noRecent"), 3000);
            })();
            return;
        }

        if (action === "稍后读收件箱" || action === "打开未读文章收件箱 (Inbox)") {
            if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
            this.openInbox();
            return;
        }

        if (action === "剪藏剪贴板内容" || action === "剪藏当前系统剪贴板内容") {
            let text = "";
            if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
                try {
                    text = (await navigator.clipboard.readText())?.trim() ?? "";
                } catch {
                    // 权限受限或剪贴板不可读
                }
            }

            if (!text) {
                const docId = this.currentDocId();
                if (docId) {
                    await this.addCurrentDocToLibrary();
                    if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
                } else {
                    showNotice("剪贴板内容为空，请先复制需要剪藏的链接或文本", 3500, "warn");
                }
                return;
            }

            const isUrl = /^https?:\/\//i.test(text);
            const openNbs = await (await import("./api/client")).listNotebooks();
            const hubNb = openNbs.find(
                (n) =>
                    n.name.includes("小驴空间") ||
                    n.name.includes("小驴笔记本") ||
                    n.name.includes("小驴生态统一测试空间"),
            );
            const targetNotebook = this.settings.anchorNotebooks[0] || hubNb?.id || openNbs[0]?.id;
            if (!targetNotebook) {
                showNotice("未配置读库笔记本锚点，请在设置中选择读库笔记本", 4000, "warn");
                return;
            }

            const { createDocWithMd } = await import("./api/client");
            const { captureDocument } = await import("./services/clip-store");
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
            const title = isUrl ? `剪藏 ${dateStr}` : (text.slice(0, 30).replace(/[/\\:<>|?*"~\p{Cc}\p{Cf}\r\n]+/gu, " ").trim() || `剪藏 ${dateStr}`);
            const md = isUrl ? `[来源链接](${text})\n\n> 剪藏自系统剪贴板` : `${text}\n\n> 剪藏自系统剪贴板`;
            const rootPrefix = this.settings.rootPath
                ? this.settings.rootPath.trim().replace(/\/+$/, "")
                : targetNotebook === hubNb?.id
                  ? "/04-小驴拾遗"
                  : "";

            try {
                const docId = await createDocWithMd(targetNotebook, `${rootPrefix}/剪藏/${title}`, md);
                if (docId) {
                    await captureDocument(this, docId, { src: "manual", url: isUrl ? text : undefined });
                    if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
                    notifyClipSuccess({
                        docId,
                        title,
                        openAction: () => this.openReadingDocument(docId),
                    });
                    lvActivity.record({
                        source: "拾遗",
                        category: "clip",
                        title: `剪藏剪贴板内容：《${title}》`,
                        linkBlockId: docId,
                    });
                    this.notifyDataChanged();
                }
            } catch (err) {
                console.warn("[glean] 剪贴板剪藏失败，进入离线待同步队列:", err);
                const { enqueuePendingClip } = await import("./services/clip-sync-queue");
                enqueuePendingClip({
                    notebookId: targetNotebook,
                    title,
                    md,
                    url: isUrl ? text : undefined,
                    isUrl,
                });
            }
            return;
        }

        if (action === "一键批量生成AI结构化摘要") {
            try {
                const { loadIndex } = await import("./services/index-store");
                const index = await loadIndex(this);
                const candidates = Object.values(index.clips)
                    .filter((c) => !c.summary && !c.internal && (c.status === "inbox" || c.status === "later" || c.status === "reading"))
                    .slice(0, 5);

                if (candidates.length === 0) {
                    showNotice("未读文章均已生成结构化摘要", 3000, "info");
                    return;
                }

                showNotice(`正在为 ${candidates.length} 篇未读文章生成 AI 结构化摘要...`, 3000, "info");
                const { enrichClip } = await import("./services/enrich-service");
                for (const clip of candidates) {
                    void enrichClip(this, clip.id, this.settings).then(() => {
                        this.notifyDataChanged();
                    });
                }
            } catch (err) {
                console.warn("[glean] 批量生成摘要失败:", err);
                showNotice("批量生成摘要失败", 3000, "error");
            }
            return;
        }

        if (action === "抓取当前网页全文并存入思源") {
            let url = "";
            const cur = this.currentDocId();
            if (cur) {
                try {
                    const { readClip } = await import("./services/clip-store");
                    const clip = await readClip(cur);
                    if (clip?.url) url = clip.url;
                } catch {}
            }

            if (!url && typeof navigator !== "undefined" && navigator.clipboard?.readText) {
                try {
                    const text = (await navigator.clipboard.readText())?.trim() ?? "";
                    if (/^https?:\/\//i.test(text)) url = text;
                } catch {}
            }

            if (!url) {
                showNotice("未检测到有效网页链接（请先复制网页 URL 或打开带来源链接的文章）", 4000, "warn");
                return;
            }

            showNotice(`正在抓取网页全文并收录至思源: ${url.slice(0, 36)}...`, 3000, "info");
            const { listNotebooks, createDocWithMd } = await import("./api/client");
            const { resolveDefaultAnchorNotebook, resolveGleanRootPrefix } = await import("./services/settings");
            const notebooks = await listNotebooks().catch(() => []);
            const targetNotebook = resolveDefaultAnchorNotebook(notebooks, this.settings.anchorNotebooks);
            if (!targetNotebook) {
                showNotice("未配置读库笔记本锚点，请在设置中选择读库笔记本", 4000, "warn");
                return;
            }

            const { captureDocument } = await import("./services/clip-store");
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
            const title = `网页收录 ${dateStr}`;
            const md = `[来源网页](${url})\n\n> 正在等待后台网页正文抓取与快照归档...\n\n- 目标链接: ${url}`;

            try {
                const rootPrefix = resolveGleanRootPrefix(this.settings, notebooks, targetNotebook);
                const docId = await createDocWithMd(targetNotebook, `${rootPrefix}/剪藏/${title}`, md);
                if (docId) {
                    await captureDocument(this, docId, { src: "manual", url });
                    notifyClipSuccess({
                        docId,
                        title,
                        openAction: () => this.openReadingDocument(docId),
                    });
                    lvActivity.record({
                        source: "拾遗",
                        category: "clip",
                        title: `网页收录入库：《${title}》`,
                        linkBlockId: docId,
                        detail: url,
                    });
                    this.notifyDataChanged();
                }
            } catch (err) {
                console.warn("[glean] 网页全文收录失败:", err);
                showNotice("网页全文收录失败", 3000, "error");
            }
            return;
        }
    }

    /** 检索剪藏文章标题、摘要与标签（用于小驴罗盘穿透搜索等） */
    async searchClips(keyword: string): Promise<Array<{ id: string; docId: string; title: string; summary?: string; category?: string }>> {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return [];
        try {
            const { loadIndex } = await import("./services/index-store");
            const index = await loadIndex(this);
            const clips = Object.values(index.clips).filter((c) => !c.internal);
            const matched = clips.filter((c) => {
                const titleMatch = (c.title || "").toLowerCase().includes(kw);
                const summaryMatch = (c.summary || "").toLowerCase().includes(kw);
                const tagMatch = (c.tags || []).some((t) => t.toLowerCase().includes(kw));
                const aiTagMatch = (c.aiTags || []).some((t) => t.toLowerCase().includes(kw));
                const authorMatch = (c.author || "").toLowerCase().includes(kw);
                const siteMatch = (c.site || "").toLowerCase().includes(kw);
                return titleMatch || summaryMatch || tagMatch || aiTagMatch || authorMatch || siteMatch;
            });
            matched.sort((a, b) => {
                const aTitle = (a.title || "").toLowerCase();
                const bTitle = (b.title || "").toLowerCase();
                const aExact = aTitle === kw ? 2 : aTitle.includes(kw) ? 1 : 0;
                const bExact = bTitle === kw ? 2 : bTitle.includes(kw) ? 1 : 0;
                return bExact - aExact;
            });
            return matched.map((c) => ({
                id: c.id,
                docId: c.id,
                category: c.status === "later" ? "later" : c.status === "done" ? "done" : "clip",
                title: c.title || "未命名文章",
                summary: c.summary || (c.site ? `来源: ${c.site}` : undefined),
            }));
        } catch {
            return [];
        }
    }

    /** 打开剪藏文档进行阅读 */
    openClipDoc(docId: string): void {
        this.openReadingDocument(docId);
    }

    currentDocId(): string {
        // 多编辑器/分屏时取"用户正在看"的那份：选区锚定 → 焦点锚定 → 布局序兜底
        const editors = getAllEditor().filter((item): item is NonNullable<typeof item> & { protyle: { block: { rootID: string }; element: Element } } =>
            Boolean(item?.protyle?.block?.rootID && item?.protyle?.element));
        if (editors.length <= 1) return editors[0]?.protyle?.block?.rootID ?? "";
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            const anchored = editors.find((item) => item.protyle.element?.contains(selection.anchorNode));
            if (anchored) return anchored.protyle.block.rootID;
        }
        const active = document.activeElement;
        if (active instanceof Element) {
            const focused = editors.find((item) => item.protyle.element?.contains(active));
            if (focused) return focused.protyle.block.rootID;
        }
        return editors[0].protyle.block.rootID;
    }

    openReadingDocument(docId: string, focusBlockId?: string): void {
        if (!docId) return;
        this.lastReadingDocId = docId;
        this.recordRecentReading(docId);
        // D-0029：设置开启且桌面端时，开始阅读进内嵌阅读页签；默认沿用原生页签。
        if (!this.isMobile && this.settings.reader.openInTab) {
            void this.openReaderTab(docId, focusBlockId);
            return;
        }
        void this.openNativeReadingDocument(docId, focusBlockId);
    }

    /** 显式打开内嵌阅读页签（不写五态；移动端回退原生查看器）。 */
    openReader(docId: string): void {
        if (!docId) return;
        this.lastReadingDocId = docId;
        this.recordRecentReading(docId);
        if (this.isMobile) {
            void this.openNativeReadingDocument(docId);
            return;
        }
        void this.openReaderTab(docId);
    }

    closeMobileWorkbench(): void {
        this.openMobileWorkbenchSingleton.close();
    }

    private async openNativeReadingDocument(docId: string, focusBlockId?: string): Promise<void> {
        const request = ++this.readerOpenRequest;
        if (this.isMobile) {
            // SDK 返回 void，只能捕获调用异常，不能把调用返回视作正文已打开。
            try {
                openMobileFileById(this.app, focusBlockId || docId, focusBlockId ? (["cb-get-focus", "cb-get-hl"] as TProtyleAction[]) : undefined);
            } catch {
                if (this.loaded && request === this.readerOpenRequest) showMessage(t(this.i18n, "msg.actionFailed"), 3500);
                return;
            }
            try {
                lvLaunchpad.haptic(10);
            } catch {
                /* soft */
            }
            // 移动端：打开文章后自动关闭全屏拾遗工作台，让底层已就绪的正文清晰呈现在用户眼前。
            // 收尾动作独立防护：工作台关闭失败绝不能反咬为"打开失败"。
            try {
                this.closeMobileWorkbench();
            } catch {
                /* soft */
            }
            return;
        }
        try {
            await openTab({ app: this.app, doc: { id: focusBlockId || docId }, keepCursor: false });
            try { this.openWorkbenchPopupSingleton.close(); } catch { /* soft */ }
        } catch {
            if (this.loaded && request === this.readerOpenRequest) showMessage(t(this.i18n, "msg.actionFailed"), 3500);
        }
    }

    private async openReaderTab(docId: string, focusBlockId?: string): Promise<void> {
        const request = ++this.readerOpenRequest;
        try {
            const tab = await openTab({
                app: this.app,
                custom: {
                    id: `${this.name}${READER_TAB_TYPE}`,
                    icon: "iconGleanWheat",
                    title: t(this.i18n, "reader.title"),
                },
                keepCursor: false,
            });
            try { this.openWorkbenchPopupSingleton.close(); } catch { /* soft */ }
            if (!this.loaded || request !== this.readerOpenRequest || this.destroyedReaderTabIds.has(tab.id)) return;
            // openTab 的公开返回值给出确切目标；隐藏页签和其他分屏不能抢走此次打开请求。
            this.pendingReaderDocIds.set(tab.id, docId);
            document.dispatchEvent(new CustomEvent("glean:focus-reader", { detail: { tabId: tab.id, focusBlockId } }));
        } catch {
            // 自定义页签是实验能力；宿主拒绝创建时仍交付同一篇文章的原生页签。
            // 只允许当前请求回退，避免较早请求在用户已打开另一篇后抢占导航。
            if (!this.loaded || request !== this.readerOpenRequest) return;
            try {
                await openTab({ app: this.app, doc: { id: focusBlockId || docId }, keepCursor: false });
                try { this.openWorkbenchPopupSingleton.close(); } catch { /* soft */ }
            } catch {
                if (this.loaded && request === this.readerOpenRequest) showMessage(t(this.i18n, "msg.actionFailed"), 3500);
            }
        }
    }

    consumeReaderFocus(tabId: string): string {
        const id = this.pendingReaderDocIds.get(tabId) ?? "";
        this.pendingReaderDocIds.delete(tabId);
        return id;
    }

    recentReadingDocuments(): readonly RecentReadingEntry[] {
        return this.recentReadings.map((entry) => ({ ...entry }));
    }

    recordRecentReading(docId: string, title = ""): void {
        if (!docId) return;
        const cleanId = docId.trim();
        if (!cleanId) return;
        const cleanTitle = title.trim();
        const prev = this.recentReadings[0];
        this.recentReadings = addRecentReading(this.recentReadings, { id: cleanId, title: cleanTitle });
        if (!prev || prev.id !== cleanId || (cleanTitle && prev.title !== cleanTitle)) {
            document.dispatchEvent(new CustomEvent("glean:recent-reading-changed", { detail: { docId: cleanId } }));
        }
    }

    async openLibraryArticle(docId: string): Promise<void> {
        if (!docId) return;
        if (this.isMobile) {
            this.openPanel();
            return;
        }
        const request = ++this.libraryOpenRequest;
        const tabId = await this.openLibraryTab(request);
        if (!tabId || !this.loaded || request !== this.libraryOpenRequest || this.destroyedLibraryTabIds.has(tabId)) return;
        this.pendingLibraryDocIds.set(tabId, docId);
        document.dispatchEvent(new CustomEvent("glean:focus-clip", { detail: { tabId } }));
    }

    consumeLibraryFocus(tabId: string): string {
        const id = this.pendingLibraryDocIds.get(tabId) ?? "";
        this.pendingLibraryDocIds.delete(tabId);
        return id;
    }

    /* ---------- 面板 ---------- */

    /**
     * 入口分工（UI-STANDARD §3 三档画布）：
     * - 顶栏图标/命令 = 工作台 tab（桌面画布：rail+表格/看板，全宽完整功能）
     * - Dock 侧栏图标 = 窄侧栏速览（toggleModel 切换）
     */
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
        });
    }

    /** 打开/聚焦 Dock 窄侧栏（保留给轻量速览场景）。 */
    toggleDockSidebar(): void {
        const dockId = `${this.name}${DOCK_TYPE}`;
        const dockHost = (window as unknown as { siyuan?: { layout?: Record<string, { toggleModel?: (type: string, show?: boolean) => void }> } }).siyuan?.layout;
        for (const dock of [dockHost?.rightDock, dockHost?.bottomDock, dockHost?.leftDock]) {
            if (dock && typeof dock.toggleModel === "function") {
                try {
                    dock.toggleModel(dockId);
                    return;
                } catch { /* 换下一个容器 */ }
            }
        }
        // 兜底：HTMLElement.click() 产生的点击会冒泡，可被委托监听器捕获
        const dockItem = document.querySelector(`.dock__item[data-type="${dockId}"]`);
        if (dockItem) {
            (dockItem as HTMLElement).click();
            return;
        }
        this.openLibraryTab();
    }

    private async openLibraryTab(request = ++this.libraryOpenRequest): Promise<string | null> {
        this.pendingLibraryDocIds.clear();
        if (!this.loaded) return null;
        try {
            const tab = await openTab({
                app: this.app,
                custom: {
                    id: `${this.name}${TAB_TYPE}`,
                    icon: "iconGleanWheat",
                    title: t(this.i18n, "workbench.title"),
                },
                keepCursor: false,
            });
            return this.loaded && request === this.libraryOpenRequest && !this.destroyedLibraryTabIds.has(tab.id) ? tab.id : null;
        } catch (error) {
            console.debug("[glean] 工作台页签打开失败:", error);
            if (this.loaded && request === this.libraryOpenRequest) showMessage(t(this.i18n, "msg.actionFailed"), 3500);
            return null;
        }
    }

    /* ---------- T-1724 命令面板阅读动作 ---------- */

    private requireCurrentDoc(): string {
        const id = this.currentDocId();
        if (!id) showMessage(t(this.i18n, "msg.noSelection"), 3000);
        return id;
    }

    /** 当前文档显式改状态（读完/稍后/归档）；done 走同一打卡桥钩子。 */
    async markCurrentStatus(status: "done" | "later" | "archived"): Promise<void> {
        const id = this.requireCurrentDoc();
        if (!id || this.statusBusyDocIds.has(id)) return;
        this.statusBusyDocIds.add(id);
        try {
            const result = await batchSetStatusDetailed(this, [id], status);
            if (result.ok !== 1) {
                showMessage(t(this.i18n, "msg.statusFailed"), 3000);
                return;
            }
            if (status === "done" && this.settings.integration.checkinEnabled && this.settings.integration.checkinItemId) {
                const context = await readClipContext(id);
                void recordReadingDone(this.settings.integration.checkinItemId, id, context?.title ?? "");
            }
            this.notifyDataChanged();
            showMessage(t(this.i18n, result.indexSyncFailed.length ? "msg.statusIndexPending" : "msg.statusChanged"), 3500);
        } catch (error) {
            console.warn("[glean] 状态命令失败:", error);
            showMessage(t(this.i18n, "msg.statusFailed"), 3000);
        } finally {
            this.statusBusyDocIds.delete(id);
        }
    }

    /** 打开当前文档原文（载体与 URL 校验后导航，不写状态）。 */
    async openCurrentSource(): Promise<void> {
        const id = this.requireCurrentDoc();
        if (!id) return;
        try {
            const attrs = await readClip(id);
            const url = sourceUrlForCarrier(attrs.contentType, attrs.url);
            if (!url) {
                showMessage(t(this.i18n, "clip.sourceMissing"), 3000);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
        } catch (error) {
            console.warn("[glean] 打开原文失败:", error);
            showMessage(t(this.i18n, "reader.actionFailed"), 3000);
        }
    }

    /** 选区摘录为引述块（原生编辑器；定位失败降级为复制文本，不伪造锚点）。 */
    async excerptQuoteFromSelection(): Promise<void> {
        const selection = window.getSelection();
        const editor = getAllEditor().find((item) => item?.protyle?.element?.contains(selection?.anchorNode ?? null));
        const picked = excerptFromSelection(editor?.protyle?.element ?? null, selection ?? null);
        if (!picked) {
            showMessage(t(this.i18n, "flashcard.noSelection"), 3000);
            return;
        }
        if (!picked.blockId) {
            showMessage(t(this.i18n, "reader.excerptNoBlock"), 3000);
            await navigator.clipboard.writeText(picked.text).catch(() => undefined);
            return;
        }
        try {
            await insertQuoteExcerpt(picked.blockId, picked.text);
            this.notifyDataChanged();
            showMessage(t(this.i18n, "reader.excerptDone"), 2500);
        } catch (error) {
            console.warn("[glean] 摘录引述块失败:", error);
            showMessage(t(this.i18n, "reader.actionFailed"), 3000);
        }
    }

    /** 打开下一篇待读（显式导航；不写状态）。 */
    async readNextArticle(): Promise<void> {
        try {
            const next = await pickNextUnread(this, "");
            if (!next) {
                showMessage(t(this.i18n, "reader.noNext"), 3000);
                return;
            }
            this.openReadingDocument(next);
        } catch (error) {
            console.warn("[glean] 打开下一篇失败:", error);
            showMessage(t(this.i18n, "reader.actionFailed"), 3000);
        }
    }

    /** 归档后处理入口：策略细节由 ArchiveDialog 负责，入口保持与阅读上下文解耦。 */
    private openDialogDocIds = new Set<string>();

    openArchiveDialog(docId: string): void {
        if (!docId || this.openDialogDocIds.has(docId)) return;
        this.openDialogDocIds.add(docId);
        svelteDialog({
            title: t(this.i18n, "archive.title"),
            closeLabel: t(this.i18n, "action.close"),
            component: ArchiveDialog,
            props: { facade: this, docId },
            width: "min(440px, 94vw)",
            height: "auto",
            callback: () => { this.openDialogDocIds.delete(docId); },
        });
    }

    /**
     * 恢复入口：不在生命周期宿主中的文章沿用直接恢复语义；在宿主中的文章
     * 打开策略对话框，让用户明确选择是否移出宿主。
     */
    openRestoreDialog(docId: string): void {
        // 先登记异步检查中的文档，避免双击在 docUnderHostKind 返回前打开两个策略弹窗。
        if (!docId || this.openDialogDocIds.has(docId)) return;
        this.openDialogDocIds.add(docId);
        void (async () => {
            let dialogOpened = false;
            try {
                const kind = await docUnderHostKind(docId);
                if (!kind) {
                    const result = await batchSetStatusDetailed(this, [docId], "later");
                    if (result.ok !== 1) throw new Error("Restore status write failed");
                    this.notifyDataChanged();
                    showMessage(t(this.i18n, result.indexSyncFailed.length ? "msg.statusIndexPending" : "msg.statusChanged"), 3500);
                    return;
                }
                svelteDialog({
                    title: t(this.i18n, "restore.title"),
                    closeLabel: t(this.i18n, "action.close"),
                    component: RestoreDialog,
                    props: { facade: this, docId },
                    width: "min(440px, 94vw)",
                    height: "auto",
                    callback: () => { this.openDialogDocIds.delete(docId); },
                });
                dialogOpened = true;
            } catch (error) {
                console.warn("[glean] 恢复入口检查失败:", error);
                showMessage(t(this.i18n, "msg.statusFailed"), 3000);
            } finally {
                if (!dialogOpened) this.openDialogDocIds.delete(docId);
            }
        })();
    }

    /** `?` 帮助：阅读动作清单与自定义快捷键入口提示（T-1724）。 */
    showReaderHelp(): void {
        const actions: Array<[string, string]> = [
            ["cmd.continueReading", "cmd.markDone"],
            ["cmd.readNext", "cmd.markLater"],
            ["cmd.openSource", "cmd.archiveCurrent"],
            ["cmd.excerptQuote", "cmd.makeCard"],
        ];
        const wrap = document.createElement("div");
        wrap.className = "glean-reader-help";
        const hint = document.createElement("p");
        hint.className = "glean-reader-help__hint";
        hint.textContent = t(this.i18n, "help.hint");
        wrap.append(hint);
        const list = document.createElement("div");
        list.className = "glean-reader-help__list";
        list.setAttribute("role", "list");
        for (const [left, right] of actions) {
            const row = document.createElement("div");
            row.className = "glean-reader-help__row";
            row.setAttribute("role", "listitem");
            const primary = document.createElement("span");
            primary.className = "glean-reader-help__action";
            primary.textContent = t(this.i18n, left);
            const secondary = document.createElement("span");
            secondary.className = "glean-reader-help__action";
            secondary.textContent = t(this.i18n, right);
            row.append(primary, secondary);
            list.append(row);
        }
        wrap.append(list);
        void import("./libs/dialog").then(({ simpleDialog }) => {
            simpleDialog({ title: t(this.i18n, "help.title"), closeLabel: t(this.i18n, "action.close"), ele: wrap, width: "520px" });
        });
    }

    /** 摘录制卡：选中文本 → 编辑预览 → 明确确认后入「拾遗卡片」牌组 */
    async makeCardFromSelection(): Promise<void> {
        const selection = this.cardSelection();
        if (!selection) {
            showMessage(t(this.i18n, "flashcard.noSelection"), 3000);
            return;
        }
        const { docId, blockId, quote } = selection;
        let docTitle = "";
        try {
            const { querySql } = await import("./api/client");
            const rows = await querySql<{ content: string }>("SELECT content FROM blocks WHERE id = '" + docId.replace(/'/g, "''") + "' LIMIT 1");
            docTitle = rows[0]?.content ?? "";
        } catch { /* 标题取不到就用无来源卡面 */ }
        try {
            makeQuoteCardPreview(this, { title: docTitle, quote, docId, blockId });
        } catch (error) {
            console.warn("[glean] 分享卡生成失败:", error);
            showMessage(t(this.i18n, "msg.actionFailed"), 3000);
        }
    }

    /** 全局漫游盲盒：随机抽选一篇文章重温 */
    async triggerRoamingPick(): Promise<void> {
        try {
            const { loadIndex } = await import("./services/index-store");
            const { pickRoamingArticle } = await import("./domain/roaming");
            const { openRoamingDialog } = await import("./ui/roaming-dialog");
            const index = await loadIndex(this);
            const candidates = Object.values(index.clips);
            const pick = pickRoamingArticle(candidates);
            if (pick) {
                openRoamingDialog(this, pick, (id, readPoint) => {
                    this.openReadingDocument(id, readPoint);
                });
            } else {
                showMessage(t(this.i18n, "roaming.emptyPool"), 2500);
            }
        } catch (error) {
            console.warn("[glean] 漫游抽选失败:", error);
            showMessage(t(this.i18n, "msg.actionFailed"), 2500);
        }
    }

    /** 顶栏右键快捷菜单条目（BL-27）：由官方 addTopBar contextMenu 通道注入思源原生菜单 */
    private appendTopBarContextMenuItems(menu: subMenu): void {
        if (!menu || typeof menu.addItem !== "function") return;
        menu.addItem({
            iconHTML: "",
            label: t(this.i18n, "topbarMenu.resurface"),
            click: () => this.openPanel("resurface"),
        });
        menu.addItem({
            iconHTML: "",
            label: t(this.i18n, "topbarMenu.library"),
            click: () => this.openPanel("library"),
        });
        menu.addItem({
            iconHTML: "",
            label: t(this.i18n, "topbarMenu.highlights"),
            click: () => this.openPanel("highlights"),
        });
        menu.addItem({
            iconHTML: "",
            label: t(this.i18n, "topbarMenu.stats"),
            click: () => this.openPanel("stats"),
        });
        menu.addSeparator();
        menu.addItem({
            iconHTML: "",
            label: t(this.i18n, "topbarMenu.roaming"),
            click: () => void this.triggerRoamingPick(),
        });
        menu.addSeparator();
        menu.addItem({
            iconHTML: "",
            label: t(this.i18n, "topbarMenu.settings"),
            click: () => this.openSettings(),
        });
    }

    private cardSelection(): { quote: string; docId: string; blockId: string } | null {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return null;
        const editor = getAllEditor().find((item) => item?.protyle?.element?.contains(selection.anchorNode));
        const host = editor?.protyle?.element;
        const excerpt = excerptFromSelection(host ?? null, selection);
        const docId = editor?.protyle?.block?.rootID;
        if (!excerpt || !docId) return null;
        return { quote: selection.toString().trim(), docId, blockId: excerpt.blockId };
    }

    /** 收集箱右键"迁入读库"：open-menu-inbox detail.ids → 逐条取详情迁移（T-1500） */
    private migrateFromInbox = async (ids: string[]): Promise<void> => {
        if (this.inboxMigrating) return;
        const notebookId = this.settings.anchorNotebooks[0];
        if (!notebookId) {
            showNotice(t(this.i18n, "panel.noAnchorHint"), 4000, "warn");
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
                    const result = await migrateShorthand(this, shorthand, { notebookId });
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
                    const messageKey = kind === "permission" ? "inbox.permissionRequired"
                        : kind === "network" ? "inbox.networkFailed"
                        : kind === "timeout" ? "inbox.timeout"
                        : "msg.actionFailed";
                    showNotice(t(this.i18n, messageKey), 4500, "error");
                }
            }

            if (ok > 0) {
                if (ok === 1 && lastDocId) {
                    notifyClipSuccess({
                        docId: lastDocId,
                        title: lastTitle,
                        openAction: () => this.openReadingDocument(lastDocId),
                    });
                } else {
                    lvNotify.card({
                        source: "小驴拾遗",
                        category: "inbox-migrate-done",
                        title: "收集箱迁入完成",
                        message: duplicates > 0
                            ? `成功迁入 ${ok} 篇待读文章（已跳过 ${duplicates} 篇重复）`
                            : `成功迁入 ${ok} 篇待读文章`,
                        level: "success",
                        duration: 6000,
                        actions: [
                            {
                                label: "打开读库",
                                primary: true,
                                onClick: () => this.openPanel(),
                                dismissAfterClick: true,
                            },
                        ],
                    });
                }
            } else if (duplicates > 0) {
                showNotice(`${t(this.i18n, "inbox.duplicate")}（${duplicates} 篇）`, 3500, "warn");
            }
            this.notifyDataChanged();
        } finally {
            this.inboxMigrating = false;
        }
    };

    private readonly onSyncEnd = (): void => {
        if (!this.loaded) return;
        this.notifyDataChanged();
    };

    private readonly onPluginUrl = (event: { detail?: { url?: string } }): void => {
        if (!this.loaded) return;
        const raw = event?.detail?.url;
        if (!raw || typeof raw !== "string") return;
        try {
            const parsed = new URL(raw);
            const action = parsed.searchParams.get("action");
            if (action === "workbench" || action === "library" || action === "resurface" || action === "highlights" || action === "stats") {
                this.openPanel(action === "workbench" ? undefined : action);
            } else if (action === "settings") {
                this.openSettings();
            } else if (action === "open") {
                const id = parsed.searchParams.get("id")?.trim();
                if (id && /^[\w-]+$/.test(id)) this.openReadingDocument(id);
            } else if (action === "capture") {
                void this.addCurrentDocToLibrary();
            }
        } catch {
            // 忽略非标准 URL
        }
    };

    private readonly onMenuInbox = (event: { detail: { ids?: string[]; menu: { addItem: (item: unknown) => void } } }): void => {
        if (!event?.detail?.menu) return;
        const ids = event.detail.ids ?? [];
        if (ids.length === 0) return;
        event.detail.menu.addItem({
            id: "glean-inbox-migrate",
            iconHTML: "",
            label: t(this.i18n, "pluginName") + "：" + t(this.i18n, "inbox.menuMigrate", { n: ids.length }),
            click: () => void this.migrateFromInbox(ids),
        });
    };

    /* ---------- 收录 ---------- */

    async addCurrentDocToLibrary(): Promise<void> {
        const docId = this.currentDocId();
        if (!docId) {
            showNotice(t(this.i18n, "msg.noSelection"), 3000, "warn");
            return;
        }
        if (this.capturingDocIds.has(docId)) return;
        this.capturingDocIds.add(docId);
        try {
            const result = await captureDocument(this, docId, { src: "manual" });
            if (result.conflict) {
                const confTitle = result.conflict.title || result.conflict.hpath || "";
                lvNotify.card({
                    source: "小驴拾遗",
                    category: "clip-conflict",
                    title: t(this.i18n, "inbox.duplicate"),
                    message: confTitle ? `已存在相同来源文章：《${confTitle}》` : "读库中已收录过同 URL 的文章",
                    level: "warn",
                    duration: 6000,
                    actions: [
                        {
                            label: "查看已有文档",
                            primary: true,
                            onClick: () => this.openReadingDocument(result.conflict!.id),
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
                    title: `剪藏《${docTitle}》`,
                    linkBlockId: docId,
                });
                notifyClipSuccess({
                    docId,
                    title: docTitle,
                    openAction: () => this.openReadingDocument(docId),
                });
                autoEnrich(this, docId, this.settings, () => this.notifyDataChanged());
            } else {
                showNotice(t(this.i18n, "msg.alreadyIn"), 2500, "info");
            }
            this.notifyDataChanged();
        } catch (error) {
            console.warn("[glean] 手动收录失败:", error);
            showNotice(t(this.i18n, "msg.captureFailed"), 3500, "error");
        } finally {
            this.capturingDocIds.delete(docId);
        }
    }

    private readonly onMenuContent = (event: {
        detail: { protyle?: { block?: { rootID?: string } }; menu: { addItem: (item: unknown) => void } };
    }): void => {
        if (!event?.detail?.menu) return;
        const rootId = event.detail.protyle?.block?.rootID;
        if (!rootId) return;
        const selected = this.cardSelection();
        const selectionText = selected?.docId === rootId ? selected.quote : "";
        if (selectionText) {
            event.detail.menu.addItem({
                id: "glean-make-card",
                iconHTML: "",
                label: t(this.i18n, "flashcard.menuMake", { n: [...selectionText.trim()].length }),
                click: async () => {
                    try {
                        const { querySql } = await import("./api/client");
                        const rows = await querySql<{ content: string }>("SELECT content FROM blocks WHERE id = '" + rootId.replace(/'/g, "''") + "' LIMIT 1");
                        makeQuoteCardPreview(this, { title: rows[0]?.content ?? "", quote: selectionText, docId: rootId, blockId: selected?.blockId });
                    } catch (error) {
                        console.warn("[glean] 分享卡生成失败:", error);
                        showNotice(t(this.i18n, "msg.actionFailed"), 3000, "error");
                    }
                },
            });
        }
        event.detail.menu.addItem({
            id: "glean-add-to-library",
            iconHTML: "",
            label: `${t(this.i18n, "pluginName")}：${t(this.i18n, "action.addToInbox")}`,
            click: async () => {
                try {
                    const result = await captureDocument(this, rootId, { src: "manual" });
                    if (result.conflict) {
                        const confTitle = result.conflict.title || result.conflict.hpath || "";
                        lvNotify.card({
                            source: "小驴拾遗",
                            category: "clip-conflict",
                            title: t(this.i18n, "inbox.duplicate"),
                            message: confTitle ? `已存在相同来源文章：《${confTitle}》` : "读库中已收录过同 URL 的文章",
                            level: "warn",
                            duration: 6000,
                            actions: [
                                {
                                    label: "查看已有文档",
                                    primary: true,
                                    onClick: () => this.openReadingDocument(result.conflict!.id),
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
                            title: `剪藏《${docTitle}》`,
                            linkBlockId: rootId,
                        });
                        notifyClipSuccess({
                            docId: rootId,
                            title: docTitle,
                            openAction: () => this.openReadingDocument(rootId),
                        });
                        autoEnrich(this, rootId, this.settings, () => this.notifyDataChanged());
                    } else {
                        showNotice(t(this.i18n, "msg.alreadyIn"), 2500, "info");
                    }
                    this.notifyDataChanged();
                } catch (error) {
                    console.warn("[glean] 右键收录失败:", error);
                    showNotice(t(this.i18n, "msg.captureFailed"), 3500, "error");
                }
            },
        });
    };

    /** 手动 AI 富化（面板卡 ✨ 与命令共用） */
    async enrichCurrentDoc(): Promise<void> {
        const docId = this.currentDocId();
        if (!docId) {
            showMessage(t(this.i18n, "msg.noSelection"), 3000);
            return;
        }
        showMessage(t(this.i18n, "ai.enriching"), 3000);
        try {
            const outcome = await enrichClip(this, docId, this.settings);
            if (outcome.ok) {
                showMessage(
                    outcome.duplicates.length > 0
                        ? t(this.i18n, "ai.similarFound", { title: outcome.duplicates[0].title })
                        : t(this.i18n, "ai.enrichDone"),
                    3500
                );
            } else if (outcome.skipped === "cap") {
                showMessage(t(this.i18n, "ai.capReached", { n: this.settings.ai.enrichDailyCap }), 4000);
            } else {
                showMessage(t(this.i18n, "ai.enrichFailed"), 3000);
            }
        } catch (error) {
            console.warn("[glean] 手动富化失败:", error);
            showMessage(t(this.i18n, "ai.enrichFailed"), 3000);
        }
        this.notifyDataChanged();
    }

    /* ---------- M3：智能体工具（addAgentCapability，D-0007） ---------- */

    private registerAgentTools(): void {
        const schema = { type: "object", properties: {}, required: [] as string[] };
        this.addAgentCapability({
            name: "list_unread",
            description:
                "列出小驴拾遗读库中未读完的文章（新剪藏/稍后读/阅读中），返回标题、状态、站点与预计阅读分钟。",
            inputSchema: schema,
            handler: async () => {
                const { reconcileIndex } = await import("./services/clip-store");
                const index = await reconcileIndex(this, this.settings);
                const unread = Object.values(index.clips)
                    .filter((clip) => clip.status === "inbox" || clip.status === "later" || clip.status === "reading")
                    .sort((a, b) => ((a.time || "") < (b.time || "") ? 1 : -1));
                const lines = unread
                    .slice(0, 50)
                    .map((clip) => "[" + clip.status + "] " + clip.title + "（" + (clip.site || "未知来源") + "，约 " + (clip.minutes || "?") + " 分钟）");
                return {
                    structuredContent: {
                        count: unread.length,
                        items: unread.slice(0, 50).map((clip) => ({
                            id: clip.id,
                            title: clip.title,
                            status: clip.status,
                            site: clip.site,
                            minutes: clip.minutes,
                            url: clip.url,
                        })),
                    },
                    result: lines.length > 0 ? lines.join("\n") : "读库中没有未读文章",
                };
            },
        });
        this.addAgentCapability({
            name: "archive_stale",
            description:
                "把小驴拾遗读库中超过保留期（默认 " + this.settings.staleDays + " 天）未读的新剪藏/稍后读文章归档。",
            inputSchema: schema,
            handler: async () => {
                const { reconcileIndex, batchSetStatusDetailed } = await import("./services/clip-store");
                const index = await reconcileIndex(this, this.settings);
                const cutoff = Date.now() - this.settings.staleDays * 86_400_000;
                const stale = Object.values(index.clips).filter((clip) => {
                    if (clip.status !== "inbox" && clip.status !== "later") return false;
                    if (!/^\d{14}$/.test(clip.time)) return false;
                    const captured = new Date(
                        Number(clip.time.slice(0, 4)),
                        Number(clip.time.slice(4, 6)) - 1,
                        Number(clip.time.slice(6, 8))
                    ).getTime();
                    return captured < cutoff;
                });
                const result = await batchSetStatusDetailed(this, stale.map((clip) => clip.id), "archived");
                if (result.ok > 0) {
                    this.notifyDataChanged();
                }
                return {
                    structuredContent: { attempted: stale.length, archived: result.ok, failed: stale.length - result.ok, succeeded: result.succeeded },
                    result: "已归档 " + result.ok + " 篇超龄文章" + (result.ok < stale.length ? "，另有 " + (stale.length - result.ok) + " 篇失败" : ""),
                };
            },
        });
        this.addAgentCapability({
            name: "weekly_digest",
            description: "生成小驴拾遗读库本周摘要：总量、完成、未读压力、主题分布和本周读完文章名单。",
            inputSchema: schema,
            handler: async () => {
                const { reconcileIndex } = await import("./services/clip-store");
                const { buildReadingReview } = await import("./services/stats-service");
                const index = await reconcileIndex(this, this.settings);
                const now = new Date();
                const review = buildReadingReview(index, { period: "week", now, reference: now });
                const stats = review.stats;
                const completedArticles = review.completedItems.map((item) => ({
                    id: item.id,
                    title: item.title || "无标题",
                    site: item.site,
                    doneTime: item.doneTime,
                }));
                const lines = [
                    "读库共 " + stats.total + " 篇，已读 " + stats.done + " 篇（" + (stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0) + "%）。",
                    "本周新增收录 " + stats.periodCaptured + " 篇，完成 " + stats.periodCompleted + " 篇。",
                    "未读压力：新剪藏 " + stats.inbox + " 篇、阅读中 " + stats.reading + " 篇。",
                    stats.byTag.length > 0
                        ? "近期主题：" + stats.byTag.slice(0, 5).map((tag) => tag.name + "×" + tag.count).join("、")
                        : "",
                    completedArticles.length > 0
                        ? "本周读完文章：\n" + completedArticles.map((item) => "- " + item.title + (item.site ? "（" + item.site + "）" : "")).join("\n")
                        : "本周读完文章：暂无",
                ];
                return { structuredContent: { stats, period: review.stats.period, completedArticles }, result: lines.filter(Boolean).join("\n") };
            },
        });
    }

    openOnboarding(): void {
        // 手动入口可能在首启自动弹出计时器到期前触发；避免关闭手动弹窗后计时器再次打开一份。
        if (this.onboardingTimer !== null) {
            clearTimeout(this.onboardingTimer);
            this.onboardingTimer = null;
        }
        this.openOnboardingSingleton(undefined);
    }

    /** 工作台弹出为独立浮窗（全宽画布第三形态） */
    openWorkbenchPopup(initialPreviewId?: string): void {
        this.openWorkbenchPopupSingleton(initialPreviewId);
    }

    /* ---------- 弹窗 ---------- */

    private openMigrateSingleton?: (args: undefined) => ReturnType<typeof svelteDialog>;
    private openImportSingleton?: (args: undefined) => ReturnType<typeof svelteDialog>;
    private openSettingsSingleton?: (args: undefined) => ReturnType<typeof svelteDialog>;

    openMigrate(): void {
        (this.openMigrateSingleton ??= createDialogSingleton((_args, onClose) => svelteDialog({
            title: t(this.i18n, "migrate.title"),
            closeLabel: t(this.i18n, "action.close"),
            component: MigrateDialog,
            props: { facade: this },
            width: "720px",
            height: "560px",
            callback: onClose,
        })))(undefined);
    }

    openImport(): void {
        (this.openImportSingleton ??= createDialogSingleton((_args, onClose) => svelteDialog({
            title: t(this.i18n, "import.title"),
            closeLabel: t(this.i18n, "action.close"),
            component: ImportDialog,
            props: { facade: this },
            width: "720px",
            height: "560px",
            callback: onClose,
        })))(undefined);
    }

    /** 思源"设置→插件"齿轮调用的是基类 openSetting（单数）；转发到本插件的设置浮窗。 */
    openSetting(): void {
        this.openSettings();
    }

    openSettings(): void {
        (this.openSettingsSingleton ??= createDialogSingleton((_args, onClose) => svelteDialog({
            title: t(this.i18n, "settings.title"),
            closeLabel: t(this.i18n, "action.close"),
            component: SettingsView,
            props: { facade: this },
            // 现代化大设置面板：提供充足横向展示宽度，避免选项拥挤与提示截断
            width: "920px",
            height: "720px",
            callback: onClose,
        })))(undefined);
    }
}
