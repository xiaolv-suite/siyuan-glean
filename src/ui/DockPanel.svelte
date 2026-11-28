<script lang="ts">
/** 读库 Dock 面板 v2（T-1104/T-1201/T-1202/T-1300/T-1400c）：库 / 统计 / 高亮 三视图；tab 画布 rail+行表/看板。 */
import { onMount, tick, untrack } from "svelte";
import { openTab, Menu } from "siyuan";
import { showMessage, withLvAiWait } from "../libs/notice";
import { showDocTreeNativeMenu } from "../libs/lv-notice-kit";
// DL2 阶段3：空态吉祥物（mascot 偏好门控，关闭回退麦穗线性图标）
import { lvMascot } from "../libs/ui/mascots";
import { resolveEffectiveMotion } from "../libs/lv-ui-prefs";
import type { GleanFacade } from "../types";
import { t } from "../libs/i18n";
import { aiFailureKey } from "../libs/ai-feedback";
import { displaySiteName, type ClipStatus } from "../domain/schema";
import { normalizeUrl } from "../domain/url";
import { batchSetStatusDetailed, captureDocument, captureUrlToTriage, findClipUrlConflict, listUnregisteredDocs, reconcileIndex, writeClip, type StatusWriteResult } from "../services/clip-store";
import { autoEnrich, enrichClip } from "../services/enrich-service";
import { snapshotClip } from "../services/snapshot-service";
import { exportArticleMarkdown, exportSelectedClipsCsv } from "../services/library-export-service";
import { filterAndSortLibrary, libraryFacets, matchLibraryReason, type LibraryItem, type LibraryMatchTarget, type LibrarySortDirection, type LibrarySortKey, type ReadingTimeTier } from "../domain/library-view.ts";
import { loadIndex, type ClipIndexEntry, type CandidateEntry, type GleanIndex } from "../services/index-store";
import StatsView from "./StatsView.svelte";
import HighlightView from "./HighlightView.svelte";
import LibraryRailGroup from "./LibraryRailGroup.svelte";
import WorkbenchPreview from "./WorkbenchPreview.svelte";
import { applyRailGroupToggle, syncAccordionRailGroups, toggleAllRailGroups, normalizeRailGroups, DEFAULT_RAIL_WIDTH, MIN_RAIL_WIDTH, MAX_RAIL_WIDTH, clampRailWidth, type RailGroupKey, type RailGroupPrefs, type RailGroups } from "../domain/library-rail";
import { createRailBadgeDebouncer, reconcileRailFacets } from "../domain/library-rail-badges.ts";
import LibraryBatchBar from "./LibraryBatchBar.svelte";
import { librarySelectionScope, addDisplayedSelection, retainFilteredSelection } from "../domain/library-selection";
import { moveLibraryCursor, resolveLibraryShortcut, moveKanbanCursor2D, moveKanbanCursorVertical, cyclePriorityValue, cycleRatingValue, type LibraryKeyboardAction, type LibraryKeyboardContext } from "../domain/library-keyboard";
import LibraryFilters from "./LibraryFilters.svelte";
import ActionPopover from "./ActionPopover.svelte";
import AuthorEditor from "./AuthorEditor.svelte";
import AiBatchPanel from "./AiBatchPanel.svelte";
import { libraryFilterChips, removeLibraryFilter, type FilterChipKey } from "../domain/library-filter-chips.ts";
import { nextPreviewId, normalizePreviewRatio } from "../domain/workbench-preview.ts";
import InboxSection from "./InboxSection.svelte";
import ResurfaceView from "./ResurfaceView.svelte";
import { archiveStaleCandidates, setSurfacePinned } from "../services/resurface-service";
import { computeDailyFromIndex } from "../services/resurface-service";
import { deleteSavedViewPref, deleteTagAliasPref, loadUiPrefs, saveLastViewPref, saveUiPrefs, setDefaultSavedViewPref, TagAliasConflictError, upsertSavedViewPref, upsertTagAliasPref } from "../services/prefs";
import { ageDays, todayStamp } from "../domain/resurface.ts";
import { recordReadingDone } from "../services/checkin-bridge";
import { hasSourceAction, openTargetForCarrier, resolveCarrier, sourceUrlForCarrier } from "../domain/carrier";
import { isWechatUrl, displayWechatAuthor } from "../domain/wechat";
import { calculateSnapshotHealth } from "../domain/snapshot-health";
import { pickRoamingArticle } from "../domain/roaming";
import { openRoamingDialog } from "./roaming-dialog";
import { makeQuoteCardPreview } from "./flashcard-dialog";
import { formatAPA, formatBibTeX, formatGBT7714, formatMLA, type CitationFormat, type CitationItem } from "../domain/citation";
import { batchRecognizeWechatAuthors, scanAndFillWechatAuthor, purifyWechatArticle } from "../services/wechat-service";
import { lvNotify, lvActivity, notifyClipSuccess, notifyBatchProgress, showNotice } from "../libs/notice";
import ClipStatusActions from "./ClipStatusActions.svelte";
import { installMobileViewportVars } from "../libs/mobile-viewport";
import { installEscapeHandler, installModalFocus } from "../libs/modal-focus";
import { createRefreshQueue } from "../libs/refresh-queue";
import { kernelErrorKind, querySql } from "../api/client";
import { applySavedView, createSavedView, deleteSavedView, displayTagAlias, governanceCueMuted, localDateStamp, setDefaultSavedView, normalizeTagAliases, SMART_VIEW_PRESETS, instantiateSmartViewPreset, type GovernanceCueKey, type GovernanceMuted, type SavedView, type TagAlias } from "../domain/ui-prefs";

async function openDocContextMenu(e: MouseEvent, entry: { id?: string; box?: string }): Promise<void> {
    if (!entry?.id) return;
    let box = entry.box;
    if (!box) {
        try {
            const rows = await querySql<{ box: string }>(`SELECT box FROM blocks WHERE id = '${entry.id.replace(/'/g, "''")}' LIMIT 1`);
            if (rows && rows[0]?.box) box = rows[0].box;
        } catch {}
    }
    if (box) {
        e.preventDefault();
        e.stopPropagation();
        await showDocTreeNativeMenu({
            notebookId: box,
            docId: entry.id,
            position: { x: e.clientX, y: e.clientY }
        });
    }
}

interface Props {
    facade: GleanFacade;
    initialPreviewId?: string;
    initialView?: string;
    tabId?: string;
    onClose?: () => void;
}

let { facade, initialPreviewId = "", initialView = "", tabId = "", onClose }: Props = $props();

const i18n = $derived(facade.i18n);
let currentTime = $state(new Date());
let dayRefreshTimer: number | null = null;

function scheduleDayRefresh(): void {
    if (typeof window === "undefined") return;
    if (dayRefreshTimer !== null) window.clearTimeout(dayRefreshTimer);
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 0, 50);
    dayRefreshTimer = window.setTimeout(() => {
        currentTime = new Date();
        scheduleDayRefresh();
    }, Math.max(1, nextDay.getTime() - now.getTime()));
}

function syncDayClock(): void {
    currentTime = new Date();
    scheduleDayRefresh();
}

type PanelView = "resurface" | "library" | "stats" | "highlights";
type NavBucket = "triage" | "list" | "archived";
type ListSubFilter = "active" | "reading" | "later" | "done";

function resolveInitialPanelView(raw?: string): PanelView | null {
    if (raw === "resurface" || raw === "library" || raw === "stats" || raw === "highlights") return raw;
    if (raw === "triage" || raw === "list" || raw === "archived") return "library";
    if (raw === "home") return "resurface";
    return null;
}

const explicitInitialView = untrack(() => resolveInitialPanelView(initialView));
const explicitInitialBucket = untrack<NavBucket>(() => {
    if (initialView === "triage") return "triage";
    if (initialView === "archived") return "archived";
    return "list";
});
let view = $state<PanelView>(explicitInitialView ?? "library");
let navBucket = $state<NavBucket>(explicitInitialBucket);
let listSubFilter = $state<ListSubFilter>("active");
let filterDrawerOpen = $state(false);
let facetRailOpen = $state(false);
let fullPreviewMode = $state(false);
let batchMode = $state(false);
let governanceToolsOpen = $state(false);
let kbdHelpOpen = $state(false);
let captureModalOpen = $state(false);
let captureUrlInput = $state("");
let captureTitleInput = $state("");
let captureUrlBusy = $state(false);
let captureModalEl = $state<HTMLElement | null>(null);
let captureReturnFocus: HTMLElement | null = null;
let disposeCaptureFocus = () => {};
let loading = $state(true);
let quickCaptureBusy = $state(false);
let loadError = $state(false);
let offline = $state(false);
let index = $state<GleanIndex>({ version: 1, updatedAt: "", clips: {}, candidates: {} });
let unregisteredCount = $state(0);
let activeQueue = $state<ClipStatus>(explicitInitialBucket === "triage" ? "inbox" : explicitInitialBucket === "archived" ? "archived" : "later");
let keyword = $state("");
let wechatScanning = $state(false);
let wechatScanProgressText = $state("");
let autoWechatScanTimer: number | null = null;
const WECHAT_ATTEMPTED_STORAGE_KEY = "lv-glean-wechat-attempted-v2";
let wechatAttemptedIds = $state<Set<string>>((() => {
    try {
        const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(WECHAT_ATTEMPTED_STORAGE_KEY) : null;
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === "string"));
        }
    } catch {
        // ignore
    }
    return new Set<string>();
})());

function markWechatAttempted(ids: readonly string[]): void {
    if (!ids.length) return;
    const next = new Set(wechatAttemptedIds);
    let changed = false;
    for (const id of ids) {
        if (id && !next.has(id)) {
            next.add(id);
            changed = true;
        }
    }
    if (!changed) return;
    wechatAttemptedIds = next;
    try {
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(WECHAT_ATTEMPTED_STORAGE_KEY, JSON.stringify([...next].slice(-500)));
        }
    } catch {
        // ignore
    }
}

function triggerSilentWechatScan(): void {
    if (wechatScanning || autoWechatScanTimer !== null || disposed) return;
    autoWechatScanTimer = window.setTimeout(async () => {
        autoWechatScanTimer = null;
        if (wechatScanning || disposed || !rootEl) return;
        const targets = libraryItems.filter((entry) => isWechatEntry(entry) && !displayWechatAuthor(entry.author) && !wechatAttemptedIds.has(entry.id));
        if (targets.length === 0) return;

        // 取前 6 篇进行静默批处理，并附带全量已识别条目供 __biz 归并，同时记录已尝试 ID 杜绝死循环
        const batch = targets.slice(0, 6);
        markWechatAttempted(batch.map((b) => b.id));
        try {
            const knownWithAuthors = libraryItems.filter((entry) => isWechatEntry(entry) && Boolean(displayWechatAuthor(entry.author)));
            const result = await batchRecognizeWechatAuthors(facade.pluginInstance, [...knownWithAuthors, ...batch]);
            if (result.detectedCount > 0 && !disposed && rootEl) {
                console.debug(`[LvGlean] 后台自动识别微信公众号作者：已完成 ${result.detectedCount} 篇`);
                facade.notifyDataChanged();
                await reload();
            }
            if (targets.length > 6 && !disposed && rootEl) {
                triggerSilentWechatScan();
            }
        } catch (error) {
            console.debug("[LvGlean] 后台自动识别微信公众号轻量处理:", error);
        }
    }, 2500);
}

$effect(() => {
    if (index.updatedAt && wechatArticlesWithoutAuthor.length > 0) {
        untrack(triggerSilentWechatScan);
    }
});
let sortBy = $state<LibrarySortKey>("time");
let sortDirection = $state<LibrarySortDirection>("desc");
let selectedSite = $state("");
let selectedAuthor = $state("");
let authorTimeline = $state(false);
let selectedTag = $state("");
/** AI 标签分面（T-1729）：独立于用户 tag，UI 带 ✨ 来源标记。 */
let selectedAiTag = $state("");
/** Dock 窄画布搜索默认折叠为图标（UX 审计 #8）；工作台/浮窗保持常驻。 */
let searchOpen = $state(false);
let searchInput = $state<HTMLInputElement | null>(null);
let searchToggle = $state<HTMLButtonElement | null>(null);
let selectedSource = $state("");
let selectedTimeSource = $state("");
let selectedContentType = $state("");
let selectedReadingTimeTier = $state<ReadingTimeTier>("all");
let selectedFavoriteOnly = $state(false);
let mobileFilterOpen = $state(false);

type MobileFilterDraft = {
    site: string;
    author: string;
    tag: string;
    aiTag: string;
    source: string;
    timeSource: string;
    contentType: string;
    favoriteOnly: boolean;
    sortBy: LibrarySortKey;
    direction: LibrarySortDirection;
};

