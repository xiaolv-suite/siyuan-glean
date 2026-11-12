<script lang="ts">
/** 今日拾遗视图（T-1400/T-1402/T-1717）：确定性挑选，读了/改天/归档，平静原则文案。
 * 重浮是纯投影：输入是父级刚对账过的索引（T-1710），本组件不再另读缓存。 */
import { openTab, showMessage } from "siyuan";
import { onDestroy, tick } from "svelte";
import type { GleanFacade } from "../types";
import { t } from "../libs/i18n";
import { formatCitation, citationSuccessKey, type CitationFormat, type CitationItem } from "../domain/citation";
import { snapshotClip } from "../services/snapshot-service";
import { actOnSurface, computeDailyFromIndex, pickSurfaceReplacementFromIndex, setSurfacePinned, undoSurfaceAction, type SurfaceAction, type SurfaceUndoToken } from "../services/resurface-service";
import type { GleanIndex } from "../services/index-store";
import { todayStamp, type SurfacePick, type SurfaceReason, type SurfaceItem } from "../domain/resurface";
import { computeRecent7DaysStatus } from "../domain/stats";
import { hasSourceAction, openTargetForCarrier, resolveCarrier, sourceUrlForCarrier } from "../domain/carrier";
import { clampSurfaceSwipe, resolveSurfaceSwipe, type SurfaceSwipeAction } from "../domain/surface-swipe";
import ContextSelectionPanel from "./ContextSelectionPanel.svelte";
import { projectActiveRecentReadings, type RecentReadingEntry } from "../domain/recent-reading";
import { moveLibraryCursor, resolveLibraryShortcut } from "../domain/library-keyboard";
import { cyclePriorityValue, cycleRatingValue } from "../domain/library-keyboard";
import { writeClip } from "../services/clip-store";
import { isWechatUrl, displayWechatAuthor } from "../domain/wechat";
import { resolveReadingTimeTier } from "../domain/library-view";
import { getCardsDueSummarySafely, openCardsReviewSafely } from "../libs/ecosystem-bridge-kit";
import { lvLaunchpad } from "../libs/notice";

interface Props {
    facade: GleanFacade;
    /** 面板对账后的派生索引；每次属性变化由父级传入新引用触发重算。 */
    index: GleanIndex;
    currentTime: Date;
    loading?: boolean;
    loadError?: boolean;
    onRetry?: () => void;
    onMutated: () => void;
    embedded?: boolean;
    onQuickCapture?: () => void;
    onQuickSearch?: () => void;
    onQuickCandidates?: () => void;
    onStartRoaming?: () => void;
    quickCaptureBusy?: boolean;
}

let { facade, index, currentTime, loading = false, loadError = false, onRetry, onMutated, embedded = false, onQuickCapture, onQuickSearch, onQuickCandidates, onStartRoaming, quickCaptureBusy = false }: Props = $props();
const instanceId = $props.id();
const panelTitleId = `glean-resurface-title-${instanceId}`;
const quickActionsTitleId = `glean-resurface-quick-actions-title-${instanceId}`;

const i18n = $derived(facade.i18n);

const daily = $derived(computeDailyFromIndex(index, facade.settings, currentTime));
type SurfaceDisplayPick = SurfacePick & { reasons: SurfaceReason[] };
let sessionPicks = $state<SurfaceDisplayPick[] | null>(null);
let replacementExcluded = $state<string[]>([]);
let replacementNotice = $state<{ from: string; to: string } | null>(null);
    const picks = $derived(sessionPicks ?? daily.picks);
    /** 今日拾遗卡片键盘光标（T-3400）：仅桌面端会话状态，不写文章属性与偏好。 */
    let cursorId = $state("");
    const pickIds = $derived(picks.map((pick) => pick.item.id));
    const activePick = $derived<SurfaceDisplayPick | null>(cursorId ? picks.find((p) => p.item.id === cursorId) ?? null : null);

    $effect(() => {
        if (cursorId && !pickIds.includes(cursorId)) cursorId = "";
    });
const recentCount = $derived(daily.recentCount);
const completionStreak = $derived(daily.completionStreak);
const recent7Days = $derived(computeRecent7DaysStatus(Object.values(index.clips), currentTime));
const clipCount = $derived(Object.keys(index.clips).length);
const candidateCount = $derived(Object.keys(index.candidates).length);
// 仅比较快照引用；深代理会改变裸索引的身份并反复触发此处的刷新 effect。
let observedIndex = $state.raw<GleanIndex | null>(null);
/** 忙态按钮用 aria-disabled 保持失败后的键盘焦点；各动作入口的 busy guard 负责防重入。 */
let actingId = $state("");
let undoingId = $state("");
let undoNotice = $state<{ id: string; title: string; action: SurfaceAction; token: SurfaceUndoToken } | null>(null);
let panelRoot = $state<HTMLDivElement | undefined>(undefined);
let undoButton = $state<HTMLButtonElement | undefined>(undefined);
let suppressedClickId = $state("");
let swipeState = $state<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    locked: boolean;
} | null>(null);
/** UX 审计 #10：本会话"开始阅读"过的文章回执（纯视图状态，不写属性）。 */
let startedToday = $state<Array<{ id: string; title: string }>>([]);
let recentReadings = $state<RecentReadingEntry[]>([]);
let cardsDueCount = $state(0);

$effect(() => {
    void index.updatedAt;
    void getCardsDueSummarySafely().then((res) => {
        if (res.ok) cardsDueCount = res.unreviewedCount;
    });
});

$effect(() => {
    recentReadings = facade.recentReadingDocuments().map((entry) => ({ ...entry }));
    const handleRecentChange = () => {
        recentReadings = facade.recentReadingDocuments().map((entry) => ({ ...entry }));
    };
    document.addEventListener("glean:recent-reading-changed", handleRecentChange);
    return () => {
        document.removeEventListener("glean:recent-reading-changed", handleRecentChange);
    };
});

const activeRecentReadings = $derived(
    projectActiveRecentReadings(recentReadings, index.clips, 3)
);
const activeContinue = $derived(activeRecentReadings[0] ?? null);
const secondaryRecent = $derived(activeRecentReadings.slice(1));
const recentCaptured = $derived.by(() => {
    return Object.values(index.clips)
        .filter((item) => Boolean(item.id && item.title && !item.internal))
        .sort((a, b) => (b.time || "").localeCompare(a.time || ""))
        .slice(0, 3);
});
let disposed = false;
let swipeGeneration = 0;
const swipeTimers = new Set<number>();

function clearSwipeTimers(): void {
    for (const timer of swipeTimers) window.clearTimeout(timer);
    swipeTimers.clear();
}

function scheduleSwipeCallback(callback: () => void, delay: number, generation: number): void {
    let timer = 0;
    timer = window.setTimeout(() => {
        swipeTimers.delete(timer);
        if (disposed || generation !== swipeGeneration) return;
        callback();
    }, delay);
    swipeTimers.add(timer);
}

onDestroy(() => {
    disposed = true;
    swipeGeneration += 1;
    clearSwipeTimers();
    swipeState = null;
    suppressedClickId = "";
    pullDistance = 0;
    pullStartY = 0;
});

let pullStartY = 0;
let pullDistance = $state(0);
let pullRefreshing = $state(false);
let pullHapticTriggered = false;

function onTouchStart(e: TouchEvent) {
    if (!facade.isMobile || pullRefreshing) return;
    const target = panelRoot;
    if (target && target.scrollTop <= 0) {
        const touch = e.touches[0];
        if (touch) {
            pullStartY = touch.clientY;
            pullHapticTriggered = false;
        }
    } else {
        pullStartY = 0;
    }
}

function onTouchMove(e: TouchEvent) {
    if (!facade.isMobile || !pullStartY || pullRefreshing) return;
    const touch = e.touches[0];
    if (!touch) return;
    const diffY = touch.clientY - pullStartY;
    if (diffY > 0) {
        pullDistance = Math.min(84, Math.round(diffY * 0.45));
        if (pullDistance >= 60 && !pullHapticTriggered) {
            pullHapticTriggered = true;
            lvLaunchpad.haptic(15);
        }
    } else {
        pullDistance = 0;
    }
}

function onTouchEnd() {
    if (!facade.isMobile || !pullStartY || pullRefreshing) return;
    pullStartY = 0;
    if (pullDistance >= 60) {
        pullRefreshing = true;
        lvLaunchpad.haptic(10);
        try {
            if (onRetry) onRetry();
            else onMutated();
        } finally {
            setTimeout(() => {
                pullRefreshing = false;
                pullDistance = 0;
            }, 650);
        }
    } else {
        pullDistance = 0;
    }
}

$effect(() => {
    if (observedIndex === null) {
        observedIndex = index;
        return;
    }
    if (observedIndex === index) return;
    observedIndex = index;
    swipeGeneration += 1;
    clearSwipeTimers();
    swipeState = null;
    suppressedClickId = "";
    sessionPicks = null;
    replacementExcluded = [];
    replacementNotice = null;
});

function openDoc(docId: string) {
    if (suppressedClickId === docId) {
        suppressedClickId = "";
        return;
    }
    facade.openReadingDocument(docId);
}

function openSource(pick: SurfacePick) {
    const url = sourceUrlForCarrier(pick.item.contentType, pick.item.url);
    if (!url) {
        showMessage(t(i18n, "clip.sourceMissing"), 3000);
        return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
}

async function copyPickBlockRef(item: SurfaceItem): Promise<void> {
    const title = item.title || t(i18n, "panel.untitled");
    const refText = `((${item.id} '${title}'))`;
    try {
        await navigator.clipboard.writeText(refText);
        showMessage(t(i18n, "reader.blockRefCopied"), 2000);
    } catch {
        showMessage(t(i18n, "msg.actionFailed"), 2000);
    }
}

async function copyPickCitation(pick: SurfaceDisplayPick, format: CitationFormat = "gbt"): Promise<void> {
    const raw = index.clips[pick.item.id];
    const citItem: CitationItem = {
        id: pick.item.id,
        title: pick.item.title,
        author: raw?.author || pick.item.author,
        site: raw?.site || pick.item.site,
        url: raw?.url || pick.item.url,
        time: raw?.time || pick.item.time,
    };
    const citText = formatCitation(citItem, format);
    const msgKey = citationSuccessKey(format);
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

async function openOrTakePickSnapshot(pick: SurfaceDisplayPick): Promise<void> {
    const snapPath = index.clips[pick.item.id]?.snapshot;
    if (snapPath) {
        if (facade.isMobile && typeof window !== "undefined") {
            window.open(snapPath.startsWith("/") ? snapPath : `/${snapPath}`, "_blank");
        } else {
            void openTab({ app: facade.pluginInstance.app, asset: { path: snapPath } });
        }
        return;
    }
    if (actingId || undoingId) return;
    actingId = pick.item.id;
    try {
        const result = await snapshotClip(facade.pluginInstance, pick.item.id);
        if (result?.path) {
            showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "snapshot.done"), result.indexSyncFailed ? 4000 : 3000);
            facade.notifyDataChanged();
            onMutated();
        } else {
            showMessage(t(i18n, "snapshot.failed"), 3000);
        }
    } catch (error) {
        console.warn("[glean] 今日拾遗拍摄快照失败:", error);
        showMessage(t(i18n, "snapshot.failed"), 3000);
    } finally {
        actingId = "";
    }
}

function openReading(pick: SurfacePick) {
    if (openTargetForCarrier(pick.item.contentType, pick.item.url) === "source") {
        openSource(pick);
        return;
    }
    if (resolveCarrier(pick.item.contentType) === "link") showMessage(t(i18n, "clip.sourceMissing"), 3000);
    openDoc(pick.item.id);
}

function carrierLabel(pick: SurfacePick): string {
    return t(i18n, `clip.type.${resolveCarrier(pick.item.contentType)}`);
}

function isPinnedToday(pick: SurfacePick): boolean {
    return pick.item.pinned === todayStamp();
}

async function togglePin(pick: SurfacePick): Promise<void> {
    if (disposed || actingId || undoingId) return;
    actingId = pick.item.id;
    try {
        const result = await setSurfacePinned(facade.pluginInstance, pick.item.id, !isPinnedToday(pick));
        if (disposed) {
            facade.notifyDataChanged();
            return;
        }
        if (result.indexSyncFailed) showMessage(t(i18n, "msg.writeIndexPending"), 4000);
        facade.notifyDataChanged();
        if (disposed) return;
        onMutated();
    } catch (error) {
        console.warn("[glean] 置顶失败:", error);
        if (!disposed) showMessage(t(i18n, "msg.actionFailed"), 4000);
    } finally {
        if (!disposed) actingId = "";
    }
}

async function act(pick: SurfacePick, action: SurfaceAction) {
    if (disposed || actingId || undoingId) return;
    const focusOrigin = document.activeElement;
    const activeCard = focusOrigin instanceof HTMLElement ? focusOrigin.closest(".glean-surf-card") : null;
    const moveFocus = action !== "read" && activeCard?.getAttribute("aria-labelledby") === cardTitleId(pick.item.id);
    let applied = false;
    actingId = pick.item.id;
    try {
        let result: Awaited<ReturnType<typeof actOnSurface>>;
        try {
            result = await actOnSurface(facade.pluginInstance, pick.item.id, action);
        } catch (error) {
            console.warn("[glean] 拾遗动作失败:", error);
            if (!disposed) showMessage(t(i18n, "msg.actionFailed"), 4000);
            return;
        }
        if (disposed) {
            facade.notifyDataChanged();
            return;
        }
        const token = result.token;
        if (result.indexSyncFailed) showMessage(t(i18n, "msg.statusIndexPending"), 4000);
        undoNotice = {
            id: pick.item.id,
            title: pick.item.title || t(i18n, "panel.untitled"),
            action,
            token,
        };
        if (action === "read") {
            startedToday = [
                ...startedToday.filter((item) => item.id !== pick.item.id),
                { id: pick.item.id, title: pick.item.title || t(i18n, "panel.untitled") },
            ];
        }
        sessionPicks = picks.filter((candidate) => candidate.item.id !== pick.item.id);
        replacementExcluded = [...new Set([...replacementExcluded, pick.item.id])];
        facade.notifyDataChanged();
        if (disposed) return;
        onMutated();
        applied = true;
        if (action === "read" && !disposed) {
            try {
                openReading(pick);
            } catch (error) {
                console.warn("[glean] 开始阅读后打开文章失败:", error);
                if (!disposed) showMessage(t(i18n, "resurface.openFailed"), 4000);
            }
        }
    } finally {
        if (!disposed) actingId = "";
    }
    if (applied && moveFocus) {
        await tick();
        if (!disposed && undoNotice?.id === pick.item.id && canRestoreFocus(focusOrigin)) undoButton?.focus();
    }
}