let mobileFilterDraft = $state<MobileFilterDraft>({
    site: "",
    author: "",
    tag: "",
    aiTag: "",
    source: "",
    timeSource: "",
    contentType: "",
    favoriteOnly: false,
    sortBy: "time",
    direction: "desc",
});
let mobileFilterSheet = $state<HTMLElement | null>(null);
let mobileFilterReturnFocus: HTMLElement | null = null;
let disposeMobileFilterFocus = () => {};
type MobileFilterBackgroundState = {
    nodes: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }>;
    rootOverflow: { value: string; priority: string };
    bodyOverflow: { value: string; priority: string };
};
let mobileFilterBackgroundState: MobileFilterBackgroundState | null = null;
let selection = $state<ReadonlySet<string>>(new Set());
const allSelectedAreFavorite = $derived.by(() => {
    if (selection.size === 0) return false;
    for (const id of selection) {
        if (!index.clips[id]?.favorite) return false;
    }
    return true;
});
/** 读库键盘光标（T-3392）：仅桌面端、仅当前画布可见条目；不写属性与偏好。 */
let keyboardCursorId = $state("");
/** IDs added again while a batch write is in flight remain selected after the result lands. */
let batchAddedDuringRun = new Set<string>();
let batchBusy = $state(false);
let aiBatchOpen = $state(false);
let aiBatchIds = $state<string[]>([]);
let rootEl = $state<HTMLElement | null>(null);
let previewId = $state("");
let previewRevision = $state(0);
let previewEnabled = $state(true);
let previewRatio = $state(normalizePreviewRatio(undefined));
let previewPrefsTouched = false;
let previewSplit = $state<HTMLDivElement | null>(null);
let previewDialog = $state<HTMLDivElement | null>(null);
let previewReturnFocus: HTMLElement | null = null;
onMount(() => {
    const cleanupViewport = installMobileViewportVars(rootEl, facade.isMobile);
    scheduleDayRefresh();
    const onVisibilityChange = () => {
        if (document.visibilityState === "visible") syncDayClock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", syncDayClock);
    const onTagAliasesChanged = () => {
        void loadUiPrefs(facade.pluginInstance).then((prefs) => {
            tagAliases = prefs.tagAliases;
        }).catch(() => undefined);
    };
    void loadUiPrefs(facade.pluginInstance).then((prefs) => {
        tagAliases = prefs.tagAliases;
    }).catch(() => undefined);
    document.addEventListener("glean:tag-aliases-changed", onTagAliasesChanged);
    const cleanup = () => {
        disposed = true;
        focusGeneration += 1;
        disposeTagAliasFocus();
        disposeCaptureFocus();
        if (dayRefreshTimer !== null) window.clearTimeout(dayRefreshTimer);
        dayRefreshTimer = null;
        if (focusFlashTimer !== null) window.clearTimeout(focusFlashTimer);
        focusFlashTimer = null;
        if (autoWechatScanTimer !== null) window.clearTimeout(autoWechatScanTimer);
        autoWechatScanTimer = null;
        focusFlashTarget?.classList.remove("glean-focus-flash");
        focusFlashTarget = null;
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("focus", syncDayClock);
        document.removeEventListener("glean:tag-aliases-changed", onTagAliasesChanged);
        railBadgeDebouncer.cancel();
        cleanupViewport();
    };
    if (initialPreviewId) void focusClipById(initialPreviewId, true);
    if (!facade.isMobile || typeof window === "undefined") return cleanup;
    const syncOnlineState = () => (offline = !navigator.onLine);
    syncOnlineState();
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    return () => {
        enrichAbort?.abort();
        enrichAbort = null;
        restoreMobileFilterBackground();
        disposeMobileFilterFocus();
        cleanup();
        window.removeEventListener("online", syncOnlineState);
        window.removeEventListener("offline", syncOnlineState);
    };
});
let layoutMode = $state<"list" | "kanban">("list");
let isTabCanvas = $state(false);
const previewEntry = $derived<Row | null>(index.clips[previewId]
    ? { kind: "clip", ...index.clips[previewId] }
    : index.candidates[previewId] ? { kind: "candidate", ...index.candidates[previewId] } : null);
let dragOverCol = $state<ClipStatus | null>(null);
let dragId = $state("");
let enrichingId = $state("");
let enrichAbort: AbortController | null = null;
let statusActionId = $state("");
let pendingFocusId = $state("");
let focusRequested = false;
let focusGeneration = $state(0);
let disposed = false;
let focusReturnOrigin: Element | null = null;
let focusFlashTimer: number | null = null;
let focusFlashTarget: HTMLElement | null = null;
let mobileMoreOpen = $state(false);
let mobileMoreTrigger = $state<HTMLButtonElement | null>(null);
let mobileMoreMenu = $state<HTMLDivElement | null>(null);
let savedViews = $state<SavedView[]>([]);
let defaultSavedViewId = $state("");
let savedViewId = $state("");
let railGroups = $state<RailGroups>(normalizeRailGroups(undefined));
let railAccordion = $state(false);
let railCollapsed = $state(false);
let railWidth = $state(DEFAULT_RAIL_WIDTH);
let railDraggingPointer: number | null = null;
let railDragStartX = 0;
let railDragStartWidth = DEFAULT_RAIL_WIDTH;
let tagAliases = $state<TagAlias[]>([]);
let tagAliasManagerOpen = $state(false);
let tagAliasDraftId = $state("");
let tagAliasDraftName = $state("");
let tagAliasDraftTag = $state("");
let tagAliasBusy = $state(false);
let tagAliasDeleteConfirmId = $state("");
let tagAliasDialog = $state<HTMLElement | null>(null);
let tagAliasReturnFocus: HTMLElement | null = null;
let disposeTagAliasFocus = () => {};
let savedViewName = $state("");
let prefsLoading = $state(true);
let prefsError = $state(false);
let prefsLoadFailed = $state(false);
let prefsUserTouched = Boolean(explicitInitialView);
let applyingPrefs = false;
let governanceMuted = $state<GovernanceMuted>({ quota: "", stale: "", candidates: "" });

/** 工作台弹出为独立浮窗（全宽画布，独立于 dock/tab）。 */
function openPopup() {
    facade.openWorkbenchPopup();
}

async function quickCapture(): Promise<void> {
    if (quickCaptureBusy) return;
    quickCaptureBusy = true;
    try {
        await facade.addCurrentDocToLibrary();
    } finally {
        quickCaptureBusy = false;
    }
}

function openCaptureModal(): void {
    captureUrlInput = "";
    captureTitleInput = "";
    captureReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    captureModalOpen = true;
    void tick().then(() => {
        if (!captureModalOpen || !captureModalEl) return;
        disposeCaptureFocus = installModalFocus(captureModalEl, {
            onClose: closeCaptureModal,
            returnFocus: captureReturnFocus,
        });
    });
}

function closeCaptureModal(): void {
    captureModalOpen = false;
    const dispose = disposeCaptureFocus;
    disposeCaptureFocus = () => {};
    dispose();
    captureReturnFocus = null;
}

async function captureCurrentAndClose(): Promise<void> {
    await quickCapture();
    closeCaptureModal();
    await reload();
}

async function submitCaptureUrl(): Promise<void> {
    if (captureUrlBusy) return;
    const url = captureUrlInput.trim();
    if (!normalizeUrl(url)) {
        showNotice(t(i18n, "msg.candidateInvalidUrl"), 3000, "warn");
        return;
    }
    captureUrlBusy = true;
    try {
        const res = await captureUrlToTriage(facade.pluginInstance, facade.settings, url, captureTitleInput.trim());
        if (res.conflict) {
            const confTitle = res.conflict.title || res.conflict.hpath || "";
            showNotice(confTitle ? t(i18n, "inbox.duplicateSameSource", { title: confTitle }) : t(i18n, "inbox.duplicateSameUrl"), 3500, "warn");
            return;
        }
        if (!res.ok) {
            showNotice(t(i18n, res.errorKey || "msg.captureFailed"), 3500, "error");
            return;
        }
        lvActivity.record({
            source: "拾遗",
            category: "clip",
            title: t(i18n, "capture.activityClipTitle", { title: res.title || url }),
            linkBlockId: res.docId,
        });
        notifyClipSuccess({
            docId: res.docId!,
            title: res.title,
            openAction: () => facade.openReadingDocument(res.docId!),
        });
        facade.notifyDataChanged();
        closeCaptureModal();
        openBucket("triage");
        await reload();
    } catch (error) {
        console.warn("[glean] 网页收录失败:", error);
        showNotice(t(i18n, "msg.captureFailed"), 3500, "error");
    } finally {
        captureUrlBusy = false;
    }
}

function openBucket(bucket: NavBucket, sub?: ListSubFilter): void {
    markPrefsInteraction();
    view = "library";
    navBucket = bucket;
    fullPreviewMode = false;
    if (bucket === "triage") {
        activeQueue = "inbox";
    } else if (bucket === "archived") {
        activeQueue = "archived";
    } else {
        const nextSub = sub ?? listSubFilter;
        listSubFilter = nextSub;
        activeQueue = nextSub === "reading" ? "reading" : nextSub === "done" ? "done" : "later";
    }
    railBadgeDebouncer.flush();
    authorTimeline = false;
    selectedAuthor = "";
    selectedSite = "";
    selectedTag = "";
    selectedAiTag = "";
    selectedSource = "";
    selectedTimeSource = "";
    selectedContentType = "";
    selectedReadingTimeTier = "all";
    keyword = "";
}

function selectReadingListSub(sub: ListSubFilter): void {
    markPrefsInteraction();
    listSubFilter = sub;
    activeQueue = sub === "reading" ? "reading" : sub === "done" ? "done" : "later";
    authorTimeline = false;
}

function openStatsAndTools(sub: "stats" | "resurface" = "stats"): void {
    markPrefsInteraction();
    view = sub === "resurface" ? "resurface" : "stats";
}

function closeMobileMore(returnFocus = false) {
    mobileMoreOpen = false;
    if (returnFocus) {
        void tick().then(() => mobileMoreTrigger?.focus());
    }
}

function openMobileMore() {
    mobileMoreOpen = true;
    void tick().then(() => mobileMoreMenu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
}

/** 轻量菜单也遵循菜单键盘模型，避免窄屏用户只能靠触摸逐项寻找入口。 */
function mobileMoreKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const items = mobileMoreMenu ? Array.from(mobileMoreMenu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
    const current = document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
        if (items.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
    } else if (event.key === "Tab") {
        closeMobileMore();
    }
}
let snappingId = $state("");
let exportingMarkdownId = $state("");
let archivingStale = $state(false);
let editingCandidateId = $state("");
let candidateUrlInput = $state("");
let candidateBusyId = $state("");

type QueueKey = ClipStatus;
const queues: QueueKey[] = ["inbox", "later", "reading", "done", "archived"];
const views: { key: PanelView; labelKey: string }[] = [
    { key: "resurface", labelKey: "view.resurface" },
    { key: "library", labelKey: "view.library" },
    { key: "stats", labelKey: "view.stats" },
    { key: "highlights", labelKey: "view.highlights" },
];

type MobileNavKey = "triage" | "list" | "highlights" | "archived";
const mobileNavItems: { key: MobileNavKey; labelKey: string }[] = [
    { key: "triage", labelKey: "nav.triage" },
    { key: "list", labelKey: "nav.readingList" },
    { key: "highlights", labelKey: "nav.highlights" },
    { key: "archived", labelKey: "nav.archived" },
];
const mobileActive = $derived<MobileNavKey | null>(
    view === "highlights" ? "highlights" : view === "library" ? navBucket : null
);
const mobileTitleKey = $derived(
    view === "highlights"
        ? "nav.highlights"
        : view === "stats" || view === "resurface"
          ? "nav.statsAndTools"
          : navBucket === "triage"
            ? "nav.triage"
            : navBucket === "archived"
              ? "nav.archived"
              : "nav.readingList"
);

type MobileTaskState = "loading" | "error" | "offline" | "ready";
const mobileTaskState = $derived<MobileTaskState>(loading ? "loading" : offline ? "offline" : loadError ? "error" : "ready");

function closeMobileHost() {
    mobileMoreOpen = false;
    if (onClose) {
        onClose();
        return;
    }
    const dialogRoot = rootEl?.closest(".b3-dialog__container")?.parentElement;
    const closeBtn = dialogRoot?.querySelector<HTMLButtonElement>(".b3-dialog__close");
    if (closeBtn) {
        closeBtn.click();
    }
}

function mobileBack() {
    if (view === "library" && navBucket === "list") {
        closeMobileHost();
        return;
    }
    openBucket("list");
    mobileMoreOpen = false;
}

function selectMobileNav(key: MobileNavKey) {
    markPrefsInteraction();
    mobileMoreOpen = false;
    if (key === "highlights") {
        view = "highlights";
        return;
    }
    openBucket(key);
}

function selectMobileView(nextView: PanelView): void {
    markPrefsInteraction();
    view = nextView;
}

function markPrefsInteraction(): void {
    if (!applyingPrefs) cancelPendingLibraryFocus();
    if (prefsLoading && !applyingPrefs) prefsUserTouched = true;
}

function cancelPendingLibraryFocus(): void {
    if (!pendingFocusId) return;
    focusGeneration += 1;
    pendingFocusId = "";
    focusReturnOrigin = null;
    // 保留已发生定位的标记，防止迟到偏好恢复重新套用默认保存视图。
}

type Row =
    | ({ kind: "candidate" } & CandidateEntry)
    | ({ kind: "clip" } & ClipIndexEntry);

const LIBRARY_RENDER_PAGE = 80;
let renderLimit = $state(LIBRARY_RENDER_PAGE);

const libraryItems = $derived.by<LibraryItem[]>(() => [
    ...Object.values(index.clips).map((entry) => ({
        kind: "clip" as const,
        id: entry.id,
        title: entry.title,
        summary: entry.summary,
        hpath: entry.hpath,
        updated: entry.updated,
        status: entry.status || undefined,
        url: entry.url,
        site: entry.site,
        author: entry.author,
        tags: entry.tags,
        aiTags: entry.aiTags,
        src: entry.src,
        contentType: entry.contentType,
        timeSource: entry.timeSource,
        time: entry.time,
        words: entry.words,
        minutes: entry.minutes,
        priority: entry.priority,
        rating: entry.rating,
        favorite: entry.favorite,
    })),
    ...Object.values(index.candidates).map((entry) => ({ kind: "candidate" as const, ...entry })),
]);

const rawFacets = $derived.by(() => libraryFacets(libraryItems, navBucket === "triage"));
let debouncedFacets = $state.raw<ReturnType<typeof libraryFacets>>(
    untrack(() => libraryFacets(libraryItems, navBucket === "triage")),
);

const railBadgeDebouncer = createRailBadgeDebouncer<ReturnType<typeof libraryFacets>>({
    delayMs: 32,
    onFlush: (nextFacets: ReturnType<typeof libraryFacets>) => {
        const { snapshot, changedGroups } = reconcileRailFacets(debouncedFacets, nextFacets);
        if (changedGroups.length > 0) {
            debouncedFacets = snapshot;
        }
    },
});

$effect(() => {
    railBadgeDebouncer.schedule(rawFacets);
});

const facets = $derived(debouncedFacets);

const effectiveStatusFilter = $derived<ClipStatus | readonly ClipStatus[] | "all">(
    authorTimeline
        ? "all"
        : navBucket === "triage"
          ? "inbox"
          : navBucket === "archived"
            ? "archived"
            : listSubFilter === "reading"
              ? "reading"
              : listSubFilter === "later"
                ? "later"
                : listSubFilter === "done"
                  ? "done"
                  : ["later", "reading"]
);

const activeFilter = $derived({
    status: effectiveStatusFilter,
    site: selectedSite,
    author: selectedAuthor,
    tag: selectedTag,
    aiTag: selectedAiTag,
    src: selectedSource,
    timeSource: selectedTimeSource,
    contentType: selectedContentType,
    readingTimeTier: selectedReadingTimeTier !== "all" ? selectedReadingTimeTier : undefined,
    favoriteOnly: selectedFavoriteOnly || undefined,
    keyword,
    sortBy,
    direction: sortDirection,
    includeCandidates: !authorTimeline && navBucket === "triage",
});

const rows = $derived.by<Row[]>(() => {
    // 筛选/排序只返回轻量投影；渲染时回到索引取完整条目，保留 snapshot 等操作字段。
    const filtered = filterAndSortLibrary(libraryItems, activeFilter);
    return filtered.flatMap((item): Row[] => {
        if (item.kind === "clip") {
            const entry = index.clips[item.id];
            return entry ? [{ kind: "clip", ...entry }] : [];
        }
        const entry = index.candidates[item.id];
        return entry ? [{ kind: "candidate", ...entry }] : [];
    });
});

const activeFilterKey = $derived(JSON.stringify(activeFilter));
const visibleRows = $derived(rows.slice(0, renderLimit));
const hasMoreRows = $derived(visibleRows.length < rows.length);

function isWechatEntry(entry: { url?: string; site?: string }): boolean {
    return Boolean((entry.url && isWechatUrl(entry.url)) || (entry.site && isWechatUrl(entry.site)) || entry.site === "微信公众号");
}

const wechatArticlesWithoutAuthor = $derived(
    libraryItems.filter((entry) => isWechatEntry(entry) && !displayWechatAuthor(entry.author) && !wechatAttemptedIds.has(entry.id))
);
const currentViewWechatWithoutAuthor = $derived(
    rows.filter((entry) => isWechatEntry(entry) && !displayWechatAuthor(entry.author) && !wechatAttemptedIds.has(entry.id))
);

async function startBatchWechatScan(): Promise<void> {
    if (wechatScanning) return;
    const targets = currentViewWechatWithoutAuthor.length > 0
        ? currentViewWechatWithoutAuthor
        : wechatArticlesWithoutAuthor;
    if (targets.length === 0) return;

    wechatScanning = true;
    wechatScanProgressText = t(i18n, "wechat.scanningProgress", { current: 0, total: targets.length });
    try {
        const knownWithAuthors = libraryItems.filter((entry) => isWechatEntry(entry) && Boolean(displayWechatAuthor(entry.author)));
        const result = await batchRecognizeWechatAuthors(
            facade.pluginInstance,
            [...knownWithAuthors, ...targets],
            (processed, total, detectedCount) => {
                wechatScanProgressText = `${processed}/${total} (${detectedCount})`;
                notifyBatchProgress(`正在识别微信作者 (${processed}/${total})...`, "wechat-batch-scan");
            }
        );
        markWechatAttempted(targets.map((item) => item.id));
        facade.notifyDataChanged();
        await reload();
        lvNotify.card({
            source: "小驴拾遗",
            category: "wechat-scan-done",
            title: "微信作者识别完成",
            message: result.detectedCount > 0
                ? t(i18n, "wechat.batchScanDone", { count: result.detectedCount })
                : `已扫描全部 ${targets.length} 篇微信文章（其余文章剪藏正文未含公众号署名，已隐藏横幅提示）`,
            level: "success",
            duration: 5000,
        });
    } catch (error) {
        console.warn("[LvGlean] 批量识别微信公众号失败:", error);
        showNotice(t(i18n, "reader.actionFailed"), 3000, "error");
    } finally {
        wechatScanning = false;
        wechatScanProgressText = "";
    }
}

function loadMoreRows(): void {
    renderLimit = Math.min(rows.length, renderLimit + LIBRARY_RENDER_PAGE);
}

$effect(() => {
    if (activeFilterKey !== "") {
        renderLimit = LIBRARY_RENDER_PAGE;
        kanbanColLimits = {
            inbox: KANBAN_INITIAL_LIMIT,
            later: KANBAN_INITIAL_LIMIT,
            reading: KANBAN_INITIAL_LIMIT,
            done: KANBAN_INITIAL_LIMIT,
            archived: KANBAN_INITIAL_LIMIT,
        };
    }
});

// 窄 Dock 里搜索入口是折叠的；打开后立即聚焦，避免用户再点一次输入框。
$effect(() => {
    if (!searchOpen) return;
    void tick().then(() => searchInput?.focus());
});

function closeSearch(): void {
    if (!searchOpen) return;
    searchOpen = false;
    void tick().then(() => searchToggle?.focus());
}

const candidateCount = $derived(Object.keys(index.candidates).length);
const totalClips = $derived(Object.keys(index.clips).length);
const dailySummary = $derived(computeDailyFromIndex(index, facade.settings, currentTime));
const resurfaceCount = $derived(dailySummary.picks.length);
const completionStreak = $derived(dailySummary.completionStreak);

/**
 * 治理提示和状态 rail 共用同一份索引扫描结果。
 * staleDays 是设置项，改变它时会重新计算超龄池；文章索引变更时则只扫描一次。
 */
const queueStats = $derived.by<{
    counts: Record<QueueKey, number>;
    inboxTotal: number;
    stalePool: ClipIndexEntry[];
}>(() => {
    const counts: Record<QueueKey, number> = {
        inbox: 0,
        later: 0,
        reading: 0,
        done: 0,
        archived: 0,
    };
    const stalePool: ClipIndexEntry[] = [];
    let inboxTotal = 0;
    const limit = facade.settings.staleDays;
    for (const entry of Object.values(index.clips)) {
        if (entry.status && entry.status in counts) counts[entry.status] += 1;
        if (entry.status === "inbox") inboxTotal += 1;
        if ((entry.status === "inbox" || entry.status === "later") && ageDays(entry.time) >= limit) {
            stalePool.push(entry);
        }
    }
    return { counts, inboxTotal, stalePool };
});

// 待确认候选单独展示，不占 inbox 配额；只有已收录条目进入五态计数。
const inboxTotal = $derived(queueStats.inboxTotal);
const overQuota = $derived(inboxTotal > facade.settings.inboxQuota);
const stalePool = $derived(queueStats.stalePool);
const governanceCueCount = $derived(
    Number(overQuota && activeQueue === "inbox" && !authorTimeline && !governanceCueMuted("quota", governanceMuted))
    + Number(stalePool.length > 0 && (activeQueue === "inbox" || activeQueue === "later") && !governanceCueMuted("stale", governanceMuted))
    + Number(candidateCount > 0 && !governanceCueMuted("candidates", governanceMuted)),
);
let governanceExpanded = $state(false);
const governanceDetailsVisible = $derived(governanceCueCount <= 1 || governanceExpanded);
const hasGovernanceTools = $derived(
    currentViewWechatWithoutAuthor.length > 0 || stalePool.length > 0 || facade.settings.cloudInboxEnabled || governanceCueCount > 0,
);

async function muteGovernanceCue(key: GovernanceCueKey): Promise<void> {
    const next = { ...governanceMuted, [key]: localDateStamp() };
    try {
        const saved = await saveUiPrefs(facade.pluginInstance, { governanceMuted: next });
        governanceMuted = saved.governanceMuted;
    } catch (error) {
        showMessage(t(i18n, "settings.saveFailed"), 3000);
    }
}

/** 超龄归档候选清单（T-1710）：先展示勾选，确认后按显式 ID 归档。 */
let stalePreviewOpen = $state(false);
let staleSelected = $state(new Set<string>());

function toggleStalePreview() {
    if (!stalePreviewOpen) staleSelected = new Set(stalePool.map((entry) => entry.id));
    stalePreviewOpen = !stalePreviewOpen;
}

function toggleStalePick(id: string) {
    const next = new Set(staleSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    staleSelected = next;
}

async function doArchiveStale() {
    if (archivingStale || staleSelected.size === 0) return;
    archivingStale = true;
    try {
        const ids = stalePool.filter((entry) => staleSelected.has(entry.id)).map((entry) => entry.id);
        const result = await archiveStaleCandidates(facade.pluginInstance, ids);
        const succeeded = new Set(result.succeeded);
        const failed = ids.filter((id) => !succeeded.has(id));
        const indexPending = result.indexSyncFailed.length > 0;
        const resultText = t(i18n, failed.length ? "panel.staleArchivePartial" : "panel.staleArchived", failed.length ? { ok: result.ok, total: ids.length } : { n: result.ok });
        showMessage(
            indexPending ? `${resultText} ${t(i18n, "msg.indexSyncPendingShort")}` : resultText,
            failed.length || indexPending ? 5000 : 3000,
        );
        if (failed.length) staleSelected = new Set(failed);
        else stalePreviewOpen = false;
        if (result.ok > 0) facade.notifyDataChanged();
        await reload();
    } catch (error) {
        console.warn("[glean] 超龄文章归档失败:", error);
        showMessage(t(i18n, "msg.actionFailed"), 4000);
    } finally {
        archivingStale = false;
    }
}

/** Dock、工作台与看板共用的真实站点/用户标签分面。 */
const railStats = $derived(facets);

function queueCount(key: QueueKey): number {
    return queueStats.counts[key];
}

function queueLabel(key: QueueKey | ""): string {
    return t(i18n, `status.${key || "inbox"}`);
}

function sourceLabel(value: string): string {
    const translated = t(i18n, `clip.source.${value}`);
    return translated === `clip.source.${value}` ? value : translated;
}

function facetLabel(value: string, kind: "timeSource" | "contentType"): string {
    const i18nKind = kind === "contentType" ? "type" : "timeSource";
    const key = `clip.${i18nKind}.${value}`;
    const translated = t(i18n, key);
    return translated === key ? value : translated;
}

function selectQueue(queue: QueueKey): void {
    if (queue === "inbox") {
        openBucket("triage");
    } else if (queue === "archived") {
        openBucket("archived");
    } else if (queue === "reading" || queue === "later" || queue === "done") {
        openBucket("list", queue);
    }
}

function openCandidateQueue(): void {
    openBucket("triage");
    searchOpen = false;
    if (isTabCanvas) layoutMode = "list";
}

function openLibrarySearchFromHome(): void {
    markPrefsInteraction();
    view = "library";
    navBucket = "list";
    clearFilters();
    authorTimeline = true;
    searchOpen = true;
    void tick().then(() => {
        searchInput?.focus();
        searchInput?.select();
    });
}

function clearFilters(): void {
    authorTimeline = false;
    selectedAuthor = "";
    selectedSite = "";
    selectedTag = "";
    selectedAiTag = "";
    selectedSource = "";
    selectedTimeSource = "";
    selectedContentType = "";
    selectedReadingTimeTier = "all";
    selectedFavoriteOnly = false;
    keyword = "";
}

function clearUserFilters(): void {
    markPrefsInteraction();
    clearFilters();
}

let seedingDemoArticles = $state(false);

async function handleSeedDemoArticles(): Promise<void> {
    if (seedingDemoArticles) return;
    const notebookId = facade.settings.anchorNotebooks?.[0];
    if (!notebookId) {
        facade.openOnboarding();
        return;
    }
    seedingDemoArticles = true;
    try {
        const { createStarterArticles } = await import("../services/starter-service");
        const res = await createStarterArticles(facade.pluginInstance, notebookId);
        if (res.ok) {
            showMessage(t(i18n, "dailyNote.entryCreated"), 2500);
            await reload();
        } else {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2500);
    } finally {
        seedingDemoArticles = false;
    }
}

const hasFilters = $derived(Boolean(authorTimeline || selectedAuthor || selectedSite || selectedTag || selectedAiTag || selectedSource || selectedTimeSource || selectedContentType || selectedReadingTimeTier !== "all" || selectedFavoriteOnly || keyword.trim()));
const filterChips = $derived(libraryFilterChips(activeFilter));

function selectAuthor(value: string): void {
    markPrefsInteraction();
    const alreadySelected = authorTimeline && selectedAuthor.toLocaleLowerCase() === value.toLocaleLowerCase();
    clearFilters();
    if (alreadySelected) return;
    selectedAuthor = value;
    authorTimeline = true;
    sortBy = "time";
    sortDirection = "desc";
}

function selectSite(value: string): void {
    markPrefsInteraction();
    const alreadySelected = selectedSite.toLocaleLowerCase() === value.toLocaleLowerCase();
    selectedSite = alreadySelected ? "" : value;
}

function handleSiteClick(entry: ClipIndexEntry): void {
    if (entry.site) {
        selectSite(entry.site);
        return;
    }
    if (isWechatEntry(entry)) {
        if (entry.author) {
            selectAuthor(entry.author);
        } else {
            selectSite("mp.weixin.qq.com");
        }
    }
}

function triggerRoamingRead(): void {
    const candidates = Object.values(index.clips);
    const pick = pickRoamingArticle(candidates);
    if (pick) {
        openRoamingDialog(facade, pick, (id, readPoint) => {
            facade.openReadingDocument(id, readPoint);
        });
    } else {
        showMessage(t(i18n, "roaming.emptyPool"), 2500);
    }
}

function filterChipText(key: FilterChipKey, value: string): string {
    const labels: Record<FilterChipKey, string> = { author: "library.filterAuthor", site: "library.filterSite", tag: "library.filterTag", aiTag: "library.filterAiTag", src: "library.filterSource", timeSource: "library.filterTimeSource", contentType: "library.filterContentType", readingTimeTier: "library.filterReadingTime", favoriteOnly: "roaming.favoriteOnly", keyword: "action.search" };
    const text = key === "tag" ? `#${value}` : key === "aiTag" ? `✨${value}` : key === "src" ? sourceLabel(value) : key === "timeSource" || key === "contentType" ? facetLabel(value, key) : key === "readingTimeTier" ? (value === "short" ? t(i18n, "library.readingTimeShort") : value === "medium" ? t(i18n, "library.readingTimeMedium") : value === "long" ? t(i18n, "library.readingTimeLong") : value) : key === "favoriteOnly" ? t(i18n, "roaming.favoriteOnly") : value;
    return `${t(i18n, labels[key])}: ${text}`;
}

function removeFilterChip(key: FilterChipKey): void {
    markPrefsInteraction();
    const next = removeLibraryFilter(activeFilter, key);
    selectedSite = next.site ?? "";
    selectedAuthor = next.author ?? "";
    if (key === "author") authorTimeline = false;
    selectedTag = next.tag ?? "";
    selectedAiTag = next.aiTag ?? "";
    selectedSource = next.src ?? "";
    selectedTimeSource = next.timeSource ?? "";
    selectedContentType = next.contentType ?? "";
    if (key === "readingTimeTier") selectedReadingTimeTier = "all";
    if (key === "favoriteOnly") selectedFavoriteOnly = false;
    keyword = next.keyword ?? "";
}
const activeFilterCount = $derived([selectedAuthor, selectedSite, selectedTag, selectedAiTag, selectedSource, selectedTimeSource, selectedContentType, selectedReadingTimeTier !== "all" ? selectedReadingTimeTier : "", selectedFavoriteOnly ? "favoriteOnly" : "", keyword.trim()].filter(Boolean).length);
const headerSubtitle = $derived.by(() => {
    const viewLabel = t(i18n, views.find((item) => item.key === view)?.labelKey ?? "view.resurface");
    if (view === "resurface") {
        return `${t(i18n, "resurface.subtitle", { n: resurfaceCount })} · ${t(i18n, "resurface.completionStreak", { n: completionStreak })}`;
    }
    return view === "library" && activeFilterCount > 0
        ? t(i18n, "panel.headerFiltered", { view: viewLabel, n: totalClips, filters: activeFilterCount })
        : t(i18n, "panel.headerView", { view: viewLabel, n: totalClips });
});

function openMobileFilters(): void {
    if (mobileFilterOpen) return;
    mobileFilterDraft = {
        site: selectedSite,
        author: selectedAuthor,
        tag: selectedTag,
        aiTag: selectedAiTag,
        source: selectedSource,
        timeSource: selectedTimeSource,
        contentType: selectedContentType,
        favoriteOnly: selectedFavoriteOnly,
        sortBy,
        direction: sortDirection,
    };
    mobileFilterReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    mobileFilterOpen = true;
    void tick().then(() => {
        if (!mobileFilterOpen) return;
        if (!mobileFilterSheet) return;
        isolateMobileFilterBackground(mobileFilterSheet);
        disposeMobileFilterFocus = installModalFocus(mobileFilterSheet, {
            onClose: closeMobileFilters,
            returnFocus: mobileFilterReturnFocus,
        });
    });
}

function isolateMobileFilterBackground(sheet: HTMLElement): void {
    if (mobileFilterBackgroundState) return;
    const layer = sheet.parentElement;
    const panelRoot = rootEl;
    if (!layer || !panelRoot?.contains(sheet)) return;
    const nodes: HTMLElement[] = [];
    let branch: HTMLElement = layer;
    while (branch !== document.body) {
        const parent = branch.parentElement;
        if (!parent) break;
        for (const element of Array.from(parent.children)) {
            if (element instanceof HTMLElement && element !== branch) nodes.push(element);
        }
        branch = parent;
    }
    const rootStyle = document.documentElement.style;
    const bodyStyle = document.body.style;
    mobileFilterBackgroundState = {
        nodes: nodes.map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") })),
        rootOverflow: { value: rootStyle.getPropertyValue("overflow"), priority: rootStyle.getPropertyPriority("overflow") },
        bodyOverflow: { value: bodyStyle.getPropertyValue("overflow"), priority: bodyStyle.getPropertyPriority("overflow") },
    };
    for (const { element } of mobileFilterBackgroundState.nodes) {
        element.inert = true;
        element.setAttribute("aria-hidden", "true");
    }
    rootStyle.setProperty("overflow", "hidden", "important");
    bodyStyle.setProperty("overflow", "hidden", "important");
}

function restoreMobileFilterBackground(): void {
    const state = mobileFilterBackgroundState;
    if (!state) return;
    for (const { element, inert, ariaHidden } of state.nodes) {
        if (!element.isConnected) continue;
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
    }
    const restoreOverflow = (style: CSSStyleDeclaration, property: string, saved: { value: string; priority: string }) => {
        if (!saved.value) style.removeProperty(property);
        else style.setProperty(property, saved.value, saved.priority);
    };
    restoreOverflow(document.documentElement.style, "overflow", state.rootOverflow);
    restoreOverflow(document.body.style, "overflow", state.bodyOverflow);
    mobileFilterBackgroundState = null;
}

function closeMobileFilters(): void {
    mobileFilterOpen = false;
    // Re-enable the trigger before the focus trap tries to return focus to it.
    restoreMobileFilterBackground();
    const dispose = disposeMobileFilterFocus;
    disposeMobileFilterFocus = () => {};
    dispose();
    mobileFilterReturnFocus = null;
}

// 切换主视图时若移动筛选抽屉还开着：收起并释放焦点陷阱，避免回到图书馆时抽屉以"无陷阱"状态复现
$effect(() => {
    void view;
    return () => {
        if (mobileFilterOpen) closeMobileFilters();
    };
});

function clearMobileFilterDraft(): void {
    mobileFilterDraft = {
        ...mobileFilterDraft,
        site: "",
        author: "",
        tag: "",
        aiTag: "",
        source: "",
        timeSource: "",
        contentType: "",
        favoriteOnly: false,
    };
}

function applyMobileFilters(): void {
    markPrefsInteraction();
    selectedSite = mobileFilterDraft.site;
    selectedAuthor = mobileFilterDraft.author;
    if (!selectedAuthor) authorTimeline = false;
    selectedTag = mobileFilterDraft.tag;
    selectedAiTag = mobileFilterDraft.aiTag;
    selectedSource = mobileFilterDraft.source;
    selectedTimeSource = mobileFilterDraft.timeSource;
    selectedContentType = mobileFilterDraft.contentType;
    selectedFavoriteOnly = mobileFilterDraft.favoriteOnly;
    sortBy = mobileFilterDraft.sortBy;
    sortDirection = mobileFilterDraft.direction;
    closeMobileFilters();
}

const kanbanCols = $derived.by(() => {
    if (!isTabCanvas || layoutMode !== "kanban") {
        return queues.map((status) => ({ status, label: queueLabel(status), items: [] as ClipIndexEntry[] }));
    }
    const filtered = filterAndSortLibrary(libraryItems, {
        ...activeFilter,
        status: "all",
        includeCandidates: false,
    });
    // The sorted result is already in the order each column should display.
    // Bucket it in one pass instead of rescanning the full list once per queue.
    const byStatus: Record<QueueKey, ClipIndexEntry[]> = {
        inbox: [],
        later: [],
        reading: [],
        done: [],
        archived: [],
    };
    for (const item of filtered) {
        if (item.kind !== "clip") continue;
        const entry = index.clips[item.id];
        if (entry?.status) {
            const status = entry.status as QueueKey;
            if (status in byStatus) byStatus[status].push(entry);
        }
    }
    return queues.map((status) => ({ status, label: queueLabel(status), items: byStatus[status] }));
});

const KANBAN_INITIAL_LIMIT = 50;
let kanbanColLimits = $state<Record<string, number>>({
    inbox: KANBAN_INITIAL_LIMIT,
    later: KANBAN_INITIAL_LIMIT,
    reading: KANBAN_INITIAL_LIMIT,
    done: KANBAN_INITIAL_LIMIT,
    archived: KANBAN_INITIAL_LIMIT,
});

function loadMoreCol(status: string): void {
    const current = kanbanColLimits[status] ?? KANBAN_INITIAL_LIMIT;
    kanbanColLimits[status] = current + 50;
}

const visibleKanbanCols = $derived(kanbanCols.map((column) => {
    const limit = Math.max(kanbanColLimits[column.status] ?? KANBAN_INITIAL_LIMIT, renderLimit);
    return { ...column, items: column.items.slice(0, limit), totalCount: column.items.length };
}));
const renderedKanbanCount = $derived(visibleKanbanCols.reduce((total, column) => total + column.items.length, 0));
const totalKanbanCount = $derived(kanbanCols.reduce((total, column) => total + column.items.length, 0));
const hasMoreKanban = $derived(renderedKanbanCount < totalKanbanCount);

const filteredSelectionIds = $derived(isTabCanvas && layoutMode === "kanban"
    ? kanbanCols.flatMap((column) => column.items.map((entry) => entry.id))
    : rows.filter((entry) => entry.kind === "clip").map((entry) => entry.id));
const displayedSelectionIds = $derived(isTabCanvas && layoutMode === "kanban"
    ? visibleKanbanCols.flatMap((column) => column.items.map((entry) => entry.id))
    : visibleRows.filter((entry) => entry.kind === "clip").map((entry) => entry.id));
const selectionScope = $derived(librarySelectionScope(selection, filteredSelectionIds, displayedSelectionIds));

function handleRailItemContextMenu(event: MouseEvent, group: RailGroupKey, value: string): void {
    event.preventDefault();
    event.stopPropagation();
    const menu = new Menu("glean-rail-item-menu");

    if (group === "tags" || group === "aiTags") {
        menu.addItem({
            iconHTML: "",
            label: t(i18n, "railMenu.filterTag", { tag: value }),
            click: () => {
                markPrefsInteraction();
                if (group === "tags") selectedTag = value;
                else selectedAiTag = value;
            },
        });
        menu.addItem({
            iconHTML: "",
            label: t(i18n, "railMenu.setAlias"),
            click: () => openTagAliasManager(),
        });
        menu.addSeparator();
        menu.addItem({
            iconHTML: "",
            label: t(i18n, "railMenu.markGroupDone"),
            click: () => void markGroupArticlesDone(group, value),
        });
    } else if (group === "authors") {
        menu.addItem({
            iconHTML: "",
            label: t(i18n, "railMenu.filterAuthor", { author: value }),
            click: () => selectAuthor(value),
        });
        menu.addSeparator();
        menu.addItem({
            iconHTML: "",
            label: t(i18n, "railMenu.markGroupDone"),
            click: () => void markGroupArticlesDone(group, value),
        });
    } else if (group === "sites") {
        menu.addItem({
            iconHTML: "",
            label: t(i18n, "railMenu.filterSite", { site: value }),
            click: () => {
                markPrefsInteraction();
                selectedSite = value;
            },
        });
        if (value && !value.includes("/")) {
            menu.addItem({
                iconHTML: "",
                label: t(i18n, "railMenu.openExternalSite"),
                click: () => {
                    const url = value.startsWith("http") ? value : `https://${value}`;
                    window.open(url, "_blank");
                },
            });
        }
        menu.addSeparator();
        menu.addItem({
            iconHTML: "",
            label: t(i18n, "railMenu.markGroupDone"),
            click: () => void markGroupArticlesDone(group, value),
        });
    }

    menu.open({ x: event.clientX, y: event.clientY });
}

async function markGroupArticlesDone(group: RailGroupKey, value: string): Promise<void> {
    const targetClips = Object.values(index.clips).filter((clip) => {
        if (clip.status === "done" || clip.status === "archived") return false;
        if (group === "authors") return clip.author?.toLocaleLowerCase() === value.toLocaleLowerCase();
        if (group === "sites") return clip.site?.toLocaleLowerCase() === value.toLocaleLowerCase();
        if (group === "tags") return (clip.tags ?? []).some((t) => t.toLocaleLowerCase() === value.toLocaleLowerCase());
        if (group === "aiTags") return (clip.aiTags ?? []).some((t) => t.toLocaleLowerCase() === value.toLocaleLowerCase());
        return false;
    });
    if (targetClips.length === 0) {
        showMessage(t(i18n, "railMenu.noUnreadArticles"), 2500);
        return;
    }
    const ids = targetClips.map((c) => c.id);
    let res: StatusWriteResult;
    try {
        res = await batchSetStatusDetailed(facade.pluginInstance, ids, "done");
    } catch (error) {
        console.warn("[glean] 分组标记已读失败:", error);
        showMessage(writeFailureMessage(error, offline ? "msg.offlineRetry" : "msg.statusFailed"), 3500);
        return;
    }
    showMessage(t(i18n, "railMenu.markDoneResult", { n: res.succeeded.length }), 3000);
    if (res.ok > 0) facade.notifyDataChanged();
    try {
        await reload();
    } catch (error) {
        console.warn("[glean] 分组标记已读后刷新失败:", error);
    }
}

function selectDisplayedArticles(): void {
    if (batchBusy) return;
    selection = addDisplayedSelection(selection, displayedSelectionIds);
}

function restoreLibrarySelectionFocus(): void {
    // Mobile Dock keeps search collapsed until it is needed. When the batch bar
    // disappears after clearing the last selection, return focus to the visible
    // search entry instead of leaving keyboard users on document.body.
    (searchInput ?? searchToggle)?.focus({ preventScroll: true });
}

function keepFilteredArticles(origin: Element | null = document.activeElement): void {
    if (batchBusy) return;
    selection = retainFilteredSelection(selection, filteredSelectionIds);
    void tick().then(() => {
        if (!disposed && rootEl?.getClientRects().length && canRestoreLibraryFocus(origin)) restoreLibrarySelectionFocus();
    });
}

function computeBatchDiff(mode: "tag" | "author", text: string): { update: number; skip: number } {
    const raw = text.trim().replace(/^#/, "");
    if (!raw) return { update: 0, skip: 0 };
    let update = 0;
    let skip = 0;
    for (const id of selection) {
        const clip = index.clips[id];
        if (!clip) continue;
        if (mode === "tag") {
            const has = (clip.aiTags ?? []).some((t) => t.toLocaleLowerCase() === raw.toLocaleLowerCase()) ||
                        (clip.tags ?? []).some((t) => t.toLocaleLowerCase() === raw.toLocaleLowerCase());
            if (has) skip++;
            else update++;
        } else if (mode === "author") {
            const has = (clip.author ?? "").toLocaleLowerCase() === raw.toLocaleLowerCase();
            if (has) skip++;
            else update++;
        }
    }
    return { update, skip };
}

async function batchAddTag(tag: string): Promise<void> {
    if (batchBusy || selection.size === 0) return;
    batchBusy = true;
    const ids = Array.from(selection);
    let count = 0;
    try {
        for (const id of ids) {
            const clip = index.clips[id];
            if (!clip) continue;
            const currentAiTags = clip.aiTags || [];
            if (!currentAiTags.includes(tag)) {
                await writeClip(facade.pluginInstance, id, { aiTags: [...currentAiTags, tag] });
                count += 1;
            }
        }
        selection = new Set();
        showMessage(t(i18n, "library.batchTagsApplied", { count }), 3000);
    } catch (err) {
        console.warn("[LvGlean] 批量打标签失败:", err);
        showMessage(t(i18n, "msg.actionFailed"), 3000);
    } finally {
        if (count > 0) {
            facade.notifyDataChanged();
            await reload();
        }
        batchBusy = false;
    }
}

async function batchCopyBlockRefs(): Promise<void> {
    if (selection.size === 0) return;
    const ids = Array.from(selection);
    const lines = ids.map((id) => {
        const entry = index.clips[id] || index.candidates[id];
        const title = entry?.title || t(i18n, "panel.untitled");
        return `- ((${id} '${title}'))`;
    });
    try {
        await navigator.clipboard.writeText(lines.join("\n"));
        showMessage(t(i18n, "library.batchBlockRefsCopied", { n: ids.length }), 2500);
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
    }
}

async function batchCopyCitations(): Promise<void> {
    if (selection.size === 0) return;
    const ids = Array.from(selection);
    const lines = ids.map((id, indexNum) => {
        const clip = index.clips[id] || index.candidates[id];
        const citItem: CitationItem = {
            id,
            title: clip?.title || t(i18n, "panel.untitled"),
            author: clip?.author,
            site: clip?.site,
            url: clip?.url,
            time: clip?.time,
        };
        const cit = formatGBT7714(citItem);
        return `[${indexNum + 1}] ${cit}`;
    });
    try {
        await navigator.clipboard.writeText(lines.join("\n"));
        showMessage(t(i18n, "library.batchCitationsCopied", { n: ids.length }), 2500);
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
    }
}

async function batchCopyBibTeX(): Promise<void> {
    if (selection.size === 0) return;
    const ids = Array.from(selection);
    const blocks = ids.map((id) => {
        const clip = index.clips[id] || index.candidates[id];
        const citItem: CitationItem = {
            id,
            title: clip?.title || t(i18n, "panel.untitled"),
            author: clip?.author,
            site: clip?.site,
            url: clip?.url,
            time: clip?.time,
        };
        return formatBibTeX(citItem);
    });
    try {
        await navigator.clipboard.writeText(blocks.join("\n\n"));
        showMessage(t(i18n, "library.batchBibtexCopied", { n: ids.length }), 2500);
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
    }
}

async function batchCopyAPA(): Promise<void> {
    if (selection.size === 0) return;
    const ids = Array.from(selection);
    const lines = ids.map((id, indexNum) => {
        const clip = index.clips[id] || index.candidates[id];
        const citItem: CitationItem = {
            id,
            title: clip?.title || t(i18n, "panel.untitled"),
            author: clip?.author,
            site: clip?.site,
            url: clip?.url,
            time: clip?.time,
        };
        const cit = formatAPA(citItem);
        return `[${indexNum + 1}] ${cit}`;
    });
    try {
        await navigator.clipboard.writeText(lines.join("\n"));
        showMessage(t(i18n, "library.batchApaCopied", { n: ids.length }), 2500);
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
    }
}

async function batchCopyMLA(): Promise<void> {
    if (selection.size === 0) return;
    const ids = Array.from(selection);
    const lines = ids.map((id, indexNum) => {
        const clip = index.clips[id] || index.candidates[id];
        const citItem: CitationItem = {
            id,
            title: clip?.title || t(i18n, "panel.untitled"),
            author: clip?.author,
            site: clip?.site,
            url: clip?.url,
            time: clip?.time,
        };
        const cit = formatMLA(citItem);
        return `[${indexNum + 1}] ${cit}`;
    });
    try {
        await navigator.clipboard.writeText(lines.join("\n"));
        showMessage(t(i18n, "library.batchMlaCopied", { n: ids.length }), 2500);
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
    }
}

async function batchFavorite(nextFav: boolean): Promise<void> {
    if (batchBusy || selection.size === 0) return;
    batchBusy = true;
    const ids = Array.from(selection);
    let count = 0;
    try {
        for (const id of ids) {
            const clip = index.clips[id];
            if (!clip || clip.favorite === nextFav) continue;
            await writeClip(facade.pluginInstance, id, { favorite: nextFav }, { force: true });
            count += 1;
        }
        showMessage(t(i18n, nextFav ? "library.batchFavoriteAdded" : "library.batchFavoriteRemoved", { n: count }), 2500);
    } catch (err) {
        console.warn("[LvGlean] 批量收藏失败:", err);
        showMessage(t(i18n, "msg.actionFailed"), 3000);
    } finally {
        if (count > 0) {
            selection = new Set();
            facade.notifyDataChanged();
            await reload();
        }
        batchBusy = false;
    }
}

async function batchSetPriority(priority: number): Promise<void> {
    if (batchBusy || selection.size === 0) return;
    batchBusy = true;
    const ids = Array.from(selection);
    let count = 0;
    try {
        for (const id of ids) {
            const clip = index.clips[id];
            if (!clip || clip.priority === priority) continue;
            await writeClip(facade.pluginInstance, id, { priority }, { force: true });
            count += 1;
        }
        showMessage(t(i18n, "library.batchPrioritySet", { n: count, p: priority }), 2500);
    } catch (err) {
        console.warn("[LvGlean] 批量设置优先级失败:", err);
        showMessage(t(i18n, "msg.actionFailed"), 3000);
    } finally {
        if (count > 0) {
            selection = new Set();
            facade.notifyDataChanged();
            await reload();
        }
        batchBusy = false;
    }
}

async function batchSetRating(rating: number): Promise<void> {
    if (batchBusy || selection.size === 0) return;
    batchBusy = true;
    const ids = Array.from(selection);
    let count = 0;
    try {
        for (const id of ids) {
            const clip = index.clips[id];
            if (!clip || clip.rating === rating) continue;
            await writeClip(facade.pluginInstance, id, { rating }, { force: true });
            count += 1;
        }
        showMessage(t(i18n, "library.batchRatingSet", { n: count, r: rating }), 2500);
    } catch (err) {
        console.warn("[LvGlean] 批量设置评分失败:", err);
        showMessage(t(i18n, "msg.actionFailed"), 3000);
    } finally {
        if (count > 0) {
            selection = new Set();
            facade.notifyDataChanged();
            await reload();
        }
        batchBusy = false;
    }
}

async function batchCopySummaryList(): Promise<void> {
    if (selection.size === 0) return;
    const ids = Array.from(selection);
    const lines = ids.map((id) => {
        const clip = index.clips[id] || index.candidates[id];
        const title = clip?.title || t(i18n, "panel.untitled");
        const parts = [`- **[${title}](siyuan://blocks/${id})**`];
        if (clip?.author) parts.push(t(i18n, "library.summaryAuthor", { author: clip.author }));
        if (clip?.site) parts.push(t(i18n, "library.summarySite", { site: clip.site }));
        if (clip?.minutes) parts.push(`*⏱️ ${clip.minutes}m*`);
        if (clip?.tags?.length) parts.push(`#${clip.tags.join(" #")}`);
        let line = parts.join(" · ");
        if (clip?.summary) {
            line += `\n  > ${clip.summary.trim()}`;
        }
        return line;
    });
    try {
        await navigator.clipboard.writeText(lines.join("\n\n"));
        showMessage(t(i18n, "library.batchSummaryListCopied", { n: ids.length }), 2500);
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
    }
}

async function batchExportCsv(): Promise<void> {
    if (batchBusy || selection.size === 0) return;
    batchBusy = true;
    const ids = Array.from(selection);
    try {
        const csvContent = await exportSelectedClipsCsv(facade.pluginInstance, facade.settings, ids);
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const dateStr = localDateStamp();
        a.download = `glean-selected-${dateStr}.csv`;
        document.body.append(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showMessage(t(i18n, "library.batchExportedCsv", { n: ids.length }), 2500);
    } catch (err) {
        console.warn("[LvGlean] 批量导出 CSV 失败:", err);
        showMessage(t(i18n, "msg.actionFailed"), 3000);
    } finally {
        batchBusy = false;
    }
}

const hasWechatSelected = $derived.by(() => {
    for (const id of selection) {
        const entry = index.clips[id];
        if (entry && (isWechatUrl(entry.url) || isWechatUrl(entry.site))) {
            return true;
        }
    }
    return false;
});

const wechatAuthorsSet = $derived.by(() => {
    const set = new Set<string>();
    for (const clip of Object.values(index.clips)) {
        if (clip.author && (isWechatUrl(clip.url) || isWechatUrl(clip.site))) {
            set.add(clip.author.toLowerCase().trim());
        }
    }
    return set;
});

function authorDotClass(author: string): string {
    return wechatAuthorsSet.has(author.toLowerCase().trim()) ? "glean-wechat-dot" : "";
}

async function batchPurifyWechat(): Promise<void> {
    if (batchBusy || selection.size === 0) return;
    const wechatDocIds = [...selection].filter((id) => {
        const entry = index.clips[id];
        return entry && (isWechatUrl(entry.url) || isWechatUrl(entry.site));
    });
    if (wechatDocIds.length === 0) {
        showMessage(t(i18n, "wechat.authorNotFound"), 2000);
        return;
    }
    batchBusy = true;
    let count = 0;
    try {
        const concurrency = 4;
        for (let i = 0; i < wechatDocIds.length; i += concurrency) {
            const chunk = wechatDocIds.slice(i, i + concurrency);
            const results = await Promise.all(
                chunk.map(async (docId) => {
                    try {
                        return await purifyWechatArticle(facade.pluginInstance, docId);
                    } catch {
                        return { ok: false, modified: false };
                    }
                })
            );
            count += results.filter((r) => r.ok).length;
        }
        selection = new Set();
        showMessage(t(i18n, "wechat.batchPurifyDone", { count }), 3000);
    } catch (err) {
        console.warn("[glean] 批量提纯失败:", err);
        showMessage(t(i18n, "msg.actionFailed"), 3000);
    } finally {
        if (count > 0) {
            facade.notifyDataChanged();
            await reload();
        }
        batchBusy = false;
    }
}

async function batchSetAuthor(author: string): Promise<void> {
    if (batchBusy || selection.size === 0) return;
    batchBusy = true;
    const ids = Array.from(selection);
    let count = 0;
    try {
        for (const id of ids) {
            await writeClip(facade.pluginInstance, id, { author: author.trim() }, { force: true });
            count += 1;
        }
        selection = new Set();
        showMessage(t(i18n, "library.batchAuthorApplied", { count }), 3000);
    } catch (err) {
        console.warn("[LvGlean] 批量设置作者失败:", err);
        showMessage(t(i18n, "msg.actionFailed"), 3000);
    } finally {
        if (count > 0) {
            facade.notifyDataChanged();
            await reload();
        }
        batchBusy = false;
    }
}

function clearSelection(): void {
    if (batchBusy) return;
    const origin = document.activeElement;
    selection = new Set();
    void tick().then(() => {
        if (!disposed && rootEl?.getClientRects().length && canRestoreLibraryFocus(origin)) restoreLibrarySelectionFocus();
    });
}

function openSelectedAi(): void {
    if (batchBusy || selection.size === 0) return;
    aiBatchIds = [...selection];
    aiBatchOpen = true;
}

/** 键盘收尾：保留当前筛选内的勾选，焦点仍按批量条的原焦点规则回落。 */
function retainSelectionToFilter(): void {
    keepFilteredArticles();
}


async function moveTo(entry: ClipIndexEntry, status: ClipStatus) {
    dragId = "";
    dragOverCol = null;
    if (entry.status === status) return;
    if (entry.status === "archived" && status !== "archived") {
        facade.openRestoreDialog(entry.id);
        return;
    }
    if (status === "archived") {
        facade.openArchiveDialog(entry.id);
        return;
    }
    await setStatus(entry, status);
}

function draggedEntry(): ClipIndexEntry | null {
    if (!dragId) return null;
    return index.clips[dragId] ?? null;
}

function statusDotClass(status: string): string {
    return `glean-dot glean-dot--${status}`;
}

const reload = createRefreshQueue(async () => {
    if (!index.updatedAt) loading = true;
    try {
        const cached = await loadIndex(facade.pluginInstance);
        if (cached.updatedAt) {
            index = cached;
            loading = false;
        }
        index = await reconcileIndex(facade.pluginInstance, facade.settings);
        loadError = false;
        void listUnregisteredDocs().then((list) => {
            if (!disposed) unregisteredCount = list.length;
        }).catch(() => undefined);
    } catch (error) {
        console.warn("[glean] 读库对账失败:", error);
        loadError = true;
    } finally {
        loading = false;
    }
});

onMount(() => {
    void reload();
});

$effect(() => {
    const requestedView = resolveInitialPanelView(initialView);
    if (requestedView) {
        prefsUserTouched = true;
        view = requestedView;
    }
});

$effect(() => {
    if (facade.isMobile) {
        isTabCanvas = false;
        return;
    }
    if (rootEl?.closest(".glean-tab-root")) {
        isTabCanvas = true;
        const pending = tabId ? facade.consumeLibraryFocus(tabId) : "";
        if (pending && !initialPreviewId) void focusClipById(pending);
    }
});

// 视图偏好持久化：挂载恢复 + 切换保存
async function restorePreferences(): Promise<void> {
    prefsLoading = true;
    prefsError = false;
    prefsLoadFailed = false;
    try {
        const prefs = await loadUiPrefs(facade.pluginInstance);
        const valid = views.some((item) => item.key === prefs.lastView);
        // 返回读库定位优先于异步恢复的上次视图，避免把 library 切回旧视图；旧版 resurface 默认收敛到阅读清单。
        applyingPrefs = true;
        if (!prefsUserTouched && valid && !focusRequested && prefs.lastView !== "resurface") {
            view = prefs.lastView as PanelView;
        }
        savedViews = prefs.savedViews;
        tagAliases = prefs.tagAliases;
        defaultSavedViewId = prefs.defaultSavedViewId;
        governanceMuted = prefs.governanceMuted;
        railGroups = prefs.libraryRailGroups;
        railAccordion = prefs.railAccordion;
        railCollapsed = prefs.railCollapsed;
        railWidth = prefs.railWidth ?? DEFAULT_RAIL_WIDTH;
        if (!previewPrefsTouched) {
            previewEnabled = prefs.workbenchPreviewEnabled;
            previewRatio = prefs.workbenchPreviewRatio;
        }
        if (!prefsUserTouched && !focusRequested && prefs.defaultSavedViewId) applySavedViewState(prefs.defaultSavedViewId, prefs.savedViews);
        applyingPrefs = false;
        prefsLoading = false;
    } catch (error) {
        console.warn("[glean] 工作台偏好读取失败:", error);
        applyingPrefs = false;
        prefsError = true;
        prefsLoadFailed = true;
        prefsLoading = false;
    }
}

$effect(() => {
    void restorePreferences();
});

$effect(() => {
    // 读取失败时拒绝写回（T-3317）；视图条目的增删改由各操作精确写回（T-3318），此处只同步 lastView
    if (prefsLoading || prefsLoadFailed) return;
    void saveLastViewPref(facade.pluginInstance, view).catch((error) => {
        console.warn("[glean] 工作台视图偏好保存失败:", error);
    });
});

let previewWiden = $state(false);

function currentSavedFilter() {
    return {
        status: authorTimeline ? "all" as const : activeQueue,
        site: selectedSite || undefined,
        author: selectedAuthor || undefined,
        tag: selectedTag || undefined,
        aiTag: selectedAiTag || undefined,
        src: selectedSource || undefined,
        timeSource: selectedTimeSource || undefined,
        contentType: selectedContentType || undefined,
        readingTimeTier: selectedReadingTimeTier !== "all" ? selectedReadingTimeTier : undefined,
        favoriteOnly: selectedFavoriteOnly || undefined,
        keyword: keyword.trim() || undefined,
        sortBy,
        direction: sortDirection,
    };
}

function applySavedViewState(id: string, source = savedViews): void {
    const selected = applySavedView(source, id);
    if (!selected) return;
    const filter = selected.filter;
    applyingPrefs = true;
    layoutMode = selected.layout;
    if (filter.status && filter.status !== "all" && !Array.isArray(filter.status)) {
        const singleStatus = filter.status as ClipStatus;
        activeQueue = singleStatus;
        if (singleStatus === "inbox") {
            navBucket = "triage";
        } else if (singleStatus === "archived") {
            navBucket = "archived";
        } else {
            navBucket = "list";
            listSubFilter = singleStatus === "reading" ? "reading" : singleStatus === "done" ? "done" : "later";
        }
    }
    selectedSite = filter.site ?? "";
    selectedAuthor = filter.author ?? "";
    authorTimeline = filter.status === "all";
    selectedTag = filter.tag ?? "";
    selectedAiTag = filter.aiTag ?? "";
    selectedSource = filter.src ?? "";
    selectedTimeSource = filter.timeSource ?? "";
    selectedContentType = filter.contentType ?? "";
    selectedReadingTimeTier = filter.readingTimeTier ?? "all";
    selectedFavoriteOnly = Boolean(filter.favoriteOnly);
    keyword = filter.keyword ?? "";
    sortBy = filter.sortBy ?? "time";
    sortDirection = filter.direction ?? (sortBy === "title" ? "asc" : "desc");
    savedViewId = selected.id;
    applyingPrefs = false;
}

async function createSmartPresetView(presetKey: string): Promise<void> {
    if (savedViews.length >= 20) return;
    const preset = SMART_VIEW_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const localizedName = t(i18n, preset.nameKey);
    const created = instantiateSmartViewPreset(presetKey, savedViews, localizedName);
    if (!created) {
        showMessage(t(i18n, "library.viewNameDuplicate"), 3500);
        return;
    }
    savedViews = [...savedViews, created];
    savedViewId = created.id;
    applySavedViewState(created.id, savedViews);
    void upsertSavedViewPref(facade.pluginInstance, created).catch(() => {
        showMessage(t(i18n, "settings.saveFailed"), 3000);
    });
}

function saveCurrentView(): void {
    const name = savedViewName.trim();
    if (!name || savedViews.length >= 20) return;
    const id = `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const created = createSavedView(name, currentSavedFilter(), layoutMode, savedViews, id);
    if (!created) {
        showMessage(t(i18n, 'library.viewNameDuplicate'), 3500);
        return;
    }
    savedViews = [...savedViews, created];
    savedViewId = created.id;
    savedViewName = "";
    void upsertSavedViewPref(facade.pluginInstance, created).catch((error) => {
        console.warn("[glean] 保存视图写回失败:", error);
        showMessage(t(i18n, 'settings.saveFailed'), 3000);
    });
}

function aliasForTag(tag: string): string {
    return displayTagAlias(tagAliases, tag);
}

function beginTagAliasEdit(alias?: TagAlias): void {
    tagAliasDeleteConfirmId = "";
    tagAliasDraftId = alias?.id ?? "";
    tagAliasDraftName = alias?.name ?? "";
    tagAliasDraftTag = alias?.tag ?? "";
}

function handleTagAliasInputKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && tagAliasDraftId) {
        event.preventDefault();
        event.stopPropagation();
        beginTagAliasEdit();
        return;
    }
    if ((event.key === "Enter" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) && tagAliasDraftName.trim() && tagAliasDraftTag && !tagAliasBusy) {
        event.preventDefault();
        void saveTagAlias();
    }
}

function handleTagAliasSelectKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) return;
    if ((event.key === "Enter" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) && tagAliasDraftName.trim() && tagAliasDraftTag && !tagAliasBusy) {
        event.preventDefault();
        void saveTagAlias();
    }
}

function openTagAliasManager(): void {
    beginTagAliasEdit();
    tagAliasReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tagAliasManagerOpen = true;
    void tick().then(() => {
        if (!tagAliasManagerOpen || !tagAliasDialog) return;
        disposeTagAliasFocus = installModalFocus(tagAliasDialog, {
            onClose: closeTagAliasManager,
            returnFocus: tagAliasReturnFocus,
        });
    });
}

function closeTagAliasManager(): void {
    tagAliasManagerOpen = false;
    const dispose = disposeTagAliasFocus;
    disposeTagAliasFocus = () => {};
    dispose();
    tagAliasReturnFocus = null;
}

async function saveTagAlias(): Promise<void> {
    if (tagAliasBusy) return;
    const name = tagAliasDraftName.trim();
    const tag = tagAliasDraftTag.trim().replace(/^#+|#+$/g, "").trim();
    if (!name || !tag) {
        showMessage(t(i18n, "msg.actionFailed"), 3000);
        return;
    }
    if (!facets.tags.some((item) => item.value.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
        showMessage(t(i18n, "library.tagAliasMissing"), 3500);
        return;
    }
    if (tagAliases.length >= 20 && !tagAliasDraftId) {
        showMessage(t(i18n, "library.tagAliasLimit"), 3000);
        return;
    }
    const id = tagAliasDraftId || `tag-alias-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const candidate = normalizeTagAliases([...tagAliases.filter((item) => item.id !== id), { id, name, tag }]);
    if (!candidate.some((item) => item.id === id)) {
        showMessage(t(i18n, "library.tagAliasDuplicate"), 3000);
        return;
    }
    tagAliasBusy = true;
    try {
        const saved = await upsertTagAliasPref(facade.pluginInstance, { id, name, tag });
        tagAliases = saved.tagAliases;
        document.dispatchEvent(new Event("glean:tag-aliases-changed"));
        beginTagAliasEdit();
        showMessage(t(i18n, "library.tagAliasSaved"), 2500);
    } catch (error) {
        showMessage(t(i18n, error instanceof TagAliasConflictError ? "library.tagAliasDuplicate" : "settings.saveFailed"), 3000);
    } finally {
        tagAliasBusy = false;
    }
}

async function removeTagAlias(alias: TagAlias): Promise<void> {
    if (tagAliasBusy) return;
    if (tagAliasDeleteConfirmId !== alias.id) {
        tagAliasDeleteConfirmId = alias.id;
        return;
    }
    tagAliasBusy = true;
    try {
        const saved = await deleteTagAliasPref(facade.pluginInstance, alias.id);
        tagAliases = saved.tagAliases;
        document.dispatchEvent(new Event("glean:tag-aliases-changed"));
        tagAliasDeleteConfirmId = "";
        if (tagAliasDraftId === alias.id) beginTagAliasEdit();
        showMessage(t(i18n, "library.tagAliasDeleted"), 2500);
    } catch {
        showMessage(t(i18n, "settings.saveFailed"), 3000);
    } finally {
        tagAliasBusy = false;
    }
}

function removeSavedView(): void {
    if (!savedViewId) return;
    const result = deleteSavedView(savedViews, savedViewId, defaultSavedViewId);
    savedViews = result.views;
    defaultSavedViewId = result.defaultSavedViewId;
    const removedId = savedViewId;
    savedViewId = "";
    void deleteSavedViewPref(facade.pluginInstance, removedId).catch((error) => {
        console.warn("[glean] 保存视图删除写回失败:", error);
        showMessage(t(i18n, 'settings.saveFailed'), 3000);
    });
}

function makeDefaultSavedView(): void {
    defaultSavedViewId = setDefaultSavedView(savedViews, savedViewId);
    void setDefaultSavedViewPref(facade.pluginInstance, defaultSavedViewId).catch((error) => {
        console.warn("[glean] 默认视图写回失败:", error);
        showMessage(t(i18n, 'settings.saveFailed'), 3000);
    });
}

function handleToggleRailGroup(group: RailGroupKey, key: keyof RailGroupPrefs): void {
    if (key === "collapsed") {
        const next = applyRailGroupToggle(railGroups, group, railAccordion);
        railGroups = next;
        void saveUiPrefs(facade.pluginInstance, { libraryRailGroups: next });
    } else {
        const currentGroup = railGroups[group];
        const nextGroup = { ...currentGroup, [key]: !currentGroup[key] };
        const next = { ...railGroups, [group]: nextGroup };
        railGroups = next;
        void saveUiPrefs(facade.pluginInstance, { libraryRailGroups: next });
    }
}

async function toggleAccordion(): Promise<void> {
    const nextAccordion = !railAccordion;
    railAccordion = nextAccordion;
    let nextGroups = railGroups;
    if (nextAccordion) {
        nextGroups = syncAccordionRailGroups(railGroups);
        railGroups = nextGroups;
    }
    await saveUiPrefs(facade.pluginInstance, {
        railAccordion: nextAccordion,
        libraryRailGroups: nextGroups,
    });
}

async function collapseAllGroups(): Promise<void> {
    const next = toggleAllRailGroups(railGroups, true);
    railGroups = next;
    try {
        await saveUiPrefs(facade.pluginInstance, { libraryRailGroups: next });
    } catch (error) {
        console.debug("[glean] 全部折叠偏好保存失败:", error);
    }
}

async function expandAllGroups(): Promise<void> {
    let nextAccordion = railAccordion;
    if (nextAccordion) {
        nextAccordion = false;
        railAccordion = false;
    }
    const next = toggleAllRailGroups(railGroups, false);
    railGroups = next;
    try {
        await saveUiPrefs(facade.pluginInstance, {
            railAccordion: nextAccordion,
            libraryRailGroups: next,
        });
    } catch (error) {
        console.debug("[glean] 全部展开偏好保存失败:", error);
    }
}

function startRailResize(event: PointerEvent): void {
    if (event.button !== 0 || railDraggingPointer !== null) return;
    event.preventDefault();
    const separator = event.currentTarget as HTMLElement;
    separator.focus({ preventScroll: true });
    separator.setPointerCapture(event.pointerId);
    railDraggingPointer = event.pointerId;
    railDragStartX = event.clientX;
    railDragStartWidth = railWidth;
}

function resizeRail(event: PointerEvent): void {
    if (railDraggingPointer !== event.pointerId) return;
    const delta = event.clientX - railDragStartX;
    railWidth = clampRailWidth(railDragStartWidth + delta);
}

function finishRailResize(event: PointerEvent, cancel = false): void {
    if (railDraggingPointer !== event.pointerId) return;
    railDraggingPointer = null;
    if (cancel) {
        railWidth = railDragStartWidth;
    } else {
        void saveUiPrefs(facade.pluginInstance, { railWidth });
    }
    const separator = event.currentTarget as HTMLElement;
    if (separator.hasPointerCapture(event.pointerId)) {
        separator.releasePointerCapture(event.pointerId);
    }
}

function railResizeKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") {
        railWidth = MIN_RAIL_WIDTH;
    } else if (event.key === "End") {
        railWidth = MAX_RAIL_WIDTH;
    } else {
        railWidth = clampRailWidth(railWidth + (event.key === "ArrowLeft" ? -12 : 12));
    }
    void saveUiPrefs(facade.pluginInstance, { railWidth });
}

function resetRailWidth(): void {
    railWidth = DEFAULT_RAIL_WIDTH;
    void saveUiPrefs(facade.pluginInstance, { railWidth });
}

// 插件壳广播的数据变更（迁移完成、右键收录等）触发面板对账（防抖防重入）
$effect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void reload(), 200);
    };
    document.addEventListener("glean:data-changed", handler);
    return () => {
        if (timer) clearTimeout(timer);
        document.removeEventListener("glean:data-changed", handler);
    };
});