async function replacePick(slot: number, pick: SurfacePick): Promise<void> {
    if (disposed || actingId || undoingId) return;
    const focusOrigin = document.activeElement;
    const activeCard = focusOrigin instanceof HTMLElement ? focusOrigin.closest(".glean-surf-card") : null;
    const moveFocus = activeCard?.getAttribute("aria-labelledby") === cardTitleId(pick.item.id);
    const currentIds = new Set(picks.map((candidate) => candidate.item.id));
    const excluded = new Set([...currentIds, ...replacementExcluded]);
    const replacement = pickSurfaceReplacementFromIndex(index, facade.settings, excluded);
    if (!replacement) {
        showMessage(t(i18n, "resurface.noAlternative"), 3000);
        return;
    }
    const nextPicks = [...picks];
    nextPicks[slot] = replacement;
    sessionPicks = nextPicks;
    replacementExcluded = [...new Set([...replacementExcluded, pick.item.id])];
    replacementNotice = {
        from: pick.item.title || t(i18n, "panel.untitled"),
        to: replacement.item.title || t(i18n, "panel.untitled"),
    };
    if (moveFocus) await focusAvailablePick(focusOrigin, replacement.item.id);
}

function refreshDaily(): void {
    sessionPicks = null;
    replacementExcluded = [];
    replacementNotice = null;
    onMutated();
}

function swipeOffsetFor(docId: string): number {
    return swipeState?.id === docId ? swipeState.offsetX : 0;
}

function isSwipeBlockedTarget(event: PointerEvent): boolean {
    const target = event.target;
    return target instanceof HTMLElement && Boolean(target.closest("button,a,input,select,textarea"));
}

function beginSwipe(pick: SurfacePick, event: PointerEvent): void {
    if (!facade.isMobile || actingId || undoingId || isSwipeBlockedTarget(event)) return;
    swipeState = {
        id: pick.item.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: 0,
        locked: false,
    };
}

function moveSwipe(pick: SurfacePick, event: PointerEvent): void {
    if (!swipeState || swipeState.id !== pick.item.id || swipeState.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - swipeState.startX;
    const deltaY = event.clientY - swipeState.startY;
    if (!swipeState.locked) {
        if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
            swipeState = null;
            return;
        }
        if (Math.abs(deltaX) < 8) return;
        swipeState = { ...swipeState, locked: true };
        try {
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
            return;
        }
    }
    event.preventDefault();
    swipeState = { ...swipeState, offsetX: clampSurfaceSwipe(deltaX) };
}

function finishSwipe(pick: SurfacePick, event: PointerEvent): void {
    if (!swipeState || swipeState.id !== pick.item.id || swipeState.pointerId !== event.pointerId) return;
    const current = swipeState;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    const action: SurfaceSwipeAction | null = resolveSurfaceSwipe(deltaX, deltaY);
    if (!action) {
        swipeState = null;
        return;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate?.(12); } catch { /* 静默安全 */ }
    }
    event.preventDefault();
    suppressedClickId = pick.item.id;
    swipeState = { ...current, offsetX: action === "later" ? 132 : -132 };
    const generation = swipeGeneration;
    scheduleSwipeCallback(() => {
        if (swipeState?.id === pick.item.id) swipeState = null;
        void act(pick, action);
    }, 120, generation);
    scheduleSwipeCallback(() => {
        if (suppressedClickId === pick.item.id) suppressedClickId = "";
    }, 360, generation);
}

function cancelSwipe(pick: SurfacePick, event: PointerEvent): void {
    if (swipeState?.id === pick.item.id && swipeState.pointerId === event.pointerId) swipeState = null;
}

function actionLabel(action: SurfaceAction): string {
    return t(i18n, action === "read" ? "resurface.read" : action === "archive" ? "resurface.archive" : "resurface.later");
}

async function undoLastAction(): Promise<void> {
    const notice = undoNotice;
    if (disposed || !notice || actingId || undoingId) return;
    const focusOrigin = document.activeElement;
    const moveFocus = panelRoot?.contains(focusOrigin) ?? false;
    let undone = false;
    undoingId = notice.id;
    try {
        const result = await undoSurfaceAction(facade.pluginInstance, notice.id, notice.token);
        if (disposed) {
            facade.notifyDataChanged();
            return;
        }
        undoNotice = null;
        if (notice.action === "read") startedToday = startedToday.filter((item) => item.id !== notice.id);
        if (result.indexSyncFailed) showMessage(t(i18n, "msg.statusIndexPending"), 4000);
        facade.notifyDataChanged();
        if (disposed) return;
        onMutated();
        undone = true;
    } catch {
        if (!disposed) showMessage(t(i18n, "resurface.undoUnavailable"), 4000);
    } finally {
        if (!disposed) undoingId = "";
    }
    if (undone && moveFocus) await focusAvailablePick(focusOrigin);
}

function canRestoreFocus(origin: Element | null): boolean {
    if (!origin) return false;
    const active = document.activeElement;
    return active === origin || (!origin.isConnected && (!active || active === document.body || !active.isConnected));
}

async function focusAvailablePick(origin: Element | null, preferredId = ""): Promise<void> {
    await tick();
    if (disposed || !canRestoreFocus(origin)) return;
    const preferred = preferredId ? Array.from(panelRoot?.querySelectorAll<HTMLElement>(".glean-surf__title-action") ?? [])
        .find((button) => button.id === cardTitleId(preferredId)) : undefined;
    const target = preferred ?? panelRoot?.querySelector<HTMLElement>(".glean-surf__title-action")
        ?? panelRoot?.querySelector<HTMLElement>(".glean-head-actions button, .glean-empty__actions button");
    (target ?? panelRoot)?.focus();
}

async function dismissUndo(): Promise<void> {
    if (undoingId) return;
    const focusOrigin = document.activeElement;
    const moveFocus = panelRoot?.contains(focusOrigin) ?? false;
    undoNotice = null;
    if (moveFocus) await focusAvailablePick(focusOrigin);
}

const dateLabel = $derived.by(() => {
    const now = new Date();
    return t(i18n, "resurface.date", {
        m: now.getMonth() + 1,
        d: now.getDate(),
    });
});

function summaryText(pick: SurfacePick): string {
    return pick.item.summary || t(i18n, "resurface.noSummary");
}

function cardTitleId(itemId: string): string {
    return `glean-resurface-card-title-${instanceId}-${itemId}`;
}

function reasonText(reason: SurfaceReason): string {
    switch (reason.kind) {
        case "stale": return t(i18n, "resurface.reason.stale", { n: reason.days ?? 0 });
        case "priority": return t(i18n, "resurface.reason.priority", { n: reason.priority ?? 3 });
        case "site": return t(i18n, "resurface.reason.site", { site: reason.site ?? "" });
        case "author": return t(i18n, "resurface.reason.author", { author: reason.author ?? "" });
        case "freshTopic": return t(i18n, "resurface.reason.freshTopic");
        case "slice": return t(i18n, "resurface.reasonSlice", { minutes: reason.minutes ?? 5 });
    }
}

function hasBlockingOverlay(): boolean {
    if (typeof document === "undefined") return false;
    const overlays = document.querySelectorAll<HTMLElement>(".b3-menu, .b3-dialog, dialog[open], [role='dialog'][aria-modal='true'], .glean-dialog");
    return Array.from(overlays).some((element) => element.getClientRects().length > 0);
}

function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat) return;
    if (hasBlockingOverlay()) return;
    if (!panelRoot || panelRoot.getClientRects().length === 0) return;
    const evtTarget = event.target instanceof Node ? event.target : null;
    if (!panelRoot.contains(evtTarget) && !panelRoot.contains(document.activeElement)) return;
    if ((event.ctrlKey || event.metaKey) && (event.key === "f" || event.key === "F")) {
        const target = event.target instanceof Element ? event.target : null;
        const textEntry = Boolean(target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
        if (!textEntry && onQuickSearch) {
            event.preventDefault();
            event.stopPropagation();
            onQuickSearch();
            return;
        }
    }
    if (event.key === "Escape") {
        if (undoNotice && undoingId !== undoNotice.id) {
            event.preventDefault();
            event.stopPropagation();
            void dismissUndo();
            return;
        }
        if (replacementNotice) {
            event.preventDefault();
            event.stopPropagation();
            replacementNotice = null;
            return;
        }
        if (cursorId) {
            event.preventDefault();
            event.stopPropagation();
            const previous = cursorId;
            cursorId = "";
            focusCard(previous);
        }
        return;
    }
    if (!facade.isMobile) {
        handleResurfaceShortcut(event);
    }
}

/**
 * 今日拾遗全键盘操作流（T-3400）：复用读库键位仲裁层，
 * J/K 移动、Enter/R 阅读、A 改天、E 归档、H 换一篇（今日拾遗专属）。
 */
function handleResurfaceShortcut(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const textEntry = Boolean(target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
    const nativeAction = Boolean(target?.closest("button, a[href], summary, [role='button']"));
    const action = resolveLibraryShortcut(event, {
        textEntry,
        nativeAction,
        overlay: hasBlockingOverlay(),
        cursorActive: Boolean(cursorId),
    });
    // H 换一篇作为今日拾遗特色快捷键，仅在光标激活且未在输入控件中时接管
    if (!action && !textEntry && Boolean(cursorId) && (event.key === "h" || event.key === "H")) {
        const pick = activePick;
        if (pick && !actingId && !undoingId) {
            const slot = picks.indexOf(pick);
            if (slot >= 0) {
                event.preventDefault();
                event.stopPropagation();
                void replacePick(slot, pick);
            }
        }
        return;
    }
    // B 漫游盲盒：在今日拾遗中按下 B / b 键即可快速唤起漫游盲盒展台
    if (!action && !textEntry && (event.key === "b" || event.key === "B")) {
        if (onStartRoaming) {
            event.preventDefault();
            event.stopPropagation();
            onStartRoaming();
            return;
        }
    }
    // S 离线快照：在今日拾遗中按下 S / s 键查看或补拍当前卡片的离线快照（优先级高于读库勾选）
    if (!textEntry && Boolean(cursorId) && (event.key === "s" || event.key === "S") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const pick = activePick;
        if (pick && !actingId && !undoingId) {
            event.preventDefault();
            event.stopPropagation();
            void openOrTakePickSnapshot(pick);
            return;
        }
    }
    if (!action) return;
    if (action.type === "focusSearch") {
        if (onQuickSearch) {
            event.preventDefault();
            event.stopPropagation();
            onQuickSearch();
            return;
        }
    }
    if (action.type === "move") {
        event.preventDefault();
        event.stopPropagation();
        setCursor(moveLibraryCursor(pickIds, cursorId, action.delta));
        return;
    }
    const pick = activePick;
    if (!pick || actingId || undoingId) return;
    switch (action.type) {
        case "activate":
        case "startReading":
            event.preventDefault();
            event.stopPropagation();
            void act(pick, "read");
            break;
        case "later":
            event.preventDefault();
            event.stopPropagation();
            void act(pick, "later");
            break;
        case "archive":
            event.preventDefault();
            event.stopPropagation();
            void act(pick, "archive");
            break;
        case "togglePin":
            event.preventDefault();
            event.stopPropagation();
            void togglePin(pick);
            break;
        case "copyBlockRef":
            event.preventDefault();
            event.stopPropagation();
            void copyPickBlockRef(pick.item);
            break;
        case "cyclePriority": {
            event.preventDefault();
            event.stopPropagation();
            const currentClip = index.clips[pick.item.id];
            const nextVal = cyclePriorityValue(currentClip?.priority ?? pick.item.priority);
            void setPickPriority(pick, nextVal);
            break;
        }
        case "setPriority": {
            event.preventDefault();
            event.stopPropagation();
            void setPickPriority(pick, action.value);
            break;
        }
        case "cycleRating": {
            event.preventDefault();
            event.stopPropagation();
            const currentClip = index.clips[pick.item.id];
            const nextVal = cycleRatingValue(currentClip?.rating);
            void setPickRating(pick, nextVal);
            break;
        }
        case "toggleFavorite":
            event.preventDefault();
            event.stopPropagation();
            void togglePickFavorite(pick);
            break;
        case "copyCitation":
            event.preventDefault();
            event.stopPropagation();
            void copyPickCitation(pick);
            break;
        case "copyBibTeX":
            event.preventDefault();
            event.stopPropagation();
            void copyPickCitation(pick, "bibtex");
            break;
    }
}

async function setPickPriority(pick: SurfaceDisplayPick, value: number): Promise<void> {
    if (actingId || undoingId) return;
    actingId = pick.item.id;
    try {
        const result = await writeClip(facade.pluginInstance, pick.item.id, { priority: value }, { force: true });
        showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "msg.rankSaved"), result.indexSyncFailed ? 4000 : 2500);
        facade.notifyDataChanged();
        onMutated();
    } catch (error) {
        console.warn("[glean] 今日拾遗优先级写入失败:", error);
        showMessage(t(i18n, "msg.statusFailed"), 3000);
    } finally {
        actingId = "";
    }
}

async function setPickRating(pick: SurfaceDisplayPick, value: number): Promise<void> {
    if (actingId || undoingId) return;
    actingId = pick.item.id;
    try {
        const result = await writeClip(facade.pluginInstance, pick.item.id, { rating: value }, { force: true });
        showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "msg.rankSaved"), result.indexSyncFailed ? 4000 : 2500);
        facade.notifyDataChanged();
        onMutated();
    } catch (error) {
        console.warn("[glean] 今日拾遗评分写入失败:", error);
        showMessage(t(i18n, "msg.statusFailed"), 3000);
    } finally {
        actingId = "";
    }
}

async function togglePickFavorite(pick: SurfaceDisplayPick): Promise<void> {
    if (actingId || undoingId) return;
    actingId = pick.item.id;
    const currentClip = index.clips[pick.item.id];
    const nextFav = !(currentClip?.favorite ?? (pick.item as any).favorite);
    try {
        const result = await writeClip(facade.pluginInstance, pick.item.id, { favorite: nextFav }, { force: true });
        showMessage(t(i18n, nextFav ? "roaming.favoriteAdded" : "roaming.favoriteRemoved"), result.indexSyncFailed ? 4000 : 2000);
        facade.notifyDataChanged();
        onMutated();
    } catch (error) {
        console.warn("[glean] 今日拾遗收藏切换失败:", error);
        showMessage(t(i18n, "msg.statusFailed"), 3000);
    } finally {
        actingId = "";
    }
}

function setCursor(id: string): void {
    cursorId = id;
    if (id) focusCard(id);
}

function focusCard(id: string): void {
    void tick().then(() => {
        if (!id) return;
        panelRoot?.querySelector<HTMLElement>(`[data-glean-surf-id="${CSS.escape(id)}"] button.glean-surf__title-action, [data-glean-surf-id="${CSS.escape(id)}"] .glean-surf__title button`)?.focus({ preventScroll: true });
    });
}