async function focusClipById(id: string, openPreview = false): Promise<void> {
    if (disposed || !id) return;
    const generation = ++focusGeneration;
    const origin = document.activeElement;
    focusReturnOrigin = origin;
    focusRequested = true;
    pendingFocusId = id;
    view = "library";
    const filter = activeFilterKey;
    const layout = layoutMode;
    if (loading || (!index.clips[id] && !index.candidates[id])) await reload();
    if (disposed || generation !== focusGeneration || pendingFocusId !== id) return;
    if (view !== "library" || activeFilterKey !== filter || layoutMode !== layout) {
        cancelPendingLibraryFocus();
        return;
    }
    if (!openPreview && !canRestoreLibraryFocus(origin)) {
        pendingFocusId = "";
        focusRequested = false;
        return;
    }
    if (!index.clips[id] && !index.candidates[id]) {
        pendingFocusId = "";
        focusRequested = false;
        return;
    }
    // 返回仍可见的文章时保留当前筛选、队列和布局；确实被筛掉才放宽定位。
    if (focusRowIndex(id) < 0) {
        clearFilters();
        activeQueue = index.clips[id]?.status || "inbox";
    }
    if (!openPreview && previewId && previewSplit) {
        const list = previewSplit.querySelector<HTMLElement>(".glean-lib__main");
        const pane = previewSplit.querySelector<HTMLElement>(".glean-preview-pane");
        // 窄画布用预览替换列表；返回读库必须先显出列表，宽画布仍保留并排预览。
        if (list && !list.getClientRects().length && pane?.getClientRects().length) {
            previewRevision += 1;
            previewId = "";
        }
    }
    if (openPreview) {
        layoutMode = "list";
        previewPrefsTouched = true;
        previewEnabled = true;
        previewRevision += 1;
        previewId = id;
    }
}

function canRestoreLibraryFocus(origin: Element | null): boolean {
    const active = document.activeElement;
    return active === origin || Boolean(origin && !origin.isConnected && (!active || active === document.body));
}

function focusRowIndex(id: string): number {
    if (isTabCanvas && layoutMode === "kanban") {
        return Math.max(-1, ...kanbanCols.map((column) => column.items.findIndex((row) => row.id === id)));
    }
    return rows.findIndex((row) => row.id === id);
}

// 工作台可能仍在对账或等待 Svelte 渲染；保留定位请求直到目标行真正出现。
$effect(() => {
    if (view !== "library") cancelPendingLibraryFocus();
});