let exportingDailyNote = $state(false);

async function exportPicksToDailyNote(): Promise<void> {
    if (picks.length === 0 || exportingDailyNote) return;
    const notebookId = facade.settings.anchorNotebooks[0];
    if (!notebookId) {
        showMessage(t(i18n, "panel.noAnchorHint"), 3000);
        return;
    }
    exportingDailyNote = true;
    try {
        const { recordBatchDailyNotePlan } = await import("../services/daily-note-service");
        const docIds = picks.map((p) => p.item.id);
        const res = await recordBatchDailyNotePlan(notebookId, docIds, {
            sectionHeader: `### 🎯 ${t(i18n, "resurface.dailyPlanTitle")}`,
        });
        if (res.ok) {
            showMessage(t(i18n, "resurface.dailyPlanExported", { n: res.count }), 3000);
        } else {
            showMessage(t(i18n, "dailyNote.failed"), 3000);
        }
    } catch (err) {
        console.warn("[glean] 导出今日日记计划失败:", err);
        showMessage(t(i18n, "dailyNote.failed"), 3000);
    } finally {
        exportingDailyNote = false;
    }
}
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    bind:this={panelRoot}
    tabindex="-1"
    class="glean-panel glean-resurface"
    class:glean-resurface--embedded={embedded}
    aria-labelledby={!embedded ? panelTitleId : undefined}
    ontouchstart={onTouchStart}
    ontouchmove={onTouchMove}
    ontouchend={onTouchEnd}
    ontouchcancel={() => { pullStartY = 0; pullDistance = 0; }}