$effect(() => {
    const id = pendingFocusId;
    const generation = focusGeneration;
    const root = rootEl;
    const origin = focusReturnOrigin;
    const filter = activeFilterKey;
    const layout = layoutMode;
    if (disposed || !id || !isTabCanvas || loading || view !== "library" || !root) return;
    const rowIndex = focusRowIndex(id);
    if (rowIndex < 0) return;
    if (rowIndex >= renderLimit) {
        renderLimit = rowIndex + 1;
        return;
    }
    void tick().then(() => {
        if (disposed || generation !== focusGeneration || pendingFocusId !== id || rootEl !== root || !root.isConnected) return;
        if (view !== "library" || activeFilterKey !== filter || layoutMode !== layout) {
            cancelPendingLibraryFocus();
            return;
        }
        if (!root.getClientRects().length || !canRestoreLibraryFocus(origin)) {
            cancelPendingLibraryFocus();
            return;
        }
        const target = root.querySelector<HTMLElement>(`[data-glean-clip-id="${CSS.escape(id)}"]`);
        if (!target) {
            pendingFocusId = "";
            focusRequested = false;
            return;
        }
        if (!target.isConnected) return;
        target.scrollIntoView({ block: "nearest", behavior: (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" });
        target.querySelector<HTMLElement>(".glean-drow__ti, .glean-kcard__t, .glean-card__title")?.focus({ preventScroll: true });
        focusFlashTarget?.classList.remove("glean-focus-flash");
        target.classList.add("glean-focus-flash");
        focusFlashTarget = target;
        if (focusFlashTimer !== null) window.clearTimeout(focusFlashTimer);
        focusFlashTimer = window.setTimeout(() => {
            target.classList.remove("glean-focus-flash");
            if (focusFlashTarget === target) focusFlashTarget = null;
            focusFlashTimer = null;
        }, 1200);
        pendingFocusId = "";
    });
});

$effect(() => {
    const handler = (event: Event) => {
        if (disposed || !isTabCanvas || !tabId || (event as CustomEvent<{ tabId?: string }>).detail?.tabId !== tabId) return;
        const id = facade.consumeLibraryFocus(tabId);
        if (id) {
            void focusClipById(id);
        }
    };
    document.addEventListener("glean:focus-clip", handler);
    return () => document.removeEventListener("glean:focus-clip", handler);
});

async function capture(entry: CandidateEntry) {
    if (candidateBusyId) return;
    if (!normalizeUrl(entry.url)) {
        showNotice(t(i18n, "msg.candidateNeedsUrl"), 3500, "warn");
        return;
    }
    candidateBusyId = entry.id;
    try {
        const result = await captureDocument(facade.pluginInstance, entry.id, { url: entry.url || undefined });
        if (result.captured) {
            lvActivity.record({
                source: "拾遗",
                category: "clip",
                title: `剪藏《${entry.title || "未命名文章"}》`,
                linkBlockId: entry.id,
            });
            notifyClipSuccess({
                docId: entry.id,
                title: entry.title,
                openAction: () => facade.openReadingDocument(entry.id),
            });
            autoEnrich(facade.pluginInstance, entry.id, facade.settings, () => facade.notifyDataChanged());
            facade.notifyDataChanged();
        } else if (result.conflict) {
            const confTitle = result.conflict.title || result.conflict.hpath || "";
            lvNotify.card({
                source: "小驴拾遗",
                category: "clip-conflict",
                title: t(i18n, "inbox.duplicate"),
                message: confTitle ? `已存在相同来源文章：《${confTitle}》` : "读库中已收录过同 URL 的文章",
                level: "warn",
                duration: 6000,
                actions: [
                    {
                        label: "查看已有文档",
                        primary: true,
                        onClick: () => facade.openReadingDocument(result.conflict!.id),
                        dismissAfterClick: true,
                    },
                ],
            });
        } else {
            showNotice(t(i18n, "msg.alreadyIn"), 2500, "info");
        }
        await reload();
    } catch (error) {
        console.warn("[glean] 收录失败:", error);
        showNotice(writeFailureMessage(error, offline ? "msg.offlineRetry" : "msg.captureFailed"), 3500, "error");
    } finally {
        candidateBusyId = "";
    }
}

async function captureAsLocal(entry: CandidateEntry) {
    if (candidateBusyId || entry.url) return;
    candidateBusyId = entry.id;
    try {
        const result = await captureDocument(facade.pluginInstance, entry.id, { contentType: "local" });
        if (result.captured) {
            lvActivity.record({
                source: "拾遗",
                category: "clip",
                title: `剪藏《${entry.title || "未命名文章"}》`,
                linkBlockId: entry.id,
            });
            notifyClipSuccess({
                docId: entry.id,
                title: entry.title,
                openAction: () => facade.openReadingDocument(entry.id),
            });
            facade.notifyDataChanged();
        } else {
            showNotice(t(i18n, "msg.alreadyIn"), 2500, "info");
        }
        await reload();
    } catch (error) {
        console.warn("[glean] 本地文档收录失败:", error);
        showNotice(writeFailureMessage(error, offline ? "msg.offlineRetry" : "msg.captureFailed"), 3500, "error");
    } finally {
        candidateBusyId = "";
    }
}

async function excludeCandidate(entry: CandidateEntry) {
    if (candidateBusyId) return;
    candidateBusyId = entry.id;
    try {
        const result = await writeClip(facade.pluginInstance, entry.id, { excluded: true });
        showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "msg.candidateExcluded"), 3500);
        facade.notifyDataChanged();
        await reload();
    } catch (error) {
        console.warn("[glean] 忽略候选失败:", error);
        showMessage(writeFailureMessage(error, offline ? "msg.offlineRetry" : "msg.captureFailed"), 3500);
    } finally {
        candidateBusyId = "";
    }
}

function startCandidateUrlEdit(entry: CandidateEntry) {
    editingCandidateId = entry.id;
    candidateUrlInput = entry.url;
}

async function saveCandidateUrl(entry: CandidateEntry) {
    if (candidateBusyId) return;
    const url = candidateUrlInput.trim();
    if (!normalizeUrl(url)) {
        showMessage(t(i18n, "msg.candidateInvalidUrl"), 3500);
        return;
    }
    candidateBusyId = entry.id;
    try {
        const conflict = await findClipUrlConflict(url, entry.id, facade.pluginInstance);
        if (conflict) {
            showMessage(`${t(i18n, "inbox.duplicate")}: ${conflict.title || conflict.hpath}`, 4000);
            return;
        }
        const result = await writeClip(facade.pluginInstance, entry.id, { url }, { force: true });
        editingCandidateId = "";
        facade.notifyDataChanged();
        if (result.indexSyncFailed) showMessage(t(i18n, "msg.writeIndexPending"), 3500);
        await reload();
    } catch (error) {
        console.warn("[glean] 修正来源失败:", error);
        showMessage(writeFailureMessage(error, offline ? "msg.offlineRetry" : "msg.captureFailed"), 3500);
    } finally {
        candidateBusyId = "";
    }
}

function candidateEvidence(entry: CandidateEntry): string {
    return entry.evidence.map((item) => t(i18n, `candidate.evidence.${item}`)).join(" · ");
}

function candidateMissing(entry: CandidateEntry): string {
    return entry.missing.filter((item) => item !== "status")
        .map((item) => t(i18n, `candidate.missing.${item}`)).join(" · ");
}

function writeFailureMessage(error: unknown, fallbackKey: string): string {
    const kind = kernelErrorKind(error);
    if (kind === "permission") return t(i18n, "msg.writeFailed.permission");
    if (kind === "network") return t(i18n, "msg.writeFailed.network");
    if (kind === "timeout") return t(i18n, "msg.writeFailed.timeout");
    return t(i18n, fallbackKey);
}

function statusFailureKey(kind: string): string {
    if (kind === "permission") return "msg.statusFailure.permission";
    if (kind === "network") return "msg.statusFailure.network";
    if (kind === "timeout") return "msg.statusFailure.timeout";
    return "msg.statusFailure.generic";
}

/** 手动 AI 富化（卡上 ✨，非阻塞标准思考卡 + 可取消，静默降级） */
async function enrich(entry: ClipIndexEntry) {
    if (enrichingId) return;
    const controller = new AbortController();
    enrichAbort = controller;
    enrichingId = entry.id;
    try {
        const outcome = await withLvAiWait(
            {
                scenario: "general",
                title: t(i18n, "ai.actionEnrich"),
                subtitle: entry.title || t(i18n, "panel.untitled"),
                signal: controller.signal,
                onCancel: () => controller.abort(),
            },
            (signal) => enrichClip(facade.pluginInstance, entry.id, facade.settings, { signal }),
        );
        if (controller.signal.aborted || outcome.aborted) {
            return;
        }
        if (outcome.ok) {
            showMessage(
                outcome.indexSyncFailed
                    ? t(i18n, "msg.writeIndexPending")
                    : outcome.duplicates.length > 0
                    ? t(i18n, "ai.similarFound", { title: outcome.duplicates[0].title })
                    : t(i18n, "ai.enrichDone"),
                outcome.indexSyncFailed ? 4000 : 3500
            );
        } else if (outcome.skipped === "cap") {
            showMessage(t(i18n, "ai.capReached", { n: facade.settings.ai.enrichDailyCap }), 4000);
        } else if (outcome.skipped === "off") {
            showMessage(t(i18n, "ai.disabled"), 3000);
        } else {
            showMessage(outcome.policyReason || t(i18n, aiFailureKey(outcome.skipped) ?? "ai.enrichFailed"), outcome.policyReason ? 4500 : 3000);
        }
        if (outcome.ok) facade.notifyDataChanged();
    } finally {
        if (enrichAbort === controller) enrichAbort = null;
        enrichingId = "";
        await reload();
    }
}

async function setStatus(entry: ClipIndexEntry, status: ClipStatus) {
    if (statusActionId) return false;
    statusActionId = entry.id;
    let ok = 0;
    try {
        const result = await batchSetStatusDetailed(facade.pluginInstance, [entry.id], status);
        ok = result.ok;
        if (ok === 1 && status === "done" && facade.settings.integration.checkinEnabled && facade.settings.integration.checkinItemId) {
            void recordReadingDone(facade.settings.integration.checkinItemId, entry.id, entry.title);
        }
        const failure = result.failures[0];
        const message = failure
            ? t(i18n, statusFailureKey(failure.kind))
            : t(i18n, result.indexSyncFailed.length ? "msg.statusIndexPending" : result.ok === 1 ? "msg.statusChanged" : "msg.statusFailed");
        showMessage(message, 3500);
        if (ok === 1) facade.notifyDataChanged();
    } catch (error) {
        console.warn("[glean] 状态变更失败:", error);
        showMessage(writeFailureMessage(error, offline ? "msg.offlineRetry" : "msg.statusFailed"), 3500);
        statusActionId = "";
        return false;
    }
    try {
        await reload();
    } catch (error) {
        console.warn("[glean] 状态变更后刷新失败:", error);
    } finally {
        statusActionId = "";
    }
    return ok === 1;
}

async function startReading(entry: ClipIndexEntry) {
    if (entry.status === "reading") {
        openReading(entry);
        return;
    }
    if (await setStatus(entry, "reading")) openReading(entry);
}

function toggleSelect(id: string, event: Event) {
    event.stopPropagation();
    toggleSelection(id);
}

function toggleSelection(id: string) {
    const next = new Set(selection);
    if (next.has(id)) {
        next.delete(id);
        if (batchBusy) batchAddedDuringRun.delete(id);
    } else {
        next.add(id);
        if (batchBusy) batchAddedDuringRun.add(id);
    }
    selection = next;
}

async function batchApply(status: ClipStatus) {
    if (batchBusy || selection.size === 0) return;
    const origin = document.activeElement;
    batchAddedDuringRun.clear();
    batchBusy = true;
    try {
        await applySelectedStatus(status);
    } finally {
        batchBusy = false;
        batchAddedDuringRun.clear();
        // A successful operation can remove the last selected item and unmount
        // this bar. Keep keyboard users in the library instead of letting focus
        // fall back to document.body after the action disappears.
        if (selection.size === 0) {
            void tick().then(() => {
                if (!disposed && rootEl?.getClientRects().length && canRestoreLibraryFocus(origin)) restoreLibrarySelectionFocus();
            });
        }
    }
}

async function applySelectedStatus(status: ClipStatus) {
    if (selection.size === 0) return;
    const ids = [...selection];
    const total = ids.length;
    const prevStatusMap = new Map<string, ClipStatus>();
    for (const id of ids) {
        const prev = index.clips[id]?.status;
        if (prev && prev !== status) prevStatusMap.set(id, prev);
    }
    let result: StatusWriteResult;
    try {
        result = await batchSetStatusDetailed(facade.pluginInstance, ids, status);
        if (result.ok > 0) facade.notifyDataChanged();
    } catch (error) {
        console.warn("[glean] 批量状态变更失败:", error);
        showMessage(writeFailureMessage(error, offline ? "msg.offlineRetry" : "msg.statusFailed"), 3500);
        return;
    }
    try {
        await reload();
    } catch (error) {
        console.warn("[glean] 批量状态变更后刷新失败:", error);
    }
    if (status === "done" && result.ok > 0 && facade.settings.integration.checkinEnabled && facade.settings.integration.checkinItemId) {
        const completed = result.succeeded
            .map((id) => index.clips[id])
            .filter((entry): entry is ClipIndexEntry => Boolean(entry && entry.status === "done"));
        await Promise.allSettled(completed.map((entry) => recordReadingDone(
            facade.settings.integration.checkinItemId,
            entry.id,
            entry.title,
        )));
    }
    const details = [
        ...(result.failures.length ? [t(i18n, statusFailureKey(result.failures[0].kind))] : []),
        ...(result.indexSyncFailed.length ? [t(i18n, "msg.indexSyncPendingShort")] : []),
    ].join(" ");
    const resultMsg = details
        ? t(i18n, "msg.statusBatchResultDetailed", { ok: result.ok, total, failed: result.failures.length, details })
        : t(i18n, "msg.statusBatchResult", { ok: result.ok, total });
    const undoTargets = result.succeeded
        .map((id) => [id, prevStatusMap.get(id)] as const)
        .filter((pair): pair is [string, ClipStatus] => Boolean(pair[1]));
    if (result.ok > 0 && !details && undoTargets.length > 0 && typeof lvNotify?.undo === "function") {
        lvNotify.undo({
            source: t(i18n, "pluginName"),
            message: resultMsg,
            undoLabel: t(i18n, "resurface.undo"),
            duration: 5000,
            onUndo: async () => {
                let restored = 0;
                for (const [docId, prevStatus] of undoTargets) {
                    try {
                        await writeClip(
                            facade.pluginInstance,
                            docId,
                            { status: prevStatus },
                            { force: true, expectedAttrs: { "custom-clip-status": status } },
                        );
                        restored += 1;
                    } catch {
                        // 状态已被外部修改时保守跳过，避免覆写
                    }
                }
                if (restored > 0) {
                    facade.notifyDataChanged();
                    await reload();
                    showMessage(t(i18n, "library.undoBatchDone", { n: restored }), 2500);
                } else {
                    showMessage(t(i18n, "resurface.undoUnavailable"), 3000);
                }
            },
        });
    } else {
        showMessage(resultMsg, 4500);
    }
    const succeeded = new Set(result.succeeded);
    selection = new Set([...selection].filter((id) => !succeeded.has(id) || batchAddedDuringRun.has(id)));
}

function matchBadge(item: LibraryMatchTarget): string | null {
    if (!activeFilter.keyword) return null;
    const reason = matchLibraryReason(item, activeFilter.keyword);
    if (!reason || reason.kind === "title") return null;
    switch (reason.kind) {
        case "summary": return t(i18n, "library.match.summary");
        case "tag": return t(i18n, "library.match.tag", { tag: reason.value ?? "" });
        case "aiTag": return t(i18n, "library.match.aiTag", { tag: reason.value ?? "" });
        case "author": return t(i18n, "library.match.author", { author: reason.value ?? "" });
        case "site": return t(i18n, "library.match.site", { site: reason.value ?? "" });
        default: return null;
    }
}

function openDoc(docId: string) {
    facade.openReadingDocument(docId);
}

async function exportMarkdown(entry: ClipIndexEntry): Promise<void> {
    if (exportingMarkdownId || entry.internal || !entry.status) return;
    exportingMarkdownId = entry.id;
    try {
        const output = await exportArticleMarkdown(facade.pluginInstance, facade.settings, entry.id);
        const url = URL.createObjectURL(new Blob([output.content], { type: "text/markdown;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = output.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showMessage(t(i18n, "export.markdownDone"), 2500);
    } catch (error) {
        console.warn("[glean] Markdown 导出失败:", error);
        showMessage(t(i18n, "export.markdownFailed"), 4000);
    } finally {
        exportingMarkdownId = "";
    }
}

function articleActionLabel(title: string, preview = false): string {
    const key = preview && previewEnabled && (isTabCanvas || facade.isMobile) ? "preview.title" : "action.openDoc";
    return `${t(i18n, key)}: ${title || t(i18n, "panel.untitled")}`;
}

function selectPreview(id: string): void {
    if (!previewEnabled || (!isTabCanvas && !facade.isMobile)) { openDoc(id); return; }
    previewReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previewRevision += 1;
    previewId = id;
    fullPreviewMode = false;
}

function closePreview(): void {
    previewRevision += 1;
    previewId = "";
    fullPreviewMode = false;
    const target = previewReturnFocus;
    previewReturnFocus = null;
    void tick().then(() => {
        const row = rootEl?.querySelector<HTMLElement>('[data-glean-clip-id]');
        const fallback = row?.querySelector<HTMLElement>('button, input, select, a')
            ?? rootEl?.querySelector<HTMLElement>('.glean-q, button');
        (target?.isConnected ? target : fallback)?.focus({ preventScroll: true });
    });
}

function processedCallback(id: string, revision: number): () => Promise<void> {
    const before = rows.map((row) => row.id);
    const filter = JSON.stringify(activeFilter);
    return async () => {
        await reload();
        if (previewId !== id || previewRevision !== revision || view !== "library" || filter !== JSON.stringify(activeFilter)) return;
        if (loadError) return;
        const next = nextPreviewId(before, rows.map((row) => row.id), id);
        previewRevision += 1;
        if (next) previewId = next;
        else closePreview();
    };
}

async function savePreviewPrefs(patch: { workbenchPreviewEnabled?: boolean; workbenchPreviewRatio?: number }): Promise<void> {
    previewPrefsTouched = true;
    try { await saveUiPrefs(facade.pluginInstance, patch); }
    catch { showMessage(t(i18n, "settings.saveFailed"), 3000); }
}

function togglePreview(): void {
    previewEnabled = !previewEnabled;
    if (!previewEnabled) closePreview();
    void savePreviewPrefs({ workbenchPreviewEnabled: previewEnabled });
    showNotice(previewEnabled ? "已开启双栏阅读预览" : "已恢复单栏纯净列表", 2000, "info");
}

$effect(() => {
    if (view !== "library" || (!facade.isMobile && layoutMode !== "list")) {
        if (previewId) closePreview();
    }
});

$effect(() => {
    if (!facade.isMobile || !previewId || !previewDialog) return;
    return installModalFocus(previewDialog, { onClose: closePreview, returnFocus: previewReturnFocus });
});

$effect(() => {
    const root = previewSplit;
    if (!root || !previewId || facade.isMobile) return;
    const onKey = (event: KeyboardEvent): boolean => {
        if (event.ctrlKey || event.altKey || event.metaKey) return false;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="menu"]')) return false;
        const nestedDialog = target?.closest('[role="dialog"]');
        if (nestedDialog && root.contains(nestedDialog)) return false;
        const overlay = document.querySelectorAll<HTMLElement>('.b3-menu, .b3-dialog, [aria-modal="true"]');
        if (Array.from(overlay).some((element) => element.getClientRects().length && !element.contains(root))) return false;
        closePreview();
        return true;
    };
    return installEscapeHandler(root, onKey);
});

/** 移动端更多菜单是轻量浮层：点击边界外或按 Escape 时收起，避免菜单残留在下一次视图里。 */
$effect(() => {
    if (!facade.isMobile || !mobileMoreOpen || !rootEl) return;
    const onPointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".glean-mobile-topbar__more")) return;
        closeMobileMore();
    };
    const onFocusIn = (event: FocusEvent) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".glean-mobile-topbar__more")) return;
        closeMobileMore();
    };
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.repeat) return;
        closeMobileMore(true);
        event.preventDefault();
        event.stopPropagation();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("keydown", onKeyDown, true);
    };
});

/** 全文/仅链接的有效来源是次级动作；打开来源不会改变文章状态。 */
function openSource(entry: ClipIndexEntry) {
    const url = sourceUrlForCarrier(entry.contentType, entry.url);
    if (!url) {
        showMessage(t(i18n, "clip.sourceMissing"), 3000);
        return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
}

/* ============ 读库全键盘操作流（T-3392） ============ */

/**
 * 键盘光标可遍历的条目：与当前画布真实挂载顺序一致。
 * 只覆盖已挂载窗口，避免 J 跳到尚未渲染的 80 条之外。
 */
const keyboardIds = $derived(isTabCanvas && layoutMode === "kanban"
    ? visibleKanbanCols.flatMap((column) => column.items.map((entry) => entry.id))
    : visibleRows.map((entry) => entry.id));
const keyboardEntry = $derived<Row | null>(keyboardCursorId
    ? rows.find((entry) => entry.id === keyboardCursorId) ?? null
    : null);

/** 输入框类型里只有这些算「正在打字」，复选框/单选框仍可参与快捷键。 */
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "password", "number", "tel", "date", "datetime-local"]);

function keyboardContext(event: KeyboardEvent): LibraryKeyboardContext {
    const target = event.target instanceof Element ? event.target : null;
    const field = target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
    const textEntry = Boolean(field && (!(field instanceof HTMLInputElement) || TEXT_INPUT_TYPES.has(field.type)));
    const nativeAction = Boolean(target?.closest("button, a[href], summary, [role='button'], [role='menuitem']"));
    return {
        textEntry,
        nativeAction,
        overlay: hasBlockingOverlay(),
        cursorActive: Boolean(keyboardEntry),
        hasSelection: selection.size > 0,
    };
}

/** 宿主菜单、插件弹层或已展开的操作浮层打开时，不接管字母键（忽略包裹自身的弹窗宿主）。 */
function hasBlockingOverlay(): boolean {
    if (rootEl?.querySelector(":popover-open")) return true;
    if (typeof document === "undefined") return false;
    // 任何可见的菜单/模态层都优先：包括插件自己的别名与预览对话框。
    const overlays = document.querySelectorAll<HTMLElement>(".b3-menu, .b3-dialog, dialog[open], [role='dialog'][aria-modal='true']");
    return Array.from(overlays).some((element) => element.getClientRects().length > 0 && !(rootEl && element.contains(rootEl)));
}

function focusKeyboardRow(id: string): void {
    void tick().then(() => {
        if (disposed || !id || view !== "library") return;
        const row = rootEl?.querySelector<HTMLElement>(`[data-glean-clip-id="${CSS.escape(id)}"]`);
        if (!row) return;
        row.scrollIntoView({ block: "nearest" });
        row.querySelector<HTMLElement>(".glean-drow__ti, .glean-kcard__t, .glean-card__title")?.focus({ preventScroll: true });
    });
}

function setKeyboardCursor(id: string): void {
    keyboardCursorId = id;
    if (id) focusKeyboardRow(id);
}

/** 状态动作让行离开当前队列后，光标顺势落到原位置的下一条。 */
function cursorAfterRemoval(id: string): string {
    const index = keyboardIds.indexOf(id);
    if (index < 0) return "";
    const remaining = keyboardIds.filter((itemId) => itemId !== id);
    if (remaining.length === 0) return "";
    return remaining[Math.min(index, remaining.length - 1)] ?? "";
}

async function toggleEntryFavorite(entry: ClipIndexEntry): Promise<void> {
    if (statusActionId) {
        showMessage(t(i18n, "msg.statusBusy"), 2500);
        return;
    }
    statusActionId = entry.id;
    const currentClip = index.clips[entry.id];
    const nextFav = !(currentClip?.favorite ?? entry.favorite);
    try {
        await writeClip(facade.pluginInstance, entry.id, { favorite: nextFav }, { force: true });
        showMessage(t(i18n, nextFav ? "roaming.favoriteAdded" : "roaming.favoriteRemoved"), 2000);
        facade.notifyDataChanged();
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
        statusActionId = "";
        return;
    }
    try {
        await reload();
    } catch (error) {
        console.warn("[glean] 收藏变更后刷新失败:", error);
    } finally {
        statusActionId = "";
    }
}

async function recognizeSingleWechatAuthor(entry: ClipIndexEntry): Promise<void> {
    if (statusActionId) {
        showMessage(t(i18n, "msg.statusBusy"), 2500);
        return;
    }
    statusActionId = entry.id;
    let res: string | null = null;
    try {
        res = await scanAndFillWechatAuthor(facade.pluginInstance, entry.id, { url: entry.url, site: entry.site });
        markWechatAttempted([entry.id]);
    } catch (error) {
        console.warn("[glean] 公众号作者识别失败:", error);
        showMessage(t(i18n, "msg.actionFailed"), 2500);
        statusActionId = "";
        return;
    }
    if (res) {
        facade.notifyDataChanged();
        try {
            await reload();
        } catch (error) {
            console.warn("[glean] 公众号作者识别后刷新失败:", error);
        } finally {
            statusActionId = "";
        }
        showMessage(t(i18n, "wechat.authorRecognized", { name: res }), 2500);
    } else {
        statusActionId = "";
        showMessage(t(i18n, "wechat.authorNotFound"), 2500);
    }
}

async function copyEntryBlockRef(entry: { id: string; title?: string }): Promise<void> {
    const title = entry.title || t(i18n, "panel.untitled");
    const refText = `((${entry.id} '${title}'))`;
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(refText);
            showMessage(t(i18n, "reader.blockRefCopied"), 2000);
        } else {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
    }
}

async function copyEntryCitation(entry: { id: string; title?: string; author?: string; site?: string; url?: string; time?: string }, format: CitationFormat = "gbt"): Promise<void> {
    const citItem: CitationItem = {
        id: entry.id,
        title: entry.title || t(i18n, "panel.untitled"),
        author: entry.author,
        site: entry.site,
        url: entry.url,
        time: entry.time,
    };
    const citText = format === "bibtex" ? formatBibTeX(citItem) : (format === "apa" ? formatAPA(citItem) : (format === "mla" ? formatMLA(citItem) : formatGBT7714(citItem)));
    const msgKey = format === "bibtex" ? "citation.bibtexCopied" : (format === "apa" ? "citation.apaCopied" : (format === "mla" ? "citation.mlaCopied" : "citation.gbtCopied"));
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(citText);
            showMessage(t(i18n, msgKey), 2000);
        } else {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
    }
}

async function runKeyboardAction(action: LibraryKeyboardAction): Promise<void> {
    if (action.type === "move") {
        if (layoutMode === "kanban" && isTabCanvas) {
            const kanbanColumnIds = visibleKanbanCols.map((c) => c.items.map((it) => it.id));
            setKeyboardCursor(moveKanbanCursorVertical(kanbanColumnIds, keyboardCursorId, action.delta));
        } else {
            setKeyboardCursor(moveLibraryCursor(keyboardIds, keyboardCursorId, action.delta));
        }
        return;
    }
    if (action.type === "moveCol") {
        if (layoutMode === "kanban" && isTabCanvas) {
            const kanbanColumnIds = visibleKanbanCols.map((c) => c.items.map((it) => it.id));
            setKeyboardCursor(moveKanbanCursor2D(kanbanColumnIds, keyboardCursorId, action.delta));
        }
        return;
    }
    if (action.type === "clearCursor") {
        const id = keyboardCursorId;
        keyboardCursorId = "";
        if (id) focusKeyboardRow(id);
        return;
    }
    if (action.type === "selectDisplayed") {
        selectDisplayedArticles();
        return;
    }
    if (action.type === "keepFiltered") {
        retainSelectionToFilter();
        return;
    }
    if (action.type === "clearSelection") {
        clearSelection();
        return;
    }
    if (action.type === "roaming") {
        triggerRoamingRead();
        return;
    }
    if (action.type === "focusSearch") {
        if (!searchOpen) searchOpen = true;
        void tick().then(() => {
            searchInput?.focus();
            searchInput?.select();
        });
        return;
    }
    const entry = keyboardEntry;
    if (!entry) return;
    if (action.type === "copyBlockRef") {
        await copyEntryBlockRef(entry);
        return;
    }
    if (entry.kind === "candidate") {
        // 候选没有五态：Enter/O 查看证据，X 可勾选，其余状态动作不适用。
        if (action.type === "activate" || action.type === "openDocument") selectPreview(entry.id);
        if (action.type === "toggleSelect") toggleSelection(entry.id);
        return;
    }
    switch (action.type) {
        case "activate":
            selectPreview(entry.id);
            break;
        case "openDocument":
            openDoc(entry.id);
            break;
        case "startReading":
            await startReading(entry);
            break;
        case "later": {
            if (entry.status === "later") break;
            const prevStatus = entry.status;
            const next = cursorAfterRemoval(entry.id);
            if (await setStatus(entry, "later")) {
                setKeyboardCursor(next);
                if (prevStatus && typeof lvNotify?.undo === "function") {
                    const targetId = entry.id;
                    const title = entry.title || t(i18n, "panel.untitled");
                    lvNotify.undo({
                        source: t(i18n, "pluginName"),
                        message: t(i18n, "library.triageUndoPrompt", { title, status: t(i18n, "status.later") }),
                        undoLabel: t(i18n, "resurface.undo"),
                        duration: 5000,
                        onUndo: async () => {
                            try {
                                await writeClip(
                                    facade.pluginInstance,
                                    targetId,
                                    { status: prevStatus },
                                    { force: true, expectedAttrs: { "custom-clip-status": "later" } },
                                );
                                facade.notifyDataChanged();
                                await reload();
                            } catch {
                                showMessage(t(i18n, "resurface.undoUnavailable"), 3000);
                            }
                        },
                    });
                }
            }
            break;
        }
        case "markDone": {
            if (entry.status === "done") break;
            const prevStatus = entry.status;
            const next = cursorAfterRemoval(entry.id);
            if (await setStatus(entry, "done")) {
                setKeyboardCursor(next);
                if (prevStatus && typeof lvNotify?.undo === "function") {
                    const targetId = entry.id;
                    const title = entry.title || t(i18n, "panel.untitled");
                    lvNotify.undo({
                        source: t(i18n, "pluginName"),
                        message: t(i18n, "library.triageUndoPrompt", { title, status: t(i18n, "status.done") }),
                        undoLabel: t(i18n, "resurface.undo"),
                        duration: 5000,
                        onUndo: async () => {
                            try {
                                await writeClip(
                                    facade.pluginInstance,
                                    targetId,
                                    { status: prevStatus },
                                    { force: true, expectedAttrs: { "custom-clip-status": "done" } },
                                );
                                facade.notifyDataChanged();
                                await reload();
                            } catch {
                                showMessage(t(i18n, "resurface.undoUnavailable"), 3000);
                            }
                        },
                    });
                }
            }
            break;
        }
        case "archive":
            // 归档是带后处理选项的显式动作；已经归档的行不再重复打开对话框。
            if (entry.status !== "archived") facade.openArchiveDialog(entry.id);
            break;
        case "toggleSelect":
            toggleSelection(entry.id);
            break;
        case "cyclePriority": {
            if (selection.size > 0 && selection.has(entry.id)) {
                const nextVal = cyclePriorityValue(entry.priority);
                await batchSetPriority(nextVal);
            } else {
                const nextVal = cyclePriorityValue(entry.priority);
                await setPriority(entry, nextVal);
            }
            break;
        }
        case "setPriority": {
            if (selection.size > 0 && selection.has(entry.id)) {
                await batchSetPriority(action.value);
            } else {
                await setPriority(entry, action.value);
            }
            break;
        }
        case "cycleRating": {
            if (selection.size > 0 && selection.has(entry.id)) {
                const nextVal = cycleRatingValue(entry.rating);
                await batchSetRating(nextVal);
            } else {
                const nextVal = cycleRatingValue(entry.rating);
                await setRating(entry, nextVal);
            }
            break;
        }
        case "togglePin":
            await toggleSurfacePin(entry);
            break;
        case "toggleFavorite":
            await toggleEntryFavorite(entry);
            break;
        case "copyCitation":
            await copyEntryCitation(entry, "gbt");
            break;
        case "copyBibTeX":
            await copyEntryCitation(entry, "bibtex");
            break;
    }
}

$effect(() => {
    const onSwitchView = (event: Event) => {
        const nextView = (event as CustomEvent<{ view?: string }>).detail?.view;
        if (!nextView) return;
        if (nextView === "triage" || nextView === "list" || nextView === "archived") {
            openBucket(nextView);
            return;
        }
        if (nextView === "resurface") {
            openStatsAndTools("resurface");
            return;
        }
        if (nextView === "stats") {
            openStatsAndTools("stats");
            return;
        }
        if (views.some((item) => item.key === nextView)) {
            markPrefsInteraction();
            view = nextView as PanelView;
        }
    };
    document.addEventListener("glean:switch-view", onSwitchView);
    return () => document.removeEventListener("glean:switch-view", onSwitchView);
});

const triageCount = $derived(queueStats.counts.inbox + candidateCount);
const readingListCount = $derived(queueStats.counts.later + queueStats.counts.reading);
const archivedCount = $derived(queueStats.counts.archived);
const doneCount = $derived(queueStats.counts.done);

function entryProgressPct(entry: ClipIndexEntry): number {
    if (entry.status === "done" || entry.status === "archived") return 100;
    if (entry.readPoint) return 45;
    if (entry.status === "reading") return 20;
    return 0;
}

function entryDateLabel(entry: ClipIndexEntry): string {
    const raw = entry.updated || entry.time || "";
    if (/^\d{14}$/.test(raw)) {
        return `${raw.slice(4, 6)}/${raw.slice(6, 8)}`;
    }
    return "";
}

$effect(() => {
    if (!focusRequested) return;
    if (activeQueue === "inbox") {
        navBucket = "triage";
    } else if (activeQueue === "archived") {
        navBucket = "archived";
    } else {
        navBucket = "list";
        listSubFilter = activeQueue === "reading" ? "reading" : activeQueue === "done" ? "done" : "later";
    }
});

$effect(() => {
    const root = rootEl;
    if (!root || facade.isMobile || view !== "library") return;
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
        const ctx = keyboardContext(event);
        if (ctx.overlay) return;
        if (event.altKey && (event.key === "f" || event.key === "F")) {
            if (event.repeat || ctx.textEntry) return;
            event.preventDefault();
            event.stopPropagation();
            markPrefsInteraction();
            selectedFavoriteOnly = !selectedFavoriteOnly;
            return;
        }
        if ((event.ctrlKey || event.metaKey) && (event.key === "f" || event.key === "F")) {
            if (event.repeat || ctx.textEntry) return;
            event.preventDefault();
            event.stopPropagation();
            if (!searchOpen) searchOpen = true;
            void tick().then(() => {
                searchInput?.focus();
                searchInput?.select();
            });
            return;
        }
        const action = resolveLibraryShortcut(event, ctx);
        if (!action) return;
        // J/K 在行内按钮上也要生效；其余动作由原生控件优先（见 keyboardContext）。
        event.preventDefault();
        event.stopPropagation();
        void runKeyboardAction(action);
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
});

$effect(() => {
    const root = rootEl;
    if (!root) return;
    return installEscapeHandler(root, () => {
        if (tagAliasManagerOpen) {
            closeTagAliasManager();
            return true;
        }
        if (captureModalOpen) {
            closeCaptureModal();
            return true;
        }
        if (hasBlockingOverlay()) return false;
        if (kbdHelpOpen) {
            kbdHelpOpen = false;
            return true;
        }
        if (view === "library") {
            if (editingCandidateId) {
                editingCandidateId = "";
                return true;
            }
            if (searchInput && document.activeElement === searchInput) {
                if (keyword) {
                    markPrefsInteraction();
                    keyword = "";
                    return true;
                }
                if (searchOpen) {
                    closeSearch();
                    return true;
                }
                searchInput.blur();
                return true;
            }
            if (searchOpen) {
                closeSearch();
                return true;
            }
            if (filterDrawerOpen) {
                filterDrawerOpen = false;
                return true;
            }
            if (selection.size > 0) {
                clearSelection();
                return true;
            }
            if (keyboardCursorId) {
                const id = keyboardCursorId;
                keyboardCursorId = "";
                focusKeyboardRow(id);
                return true;
            }
        }
        return false;
    });
});

// 切换队列、筛选、布局或视图后，光标只在仍可见时保留。
$effect(() => {
    if (view !== "library" || facade.isMobile) {
        if (keyboardCursorId) keyboardCursorId = "";
        return;
    }
    if (keyboardCursorId && !keyboardIds.includes(keyboardCursorId)) keyboardCursorId = "";
});

/** “开始阅读”按载体选择正文或原文；导航本身不再写状态。 */
function openReading(entry: ClipIndexEntry) {
    if (openTargetForCarrier(entry.contentType, entry.url) === "source") openSource(entry);
    else {
        if (resolveCarrier(entry.contentType) === "link") showMessage(t(i18n, "clip.sourceMissing"), 3000);
        openDoc(entry.id);
    }
}

function isPinnedToday(entry: ClipIndexEntry): boolean {
    return entry.pinned === todayStamp();
}

function surfacePinLabel(entry: ClipIndexEntry): string {
    return t(i18n, isPinnedToday(entry) ? "resurface.unpinToday" : "resurface.pinToday");
}

async function toggleSurfacePin(entry: ClipIndexEntry) {
    if (statusActionId) return;
    const nextPinned = !isPinnedToday(entry);
    statusActionId = entry.id;
    try {
        const result = await setSurfacePinned(facade.pluginInstance, entry.id, nextPinned);
        showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : nextPinned ? "resurface.pinToday" : "resurface.unpinToday"), result.indexSyncFailed ? 4000 : 2500);
        facade.notifyDataChanged();
        await reload();
    } catch (error) {
        console.warn("[glean] 今日置顶写入失败:", error);
        showMessage(t(i18n, offline ? "msg.offlineRetry" : "msg.statusFailed"), 3000);
    } finally {
        statusActionId = "";
    }
}

async function setPriority(entry: ClipIndexEntry, value: number) {
    if (statusActionId) {
        showMessage(t(i18n, 'msg.statusBusy'), 2500);
        return;
    }
    statusActionId = entry.id;
    try {
        const result = await writeClip(facade.pluginInstance, entry.id, { priority: value }, { force: true });
        showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "msg.rankSaved"), result.indexSyncFailed ? 4000 : 2500);
        facade.notifyDataChanged();
        await reload();
    } catch (error) {
        console.warn("[glean] 优先级写入失败:", error);
        showMessage(t(i18n, offline ? "msg.offlineRetry" : "msg.statusFailed"), 3000);
    } finally {
        statusActionId = "";
    }
}

async function setRating(entry: ClipIndexEntry, value: number) {
    if (statusActionId) {
        showMessage(t(i18n, 'msg.statusBusy'), 2500);
        return;
    }
    statusActionId = entry.id;
    try {
        const result = await writeClip(facade.pluginInstance, entry.id, { rating: value }, { force: true });
        showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "msg.rankSaved"), result.indexSyncFailed ? 4000 : 2500);
        facade.notifyDataChanged();
        await reload();
    } catch (error) {
        console.warn("[glean] 评分写入失败:", error);
        showMessage(t(i18n, offline ? "msg.offlineRetry" : "msg.statusFailed"), 3000);
    } finally {
        statusActionId = "";
    }
}

/** 来源列的兜底文案：本地文档本无来源，显示"本地笔记"而不是"未知来源"（T-3314 用户走查反馈）。 */
function sourceFallback(entry: ClipIndexEntry): string {
    return resolveCarrier(entry.contentType) === "local" ? t(i18n, "clip.sourceLocal") : t(i18n, "panel.unknownSite");
}

function siteDisplayLabel(entry: ClipIndexEntry): string {
    if (!entry.site) return isWechatEntry(entry) ? t(i18n, "wechat.name") : sourceFallback(entry);
    const site = displaySiteName(entry.site);
    if ((site === "微信公众号" || isWechatEntry(entry)) && entry.author) {
        return t(i18n, "wechat.name");
    }
    return site;
}

function siteItemLabel(val: string): string {
    return isWechatUrl(val) || val === "mp.weixin.qq.com" ? t(i18n, "wechat.name") : displaySiteName(val);
}

function primaryActionLabel(entry: ClipIndexEntry): string {
    if (openTargetForCarrier(entry.contentType, entry.url) === "source") {
        return t(i18n, "action.openSourceLink");
    }
    if (entry.status === "reading") return t(i18n, "action.continueReading");
    if (entry.status === "done") return t(i18n, "action.readAgain");
    return t(i18n, "action.startReading");
}

function openAsset(path: string) {
    if (facade.isMobile && typeof window !== "undefined") {
        window.open(path.startsWith("/") ? path : `/${path}`, "_blank");
        return;
    }
    void openTab({ app: facade.pluginInstance.app, asset: { path } });
}

function snapshotLabel(entry: ClipIndexEntry): string {
    return entry.snapshot ? t(i18n, "snapshot.open") : t(i18n, "snapshot.take");
}

async function takeSnapshot(entry: ClipIndexEntry) {
    if (snappingId) return;
    if (entry.snapshot) {
        openAsset(entry.snapshot);
        return;
    }
    snappingId = entry.id;
    try {
        const result = await snapshotClip(facade.pluginInstance, entry.id);
        const { path } = result;
        showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "snapshot.done"), result.indexSyncFailed ? 4000 : 3000);
        entry.snapshot = path;
        facade.notifyDataChanged();
        await reload();
    } catch (error) {
        console.warn("[glean] 快照生成失败:", error);
        showMessage(t(i18n, "snapshot.failed"), 5000);
    } finally {
        snappingId = "";
    }
}

let externalDragDepth = $state(0);
const isExternalDragActive = $derived(externalDragDepth > 0 && !dragId && !facade.isMobile);

function handleExternalDragEnter(e: DragEvent): void {
    if (dragId) return;
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("text/plain")) {
        externalDragDepth += 1;
    }
}

function handleExternalDragLeave(_e: DragEvent): void {
    if (dragId) return;
    externalDragDepth = Math.max(0, externalDragDepth - 1);
}

function handleExternalDragOver(e: DragEvent): void {
    if (dragId) return;
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("text/plain")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    }
}

async function handleExternalDrop(e: DragEvent): Promise<void> {
    externalDragDepth = 0;
    if (dragId) return;
    const dataTransfer = e.dataTransfer;
    if (!dataTransfer) return;
    const plainText = dataTransfer.getData("text/plain")?.trim() ?? "";
    if (!plainText) return;
    e.preventDefault();

    const blockIdMatch = plainText.match(/\b(\d{14}-[0-9a-z]{7})\b/);
    if (blockIdMatch) {
        const blockId = blockIdMatch[1];
        try {
            const { querySql } = await import("../api/client");
            const rows = await querySql<{ type: string; root_id: string; content: string }>(
                `SELECT type, root_id, content FROM blocks WHERE id = '${blockId}' LIMIT 1`
            );
            if (rows.length > 0) {
                const block = rows[0];
                if (block.type === "d") {
                    const { captureDocument } = await import("../services/clip-store");
                    const res = await captureDocument(facade.pluginInstance, blockId, { src: "drag" });
                    if (res.captured) {
                        lvActivity.record({
                            source: "拾遗",
                            category: "clip",
                            title: `剪藏《${block.content || "未命名文章"}》`,
                            linkBlockId: blockId,
                        });
                        notifyClipSuccess({
                            docId: blockId,
                            title: block.content,
                            openAction: () => facade.openReadingDocument(blockId),
                        });
                    } else if (res.conflict) {
                        const confTitle = res.conflict.title || res.conflict.hpath || "";
                        lvNotify.card({
                            source: "小驴拾遗",
                            category: "clip-conflict",
                            title: t(i18n, "inbox.duplicate"),
                            message: confTitle ? `已存在相同来源文章：《${confTitle}》` : "读库中已收录过同 URL 的文章",
                            level: "warn",
                            duration: 6000,
                            actions: [
                                {
                                    label: "查看已有文档",
                                    primary: true,
                                    onClick: () => facade.openReadingDocument(res.conflict!.id),
                                    dismissAfterClick: true,
                                },
                            ],
                        });
                    } else {
                        showNotice(t(i18n, "msg.alreadyIn"), 2500, "info");
                    }
                    facade.notifyDataChanged();
                    await reload();
                    return;
                } else {
                    const quote = block.content?.trim() || plainText;
                    makeQuoteCardPreview(facade, {
                        title: "",
                        quote,
                        docId: block.root_id || (facade.currentDocId?.() ?? ""),
                        blockId: blockId,
                    });
                    return;
                }
            }
        } catch (error) {
            console.warn("[glean] dropzone block check failed:", error);
        }
    }

    makeQuoteCardPreview(facade, {
        title: "",
        quote: plainText,
        docId: facade.currentDocId?.() ?? "",
        blockId: "",
    });
}

let hostEl = $state<HTMLElement | null>(null);

$effect(() => {
    const el = hostEl;
    if (!el || facade.isMobile) return;
    el.addEventListener("dragenter", handleExternalDragEnter);
    el.addEventListener("dragleave", handleExternalDragLeave);
    el.addEventListener("dragover", handleExternalDragOver);
    el.addEventListener("drop", handleExternalDrop);
    return () => {
        el.removeEventListener("dragenter", handleExternalDragEnter);
        el.removeEventListener("dragleave", handleExternalDragLeave);
        el.removeEventListener("dragover", handleExternalDragOver);
        el.removeEventListener("drop", handleExternalDrop);
    };
});
</script>