>
    {#if facade.isMobile && (pullDistance > 0 || pullRefreshing)}
        <div class="glean-pull-refresh-indicator" style:height={`${Math.max(pullDistance, pullRefreshing ? 44 : 0)}px`} role="status" aria-live="polite">
            <svg class="glean-pull-refresh-spin" class:glean-pull-refresh-spin--active={pullRefreshing || pullDistance >= 60} viewBox="0 0 24 24" aria-hidden="true">
                <use href="#iconGleanRefresh" />
            </svg>
            <span>{pullRefreshing ? t(i18n, "panel.loading") : pullDistance >= 60 ? t(i18n, "mobile.releaseToRefresh") : t(i18n, "mobile.pullToRefresh")}</span>
        </div>
    {/if}
    {#if !embedded}<header class="glean-panel__head glean-resurface__head">
        <div class="glean-brand">
            <div class="glean-brand__mark"><svg><use href="#iconGleanWheat" /></svg></div>
            <div>
                <div id={panelTitleId} class="glean-brand__name">{t(i18n, "resurface.title")}</div>
                <div class="glean-brand__sub">
                    {dateLabel} · {t(i18n, "resurface.subtitle", { n: picks.length })}
                    {#if recentCount > 0}· {t(i18n, "resurface.recent", { n: recentCount })}{/if}
                </div>
            </div>
            <div class="glean-head-actions">
                <button class="glean-icon-btn" title={t(i18n, "action.refresh")} aria-label={t(i18n, "action.refresh")} aria-busy={Boolean(actingId || undoingId)} disabled={Boolean(actingId || undoingId)} onclick={refreshDaily}>
                    <svg><use href="#iconGleanRefresh" /></svg>
                </button>
            </div>
        </div>
    </header>{/if}

    {#if facade.isMobile && picks.length > 0}
        <div class="glean-surf-swipe-hint" role="note">{t(i18n, "resurface.swipeHint")}</div>
    {/if}

    {#if undoNotice}
        <div class="glean-surf-undo" role="status" aria-live="polite">
            <span class="glean-surf-undo__text">{t(i18n, "resurface.actionApplied", { action: actionLabel(undoNotice.action) })} · {undoNotice.title}</span>
            <button bind:this={undoButton} class="glean-surf-undo__button" aria-busy={undoingId === undoNotice.id} aria-disabled={!!actingId || undoingId === undoNotice.id} onclick={() => void undoLastAction()}>
                {undoingId === undoNotice.id ? t(i18n, "resurface.undoing") : t(i18n, "resurface.undo")}
            </button>
            <button class="glean-surf-undo__dismiss" aria-label={t(i18n, "resurface.dismissUndo")} disabled={undoingId === undoNotice.id} onclick={dismissUndo}><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanClose" /></svg></button>
        </div>
    {/if}

    {#if replacementNotice}
        <div class="glean-surf-undo" role="status" aria-live="polite">
            <span class="glean-surf-undo__text">{t(i18n, "resurface.replaced", { from: replacementNotice.from, to: replacementNotice.to })}</span>
            <button class="glean-surf-undo__dismiss" aria-label={t(i18n, "resurface.dismissReplacement")} onclick={() => replacementNotice = null}>
                <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanClose" /></svg>
            </button>
        </div>
    {/if}

    {#if index.updatedAt}
        <details class="glean-surf-context-fold">
            <summary class="glean-surf-context-fold__summary">
                <span class="glean-surf-context-fold__label">
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                    <span>{t(i18n, "context.title")}</span>
                </span>
            </summary>
            <ContextSelectionPanel {facade} {index} {currentTime} />
        </details>
    {/if}

    {#if loading && !index.updatedAt}
        <div class="glean-panel__loading glean-resurface__sync-state" role="status" aria-live="polite" aria-busy="true">
            <span class="glean-panel__refreshing-dot" aria-hidden="true"></span>
            {t(i18n, "resurface.loading")}
        </div>
    {:else if loadError && !index.updatedAt}
        <div class="glean-load-error glean-resurface__sync-state" role="alert" aria-live="assertive">
            <span>{t(i18n, "resurface.loadFailed")}</span>
            {#if onRetry}
                <button class="glean-btn" aria-busy={loading} disabled={loading} onclick={onRetry}>{t(i18n, "action.retry")}</button>
            {/if}
        </div>
    {:else if picks.length === 0 && facade.settings.anchorNotebooks.length === 0}
        <div class="glean-empty" role="status">
            <div class="glean-empty__art"><svg aria-hidden="true"><use href="#iconGleanWheat" /></svg></div>
            <div class="glean-empty__title">{t(i18n, "resurface.noAnchor")}</div>
            <div class="glean-empty__hint">{t(i18n, "panel.noAnchorHint")}</div>
            <div class="glean-empty__actions">
                <button class="glean-btn glean-btn--pri glean-resurface__setup" onclick={() => facade.openOnboarding()}>
                    {t(i18n, "panel.openOnboarding")}
                </button>
                <button class="glean-btn glean-btn--ghost glean-resurface__setup" onclick={() => facade.openSettings()}>
                    {t(i18n, "panel.setupAnchor")}
                </button>
            </div>
        </div>
    {:else if picks.length === 0 && clipCount === 0 && candidateCount > 0 && startedToday.length === 0}
        <div class="glean-empty" role="status">
            <div class="glean-empty__art"><svg aria-hidden="true"><use href="#iconGleanInbox" /></svg></div>
            <div class="glean-empty__title">{t(i18n, "panel.candidatesDetected", { n: candidateCount })}</div>
            <div class="glean-empty__hint">{t(i18n, "onboarding.previewNote")}</div>
            {#if onQuickCandidates}
                <div class="glean-empty__actions">
                    <button class="glean-btn glean-btn--pri" onclick={onQuickCandidates}>{t(i18n, "panel.viewCandidates")}</button>
                </div>
            {/if}
        </div>
    {:else if picks.length === 0 && clipCount === 0 && candidateCount === 0 && startedToday.length === 0}
        <div class="glean-empty" role="status">
            <div class="glean-empty__art"><svg aria-hidden="true"><use href="#iconGleanWheat" /></svg></div>
            <div class="glean-empty__title">{t(i18n, "panel.empty")}</div>
            <div class="glean-empty__hint">{t(i18n, "panel.emptyHint")}</div>
            <div class="glean-empty__actions">
                <button class="glean-btn glean-btn--pri" onclick={() => facade.openOnboarding()}>
                    {t(i18n, "panel.openOnboarding")}
                </button>
            </div>
        </div>
    {:else if picks.length === 0 && startedToday.length === 0 && !activeContinue}
        {#if completionStreak > 0 || recent7Days.some((d) => d.completed)}
            <div class="glean-surf-banner glean-resurface__streak-banner">
                <div class="glean-surf-streak-card">
                    <div class="glean-surf-streak-card__head">
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                        <span>{t(i18n, "resurface.streakCardTitle")}</span>
                    </div>
                    <strong class="glean-surf-streak-card__count"><svg class="glean-icon glean-icon--xs glean-icon--flame" aria-hidden="true"><use href="#iconGleanFlame" /></svg> {t(i18n, "resurface.streakCardDays", { n: completionStreak || 0 })}</strong>
                </div>
                <div class="glean-surf-stepper" role="group" aria-label={t(i18n, "resurface.weeklyStepper")}>
                    {#each recent7Days as step (step.date)}
                        <div class="glean-surf-step" class:glean-surf-step--done={step.completed} class:glean-surf-step--today={step.isToday} title={`${step.date}: ${step.completed ? t(i18n, 'resurface.stepCompleted') : (step.isToday ? t(i18n, 'resurface.stepToday') : t(i18n, 'resurface.stepUnread'))}`}>
                            <span class="glean-surf-step__day">{step.dayLabel}</span>
                            <div class="glean-surf-step__circle">
                                {#if step.completed}
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                                {:else if step.isToday}
                                    <span class="glean-surf-step__dot"></span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
        <div class="glean-empty" role="status">
            <div class="glean-empty__art"><svg aria-hidden="true"><use href="#iconGleanSpark" /></svg></div>
            <div class="glean-empty__title">{t(i18n, "resurface.allDone")}</div>
            <div class="glean-empty__hint">{t(i18n, "resurface.allDoneHint")}</div>
            {#if onStartRoaming}
                <div class="glean-resurface__roaming-action">
                    <button type="button" class="glean-btn glean-btn--pri" onclick={onStartRoaming}>
                        <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                        <span>{t(i18n, "roaming.exploreMore")}</span>
                    </button>
                </div>
            {/if}
        </div>
    {:else}
        {#if candidateCount > 0 && picks.length > 0 && onQuickCandidates}
            <div class="glean-surf-candidate-banner" role="status">
                <span class="glean-surf-candidate-banner__label">
                    <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanInbox" /></svg>
                    {t(i18n, "resurface.candidatesPending", { n: candidateCount })}
                </span>
                <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" onclick={onQuickCandidates}>
                    {t(i18n, "panel.viewCandidates")}
                </button>
            </div>
        {/if}

        {#if completionStreak > 0 || recent7Days.some((d) => d.completed)}
            <div class="glean-surf-banner">
                <div class="glean-surf-streak-card">
                    <div class="glean-surf-streak-card__head">
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                        <span>{t(i18n, "resurface.streakCardTitle")}</span>
                    </div>
                    <strong class="glean-surf-streak-card__count"><svg class="glean-icon glean-icon--xs glean-icon--flame" aria-hidden="true"><use href="#iconGleanFlame" /></svg> {t(i18n, "resurface.streakCardDays", { n: completionStreak || 0 })}</strong>
                </div>
                <div class="glean-surf-stepper" role="group" aria-label={t(i18n, "resurface.weeklyStepper")}>
                    {#each recent7Days as step (step.date)}
                        <div class="glean-surf-step" class:glean-surf-step--done={step.completed} class:glean-surf-step--today={step.isToday} title={`${step.date}: ${step.completed ? t(i18n, 'resurface.stepCompleted') : (step.isToday ? t(i18n, 'resurface.stepToday') : t(i18n, 'resurface.stepUnread'))}`}>
                            <span class="glean-surf-step__day">{step.dayLabel}</span>
                            <div class="glean-surf-step__circle">
                                {#if step.completed}
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                                {:else if step.isToday}
                                    <span class="glean-surf-step__dot"></span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if activeContinue}
            <section class="glean-surf-continue" aria-labelledby="glean-surf-continue-title-{instanceId}">
                <div class="glean-surf-continue__header">
                    <span id="glean-surf-continue-title-{instanceId}" class="glean-surf-continue__label">
                        <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanWheat" /></svg>
                        {t(i18n, "resurface.continueReading")}
                    </span>
                    {#if activeContinue.hasBookmark}
                        <span class="glean-badge glean-badge--bookmark">{t(i18n, "resurface.hasBookmark")}</span>
                    {/if}
                    {#if activeContinue.minutes}
                        <span class="glean-badge">{activeContinue.minutes}m</span>
                    {/if}
                </div>
                <div class="glean-surf-continue__body">
                    <button
                        type="button"
                        class="glean-surf-continue__title-action"
                        onclick={() => openDoc(activeContinue.id)}
                        title={activeContinue.title}
                    >
                        {activeContinue.title}
                    </button>
                    <button
                        type="button"
                        class="glean-btn glean-btn--pri glean-surf-continue__btn"
                        onclick={() => openDoc(activeContinue.id)}
                    >
                        {t(i18n, "resurface.continueReading")}
                    </button>
                </div>
                {#if secondaryRecent.length > 0}
                    <div class="glean-surf-continue__more">
                        <span class="glean-surf-continue__more-label">{t(i18n, "resurface.recentOpened")}:</span>
                        {#each secondaryRecent as item (item.id)}
                            <button
                                type="button"
                                class="glean-chip glean-chip--ghost"
                                onclick={() => openDoc(item.id)}
                                title={item.title}
                            >
                                {item.title}
                            </button>
                        {/each}
                    </div>
                {/if}
            </section>
        {/if}

        {#if startedToday.length > 0}
            <div class="glean-surf-started">
                {#each startedToday as item (item.id)}
                    <span class="glean-surf-started__item" title={item.title}>
                        <span class="glean-surf-started__label">{t(i18n, "resurface.startedToday")}</span>
                        <span class="glean-surf-started__title">{item.title}</span>
                        <button class="glean-surf-act" onclick={() => facade.openReadingDocument(item.id)}>
                            {t(i18n, "resurface.continueReading")}
                        </button>
                    </span>
                {/each}
            </div>
        {/if}
        {#if picks.length === 0}
            <div class="glean-empty glean-resurface__done-empty" role="status">
                <div class="glean-empty__hint">{t(i18n, "resurface.allDoneHint")}</div>
            </div>
        {/if}
        {#if !facade.isMobile && picks.length > 0}
            <details class="glean-kbdhint-fold">
                <summary class="glean-kbdhint-fold__summary"><kbd>?</kbd> <span>{t(i18n, "reader.shortcuts")}</span></summary>
                <div class="glean-kbdhint" class:glean-kbdhint--active={Boolean(activePick)}>
                    <span class="glean-kbdhint__keys" aria-hidden="true">
                        <kbd>J</kbd><kbd>K</kbd> {t(i18n, "library.keyboardMove")}
                        <kbd>Enter</kbd> {t(i18n, "library.keyboardRead")}
                        <kbd>A</kbd> {t(i18n, "resurface.later")}
                        <kbd>E</kbd> {t(i18n, "resurface.archive")}
                        <kbd>H</kbd> {t(i18n, "resurface.replace")}
                        <kbd>B</kbd> {t(i18n, "roaming.button")}
                        <kbd>/</kbd> {t(i18n, "action.search")}
                        <kbd>F</kbd> {t(i18n, "roaming.favoriteAction")}
                        <kbd>T</kbd> {t(i18n, "resurface.shortcutPin")}
                        <kbd>Y</kbd> {t(i18n, "action.copyBlockRef")}
                        <kbd>C</kbd> {t(i18n, "citation.copyGBT")}
                        <kbd>Shift+C</kbd> BibTeX
                        <kbd>S</kbd> {t(i18n, "snapshot.take")}
                        <kbd>P</kbd><kbd>1-5</kbd> {t(i18n, "library.keyboardPriority")}
                        <kbd>M</kbd> {t(i18n, "library.keyboardRating")}
                        <kbd>Esc</kbd> {t(i18n, "library.keyboardExit")}
                    </span>
                </div>
            </details>
            <span class="glean-sr-only" role="status" aria-live="polite">
                {activePick ? t(i18n, "library.keyboardCursor", { title: activePick.item.title || t(i18n, "panel.untitled") }) : ""}
            </span>
        {/if}
        {#if picks.length > 0}
            <div class="glean-surf-ops-bar">
                <span class="glean-surf-ops-bar__label">{t(i18n, "resurface.subtitle", { n: picks.length })}</span>
                <div class="glean-surf-ops-bar__actions" style="display: flex; align-items: center; flex-wrap: wrap; gap: var(--glean-space-1-5);">
                    {#if cardsDueCount > 0}
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-btn--xs glean-surf-cards-due-pill"
                            title={t(i18n, "resurface.cardsDueHint", { n: cardsDueCount })}
                            onclick={() => void openCardsReviewSafely()}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCard" /></svg>
                            <span>{t(i18n, "resurface.cardsDue", { n: cardsDueCount })}</span>
                        </button>
                    {/if}
                    {#if onStartRoaming}
                        <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" title={t(i18n, "roaming.buttonHint")} onclick={onStartRoaming}>
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanRefresh" /></svg>
                            <span>{t(i18n, "roaming.button")}</span>
                        </button>
                    {/if}
                    {#if onQuickSearch}
                        <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" title="{t(i18n, 'action.search')} (/)" onclick={onQuickSearch}>
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                            <span>{t(i18n, "action.search")}</span>
                        </button>
                    {/if}
                    <button
                        type="button"
                        class="glean-btn glean-btn--ghost glean-btn--xs glean-surf-daily-btn"
                        disabled={exportingDailyNote}
                        title={t(i18n, "resurface.exportToDailyNote")}
                        onclick={exportPicksToDailyNote}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanPin" /></svg>
                        <span>{t(i18n, "resurface.exportToDailyNote")}</span>
                    </button>
                </div>
            </div>
        {/if}
        <div class="glean-surf">
            {#each picks as pick, pickIdx (pick.item.id)}
                {@const clip = index.clips[pick.item.id]}
                <div class="glean-surf-swipe">
                    <div class="glean-surf-swipe__action glean-surf-swipe__action--archive" aria-hidden="true"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowLeft" /></svg> <span>{t(i18n, "resurface.swipeArchive")}</span></div>
                    <div class="glean-surf-swipe__action glean-surf-swipe__action--later" aria-hidden="true"><span>{t(i18n, "resurface.swipeLater")}</span> <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowRight" /></svg></div>
                    <article
                        class:glean-surf-card--swiping={swipeState?.id === pick.item.id}
                        class="glean-surf-card"
                        class:glean-surf-card--cursor={cursorId === pick.item.id}
                        data-glean-surf-id={pick.item.id}
                        aria-current={cursorId === pick.item.id ? "true" : undefined}
                        aria-labelledby={cardTitleId(pick.item.id)}
                        aria-busy={actingId === pick.item.id || undoingId === pick.item.id}
                        style="--glean-surf-index: {pickIdx}; --glean-swipe-offset: {swipeOffsetFor(pick.item.id)}px"
                        onpointerdown={facade.isMobile ? (event) => beginSwipe(pick, event) : undefined}
                        onpointermove={facade.isMobile ? (event) => moveSwipe(pick, event) : undefined}
                        onpointerup={facade.isMobile ? (event) => finishSwipe(pick, event) : undefined}
                        onpointercancel={facade.isMobile ? (event) => cancelSwipe(pick, event) : undefined}
                    >
                    <div class="glean-surf__tag">✨ {t(i18n, "resurface.cardTag", { n: pickIdx + 1 })}</div>
                    <h3 class="glean-surf__title">
                        <button
                            id={cardTitleId(pick.item.id)}
                            class="glean-surf__title-action"
                            type="button"
                            onclick={() => openDoc(pick.item.id)}
                            title={pick.item.title || t(i18n, "panel.untitled")}
                        >
                            {pick.item.title || t(i18n, "panel.untitled")}
                        </button>
                    </h3>
                    <div class="glean-surf__summary">{summaryText(pick)}</div>
                    <div class="glean-surf__meta">
                        <span class={`glean-carrier-badge glean-carrier-badge--${resolveCarrier(pick.item.contentType)}`}>{carrierLabel(pick)}</span>
                        {#if isWechatUrl(pick.item.url) || isWechatUrl(pick.item.site)}
                            <span class="glean-badge glean-source-wechat" title={displayWechatAuthor(pick.item.author) || t(i18n, "wechat.officialAccount")}>
                                <span class="glean-wechat-dot" aria-hidden="true"></span>{t(i18n, "wechat.name")}{#if displayWechatAuthor(pick.item.author)} · {displayWechatAuthor(pick.item.author)}{/if}
                            </span>
                        {/if}
                        {#if isPinnedToday(pick)}<span class="glean-surf__pinned"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanPin" /></svg>{t(i18n, "resurface.pinnedToday")}</span>{/if}
                        {#if clip && clip.minutes > 0}
                            <span class="glean-tier-badge glean-tier-badge--{resolveReadingTimeTier(clip.minutes)}">
                                · {t(i18n, "panel.minutes", { n: clip.minutes })}
                            </span>
                        {/if}
                        {#if clip && clip.tags && clip.tags.length > 0}
                            <span>#{clip.tags.slice(0, 2).join(" #")}</span>
                        {/if}
                        {#if pick.item.aiTags && pick.item.aiTags.length > 0}
                            <span>✨{pick.item.aiTags.slice(0, 2).join(" ✨")}</span>
                        {/if}
                    </div>
                    {#if pick.reasons.length > 0}
                        <div class="glean-surf__why" title={t(i18n, "resurface.why")}>
                            <span class="glean-surf__why-label">{t(i18n, "resurface.why")}</span>
                            {#each pick.reasons as reason (reason.kind + (reason.site ?? "") + (reason.author ?? ""))}
                                <span class="glean-stale">{reasonText(reason)}</span>
                            {/each}
                        </div>
                    {/if}
                    <div class="glean-surf__acts">
                        <button class="glean-surf-act glean-surf-act--pri" aria-busy={actingId === pick.item.id} aria-disabled={!!actingId || !!undoingId} onclick={() => void act(pick, "read")}>
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg> <span>{t(i18n, "resurface.read")}</span>
                        </button>
                        <button class="glean-surf-act" aria-busy={actingId === pick.item.id} aria-disabled={!!actingId || !!undoingId} onclick={() => void act(pick, "later")}>
                            {t(i18n, "resurface.later")}
                        </button>
                        <button class="glean-surf-act" aria-busy={actingId === pick.item.id} aria-disabled={!!actingId || !!undoingId} onclick={() => void act(pick, "archive")}>
                            {t(i18n, "resurface.archive")}
                        </button>
                        {#if !hasSourceAction(pick.item.contentType, pick.item.url) && pick.item.contentType === "link"}
                            <span class="glean-surf-source-missing">{t(i18n, "clip.sourceMissing")}</span>
                        {/if}
                        <details class="glean-surf-more">
                            <summary class="glean-surf-act glean-surf-more__trigger">⋯ {t(i18n, "library.moreActions")}</summary>
                            <div class="glean-surf-more__menu">
                                <button class="glean-surf-act" aria-busy={actingId === pick.item.id} aria-disabled={!!actingId || !!undoingId} onclick={() => void replacePick(pickIdx, pick)}>
                                    <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanRefresh" /></svg>{t(i18n, "resurface.replace")}
                                </button>
                                <button class="glean-surf-act" class:glean-surf-act--fav-active={clip?.favorite} aria-pressed={Boolean(clip?.favorite)} aria-busy={actingId === pick.item.id} aria-disabled={!!actingId || !!undoingId} title={clip?.favorite ? t(i18n, "roaming.favoriteRemoved") : t(i18n, "roaming.favoriteAction") + " (F)"} onclick={() => void togglePickFavorite(pick)}>
                                    <svg class="glean-icon glean-icon--xs" class:glean-icon--fav={clip?.favorite} aria-hidden="true"><use href={clip?.favorite ? "#iconGleanHeart" : "#iconGleanHeartOutline"} /></svg> <span>{t(i18n, "roaming.favoriteAction")}</span>
                                </button>
                                <button class="glean-surf-act" aria-pressed={isPinnedToday(pick)} aria-busy={actingId === pick.item.id} aria-disabled={!!actingId || !!undoingId} onclick={() => void togglePin(pick)}>
                                    <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanPin" /></svg>{t(i18n, isPinnedToday(pick) ? "resurface.unpinToday" : "resurface.pinToday")}
                                </button>
                                {#if hasSourceAction(pick.item.contentType, pick.item.url)}
                                    <button class="glean-surf-act" aria-busy={actingId === pick.item.id} disabled={actingId === pick.item.id} onclick={() => openSource(pick)}>
                                        <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanExternal" /></svg>{t(i18n, "clip.openSource")}
                                    </button>
                                {/if}
                                <button class="glean-surf-act" title={t(i18n, "action.copyBlockRef")} aria-label={t(i18n, "action.copyBlockRef")} onclick={() => void copyPickBlockRef(pick.item)}>
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg> <span>{t(i18n, "action.copyBlockRef")}</span>
                                </button>
                                <button class="glean-surf-act" title={(clip?.snapshot ? t(i18n, "snapshot.open") : t(i18n, "snapshot.take")) + " (S)"} aria-label={clip?.snapshot ? t(i18n, "snapshot.open") : t(i18n, "snapshot.take")} onclick={() => void openOrTakePickSnapshot(pick)}>
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCamera" /></svg> <span>{clip?.snapshot ? t(i18n, "snapshot.open") : t(i18n, "snapshot.take")}</span>
                                </button>
                                <button class="glean-surf-act" title={t(i18n, "citation.copyGBT") + " (C)"} aria-label={t(i18n, "citation.copyGBT")} onclick={() => void copyPickCitation(pick, "gbt")}>
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg> <span>{t(i18n, "citation.copyGBT")}</span>
                                </button>
                                <details class="glean-citation-more" data-keep-popover-open>
                                    <summary class="glean-surf-act" data-keep-popover-open>BibTeX / APA / MLA</summary>
                                    <div class="glean-citation-more__list">
                                        <button class="glean-surf-act" title={t(i18n, "citation.copyBibTeX") + " (Shift+C)"} aria-label={t(i18n, "citation.copyBibTeX")} onclick={() => void copyPickCitation(pick, "bibtex")}>
                                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArchive" /></svg> <span>BibTeX</span>
                                        </button>
                                        <button class="glean-surf-act" title={t(i18n, "citation.copyAPA")} aria-label={t(i18n, "citation.copyAPA")} onclick={() => void copyPickCitation(pick, "apa")}>
                                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanLocal" /></svg> <span>APA</span>
                                        </button>
                                        <button class="glean-surf-act" title={t(i18n, "citation.copyMLA")} aria-label={t(i18n, "citation.copyMLA")} onclick={() => void copyPickCitation(pick, "mla")}>
                                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCard" /></svg> <span>MLA</span>
                                        </button>
                                    </div>
                                </details>
                            </div>
                        </details>
                    </div>
                    </article>
                </div>
            {/each}
            <div class="glean-surf-foot">{t(i18n, "resurface.calmNote")}</div>
        </div>
    {/if}

    {#if facade.isMobile && onQuickCapture && onQuickSearch && onQuickCandidates}
        <section class="glean-resurface__quick" aria-labelledby={quickActionsTitleId}>
            <h2 id={quickActionsTitleId} class="glean-resurface__quick-title">{t(i18n, "resurface.quickActions")}</h2>
            <div class="glean-resurface__quick-actions" role="group" aria-labelledby={quickActionsTitleId}>
                <button type="button" class="glean-resurface__quick-action glean-resurface__quick-action--primary" aria-busy={quickCaptureBusy} disabled={quickCaptureBusy} onclick={onQuickCapture}>
                    <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanPlus" /></svg>
                    <span>{t(i18n, "resurface.quickCapture")}</span>
                </button>
                <button type="button" class="glean-resurface__quick-action" onclick={onQuickSearch}>
                    <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                    <span>{t(i18n, "resurface.quickSearch")}</span>
                </button>
                <button type="button" class="glean-resurface__quick-action" onclick={onQuickCandidates}>
                    <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanInbox" /></svg>
                    <span>{t(i18n, "resurface.quickCandidates")}</span>
                </button>
            </div>
        </section>
    {/if}

    {#if recentCaptured.length > 0}
        <section class="glean-surf-recent-captured" aria-label={t(i18n, "resurface.recentCaptured")}>
            <div class="glean-surf-recent-captured__title">
                <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanWheat" /></svg>
                <span>{t(i18n, "resurface.recentCaptured")}</span>
            </div>
            <div class="glean-surf-recent-captured__list">
                {#each recentCaptured as item (item.id)}
                    <button
                        type="button"
                        class="glean-surf-recent-captured__item"
                        onclick={() => openDoc(item.id)}
                        title={item.title}
                    >
                        <span class="glean-surf-recent-captured__dot" aria-hidden="true"></span>
                        <span class="glean-surf-recent-captured__text">{item.title}</span>
                    </button>
                {/each}
            </div>
        </section>
    {/if}
</div>

<style>
    .glean-resurface__streak-banner {
        margin-top: var(--glean-space-3);
    }

    .glean-resurface__roaming-action {
        margin-top: var(--glean-space-3-5);
    }

    .glean-resurface .glean-surf__title-action {
        display: -webkit-box;
        width: 100%;
        padding: 0;
        overflow: hidden;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        line-height: inherit;
        line-clamp: 3;
        text-align: start;
        text-overflow: ellipsis;
        white-space: normal;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
    }
</style>