<svelte:window ondragend={() => { if (dragId || dragOverCol) { dragId = ""; dragOverCol = null; } }} onkeydown={(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Escape" && tagAliasManagerOpen) { e.preventDefault(); closeTagAliasManager(); } }} />

<div class="glean-panel-host" bind:this={hostEl}>
    {#if isExternalDragActive}
        <div class="glean-dropzone-overlay" role="region" aria-label={t(i18n, "dropzone.title")}>
            <svg class="glean-dropzone-overlay__icon" aria-hidden="true"><use href="#iconGleanInbox" /></svg>
            <div class="glean-dropzone-overlay__title">{t(i18n, "dropzone.title")}</div>
            <div class="glean-dropzone-overlay__desc">{t(i18n, "dropzone.desc")}</div>
        </div>
    {/if}
<div class="glean-panel glean-panel--shell glean-gm-shell" class:glean-panel--mobile={facade.isMobile} bind:this={rootEl} oninput={markPrefsInteraction} onchange={markPrefsInteraction} aria-busy={loading}>
    {#if !facade.isMobile && isTabCanvas}
        <aside class="glean-workbench-rail glean-gm-rail" aria-label={t(i18n, "nav.sectionFlow")}>
            <div class="glean-workbench-rail__brand">
                <span class="glean-workbench-rail__mark glean-gm-mark" aria-hidden="true">拾</span>
                <div class="glean-gm-brand-text">
                    <span class="glean-workbench-rail__name">{t(i18n, "pluginName")}</span>
                    <small class="glean-gm-brand-sub">{t(i18n, "nav.tagline")}</small>
                </div>
            </div>
            <button type="button" class="glean-workbench-rail__capture glean-gm-primary-btn" aria-busy={quickCaptureBusy || captureUrlBusy} onclick={openCaptureModal}>
                <svg viewBox="0 0 24 24" class="glean-gm-svg" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                <span>{t(i18n, "nav.captureArticle")}</span>
            </button>
            <div class="glean-gm-rail-sec">{t(i18n, "nav.sectionFlow")}</div>
            <nav class="glean-workbench-rail__nav" aria-label={t(i18n, "nav.sectionFlow")}>
                <button
                    type="button"
                    class="glean-workbench-rail__item glean-gm-rail-item"
                    class:glean-workbench-rail__item--on={view === "library" && navBucket === "triage"}
                    aria-current={view === "library" && navBucket === "triage" ? "page" : undefined}
                    onclick={() => openBucket("triage")}
                >
                    <span class="glean-gm-rail-main">
                        <svg viewBox="0 0 24 24" class="glean-gm-svg" aria-hidden="true"><path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 13V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7l-1.5 6a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5L5 13Z"/></svg>
                        <span>{t(i18n, "nav.triage")}</span>
                    </span>
                    <span class="glean-gm-rail-count">{triageCount}</span>
                </button>
                <button
                    type="button"
                    class="glean-workbench-rail__item glean-gm-rail-item"
                    class:glean-workbench-rail__item--on={view === "library" && navBucket === "list"}
                    aria-current={view === "library" && navBucket === "list" ? "page" : undefined}
                    onclick={() => openBucket("list")}
                >
                    <span class="glean-gm-rail-main">
                        <svg viewBox="0 0 24 24" class="glean-gm-svg" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
                        <span>{t(i18n, "nav.readingList")}</span>
                    </span>
                    <span class="glean-gm-rail-count">{readingListCount}</span>
                </button>
                <button
                    type="button"
                    class="glean-workbench-rail__item glean-gm-rail-item"
                    class:glean-workbench-rail__item--on={view === "highlights"}
                    aria-current={view === "highlights" ? "page" : undefined}
                    onclick={() => { markPrefsInteraction(); view = "highlights"; }}
                >
                    <span class="glean-gm-rail-main">
                        <svg viewBox="0 0 24 24" class="glean-gm-svg" aria-hidden="true"><path d="m14.5 4.5 5 5L8 21H3v-5L14.5 4.5Z"/><path d="m12 7 5 5"/></svg>
                        <span>{t(i18n, "nav.highlights")}</span>
                    </span>
                </button>
                <button
                    type="button"
                    class="glean-workbench-rail__item glean-gm-rail-item"
                    class:glean-workbench-rail__item--on={view === "library" && navBucket === "archived"}
                    aria-current={view === "library" && navBucket === "archived" ? "page" : undefined}
                    onclick={() => openBucket("archived")}
                >
                    <span class="glean-gm-rail-main">
                        <svg viewBox="0 0 24 24" class="glean-gm-svg" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
                        <span>{t(i18n, "nav.archived")}</span>
                    </span>
                    <span class="glean-gm-rail-count">{archivedCount}</span>
                </button>
            </nav>
            <div class="glean-workbench-rail__spacer"></div>
            <div class="glean-gm-rail-foot">
                <button
                    type="button"
                    class="glean-workbench-rail__item glean-gm-rail-item"
                    title={t(i18n, "unregister.entryDesc")}
                    onclick={() => facade.openUnregisteredDocsDialog?.()}
                >
                    <span class="glean-gm-rail-main">
                        <svg viewBox="0 0 24 24" class="glean-gm-svg glean-gm-svg--sm" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
                        <span>{t(i18n, "unregister.entryButton")}</span>
                    </span>
                    {#if unregisteredCount > 0}<span class="glean-gm-rail-count">{unregisteredCount}</span>{/if}
                </button>
                <button
                    type="button"
                    class="glean-workbench-rail__item glean-gm-rail-item"
                    class:glean-workbench-rail__item--on={view === "stats" || view === "resurface"}
                    aria-current={view === "stats" || view === "resurface" ? "page" : undefined}
                    onclick={() => openStatsAndTools("stats")}
                >
                    <span class="glean-gm-rail-main">
                        <svg viewBox="0 0 24 24" class="glean-gm-svg glean-gm-svg--sm" aria-hidden="true"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>
                        <span>{t(i18n, "nav.statsAndTools")}</span>
                    </span>
                </button>
                <button type="button" class="glean-workbench-rail__item glean-gm-rail-item" onclick={() => facade.openSettings()}>
                    <span class="glean-gm-rail-main">
                        <svg viewBox="0 0 24 24" class="glean-gm-svg glean-gm-svg--sm" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>
                        <span>{t(i18n, "panel.settings")}</span>
                    </span>
                </button>
            </div>
        </aside>
    {/if}
    <div class="glean-panel__body glean-gm-body">
    {#if facade.isMobile || !isTabCanvas}
    <header class="glean-panel__head">
        {#if facade.isMobile}
            <div class="glean-mobile-topbar">
                <button
                    type="button"
                    class="glean-mobile-topbar__back"
                    class:glean-mobile-topbar__back--home={view === "library" && navBucket === "list"}
                    title={t(i18n, view === "library" && navBucket === "list" ? "action.close" : "mobile.back")}
                    aria-label={t(i18n, view === "library" && navBucket === "list" ? "action.close" : "mobile.back")}
                    onclick={() => mobileBack()}
                >
                    {#if view === "library" && navBucket === "list"}
                        <span class="glean-mobile-topbar__mark" aria-hidden="true">拾</span>
                    {:else}
                        <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanArrowLeft" /></svg>
                    {/if}
                </button>
                <div class="glean-mobile-topbar__copy">
                    <h1 class="glean-mobile-topbar__title">{t(i18n, mobileTitleKey)}</h1>
                    <span class="glean-mobile-topbar__sub">{t(i18n, "panel.libraryCount", { n: totalClips })}</span>
                </div>
                {#if !(view === "resurface" && loadError && !index.updatedAt)}
                <span
                    class={`glean-mobile-task glean-mobile-task--${mobileTaskState}`}
                    role="status"
                    aria-live="polite"
                    aria-busy={loading}
                >
                    <span class="glean-mobile-task__dot" aria-hidden="true"></span>
                    <span class="glean-mobile-task__label">
                        {#if mobileTaskState === "loading"}
                            {t(i18n, "mobile.taskLoading")}
                        {:else if mobileTaskState === "error"}
                            {t(i18n, "mobile.taskError")}
                        {:else if mobileTaskState === "offline"}
                            {t(i18n, "mobile.taskOffline")}
                        {:else}
                            {t(i18n, "mobile.taskReady")}
                        {/if}
                    </span>
                </span>
                {/if}
                <button type="button" class="glean-btn glean-btn--pri glean-btn--xs glean-gm-mobile-cap-btn" onclick={openCaptureModal}>+ {t(i18n, "nav.captureArticle")}</button>
                {#if view === "library"}
                    <button
                        type="button"
                        bind:this={searchToggle}
                        class="glean-mobile-topbar__search-btn glean-icon-btn"
                        class:glean-icon-btn--active={searchOpen || Boolean(keyword.trim())}
                        title={t(i18n, searchOpen ? "panel.searchClose" : "panel.searchPlaceholder")}
                        aria-label={t(i18n, searchOpen ? "panel.searchClose" : "panel.searchPlaceholder")}
                        aria-expanded={searchOpen}
                        onclick={() => { if (searchOpen) closeSearch(); else searchOpen = true; }}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                    </button>
                {/if}
                <div class="glean-mobile-topbar__more">
                    <button
                        type="button"
                        class="glean-mobile-topbar__more-btn"
                        bind:this={mobileMoreTrigger}
                        title={t(i18n, "mobile.more")}
                        aria-label={t(i18n, "mobile.more")}
                        aria-haspopup="menu"
                        aria-controls="glean-mobile-more-menu"
                        aria-expanded={mobileMoreOpen}
                        onclick={() => mobileMoreOpen ? closeMobileMore() : openMobileMore()}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="fill:none!important;stroke:currentColor!important;" aria-hidden="true"><circle cx="12" cy="12" r="1" fill="none"/><circle cx="19" cy="12" r="1" fill="none"/><circle cx="5" cy="12" r="1" fill="none"/></svg>
                    </button>
                    {#if mobileMoreOpen}
                        <div id="glean-mobile-more-menu" class="glean-mobile-more" bind:this={mobileMoreMenu} role="menu" tabindex="-1" aria-orientation="vertical" aria-label={t(i18n, "mobile.moreLabel")} onkeydown={mobileMoreKeydown}>
                            <button type="button" class="glean-mobile-more__item" role="menuitem" aria-busy={loading} disabled={loading} onclick={() => { closeMobileMore(); void reload(); }}>
                                <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanRefresh" /></svg>
                                {t(i18n, "action.refresh")}
                            </button>
                            {#if !onClose}
                            <button type="button" class="glean-mobile-more__item" role="menuitem" onclick={() => { closeMobileMore(); openPopup(); }}>
                                <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanPopup" /></svg>
                                {t(i18n, "panel.popup")}
                            </button>
                            {/if}
                            <button type="button" class="glean-mobile-more__item" role="menuitem" onclick={() => { closeMobileMore(); triggerRoamingRead(); }}>
                                <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanRefresh" /></svg>
                                {t(i18n, "roaming.button")}
                            </button>
                            {#if hasGovernanceTools}
                                <button type="button" class="glean-mobile-more__item" role="menuitem" onclick={() => { closeMobileMore(true); governanceToolsOpen = !governanceToolsOpen; if (governanceToolsOpen && view !== "library") view = "library"; }}>
                                    <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanInbox" /></svg>
                                    {t(i18n, governanceToolsOpen ? "panel.governanceCollapse" : "panel.governanceExpand")}
                                </button>
                            {/if}
                            <button type="button" class="glean-mobile-more__item" role="menuitem" aria-current={view === "stats" ? "page" : undefined} onclick={() => { closeMobileMore(true); selectMobileView("stats"); }}>
                                <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                                {t(i18n, "nav.statsAndTools")}
                            </button>
                            <button type="button" class="glean-mobile-more__item" role="menuitem" onclick={() => { closeMobileMore(); facade.openUnregisteredDocsDialog?.(); }}>
                                <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanArchive" /></svg>
                                {t(i18n, "unregister.entryButton")}{#if unregisteredCount > 0} ({unregisteredCount}){/if}
                            </button>
                            <button type="button" class="glean-mobile-more__item" role="menuitem" onclick={() => { closeMobileMore(); facade.openOnboarding(); }}>
                                <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanWheat" /></svg>
                                {t(i18n, "panel.openOnboarding")}
                            </button>
                            <div class="glean-mobile-more__group" role="group" aria-label={t(i18n, "settings.maintenanceToolsGroup")}>
                                <div class="glean-mobile-more__group-label">{t(i18n, "settings.maintenanceToolsGroup")}</div>
                                <button type="button" class="glean-mobile-more__item" role="menuitem" onclick={() => { closeMobileMore(); facade.openMigrate(); }}>
                                    <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanRefresh" /></svg>
                                    {t(i18n, "panel.migrate")}
                                </button>
                                <button type="button" class="glean-mobile-more__item" role="menuitem" onclick={() => { closeMobileMore(); facade.openImport(); }}>
                                    <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanInbox" /></svg>
                                    {t(i18n, "import.title")}
                                </button>
                                <button type="button" class="glean-mobile-more__item" role="menuitem" onclick={() => { closeMobileMore(); facade.openSettings(); }}>
                                    <svg class="glean-mobile-more__icon" aria-hidden="true"><use href="#iconGleanGear" /></svg>
                                    {t(i18n, "panel.settings")}
                                </button>
                            </div>
                        </div>
                    {/if}
                </div>
                {#if onClose}
                    <button
                        type="button"
                        class="glean-mobile-topbar__close"
                        title={t(i18n, "action.close")}
                        aria-label={t(i18n, "action.close")}
                        onclick={closeMobileHost}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanClose" /></svg>
                    </button>
                {/if}
            </div>
        {:else}
            <div class="glean-brand">
                <div class="glean-brand__mark glean-gm-mark">拾</div>
                <div>
                    <div class="glean-brand__name">{t(i18n, "pluginName")}</div>
                    <div class="glean-brand__sub">{headerSubtitle}</div>
                </div>
                <div class="glean-head-actions">
                    <button
                        type="button"
                        class="glean-icon-btn glean-head-action glean-head-action--primary"
                        title={t(i18n, "nav.captureArticle")}
                        aria-label={t(i18n, "nav.captureArticle")}
                        onclick={openCaptureModal}
                    >
                        <svg aria-hidden="true"><use href="#iconGleanPlus" /></svg>
                    </button>
                    <button type="button" class="glean-icon-btn glean-head-action" title={t(i18n, "panel.popup")} aria-label={t(i18n, "panel.popup")} onclick={() => openPopup()}>
                        <svg aria-hidden="true"><use href="#iconGleanPopup" /></svg>
                    </button>
                    <ActionPopover label={t(i18n, "library.moreActions")} compact>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => facade.openUnregisteredDocsDialog?.()}>{t(i18n, "unregister.entryButton")}{#if unregisteredCount > 0} ({unregisteredCount}){/if}</button>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => openStatsAndTools("stats")}>{t(i18n, "nav.statsAndTools")}</button>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={triggerRoamingRead}>{t(i18n, "roaming.button")}</button>
                        {#if hasGovernanceTools}
                            <button type="button" class="glean-btn glean-btn--ghost" aria-pressed={governanceToolsOpen} onclick={() => { governanceToolsOpen = !governanceToolsOpen; if (governanceToolsOpen && view !== "library") view = "library"; }}>
                                {t(i18n, governanceToolsOpen ? "panel.governanceCollapse" : "panel.governanceExpand")}
                            </button>
                        {/if}
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => facade.openMigrate()}>{t(i18n, "panel.migrate")}</button>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => facade.openImport()}>{t(i18n, "import.title")}</button>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => facade.openSettings()}>{t(i18n, "panel.settings")}</button>
                    </ActionPopover>
                </div>
            </div>
            <div class="glean-views glean-gm-dock-nav">
                <button class="glean-views__btn" class:glean-views__btn--on={view === "library" && navBucket === "triage"} aria-pressed={view === "library" && navBucket === "triage"} onclick={() => openBucket("triage")}>{t(i18n, "nav.triage")} ({triageCount})</button>
                <button class="glean-views__btn" class:glean-views__btn--on={view === "library" && navBucket === "list"} aria-pressed={view === "library" && navBucket === "list"} onclick={() => openBucket("list")}>{t(i18n, "nav.readingList")} ({readingListCount})</button>
                <button class="glean-views__btn" class:glean-views__btn--on={view === "highlights"} aria-pressed={view === "highlights"} onclick={() => { markPrefsInteraction(); view = "highlights"; }}>{t(i18n, "nav.highlights")}</button>
                <button class="glean-views__btn" class:glean-views__btn--on={view === "library" && navBucket === "archived"} aria-pressed={view === "library" && navBucket === "archived"} onclick={() => openBucket("archived")}>{t(i18n, "nav.archived")}</button>
            </div>
        {/if}

        {#if view === "library" && (facade.isMobile || !isTabCanvas)}
            {#if searchOpen}
                <div class="glean-search">
                    <svg class="glean-search__icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                    <input
                        bind:this={searchInput}
                        type="text"
                        aria-label={t(i18n, "panel.searchPlaceholder")}
                        placeholder={t(i18n, "panel.searchPlaceholder")}
                        bind:value={keyword}
                        onkeydown={(event) => { if (event.isComposing || event.keyCode === 229) return; if (event.key === "Escape") closeSearch(); }}
                    />
                    {#if keyword}
                        <button
                            type="button"
                            class="glean-search__clear"
                            title={t(i18n, "panel.searchClear")}
                            aria-label={t(i18n, "panel.searchClear")}
                            onclick={() => { markPrefsInteraction(); keyword = ""; searchInput?.focus(); }}
                        ><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanClose" /></svg></button>
                    {/if}
                    <button
                        type="button"
                        class="glean-search__close"
                        title={t(i18n, "panel.searchClose")}
                        aria-label={t(i18n, "panel.searchClose")}
                        onclick={closeSearch}
                    ><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanClose" /></svg></button>
                </div>
            {:else if !facade.isMobile}
                <button
                    bind:this={searchToggle}
                    class="glean-icon-btn"
                    title="{t(i18n, 'panel.searchPlaceholder')} (/)"
                    aria-label={t(i18n, "panel.searchPlaceholder")}
                    onclick={() => (searchOpen = true)}
                >
                    <svg class="glean-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                </button>
            {/if}
        {/if}
    </header>
    {/if}

    {#if loadError && (view !== "resurface" || !!index.updatedAt)}
        <div class="glean-load-error" role="alert" aria-live="assertive">
            <span>{t(i18n, "panel.reloadFailed")}</span>
            <button class="glean-btn" aria-busy={loading} disabled={loading} onclick={() => void reload()}>{t(i18n, "action.retry")}</button>
        </div>
    {/if}

    {#if prefsError}
        <div class="glean-load-error" role="alert" aria-live="assertive">
            <span>{t(i18n, "msg.actionFailed")}</span>
            <button class="glean-btn" aria-busy={prefsLoading} disabled={prefsLoading} onclick={() => void restorePreferences()}>{t(i18n, "action.retry")}</button>
        </div>
    {/if}

    {#if facade.isMobile && offline}
        <div class="glean-offline-notice" role="status" aria-live="polite">
            <span>{t(i18n, "mobile.offlineHint")}</span>
            <button class="glean-btn" aria-busy={loading} disabled={loading} onclick={() => void reload()}>{t(i18n, "action.retry")}</button>
        </div>
    {/if}

    {#if loading && index.updatedAt && !facade.isMobile}
        <div class="glean-panel__refreshing" role="status" aria-live="polite">
            <span class="glean-panel__refreshing-dot" aria-hidden="true"></span>
            {t(i18n, "panel.loading")}
        </div>
    {/if}

    {#if view === "library"}
        <AiBatchPanel {facade} bind:open={aiBatchOpen} docIds={aiBatchIds} />

        {#if !facade.isMobile && isTabCanvas}
            <header class="glean-gm-lib-header">
                <div class="glean-gm-lib-title-group">
                    <h2 class="glean-gm-heading">
                        {navBucket === "triage" ? t(i18n, "nav.triage") : navBucket === "archived" ? t(i18n, "nav.archived") : t(i18n, "nav.readingList")}
                    </h2>
                    <p class="glean-gm-subheading">
                        {navBucket === "triage" ? t(i18n, "library.triageDesc") : navBucket === "archived" ? t(i18n, "library.archivedDesc") : t(i18n, "library.readingListDesc")}
                    </p>
                </div>
                <div class="glean-gm-header-right">
                    {#if navBucket === "list"}
                        <div class="glean-gm-seg" role="group" aria-label={t(i18n, "nav.readingList")}>
                            <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "active"} aria-pressed={!authorTimeline && listSubFilter === "active"} onclick={() => selectReadingListSub("active")}>{t(i18n, "library.bucketAllUnread")} ({readingListCount})</button>
                            <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "reading"} aria-pressed={!authorTimeline && listSubFilter === "reading"} onclick={() => selectReadingListSub("reading")}>{t(i18n, "library.bucketReading")} ({queueStats.counts.reading})</button>
                            <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "later"} aria-pressed={!authorTimeline && listSubFilter === "later"} onclick={() => selectReadingListSub("later")}>{t(i18n, "library.bucketLater")} ({queueStats.counts.later})</button>
                            <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "done"} aria-pressed={!authorTimeline && listSubFilter === "done"} onclick={() => selectReadingListSub("done")}>{t(i18n, "library.bucketDone")} ({doneCount})</button>
                        </div>
                    {/if}
                    <ActionPopover label={t(i18n, "library.moreActions")} compact>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => { markPrefsInteraction(); layoutMode = layoutMode === "list" ? "kanban" : "list"; }}>
                            {layoutMode === "list" ? t(i18n, "view.modeKanban") : t(i18n, "view.modeList")}
                        </button>
                        <button type="button" class="glean-btn glean-btn--ghost" aria-pressed={previewEnabled} onclick={togglePreview}>
                            {t(i18n, "preview.enabled")}{previewEnabled ? " ✓" : ""}
                        </button>
                        {#if layoutMode === "list"}
                            <button type="button" class="glean-btn glean-btn--ghost" aria-pressed={facetRailOpen} onclick={() => { facetRailOpen = !facetRailOpen; }}>
                                {t(i18n, "rail.title")}{facetRailOpen ? " ✓" : ""}
                            </button>
                        {/if}
                        <button type="button" class="glean-btn glean-btn--ghost" aria-pressed={batchMode} onclick={() => { batchMode = !batchMode; }}>
                            {t(i18n, "library.batchActions")}{batchMode ? " ✓" : ""}
                        </button>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={openTagAliasManager}>{t(i18n, "library.tagAliasManage")}</button>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={triggerRoamingRead}>{t(i18n, "roaming.button")}</button>
                        {#if hasGovernanceTools}
                            <button type="button" class="glean-btn glean-btn--ghost" aria-pressed={governanceToolsOpen} onclick={() => { governanceToolsOpen = !governanceToolsOpen; }}>
                                {t(i18n, governanceToolsOpen ? "panel.governanceCollapse" : "panel.governanceExpand")}
                            </button>
                        {/if}
                        <button type="button" class="glean-btn glean-btn--ghost" aria-pressed={kbdHelpOpen} onclick={() => { kbdHelpOpen = !kbdHelpOpen; }}>
                            {t(i18n, "reader.shortcuts")} (?)
                        </button>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => openPopup()}>{t(i18n, "panel.popup")}</button>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => facade.openMigrate()}>{t(i18n, "panel.migrate")}</button>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => facade.openImport()}>{t(i18n, "import.title")}</button>
                    </ActionPopover>
                </div>
            </header>

            <!-- 单行极简搜索与筛选条 -->
            <div class="glean-gm-filter-bar">
                <div class="glean-search glean-gm-search-field">
                    <svg class="glean-search__icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                    <input
                        bind:this={searchInput}
                        type="text"
                        aria-label={t(i18n, "panel.searchPlaceholder")}
                        placeholder={t(i18n, "panel.searchPlaceholder")}
                        bind:value={keyword}
                        onkeydown={(event) => {
                            if (event.isComposing || event.keyCode === 229) return;
                            if (event.key === "Escape") {
                                event.preventDefault();
                                event.stopPropagation();
                                if (keyword) {
                                    markPrefsInteraction();
                                    keyword = "";
                                } else {
                                    searchInput?.blur();
                                }
                            }
                        }}
                    />
                    {#if keyword}
                        <button
                            type="button"
                            class="glean-search__clear"
                            title={t(i18n, "panel.searchClear")}
                            aria-label={t(i18n, "panel.searchClear")}
                            onclick={() => { markPrefsInteraction(); keyword = ""; searchInput?.focus(); }}
                        ><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanClose" /></svg></button>
                    {/if}
                </div>
                <div class="glean-gm-filter-controls">
                    <select class="b3-select glean-gm-select" aria-label={t(i18n, "library.filterSite")} bind:value={selectedSite}>
                        <option value="">{t(i18n, "library.filterSite")}</option>
                        {#each facets.sites as facet (facet.value)}<option value={facet.value}>{siteItemLabel(facet.value)} · {facet.count}</option>{/each}
                        {#if selectedSite && !facets.sites.some((facet) => facet.value === selectedSite)}<option value={selectedSite}>{siteItemLabel(selectedSite)}</option>{/if}
                    </select>
                    <select class="b3-select glean-gm-select" aria-label={t(i18n, "library.sort")} bind:value={sortBy}>
                        <option value="time">{t(i18n, "action.sortTime")}</option>
                        <option value="updated">{t(i18n, "library.sortUpdated")}</option>
                        <option value="words">{t(i18n, "action.sortWords")}</option>
                        <option value="priority">{t(i18n, "action.sortPriority")}</option>
                        <option value="rating">{t(i18n, "library.sortRating")}</option>
                        <option value="title">{t(i18n, "library.sortTitle")}</option>
                    </select>
                    <button
                        type="button"
                        class="glean-filter-dir glean-gm-icon-btn"
                        class:glean-filter-dir--active={sortDirection === "asc"}
                        aria-label={`${t(i18n, "library.toggleDirection")}: ${t(i18n, sortDirection === "asc" ? "library.directionAscending" : "library.directionDescending")}`}
                        aria-pressed={sortDirection === "asc"}
                        title={`${t(i18n, "library.toggleDirection")}: ${t(i18n, sortDirection === "asc" ? "library.directionAscending" : "library.directionDescending")}`}
                        onclick={() => (sortDirection = sortDirection === "desc" ? "asc" : "desc")}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href={sortDirection === "desc" ? "#iconGleanArrowDown" : "#iconGleanArrowUp"} /></svg>
                    </button>
                    <button
                        type="button"
                        class="glean-btn glean-gm-btn"
                        class:glean-gm-btn--accent={filterDrawerOpen || activeFilterCount > 0}
                        aria-expanded={filterDrawerOpen}
                        onclick={() => { filterDrawerOpen = !filterDrawerOpen; }}
                    >
                        <span>{t(i18n, "library.filterButton")} ▾</span>
                        {#if activeFilterCount > 0}<span class="glean-gm-count-dot">{activeFilterCount}</span>{/if}
                    </button>
                </div>
            </div>

            {#if filterDrawerOpen}
                <div class="glean-gm-filter-drawer" role="region" aria-label={t(i18n, "library.filters")}>
                    <LibraryFilters {i18n} {facets} {tagAliases} onManageTagAliases={openTagAliasManager} bind:site={selectedSite} bind:author={selectedAuthor} bind:tag={selectedTag} bind:aiTag={selectedAiTag} bind:source={selectedSource} bind:timeSource={selectedTimeSource} bind:contentType={selectedContentType} bind:readingTimeTier={selectedReadingTimeTier} bind:favoriteOnly={selectedFavoriteOnly} bind:sortBy bind:direction={sortDirection} {hasFilters} onClear={clearUserFilters} {sourceLabel} {facetLabel} />
                    <div class="glean-saved-views glean-gm-saved-views" aria-label={t(i18n, "library.savedViews")}>
                        <select class="b3-select" aria-label={t(i18n, "library.savedViews")} value={savedViewId} onchange={(event) => applySavedViewState((event.currentTarget as HTMLSelectElement).value)}>
                            <option value="">{t(i18n, "library.savedViews")}</option>
                            {#each savedViews as saved (saved.id)}<option value={saved.id}>{saved.name}</option>{/each}
                        </select>
                        <input class="b3-text-field" maxlength="40" value={savedViewName} placeholder={t(i18n, "library.savedViewName")} aria-label={t(i18n, "library.savedViewName")} oninput={(event) => (savedViewName = (event.currentTarget as HTMLInputElement).value)} onkeydown={(event) => { if (event.isComposing || event.keyCode === 229) return; if (event.key === "Enter") { event.preventDefault(); saveCurrentView(); } }} />
                        <button class="glean-btn" disabled={!savedViewName.trim() || savedViews.length >= 20} onclick={saveCurrentView}>{t(i18n, "library.savedViewSave")}</button>
                        <button class="glean-btn glean-btn--ghost" disabled={!savedViewId} onclick={makeDefaultSavedView}>{t(i18n, "library.savedViewDefault")}</button>
                        <button class="glean-btn glean-btn--ghost" disabled={!savedViewId} onclick={removeSavedView}>{t(i18n, "library.savedViewDelete")}</button>
                        <select class="b3-select glean-saved-views__smart" aria-label={t(i18n, "library.smartPresets")} value="" disabled={savedViews.length >= 20} onchange={(event) => { const key = (event.currentTarget as HTMLSelectElement).value; if (key) void createSmartPresetView(key); (event.currentTarget as HTMLSelectElement).value = ""; }}>
                            <option value="" disabled selected>{t(i18n, "library.smartPresets")}</option>
                            {#each SMART_VIEW_PRESETS as preset (preset.key)}
                                <option value={preset.key}>+ {t(i18n, preset.nameKey)}</option>
                            {/each}
                        </select>
                    </div>
                </div>
            {/if}
        {:else if facade.isMobile}
            {#if navBucket === "list"}
                <div class="glean-gm-mobile-subbar">
                    <div class="glean-gm-seg" role="group" aria-label={t(i18n, "nav.readingList")}>
                        <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "active"} onclick={() => selectReadingListSub("active")}>{t(i18n, "library.bucketAllUnread")} ({readingListCount})</button>
                        <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "reading"} onclick={() => selectReadingListSub("reading")}>{t(i18n, "library.bucketReading")} ({queueStats.counts.reading})</button>
                        <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "later"} onclick={() => selectReadingListSub("later")}>{t(i18n, "library.bucketLater")} ({queueStats.counts.later})</button>
                        <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "done"} onclick={() => selectReadingListSub("done")}>{t(i18n, "library.bucketDone")} ({doneCount})</button>
                    </div>
                </div>
            {/if}
            <div class="glean-mobile-filter-summary">
                <button
                    type="button"
                    class="glean-mobile-filter-trigger"
                    class:glean-mobile-filter-trigger--active={activeFilterCount > 0}
                    aria-label={t(i18n, "library.filters")}
                    aria-haspopup="dialog"
                    aria-controls="glean-mobile-filter-sheet"
                    aria-expanded={mobileFilterOpen}
                    onclick={openMobileFilters}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="fill:none!important;stroke:currentColor!important;" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" fill="none"/></svg>
                    <span>{t(i18n, "library.filters")}</span>
                    {#if activeFilterCount > 0}<span class="glean-mobile-filter-badge">{activeFilterCount}</span>{/if}
                </button>
                <span class="glean-mobile-filter-results" role="status" aria-live="polite">{t(i18n, "library.resultCount", { n: rows.length })}</span>
            </div>
        {:else}
            <!-- Dock 窄侧栏模式：补齐待读子状态切换条与简洁筛选折叠条 -->
            {#if navBucket === "list"}
                <div class="glean-gm-dock-subbar">
                    <div class="glean-gm-seg" role="group" aria-label={t(i18n, "nav.readingList")}>
                        <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "active"} aria-pressed={!authorTimeline && listSubFilter === "active"} onclick={() => selectReadingListSub("active")}>{t(i18n, "library.bucketAllUnread")} ({readingListCount})</button>
                        <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "reading"} aria-pressed={!authorTimeline && listSubFilter === "reading"} onclick={() => selectReadingListSub("reading")}>{t(i18n, "library.bucketReading")} ({queueStats.counts.reading})</button>
                        <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "later"} aria-pressed={!authorTimeline && listSubFilter === "later"} onclick={() => selectReadingListSub("later")}>{t(i18n, "library.bucketLater")} ({queueStats.counts.later})</button>
                        <button type="button" class="glean-gm-seg-btn" class:is-active={!authorTimeline && listSubFilter === "done"} aria-pressed={!authorTimeline && listSubFilter === "done"} onclick={() => selectReadingListSub("done")}>{t(i18n, "library.bucketDone")} ({doneCount})</button>
                    </div>
                </div>
            {/if}
            <details class="glean-saved-views-fold glean-filters-fold" class:glean-filters-fold--active={hasFilters}>
                <summary class="glean-saved-views-fold__summary">
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                    <span>{hasFilters ? `${t(i18n, "library.filters")} (${t(i18n, "library.activeFilters")})` : t(i18n, "library.filters")}</span>
                    {#if hasFilters}
                        <span class="glean-badge glean-badge--match">{activeFilterCount}</span>
                    {/if}
                </summary>
                <div class="glean-filters-fold__content">
                    <LibraryFilters {i18n} {facets} {tagAliases} onManageTagAliases={openTagAliasManager} bind:site={selectedSite} bind:author={selectedAuthor} bind:tag={selectedTag} bind:aiTag={selectedAiTag} bind:source={selectedSource} bind:timeSource={selectedTimeSource} bind:contentType={selectedContentType} bind:readingTimeTier={selectedReadingTimeTier} bind:favoriteOnly={selectedFavoriteOnly} bind:sortBy bind:direction={sortDirection} {hasFilters} onClear={clearUserFilters} {sourceLabel} {facetLabel} />
                </div>
            </details>
        {/if}

        {#if !facade.isMobile && filterChips.length > 0}
            <div class="glean-filter-chips" aria-label={t(i18n, "library.filters")}>
                {#each filterChips as chip (chip.key)}
                    <button class="glean-filter-chip" title={filterChipText(chip.key, chip.value)} aria-label={t(i18n, "library.removeFilter", { name: filterChipText(chip.key, chip.value) })} onclick={() => removeFilterChip(chip.key)}><span class="glean-filter-chip__label">{filterChipText(chip.key, chip.value)}</span><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg></button>
                {/each}
            </div>
        {/if}

        {#if facade.isMobile && mobileFilterOpen}
            <div class="glean-mobile-filter-layer">
                <button
                    type="button"
                    class="glean-mobile-filter-backdrop"
                    aria-label={t(i18n, "library.filterClose")}
                    onclick={closeMobileFilters}
                ></button>
                <div
                    id="glean-mobile-filter-sheet"
                    class="glean-mobile-filter-sheet"
                    bind:this={mobileFilterSheet}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="glean-mobile-filter-title"
                    aria-describedby="glean-mobile-filter-results"
                >
                    <header class="glean-mobile-filter-sheet__head">
                        <div>
                            <h2 id="glean-mobile-filter-title">{t(i18n, "library.filters")}</h2>
                            <span id="glean-mobile-filter-results">{t(i18n, "library.resultCount", { n: rows.length })}</span>
                        </div>
                        <button type="button" class="glean-mobile-filter-sheet__close" aria-label={t(i18n, "library.filterClose")} onclick={closeMobileFilters}><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanClose" /></svg></button>
                    </header>
                    <div class="glean-mobile-filter-sheet__body">
                        <label class="glean-mobile-filter-field">
                            <span>{t(i18n, "library.filterAuthor")}</span>
                            <select class="b3-select" bind:value={mobileFilterDraft.author}>
                                <option value="">{t(i18n, "library.filterAuthor")}</option>
                                {#each facets.authors as facet (facet.value)}<option value={facet.value}>{facet.value} · {facet.count}</option>{/each}
                                {#if mobileFilterDraft.author && !facets.authors.some((facet) => facet.value === mobileFilterDraft.author)}<option value={mobileFilterDraft.author}>{mobileFilterDraft.author}</option>{/if}
                            </select>
                        </label>
                        <label class="glean-mobile-filter-field">
                            <span>{t(i18n, "library.filterSite")}</span>
                            <select class="b3-select" bind:value={mobileFilterDraft.site}>
                                <option value="">{t(i18n, "library.filterSite")}</option>
                                {#each facets.sites as facet (facet.value)}<option value={facet.value}>{siteItemLabel(facet.value)} · {facet.count}</option>{/each}
                            </select>
                        </label>
                        <label class="glean-mobile-filter-field">
                            <span>{t(i18n, "library.filterTag")}</span>
                            <select class="b3-select" bind:value={mobileFilterDraft.tag}>
                                <option value="">{t(i18n, "library.filterTag")}</option>
                                {#each facets.tags as facet (facet.value)}<option value={facet.value}>#{aliasForTag(facet.value)} · {facet.count}</option>{/each}
                                {#if mobileFilterDraft.tag && !facets.tags.some((facet) => facet.value === mobileFilterDraft.tag)}<option value={mobileFilterDraft.tag}>#{aliasForTag(mobileFilterDraft.tag)}</option>{/if}
                            </select>
                        </label>
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={openTagAliasManager}>{t(i18n, "library.tagAliasManage")}</button>
                        <label class="glean-mobile-filter-field">
                            <span>{t(i18n, "library.filterAiTag")}</span>
                            <select class="b3-select" bind:value={mobileFilterDraft.aiTag}>
                                <option value="">{t(i18n, "library.filterAiTag")}</option>
                                {#each facets.aiTags as facet (facet.value)}<option value={facet.value}>✨{facet.value} · {facet.count}</option>{/each}
                            </select>
                        </label>
                        <label class="glean-mobile-filter-field">
                            <span>{t(i18n, "library.filterSource")}</span>
                            <select class="b3-select" bind:value={mobileFilterDraft.source}>
                                <option value="">{t(i18n, "library.filterSource")}</option>
                                {#each facets.sources as facet (facet.value)}<option value={facet.value}>{sourceLabel(facet.value)} · {facet.count}</option>{/each}
                            </select>
                        </label>
                        <label class="glean-mobile-filter-field">
                            <span>{t(i18n, "library.filterTimeSource")}</span>
                            <select class="b3-select" bind:value={mobileFilterDraft.timeSource}>
                                <option value="">{t(i18n, "library.filterTimeSource")}</option>
                                {#each facets.timeSources as facet (facet.value)}<option value={facet.value}>{facetLabel(facet.value, "timeSource")} · {facet.count}</option>{/each}
                            </select>
                        </label>
                        <label class="glean-mobile-filter-field">
                            <span>{t(i18n, "library.filterContentType")}</span>
                            <select class="b3-select" bind:value={mobileFilterDraft.contentType}>
                                <option value="">{t(i18n, "library.filterContentType")}</option>
                                {#each facets.contentTypes as facet (facet.value)}<option value={facet.value}>{facetLabel(facet.value, "contentType")} · {facet.count}</option>{/each}
                            </select>
                        </label>
                        <label class="glean-mobile-filter-field glean-mobile-filter-field--checkbox">
                            <input type="checkbox" bind:checked={mobileFilterDraft.favoriteOnly} />
                            <span><svg class="glean-icon glean-icon--xs glean-icon--fav" aria-hidden="true"><use href="#iconGleanHeart" /></svg> {t(i18n, "roaming.favoriteOnly")}</span>
                        </label>
                        <div class="glean-mobile-filter-sort">
                            <label class="glean-mobile-filter-field">
                                <span>{t(i18n, "library.sort")}</span>
                                <select class="b3-select" bind:value={mobileFilterDraft.sortBy}>
                                    <option value="time">{t(i18n, "action.sortTime")}</option>
                                    <option value="updated">{t(i18n, "library.sortUpdated")}</option>
                                    <option value="words">{t(i18n, "action.sortWords")}</option>
                                    <option value="priority">{t(i18n, "action.sortPriority")}</option>
                                    <option value="rating">{t(i18n, "library.sortRating")}</option>
                                    <option value="title">{t(i18n, "library.sortTitle")}</option>
                                </select>
                            </label>
                            <button
                                type="button"
                                class="glean-mobile-filter-direction"
                                aria-label={`${t(i18n, "library.toggleDirection")}: ${t(i18n, mobileFilterDraft.direction === "asc" ? "library.directionAscending" : "library.directionDescending")}`}
                                title={`${t(i18n, "library.toggleDirection")}: ${t(i18n, mobileFilterDraft.direction === "asc" ? "library.directionAscending" : "library.directionDescending")}`}
                                aria-pressed={mobileFilterDraft.direction === "asc"}
                                onclick={() => (mobileFilterDraft.direction = mobileFilterDraft.direction === "desc" ? "asc" : "desc")}
                            >
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href={mobileFilterDraft.direction === "desc" ? "#iconGleanArrowDown" : "#iconGleanArrowUp"} /></svg>
                            </button>
                        </div>
                    </div>
                    <footer class="glean-mobile-filter-sheet__foot">
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={clearMobileFilterDraft}>{t(i18n, "library.filterClear")}</button>
                        <button type="button" class="glean-btn glean-btn--pri" onclick={applyMobileFilters}>{t(i18n, "library.filterApply")}</button>
                    </footer>
                </div>
            </div>
        {/if}

        {#snippet libraryContextBanners()}
            {#if authorTimeline && selectedAuthor}<p class="glean-author-timeline" role="status">{t(i18n, "author.timeline", { author: selectedAuthor })}</p>{/if}
            {#if kbdHelpOpen && !facade.isMobile && isTabCanvas}
                <div class="glean-kbdhint" class:glean-kbdhint--active={Boolean(keyboardEntry)}>
                    <span class="glean-kbdhint__keys" aria-hidden="true">
                        <kbd>J</kbd><kbd>K</kbd> {t(i18n, "library.keyboardMove")}
                        <kbd>Enter</kbd> {t(i18n, "library.keyboardView")}
                        <kbd>O</kbd> {t(i18n, "library.keyboardSource")}
                        <kbd>R</kbd> {t(i18n, "library.keyboardRead")}
                        <kbd>A</kbd> {t(i18n, "library.keyboardLater")}
                        <kbd>E</kbd> {t(i18n, "library.keyboardArchive")}
                        <kbd>X</kbd> {t(i18n, "library.keyboardSelect")}
                        <kbd>S</kbd> {t(i18n, "library.keyboardSelectDisplayed")}
                        <kbd>F</kbd> {selection.size > 0 ? t(i18n, "library.keyboardKeepFiltered") : t(i18n, "roaming.favoriteAction")}
                        <kbd>C</kbd> {selection.size > 0 ? t(i18n, "library.keyboardClearSelection") : t(i18n, "citation.copyGBT")}
                        <kbd>Shift+C</kbd> BibTeX
                        <kbd>P</kbd><kbd>1-5</kbd> {t(i18n, "library.keyboardPriority")}
                        <kbd>M</kbd> {t(i18n, "library.keyboardRating")}
                        <kbd>Y</kbd> {t(i18n, "action.copyBlockRef")}
                        <kbd>B</kbd> {t(i18n, "roaming.button")}
                        <kbd>/</kbd> {t(i18n, "action.search")}
                        <kbd>Esc</kbd> {t(i18n, "library.keyboardExit")}
                    </span>
                </div>
            {/if}
            {#if governanceToolsOpen}
                {#if facade.settings.cloudInboxEnabled}
                    <InboxSection {facade} onMutated={() => void reload()} />
                {/if}
                {#if currentViewWechatWithoutAuthor.length > 0}
                    <div class="glean-quota glean-wechat-banner" role="status">
                        <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                        <span class="glean-banner__text">{t(i18n, "wechat.unrecognizedBanner", { n: currentViewWechatWithoutAuthor.length })}</span>
                        <button
                            type="button"
                            class="glean-cap-btn glean-cap-btn--pri"
                            disabled={wechatScanning}
                            aria-busy={wechatScanning}
                            onclick={() => void startBatchWechatScan()}
                        >
                            {wechatScanning ? wechatScanProgressText : t(i18n, "wechat.startAutoRecognize")}
                        </button>
                    </div>
                {/if}
                {#if governanceDetailsVisible}
                    {#if governanceCueCount > 1}
                        <div class="glean-governance-collapse">
                            <button type="button" class="glean-linkish" aria-expanded={governanceExpanded} onclick={() => (governanceExpanded = !governanceExpanded)}>
                                {governanceExpanded ? t(i18n, "panel.governanceCollapse") : t(i18n, "panel.governanceExpand")}
                            </button>
                        </div>
                    {/if}
                    {#if overQuota && activeQueue === "inbox" && !authorTimeline && !governanceCueMuted("quota", governanceMuted)}
                        <div class="glean-quota">
                            <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanInbox" /></svg>
                            <span class="glean-banner__text">{t(i18n, "panel.quotaOver", { total: inboxTotal, quota: facade.settings.inboxQuota })}</span>
                            <button class="glean-linkish" onclick={() => void muteGovernanceCue("quota")}>{t(i18n, "panel.governanceMuteToday")}</button>
                        </div>
                    {/if}
                    {#if stalePool.length > 0 && (activeQueue === "inbox" || activeQueue === "later") && !governanceCueMuted("stale", governanceMuted)}
                        <div class="glean-quota">
                            <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanArchive" /></svg>
                            <span class="glean-banner__text">{t(i18n, "panel.staleCandidates", { n: stalePool.length })}</span>
                            <button class="glean-cap-btn" onclick={() => toggleStalePreview()}>
                                {stalePreviewOpen ? t(i18n, "panel.staleHide") : t(i18n, "panel.archiveStale")}
                            </button>
                            <button class="glean-linkish" onclick={() => void muteGovernanceCue("stale")}>{t(i18n, "panel.governanceMuteToday")}</button>
                        </div>
                        {#if stalePreviewOpen}
                            <div class="glean-stale-preview">
                                <div class="glean-stale-preview__hint">{t(i18n, "panel.staleHint", { n: facade.settings.staleDays })}</div>
                                {#each stalePool as entry (entry.id)}
                                    <label class="glean-stale-preview__row">
                                        <input
                                            type="checkbox"
                                            checked={staleSelected.has(entry.id)}
                                            disabled={archivingStale}
                                            onchange={() => toggleStalePick(entry.id)}
                                        />
                                        <span class="glean-stale-preview__title" title={entry.title}>{entry.title || t(i18n, "panel.untitled")}</span>
                                        <span class="glean-stale-preview__meta">{entry.site || sourceFallback(entry)} · {t(i18n, "panel.staleDays", { n: ageDays(entry.time) })}</span>
                                    </label>
                                {/each}
                                <div class="glean-stale-preview__ops">
                                    <button class="glean-cap-btn" disabled={archivingStale} onclick={() => { staleSelected = new Set(stalePool.map((entry) => entry.id)); }}>
                                        {t(i18n, "panel.staleSelectAll")}
                                    </button>
                                    <button
                                        class="glean-cap-btn glean-cap-btn--pri"
                                        disabled={archivingStale || staleSelected.size === 0}
                                        aria-busy={archivingStale}
                                        onclick={() => void doArchiveStale()}
                                    >{archivingStale ? t(i18n, "panel.loading") : t(i18n, "panel.staleConfirm", { n: staleSelected.size })}</button>
                                </div>
                            </div>
                        {/if}
                    {/if}
                    {#if candidateCount > 0 && !governanceCueMuted("candidates", governanceMuted)}
                        <div class="glean-candidates" role="status" aria-live="polite" aria-atomic="true">
                            <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanInbox" /></svg>
                            <span class="glean-banner__text">{t(i18n, "panel.candidatesDetected", { n: candidateCount })}</span>
                            <button class="glean-cap-btn" onclick={openCandidateQueue}>{t(i18n, "panel.viewCandidates")}</button>
                            <button class="glean-linkish" onclick={() => void muteGovernanceCue("candidates")}>{t(i18n, "panel.governanceMuteToday")}</button>
                        </div>
                    {/if}
                {/if}
            {/if}
        {/snippet}

        {#if !facade.isMobile}
            {@render libraryContextBanners()}
        {/if}

        {#if loading && !index.updatedAt}
            <div class="glean-panel__loading" role="status" aria-live="polite">
                <span class="glean-panel__loading-dot" aria-hidden="true"></span>
                <span>{t(i18n, "panel.loading")}</span>
            </div>
        {:else if !facade.isMobile && isTabCanvas && layoutMode === "kanban"}
            {#if filterChips.length > 0}
                <div class="glean-kanban__filter-notice" role="status">
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                    <span>{t(i18n, "library.filteredNotice", { count: totalKanbanCount })}</span>
                    <button type="button" class="glean-linkish" onclick={clearFilters}>{t(i18n, "library.clearFilters")}</button>
                </div>
            {/if}
            <div class="glean-kanban">
                {#each visibleKanbanCols as col (col.status)}
                    <div
                        class="glean-kcol"
                        class:glean-kcol--empty={col.items.length === 0}
                        class:glean-kcol--over={dragOverCol === col.status}
                        role="region"
                        aria-label={col.label}
                        ondragover={(e) => { e.preventDefault(); dragOverCol = col.status; }}
                        ondragleave={() => { if (dragOverCol === col.status) dragOverCol = null; }}
                        ondrop={(e) => {
                            e.preventDefault();
                            const source = draggedEntry();
                            dragOverCol = null;
                            if (source && source.status !== col.status) void moveTo(source, col.status);
                            else dragId = "";
                        }}
                    >
                        <div class="glean-kcol__head">
                            <span class={statusDotClass(col.status)}></span>
                            <span class="glean-kcol__label">{col.label}</span>
                            <span class="glean-kcol__n">{col.totalCount !== undefined && col.items.length < col.totalCount ? `${col.items.length}/${col.totalCount}` : col.items.length}</span>
                        </div>
                        {#if col.items.length === 0}
                            <div class="glean-kcol__empty" role="status">
                                <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanWheat" /></svg>
                                <span>{t(i18n, "panel.empty")}</span>
                            </div>
                        {/if}
                        {#each col.items as entry (entry.id)}
                            <div
                                class="glean-kcard"
                                class:glean-kcard--selected={selection.has(entry.id)}
                                class:glean-kcard--cursor={keyboardCursorId === entry.id}
                                class:glean-kcard--busy={statusActionId === entry.id}
                                data-glean-clip-id={entry.id}
                                draggable="true"
                                role="group"
                                aria-label={entry.title || t(i18n, "panel.untitled")}
                                aria-current={keyboardCursorId === entry.id ? "true" : undefined}
                                aria-busy={statusActionId === entry.id ? "true" : undefined}
                                ondragstart={(e) => {
                                    if (statusActionId) { e.preventDefault(); return; }
                                    dragId = entry.id;
                                    e.dataTransfer?.setData("text/plain", entry.id);
                                }}
                                ondragend={() => { dragId = ""; dragOverCol = null; }}
                            >
                                <label class="glean-kcard__select" title={t(i18n, "library.selectArticle")}>
                                    <input type="checkbox" checked={selection.has(entry.id)} aria-label={t(i18n, "library.selectArticle")} onclick={(event) => event.stopPropagation()} onchange={(event) => toggleSelect(entry.id, event)} />
                                </label>
                                <button type="button" class="glean-kcard__t" aria-label={articleActionLabel(entry.title)} title={`${entry.title || t(i18n, "panel.untitled")}（右键呼出原生菜单）`} onclick={() => openDoc(entry.id)} oncontextmenu={(e) => void openDocContextMenu(e, entry)}>{entry.title || t(i18n, "panel.untitled")}</button>
                                <div class="glean-kcard__m">
                                    {#if entry.site || isWechatEntry(entry)}<span class="glean-meta-icon">{siteDisplayLabel(entry)}</span>{/if}
                                    {#if entry.minutes > 0}<span>· {t(i18n, "panel.minutes", { n: entry.minutes })}</span>{/if}
                                </div>
                                <div class="glean-kcard__foot">
                                    <ClipStatusActions
                                        {i18n}
                                        status={entry.status || "inbox"}
                                        contentType={entry.contentType}
                                        url={entry.url}
                                        disabled={Boolean(statusActionId)}
                                        onStartReading={() => void startReading(entry)}
                                        onSetStatus={(status) => void setStatus(entry, status)}
                                        onArchive={() => facade.openArchiveDialog(entry.id)}
                                        onRestore={() => facade.openRestoreDialog(entry.id)}
                                    />
                                    <div class="glean-kcard__more">
                                        <ActionPopover label={t(i18n, "library.moreActions")} compact>
                                            <button class="glean-btn glean-btn--ghost" onclick={() => selectPreview(entry.id)}>{t(i18n, "library.keyboardView")}</button>
                                            <button class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={() => facade.openUnregisterDialog?.(entry.id)}>{t(i18n, "action.unregister")}</button>
                                        </ActionPopover>
                                    </div>
                                </div>
                            </div>
                        {/each}
                        {#if col.totalCount !== undefined && col.items.length < col.totalCount}
                            <div class="glean-kcol__more">
                                <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm glean-kcol__more-btn" onclick={() => loadMoreCol(col.status)}>{t(i18n, "library.loadMore")}</button>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
            {#if hasMoreKanban}
                <div class="glean-list-more" role="status">
                    <span>{t(i18n, "library.renderedCount", { shown: renderedKanbanCount, total: totalKanbanCount })}</span>
                    <button class="glean-btn glean-btn--ghost" onclick={loadMoreRows}>{t(i18n, "library.loadMore")}</button>
                </div>
            {/if}
        {:else if !facade.isMobile && isTabCanvas && layoutMode === "list"}
            <div
                class="glean-lib glean-gm-lib-sheet"
                class:glean-lib--preview={previewEnabled}
                class:glean-lib--has-facet-rail={facetRailOpen}
                style="--glean-rail-w: {railWidth}px; --glean-preview-rail-width: {facetRailOpen && !railCollapsed ? railWidth : 0}px;"
                bind:this={previewSplit}
            >
                {#if facetRailOpen}
                    <aside class="glean-rail" hidden={railCollapsed} aria-label={t(i18n, "rail.title")}>
                        <div class="glean-rail__toolbar" role="toolbar" aria-label={t(i18n, "rail.title")}>
                            <span class="glean-rail__toolbar-title">{t(i18n, "rail.title")}</span>
                            <div class="glean-rail__toolbar-actions">
                                <button type="button" class="glean-icon-btn glean-icon-btn--sm" class:glean-icon-btn--active={railAccordion} aria-pressed={railAccordion} title={t(i18n, railAccordion ? "rail.accordionOn" : "rail.accordionOff")} aria-label={t(i18n, railAccordion ? "rail.accordionOn" : "rail.accordionOff")} onclick={toggleAccordion}><svg aria-hidden="true"><use href="#iconGleanAccordion" /></svg></button>
                                <button type="button" class="glean-icon-btn glean-icon-btn--sm" title={t(i18n, "rail.collapseAll")} aria-label={t(i18n, "rail.collapseAll")} onclick={collapseAllGroups}><svg aria-hidden="true"><use href="#iconGleanCollapseAll" /></svg></button>
                                <button type="button" class="glean-icon-btn glean-icon-btn--sm" title={t(i18n, "rail.expandAll")} aria-label={t(i18n, "rail.expandAll")} onclick={expandAllGroups}><svg aria-hidden="true"><use href="#iconGleanExpandAll" /></svg></button>
                                <button type="button" class="glean-icon-btn glean-icon-btn--sm" title={t(i18n, "rail.collapseRail")} aria-label={t(i18n, "rail.collapseRail")} onclick={() => { facetRailOpen = false; }}><svg aria-hidden="true"><use href="#iconGleanArrowLeft" /></svg></button>
                            </div>
                        </div>
                        <LibraryRailGroup plugin={facade.pluginInstance} {i18n} group="queues" label={t(i18n, "rail.queues")} items={queues.map((queue) => ({ value: queue, count: queueCount(queue) }))} selected={authorTimeline ? "" : activeQueue} itemLabel={(value) => queueLabel(value as ClipStatus)} dotClass={(value) => statusDotClass(value as ClipStatus)} onSelect={(value) => selectQueue(value as ClipStatus)} groupPrefs={railGroups.queues} onToggleGroup={handleToggleRailGroup} />
                        {#if railStats.authors.length > 0 || selectedAuthor}
                            <LibraryRailGroup plugin={facade.pluginInstance} {i18n} group="authors" label={t(i18n, "rail.authors")} items={railStats.authors} selected={selectedAuthor} dotClass={authorDotClass} onSelect={selectAuthor} groupPrefs={railGroups.authors} onToggleGroup={handleToggleRailGroup} onContextMenu={(e, item) => handleRailItemContextMenu(e, "authors", item.value)} />
                        {/if}
                        {#if railStats.sites.length > 0 || selectedSite}
                            <LibraryRailGroup plugin={facade.pluginInstance} {i18n} group="sites" label={t(i18n, "rail.sites")} items={railStats.sites} selected={selectedSite} itemLabel={siteItemLabel} onSelect={(value) => { markPrefsInteraction(); selectedSite = selectedSite.toLocaleLowerCase() === value.toLocaleLowerCase() ? "" : value; }} groupPrefs={railGroups.sites} onToggleGroup={handleToggleRailGroup} onContextMenu={(e, item) => handleRailItemContextMenu(e, "sites", item.value)} />
                        {/if}
                        {#if railStats.tags.length > 0 || selectedTag}
                            <LibraryRailGroup plugin={facade.pluginInstance} {i18n} group="tags" label={t(i18n, "rail.tags")} prefix="#" items={railStats.tags} selected={selectedTag} itemLabel={aliasForTag} onSelect={(value) => { markPrefsInteraction(); selectedTag = selectedTag.toLocaleLowerCase() === value.toLocaleLowerCase() ? "" : value; }} groupPrefs={railGroups.tags} onToggleGroup={handleToggleRailGroup} onContextMenu={(e, item) => handleRailItemContextMenu(e, "tags", item.value)} />
                        {/if}
                        {#if railStats.aiTags.length > 0 || selectedAiTag}
                            <LibraryRailGroup plugin={facade.pluginInstance} {i18n} group="aiTags" label={`✨ ${t(i18n, "rail.aiTags")}`} hint={t(i18n, "library.filterAiTagHint")} prefix="✨" items={railStats.aiTags} selected={selectedAiTag} onSelect={(value) => { markPrefsInteraction(); selectedAiTag = selectedAiTag.toLocaleLowerCase() === value.toLocaleLowerCase() ? "" : value; }} groupPrefs={railGroups.aiTags} onToggleGroup={handleToggleRailGroup} onContextMenu={(e, item) => handleRailItemContextMenu(e, "aiTags", item.value)} />
                        {/if}
                    </aside>
                    {#if !railCollapsed}
                        <input
                            type="range"
                            class="glean-rail-separator"
                            min={MIN_RAIL_WIDTH}
                            max={MAX_RAIL_WIDTH}
                            step="1"
                            value={railWidth}
                            aria-label={t(i18n, "rail.resizeHandle")}
                            oninput={(event) => { railWidth = clampRailWidth(Number(event.currentTarget.value)); void saveUiPrefs(facade.pluginInstance, { railWidth }); }}
                            ondblclick={resetRailWidth}
                            onpointerdown={startRailResize}
                            onpointermove={resizeRail}
                            onpointerup={(e) => finishRailResize(e)}
                            onpointercancel={(e) => finishRailResize(e, true)}
                            onlostpointercapture={(e) => finishRailResize(e)}
                            onkeydown={railResizeKey}
                        />
                    {/if}
                {/if}
                <div class="glean-lib__main glean-gm-list-pane">
                    {#if rows.length === 0}
                        <div class="glean-empty" role="status">
                            <div class="glean-empty__art">
                                {#if !hasFilters && resolveEffectiveMotion().mascot}
                                    {@html lvMascot("carry", { class: "glean-empty__mascot" })}
                                {:else}
                                    <svg aria-hidden="true"><use href="#iconGleanWheat" /></svg>
                                {/if}
                            </div>
                            <div class="glean-empty__title">{t(i18n, hasFilters ? "library.noMatch" : "panel.empty")}</div>
                            <div class="glean-empty__hint">
                                {facade.settings.anchorNotebooks.length === 0
                                    ? t(i18n, "panel.noAnchorHint")
                                    : t(i18n, "panel.emptyHint")}
                            </div>
                            {#if facade.settings.anchorNotebooks.length === 0}
                                <div class="glean-empty__actions">
                                    <button class="glean-btn glean-btn--pri" onclick={() => facade.openOnboarding()}>{t(i18n, "panel.openOnboarding")}</button>
                                    <button class="glean-btn glean-btn--ghost" onclick={() => facade.openSettings()}>{t(i18n, "panel.setupAnchor")}</button>
                                </div>
                            {:else if !hasFilters && totalClips === 0}
                                <div class="glean-empty__quick-cards" role="region" aria-label={t(i18n, "library.quickStart")}>
                                    <button type="button" class="glean-empty__card" disabled={seedingDemoArticles} onclick={() => void handleSeedDemoArticles()}>
                                        <div class="glean-empty__card-icon"><svg class="glean-icon"><use href="#iconGleanNews" /></svg></div>
                                        <div class="glean-empty__card-text">
                                            <div class="glean-empty__card-title">{t(i18n, "library.seedDemoTitle")}</div>
                                            <div class="glean-empty__card-desc">{t(i18n, "library.seedDemoDesc")}</div>
                                        </div>
                                    </button>
                                    <button type="button" class="glean-empty__card" onclick={() => facade.openImport()}>
                                        <div class="glean-empty__card-icon"><svg class="glean-icon"><use href="#iconGleanDownload" /></svg></div>
                                        <div class="glean-empty__card-text">
                                            <div class="glean-empty__card-title">{t(i18n, "library.importBookmarksTitle")}</div>
                                            <div class="glean-empty__card-desc">{t(i18n, "library.importBookmarksDesc")}</div>
                                        </div>
                                    </button>
                                    <button type="button" class="glean-empty__card" onclick={() => facade.openOnboarding()}>
                                        <div class="glean-empty__card-icon"><svg class="glean-icon"><use href="#iconGleanWheat" /></svg></div>
                                        <div class="glean-empty__card-text">
                                            <div class="glean-empty__card-title">{t(i18n, "library.onboardingGuideTitle")}</div>
                                            <div class="glean-empty__card-desc">{t(i18n, "library.onboardingGuideDesc")}</div>
                                        </div>
                                    </button>
                                </div>
                                <div class="glean-empty__actions">
                                    <button class="glean-btn glean-btn--pri" onclick={() => facade.openOnboarding()}>{t(i18n, "panel.openOnboarding")}</button>
                                </div>
                            {:else if hasFilters}
                                <button class="glean-btn glean-btn--ghost glean-empty__clear-btn" onclick={clearUserFilters}>{t(i18n, "library.clearFilters")}</button>
                            {/if}
                        </div>
                    {:else}
                        <div class="glean-dtable glean-gm-dtable">
                            {#each visibleRows as entry (entry.id)}
                                {#if entry.kind === "clip"}
                                    {@const badge = matchBadge(entry)}
                                    {@const pct = entryProgressPct(entry)}
                                    {@const dateStr = entryDateLabel(entry)}
                                    <div
                                        class="glean-drow glean-gm-row"
                                        data-glean-clip-id={entry.id}
                                        class:glean-drow--selected={selection.has(entry.id)}
                                        class:glean-drow--preview={previewId === entry.id}
                                        class:is-selected={previewId === entry.id}
                                        class:glean-drow--cursor={keyboardCursorId === entry.id}
                                        aria-current={keyboardCursorId === entry.id ? "true" : undefined}
                                    >
                                        {#if batchMode || selection.size > 0}
                                            <label class="glean-drow__select" title={t(i18n, "library.selectArticle")}>
                                                <input type="checkbox" checked={selection.has(entry.id)} aria-label={t(i18n, "library.selectArticle")} onclick={(event) => event.stopPropagation()} onchange={(event) => toggleSelect(entry.id, event)} />
                                            </label>
                                        {/if}
                                        <div class="glean-drow__body">
                                            <button type="button" class="glean-drow__ti" aria-label={articleActionLabel(entry.title, true)} title={`${entry.title || t(i18n, "panel.untitled")}（右键呼出原生菜单）`} onclick={() => selectPreview(entry.id)} oncontextmenu={(e) => void openDocContextMenu(e, entry)}>{entry.title || t(i18n, "panel.untitled")}</button>
                                            <div class="glean-drow__meta glean-gm-row-sub">
                                                {#if badge}
                                                    <span class="glean-badge glean-badge--match" title={badge}>{badge}</span>
                                                {/if}
                                                <span class="glean-drow__site" title={entry.site || sourceFallback(entry)}>
                                                    <button type="button" class="glean-source-site" onclick={(event) => { event.stopPropagation(); handleSiteClick(entry); }}>{siteDisplayLabel(entry)}</button>{#if displayWechatAuthor(entry.author)}<button class="glean-source-author" onclick={(event) => { event.stopPropagation(); selectAuthor(entry.author!); }}>· {displayWechatAuthor(entry.author)}</button>{/if}
                                                </span>
                                                {#if entry.minutes > 0}
                                                    <span>· {t(i18n, "panel.minutes", { n: entry.minutes })}</span>
                                                {/if}
                                                {#if pct > 0 && entry.status !== "archived"}
                                                    <span class="glean-gm-mini-progress" title={`${pct}%`}>
                                                        <span class="glean-gm-mini-track"><span class="glean-gm-mini-fill" style="width:{pct}%;"></span></span>
                                                        <span>{pct}%</span>
                                                    </span>
                                                {:else if entry.status === "inbox"}
                                                    <span class="glean-gm-pill glean-gm-pill--accent">{t(i18n, "status.inbox")}</span>
                                                {:else if entry.status === "done"}
                                                    <span class="glean-gm-pill glean-gm-pill--fresh">{t(i18n, "status.done")}</span>
                                                {/if}
                                                {#if dateStr}<span>· {dateStr}</span>{/if}
                                            </div>
                                        </div>
                                        <div class="glean-drow__ops">
                                            {#if navBucket === "triage"}
                                                <button type="button" class="glean-btn glean-gm-btn glean-gm-btn--primary" disabled={Boolean(statusActionId)} onclick={(event) => { event.stopPropagation(); void setStatus(entry, "later"); }}>{t(i18n, "library.moveToReadingList")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={(event) => { event.stopPropagation(); facade.openUnregisterDialog?.(entry.id); }}>{t(i18n, "action.unregister")}</button>
                                            {:else if entry.status === "archived"}
                                                <button type="button" class="glean-btn glean-gm-btn" disabled={Boolean(statusActionId)} onclick={(event) => { event.stopPropagation(); void startReading(entry); }}>{t(i18n, "action.readAgain")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={(event) => { event.stopPropagation(); facade.openRestoreDialog(entry.id); }}>{t(i18n, "library.restoreToReadingList")}</button>
                                            {:else}
                                                <button type="button" class="glean-btn glean-gm-btn glean-gm-btn--primary" disabled={Boolean(statusActionId)} onclick={(event) => { event.stopPropagation(); void startReading(entry); }}>{primaryActionLabel(entry)}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost glean-drow__done-btn" disabled={Boolean(statusActionId) || entry.status === "done"} title={t(i18n, "action.markDoneHint")} onclick={(event) => { event.stopPropagation(); void setStatus(entry, "done"); }}>{t(i18n, "action.markDone")}</button>
                                            {/if}
                                            <ActionPopover label={t(i18n, "library.moreActions")} compact>
                                                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => openDoc(entry.id)}>{t(i18n, "library.enterReader")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => { selectPreview(entry.id); fullPreviewMode = true; }}>{t(i18n, "library.previewProtyleToggle")}</button>
                                                {#if hasSourceAction(entry.contentType, entry.url)}
                                                    <button type="button" class="glean-btn glean-btn--ghost" onclick={() => openSource(entry)}>{t(i18n, "clip.openSource")}</button>
                                                {/if}
                                                <div class="glean-gm-popover-sep"></div>
                                                {#if entry.status !== "archived"}
                                                    <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId) || entry.status === "later"} onclick={() => void setStatus(entry, "later")}>{t(i18n, "action.moveToLater")}</button>
                                                    <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={() => facade.openArchiveDialog(entry.id)}>{t(i18n, "action.archive")}</button>
                                                {/if}
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={() => facade.openUnregisterDialog?.(entry.id)}>{t(i18n, "action.unregister")}</button>
                                                <div class="glean-gm-popover-sep"></div>
                                                <AuthorEditor {facade} docId={entry.id} onSaved={reload} />
                                                {#if isWechatEntry(entry) && !displayWechatAuthor(entry.author)}
                                                    <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={() => void recognizeSingleWechatAuthor(entry)}>{t(i18n, "wechat.recognizeSingle")}</button>
                                                {/if}
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={() => void setPriority(entry, cyclePriorityValue(entry.priority))}>{t(i18n, "action.priority")}: {entry.priority ? `P${entry.priority}` : "-"}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={() => void setRating(entry, cycleRatingValue(entry.rating))}>{t(i18n, "action.rating")}: {entry.rating ? `${entry.rating}★` : "-"}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={() => void toggleEntryFavorite(entry)}>{entry.favorite ? t(i18n, "roaming.favoriteRemoved") : t(i18n, "roaming.favoriteAction")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} aria-pressed={isPinnedToday(entry)} onclick={() => void toggleSurfacePin(entry)}>{surfacePinLabel(entry)}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={snappingId === entry.id} onclick={() => void takeSnapshot(entry)} title={snapshotLabel(entry)} aria-label={snapshotLabel(entry)}>{snapshotLabel(entry)}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(exportingMarkdownId)} aria-busy={exportingMarkdownId === entry.id} onclick={() => void exportMarkdown(entry)}>{t(i18n, "export.markdown")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={enrichingId === entry.id} onclick={() => void enrich(entry)}>{t(i18n, "ai.actionEnrich")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyEntryBlockRef(entry)}>{t(i18n, "action.copyBlockRef")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyEntryCitation(entry, "gbt")}>{t(i18n, "citation.copyGBT")}</button>
                                                <details class="glean-citation-more" data-keep-popover-open>
                                                    <summary class="glean-btn glean-btn--ghost" data-keep-popover-open>BibTeX / APA / MLA</summary>
                                                    <div class="glean-citation-more__list">
                                                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyEntryCitation(entry, "bibtex")}>{t(i18n, "citation.copyBibTeX")}</button>
                                                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyEntryCitation(entry, "apa")}>{t(i18n, "citation.copyAPA")}</button>
                                                        <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyEntryCitation(entry, "mla")}>{t(i18n, "citation.copyMLA")}</button>
                                                    </div>
                                                </details>
                                            </ActionPopover>
                                        </div>
                                    </div>
                                {:else}
                                    <div
                                        class="glean-drow glean-gm-row glean-drow--candidate"
                                        data-glean-clip-id={entry.id}
                                        class:glean-drow--preview={previewId === entry.id}
                                        class:is-selected={previewId === entry.id}
                                        class:glean-drow--cursor={keyboardCursorId === entry.id}
                                        aria-current={keyboardCursorId === entry.id ? "true" : undefined}
                                    >
                                        <div class="glean-drow__body">
                                            <button type="button" class="glean-drow__ti" aria-label={articleActionLabel(entry.title, true)} title={`${entry.title || t(i18n, "panel.untitled")}（右键呼出原生菜单）`} onclick={() => selectPreview(entry.id)} oncontextmenu={(e) => void openDocContextMenu(e, entry)}>{entry.title || t(i18n, "panel.untitled")}</button>
                                            <div class="glean-drow__meta glean-gm-row-sub">
                                                <span class="glean-gm-pill glean-gm-pill--accent">{t(i18n, "candidate.pending")}</span>
                                                <span class="glean-drow__site" title={entry.url || entry.hpath}>{entry.site || candidateEvidence(entry)}</span>
                                                {#if candidateMissing(entry)}<span>· {candidateMissing(entry)}</span>{/if}
                                            </div>
                                        </div>
                                        <div class="glean-drow__ops">
                                            {#if entry.url}
                                                <button type="button" class="glean-btn glean-gm-btn glean-gm-btn--primary" disabled={Boolean(candidateBusyId)} aria-busy={candidateBusyId === entry.id} onclick={(e) => { e.stopPropagation(); void capture(entry); }}>{t(i18n, "action.addToLibrary")}</button>
                                            {:else}
                                                <button type="button" class="glean-btn glean-gm-btn glean-gm-btn--primary" disabled={Boolean(candidateBusyId)} onclick={(e) => { e.stopPropagation(); void captureAsLocal(entry); }}>{t(i18n, "candidate.captureLocal")}</button>
                                            {/if}
                                            <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(candidateBusyId)} onclick={(e) => { e.stopPropagation(); void excludeCandidate(entry); }}>{t(i18n, "candidate.exclude")}</button>
                                            <button type="button" class="glean-op-btn" disabled={Boolean(candidateBusyId)} title={t(i18n, "candidate.fixUrl")} aria-label={t(i18n, "candidate.fixUrl")} onclick={(e) => { e.stopPropagation(); startCandidateUrlEdit(entry); }}><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanEdit" /></svg></button>
                                        </div>
                                    </div>
                                    {#if editingCandidateId === entry.id}
                                        <div class="glean-candidate-edit">
                                            <input class="b3-text-field" type="url" bind:value={candidateUrlInput} placeholder={t(i18n, "candidate.urlPlaceholder")} aria-label={t(i18n, "candidate.urlPlaceholder")} />
                                            <button class="glean-btn" disabled={Boolean(candidateBusyId)} aria-busy={candidateBusyId === entry.id} onclick={() => void saveCandidateUrl(entry)}>{t(i18n, "action.save")}</button>
                                            <button class="glean-btn glean-btn--ghost" onclick={() => (editingCandidateId = "")}>{t(i18n, "action.cancel")}</button>
                                        </div>
                                    {/if}
                                {/if}
                            {/each}
                        </div>
                        {#if hasMoreRows}
                            <div class="glean-list-more" role="status">
                                <span>{t(i18n, "library.renderedCount", { shown: visibleRows.length, total: rows.length })}</span>
                                <button class="glean-btn glean-btn--ghost" onclick={loadMoreRows}>{t(i18n, "library.loadMore")}</button>
                            </div>
                        {/if}
                    {/if}
                </div>
                {#if previewEnabled && !facade.isMobile}
                    <aside class="glean-preview-pane glean-gm-preview-pane" style:--glean-preview-ratio={previewRatio} aria-label={t(i18n, "library.previewOverview")}>
                        {#if previewEntry}
                            {#if fullPreviewMode}
                                <div class="glean-gm-preview-full-bar">
                                    <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" onclick={() => { fullPreviewMode = false; }}>← {t(i18n, "library.previewBackSummary")}</button>
                                    <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" onclick={closePreview}>{t(i18n, "preview.close")}</button>
                                </div>
                                {#key previewId}
                                    <WorkbenchPreview {facade} entry={previewEntry} widen={previewWiden} onToggleWiden={() => { previewWiden = !previewWiden; }} onClose={closePreview} onProcessed={processedCallback(previewId, previewRevision)} onRefresh={reload} onFilterAuthor={selectAuthor} />
                                {/key}
                            {:else}
                                <div class="glean-gm-preview-card">
                                    <div class="glean-gm-preview-eyebrow">
                                        <span>{t(i18n, "library.previewOverview")}</span>
                                        <span class="glean-gm-pill">{previewEntry.kind === "candidate" ? t(i18n, "candidate.pending") : queueLabel(previewEntry.status)}</span>
                                    </div>
                                    <h4 class="glean-gm-preview-title">{previewEntry.title || t(i18n, "panel.untitled")}</h4>
                                    <div class="glean-gm-preview-meta">
                                        <span>{previewEntry.kind === "clip" ? siteDisplayLabel(previewEntry) : (previewEntry.site || candidateEvidence(previewEntry))}</span>
                                        {#if previewEntry.kind === "clip" && previewEntry.minutes > 0}<span>· {t(i18n, "panel.minutes", { n: previewEntry.minutes })}</span>{/if}
                                        {#if previewEntry.kind === "clip" && previewEntry.words > 0}<span>· {t(i18n, "panel.words", { n: previewEntry.words })}</span>{/if}
                                        {#if previewEntry.kind === "clip" && previewEntry.author}<span>· {previewEntry.author}</span>{/if}
                                    </div>
                                    <div class="glean-gm-preview-box">
                                        <b>{t(i18n, "library.previewSummaryLabel")}</b>
                                        <p>{(previewEntry.kind === "clip" && previewEntry.summary) ? previewEntry.summary : t(i18n, "library.previewNoSummary")}</p>
                                    </div>
                                    {#if previewEntry.kind === "clip"}
                                        {@const snapHealth = calculateSnapshotHealth(previewEntry)}
                                        <div class="glean-gm-preview-box glean-gm-preview-box--white">
                                            {#if previewEntry.tags && previewEntry.tags.length > 0}
                                                <div class="glean-gm-preview-tags">
                                                    {#each previewEntry.tags.slice(0, 6) as tg}<span class="glean-gm-pill">#{aliasForTag(tg)}</span>{/each}
                                                </div>
                                            {/if}
                                            <div class="glean-gm-preview-meta">
                                                {#if previewEntry.priority}<span>{t(i18n, "action.priority")} P{previewEntry.priority}</span>{/if}
                                                {#if previewEntry.rating}<span>{t(i18n, "action.rating")} {previewEntry.rating}★</span>{/if}
                                                <span class="glean-snap-badge glean-snap-badge--{snapHealth.grade}" title={t(i18n, "snapshotHealth.scoreBadgeTitle", { label: t(i18n, snapHealth.labelKey), desc: t(i18n, snapHealth.descKey), score: snapHealth.score })}>{t(i18n, snapHealth.labelKey)} {snapHealth.score}</span>
                                            </div>
                                        </div>
                                    {/if}
                                    <div class="glean-gm-preview-actions">
                                        {#if previewEntry.kind === "candidate"}
                                            {#if previewEntry.url}
                                                <button type="button" class="glean-btn glean-gm-btn glean-gm-btn--primary" onclick={() => void capture(previewEntry)}>{t(i18n, "action.addToLibrary")}</button>
                                            {:else}
                                                <button type="button" class="glean-btn glean-gm-btn glean-gm-btn--primary" onclick={() => void captureAsLocal(previewEntry)}>{t(i18n, "candidate.captureLocal")}</button>
                                            {/if}
                                            <button type="button" class="glean-btn glean-gm-btn" onclick={() => { fullPreviewMode = true; }}>{t(i18n, "library.previewProtyleToggle")}</button>
                                        {:else}
                                            <button type="button" class="glean-btn glean-gm-btn glean-gm-btn--primary" onclick={() => void startReading(previewEntry)}>{t(i18n, "library.enterReader")}</button>
                                            <button type="button" class="glean-btn glean-gm-btn" onclick={() => { fullPreviewMode = true; }}>{t(i18n, "library.previewProtyleToggle")}</button>
                                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => facade.openUnregisterDialog?.(previewEntry.id)}>{t(i18n, "action.unregister")}</button>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        {:else}
                            <div class="glean-gm-preview-card">
                                <div class="glean-gm-preview-eyebrow">
                                    <span>{t(i18n, "library.previewEmptyTitle")}</span>
                                    {#if dailySummary.picks.length > 0}<span class="glean-gm-pill">{dailySummary.picks.length}</span>{/if}
                                </div>
                                <p class="glean-gm-preview-desc">{t(i18n, "library.previewEmptyDesc")}</p>
                                {#if dailySummary.picks.length > 0}
                                    <div class="glean-gm-picks-list">
                                        {#each dailySummary.picks.slice(0, 2) as pick (pick.item.id)}
                                            <div class="glean-gm-pick-card">
                                                <button type="button" class="glean-gm-pick-title" onclick={() => openDoc(pick.item.id)}>{pick.item.title || t(i18n, "panel.untitled")}</button>
                                                <div class="glean-gm-preview-meta">
                                                    {#if pick.item.site}<span>{pick.item.site}</span>{/if}
                                                    {#if (pick.item.minutes ?? 0) > 0}<span>· {t(i18n, "panel.minutes", { n: pick.item.minutes ?? 0 })}</span>{/if}
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                                <div class="glean-gm-preview-actions">
                                    <button type="button" class="glean-btn glean-gm-btn" onclick={triggerRoamingRead}>{t(i18n, "roaming.button")}</button>
                                    <button type="button" class="glean-btn glean-btn--ghost" onclick={() => openStatsAndTools("resurface")}>{t(i18n, "stats.tabResurface")} →</button>
                                </div>
                            </div>
                        {/if}
                    </aside>
                {/if}
            </div>
            <div class="glean-gm-footer-note">
                <span>{t(i18n, "library.footerHint")}</span>
                <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" onclick={() => facade.openUnregisteredDocsDialog?.()}>
                    {t(i18n, "unregister.entryButton")}{#if unregisteredCount > 0} ({unregisteredCount}){/if} →
                </button>
            </div>
        {:else}
            <div class="glean-list">
                {#if facade.isMobile}
                    <div class="glean-mobile-list-banners">
                        {#if filterChips.length > 0}
                            <div class="glean-filter-chips" aria-label={t(i18n, "library.filters")}>
                                {#each filterChips as chip (chip.key)}
                                    <button class="glean-filter-chip" title={filterChipText(chip.key, chip.value)} aria-label={t(i18n, "library.removeFilter", { name: filterChipText(chip.key, chip.value) })} onclick={() => removeFilterChip(chip.key)}><span class="glean-filter-chip__label">{filterChipText(chip.key, chip.value)}</span><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg></button>
                                {/each}
                            </div>
                        {/if}
                        {@render libraryContextBanners()}
                    </div>
                {/if}
                {#if rows.length === 0}
                    <div class="glean-empty" role="status">
                        <div class="glean-empty__art"><svg aria-hidden="true"><use href="#iconGleanWheat" /></svg></div>
                        <div class="glean-empty__title">{t(i18n, hasFilters ? "library.noMatch" : "panel.empty")}</div>
                        <div class="glean-empty__hint">
                            {facade.settings.anchorNotebooks.length === 0 ? t(i18n, "panel.noAnchorHint") : t(i18n, "panel.emptyHint")}
                        </div>
                        {#if facade.settings.anchorNotebooks.length === 0}
                            <div class="glean-empty__actions">
                                <button class="glean-btn glean-btn--pri glean-empty__action" onclick={() => facade.openOnboarding()}>{t(i18n, "panel.openOnboarding")}</button>
                                <button class="glean-btn glean-btn--ghost glean-empty__action" onclick={() => facade.openSettings()}>{t(i18n, "panel.setupAnchor")}</button>
                            </div>
                        {:else if !hasFilters && totalClips === 0}
                            <div class="glean-empty__actions">
                                <button class="glean-btn glean-btn--pri glean-empty__action" onclick={() => facade.openOnboarding()}>{t(i18n, "panel.openOnboarding")}</button>
                            </div>
                        {:else if hasFilters}
                            <button class="glean-btn glean-btn--ghost glean-empty__action" onclick={clearUserFilters}>{t(i18n, "library.clearFilters")}</button>
                        {/if}
                    </div>
                {:else}
                    {#each visibleRows as entry (entry.id)}
                        {@const badge = matchBadge(entry)}
                        <article
                            class="glean-card glean-gm-card"
                            data-glean-clip-id={entry.id}
                            class:glean-card--candidate={entry.kind === "candidate"}
                            class:glean-card--selected={selection.has(entry.id)}
                            class:glean-card--cursor={keyboardCursorId === entry.id}
                            aria-current={keyboardCursorId === entry.id ? "true" : undefined}
                        >
                            <div class="glean-card__body">
                                <button type="button" class="glean-card__title" aria-label={articleActionLabel(entry.title, true)} title={`${entry.title || t(i18n, "panel.untitled")}（右键呼出原生菜单）`} onclick={() => selectPreview(entry.id)} oncontextmenu={(e) => void openDocContextMenu(e, entry)}>{entry.title || t(i18n, "panel.untitled")}</button>
                                <div class="glean-card__meta">
                                    {#if badge}<span class="glean-badge glean-badge--match" title={badge}>{badge}</span>{/if}
                                    {#if entry.kind === "clip"}
                                        <button type="button" class="glean-card__site glean-card__site-btn" onclick={(event) => { event.stopPropagation(); handleSiteClick(entry); }}>{siteDisplayLabel(entry)}</button>
                                        {#if entry.minutes > 0}<span>· {t(i18n, "panel.minutes", { n: entry.minutes })}</span>{/if}
                                    {:else}
                                        <span>{entry.site || candidateEvidence(entry)}</span>
                                    {/if}
                                </div>
                            </div>
                            {#if entry.kind === "candidate"}
                                <div class="glean-card__ops">
                                    {#if entry.url}
                                        <button type="button" class="glean-btn glean-btn--pri glean-btn--sm" disabled={Boolean(candidateBusyId)} onclick={() => void capture(entry)}>{t(i18n, "action.addToLibrary")}</button>
                                    {:else}
                                        <button type="button" class="glean-btn glean-btn--pri glean-btn--sm" disabled={Boolean(candidateBusyId)} onclick={() => void captureAsLocal(entry)}>{t(i18n, "candidate.captureLocal")}</button>
                                    {/if}
                                    <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" disabled={Boolean(candidateBusyId)} onclick={() => void excludeCandidate(entry)}>{t(i18n, "candidate.exclude")}</button>
                                    <button type="button" class="glean-op-btn" disabled={Boolean(candidateBusyId)} title={t(i18n, "candidate.fixUrl")} aria-label={t(i18n, "candidate.fixUrl")} onclick={(e) => { e.stopPropagation(); startCandidateUrlEdit(entry); }}><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanEdit" /></svg></button>
                                </div>
                                {#if editingCandidateId === entry.id}
                                    <div class="glean-candidate-edit">
                                        <input class="b3-text-field" type="url" bind:value={candidateUrlInput} placeholder={t(i18n, "candidate.urlPlaceholder")} aria-label={t(i18n, "candidate.urlPlaceholder")} />
                                        <button type="button" class="glean-btn glean-btn--sm" disabled={Boolean(candidateBusyId)} aria-busy={candidateBusyId === entry.id} onclick={() => void saveCandidateUrl(entry)}>{t(i18n, "action.save")}</button>
                                        <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" onclick={() => (editingCandidateId = "")}>{t(i18n, "action.cancel")}</button>
                                    </div>
                                {/if}
                            {:else}
                                <div class="glean-card__foot">
                                    <div class="glean-card__foot-left">
                                        <span class="glean-gm-pill">{queueLabel(entry.status)}</span>
                                    </div>
                                    <div class="glean-card__foot-right">
                                        {#if navBucket === "triage"}
                                            <button type="button" class="glean-btn glean-btn--pri glean-btn--sm" disabled={Boolean(statusActionId)} onclick={(event) => { event.stopPropagation(); void setStatus(entry, "later"); }}>{t(i18n, "library.moveToReadingList")}</button>
                                        {:else if entry.status === "archived"}
                                            <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" disabled={Boolean(statusActionId)} onclick={(event) => { event.stopPropagation(); facade.openRestoreDialog(entry.id); }}>{t(i18n, "library.restoreToReadingList")}</button>
                                        {:else}
                                            <button type="button" class="glean-btn glean-btn--pri glean-btn--sm" disabled={Boolean(statusActionId)} onclick={(event) => { event.stopPropagation(); void startReading(entry); }}>{primaryActionLabel(entry)}</button>
                                        {/if}
                                        <ActionPopover label={t(i18n, "library.moreActions")} compact>
                                            {#if entry.status !== "archived"}
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId) || entry.status === "done"} onclick={() => void setStatus(entry, "done")}>{t(i18n, "action.markDone")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={() => facade.openArchiveDialog(entry.id)}>{t(i18n, "action.archive")}</button>
                                            {/if}
                                            <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(statusActionId)} onclick={() => facade.openUnregisterDialog?.(entry.id)}>{t(i18n, "action.unregister")}</button>
                                            {#if hasSourceAction(entry.contentType, entry.url)}
                                                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => openSource(entry)}>{t(i18n, "clip.openSource")}</button>
                                            {/if}
                                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyEntryBlockRef(entry)}>{t(i18n, "action.copyBlockRef")}</button>
                                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyEntryCitation(entry, "gbt")}>{t(i18n, "citation.copyGBT")}</button>
                                        </ActionPopover>
                                        {#if entry.kind === "clip" && (batchMode || selection.size > 0)}
                                            <label class="glean-card__check" title={t(i18n, "library.selectArticle")}>
                                                <input type="checkbox" checked={selection.has(entry.id)} aria-label={t(i18n, "library.selectArticle")} onclick={(event) => event.stopPropagation()} onchange={(e) => toggleSelect(entry.id, e)} />
                                            </label>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </article>
                    {/each}
                {/if}
            </div>
            {#if hasMoreRows}
                <div class="glean-list-more" role="status">
                    <span>{t(i18n, "library.renderedCount", { shown: visibleRows.length, total: rows.length })}</span>
                    <button class="glean-btn glean-btn--ghost" onclick={loadMoreRows}>{t(i18n, "library.loadMore")}</button>
                </div>
            {/if}
        {/if}

        <LibraryBatchBar
            {i18n}
            {...selectionScope}
            busy={batchBusy}
            onApply={(status) => void batchApply(status)}
            onOpenAi={openSelectedAi}
            onSelectDisplayed={selectDisplayedArticles}
            onKeepFiltered={keepFilteredArticles}
            onClear={clearSelection}
            onAddTag={batchAddTag}
            onSetAuthor={batchSetAuthor}
            {hasWechatSelected}
            onPurifyWechat={batchPurifyWechat}
            onCopyBlockRefs={batchCopyBlockRefs}
            onCopyCitations={batchCopyCitations}
            onCopyBibTeX={batchCopyBibTeX}
            onCopyAPA={batchCopyAPA}
            onCopyMLA={batchCopyMLA}
            onCopySummaryList={batchCopySummaryList}
            onExportCsv={batchExportCsv}
            onBatchFavorite={batchFavorite}
            onBatchPriority={batchSetPriority}
            onBatchRating={batchSetRating}
            {allSelectedAreFavorite}
            computeDiff={computeBatchDiff}
        />
    {:else if view === "resurface" || view === "stats"}
        <div class="glean-gm-tools-shell">
            <header class="glean-gm-lib-header">
                <div class="glean-gm-lib-title-group">
                    <h2 class="glean-gm-heading">{t(i18n, "stats.toolsHubTitle")}</h2>
                    <p class="glean-gm-subheading">{t(i18n, "stats.toolsHubDesc")}</p>
                </div>
                <div class="glean-gm-header-right">
                    <div class="glean-gm-seg" role="tablist" aria-label={t(i18n, "stats.toolsHubTitle")}>
                        <button type="button" role="tab" aria-selected={view === "stats"} class="glean-gm-seg-btn" class:is-active={view === "stats"} onclick={() => openStatsAndTools("stats")}>{t(i18n, "stats.tabReview")}</button>
                        <button type="button" role="tab" aria-selected={view === "resurface"} class="glean-gm-seg-btn" class:is-active={view === "resurface"} onclick={() => openStatsAndTools("resurface")}>{t(i18n, "stats.tabResurface")}</button>
                    </div>
                    <button type="button" class="glean-btn glean-gm-btn" onclick={triggerRoamingRead}>{t(i18n, "roaming.button")}</button>
                    <button type="button" class="glean-btn glean-gm-btn" onclick={() => facade.openMigrate()}>{t(i18n, "panel.migrate")}</button>
                    <button type="button" class="glean-btn glean-gm-btn" onclick={() => facade.openImport()}>{t(i18n, "import.title")}</button>
                </div>
            </header>
            {#if view === "resurface"}
                <ResurfaceView
                    {facade}
                    {index}
                    {currentTime}
                    {loading}
                    {loadError}
                    onRetry={() => void reload()}
                    embedded
                    onMutated={() => void reload()}
                    onQuickCapture={quickCapture}
                    onQuickSearch={openLibrarySearchFromHome}
                    onQuickCandidates={openCandidateQueue}
                    onStartRoaming={triggerRoamingRead}
                    {quickCaptureBusy}
                />
            {:else}
                <StatsView {facade} {index} {currentTime} {loading} {loadError} onRetry={() => void reload()} onCaptured={() => void reload()} />
            {/if}
        </div>
    {:else}
        <HighlightView {facade} />
    {/if}

    {#if facade.isMobile && previewEntry && view === "library"}
        <div class="glean-preview-sheet" bind:this={previewDialog} role="dialog" aria-modal="true" aria-label={t(i18n, "preview.title")} tabindex="-1">
            {#key previewId}
                <WorkbenchPreview {facade} entry={previewEntry} onClose={closePreview} onProcessed={processedCallback(previewId, previewRevision)} onRefresh={reload} onFilterAuthor={selectAuthor} />
            {/key}
        </div>
    {/if}
    {#if facade.isMobile}
        <nav class="glean-mobile-nav" aria-label={t(i18n, "mobile.navLabel")}>
            {#each mobileNavItems as item (item.key)}
                <button
                    type="button"
                    class="glean-mobile-nav__item"
                    class:glean-mobile-nav__item--on={mobileActive === item.key}
                    aria-current={mobileActive === item.key ? "page" : undefined}
                    aria-label={t(i18n, item.labelKey)}
                    onclick={() => selectMobileNav(item.key)}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="fill:none!important;stroke:currentColor!important;" aria-hidden="true">
                        {#if item.key === "triage"}
                            <path d="M4 13h4l2 3h4l2-3h4" fill="none" />
                            <path d="M5 13V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7l-1.5 6a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5L5 13Z" fill="none" />
                        {:else if item.key === "list"}
                            <path d="M4 6h16M4 12h16M4 18h10" fill="none" />
                        {:else if item.key === "highlights"}
                            <path d="m14.5 4.5 5 5L8 21H3v-5L14.5 4.5Z" fill="none" />
                        {:else}
                            <rect x="3" y="4" width="18" height="4" rx="1" fill="none" />
                            <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" fill="none" />
                        {/if}
                    </svg>
                    <span>{t(i18n, item.labelKey)}</span>
                </button>
            {/each}
        </nav>
    {/if}
    {#if captureModalOpen}
        <div class="glean-gm-modal-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeCaptureModal()}>
            <div class="glean-gm-modal" bind:this={captureModalEl} role="dialog" aria-modal="true" aria-labelledby="glean-gm-capture-title" tabindex="-1">
                <header class="glean-gm-modal__head">
                    <b id="glean-gm-capture-title">{t(i18n, "capture.modalTitle")}</b>
                    <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" onclick={closeCaptureModal}>{t(i18n, "action.close")}</button>
                </header>
                <div class="glean-gm-modal__body">
                    <p class="glean-gm-modal__desc">{t(i18n, "capture.modalDesc")}</p>
                    <button type="button" class="glean-btn glean-gm-btn glean-gm-btn--primary" disabled={quickCaptureBusy} onclick={() => void captureCurrentAndClose()}>
                        {t(i18n, "capture.currentDocBtn")}
                    </button>
                    <div class="glean-gm-modal__divider"></div>
                    <input
                        class="b3-text-field"
                        type="url"
                        bind:value={captureUrlInput}
                        placeholder={t(i18n, "capture.urlPlaceholder")}
                        aria-label={t(i18n, "capture.urlPlaceholder")}
                        onkeydown={(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter") { e.preventDefault(); void submitCaptureUrl(); } }}
                    />
                    <input
                        class="b3-text-field"
                        type="text"
                        bind:value={captureTitleInput}
                        placeholder={t(i18n, "panel.untitled")}
                        aria-label={t(i18n, "panel.untitled")}
                    />
                    <div class="glean-gm-modal__foot">
                        <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" onclick={() => { closeCaptureModal(); facade.openImport(); }}>{t(i18n, "import.title")}</button>
                        <div class="glean-gm-modal__foot-right">
                            <button type="button" class="glean-btn glean-btn--ghost" onclick={closeCaptureModal}>{t(i18n, "action.cancel")}</button>
                            <button type="button" class="glean-btn glean-gm-btn glean-gm-btn--primary" disabled={captureUrlBusy || !captureUrlInput.trim()} onclick={() => void submitCaptureUrl()}>{t(i18n, "capture.urlSubmit")}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}
    {#if tagAliasManagerOpen}
        <div class="glean-tag-alias-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeTagAliasManager()}>
            <dialog open class="glean-tag-alias-dialog" bind:this={tagAliasDialog} aria-modal="true" aria-labelledby="glean-tag-alias-title" aria-describedby="glean-tag-alias-help" tabindex="-1">
                <header class="glean-tag-alias-dialog__head">
                    <h2 id="glean-tag-alias-title">{t(i18n, "library.tagAliasManage")}</h2>
                    <button type="button" class="glean-icon-btn" aria-label={t(i18n, "library.filterClose")} onclick={closeTagAliasManager}><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanClose" /></svg></button>
                </header>
                <p id="glean-tag-alias-help" class="glean-tag-alias-dialog__help">{t(i18n, "library.tagAliasHelp")}</p>
                {#if tagAliases.length === 0}<p class="glean-tag-alias-dialog__empty">{t(i18n, "library.tagAliasNone")}</p>{/if}
                <div class="glean-tag-alias-list">
                    {#each tagAliases as alias (alias.id)}
                        <div class="glean-tag-alias-item">
                            <div><strong>{alias.name}</strong><span>→ #{alias.tag}</span>{#if !facets.tags.some((facet) => facet.value.toLocaleLowerCase() === alias.tag.toLocaleLowerCase())}<small role="status">{t(i18n, "library.tagAliasMissing")}</small>{/if}</div>
                            <div class="glean-tag-alias-item__actions">
                                <button type="button" class="glean-btn glean-btn--ghost" disabled={tagAliasBusy} onclick={() => beginTagAliasEdit(alias)}>{t(i18n, "library.tagAliasEdit")}</button>
                                <button type="button" class="glean-btn glean-btn--ghost" disabled={tagAliasBusy} onclick={() => void removeTagAlias(alias)}>{t(i18n, tagAliasDeleteConfirmId === alias.id ? "library.tagAliasConfirmDelete" : "library.tagAliasDelete")}</button>
                            </div>
                        </div>
                    {/each}
                </div>
                <div class="glean-tag-alias-form">
                    <label>{t(i18n, "library.tagAliasName")}<input class="b3-text-field" maxlength="40" bind:value={tagAliasDraftName} onkeydown={handleTagAliasInputKeyDown} /></label>
                    <label>{t(i18n, "library.tagAliasSource")}<select class="b3-select" bind:value={tagAliasDraftTag} onkeydown={handleTagAliasSelectKeyDown}><option value="">{t(i18n, "action.filterAll")}</option>{#each facets.tags as facet (facet.value)}<option value={facet.value}>#{facet.value} · {facet.count}</option>{/each}</select></label>
                    <div class="glean-tag-alias-form__actions">
                        <button type="button" class="glean-btn glean-btn--ghost" disabled={tagAliasBusy || (!tagAliasDraftName && !tagAliasDraftTag)} onclick={() => beginTagAliasEdit()}>{t(i18n, "library.tagAliasNew")}</button>
                        <button type="button" class="glean-btn glean-btn--pri" aria-busy={tagAliasBusy} disabled={tagAliasBusy || !tagAliasDraftName.trim() || !tagAliasDraftTag} onclick={() => void saveTagAlias()}>{t(i18n, "library.tagAliasSave")}</button>
                    </div>
                </div>
                <footer class="glean-tag-alias-dialog__foot"><button type="button" class="glean-btn glean-btn--ghost" onclick={closeTagAliasManager}>{t(i18n, "action.close")}</button></footer>
            </dialog>
        </div>
    {/if}
    </div>
</div>
</div>

<style>
    /* 样式集中在 src/index.scss（设计系统），组件内不再重复 */
</style>
