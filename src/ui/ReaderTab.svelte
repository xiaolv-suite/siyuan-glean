<script lang="ts">
    import AuthorEditor from "./AuthorEditor.svelte";
    import AnnotationEditorDialog from "./AnnotationEditorDialog.svelte";
    import ReaderSearch from "./ReaderSearch.svelte";
    import AiThinkingCard from "./AiThinkingCard.svelte";
    import { isFindShortcut } from "../domain/reader-search";
    /**
     * 内嵌阅读页签（D-0029/T-1730）：左 = 真实思源编辑器（Protyle 实例），右 = 伴生栏。
     * 页签打开文档是"打开动作"，不写五态（D-0021）；伴生栏动作与三画布共用同一服务，
     * 按真实成功数反馈。编辑/标注经 Protyle 走内核事务，插件不另存正文副本。
     */
    import { openTab } from "siyuan";
    import { showMessage, withLvAiWait } from "../libs/notice";
    import { isNativeDockVisible, showDocTreeNativeMenu, toggleNativeDock } from "../libs/lv-notice-kit";
    import { exportMdContent, querySql } from "../api/client";
    import type { ProtyleController } from "../libs/protyle-controller";
    import ProtyleHost from "./ProtyleHost.svelte";
    import ReadingPositionControls from "./ReadingPositionControls.svelte";
    import { onMount, tick, untrack } from "svelte";
    import { SvelteSet } from "svelte/reactivity";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
import { aiFailureKey } from "../libs/ai-feedback";
    import { fulltextBodyState } from "../domain/content";
    import { canCountReading, createReadingTimer, readingTimerMinutes, setReadingTimerActive, type ReadingTimerState } from "../domain/reading-timer";
    import { hasSourceAction, resolveCarrier, sourceUrlForCarrier } from "../domain/carrier";
    import { isWechatUrl, cleanWechatArticleUrl, extractWechatAuthor, displayWechatAuthor, cleanWechatNoise, repairWechatContent } from "../domain/wechat";
    import { chunkSpeechText, clampSpeechRate, resumeSpeechChunkIndex, speechLanguage } from "../domain/speech";
    import type { ClipStatus } from "../domain/schema";
    import { DEFAULT_SETTINGS, type GleanSettings } from "../services/settings";
    import { safeDocTitleFromHPath } from "../libs/lv-notice-kit";
    import {
        batchSetStatusDetailed,
        captureDocument,
        fetchDocMeta,
        isDocumentReadonly,
        measureClipBody,
        readClipContext,
        saveReadingMinutes,
        writeClip,
        markGleanHighlight,
        markHighlightCarded,
        type ReadingClipContext,
    } from "../services/clip-store";
    import { snapshotClip } from "../services/snapshot-service";
    import { recordReadingDone } from "../services/checkin-bridge";
    import { excerptFromSelection, extractSelectionSearchContext, insertQuoteExcerpt, selectionBelongsToHost } from "../services/excerpt-service";
    import { makeQuoteCardPreview } from "./flashcard-dialog";
    import { openQuoteCardDialog } from "./quote-card-dialog";
    import { openDocSlicingDialog } from "./doc-slicing-dialog";
    import { openWeReadGuideDialog } from "./weread-guide-dialog";
    import { purifyWechatArticle } from "../services/wechat-service";
    import { buildSliceStartMap, planDocSlices } from "../domain/doc-slicing";
    import { findRelatedOutcome, type RelatedReason } from "../services/enrich-service";
    import { resolveGleanAiDestination } from "../services/ai-gateway";
    import { pickNextUnread } from "../services/resurface-service";
    import { articleQuestionEnabled, clearReaderMarkdownCache, insertAiCalloutToDocument, readerAiEnabled, readerArticleQuestion, readerSummarize, readerTranslate, saveReaderSummary } from "../services/reader-ai";
    import { syncMetaCalloutToDocument } from "../services/meta-callout-service";
    import ClipStatusActions from "./ClipStatusActions.svelte";
    import ClipRankControls from "./ClipRankControls.svelte";
    import ActionPopover from "./ActionPopover.svelte";
    import { openFormattingDialog } from "./formatting-dialog";
    import { loadUiPrefs, saveUiPrefs } from "../services/prefs";
    import { normalizeReaderAppearance, type ReaderAppearance } from "../domain/ui-prefs";
    import { loadReadingOutline } from "../services/outline-service";
    import { listDocHighlights, type HighlightItem } from "../services/highlights";
    import {
        addAnnotationReply, createArticleHighlightsDoc, deleteAnnotation,
        resolveExcerptBlockId, setAnnotationColor, setAnnotationTag, updateHighlightMemo,
    } from "../services/highlights";
    import {
        BUILTIN_ANNOTATION_TAGS, formatHighlightShare, formatHighlightTime, resolveAnnotationTagDisplay,
        type AnnotationKind, type AnnotationTagDef,
    } from "../domain/highlights";
    import {
        findTextRangeInWysiwyg, getWhaleBridgeStatus, loadWhaleCustomTags, openWhaleCommentEditor,
        refreshWhaleDecorationsInProtyle, toggleWhaleSlideMode, triggerWhaleAddComment, triggerWhaleAiExplain,
        waitForWysiwygReady,
    } from "../services/siyuan-comment-bridge";
    import { createOutlineMindmapDocument } from "../services/doc-slicing-service";
    import {
        appendPersonFactSafely,
        captureQuoteToCommonSafely,
        ensurePersonSafely,
        formatTaskHorizonItem,
        getBridgeSafely,
        searchPersonSafely,
        sendExtractToCardsSafely,
        type ContactsPerson,
        type TaskHorizonActionPayload,
    } from "../libs/ecosystem-bridge-kit";
    import {
        createReadPointObserver,
        isInWysiwygEditor,
        scrollAndPulseReadPoint,
        showDetachedPulseOverlay,
        type ReadPointObserverHandle,
    } from "../libs/read-point-observer";
    import { saveReadPoint } from "../services/clip-store";
    import { pickRoamingArticle } from "../domain/roaming";
    import { openRoamingDialog } from "./roaming-dialog";
    import { formatCitation, citationSuccessKey, type CitationFormat } from "../domain/citation";
    import FoldedReaderView from "./FoldedReaderView.svelte";
    import { loadDocumentFoldNodes, enrichFoldNodesWithAi } from "../services/folded-reader-service";
    import { applyGlobalFoldLevel, toggleNodeFold, type FoldLevel, type FoldNode } from "../domain/folded-reader";
    import { estimateReadingPercentage } from "../domain/reading-position";
    import { findMatchingOutlineItemId, type OutlineItem } from "../domain/outline";
    import { findActiveOutlineItemInHost } from "../libs/reading-position";
    import { readerShortcut } from "../domain/reader-shortcuts";
    import { createLatestRequestGate } from "../libs/latest-request";
    import { loadIndex } from "../services/index-store";
    import { resolveReadingTimeTier } from "../domain/library-view";
    import { lvNotify, showNotice } from "../libs/notice";
    import type { RecentReadingEntry } from "../domain/recent-reading";
    import { buildHighlightFlashcardPayload } from "../domain/highlight-pipeline";
    import { dispatchHighlightToFlashcard } from "../services/highlight-pipeline-service";
    import { extractDeliveryKey } from "../domain/extract-delivery";
    import { recordDailyNoteReading } from "../services/daily-note-service";
    import { executeGhostreader, insertGhostreaderCallout } from "../services/ghostreader-service";
    import { GHOSTREADER_ACTIONS, type GhostreaderAction, type GhostreaderResult } from "../domain/ghostreader";
    import { generateDocHighlightOutline, exportHighlightOutlineAsDoc } from "../services/highlight-outline-service";
    import { renderStructuredOutlineMarkdown, type HighlightOutlineTree } from "../domain/highlight-outline";

    interface Props {
        facade: GleanFacade;
        tabId: string;
    }

    let { facade, tabId }: Props = $props();
    const i18n = $derived(facade.i18n);
    const instanceId = $props.id();
    const idFor = (part: string) => `glean-reader-${instanceId}-${part}`;
    const sidebarId = idFor("sidebar");
    const shortcutsId = idFor("shortcuts");
    const sidebarTitleId = idFor("sidebar-title");
    const moreToolsId = idFor("more-tools");
    const moreToolsTitleId = idFor("more-tools-title");
    const recentTitleId = idFor("recent-title");
    const appearancePanelId = idFor("appearance-panel");
    const appearanceTitleId = idFor("appearance-title");
    const toolsAppearancePanelId = idFor("tools-appearance-panel");
    const toolsAppearanceTitleId = idFor("tools-appearance-title");
    const outlineTitleId = idFor("outline-title");
    const highlightsTitleId = idFor("highlights-title");
    const excerptTitleId = idFor("excerpt-title");
    const speechTitleId = idFor("speech-title");
    const speechRateId = idFor("speech-rate");
    const aiTitleId = idFor("ai-title");
    const rankTitleId = idFor("rank-title");

    let docId = $state<string | null>(null);
    let docTitle = $state<string>("");
    let addingToLibrary = $state(false);
    let activeSettings = $state<GleanSettings>(untrack(() => facade.settings));
    let mode = $state<"read" | "edit">(DEFAULT_SETTINGS.reader.defaultMode);
    let protyleHost = $state<HTMLDivElement | null>(null);
    let protyleInstance = $state<unknown>(null);
    let protyleStage = $state<"loading" | "ready" | "failed">("loading");
    let excerptRange = $state<Range | null>(null);
    let selectionBarLock = false;
    let selectionBarLockTimer: number | null = null;
    function lockSelectionBar(): void {
        selectionBarLock = true;
        if (selectionBarLockTimer !== null) window.clearTimeout(selectionBarLockTimer);
        selectionBarLockTimer = window.setTimeout(() => {
            selectionBarLock = false;
            selectionBarLockTimer = null;
        }, 500);
    }
    let readPointHandle: ReadPointObserverHandle | null = null;
    let readPointRestoredDocId = "";
    let wechatAutoScannedDocId = "";
    let modeSwitchAnchorId: string | null = null;
    let purifying = $state(false);
    let copyingCleanBody = $state(false);
    let readerRoot = $state<HTMLDivElement | null>(null);
    let sidebarCollapsed = $state(false);
    let immersive = $state(false);
    let zenMode = $state(false);

    let prevSidebarCollapsed = false;
    let prevLeftDock = false;
    let prevRightDock = false;
    let prevBottomDock = false;

    function toggleZenMode(): void {
        zenMode = !zenMode;
        if (zenMode) {
            prevSidebarCollapsed = sidebarCollapsed;
            sidebarCollapsed = true;
            try {
                prevLeftDock = Boolean(isNativeDockVisible("Left"));
                prevRightDock = Boolean(isNativeDockVisible("Right"));
                prevBottomDock = Boolean(isNativeDockVisible("Bottom"));
                if (prevLeftDock) toggleNativeDock("Left", false);
                if (prevRightDock) toggleNativeDock("Right", false);
                if (prevBottomDock) toggleNativeDock("Bottom", false);
            } catch {}
        } else {
            sidebarCollapsed = prevSidebarCollapsed;
            try {
                if (prevLeftDock) toggleNativeDock("Left", true);
                if (prevRightDock) toggleNativeDock("Right", true);
                if (prevBottomDock) toggleNativeDock("Bottom", true);
            } catch {}
            prevLeftDock = false;
            prevRightDock = false;
            prevBottomDock = false;
        }
    }

    function exitZenMode(): void {
        if (zenMode) {
            zenMode = false;
            sidebarCollapsed = prevSidebarCollapsed;
            try {
                if (prevLeftDock) toggleNativeDock("Left", true);
                if (prevRightDock) toggleNativeDock("Right", true);
                if (prevBottomDock) toggleNativeDock("Bottom", true);
            } catch {}
            prevLeftDock = false;
            prevRightDock = false;
            prevBottomDock = false;
        }
    }
    let sidebarBusy = $state(false);
    let shortcutHelp = $state(false);
    let moreToolsOpen = $state(false);
    let appearanceOpen = $state(false);
    let toolsAppearanceOpen = $state(false);
    let excerptBusy = $state(false);
    let appearanceTouched = false;
    let sidebarTouched = false;
    const contextRequests = createLatestRequestGate();
    let sessionGeneration = 0;
    let mounted = false;
    let context = $state<ReadingClipContext | null>(null);
    // 上下文与正文宿主是两条独立的读取链：正文已经挂载时，伴生栏仍需要明确区分读取中与读取失败。
    let contextLoading = $state(false);
    let contextError = $state(false);
    let measuring = $state(false);
    let snapping = $state(false);
    let statusBusy = $state(false);
    let protyle = $state<ProtyleController | null>(null);
    let readerAppearance = $state<ReaderAppearance>(normalizeReaderAppearance(undefined));
    let appearanceBusy = $state(false);
    let searchOpen = $state(false);
    let docHighlights = $state<HighlightItem[]>([]);
    let highlightsLoading = $state(false);
    let marginNotesOpen = $state(false);
    let highlightsOpen = $state(true);
    let outlineOpen = $state(true);
    let isShortViewport = $state(false);

    function onOutlineToggle(event: Event): void {
        const details = event.currentTarget as HTMLDetailsElement;
        outlineOpen = details.open;
        if (isShortViewport && outlineOpen) {
            highlightsOpen = false;
        }
    }

    function onHighlightsToggle(event: Event): void {
        const details = event.currentTarget as HTMLDetailsElement;
        highlightsOpen = details.open;
        if (isShortViewport && highlightsOpen) {
            outlineOpen = false;
        }
    }
    let readingPercentage = $state<number | null>(null);
    let memoInputOpen = $state(false);
    let memoDraft = $state("");
    let outline = $state<OutlineItem[]>([]);
    let outlineFilter = $state("");
    const visibleOutline = $derived(
        outlineFilter.trim()
            ? outline.filter((item) => item.title.toLowerCase().includes(outlineFilter.trim().toLowerCase()))
            : outline
    );
    const docSlices = $derived(planDocSlices(outline, { totalWords: context?.words }).slices);
    const sliceStartMap = $derived(buildSliceStartMap(docSlices));
    let outlineLoading = $state(false);
    let outlineError = $state(false);
    let outlineGeneration = 0;
    let currentBookmarkBlockId = $state<string | null>(null);
    let pendingScrollBlockId = $state<string | null>(null);
    let docAttrReadonly = $state(false);
    const showBackToTop = $derived((readingPercentage ?? 0) > 12);
    let companionTab = $state<"outline" | "notes" | "ai" | "tools" | "fold" | "all">("notes");
    let foldNodes = $state<FoldNode[]>([]);
    let foldLoading = $state(false);
    let foldGlobalLevel = $state<FoldLevel>(2);
    let foldAiBusy = $state(false);
    let foldAiEnriched = $state(false);
    let foldAiAbort = $state.raw<AbortController | null>(null);

    function cancelFoldAiEnrich(): void {
        if (!foldAiBusy) return;
        foldAiAbort?.abort();
        foldAiAbort = null;
        foldAiBusy = false;
    }

    async function runFoldAiEnrich(): Promise<void> {
        if (!docId || foldNodes.length === 0 || foldAiBusy) return;
        const targetDocId = docId;
        const generation = sessionGeneration;
        const controller = new AbortController();
        foldAiAbort = controller;
        foldAiBusy = true;
        try {
            const res = await enrichFoldNodesWithAi(facade.pluginInstance, activeSettings, foldNodes, 12, { signal: controller.signal });
            if (controller.signal.aborted || res.aborted || !currentSession(targetDocId, generation)) return;
            if (res.ok && res.count > 0) {
                foldNodes = res.nodes;
                foldAiEnriched = true;
                showMessage(t(i18n, "msg.foldAiEnriched", {count: res.count}), 3000);
            } else {
                showMessage(res.error || t(i18n, "msg.foldAiEmpty"), 3500);
            }
        } catch (err) {
            if (!controller.signal.aborted) {
                console.warn("[glean] runFoldAiEnrich failed:", err);
                showMessage(t(i18n, "msg.foldAiFailed") + (err instanceof Error ? err.message : String(err)), 3500);
            }
        } finally {
            if (foldAiAbort === controller) {
                foldAiAbort = null;
                foldAiBusy = false;
            }
        }
    }

    async function refreshFoldNodes(targetDocId = docId): Promise<void> {
        if (!targetDocId) return;
        const generation = sessionGeneration;
        foldLoading = true;
        try {
            const loaded = await loadDocumentFoldNodes(targetDocId, foldGlobalLevel);
            if (docId === targetDocId && generation === sessionGeneration && mounted) {
                foldNodes = loaded;
            }
        } catch (err) {
            console.warn("[glean] loadDocumentFoldNodes failed:", err);
            if (docId === targetDocId && generation === sessionGeneration && mounted) {
                foldNodes = [];
            }
        } finally {
            if (docId === targetDocId && generation === sessionGeneration && mounted) {
                foldLoading = false;
            }
        }
    }

    function toggleFoldReader(): void {
        if (sidebarCollapsed || immersive) {
            sidebarCollapsed = false;
            immersive = false;
        }
        companionTab = companionTab === "fold" ? "outline" : "fold";
        if (companionTab === "fold" && foldNodes.length === 0) {
            void refreshFoldNodes();
        }
    }
    let highlightColorFilter = $state<string>("");
    let highlightKindFilter = $state<"" | AnnotationKind>("");
    let highlightTagFilter = $state<string>("");
    let highlightFilter = $state<string>("");
    let whaleStatus = $state(getWhaleBridgeStatus(untrack(() => facade.pluginInstance.app)));
    let whaleCustomTags = $state<AnnotationTagDef[]>([...BUILTIN_ANNOTATION_TAGS]);
    let editingMemoId = $state<string>("");
    let editingMemoDraft = $state<string>("");
    let editingMemoBusy = $state(false);
    let replyingId = $state<string>("");
    let replyDraft = $state<string>("");
    let replyBusy = $state(false);
    let tagPickerId = $state<string>("");
    let confirmDeleteId = $state<string>("");
    let editingAnnotation = $state<HighlightItem | null>(null);
    let authorArticles = $state<Array<{ id: string; title: string }>>([]);
    let seriesArticles = $state<Array<{ id: string; title: string }>>([]);
    let wechatAvatar = $state<string | null>(null);
    const isWechatArticle = $derived(Boolean(context?.url && isWechatUrl(context.url)) || Boolean(context?.site && isWechatUrl(context.site)));
    const activeOutlineId = $derived(
        findActiveOutlineItemInHost(protyleHost, outline, currentBookmarkBlockId) ?? findMatchingOutlineItemId(outline, currentBookmarkBlockId)
    );
    const visibleDocHighlights = $derived.by(() => {
        let list = docHighlights;
        if (highlightColorFilter) {
            list = list.filter((h) => (h.color || "yellow") === highlightColorFilter);
        }
        if (highlightKindFilter) {
            list = list.filter((h) => (h.annotationKind ?? "glean") === highlightKindFilter);
        }
        if (highlightTagFilter) {
            list = list.filter((h) => h.annotationTag === highlightTagFilter);
        }
        if (highlightFilter.trim()) {
            const q = highlightFilter.trim().toLowerCase();
            list = list.filter((h) =>
                h.text.toLowerCase().includes(q)
                || (h.memo || "").toLowerCase().includes(q)
                || (h.replies || []).some((r) => r.md.toLowerCase().includes(q))
            );
        }
        return list;
    });
    const highlightColorsPresent = $derived(
        Array.from(new Set(docHighlights.map((h) => h.color || "yellow")))
    );
    const highlightKindsPresent = $derived(
        Array.from(new Set(docHighlights.map((h) => h.annotationKind ?? "glean")))
    );
    const highlightTagsPresent = $derived(
        Array.from(new Set(docHighlights.map((h) => h.annotationTag || "").filter(Boolean)))
    );
    const estReadingMinutes = $derived(context?.words ? Math.max(1, Math.round(context.words / 350)) : undefined);
    const remainingMinutes = $derived(
        estReadingMinutes && (readingPercentage ?? 0) < 100
            ? Math.max(1, Math.round(estReadingMinutes * (1 - (readingPercentage ?? 0) / 100)))
            : null
    );
    const readingTimeTier = $derived(resolveReadingTimeTier(estReadingMinutes));
    const hasCardsInstalled = $derived(typeof window !== "undefined" && Boolean(getBridgeSafely("cards")));
    const hasExamInstalled = $derived(typeof window !== "undefined" && Boolean(getBridgeSafely("exam")));
    const hasContactsInstalled = $derived(typeof window !== "undefined" && Boolean(getBridgeSafely("contacts")));
    const hasCommonInstalled = $derived(typeof window !== "undefined" && Boolean(getBridgeSafely("common")));
    let authorPerson = $state<ContactsPerson | null>(null);

    $effect(() => {
        const authorName = context?.author?.trim();
        const targetDocId = docId;
        const generation = sessionGeneration;
        let active = true;
        if (authorName && hasContactsInstalled && targetDocId) {
            void searchPersonSafely(authorName).then((person) => {
                if (active && mounted && currentSession(targetDocId, generation)) {
                    authorPerson = person;
                }
            });
        } else {
            authorPerson = null;
        }
        return () => {
            active = false;
        };
    });
    let recentReadings = $state<RecentReadingEntry[]>([]);
    let readingTimer = $state<ReadingTimerState>(createReadingTimer());
    let readingTimerDocId = "";
    let readingTimerExpectedRaw: string | null = null;
    let readingTimerExpectedLocation: { box: string; hpath: string } | null = null;
    let readingTimerPersistedMinutes = 0;
    const displayedReadMinutes = $derived(Math.max(context?.readMinutes ?? 0, readingTimerMinutes(readingTimer)));

    function readingTimerHostReady(): boolean {
        const host = protyleHost;
        if (!host || !host.isConnected || host.getClientRects().length === 0) return false;
        return Boolean(host.querySelector(".protyle-wysiwyg, .protyle-content, .protyle-preview"));
    }

    function readingTimerEligible(): boolean {
        return Boolean(docId && context && mode === "read" && typeof document !== "undefined" && canCountReading({
            visible: document.visibilityState === "visible",
            focused: typeof document.hasFocus !== "function" || document.hasFocus(),
            hostReady: readingTimerHostReady(),
            contentType: context.contentType,
            bodyState,
        }));
    }

    function syncReadingTimer(): void {
        if (!readingTimerDocId) return;
        readingTimer = setReadingTimerActive(readingTimer, readingTimerEligible(), Date.now());
    }

    async function flushReadingMinutes(id: string, generation: number, options?: { silent?: boolean }): Promise<boolean> {
        if (readingTimerDocId !== id || !readingTimerExpectedLocation) return true;
        readingTimer = setReadingTimerActive(readingTimer, false, Date.now());
        const minutes = readingTimerMinutes(readingTimer);
        const persisted = Math.max(readingTimerPersistedMinutes, context?.id === id ? context.readMinutes ?? 0 : 0);
        if (minutes <= persisted || minutes <= 0) return true;
        const expectedRaw = readingTimerExpectedRaw;
        const expectedLocation = readingTimerExpectedLocation;
        readingTimerPersistedMinutes = minutes;
        try {
            const saved = await saveReadingMinutes(facade.pluginInstance, id, {
                raw: expectedRaw,
                location: expectedLocation,
            }, minutes);
            if (readingTimerDocId === id) {
                readingTimerExpectedRaw = saved.raw;
                readingTimerPersistedMinutes = saved.minutes;
            }
            if (currentSession(id, generation) && context?.id === id) {
                context = { ...context, readMinutes: saved.minutes, readMinutesRaw: saved.raw };
            }
            if ((facade.pluginInstance as { loaded?: boolean })?.loaded !== false) {
                facade.notifyDataChanged();
            }
            return true;
        } catch (error) {
            if (readingTimerDocId === id && readingTimerPersistedMinutes === minutes) {
                readingTimerPersistedMinutes = persisted;
            }
            console.debug("[glean] 真实阅读分钟写回失败:", error);
            if (!options?.silent && mounted) {
                showMessage(t(i18n, "reader.readMinutesSaveFailed"), 3500);
            }
            return false;
        }
    }

    function refreshRecentReadings(): void {
        recentReadings = facade.recentReadingDocuments().map((entry) => ({ ...entry }));
    }

    function openRecentReading(entry: RecentReadingEntry): void {
        if (entry.id === docId) return;
        facade.openReader(entry.id);
    }

    onMount(() => {
        mounted = true;
        activeSettings = facade.settings;
        docId = facade.consumeReaderFocus(tabId);
        refreshRecentReadings();
        mode = activeSettings.reader.defaultMode;
        void loadUiPrefs(facade.pluginInstance).then((prefs) => {
            if (!mounted) return;
            if (!appearanceTouched) readerAppearance = prefs.readerAppearance;
            if (!sidebarTouched) sidebarCollapsed = prefs.readerSidebarCollapsed;
            if (!speechRateTouched && prefs.speechRate) speechRate = prefs.speechRate;
        }).catch(() => undefined);
        const root = readerRoot;
        root?.addEventListener("keydown", onReaderKey);
        const checkShortHeight = () => {
            isShortViewport = typeof window !== "undefined" && window.innerHeight < 600;
            if (isShortViewport && outlineOpen && highlightsOpen) {
                highlightsOpen = false;
            }
        };
        checkShortHeight();
        window.addEventListener("resize", checkShortHeight);
        return () => {
            const closingDocId = readingTimerDocId || docId;
            const closingGen = sessionGeneration;
            mounted = false;
            if (closingDocId) {
                void flushReadingMinutes(closingDocId, closingGen, { silent: true });
            } else {
                readingTimer = setReadingTimerActive(readingTimer, false, Date.now());
            }
            sessionGeneration += 1;
            aiAbort?.abort();
            aiAbort = null;
            ghostreaderAbort?.abort();
            ghostreaderAbort = null;
            foldAiAbort?.abort();
            foldAiAbort = null;
            contextRequests.invalidate();
            readPointHandle?.disconnect();
            readPointHandle = null;
            if (selectionBarLockTimer !== null) window.clearTimeout(selectionBarLockTimer);
            selectionBarLockTimer = null;
            root?.removeEventListener("keydown", onReaderKey);
            window.removeEventListener("resize", checkShortHeight);
        };
    });

    type SpeechState = "idle" | "playing" | "paused";
    type SpeechScope = "full" | "selection";
    let speechState = $state<SpeechState>("idle");
    let speechScope = $state<SpeechScope | null>(null);
    let speechRate = $state(1);
    let speechRateTouched = false;
    let speechChunks = $state<string[]>([]);
    let speechChunkIndex = $state(0);
    let speechGeneration = 0;
    const speechSupported = $derived(!facade.isMobile && typeof window !== "undefined" && "speechSynthesis" in window);

    const bodyState = $derived(context ? fulltextBodyState(context.contentType, context.words) : "na");

    // 摘录段（D-0030）：selectionchange 限定正文宿主内；blockId 空=定位失败，仅可复制。
    let excerpt = $state<{ text: string; blockId: string } | null>(null);

    // AI 伴读段（D-0030）：显式动作 + 结果卡；额度与富化共享。
    const aiOn = $derived(readerAiEnabled(activeSettings));
    // 自定义通道缺少地址、模型或密钥名时，动作保持禁用并给出可操作的配置入口。
    // 思源内置通道的具体模型由内核设置管理，插件不臆测其可用性。
    const aiConfigured = $derived(
        activeSettings.ai.channel !== "custom"
            || Boolean(activeSettings.ai.customBaseUrl.trim() && activeSettings.ai.customModel.trim() && activeSettings.ai.customSecretName.trim())
    );
    const aiReady = $derived(aiOn && aiConfigured);
    const relatedOn = $derived(aiReady && activeSettings.ai.relatedWhileReading);
    const articleQuestionOn = $derived(articleQuestionEnabled(activeSettings));
    const channelLabel = $derived.by(() => {
        const dest = resolveGleanAiDestination(activeSettings);
        if (activeSettings.ai.channel === "custom") {
            const model = activeSettings.ai.customModel.trim();
            return model ? `${dest.label} · ${model}` : dest.label;
        }
        return dest.kind === "siyuan" ? t(i18n, "reader.aiChannelSiyuan") : dest.label;
    });
    let aiBusy = $state("");
    let aiAbort = $state.raw<AbortController | null>(null);
    let aiResult = $state<{ kind: "summarize" | "translate"; action: string; text: string; scope: "full" | "selection" } | null>(null);
    let summarySaving = $state(false);
    let summarySaved = $state(false);
    let insertingCallout = $state(false);
    let question = $state("");
    let questionMode = $state<"full" | "selection">("full");
    let questionResult = $state<{ answer: string; evidence: string[]; truncated: boolean; scope: "full" | "selection" } | null>(null);
    let relatedItems = $state<Array<{ id: string; title: string }>>([]);
    let relatedShown = $state(false);
    let relatedReason = $state<RelatedReason | null>(null);

    // Ghostreader 行内伴读状态
    let ghostreaderOpen = $state(false);
    let ghostreaderCustomQuery = $state("");
    let ghostreaderBusy = $state(false);
    let ghostreaderHasChunk = $state(false);
    let ghostreaderAbort = $state.raw<AbortController | null>(null);
    let ghostreaderResult = $state<GhostreaderResult | null>(null);
    let ghostreaderSnapshot = $state<{ docId: string; text: string; sourceBlockId?: string } | null>(null);
    let ghostreaderResultDocId = $state("");
    let ghostreaderInserting = $state(false);

    // 高亮结构化大纲状态
    let outlineMode = $state<"headings" | "highlights">("headings");
    let highlightOutlineTree = $state<HighlightOutlineTree | null>(null);
    let highlightOutlineLoading = $state(false);
    let highlightOutlineExporting = $state(false);
    let highlightOutlineGeneration = 0;
    let authorArticlesGeneration = 0;

    let activeTtsEl: HTMLElement | null = null;
    let clearActiveTtsOverlay: (() => void) | null = null;

    function highlightTtsChunk(chunk: string): void {
        if (!protyleHost || !chunk.trim()) return;
        clearTtsHighlight();
        const snippet = chunk.trim().slice(0, 30);
        const candidates = mode === "read"
            ? Array.from(protyleHost.querySelectorAll<HTMLElement>(".protyle-preview:not(.fn__none) .b3-typography [id], .protyle-preview:not(.fn__none) [data-node-id]"))
            : Array.from(protyleHost.querySelectorAll<HTMLElement>(".protyle-wysiwyg:not(.fn__none) [data-node-id]"));
        const blocks = candidates.length > 0
            ? candidates
            : Array.from(protyleHost.querySelectorAll<HTMLElement>("[data-node-id]"));
        for (const el of blocks) {
            if (el.textContent && el.textContent.includes(snippet)) {
                el.scrollIntoView({ behavior: (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth", block: "nearest" });
                if (isInWysiwygEditor(el)) {
                    clearActiveTtsOverlay = showDetachedPulseOverlay(el, 0, "glean-tts-reading-pulse");
                } else {
                    el.classList.add("glean-tts-reading-pulse");
                    activeTtsEl = el;
                }
                break;
            }
        }
    }

    function clearTtsHighlight(): void {
        if (clearActiveTtsOverlay) {
            clearActiveTtsOverlay();
            clearActiveTtsOverlay = null;
        }
        if (activeTtsEl) {
            activeTtsEl.classList.remove("glean-tts-reading-pulse");
            activeTtsEl = null;
        }
    }

    function speechSynthesis(): SpeechSynthesis | null {
        return speechSupported ? window.speechSynthesis : null;
    }

    function stopSpeech(): void {
        speechGeneration += 1;
        speechSynthesis()?.cancel();
        clearTtsHighlight();
        speechState = "idle";
    }

    function speechBodyText(): string {
        const root = protyleHost?.querySelector<HTMLElement>(".protyle-wysiwyg") ?? protyleHost;
        return root?.innerText ?? "";
    }

    function speakCurrent(generation: number): void {
        if (generation !== speechGeneration || speechState !== "playing") return;
        const api = speechSynthesis();
        const chunk = speechChunks[speechChunkIndex];
        if (!api || !chunk) {
            speechState = "idle";
            clearTtsHighlight();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = speechLanguage(chunk);
        utterance.rate = speechRate;
        utterance.onend = () => {
            if (generation !== speechGeneration || speechState !== "playing") return;
            speechChunkIndex += 1;
            if (speechChunkIndex >= speechChunks.length) {
                speechState = "idle";
                clearTtsHighlight();
                return;
            }
            speakCurrent(generation);
        };
        utterance.onerror = (event) => {
            clearTtsHighlight();
            if (generation !== speechGeneration || event.error === "canceled" || event.error === "interrupted") return;
            speechState = "idle";
            showMessage(t(i18n, "reader.speechFailed"), 3000);
        };
        highlightTtsChunk(chunk);
        api.speak(utterance);
    }

    function startSpeech(scope: SpeechScope, continueCurrent = false): void {
        const api = speechSynthesis();
        if (!api) return;
        if (!continueCurrent) {
            const text = scope === "selection" ? excerpt?.text ?? "" : speechBodyText();
            speechChunks = chunkSpeechText(text);
            speechChunkIndex = 0;
            speechScope = scope;
        } else {
            speechChunkIndex = resumeSpeechChunkIndex(speechChunks, speechChunkIndex);
        }
        if (speechChunkIndex >= speechChunks.length) {
            showMessage(t(i18n, "reader.speechNoText"), 2500);
            return;
        }
        api.cancel();
        speechGeneration += 1;
        speechState = "playing";
        speakCurrent(speechGeneration);
    }

    function toggleSpeechPause(): void {
        const api = speechSynthesis();
        if (!api) return;
        if (speechState === "playing") {
            api.pause();
            speechState = "paused";
        } else if (speechState === "paused") {
            api.resume();
            speechState = "playing";
        }
    }

    function setSpeechRate(value: number): void {
        speechRateTouched = true;
        const next = clampSpeechRate(value);
        if (next === speechRate) return;
        speechRate = next;
        void saveUiPrefs(facade.pluginInstance, { speechRate: next }).catch(() => undefined);
        if (speechState !== "playing" && speechState !== "paused") return;
        const api = speechSynthesis();
        if (!api) return;
        const resumePaused = speechState === "paused";
        api.cancel();
        speechGeneration += 1;
        speechState = "playing";
        const generation = speechGeneration;
        window.setTimeout(() => {
            speakCurrent(generation);
            if (resumePaused && generation === speechGeneration) {
                api.pause();
                speechState = "paused";
            }
        }, 0);
    }

    function isCurrentDocReadonly(): boolean {
        if (docAttrReadonly || context?.readonly) return true;
        const inst = protyleInstance as { protyle?: { disabled?: boolean }; disabled?: boolean } | null;
        if (inst?.protyle?.disabled === true || inst?.disabled === true) return true;
        if (protyleHost?.querySelector(".protyle-wysiwyg[contenteditable='false'], [custom-sy-readonly='true'], [custom-siyuan-readonly='true']")) {
            return true;
        }
        return false;
    }

    async function ensureWritableDoc(targetDocId?: string): Promise<boolean> {
        if (isCurrentDocReadonly()) {
            showMessage(t(i18n, "reader.readonlyBlocked"), 3000);
            return false;
        }
        const checkId = targetDocId || docId;
        if (checkId && await isDocumentReadonly(checkId)) {
            if (checkId === docId) docAttrReadonly = true;
            showMessage(t(i18n, "reader.readonlyBlocked"), 3000);
            return false;
        }
        return true;
    }

    $effect(() => {
        const id = docId;
        const ctx = context;
        if (!id) {
            docAttrReadonly = false;
            return;
        }
        if (ctx && ctx.id === id) {
            docAttrReadonly = Boolean(ctx.readonly);
            return;
        }
        let active = true;
        void isDocumentReadonly(id).then((ro) => {
            if (active && mounted && docId === id) docAttrReadonly = ro;
        }).catch(() => undefined);
        return () => { active = false; };
    });

    function modeValue(value: "read" | "edit"): "preview" | "wysiwyg" {
        return value === "edit" ? "wysiwyg" : "preview";
    }

    async function loadContext(id: string): Promise<void> {
        const isCurrent = contextRequests.begin();
        if (mounted && docId === id) {
            // 后台刷新保留当前文章的伴读内容；首读、切文和失败重试仍显示加载反馈。
            contextLoading = !context || context.id !== id;
            contextError = false;
        }
        try {
            const next = await readClipContext(id);
            if (mounted && isCurrent() && docId === id) {
                context = next;
                contextError = false;
                if (next && readingTimerDocId !== id) {
                    readingTimerDocId = id;
                    readingTimerExpectedRaw = next.readMinutesRaw;
                    readingTimerExpectedLocation = next.location;
                    readingTimerPersistedMinutes = next.readMinutes ?? 0;
                    readingTimer = createReadingTimer(next.readMinutes ?? 0);
                }
                if (next) {
                    currentBookmarkBlockId = next.readingPosition?.blockId ?? null;
                    facade.recordRecentReading(id, next.title);
                    if (typeof loadAuthorArticles === "function") {
                        void loadAuthorArticles(next.author, next.location?.hpath);
                    }
                } else {
                    currentBookmarkBlockId = null;
                    authorArticles = [];
                    seriesArticles = [];
                }
            }
        } catch (error) {
            if (!mounted || !isCurrent() || docId !== id) return;
            console.debug("[glean] 阅读页签读取上下文失败:", error);
            context = null;
            contextError = true;
        }
        if (mounted && isCurrent() && docId === id) contextLoading = false;
    }

    function retryContext(): void {
        if (docId) {
            void loadContext(docId);
            void loadDocTitle(docId);
        }
    }

    async function loadDocTitle(id: string): Promise<void> {
        try {
            const meta = await fetchDocMeta(id);
            if (!mounted || docId !== id) return;
            const resolved = safeDocTitleFromHPath(meta, meta.title || meta.hpath || "").trim();
            if (resolved) {
                docTitle = resolved;
                facade.recordRecentReading(id, resolved);
            }
        } catch {
            // ignore title fallback failure
        }
    }

    async function addCurrentNoteToLibrary(): Promise<void> {
        if (!docId || addingToLibrary) return;
        const targetDocId = docId;
        addingToLibrary = true;
        try {
            const res = await captureDocument(facade.pluginInstance, targetDocId, { src: "manual" });
            if (!mounted || docId !== targetDocId) return;
            if (res.captured) {
                showMessage(t(i18n, "reader.addedToLibrary"), 2500);
                facade.notifyDataChanged();
                await loadContext(targetDocId);
            } else if (res.conflict) {
                showMessage(t(i18n, "inbox.duplicate"), 3000);
                await loadContext(targetDocId);
            } else {
                showMessage(t(i18n, "msg.actionFailed"), 3000);
            }
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 3000);
        } finally {
            addingToLibrary = false;
        }
    }

    async function loadOutline(id: string, retryAttempt = 0): Promise<void> {
        const generation = ++outlineGeneration;
        outlineLoading = true;
        outlineError = false;
        try {
            const next = await loadReadingOutline(id, () => mounted && generation === outlineGeneration && docId === id);
            if (generation !== outlineGeneration || docId !== id) return;
            outline = next;
        } catch (error) {
            if (generation !== outlineGeneration || docId !== id) return;
            const msg = `${error instanceof Error ? error.message : String(error)} ${String((error as { cause?: unknown })?.cause ?? "")}`;
            if (msg.includes("已过期") && retryAttempt < 1) {
                void loadOutline(id, retryAttempt + 1);
                return;
            }
            console.debug("[glean] 阅读大纲读取失败:", error);
            outline = [];
            outlineError = true;
        } finally {
            if (generation === outlineGeneration) outlineLoading = false;
        }
    }

    function findReaderBlockElement(candidate: string): HTMLElement | null {
        if (!protyleHost || !candidate) return null;
        const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(candidate) : candidate;
        const selectors = mode === "read"
            ? [
                `.protyle-preview:not(.fn__none) .b3-typography [id="${escaped}"]`,
                `.protyle-preview:not(.fn__none) [id="${escaped}"]`,
                `.protyle-preview:not(.fn__none) [data-node-id="${escaped}"]`,
                `.protyle-wysiwyg:not(.fn__none) [data-node-id="${escaped}"]`,
                `[data-node-id="${escaped}"]`,
                `.protyle-preview .b3-typography [id="${escaped}"]`,
                `.protyle-preview [id="${escaped}"]`,
            ]
            : [
                `.protyle-wysiwyg:not(.fn__none) [data-node-id="${escaped}"]`,
                `.protyle-preview:not(.fn__none) .b3-typography [id="${escaped}"]`,
                `.protyle-preview:not(.fn__none) [id="${escaped}"]`,
                `[data-node-id="${escaped}"]`,
                `.protyle-preview .b3-typography [id="${escaped}"]`,
            ];
        const candidates: HTMLElement[] = [];
        for (const selector of selectors) {
            const el = protyleHost.querySelector<HTMLElement>(selector);
            if (el && !el.closest(".fn__none")) candidates.push(el);
        }
        return candidates.find((el) => typeof el.getClientRects !== "function" || el.getClientRects().length > 0)
            ?? candidates[0]
            ?? null;
    }

    function scrollToOutline(item: OutlineItem): void {
        const target = findReaderBlockElement(item.id);
        if (target) {
            target.scrollIntoView({ block: "center", behavior: (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" });
            target.focus({ preventScroll: true });
            if (isInWysiwygEditor(target)) {
                showDetachedPulseOverlay(target, 1200, "glean-pulse-highlight");
            } else {
                target.classList.add("glean-pulse-highlight");
                window.setTimeout(() => target.classList.remove("glean-pulse-highlight"), 1200);
            }
            return;
        }
        if (docId) void openTab({ app: facade.pluginInstance.app, doc: { id: item.id }, keepCursor: false });
    }

    async function openSlicing(): Promise<void> {
        if (!docId) return;
        let currentCtx = context;
        if (!currentCtx) {
            try {
                currentCtx = await readClipContext(docId);
                if (currentCtx && mounted) context = currentCtx;
            } catch {}
        }
        if (!currentCtx) {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
            return;
        }
        openDocSlicingDialog(facade, currentCtx, outline, (blockId) => {
            scrollToHighlight(blockId);
        });
    }

    let mindmapBusy = $state(false);

    async function createMindmapDoc(): Promise<void> {
        if (mindmapBusy || !docId || !outline.length) return;
        let currentCtx = context;
        if (!currentCtx) {
            try {
                currentCtx = await readClipContext(docId);
                if (currentCtx && mounted) context = currentCtx;
            } catch {}
        }
        if (!currentCtx) {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
            return;
        }
        mindmapBusy = true;
        try {
            const res = await createOutlineMindmapDocument(facade.pluginInstance, currentCtx, outline);
            if (res.ok && res.docId) {
                showMessage(t(i18n, "reader.mindmapCreated"), 2500);
                void openTab({ app: facade.pluginInstance.app, doc: { id: res.docId } });
                facade.notifyDataChanged();
            } else {
                showMessage(res.error || t(i18n, "msg.actionFailed"), 3000);
            }
        } catch (error) {
            console.warn("[glean] 创建脑图失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 3000);
        } finally {
            mindmapBusy = false;
        }
    }

    let outlineCopied = $state(false);

    async function copyOutlineMarkdown(): Promise<void> {
        if (!outline.length) return;
        const lines = outline.map((item) => {
            const indent = "  ".repeat(Math.max(0, item.level - 1));
            return `${indent}- ${item.title}`;
        });
        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            outlineCopied = true;
            setTimeout(() => { outlineCopied = false; }, 1800);
            showMessage(t(i18n, "reader.outlineCopied"), 2500);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function copyOutlineBlockRef(item: OutlineItem): Promise<void> {
        const title = item.title || t(i18n, "panel.untitled");
        const refText = `((${item.id} '${title}'))`;
        try {
            await navigator.clipboard.writeText(refText);
            showMessage(t(i18n, "reader.blockRefCopied"), 2000);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    }

    async function loadDocHighlights(id: string): Promise<void> {
        highlightsLoading = true;
        try {
            const list = await listDocHighlights(id);
            if (docId === id && mounted) {
                docHighlights = list;
                for (const hl of list) {
                    if (hl.carded) {
                        enrolledFlashcardKeys.add(hl.id);
                        enrolledFlashcardKeys.add(extractDeliveryKey(id, hl.id, hl.text));
                        if (hl.sourceBlockId) {
                            enrolledFlashcardKeys.add(hl.sourceBlockId);
                            enrolledFlashcardKeys.add(extractDeliveryKey(id, hl.sourceBlockId, hl.text));
                        }
                    }
                }
            }
        } catch (error) {
            console.debug("[glean] 载入本文批注失败:", error);
            if (docId === id && mounted) {
                docHighlights = [];
            }
        } finally {
            if (docId === id && mounted) highlightsLoading = false;
        }
    }

    let currentHighlightIndex = $state(-1);

    function jumpToNextHighlight(): void {
        if (!docHighlights.length) return;
        currentHighlightIndex = (currentHighlightIndex + 1) % docHighlights.length;
        openHighlightSource(docHighlights[currentHighlightIndex]);
    }

    function jumpToPrevHighlight(): void {
        if (!docHighlights.length) return;
        currentHighlightIndex = (currentHighlightIndex - 1 + docHighlights.length) % docHighlights.length;
        openHighlightSource(docHighlights[currentHighlightIndex]);
    }

    function scrollToHighlight(id: string, fallbackDocId?: string): void {
        const matched = docHighlights.find((h) => h.id === id);
        const candidates = [matched?.sourceBlockId, id].filter((v): v is string => Boolean(v));
        for (const candidate of candidates) {
            const target = findReaderBlockElement(candidate);
            if (target) {
                target.scrollIntoView({ block: "center", behavior: (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" });
                target.focus({ preventScroll: true });
                if (isInWysiwygEditor(target)) {
                    showDetachedPulseOverlay(target, 1200, "glean-pulse-highlight");
                } else {
                    target.classList.add("glean-pulse-highlight");
                    setTimeout(() => target?.classList.remove("glean-pulse-highlight"), 1200);
                }
                return;
            }
        }
        const targetDoc = fallbackDocId || docId;
        const focusId = matched?.sourceBlockId || id;
        if (targetDoc) void openTab({ app: facade.pluginInstance.app, doc: { id: focusId, action: ["cb-get-focus", "cb-get-hl"] }, keepCursor: false });
    }

    function openHighlightSource(hl: HighlightItem): void {
        scrollToHighlight(hl.id, hl.rootId);
    }

    function openHighlightCommentBlock(hl: HighlightItem): void {
        const commentId = hl.commentBlockId || hl.id;
        void openTab({ app: facade.pluginInstance.app, doc: { id: commentId, action: ["cb-get-focus", "cb-get-hl"] }, keepCursor: false });
    }

    function beginEditMemo(hl: HighlightItem): void {
        editingMemoId = hl.id;
        editingMemoDraft = hl.memo || "";
        replyingId = "";
        tagPickerId = "";
    }

    async function submitEditMemo(hl: HighlightItem): Promise<void> {
        if (editingMemoBusy) return;
        if ((!hl.commentDocId || hl.commentDocId === docId) && !(await ensureWritableDoc())) return;
        editingMemoBusy = true;
        try {
            const saved = await updateHighlightMemo(hl, editingMemoDraft, facade.pluginInstance.app);
            docHighlights = docHighlights.map((item) => item.id === hl.id ? { ...item, memo: saved || undefined } : item);
            editingMemoId = "";
            editingMemoDraft = "";
            if (docId) refreshWhaleDecorationsInProtyle(facade.pluginInstance.app, docId);
            facade.notifyDataChanged();
            showMessage(t(i18n, "highlight.memoSaved"), 2000);
        } catch (error) {
            console.warn("[glean] 更新批注想法失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            editingMemoBusy = false;
        }
    }

    async function applyHighlightTag(hl: HighlightItem, nextTag: string): Promise<void> {
        if ((!hl.commentDocId || hl.commentDocId === docId) && !(await ensureWritableDoc())) return;
        const resolved = hl.annotationTag === nextTag ? "" : nextTag;
        try {
            await setAnnotationTag(hl, resolved, facade.pluginInstance.app);
            docHighlights = docHighlights.map((item) => item.id === hl.id ? { ...item, annotationTag: resolved || undefined } : item);
            tagPickerId = "";
            if (docId) refreshWhaleDecorationsInProtyle(facade.pluginInstance.app, docId);
            facade.notifyDataChanged();
            showMessage(t(i18n, "highlight.tagUpdated"), 1800);
        } catch (error) {
            console.warn("[glean] 更新批注标记失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function submitHighlightReply(hl: HighlightItem): Promise<void> {
        if (replyBusy || !replyDraft.trim()) return;
        if ((!hl.commentDocId || hl.commentDocId === docId) && !(await ensureWritableDoc())) return;
        replyBusy = true;
        try {
            const nextReplies = await addAnnotationReply(hl, replyDraft, facade.pluginInstance.app);
            docHighlights = docHighlights.map((item) => item.id === hl.id ? { ...item, replies: nextReplies } : item);
            replyDraft = "";
            replyingId = "";
            if (docId) refreshWhaleDecorationsInProtyle(facade.pluginInstance.app, docId);
            facade.notifyDataChanged();
            showMessage(t(i18n, "highlight.replyAdded"), 2000);
        } catch (error) {
            console.warn("[glean] 追加批注追记失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            replyBusy = false;
        }
    }

    async function handleDeleteHighlight(hl: HighlightItem): Promise<void> {
        if ((!hl.commentDocId || hl.commentDocId === docId) && !(await ensureWritableDoc())) return;
        if (confirmDeleteId !== hl.id) {
            confirmDeleteId = hl.id;
            window.setTimeout(() => { if (confirmDeleteId === hl.id) confirmDeleteId = ""; }, 3200);
            return;
        }
        confirmDeleteId = "";
        try {
            await deleteAnnotation(hl, hl.source?.type === "b" && hl.annotationKind !== "native-memo" ? "delete-block" : "unmark");
            docHighlights = docHighlights.filter((item) => item.id !== hl.id);
            if (docId) refreshWhaleDecorationsInProtyle(facade.pluginInstance.app, docId);
            showMessage(t(i18n, "highlight.deleted"), 2000);
            facade.notifyDataChanged();
        } catch (error) {
            console.warn("[glean] 删除批注失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    function handleToggleWhaleSlide(): void {
        const res = toggleWhaleSlideMode(facade.pluginInstance.app);
        if (!res.ok) {
            showMessage(t(i18n, "reader.whaleNotInstalled"), 2500);
            return;
        }
        whaleStatus = getWhaleBridgeStatus(facade.pluginInstance.app);
        showMessage(t(i18n, res.active ? "reader.whaleSlideOn" : "reader.whaleSlideOff"), 2200);
    }

    async function invokeWhaleCommentFromSelection(): Promise<void> {
        if (!docId || !excerpt?.text) return;
        if (!(await ensureWritableDoc())) return;
        const savedText = excerpt.text;
        const savedBlockId = excerpt.blockId && excerpt.blockId !== docId ? excerpt.blockId : "";
        let rangeToUse = excerptRange;

        // 若处于阅读预览态（无 data-node-id），先切到编辑态并等待 wysiwyg DOM 就绪再定位 Range
        if (mode === "read" || !savedBlockId) {
            await setMode("edit");
            await tick();
            const wysiwyg = await waitForWysiwygReady(protyleHost, 1800);
            const matched = findTextRangeInWysiwyg(wysiwyg, savedText, savedBlockId);
            if (matched) {
                rangeToUse = matched;
            } else {
                showMessage(t(i18n, "reader.whaleLocateFailed"), 3000);
                return;
            }
        }

        const res = await triggerWhaleAddComment(facade.pluginInstance.app, protyleInstance, rangeToUse);
        if (res.ok) {
            excerpt = null;
            excerptRange = null;
            memoInputOpen = false;
            memoDraft = "";
            window.setTimeout(() => { if (docId) void loadDocHighlights(docId); }, 450);
        } else if (res.reason === "not-installed") {
            showMessage(t(i18n, "reader.whaleNotInstalled"), 3000);
        } else if (res.reason === "no-range") {
            showMessage(t(i18n, "reader.whaleLocateFailed"), 3000);
        }
    }

    async function invokeWhaleAiFromSelection(): Promise<void> {
        if (!docId || !excerpt?.text) return;
        const savedText = excerpt.text;
        const savedBlockId = excerpt.blockId && excerpt.blockId !== docId ? excerpt.blockId : "";
        let rangeToUse = excerptRange;
        if (mode === "read" || !savedBlockId) {
            await setMode("edit");
            await tick();
            const wysiwyg = await waitForWysiwygReady(protyleHost, 1800);
            const matched = findTextRangeInWysiwyg(wysiwyg, savedText, savedBlockId);
            if (matched) rangeToUse = matched;
        }
        const res = triggerWhaleAiExplain(facade.pluginInstance.app, protyleInstance, rangeToUse);
        if (!res.ok && res.reason === "not-installed") {
            showMessage(t(i18n, "reader.whaleNotInstalled"), 3000);
        } else if (!res.ok && res.reason === "no-range") {
            showMessage(t(i18n, "reader.whaleLocateFailed"), 3000);
        }
    }

    function scrollToTop(): void {
        const scroller = protyleHost?.querySelector<HTMLElement>(".protyle-content, .protyle-wysiwyg") ?? protyleHost;
        scroller?.scrollTo({ top: 0, behavior: (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" });
    }

    async function cardFromHighlight(item: HighlightItem): Promise<void> {
        const targetDocId = context?.id || item.rootId || docId;
        if (!item.text || !item.id || !targetDocId || flashcardPipelineBusy) return;
        try {
            makeQuoteCardPreview(facade, {
                title: context?.title || docTitle || t(i18n, "panel.untitled"),
                quote: item.text,
                docId: targetDocId,
                blockId: item.id,
            });
        } catch (error) {
            console.warn("[glean] 摘录制卡失败:", error);
            showMessage(t(i18n, "reader.actionFailed"), 3000);
        }
    }

    function quoteCardFromHighlight(item: HighlightItem): void {
        if (!item.text || !context) return;
        openQuoteCardDialog(facade, {
            quote: item.text,
            title: context.title,
            author: context.author,
            site: context.site,
            url: context.url,
            time: context.time,
            color: item.color,
            docId: context.id,
            blockId: item.id,
        });
    }

    function openAuthorContactDoc(): void {
        if (!authorPerson?.docId) return;
        void openTab({ app: facade.pluginInstance.app, doc: { id: authorPerson.docId }, keepCursor: false });
    }

    async function enrollAuthorToContacts(): Promise<void> {
        if (!context?.author) return;
        const res = await ensurePersonSafely(context.author, { docId: context.id });
        if (res.ok && res.person) {
            authorPerson = res.person;
            showMessage(t(i18n, res.created ? "author.enrolledToContacts" : "author.linkedToContacts"), 2500);
        } else {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function logAuthorFact(): Promise<void> {
        if (!authorPerson?.docId || !context) return;
        const ok = await appendPersonFactSafely(authorPerson.docId, {
            text: `精读了文章《${context.title}》`,
            category: "other",
            sourceRef: context.id,
        });
        if (ok) {
            showMessage(t(i18n, "author.factLogged"), 2500);
        } else {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function pushHighlightToCards(hl: HighlightItem): Promise<void> {
        const sourceDocId = context?.id || hl.rootId || docId;
        const sourceBlockId = hl.sourceBlockId || hl.id;
        if (!hl.text || !sourceBlockId || !sourceDocId || flashcardPipelineBusy) return;
        flashcardPipelineBusy = true;
        try {
            const payload = buildHighlightFlashcardPayload({
                highlightText: hl.text,
                contextText: hl.text,
                sourceBlockId,
                sourceTitle: context?.title || docTitle || t(i18n, "panel.untitled"),
                docTags: context?.tags || [],
            });
            const res = await dispatchHighlightToFlashcard(facade, payload);
            if ((context && context.id !== sourceDocId) || (!context && docId !== sourceDocId)) return;
            if (res.success && res.mode === "automated") {
                enrolledFlashcardKeys.add(hl.id);
                if (hl.sourceBlockId && hl.sourceBlockId !== hl.id) {
                    enrolledFlashcardKeys.add(hl.sourceBlockId);
                    if (typeof markHighlightCarded === "function") {
                        void markHighlightCarded(hl.id).catch(() => undefined);
                    }
                }
            }
        } finally { flashcardPipelineBusy = false; }
    }

    async function saveHighlightToCommon(hl: HighlightItem): Promise<void> {
        if (!hl.text || !context) return;
        const res = await captureQuoteToCommonSafely({
            quote: hl.text,
            author: context.author,
            sourceDocId: context.id,
            sourceBlockId: hl.id,
            sourceTitle: context.title,
            tags: context.tags,
        });
        if (res.ok) {
            showMessage(t(i18n, "quoteCard.savedToCommon"), 2500);
        } else {
            try {
                await navigator.clipboard.writeText(hl.text);
                showMessage(t(i18n, "quoteCard.commonMissingFallbackCopied"), 3000);
            } catch {
                showMessage(t(i18n, "msg.actionFailed"), 2500);
            }
        }
    }

    function quoteCardFromExcerpt(): void {
        if (!excerpt?.text || !context) return;
        openQuoteCardDialog(facade, {
            quote: excerpt.text,
            title: context.title,
            author: context.author,
            site: context.site,
            url: context.url,
            time: context.time,
            docId: context.id,
            blockId: excerpt.blockId,
        });
    }

    async function examFromHighlight(item: HighlightItem): Promise<void> {
        if (!item.text || !item.id || !context) return;
        const examBridge = getBridgeSafely<Record<string, unknown>>("exam");
        if (examBridge && typeof examBridge.quickGenerateQuestion === "function") {
            try {
                await (examBridge.quickGenerateQuestion as (options: unknown) => Promise<unknown>)({
                    title: context.title,
                    text: item.text,
                    docId: context.id,
                    blockId: item.id,
                });
                showMessage(t(i18n, "reader.examStarted"), 2500);
            } catch (error) {
                console.warn("[LvGlean] 批注考试出题失败:", error);
                showMessage(t(i18n, "reader.actionFailed"), 3000);
            }
        } else {
            showMessage(t(i18n, "reader.examGhostHint"), 3000);
        }
    }

    async function cycleHighlightColor(item: HighlightItem): Promise<void> {
        if ((!item.commentDocId || item.commentDocId === docId) && !(await ensureWritableDoc())) return;
        const order = ["yellow", "red", "blue", "green"] as const;
        const currentIdx = order.indexOf((item.color || "yellow") as (typeof order)[number]);
        const next = order[(currentIdx + 1) % order.length];
        try {
            await setAnnotationColor(item, next);
            docHighlights = docHighlights.map((hl) => (hl.id === item.id ? { ...hl, color: next, customColor: undefined } : hl));
            if (docId) refreshWhaleDecorationsInProtyle(facade.pluginInstance.app, docId);
            facade.notifyDataChanged();
        } catch (error) {
            console.debug("[glean] 切换批注颜色失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function copyHighlightQuote(item: HighlightItem): Promise<void> {
        try {
            const formatted = formatHighlightShare(item);
            await navigator.clipboard.writeText(formatted);
            showMessage(t(i18n, "reader.copied"), 2000);
        } catch {
            showMessage(t(i18n, "reader.actionFailed"), 3000);
        }
    }

    async function copyHighlightBlockRef(item: HighlightItem): Promise<void> {
        const textSnippet = item.text.replace(/[\r\n]+/g, " ").trim().slice(0, 30);
        const refText = `((${item.id} '${textSnippet}'))`;
        try {
            await navigator.clipboard.writeText(refText);
            showMessage(t(i18n, "reader.blockRefCopied"), 2000);
        } catch {
            showMessage(t(i18n, "reader.actionFailed"), 3000);
        }
    }

    async function copyAllDocHighlights(): Promise<void> {
        if (!docHighlights.length) return;
        try {
            const lines = docHighlights.map((hl) => {
                const quoteLines = hl.text.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
                const memoBlock = hl.memo?.trim()
                    ? "\n>\n" + hl.memo.trim().split(/\r?\n/).map((line, idx) => (idx === 0 ? `> 💡 ${line}` : `> ${line}`)).join("\n")
                    : "";
                return `${quoteLines}${memoBlock}\n\n— [${context?.title || t(i18n, "panel.untitled")}](siyuan://blocks/${hl.id})`;
            }).join("\n\n---\n\n");
            await navigator.clipboard.writeText(lines);
            showMessage(t(i18n, "highlight.copied"), 2000);
        } catch {
            showMessage(t(i18n, "reader.actionFailed"), 3000);
        }
    }

    async function createDocFromDocHighlights(): Promise<void> {
        if (!docHighlights.length || !context) return;
        const current = context;
        try {
            const group = {
                rootId: current.id,
                title: current.title,
                site: current.site || "",
                url: current.url || "",
                tags: current.tags || [],
                aiTags: current.aiTags || [],
                items: docHighlights.map((hl) => ({
                    ...hl,
                    box: hl.box || current.location?.box || "",
                    hpath: hl.hpath || current.location?.hpath || "",
                })),
            };
            const labels = {
                title: t(i18n, "highlight.exportTitle"),
                original: t(i18n, "highlight.original"),
                source: t(i18n, "highlight.source"),
            };
            const result = await createArticleHighlightsDoc(facade.pluginInstance, group, labels);
            if (result.ok && result.docId) {
                showMessage(t(i18n, "highlight.articleDocCreated"), 3000);
                facade.notifyDataChanged();
                void openTab({ app: facade.pluginInstance.app, doc: { id: result.docId } });
            } else {
                showMessage(t(i18n, "msg.actionFailed"), 3000);
            }
        } catch (error) {
            console.warn("[LvGlean] 创建读书笔记失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 3000);
        }
    }

    async function updateAppearance(key: keyof ReaderAppearance, value: string): Promise<void> {
        appearanceTouched = true;
        const next = normalizeReaderAppearance({ ...readerAppearance, [key]: value });
        readerAppearance = next;
        appearanceBusy = true;
        try {
            await saveUiPrefs(facade.pluginInstance, { readerAppearance: next });
        } catch (error) {
            console.debug("[glean] 阅读外观保存失败:", error);
            showMessage(t(i18n, "settings.saveFailed"), 3000);
        } finally {
            appearanceBusy = false;
        }
    }

    function cycleTheme(): void {
        const order: Array<"follow" | "paper" | "eye"> = ["follow", "paper", "eye"];
        const currentIdx = order.indexOf(readerAppearance.theme as "follow" | "paper" | "eye");
        const nextTheme = order[(currentIdx + 1) % order.length];
        void updateAppearance("theme", nextTheme);
    }

    function themeLabel(theme: string): string {
        switch (theme) {
            case "paper": return t(i18n, "reader.appearancePaper");
            case "eye": return t(i18n, "reader.appearanceEye");
            default: return t(i18n, "reader.appearanceFollow");
        }
    }

    async function toggleSidebar(): Promise<void> {
        if (sidebarBusy) return;
        sidebarTouched = true;
        sidebarCollapsed = !sidebarCollapsed;
        sidebarBusy = true;
        try {
            await saveUiPrefs(facade.pluginInstance, { readerSidebarCollapsed: sidebarCollapsed });
        } catch {
            showMessage(t(i18n, "settings.saveFailed"), 3000);
        } finally {
            sidebarBusy = false;
        }
    }

    function openNativeTab(): void {
        if (!docId) return;
        void openTab({ app: facade.pluginInstance.app, doc: { id: docId }, keepCursor: false });
    }

    function openWeread(): void {
        openWeReadGuideDialog(facade, {
            id: docId,
            title: context?.title,
            url: context?.url,
            author: context?.author,
        });
    }

    async function runPurifyWechat(): Promise<void> {
        if (!docId || purifying) return;
        if (!(await ensureWritableDoc())) return;
        purifying = true;
        try {
            const result = await purifyWechatArticle(facade.pluginInstance, docId);
            if (result.ok) {
                lvNotify.capsule({
                    source: "小驴拾遗",
                    category: "wechat-purify",
                    message: t(i18n, "wechat.purifyDone", { count: result.words ?? 0 }),
                    level: "success",
                    duration: 3000,
                    archive: false,
                });
                await loadContext(docId);
                facade.notifyDataChanged();
                if (result.modified) {
                    openFormattingDialog(facade, docId);
                }
            } else {
                showNotice(t(i18n, "msg.actionFailed"), 3000, "error");
            }
        } catch (err) {
            console.warn("[glean] 微信文章提纯失败:", err);
            showNotice(t(i18n, "msg.actionFailed"), 3000, "error");
        } finally {
            purifying = false;
        }
    }

    async function copyCleanUrl(): Promise<void> {
        if (!context?.url) return;
        const clean = isWechatUrl(context.url) ? cleanWechatArticleUrl(context.url) : context.url;
        try {
            await navigator.clipboard.writeText(clean);
            showMessage(t(i18n, "reader.cleanUrlCopied"), 2000);
        } catch {
            showMessage(t(i18n, "reader.actionFailed"), 3000);
        }
    }

    async function copyCleanMarkdown(): Promise<void> {
        if (!docId || copyingCleanBody) return;
        copyingCleanBody = true;
        try {
            const exported = await exportMdContent(docId, { yfm: false, addTitle: false, refMode: 2 });
            let md = exported?.content || "";
            if (!md.trim()) {
                showMessage(t(i18n, "reader.copyCleanFailed"), 3000);
                return;
            }
            if (isWechatArticle) {
                md = cleanWechatNoise(repairWechatContent(md));
            }
            await navigator.clipboard.writeText(md);
            showMessage(t(i18n, "reader.copyCleanDone"), 2500);
        } catch (err) {
            console.warn("[glean] 复制纯净正文失败:", err);
            showMessage(t(i18n, "msg.actionFailed"), 3000);
        } finally {
            copyingCleanBody = false;
        }
    }

    async function copyCitation(format: CitationFormat = "gbt"): Promise<void> {
        if (!context || !docId) return;
        const item = {
            id: context.id,
            title: context.title || t(i18n, "panel.untitled"),
            author: context.author,
            site: context.site,
            url: context.url,
            time: context.time,
        };
        const text = formatCitation(item, format);
        const msgKey = citationSuccessKey(format);
        try {
            await navigator.clipboard.writeText(text);
            showMessage(t(i18n, msgKey), 2500);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function roamNext(): Promise<void> {
        if (!context || !docId) return;
        try {
            const index = await loadIndex(facade.pluginInstance);
            const candidates = Object.values(index.clips);
            const pick = pickRoamingArticle(candidates, [docId]);
            if (pick) {
                openRoamingDialog(facade, pick, (id, readPoint) => {
                    void facade.openReadingDocument(id, readPoint);
                });
            } else {
                showMessage(t(i18n, "roaming.emptyPool"), 2500);
            }
        } catch (error) {
            console.warn("[glean] 漫游换篇失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function toggleFavorite(): Promise<void> {
        if (!context || !docId || context.id !== docId || statusBusy) return;
        statusBusy = true;
        const sourceDocId = docId;
        const generation = sessionGeneration;
        const current = Boolean(context.favorite);
        const next = !current;
        context = { ...context, favorite: next };
        try {
            await writeClip(facade.pluginInstance, sourceDocId, { favorite: next }, { force: true });
            if (docId !== sourceDocId || context?.id !== sourceDocId || sessionGeneration !== generation) return;
            showMessage(t(i18n, next ? "roaming.favoriteAdded" : "roaming.favoriteRemoved"), 2000);
            facade.notifyDataChanged();
        } catch (error) {
            if (docId !== sourceDocId || context?.id !== sourceDocId || sessionGeneration !== generation) return;
            context = { ...context, favorite: current };
            console.warn("[glean] 收藏切换失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            statusBusy = false;
        }
    }

    async function copyArticleBlockRef(): Promise<void> {
        if (!docId) return;
        const title = context?.title || t(i18n, "panel.untitled");
        const refText = `((${docId} '${title}'))`;
        try {
            await navigator.clipboard.writeText(refText);
            showMessage(t(i18n, "reader.blockRefCopied"), 2500);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    function enterImmersive(): void {
        if (mode !== "read") setMode("read");
        shortcutHelp = false;
        moreToolsOpen = false;
        appearanceOpen = false;
        immersive = true;
        readerRoot?.focus({ preventScroll: true });
    }

    async function exitImmersive(): Promise<void> {
        immersive = false;
        await tick();
        readerRoot?.querySelector<HTMLButtonElement>(".glean-reader__toolbar-immersive")?.focus();
    }

    function toggleCompanion(): void {
        if (immersive) {
            immersive = false;
            if (sidebarCollapsed) void toggleSidebar();
            return;
        }
        void toggleSidebar();
    }

    function toggleAppearance(): void {
        appearanceOpen = !appearanceOpen;
    }

    $effect(() => {
        if (!appearanceOpen || typeof document === "undefined") return;
        const onDocPointerDown = (event: PointerEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest(".glean-reader__appearance-wrap")) return;
            appearanceOpen = false;
        };
        document.addEventListener("pointerdown", onDocPointerDown, true);
        return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
    });

    function currentSession(id: string, generation: number): boolean {
        return mounted && docId === id && sessionGeneration === generation;
    }

    function onReaderKey(event: KeyboardEvent): void {
        if (event.isComposing || event.keyCode === 229) return;
        const modalOpen = Array.from(document.querySelectorAll<HTMLElement>('.b3-dialog, .b3-menu, [role="dialog"], [aria-modal="true"]'))
            .some((element) => element.getClientRects().length > 0);
        if (event.key === "F11") {
            event.preventDefault();
            event.stopPropagation();
            toggleZenMode();
            return;
        }
        if (event.key === "Escape" && zenMode) {
            event.preventDefault();
            event.stopPropagation();
            exitZenMode();
            return;
        }
        if (event.altKey && (event.repeat || modalOpen)) return;
        if (event.altKey && (event.key === "e" || event.key === "E")) {
            event.preventDefault();
            event.stopPropagation();
            setMode(mode === "read" ? "edit" : "read");
            return;
        }
        if (event.altKey && (event.key === "x" || event.key === "X")) {
            if (excerpt?.text) {
                event.preventDefault();
                event.stopPropagation();
                void incrementalExtractToCards();
                return;
            }
        }
        if (event.altKey && (event.key === "p" || event.key === "P")) {
            event.preventDefault();
            event.stopPropagation();
            cycleTheme();
            return;
        }
        if (event.altKey && (event.key === "t" || event.key === "T")) {
            if (excerpt?.text) {
                event.preventDefault();
                event.stopPropagation();
                void extractToHorizonTask();
                return;
            }
        }
        if (event.altKey && (event.key === "r" || event.key === "R" || event.key === "b" || event.key === "B")) {
            event.preventDefault();
            event.stopPropagation();
            void roamNext();
            return;
        }
        if (event.altKey && (event.key === "m" || event.key === "M")) {
            event.preventDefault();
            event.stopPropagation();
            marginNotesOpen = !marginNotesOpen;
            return;
        }
        if (event.altKey && (event.key === "f" || event.key === "F")) {
            event.preventDefault();
            event.stopPropagation();
            void toggleFavorite();
            return;
        }
        if (event.altKey && (event.key === "c" || event.key === "C")) {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
                void copyCitation("bibtex");
            } else {
                void copyCitation("gbt");
            }
            return;
        }
        if (event.altKey && (event.key === "q" || event.key === "Q")) {
            event.preventDefault();
            event.stopPropagation();
            if (excerpt?.text) {
                quoteCardFromExcerpt();
            } else if (docHighlights.length > 0) {
                quoteCardFromHighlight(docHighlights[0]);
            }
            return;
        }
        if (event.altKey && (event.key === "s" || event.key === "S")) {
            event.preventDefault();
            event.stopPropagation();
            void takeSnapshot();
            return;
        }
        if (event.altKey && (event.key === "z" || event.key === "Z")) {
            event.preventDefault();
            event.stopPropagation();
            toggleFoldReader();
            return;
        }
        const root = readerRoot;
        const target = event.target instanceof Element ? event.target : null;
        const active = document.activeElement;
        const blockedTarget = target?.closest('input, textarea, select, button, a, [role="textbox"], [role="combobox"], [role="menu"], [role="menuitem"], [role="dialog"], [contenteditable]:not([contenteditable="false"])');
        if (event.key === "Escape") {
            if (searchOpen) {
                event.preventDefault();
                event.stopPropagation();
                closeReaderSearch();
                return;
            }
            if (shortcutHelp) {
                event.preventDefault();
                event.stopPropagation();
                shortcutHelp = false;
                return;
            }
            if (moreToolsOpen || appearanceOpen) {
                event.preventDefault();
                event.stopPropagation();
                moreToolsOpen = false;
                appearanceOpen = false;
                return;
            }
            if (aiResult || questionResult) {
                event.preventDefault();
                event.stopPropagation();
                aiResult = null;
                questionResult = null;
                return;
            }
            if (excerpt || memoInputOpen) {
                event.preventDefault();
                event.stopPropagation();
                excerpt = null;
                memoInputOpen = false;
                return;
            }
            if (immersive) {
                event.preventDefault();
                event.stopPropagation();
                void exitImmersive();
                return;
            }
            return;
        }
        if (isFindShortcut(event) || (event.key === "/" && mode === "read" && !blockedTarget && !modalOpen && !event.ctrlKey && !event.altKey && !event.metaKey)) {
            event.preventDefault();
            event.stopPropagation();
            searchOpen = true;
            return;
        }
        if ((event.key === " " || event.key === "Spacebar") && mode === "read" && !blockedTarget && !modalOpen && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            const scroller = Array.from(protyleHost?.querySelectorAll<HTMLElement>(".protyle-content, .protyle-preview, .protyle-wysiwyg") ?? [])
                .find((element) => element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 1) ?? protyleHost;
            scroller?.scrollBy({ top: (event.shiftKey ? -1 : 1) * Math.max(200, (scroller.clientHeight || 600) * 0.8), behavior: (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" });
            return;
        }
        const action = readerShortcut({
            key: event.key, mode, focused: Boolean(root && active && root.contains(active) && root.getClientRects().length),
            blocked: Boolean(blockedTarget || modalOpen), defaultPrevented: event.defaultPrevented,
            isComposing: event.isComposing, keyCode: event.keyCode, ctrlKey: event.ctrlKey,
            altKey: event.altKey, metaKey: event.metaKey, shiftKey: event.shiftKey, repeat: event.repeat,
        });
        if (!action || !docId) return;
        if (action === "openSource") {
            event.preventDefault();
            event.stopPropagation();
            openSource();
            return;
        }
        if (action === "toggleImmersive") {
            event.preventDefault();
            event.stopPropagation();
            if (immersive) exitImmersive();
            else enterImmersive();
            return;
        }
        if (action === "copyBlockRef") {
            event.preventDefault();
            event.stopPropagation();
            void copyArticleBlockRef();
            return;
        }
        if (action === "later") {
            if (!context || context.id !== docId || statusBusy || context.status === "later") return;
            event.preventDefault();
            event.stopPropagation();
            void writeStatus("later");
            return;
        }
        if (action === "done" && (!context || context.id !== docId || statusBusy || context.status === "done")) return;
        if (action === "excerpt") {
            excerpt = excerptFromSelection(protyleHost, window.getSelection(), docId);
            if (!excerpt?.text || !docId || excerptBusy) return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (action === "nextHighlight") {
            jumpToNextHighlight();
            return;
        }
        if (action === "prevHighlight") {
            jumpToPrevHighlight();
            return;
        }
        if (action === "scrollDown" || action === "scrollUp") {
            const scroller = Array.from(protyleHost?.querySelectorAll<HTMLElement>(".protyle-content, .protyle-preview") ?? [])
                .find((element) => element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 1) ?? protyleHost;
            scroller?.scrollBy({ top: (action === "scrollDown" ? 1 : -1) * Math.max(80, (scroller.clientHeight || 500) / 4), behavior: "auto" });
        } else if (action === "edit") setMode("edit");
        else if (action === "done") void writeStatus("done");
        else if (action === "excerpt") void quoteExcerpt();
        else shortcutHelp = !shortcutHelp;
    }

    $effect(() => {
        void sidebarCollapsed;
        untrack(() => protyle?.resize());
    });

    $effect(() => {
        const host = protyleHost;
        void mode;
        void docId;
        if (!host) return;
        let scrollRafId: number | null = null;
        let lastScrollTarget: EventTarget | null = null;
        const resolveScroller = (targetEl?: EventTarget | null): HTMLElement => {
            if (targetEl instanceof HTMLElement && host.contains(targetEl) && targetEl.scrollHeight > targetEl.clientHeight + 1) {
                return targetEl;
            }
            return host.querySelector<HTMLElement>(".protyle-preview:not(.fn__none), .protyle-content:not(.fn__none), .protyle-wysiwyg:not(.fn__none)") ?? host;
        };
        const flushScrollPercentage = () => {
            scrollRafId = null;
            const scroller = resolveScroller(lastScrollTarget);
            readingPercentage = estimateReadingPercentage(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
        };
        const handleScroll = (event?: Event) => {
            if (event) lastScrollTarget = event.target;
            if (scrollRafId !== null) return;
            if (typeof requestAnimationFrame === "function") {
                scrollRafId = requestAnimationFrame(flushScrollPercentage);
            } else {
                flushScrollPercentage();
            }
        };
        host.addEventListener("scroll", handleScroll, { passive: true, capture: true });
        flushScrollPercentage();
        return () => {
            host.removeEventListener("scroll", handleScroll, true);
            if (scrollRafId !== null && typeof cancelAnimationFrame === "function") {
                cancelAnimationFrame(scrollRafId);
                scrollRafId = null;
            }
        };
    });

    // 挂载效果只依赖 docId 与宿主节点；模式切换走 switchMode，不重建实例（保留位置）。
    $effect(() => {
        const id = docId;
        const host = protyleHost;
        if (!id || !host) return;
        // 必须用 untrack 包裹重置逻辑：aiAbort/ghostreaderAbort/foldAiAbort 是 $state.raw，
        // 若直接读取会导致开启 AI 请求时立刻重跑本 $effect 并当场中止请求、将 companionTab 弹回 outline！
        untrack(() => {
            sessionGeneration += 1;
            contextRequests.invalidate();
            context = null;
            docTitle = "";
            contextLoading = true;
            contextError = false;
            readingTimerDocId = "";
            readingTimerExpectedRaw = null;
            readingTimerExpectedLocation = null;
            readingTimerPersistedMinutes = 0;
            readingTimer = createReadingTimer();
            readPointRestoredDocId = "";
            docAttrReadonly = false;
            wechatAutoScannedDocId = "";
            modeSwitchAnchorId = null;
            moreToolsOpen = false;
            appearanceOpen = false;
            toolsAppearanceOpen = false;
            outline = [];
            aiAbort?.abort();
            aiAbort = null;
            aiBusy = "";
            ghostreaderAbort?.abort();
            ghostreaderAbort = null;
            ghostreaderOpen = false;
            ghostreaderSnapshot = null;
            ghostreaderCustomQuery = "";
            ghostreaderBusy = false;
            ghostreaderHasChunk = false;
            ghostreaderResult = null;
            ghostreaderResultDocId = "";
            foldAiAbort?.abort();
            foldAiAbort = null;
            foldAiBusy = false;
            foldAiEnriched = false;
            aiResult = null;
            summarySaving = false;
            summarySaved = false;
            questionResult = null;
            question = "";
            questionMode = "full";
            relatedShown = false;
            relatedItems = [];
            relatedReason = null;
            excerpt = null;
            speechChunks = [];
            speechChunkIndex = 0;
            speechScope = null;
            stopSpeech();
            docHighlights = [];
            readingPercentage = null;
            companionTab = "notes";
            outlineMode = "headings";
            highlightOutlineTree = null;
            highlightOutlineLoading = false;
            highlightOutlineExporting = false;
            highlightOutlineGeneration += 1;
            authorPerson = null;
            authorArticles = [];
            seriesArticles = [];
            authorArticlesGeneration += 1;
            wechatAvatar = null;
            editingAnnotation = null;
            foldNodes = [];
            foldLoading = false;
            outlineFilter = "";
            highlightColorFilter = "";
            highlightKindFilter = "";
            highlightTagFilter = "";
            editingMemoId = "";
            replyingId = "";
            tagPickerId = "";
            confirmDeleteId = "";
            whaleStatus = getWhaleBridgeStatus(facade.pluginInstance.app);
            void loadWhaleCustomTags(facade.pluginInstance.app).then((tags) => { if (mounted) whaleCustomTags = tags; });
            void loadContext(id);
            void loadDocTitle(id);
            void loadOutline(id);
            void loadDocHighlights(id);
        });
        return () => {
            if (readingTimerDocId === id) {
                void flushReadingMinutes(id, sessionGeneration, { silent: !mounted });
            }
            sessionGeneration += 1;
            aiAbort?.abort();
            aiAbort = null;
            ghostreaderAbort?.abort();
            ghostreaderAbort = null;
            foldAiAbort?.abort();
            foldAiAbort = null;
            contextRequests.invalidate();
            stopSpeech();
            outlineGeneration += 1;
        };
    });

    // 页签聚焦与尺寸事件由壳派发；数据变化后只刷新伴生栏，不动正文实例。
    $effect(() => {
        const onFocus = (event: Event) => {
            const detail = (event as CustomEvent<{ tabId: string; focusBlockId?: string }>).detail;
            if (detail?.tabId !== tabId) return;
            const id = facade.consumeReaderFocus(tabId);
            if (id) {
                docId = id;
                if (detail.focusBlockId) pendingScrollBlockId = detail.focusBlockId;
            }
        };
        const onRecentReading = () => refreshRecentReadings();
        const onResize = () => protyle?.resize();
        const onData = () => {
            activeSettings = facade.settings;
            if (docId) {
                // 正文可能已在 Protyle 或其他页签中修改，避免伴读继续使用旧导出。
                clearReaderMarkdownCache(facade.pluginInstance, docId);
                void loadContext(docId);
                void loadDocTitle(docId);
                void loadOutline(docId);
                void loadDocHighlights(docId);
                if (companionTab === "fold") {
                    void refreshFoldNodes(docId);
                }
            }
        };
        const onVisibility = () => syncReadingTimer();
        const onWindowFocus = () => syncReadingTimer();
        const onWindowBlur = () => syncReadingTimer();
        let selectTimer: number | null = null;
        const applySelection = () => {
            selectTimer = null;
            const host = protyleHost;
            const selection = window.getSelection();
            if (host && selectionBelongsToHost(host, selection)) {
                const next = excerptFromSelection(host, selection, docId);
                if (next) {
                    excerpt = next;
                    excerptRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
                    if (ghostreaderOpen && docId) {
                        ghostreaderSnapshot = { docId, text: next.text, sourceBlockId: next.blockId || undefined };
                    }
                    return;
                }
            }
            if (memoInputOpen || selectionBarLock || ghostreaderOpen) return;
            if (excerpt !== null || excerptRange !== null) {
                excerpt = null;
                excerptRange = null;
            }
        };
        const onSelect = () => {
            const host = protyleHost;
            if (!host) return;
            const selection = window.getSelection();
            const anchorNode = selection?.anchorNode ?? null;
            const inHost = Boolean(anchorNode && host.contains(anchorNode));
            if (!inHost && excerpt === null && excerptRange === null) {
                if (selectTimer !== null) {
                    window.clearTimeout(selectTimer);
                    selectTimer = null;
                }
                return;
            }
            if (selectTimer !== null) window.clearTimeout(selectTimer);
            selectTimer = window.setTimeout(applySelection, 120);
        };
        const onWhaleUpdated = () => {
            whaleStatus = getWhaleBridgeStatus(facade.pluginInstance.app);
            if (docId) void loadDocHighlights(docId);
        };
        const onWhaleSettingsUpdated = () => {
            whaleStatus = getWhaleBridgeStatus(facade.pluginInstance.app);
            void loadWhaleCustomTags(facade.pluginInstance.app, true).then((tags) => { if (mounted) whaleCustomTags = tags; });
        };
        document.addEventListener("glean:focus-reader", onFocus);
        document.addEventListener("glean:recent-reading-changed", onRecentReading);
        document.addEventListener("glean:reader-resize", onResize);
        document.addEventListener("glean:data-changed", onData);
        document.addEventListener("selectionchange", onSelect);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", onWindowFocus);
        window.addEventListener("blur", onWindowBlur);
        window.addEventListener("siyuan-comment-updated", onWhaleUpdated);
        window.addEventListener("siyuan-comment-pin-updated", onWhaleUpdated);
        window.addEventListener("siyuan-comment-settings-updated", onWhaleSettingsUpdated);
        return () => {
            if (selectTimer !== null) {
                window.clearTimeout(selectTimer);
                selectTimer = null;
            }
            if (prevLeftDock || prevRightDock || prevBottomDock) {
                exitZenMode();
            }
            document.removeEventListener("glean:focus-reader", onFocus);
            document.removeEventListener("glean:recent-reading-changed", onRecentReading);
            document.removeEventListener("glean:reader-resize", onResize);
            document.removeEventListener("glean:data-changed", onData);
            document.removeEventListener("selectionchange", onSelect);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("focus", onWindowFocus);
            window.removeEventListener("blur", onWindowBlur);
            window.removeEventListener("siyuan-comment-updated", onWhaleUpdated);
            window.removeEventListener("siyuan-comment-pin-updated", onWhaleUpdated);
            window.removeEventListener("siyuan-comment-settings-updated", onWhaleSettingsUpdated);
        };
    });

    $effect(() => {
        void docId;
        void context;
        void protyleHost;
        void mode;
        void bodyState;
        const ready = protyleStage === "ready";
        untrack(syncReadingTimer);
        if (ready && docId && context?.id === docId && wechatAutoScannedDocId !== docId) {
            wechatAutoScannedDocId = docId;
            untrack(() => void scanWechatPublisher(false));
        }
    });

    $effect(() => {
        if (pendingScrollBlockId && protyleHost) {
            const target = pendingScrollBlockId;
            pendingScrollBlockId = null;
            const timer = window.setTimeout(() => {
                if (mounted && docId) scrollToHighlight(target);
            }, 350);
            return () => window.clearTimeout(timer);
        }
    });

    // 视口相交高精度断点续读引擎联动（Issue #17 / D-0343）
    // 仅依赖 docId / protyleHost / contextReady / ready，避免元数据/收藏刷新时重建 observer 造成抖动
    $effect(() => {
        const ready = protyleStage === "ready";
        const currentDocId = docId;
        const host = protyleHost;
        const contextReady = Boolean(context && context.id === currentDocId);
        const currentMode = mode;
        if (!currentDocId || !host || !contextReady || !ready) {
            if (readPointHandle) {
                readPointHandle.disconnect();
                readPointHandle = null;
            }
            return;
        }

        let disposed = false;
        let restoreTimer: number | null = null;
        let restoreRetryTimer: number | null = null;
        let settleTimer: number | null = null;
        let restoreMutationObserver: MutationObserver | null = null;
        const switchAnchor = untrack(() => modeSwitchAnchorId);
        const initialReadPoint = switchAnchor ?? untrack(() => context?.readPoint);
        const needsRestore = Boolean(initialReadPoint && (switchAnchor !== null || readPointRestoredDocId !== currentDocId));
        // 在断点恢复完成（或用户真实主动滚动）前，严格冻结写入，防止首屏或切模式 scrollTop=0 反向覆写 custom-lv-read-point
        let writeFrozen = needsRestore;

        const clearRestoreWatchers = () => {
            if (restoreTimer !== null) {
                window.clearTimeout(restoreTimer);
                restoreTimer = null;
            }
            if (restoreRetryTimer !== null) {
                window.clearInterval(restoreRetryTimer);
                restoreRetryTimer = null;
            }
            if (restoreMutationObserver) {
                restoreMutationObserver.disconnect();
                restoreMutationObserver = null;
            }
        };

        const unfreezeOnUserScroll = () => {
            if (disposed || !writeFrozen) return;
            writeFrozen = false;
            modeSwitchAnchorId = null;
            readPointRestoredDocId = currentDocId;
            clearRestoreWatchers();
            if (settleTimer !== null) {
                window.clearTimeout(settleTimer);
                settleTimer = null;
            }
        };

        const onUserKeyScroll = (event: KeyboardEvent) => {
            if (event.key === " " || event.key === "Spacebar" || event.key === "PageDown" || event.key === "PageUp" || event.key === "ArrowDown" || event.key === "ArrowUp") {
                unfreezeOnUserScroll();
            }
        };

        if (needsRestore) {
            host.addEventListener("wheel", unfreezeOnUserScroll, { passive: true, once: true });
            host.addEventListener("touchmove", unfreezeOnUserScroll, { passive: true, once: true });
            host.addEventListener("pointerdown", unfreezeOnUserScroll, { passive: true, once: true });
            window.addEventListener("keydown", onUserKeyScroll, { passive: true });
        }

        if (readPointHandle) {
            readPointHandle.disconnect();
        }
        readPointHandle = createReadPointObserver({
            host,
            docId: currentDocId,
            dwellMs: 1000,
            isWriteFrozen: () => writeFrozen,
            onReadPointChange(blockId) {
                if (writeFrozen) return;
                if (mounted && docId === currentDocId) {
                    currentBookmarkBlockId = blockId;
                    void saveReadPoint(facade.pluginInstance, currentDocId, blockId);
                }
            },
        });

        if (needsRestore && initialReadPoint) {
            const targetBlockId = initialReadPoint;
            const startedAt = Date.now();
            const isModeDomReady = (): boolean => {
                if (!protyleHost) return false;
                if (currentMode === "edit") {
                    return Boolean(protyleHost.querySelector(".protyle-wysiwyg:not(.fn__none) [data-node-id]"));
                }
                return Boolean(protyleHost.querySelector('.protyle-preview:not(.fn__none) .b3-typography [id], .protyle-preview:not(.fn__none) [data-node-id]'));
            };
            const tryRestore = (): boolean => {
                if (disposed || !mounted || docId !== currentDocId || !protyleHost) return true;
                if (!writeFrozen) return true;
                if (isModeDomReady() && scrollAndPulseReadPoint(protyleHost, targetBlockId)) {
                    readPointRestoredDocId = currentDocId;
                    modeSwitchAnchorId = null;
                    currentBookmarkBlockId = targetBlockId;
                    clearRestoreWatchers();
                    settleTimer = window.setTimeout(() => {
                        if (!disposed) writeFrozen = false;
                    }, 900);
                    return true;
                }
                if (Date.now() - startedAt >= 4000) {
                    clearRestoreWatchers();
                    if (isModeDomReady()) {
                        readPointRestoredDocId = currentDocId;
                        modeSwitchAnchorId = null;
                        writeFrozen = false;
                    }
                    return true;
                }
                return false;
            };

            restoreTimer = window.setTimeout(() => {
                if (!tryRestore() && !disposed) {
                    if (typeof MutationObserver !== "undefined" && host instanceof Node) {
                        try {
                            restoreMutationObserver = new MutationObserver(() => {
                                void tryRestore();
                            });
                            restoreMutationObserver.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
                        } catch {
                            restoreMutationObserver = null;
                        }
                    }
                    restoreRetryTimer = window.setInterval(() => {
                        void tryRestore();
                    }, 120);
                }
            }, 60);
        }

        return () => {
            disposed = true;
            clearRestoreWatchers();
            if (settleTimer !== null) {
                window.clearTimeout(settleTimer);
            }
            if (needsRestore) {
                host.removeEventListener("wheel", unfreezeOnUserScroll);
                host.removeEventListener("touchmove", unfreezeOnUserScroll);
                host.removeEventListener("pointerdown", unfreezeOnUserScroll);
                window.removeEventListener("keydown", onUserKeyScroll);
            }
            if (readPointHandle) {
                readPointHandle.disconnect();
                readPointHandle = null;
            }
        };
    });

    function scanWechatAvatar(): void {
        if (!isWechatArticle || !protyleHost) {
            wechatAvatar = null;
            return;
        }
        const img = protyleHost.querySelector<HTMLImageElement>('img.radius_avatar, img.profile_avatar, img[data-src*="avatar"], img[src*="avatar"]');
        if (img) {
            wechatAvatar = img.src || img.getAttribute("data-src") || null;
        }
    }

    async function scanWechatPublisher(manual = false): Promise<void> {
        if (!isWechatArticle || !protyleHost || !docId) {
            wechatAvatar = null;
            return;
        }
        const targetDocId = docId;
        const generation = sessionGeneration;
        scanWechatAvatar();
        if (context?.author && !manual) {
            void loadAuthorArticles(context.author, context.location?.hpath);
            return;
        }

        let detected: string | null = null;
        const jsName = protyleHost.querySelector("#js_name");
        if (jsName?.textContent?.trim()) {
            detected = extractWechatAuthor(jsName.textContent.trim()) || jsName.textContent.trim();
        }
        if (!detected) {
            const nickname = protyleHost.querySelector(".profile_nickname, .profile_meta_value");
            if (nickname?.textContent?.trim()) {
                detected = extractWechatAuthor(nickname.textContent.trim()) || nickname.textContent.trim();
            }
        }
        if (!detected) {
            const snippet = protyleHost.innerText?.slice(0, 2000) || "";
            detected = extractWechatAuthor(snippet);
        }

        if (detected && detected !== context?.author) {
            try {
                await writeClip(facade.pluginInstance, targetDocId, { author: detected });
                facade.notifyDataChanged();
                if (!mounted || !currentSession(targetDocId, generation)) return;
                if (context) context.author = detected;
                void loadAuthorArticles(detected, context?.location?.hpath);
                if (manual) {
                    showMessage(t(i18n, "wechat.authorRecognized", { name: detected }), 2500);
                } else {
                    console.debug(`[LvGlean] 微信文章作者自动识别补全：${detected}`);
                }
            } catch (error) {
                console.warn("[LvGlean] 自动识别微信公众号失败:", error);
            }
        } else if (manual && mounted && currentSession(targetDocId, generation)) {
            showMessage(t(i18n, detected ? "wechat.authorRecognized" : "wechat.authorNotFound", { name: detected || "" }), 2500);
        }
    }

    async function loadAuthorArticles(authorName?: string, hpath?: string): Promise<void> {
        const targetDocId = docId;
        const generation = sessionGeneration;
        const request = ++authorArticlesGeneration;
        if (!targetDocId) {
            authorArticles = [];
            seriesArticles = [];
            return;
        }
        try {
            const index = await loadIndex(facade.pluginInstance);
            if (!mounted || !currentSession(targetDocId, generation) || request !== authorArticlesGeneration) return;
            const allClips = Object.values(index.clips);

            // 1. 同专栏/同一系列目录下的文章（hpath 共享上级目录且层级深度 >= 2）
            let nextSeries: Array<{ id: string; title: string }> = [];
            if (hpath) {
                const parts = hpath.split("/").filter(Boolean);
                if (parts.length >= 2) {
                    const parentHpath = "/" + parts.slice(0, -1).join("/");
                    nextSeries = allClips
                        .filter((c) => c && c.id !== targetDocId && typeof c.hpath === "string" && c.hpath.startsWith(parentHpath + "/"))
                        .sort((a, b) => (a.hpath || "").localeCompare(b.hpath || "") || (a.time || "").localeCompare(b.time || ""))
                        .slice(0, 8)
                        .map((c) => ({ id: c.id, title: c.title || t(i18n, "panel.untitled") }));
                }
            }

            // 2. 同作者/公众号的文章
            let nextAuthor: Array<{ id: string; title: string }> = [];
            const author = authorName?.trim().toLowerCase();
            if (author) {
                nextAuthor = allClips
                    .filter((c) => c && c.id !== targetDocId && (c.author || "").trim().toLowerCase() === author && !nextSeries.some((s) => s.id === c.id))
                    .sort((a, b) => (b.time || "").localeCompare(a.time || ""))
                    .slice(0, 5)
                    .map((c) => ({ id: c.id, title: c.title || t(i18n, "panel.untitled") }));
            }
            if (!mounted || !currentSession(targetDocId, generation) || request !== authorArticlesGeneration) return;
            seriesArticles = nextSeries;
            authorArticles = nextAuthor;
        } catch {
            if (mounted && currentSession(targetDocId, generation) && request === authorArticlesGeneration) {
                seriesArticles = [];
                authorArticles = [];
            }
        }
    }

    function openRelatedDoc(id: string, title = ""): void {
        stopSpeech();
        facade.recordRecentReading(id, title);
        docId = id;
        aiResult = null;
        summarySaving = false;
        summarySaved = false;
        relatedShown = false;
        relatedItems = [];
        relatedReason = null;
        excerpt = null;
    }

    async function quoteExcerpt(memo?: string, color?: string): Promise<void> {
        if (!excerpt?.text || !docId || excerptBusy) return;
        if (!(await ensureWritableDoc())) return;
        excerptBusy = true;
        try {
            let targetBlockId = excerpt.blockId && excerpt.blockId !== docId ? excerpt.blockId : "";
            const selectionContext = extractSelectionSearchContext(protyleHost, excerptRange, excerpt.text);
            if (!targetBlockId) {
                const wysiwyg = protyleHost?.querySelector<HTMLElement>(".protyle-wysiwyg:not(.fn__none)") ?? null;
                const matchedRange = wysiwyg ? findTextRangeInWysiwyg(wysiwyg, excerpt.text) : null;
                const startEl = matchedRange?.startContainer instanceof Element
                    ? matchedRange.startContainer
                    : matchedRange?.startContainer?.parentElement;
                let matchedBlock = startEl?.closest("[data-node-id]") ?? null;
                if (matchedBlock?.getAttribute("data-type") === "NodeListItem") {
                    matchedBlock = matchedBlock.parentElement?.closest("[data-node-id]") ?? null;
                }
                const candidateId = matchedBlock?.getAttribute("data-node-id") ?? "";
                if (candidateId && candidateId !== docId && matchedBlock?.getAttribute("data-type") !== "NodeDocument") {
                    targetBlockId = candidateId;
                }
            }
            if (!targetBlockId) {
                targetBlockId = await resolveExcerptBlockId(docId, excerpt.text, selectionContext);
            }
            if (!targetBlockId || targetBlockId === docId) {
                await copyText(memo ? `${excerpt.text}\n\n💡 ${memo}` : excerpt.text);
                return;
            }
            const newBlockId = await insertQuoteExcerpt(targetBlockId, excerpt.text, memo, { normalizeListAnchor: true });
            try {
                await markGleanHighlight(newBlockId, color);
            } catch (err) {
                console.debug("[LvGlean] 高亮色彩与金句属性写入异常:", err);
            }
            showMessage(t(i18n, memo ? "reader.memoDone" : "reader.excerptDone"), 2500);
            if (docId) void loadDocHighlights(docId);
            facade.notifyDataChanged();
            excerpt = null;
            excerptRange = null;
            memoInputOpen = false;
            memoDraft = "";
        } catch (error) {
            console.warn("[glean] 摘录插入失败:", error);
            showMessage(t(i18n, "reader.actionFailed"), 3000);
        } finally {
            excerptBusy = false;
        }
    }

    function handleMemoKeyDown(event: KeyboardEvent): void {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (memoDraft.trim()) void quoteExcerpt(memoDraft.trim());
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            memoInputOpen = false;
        }
    }

    function submitMemo(): void {
        if (memoDraft.trim()) void quoteExcerpt(memoDraft.trim());
    }

    /** 渐进阅读快捷划词摘录到小驴闪卡（Issue #17 标准，Alt+E） */
    async function incrementalExtractToCards(): Promise<void> {
        if (!excerpt?.text || !context || context.id !== docId || flashcardPipelineBusy) return;
        if (!hasCardsInstalled) {
            makeQuoteCardPreview(facade, { title: context.title, quote: excerpt.text, docId: context.id, blockId: excerpt.blockId });
            return;
        }
        const sourceDocId = context.id;
        const text = excerpt.text;
        const sourceBlockId = excerpt.blockId || docId;
        const requestId = extractDeliveryKey(sourceDocId, sourceBlockId, text);
        flashcardPipelineBusy = true;
        try {
            const res = await sendExtractToCardsSafely({ content: text, sourceBlockId, sourceDocId,
                sourceTitle: context.title, tags: context.tags || [], requestId });
            if (context?.id !== sourceDocId) return;
            if (res.ok) {
                enrolledFlashcardKeys.add(requestId);
                if (typeof markHighlightCarded === "function") void markHighlightCarded(sourceBlockId).catch(() => undefined);
                showMessage(t(i18n, "reader.extractedToCards"), 2500);
            }
            else showMessage(t(i18n, res.state === "unknown" ? "reader.extractPending" : "reader.extractFailed"), 4000);
        } finally { flashcardPipelineBusy = false; }
    }

    /** 划词提炼下一步行动待办（Task Horizon 联动） */
    async function extractToHorizonTask(): Promise<void> {
        if (!excerpt?.text || !context || context.id !== docId) return;
        const taskMarkdown = formatTaskHorizonItem(excerpt.text, context.id, context.title, excerpt.blockId);
        try {
            await navigator.clipboard.writeText(taskMarkdown);
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                try { navigator.vibrate?.(15); } catch { /* noop */ }
            }
            if (typeof window !== "undefined") {
                const payload: TaskHorizonActionPayload = {
                    taskMarkdown,
                    quoteText: excerpt.text,
                    sourceDocId: context.id,
                    sourceBlockId: excerpt.blockId,
                    sourceTitle: context.title,
                    sourceUrl: context.url,
                    priority: "medium",
                    createdAt: new Date().toISOString(),
                };
                window.dispatchEvent(new CustomEvent("horizon:action-created", { detail: payload }));
                window.dispatchEvent(new CustomEvent("siyuan-horizon:new-task", { detail: payload }));
            }
            showMessage(t(i18n, "reader.extractedToTask"), 2500);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function cardFromExcerpt(): Promise<void> {
        if (!excerpt?.text || !excerpt.blockId || !context || context.id !== docId) return;
        try {
            makeQuoteCardPreview(facade, { title: context.title, quote: excerpt.text, docId: context.id, blockId: excerpt.blockId });
        } catch (error) {
            console.warn("[glean] 摘录制卡失败:", error);
            showMessage(t(i18n, "reader.actionFailed"), 3000);
        }
    }

    async function examFromExcerpt(): Promise<void> {
        if (!excerpt?.text || !context || context.id !== docId) return;
        const examBridge = getBridgeSafely<Record<string, unknown>>("exam");
        if (examBridge && typeof examBridge.quickGenerateQuestion === "function") {
            try {
                await (examBridge.quickGenerateQuestion as (options: unknown) => Promise<unknown>)({
                    title: context.title,
                    text: excerpt.text,
                    docId: context.id,
                    blockId: excerpt.blockId,
                });
                showMessage(t(i18n, "reader.examStarted"), 2500);
            } catch (error) {
                console.warn("[LvGlean] 考试出题失败:", error);
                showMessage(t(i18n, "reader.actionFailed"), 3000);
            }
        } else {
            showMessage(t(i18n, "reader.examGhostHint"), 3000);
        }
    }

    let flashcardPipelineBusy = $state(false);
    const enrolledFlashcardKeys = new SvelteSet<string>();

    function closeReaderSearch(): void {
        searchOpen = false;
        const root = readerRoot;
        if (!root) return;
        root.focus({ preventScroll: true });
        void tick().then(() => {
            if (!searchOpen && readerRoot && (document.activeElement === document.body || !readerRoot.contains(document.activeElement))) {
                readerRoot.focus({ preventScroll: true });
            }
        });
    }

    async function makeFlashcardFromExcerpt(): Promise<void> {
        if (!excerpt?.text || !excerpt.blockId || flashcardPipelineBusy) return;
        flashcardPipelineBusy = true;
        const blockId = excerpt.blockId;
        const key = extractDeliveryKey(context?.id || docId || "", blockId, excerpt.text);
        try {
            const payload = buildHighlightFlashcardPayload({
                highlightText: excerpt.text,
                contextText: excerpt.text,
                sourceBlockId: blockId,
                sourceTitle: context?.title || "文章",
                docTags: context?.tags || [],
            });
            const res = await dispatchHighlightToFlashcard(facade, payload);
            if (res.success && res.mode === "automated") {
                enrolledFlashcardKeys.add(key);
                enrolledFlashcardKeys.add(blockId);
            }
        } finally {
            flashcardPipelineBusy = false;
        }
    }

    async function copyText(text: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(text);
            showMessage(t(i18n, "reader.copied"), 2000);
        } catch {
            showMessage(t(i18n, "reader.actionFailed"), 2500);
        }
    }

    function cancelAiTask(): void {
        if (!aiBusy) return;
        aiAbort?.abort();
        aiAbort = null;
        aiBusy = "";
    }

    async function runSummarize(): Promise<void> {
        if (!docId || aiBusy || !aiReady) return;
        const targetDocId = docId;
        const generation = sessionGeneration;
        const controller = new AbortController();
        aiAbort = controller;
        aiBusy = "summarize";
        aiResult = null;
        summarySaved = false;
        try {
            const outcome = await readerSummarize(facade.pluginInstance, targetDocId, activeSettings, { signal: controller.signal });
            if (controller.signal.aborted || outcome.aborted || !currentSession(targetDocId, generation)) return;
            if (outcome.ok && outcome.text) {
                aiResult = { kind: "summarize", action: t(i18n, "reader.aiSummarize"), text: outcome.text, scope: "full" };
            } else if (outcome.skipped === "cap") {
                showMessage(t(i18n, "ai.capReached", { n: activeSettings.ai.enrichDailyCap }), 4000);
            } else if (outcome.skipped !== "off") {
                showMessage(outcome.policyReason || t(i18n, aiFailureKey(outcome.skipped) ?? "ai.enrichFailed"), outcome.policyReason ? 4500 : 3000);
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                console.warn("[glean] AI 摘要异常:", error);
                showMessage(t(i18n, "reader.actionFailed"), 3000);
            }
        } finally {
            if (aiAbort === controller) {
                aiAbort = null;
                aiBusy = "";
            }
        }
    }

    async function runTranslate(): Promise<void> {
        if (!docId || aiBusy || !aiReady || !excerpt?.text) return;
        const targetDocId = docId;
        const selectedText = excerpt.text;
        const generation = sessionGeneration;
        const controller = new AbortController();
        aiAbort = controller;
        aiBusy = "translate";
        aiResult = null;
        summarySaved = false;
        const needOverlay = immersive || zenMode;
        if (!needOverlay) {
            sidebarCollapsed = false;
            if (companionTab !== "all") companionTab = "ai";
        }
        try {
            const outcome = needOverlay
                ? await withLvAiWait(
                    {
                        scenario: "transform",
                        title: t(i18n, "reader.aiTranslate"),
                        signal: controller.signal,
                        onCancel: cancelAiTask,
                    },
                    (signal) => readerTranslate(facade.pluginInstance, targetDocId, selectedText, activeSettings, { signal }),
                )
                : await readerTranslate(facade.pluginInstance, targetDocId, selectedText, activeSettings, { signal: controller.signal });
            if (controller.signal.aborted || outcome.aborted || !currentSession(targetDocId, generation)) return;
            if (outcome.ok && outcome.text) {
                aiResult = { kind: "translate", action: t(i18n, "reader.aiTranslate"), text: outcome.text, scope: "selection" };
                if (needOverlay) {
                    immersive = false;
                    zenMode = false;
                    sidebarCollapsed = false;
                    if (companionTab !== "all") companionTab = "ai";
                }
            } else if (outcome.skipped === "cap") {
                showMessage(t(i18n, "ai.capReached", { n: activeSettings.ai.enrichDailyCap }), 4000);
            } else if (outcome.skipped !== "off") {
                showMessage(outcome.policyReason || t(i18n, aiFailureKey(outcome.skipped) ?? "ai.enrichFailed"), outcome.policyReason ? 4500 : 3000);
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                console.warn("[glean] AI 翻译异常:", error);
                showMessage(t(i18n, "reader.actionFailed"), 3000);
            }
        } finally {
            if (aiAbort === controller) {
                aiAbort = null;
                aiBusy = "";
            }
        }
    }

    function triggerQuickQuestion(promptText: string): void {
        if (!docId || aiBusy || !aiReady || !articleQuestionOn) return;
        question = promptText;
        void runArticleQuestion();
    }

    async function runArticleQuestion(): Promise<void> {
        if (!docId || aiBusy || !aiReady || !articleQuestionOn) return;
        const targetDocId = docId;
        const generation = sessionGeneration;
        const source = questionMode === "selection" && excerpt?.blockId ? excerpt.text : "";
        if (questionMode === "selection" && !source) {
            showMessage(t(i18n, "reader.articleQuestion.invalid"), 3000);
            return;
        }
        const controller = new AbortController();
        aiAbort = controller;
        aiBusy = "question";
        questionResult = null;
        try {
            const outcome = await readerArticleQuestion(facade.pluginInstance, targetDocId, question, activeSettings, source, questionMode === "selection" ? excerpt?.blockId ?? "" : "", { signal: controller.signal });
            if (controller.signal.aborted || outcome.aborted || !currentSession(targetDocId, generation)) return;
            if (outcome.ok && outcome.result) {
                questionResult = { answer: outcome.result.answer, evidence: outcome.result.evidence, truncated: Boolean(outcome.truncated), scope: questionMode };
            } else if (outcome.skipped === "cap") {
                showMessage(t(i18n, "ai.capReached", { n: activeSettings.ai.enrichDailyCap }), 4000);
            } else if (outcome.skipped === "changed") {
                showMessage(t(i18n, "reader.articleQuestion.changed"), 3500);
            } else if (outcome.skipped === "invalid") {
                showMessage(t(i18n, "reader.articleQuestion.invalid"), 3000);
            } else if (outcome.skipped !== "off") {
                showMessage(outcome.policyReason || t(i18n, aiFailureKey(outcome.skipped) ?? "ai.enrichFailed"), outcome.policyReason ? 4500 : 3000);
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                console.warn("[glean] 文章提问异常:", error);
                showMessage(t(i18n, "reader.actionFailed"), 3000);
            }
        } finally {
            if (aiAbort === controller) {
                aiAbort = null;
                aiBusy = "";
            }
        }
    }

    function cancelGhostreader(): void {
        ghostreaderAbort?.abort();
        ghostreaderAbort = null;
        ghostreaderBusy = false;
        ghostreaderHasChunk = false;
        ghostreaderResult = null;
        ghostreaderResultDocId = "";
    }

    async function handleGhostreader(action: GhostreaderAction, query?: string): Promise<void> {
        const activeSnapshot = (excerpt?.text && docId)
            ? { docId, text: excerpt.text, sourceBlockId: excerpt.blockId || undefined }
            : ghostreaderSnapshot;
        if (!docId || !activeSnapshot?.text || activeSnapshot.docId !== docId || ghostreaderBusy) return;
        if (!aiOn) {
            showMessage(t(i18n, "reader.aiOff"), 3000);
            return;
        }
        // 2026-11-21 走查修复（P2）：补会话守卫——流式期间切换文章时旧分析残留新面板、
        // 插入会把 A 文解读写进 B 文（同文件 runRelated/ai 分支均有 currentSession 守卫，唯此处缺失）。
        const generation = sessionGeneration;
        const srcDocId = docId;
        ghostreaderSnapshot = { docId: srcDocId, text: activeSnapshot.text, sourceBlockId: activeSnapshot.sourceBlockId };
        ghostreaderAbort?.abort();
        const controller = new AbortController();
        ghostreaderAbort = controller;
        ghostreaderBusy = true;
        ghostreaderHasChunk = false;
        const sourceText = activeSnapshot.text;
        const sourceBlockId = activeSnapshot.sourceBlockId;
        const title = context?.title || docTitle;

        ghostreaderResultDocId = srcDocId;
        ghostreaderResult = {
            action,
            actionLabel: GHOSTREADER_ACTIONS.find((a) => a.id === action)?.label || "伴读分析",
            sourceText,
            sourceBlockId,
            answer: "",
            timestamp: new Date().toISOString(),
            status: "streaming",
        };

        try {
            const res = await executeGhostreader(
                action,
                sourceText,
                sourceBlockId,
                title,
                query,
                (partial) => {
                    if (!controller.signal.aborted && ghostreaderResult && currentSession(srcDocId, generation)) {
                        ghostreaderHasChunk = true;
                        ghostreaderResult.answer = partial;
                    }
                },
                { plugin: facade.pluginInstance, settings: activeSettings, docId: srcDocId, signal: controller.signal }
            );
            if (controller.signal.aborted || res.aborted || !currentSession(srcDocId, generation)) return; // 已取消或已切换文档：丢弃结果
            ghostreaderResult = res;
            ghostreaderResultDocId = srcDocId;
            if (res.status === "failed" && res.skipped === "cap") {
                showMessage(t(i18n, "ai.capReached", { n: String(activeSettings.ai.enrichDailyCap) }), 3500);
            }
        } catch (err) {
            if (!controller.signal.aborted && ghostreaderResult && currentSession(srcDocId, generation)) {
                ghostreaderResult.status = "failed";
                ghostreaderResult.error = err instanceof Error ? err.message : "请求失败";
            }
        } finally {
            if (ghostreaderAbort === controller) {
                ghostreaderAbort = null;
                ghostreaderBusy = false;
            }
        }
    }

    async function handleSaveGhostreaderCallout(): Promise<void> {
        if (!docId || !ghostreaderResult || ghostreaderInserting) return;
        const targetDocId = docId;
        const targetGeneration = sessionGeneration;
        const resultToSave = ghostreaderResult;
        const resultDocId = ghostreaderResultDocId;
        if (!(await ensureWritableDoc())) return;
        if (!currentSession(targetDocId, targetGeneration) || resultDocId !== targetDocId) {
            showMessage(t(i18n, "msg.ghostreaderStale"), 3200, "error");
            return;
        }
        ghostreaderInserting = true;
        try {
            const res = await insertGhostreaderCallout(targetDocId, resultToSave, resultToSave.sourceBlockId);
            if (!mounted || !currentSession(targetDocId, targetGeneration)) return;
            if (res.ok) {
                showMessage(t(i18n, "msg.ghostreaderInserted"), 3000);
            } else {
                showMessage(t(i18n, "msg.actionFailed"), 3000);
            }
        } finally {
            ghostreaderInserting = false;
        }
    }

    async function loadHighlightOutline(): Promise<void> {
        const targetDocId = docId;
        const generation = sessionGeneration;
        const request = ++highlightOutlineGeneration;
        if (!targetDocId) return;
        highlightOutlineLoading = true;
        try {
            const tree = await generateDocHighlightOutline(targetDocId, context?.title);
            if (!mounted || !currentSession(targetDocId, generation) || request !== highlightOutlineGeneration) return;
            highlightOutlineTree = tree;
        } catch (error) {
            console.warn("[glean] 生成高亮大纲失败:", error);
        } finally {
            if (currentSession(targetDocId, generation) && request === highlightOutlineGeneration) {
                highlightOutlineLoading = false;
            }
        }
    }

    async function handleExportHighlightOutline(): Promise<void> {
        if (!highlightOutlineTree || highlightOutlineExporting) return;
        highlightOutlineExporting = true;
        try {
            const res = await exportHighlightOutlineAsDoc(facade.pluginInstance, highlightOutlineTree);
            if (res.ok && res.docId) {
                showMessage(t(i18n, "msg.outlineExported"), 3000);
                void openTab({ app: facade.pluginInstance.app, doc: { id: res.docId } });
            } else {
                showMessage(res.error || t(i18n, "msg.actionFailed"), 3000);
            }
        } finally {
            highlightOutlineExporting = false;
        }
    }

    async function handleCopyHighlightOutlineMd(): Promise<void> {
        if (!highlightOutlineTree) return;
        const md = renderStructuredOutlineMarkdown(highlightOutlineTree);
        await copyText(md);
        showMessage(t(i18n, "msg.outlineMdCopied"), 2500);
    }

    async function runRelated(): Promise<void> {
        if (!docId || aiBusy || !aiReady) return;
        const targetDocId = docId;
        const targetTitle = context?.title || docTitle || "";
        const generation = sessionGeneration;
        const controller = new AbortController();
        aiAbort = controller;
        aiBusy = "related";
        relatedReason = null;
        try {
            const outcome = await findRelatedOutcome(targetDocId, targetTitle, [], { plugin: facade.pluginInstance, settings: activeSettings, signal: controller.signal });
            if (controller.signal.aborted || outcome.aborted || !currentSession(targetDocId, generation)) return;
            relatedItems = outcome.items;
            relatedReason = outcome.reason;
            relatedShown = true;
        } catch {
            if (!controller.signal.aborted && currentSession(targetDocId, generation)) {
                relatedItems = [];
                relatedReason = "error";
                relatedShown = true;
                showMessage(t(i18n, "reader.relatedFailed"), 3500);
            }
        } finally {
            if (aiAbort === controller) {
                aiAbort = null;
                aiBusy = "";
            }
        }
    }

    function relatedStatusMessage(reason: RelatedReason | null): string {
        if (reason === "embedding-disabled") return t(i18n, "reader.relatedEmbeddingDisabled");
        if (reason === "error") return t(i18n, "reader.relatedFailed");
        if (reason === "disabled") return t(i18n, "reader.relatedDisabled");
        if (reason === "no-hits") return t(i18n, "reader.relatedNoHits");
        return t(i18n, "reader.relatedNone");
    }

    function aiBusyMessage(): string {
        const action = aiBusy === "translate"
            ? t(i18n, "reader.aiTranslate")
            : aiBusy === "question"
                ? t(i18n, "reader.articleQuestion.action")
                : aiBusy === "related"
                    ? t(i18n, "reader.aiRelated")
                    : t(i18n, "reader.aiSummarize");
        return t(i18n, "reader.aiWorking", { action });
    }

    async function copyExcerpt(): Promise<void> {
        if (!excerpt) return;
        await copyText(excerpt.text);
    }

    async function copyAiResult(): Promise<void> {
        if (!aiResult) return;
        await copyText(aiResult.text);
    }

    async function keepSummary(): Promise<void> {
        if (!aiResult || aiResult.kind !== "summarize" || !context || context.id !== docId || summarySaving || summarySaved) return;
        summarySaving = true;
        try {
            const result = await saveReaderSummary(facade.pluginInstance, context.id, aiResult.text);
            summarySaved = true;
            showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "reader.aiSummarySaved"), result.indexSyncFailed ? 4000 : 2500);
            facade.notifyDataChanged();
        } catch {
            showMessage(t(i18n, "reader.actionFailed"), 3000);
        } finally {
            summarySaving = false;
        }
    }

    async function insertAiResultCallout(): Promise<void> {
        if (!docId || !aiResult || insertingCallout) return;
        if (!(await ensureWritableDoc())) return;
        insertingCallout = true;
        try {
            await insertAiCalloutToDocument(docId, aiResult.text, {
                title: aiResult.action,
                source: channelLabel,
            });
            showMessage(t(i18n, "reader.aiCalloutInserted"), 3000);
            facade.notifyDataChanged();
        } catch (error) {
            console.warn("[glean] AI 结果插入正文失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 3000);
        } finally {
            insertingCallout = false;
        }
    }

    let syncingMetaCallout = $state(false);

    async function handleSyncMetaCallout(): Promise<void> {
        if (!docId || syncingMetaCallout) return;
        if (!(await ensureWritableDoc())) return;
        syncingMetaCallout = true;
        try {
            const labels = {
                title: t(i18n, "metaCallout.title"),
                source: t(i18n, "metaCallout.source"),
                author: t(i18n, "metaCallout.author"),
                status: t(i18n, "metaCallout.status"),
                priority: t(i18n, "metaCallout.priority"),
                rating: t(i18n, "metaCallout.rating"),
                words: t(i18n, "metaCallout.words"),
                minutes: t(i18n, "metaCallout.minutes"),
                readMinutes: t(i18n, "metaCallout.readMinutes"),
                tags: t(i18n, "metaCallout.tags"),
                summary: t(i18n, "metaCallout.summary"),
                bookmark: t(i18n, "metaCallout.bookmark"),
                unknown: t(i18n, "metaCallout.unknown"),
                untitled: t(i18n, "panel.untitled"),
                clickToResume: t(i18n, "metaCallout.clickToResume"),
            };
            const res = await syncMetaCalloutToDocument(facade.pluginInstance, docId, labels);
            if (res.ok) {
                showMessage(t(i18n, res.created ? "reading.metaCalloutCreated" : "reading.metaCalloutUpdated"), 3000);
                facade.notifyDataChanged();
            } else {
                showMessage(t(i18n, "reading.metaCalloutFailed") + (res.error ? `: ${res.error}` : ""), 3000);
            }
        } catch {
            showMessage(t(i18n, "reading.metaCalloutFailed"), 3000);
        } finally {
            syncingMetaCallout = false;
        }
    }

    let recordingDailyNote = $state(false);

    async function handleRecordDailyNote(): Promise<void> {
        if (!docId || recordingDailyNote || statusBusy) return;
        const notebookId = facade.settings.anchorNotebooks?.[0] || "";
        recordingDailyNote = true;
        try {
            const res = await recordDailyNoteReading(notebookId, docId);
            if (res.ok) {
                showMessage(t(i18n, res.updated ? "dailyNote.entryUpdated" : "dailyNote.entryCreated"), 3000);
            } else {
                showMessage(t(i18n, "dailyNote.failed") + (res.error ? `: ${res.error}` : ""), 3000);
            }
        } catch {
            showMessage(t(i18n, "dailyNote.failed"), 3000);
        } finally {
            recordingDailyNote = false;
        }
    }

    async function insertQuestionCallout(): Promise<void> {
        if (!docId || !questionResult || insertingCallout) return;
        if (!(await ensureWritableDoc())) return;
        insertingCallout = true;
        const body = questionResult.evidence.length > 0
            ? `${questionResult.answer}\n\n${questionResult.evidence.map((line) => `> ${line}`).join("\n")}`
            : questionResult.answer;
        try {
            await insertAiCalloutToDocument(docId, body, {
                title: t(i18n, "reader.articleQuestion.action"),
                source: question ? `“${question}”` : undefined,
            });
            showMessage(t(i18n, "reader.aiCalloutInserted"), 3000);
            facade.notifyDataChanged();
        } catch (error) {
            console.warn("[glean] 问答结果插入正文失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 3000);
        } finally {
            insertingCallout = false;
        }
    }

    function setMode(next: "read" | "edit"): void {
        if (mode === next) return;
        const capturedAnchor = readPointHandle?.captureCurrentPoint() ?? currentBookmarkBlockId ?? context?.readPoint ?? null;
        modeSwitchAnchorId = capturedAnchor;
        if (capturedAnchor) currentBookmarkBlockId = capturedAnchor;
        const switchDocId = docId;
        mode = next;
        if (protyle) {
            protyle.setMode(modeValue(next));
        }
        if (next === "read" && switchDocId) {
            clearReaderMarkdownCache(facade.pluginInstance, switchDocId);
            void loadOutline(switchDocId);
            void loadDocHighlights(switchDocId);
            if (companionTab === "fold") {
                void refreshFoldNodes(switchDocId);
            }
        }
        showMessage(t(i18n, next === "edit" ? "reader.editHint" : "reader.readHint"), 2500);
    }

    function openSource(): void {
        const url = context ? sourceUrlForCarrier(context.contentType, context.url) : "";
        if (!url) {
            showMessage(t(i18n, "clip.sourceMissing"), 3000);
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
    }

    /** 显式"检测正文"（T-1727）：导出重算并写回，不改用户正文。 */
    async function checkBody(): Promise<void> {
        if (!context || context.id !== docId || measuring) return;
        const current = context;
        const generation = sessionGeneration;
        measuring = true;
        try {
            const measured = await measureClipBody(facade.pluginInstance, current.id);
            facade.notifyDataChanged();
            if (!currentSession(current.id, generation)) return;
            if (context?.id === current.id) context = { ...context, words: measured.words };
            showMessage(
                measured.indexSyncFailed
                    ? t(i18n, "msg.writeIndexPending")
                    : measured.missing
                    ? t(i18n, "clip.bodyMissingConfirm")
                    : t(i18n, "clip.bodyOk", { n: measured.words }),
                measured.indexSyncFailed ? 4000 : 3500
            );
        } catch (error) {
            console.warn("[glean] 正文检测失败:", error);
            showMessage(t(i18n, "clip.bodyCheckFailed"), 3000);
        } finally {
            measuring = false;
        }
    }

    /** "重新剪藏"是打开原文的显式导航；本文不被覆盖，快照保留。 */
    function recapture(): void {
        const url = context ? sourceUrlForCarrier(context.contentType, context.url) : "";
        if (!url) {
            showMessage(t(i18n, "clip.sourceMissing"), 3000);
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        showMessage(t(i18n, "clip.reclipHint"), 4500);
    }

    async function writeStatus(status: ClipStatus): Promise<void> {
        if (!context || context.id !== docId || statusBusy) return;
        const current = context;
        const generation = sessionGeneration;
        statusBusy = true;
        try {
            const result = await batchSetStatusDetailed(facade.pluginInstance, [current.id], status);
            if (result.ok !== 1) {
                showMessage(t(i18n, "msg.statusFailed"), 3000);
                return;
            }
            if (status === "done") await flushReadingMinutes(current.id, generation);
            if (status === "done" && facade.settings.integration.checkinEnabled && facade.settings.integration.checkinItemId) {
                void recordReadingDone(facade.settings.integration.checkinItemId, current.id, current.title, displayedReadMinutes || estReadingMinutes || 1);
            }
            if (status === "done" && facade.settings.integration.dailyNoteEnabled) {
                const notebookId = facade.settings.anchorNotebooks?.[0] || "";
                const targetDocId = current.id;
                void recordDailyNoteReading(notebookId, targetDocId).catch(() => undefined);
            }
            if (currentSession(current.id, generation)) {
                contextRequests.invalidate();
                context = { ...(context?.id === current.id ? context : current), status };
            }
            facade.notifyDataChanged();
            showMessage(t(i18n, result.indexSyncFailed.length ? "msg.statusIndexPending" : "msg.statusChanged"), 3500);
        } catch (error) {
            console.warn("[glean] 阅读状态变更失败:", error);
            showMessage(t(i18n, "msg.statusFailed"), 3000);
        } finally {
            statusBusy = false;
        }
    }

    async function startReading(): Promise<void> {
        if (!context) return;
        // 页签内文档已打开；"开始阅读"只负责显式写入 reading，不再导航。
        await writeStatus("reading");
    }

    /**
     * "读完并下一篇"（T-1723）：显式动作，默认不自动前进。
     * 完成写入成功后才切下一篇；没有下一篇时不回滚完成状态。
     */
    async function doneAndNext(): Promise<void> {
        if (!context || context.id !== docId || statusBusy) return;
        const current = context;
        const generation = sessionGeneration;
        statusBusy = true;
        try {
            const result = await batchSetStatusDetailed(facade.pluginInstance, [current.id], "done");
            if (result.ok !== 1) {
                showMessage(t(i18n, "msg.statusFailed"), 3000);
                return;
            }
            await flushReadingMinutes(current.id, generation);
            if (facade.settings.integration.checkinEnabled && facade.settings.integration.checkinItemId) {
                void recordReadingDone(facade.settings.integration.checkinItemId, current.id, current.title, displayedReadMinutes || estReadingMinutes || 1);
            }
            facade.notifyDataChanged();
            const next = await pickNextUnread(facade.pluginInstance, current.id);
            if (!currentSession(current.id, generation)) return;
            if (!next) {
                contextRequests.invalidate();
                context = { ...(context?.id === current.id ? context : current), status: "done" };
                const message = t(i18n, "reader.noNext");
                showMessage(result.indexSyncFailed.length ? `${message} ${t(i18n, "msg.statusIndexPending")}` : message, 4000);
                return;
            }
            if (result.indexSyncFailed.length) showMessage(t(i18n, "msg.statusIndexPending"), 4000);
            else showMessage(t(i18n, "msg.statusChanged"), 2000);
            docId = next;
            aiResult = null;
            summarySaving = false;
            summarySaved = false;
            relatedShown = false;
            relatedItems = [];
            relatedReason = null;
            excerpt = null;
        } catch (error) {
            console.warn("[glean] 阅读完成变更失败:", error);
            showMessage(t(i18n, "msg.statusFailed"), 3000);
        } finally {
            statusBusy = false;
        }
    }

    async function setPriority(value: number): Promise<void> {
        if (!context || context.id !== docId || statusBusy) return;
        const current = context;
        const generation = sessionGeneration;
        statusBusy = true;
        try {
            const result = await writeClip(facade.pluginInstance, current.id, { priority: value }, { force: true });
            if (currentSession(current.id, generation)) {
                contextRequests.invalidate();
                context = { ...(context?.id === current.id ? context : current), priority: value };
            }
            facade.notifyDataChanged();
            showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "msg.rankSaved"), result.indexSyncFailed ? 4000 : 2500);
        } catch {
            showMessage(t(i18n, "msg.statusFailed"), 3000);
        } finally {
            statusBusy = false;
        }
    }

    async function setRating(value: number): Promise<void> {
        if (!context || context.id !== docId || statusBusy) return;
        const current = context;
        const generation = sessionGeneration;
        statusBusy = true;
        try {
            const result = await writeClip(facade.pluginInstance, current.id, { rating: value }, { force: true });
            if (currentSession(current.id, generation)) {
                contextRequests.invalidate();
                context = { ...(context?.id === current.id ? context : current), rating: value };
            }
            facade.notifyDataChanged();
            showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "msg.rankSaved"), result.indexSyncFailed ? 4000 : 2500);
        } catch {
            showMessage(t(i18n, "msg.statusFailed"), 3000);
        } finally {
            statusBusy = false;
        }
    }

    async function takeSnapshot(): Promise<void> {
        if (!context || context.id !== docId || snapping) return;
        if (context.snapshot) {
            void openTab({ app: facade.pluginInstance.app, asset: { path: context.snapshot } });
            return;
        }
        const current = context;
        const generation = sessionGeneration;
        snapping = true;
        try {
            const result = await snapshotClip(facade.pluginInstance, current.id);
            const { path } = result;
            if (currentSession(current.id, generation)) {
                contextRequests.invalidate();
                context = { ...(context?.id === current.id ? context : current), snapshot: path };
            }
            showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "snapshot.done"), result.indexSyncFailed ? 4000 : 3000);
            facade.notifyDataChanged();
        } catch {
            showMessage(t(i18n, "snapshot.failed"), 3000);
        } finally {
            snapping = false;
        }
    }

    function backToLibrary(): void {
        stopSpeech();
        if (context?.id === docId) void facade.openLibraryArticle(context.id);
        else facade.openPanel("library");
    }

    function carrierLabel(value: string | undefined): string {
        return t(i18n, `clip.type.${resolveCarrier(value)}`);
    }
</script>

<div
    class="glean-reader"
    class:glean-reader--immersive={immersive}
    class:glean-reader--zen={zenMode}
    class:glean-reader--has-margin-notes={marginNotesOpen && docHighlights.length > 0 && !searchOpen && !facade.isMobile && !zenMode}
    aria-busy={Boolean(aiBusy || sidebarBusy || statusBusy || appearanceBusy || measuring || snapping || contextLoading || outlineLoading)}
    bind:this={readerRoot}
    role="region"
    tabindex="-1"
    aria-label={t(i18n, "reader.title")}
    data-reader-font-size={readerAppearance.fontSize}
    data-reader-line-height={readerAppearance.lineHeight}
    data-reader-width={readerAppearance.width}
    data-reader-theme={readerAppearance.theme}
    data-reader-mode={mode}
    data-reader-immersive={immersive}
    data-reader-zen={zenMode}
>
    {#if docId}
        <div class="glean-reader__toolbar" role="group" aria-label={t(i18n, "reader.title")}>
            <div class="glean-reader__toolbar-left">
                <button
                    type="button"
                    class="glean-icon-btn glean-reader__toolbar-back"
                    title="{t(i18n, 'reading.backToLibrary')} (Esc)"
                    aria-label={t(i18n, "reading.backToLibrary")}
                    onclick={backToLibrary}
                >
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowLeft" /></svg>
                </button>
                <div class="glean-reader__toolbar-heading">
                    <button
                        type="button"
                        class="glean-reader__toolbar-title glean-linkish"
                        style="background: transparent; border: none; padding: 0; text-align: left; cursor: pointer;"
                        title={`${context?.title || docTitle || t(i18n, "panel.untitled")}${t(i18n, "reader.openDocHint")}`}
                        onclick={() => { if (docId) void openTab({ app: facade.pluginInstance.app, doc: { id: docId } }); }}
                        oncontextmenu={async (e) => {
                            if (docId) {
                                e.preventDefault();
                                e.stopPropagation();
                                let box = context?.location?.box;
                                if (!box) {
                                    try {
                                        const rows = await querySql<{ box: string }>(`SELECT box FROM blocks WHERE id = '${docId.replace(/'/g, "''")}' LIMIT 1`);
                                        if (rows && rows[0]?.box) box = rows[0].box;
                                    } catch {}
                                }
                                if (box) {
                                    await showDocTreeNativeMenu({
                                        notebookId: box,
                                        docId,
                                        position: { x: e.clientX, y: e.clientY },
                                    });
                                }
                            }
                        }}
                    >{context?.title || docTitle || t(i18n, "panel.untitled")}</button>
                    {#if context}
                        <span class="glean-reader__toolbar-meta">
                            {carrierLabel(context.contentType)}{#if context.site} · {context.site}{/if}{#if context.author} · {#if authorPerson}<button type="button" class="glean-linkish glean-reader__author-contact-btn" title={t(i18n, "reader.authorContactHint", {name: authorPerson.name})} onclick={openAuthorContactDoc}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanUser" /></svg> {context.author}</button>{:else}{context.author}{/if}{/if}{#if (context.words ?? 0) > 0} · {t(i18n, "panel.words", { n: context.words ?? 0 })}{/if}{#if estReadingMinutes} · 约 {estReadingMinutes}m{/if}
                        </span>
                    {:else if !contextLoading && !contextError}
                        <span class="glean-reader__toolbar-meta">{t(i18n, "reader.notInLibraryBadge")}</span>
                    {/if}
                </div>
            </div>

            <div class="glean-reader__toolbar-center">
                <div class="glean-reader__mode glean-seg" role="group" aria-label={t(i18n, "settings.readerMode")}>
                    <button class="glean-seg__btn" class:glean-seg__btn--on={mode === "read"} aria-pressed={mode === "read"} title="{t(i18n, 'reader.readHint')} (Alt+E)" onclick={() => setMode("read")}>{t(i18n, "reader.modeRead")}</button>
                    <button class="glean-seg__btn" class:glean-seg__btn--on={mode === "edit"} aria-pressed={mode === "edit"} title="{t(i18n, 'reader.editHint')} (Alt+E)" onclick={() => setMode("edit")}>{t(i18n, "reader.modeEdit")}</button>
                </div>
            </div>

            <div class="glean-reader__toolbar-right">
                {#if context && hasSourceAction(context.contentType, context.url)}
                    <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm glean-reader__toolbar-source" onclick={openSource} title={t(i18n, "clip.openSource")}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanExternal" /></svg>
                        <span>{t(i18n, "reader.openWebpage")}</span>
                    </button>
                {/if}

                {#if context}
                    <button
                        type="button"
                        class="glean-btn glean-btn--ghost glean-btn--sm glean-reader__toolbar-done"
                        class:glean-gm-btn--fresh={context.status === "done"}
                        aria-busy={statusBusy}
                        disabled={statusBusy || context.status === "done"}
                        title={t(i18n, "action.markDoneHint")}
                        onclick={() => void writeStatus("done")}
                    >{context.status === "done" ? `${t(i18n, "status.done")} ✓` : t(i18n, "action.markDone")}</button>
                {/if}

                <button
                    type="button"
                    class="glean-btn glean-gm-btn glean-btn--sm glean-reader__toolbar-sidebar glean-gm-btn--accent"
                    class:is-active={!sidebarCollapsed && !zenMode}
                    aria-busy={sidebarBusy}
                    disabled={sidebarBusy}
                    aria-expanded={!sidebarCollapsed && !zenMode}
                    aria-controls={sidebarId}
                    title={t(i18n, sidebarCollapsed || zenMode ? "reader.sidebarShow" : "reader.sidebarHide")}
                    aria-label={t(i18n, sidebarCollapsed || zenMode ? "reader.sidebarShow" : "reader.sidebarHide")}
                    onclick={toggleCompanion}
                >
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCard" /></svg>
                    <span>{sidebarCollapsed || zenMode ? t(i18n, "reader.toggleHighlightsShow") : t(i18n, "reader.toggleHighlightsHide")} ({docHighlights.length})</span>
                </button>

                <div class="glean-reader__appearance-wrap" style="position: relative;">
                    <details
                        id={appearancePanelId}
                        class="glean-reader__appearance-popover"
                        aria-labelledby={appearanceTitleId}
                        bind:open={appearanceOpen}
                    >
                        <summary id={appearanceTitleId} style="display: none;">{t(i18n, "reader.appearanceTitle")}</summary>
                        <div class="glean-reader__appearance-row">
                            <span>{t(i18n, "reader.appearanceFontSize")}</span>
                            <select class="b3-select" disabled={appearanceBusy} value={readerAppearance.fontSize} onchange={(event) => void updateAppearance("fontSize", (event.currentTarget as HTMLSelectElement).value)}>
                                <option value="small">{t(i18n, "reader.appearanceSmall")}</option>
                                <option value="normal">{t(i18n, "reader.appearanceNormal")}</option>
                                <option value="large">{t(i18n, "reader.appearanceLarge")}</option>
                            </select>
                        </div>
                        <div class="glean-reader__appearance-row">
                            <span>{t(i18n, "reader.appearanceLineHeight")}</span>
                            <select class="b3-select" disabled={appearanceBusy} value={readerAppearance.lineHeight} onchange={(event) => void updateAppearance("lineHeight", (event.currentTarget as HTMLSelectElement).value)}>
                                <option value="compact">{t(i18n, "reader.appearanceCompact")}</option>
                                <option value="normal">{t(i18n, "reader.appearanceNormal")}</option>
                                <option value="relaxed">{t(i18n, "reader.appearanceRelaxed")}</option>
                            </select>
                        </div>
                        <div class="glean-reader__appearance-row">
                            <span>{t(i18n, "reader.appearanceWidth")}</span>
                            <select class="b3-select" disabled={appearanceBusy} value={readerAppearance.width} onchange={(event) => void updateAppearance("width", (event.currentTarget as HTMLSelectElement).value)}>
                                <option value="narrow">{t(i18n, "reader.appearanceNarrow")}</option>
                                <option value="normal">{t(i18n, "reader.appearanceNormal")}</option>
                                <option value="wide">{t(i18n, "reader.appearanceWide")}</option>
                            </select>
                        </div>
                        <div class="glean-reader__appearance-row">
                            <span>{t(i18n, "reader.appearanceTheme")}</span>
                            <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-theme" title="{t(i18n, 'reader.themeToggle')} (Alt+P)" onclick={cycleTheme}>
                                <span class={`glean-reader__theme-dot glean-reader__theme-dot--${readerAppearance.theme}`} aria-hidden="true"></span>
                                <span>{themeLabel(readerAppearance.theme)}</span>
                            </button>
                        </div>
                    </details>
                </div>

                <ActionPopover label={t(i18n, "reader.moreActions")} compact>
                    {#if context}
                        <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-primary" aria-busy={statusBusy} disabled={statusBusy} title={t(i18n, "reader.doneNextHint")} onclick={() => void doneAndNext()}>
                            ✓→ {t(i18n, "reader.doneNext")}
                        </button>
                    {/if}
                    <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-appearance" aria-expanded={appearanceOpen} aria-controls={appearancePanelId} onclick={toggleAppearance}>
                        <span style="font-weight: 700; font-size: 12px; font-family: serif;">Aa</span>
                        <span>{t(i18n, "reader.fontAndWidth")}</span>
                    </button>
                    <button type="button" class="glean-btn glean-btn--ghost" onclick={() => setMode(mode === "read" ? "edit" : "read")}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                        <span>{t(i18n, mode === "read" ? "reader.modeEdit" : "reader.modeRead")}{facade.isMobile ? "" : " (Alt+E)"}</span>
                    </button>
                    <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-search" onclick={() => { searchOpen = !searchOpen; }}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                        <span>{t(i18n, "reader.searchTitle")}{facade.isMobile ? "" : " (Ctrl+F)"}</span>
                    </button>
                    <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-fold" onclick={toggleFoldReader}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCard" /></svg>
                        <span>{t(i18n, "foldReader.navTitle")}{facade.isMobile ? "" : " (Alt+Z)"}</span>
                    </button>
                    {#if context}
                        <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-fav" class:glean-reader__toolbar-fav--active={context.favorite} onclick={() => void toggleFavorite()}>
                            <svg class="glean-icon glean-icon--xs" class:glean-icon--fav={context.favorite} aria-hidden="true"><use href={context.favorite ? "#iconGleanHeart" : "#iconGleanHeartOutline"} /></svg>
                            <span>{context.favorite ? t(i18n, "roaming.favoriteRemoved") : t(i18n, "roaming.favoriteAction")}{facade.isMobile ? "" : " (Alt+F)"}</span>
                        </button>
                    {/if}
                    <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-zen" onclick={toggleZenMode}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                        <span>{t(i18n, zenMode ? "reader.zenExit" : "reader.zenEnter")} (F11)</span>
                    </button>
                    <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-native" onclick={openNativeTab}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanLocal" /></svg>
                        <span>{t(i18n, "reader.openNative")}</span>
                    </button>
                    {#if isWechatArticle}
                        <button type="button" class="glean-btn glean-btn--ghost" onclick={openWeread}>
                            <span>{t(i18n, "reader.openWeread")}</span>
                        </button>
                    {/if}
                    <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-roam" onclick={() => void roamNext()}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanRefresh" /></svg>
                        <span>{t(i18n, "roaming.nextArticle")}</span>
                    </button>
                    {#if docHighlights.length > 0 && !facade.isMobile}
                        <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-margin-notes" onclick={() => { marginNotesOpen = !marginNotesOpen; }}>
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                            <span>{t(i18n, "reader.marginNotesToggle")}</span>
                        </button>
                    {/if}
                    <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-focus" disabled={mode !== "read"} onclick={() => readerRoot?.focus({ preventScroll: true })}>
                        <span>{t(i18n, "reader.keyboardFocus")}</span>
                    </button>
                    <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-shortcut" aria-expanded={shortcutHelp} aria-controls={shortcutsId} onclick={() => shortcutHelp = !shortcutHelp}>
                        <span>{t(i18n, "reader.shortcuts")}</span>
                    </button>
                    {#if !immersive}
                        <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-immersive" disabled={mode !== "read" || !docId} onclick={enterImmersive}>
                            <span>{t(i18n, "reader.immersiveStart")}</span>
                        </button>
                    {:else}
                        <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-exit" onclick={exitImmersive}>
                            <span>{t(i18n, "reader.immersiveExit")}</span>
                        </button>
                    {/if}
                    {#if context}
                        <div class="glean-gm-popover-sep"></div>
                        <button type="button" class="glean-btn glean-btn--ghost glean-reader__toolbar-unregister" onclick={() => facade.openUnregisterDialog?.(context!.id)}>
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowUp" /></svg>
                            <span>{t(i18n, "action.unregister")}</span>
                        </button>
                    {/if}
                </ActionPopover>
            </div>
        </div>
        {#if shortcutHelp}
            <div id={shortcutsId} class="glean-reader__shortcuts" role="region" aria-label={t(i18n, "reader.shortcuts")}>
                <p>{t(i18n, "reader.shortcutsHint")}</p>
                <dl>
                    <div><dt><kbd>j</kbd></dt><dd>{t(i18n, "reader.shortcutScrollDown")}</dd></div>
                    <div><dt><kbd>k</kbd></dt><dd>{t(i18n, "reader.shortcutScrollUp")}</dd></div>
                    <div><dt><kbd>Space</kbd></dt><dd>{t(i18n, "reader.shortcutPageDown")}</dd></div>
                    <div><dt><kbd>Shift+Space</kbd></dt><dd>{t(i18n, "reader.shortcutPageUp")}</dd></div>
                    <div><dt><kbd>e</kbd></dt><dd>{t(i18n, "reader.shortcutEdit")}</dd></div>
                    <div><dt><kbd>m</kbd></dt><dd>{t(i18n, "reader.shortcutDone")}</dd></div>
                    <div><dt><kbd>a</kbd></dt><dd>{t(i18n, "reader.shortcutLater")}</dd></div>
                    <div><dt><kbd>o</kbd></dt><dd>{t(i18n, "reader.shortcutOpenSource")}</dd></div>
                    <div><dt><kbd>x</kbd></dt><dd>{t(i18n, "reader.shortcutExcerpt")}</dd></div>
                    <div><dt><kbd>Alt+E</kbd></dt><dd>{t(i18n, "settings.readerMode")} / {t(i18n, "reader.extractToCards")}</dd></div>
                    <div><dt><kbd>Alt+T</kbd></dt><dd>{t(i18n, "reader.extractToTask")}</dd></div>
                    <div><dt><kbd>Alt+P</kbd></dt><dd>{t(i18n, "reader.themeToggle")}</dd></div>
                    <div><dt><kbd>Alt+R / Alt+B</kbd></dt><dd>{t(i18n, "roaming.nextArticle")}</dd></div>
                    <div><dt><kbd>Alt+M</kbd></dt><dd>{t(i18n, "reader.marginNotesToggle")}</dd></div>
                    <div><dt><kbd>Alt+F</kbd></dt><dd>{t(i18n, "roaming.favoriteAction")}</dd></div>
                    <div><dt><kbd>Alt+C</kbd></dt><dd>{t(i18n, "citation.copyGBT")}</dd></div>
                    <div><dt><kbd>Alt+Shift+C</kbd></dt><dd>{t(i18n, "citation.copyBibTeX")}</dd></div>
                    <div><dt><kbd>Alt+Q</kbd></dt><dd>{t(i18n, "quoteCard.action")}</dd></div>
                    <div><dt><kbd>Alt+S</kbd></dt><dd>{t(i18n, context?.snapshot ? "snapshot.open" : "snapshot.take")}</dd></div>
                    <div><dt><kbd>Alt+Z</kbd></dt><dd>{t(i18n, "foldReader.toggleAction")}</dd></div>
                    <div><dt><kbd>h</kbd></dt><dd>{t(i18n, "reader.shortcutNextHighlight")}</dd></div>
                    <div><dt><kbd>Shift+h</kbd></dt><dd>{t(i18n, "reader.shortcutPrevHighlight")}</dd></div>
                    <div><dt><kbd>Shift+F</kbd></dt><dd>{t(i18n, "reader.shortcutImmersive")}</dd></div>
                    <div><dt><kbd>y</kbd></dt><dd>{t(i18n, "action.copyBlockRef")}</dd></div>
                    <div><dt><kbd>/ / Ctrl+F</kbd></dt><dd>{t(i18n, "reader.searchTitle")}</dd></div>
                    <div><dt><kbd>?</kbd></dt><dd>{t(i18n, "reader.shortcutHelp")}</dd></div>
                    <div><dt><kbd>Esc</kbd></dt><dd>{t(i18n, "reader.shortcutEscape")}</dd></div>
                </dl>
            </div>
        {/if}
        {#if immersive}
            <p class="glean-reader__immersive-note" role="note">{t(i18n, "reader.immersiveCompatibility")}</p>
        {/if}
    {/if}
    <div class="glean-reader__body">
    <div class="glean-reader__main">
        {#if readingPercentage !== null && readingPercentage > 0}
            <div class="glean-reader__progress-bar" style="width: {readingPercentage}%" role="progressbar" aria-valuenow={readingPercentage} aria-valuemin="0" aria-valuemax="100" aria-label={t(i18n, "reader.progress")}></div>
        {/if}
        {#if docId}
            <ProtyleHost app={facade.pluginInstance.app} {docId} mode={modeValue(mode)} {i18n} bind:host={protyleHost} bind:controller={protyle} bind:protyleInstance bind:stage={protyleStage} className="glean-reader__host" onOpenDocument={() => { if (docId) void openTab({ app: facade.pluginInstance.app, doc: { id: docId } }); }} />
            <ReaderSearch bind:open={searchOpen} host={protyleHost} {docId} {mode} stage={protyleStage} {i18n} onClose={closeReaderSearch} />
            {#if excerpt?.text && !searchOpen}
                <div
                    class="glean-reader__selection-bar"
                    role="toolbar"
                    tabindex="-1"
                    aria-label={t(i18n, "reader.selectionToolbar")}
                    onpointerdown={(e) => {
                        lockSelectionBar();
                        const targetEl = e.target instanceof Element ? e.target : null;
                        if (!targetEl?.closest("input, textarea, select")) {
                            e.preventDefault();
                        }
                    }}
                >
                    <button type="button" class="glean-btn glean-btn--ghost glean-reader__selection-btn" disabled={excerptBusy} onclick={() => void quoteExcerpt()} title={t(i18n, "reader.excerptQuote")}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                        {t(i18n, "reader.excerptQuote")}
                    </button>
                    <div class="glean-reader__selection-colors" role="group" aria-label={t(i18n, "reader.filterByColor")}>
                        {#each ["yellow", "red", "blue", "green"] as color}
                            <button
                                type="button"
                                class="glean-reader__selection-color-btn"
                                title={t(i18n, `reader.color.${color}`)}
                                aria-label={t(i18n, `reader.color.${color}`)}
                                disabled={excerptBusy}
                                onclick={() => void quoteExcerpt(undefined, color)}
                            >
                                <span class="glean-reader__highlight-dot glean-reader__highlight-dot--{color}"></span>
                            </button>
                        {/each}
                    </div>
                    {#if !memoInputOpen}
                        <button type="button" class="glean-btn glean-btn--ghost glean-reader__selection-btn" disabled={excerptBusy} onclick={() => { memoInputOpen = true; memoDraft = ""; }} title={t(i18n, "reader.memoAction")}>
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                            <span>{t(i18n, "reader.memoAction")}</span>
                        </button>
                    {:else}
                        <div class="glean-reader__selection-memo">
                            <input
                                class="glean-mini-input glean-reader__selection-memo-input"
                                bind:value={memoDraft}
                                placeholder={t(i18n, "reader.memoPlaceholder")}
                                aria-label={t(i18n, "reader.memoPlaceholder")}
                                onkeydown={handleMemoKeyDown}
                            />
                            <button type="button" class="glean-btn glean-btn--pri glean-reader__selection-btn" disabled={excerptBusy || !memoDraft.trim()} title={t(i18n, "action.save")} aria-label={t(i18n, "action.save")} onclick={() => void submitMemo()}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                            </button>
                        </div>
                    {/if}
                    <span class="glean-reader__selection-sep" aria-hidden="true"></span>
                    <button
                        type="button"
                        class="glean-btn glean-btn--ghost glean-reader__selection-btn glean-reader__ghostreader-btn"
                        class:glean-btn--active={ghostreaderOpen}
                        disabled={excerptBusy || ghostreaderBusy || !aiOn}
                        onclick={() => {
                            const nextOpen = !ghostreaderOpen;
                            ghostreaderOpen = nextOpen;
                            if (nextOpen && excerpt?.text && docId) {
                                ghostreaderSnapshot = { docId, text: excerpt.text, sourceBlockId: excerpt.blockId || undefined };
                            } else if (!nextOpen) {
                                ghostreaderSnapshot = null;
                            }
                        }}
                        title={aiOn ? t(i18n, "ghost.askBtnHint") : t(i18n, "reader.aiOff")}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                        <span>Ghostreader</span>
                    </button>
                    {#if whaleStatus.installed}
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-reader__selection-btn glean-reader__selection-btn--whale"
                            disabled={excerptBusy}
                            onclick={() => void invokeWhaleCommentFromSelection()}
                            title={t(i18n, "reader.whaleCommentHint")}
                        >
                            <span>{t(i18n, "reader.whaleComment")}</span>
                        </button>
                    {/if}
                    <ActionPopover label={t(i18n, "library.moreActions")} compact>
                        {#if whaleStatus.installed && whaleStatus.aiAssistantEnabled}
                            <button
                                type="button"
                                class="glean-btn glean-btn--ghost"
                                disabled={excerptBusy}
                                onclick={() => invokeWhaleAiFromSelection()}
                                title={t(i18n, "reader.whaleAiExplain")}
                            >
                                <span>{t(i18n, "reader.whaleAiExplain")}</span>
                            </button>
                        {/if}
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost"
                            onclick={() => void quoteCardFromExcerpt()}
                            title="{t(i18n, 'quoteCard.action')} (Alt+Q)"
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                            <span>{t(i18n, "quoteCard.action")}</span>
                        </button>
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-reader__pipeline-btn"
                            class:glean-reader__selection-btn--enrolled={excerpt?.blockId && enrolledFlashcardKeys.has(extractDeliveryKey(context?.id || docId, excerpt.blockId, excerpt.text))}
                            disabled={excerptBusy || flashcardPipelineBusy}
                            onclick={() => void makeFlashcardFromExcerpt()}
                            title={excerpt?.blockId && enrolledFlashcardKeys.has(extractDeliveryKey(context?.id || docId, excerpt.blockId, excerpt.text)) ? t(i18n, "pipeline.cardCreatedBadge") : t(i18n, "pipeline.makeFlashcard")}
                            aria-label={excerpt?.blockId && enrolledFlashcardKeys.has(extractDeliveryKey(context?.id || docId, excerpt.blockId, excerpt.text)) ? t(i18n, "pipeline.cardCreatedBadge") : t(i18n, "pipeline.makeFlashcard")}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true">
                                <use href={excerpt?.blockId && enrolledFlashcardKeys.has(extractDeliveryKey(context?.id || docId, excerpt.blockId, excerpt.text)) ? "#iconGleanCheck" : "#iconGleanCard"} />
                            </svg>
                            <span>{excerpt?.blockId && enrolledFlashcardKeys.has(extractDeliveryKey(context?.id || docId, excerpt.blockId, excerpt.text)) ? t(i18n, "pipeline.cardCreatedBadge") : t(i18n, "pipeline.makeFlashcard")}</span>
                        </button>
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost"
                            class:glean-ghost-btn={!hasCardsInstalled}
                            onclick={() => void incrementalExtractToCards()}
                            title={hasCardsInstalled ? t(i18n, "reader.extractToCardsHint") : t(i18n, "reader.cardGhostHint")}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCard" /></svg>
                            <span>{t(i18n, "reader.extractToCards")}</span>
                        </button>
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost"
                            onclick={() => void extractToHorizonTask()}
                            title={t(i18n, "reader.extractToTaskHint")}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                            <span>{t(i18n, "reader.extractToTask")}</span>
                        </button>
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost"
                            class:glean-ghost-btn={!hasExamInstalled}
                            onclick={() => void examFromExcerpt()}
                            title={hasExamInstalled ? t(i18n, "reader.examMake") : t(i18n, "reader.examGhostHint")}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                            <span>{t(i18n, "reader.examMake")}</span>
                        </button>
                        {#if speechSupported}
                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => startSpeech("selection")} title={t(i18n, "reader.speechSelection")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                                <span>{t(i18n, "reader.speechSelection")}</span>
                            </button>
                        {/if}
                        {#if aiReady}
                            <button type="button" class="glean-btn glean-btn--ghost" disabled={Boolean(aiBusy)} onclick={() => void runTranslate()} title={t(i18n, "reader.aiTranslate")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanExternal" /></svg>
                                <span>{t(i18n, "reader.aiTranslate")}</span>
                            </button>
                        {/if}
                    </ActionPopover>
                    <button type="button" class="glean-icon-btn glean-reader__selection-close-btn" onclick={() => { excerpt = null; memoInputOpen = false; }} title={t(i18n, "action.close")} aria-label={t(i18n, "action.close")}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg>
                    </button>
                </div>
            {/if}

            {#if ghostreaderOpen && (ghostreaderSnapshot?.text || excerpt?.text)}
                <div class="glean-ghostreader-panel" role="region" aria-label={t(i18n, "ghost.panelAria")}>
                    {#if !aiOn}
                        <div class="glean-reader__hint">{t(i18n, "reader.aiOff")}</div>
                    {:else}
                    <div class="glean-ghostreader-actions">
                        <button
                            type="button"
                            class="glean-ghostreader-chip"
                            disabled={ghostreaderBusy}
                            onclick={() => void handleGhostreader("explain")}
                        >
                            <span>✨</span> 用人话解释
                        </button>
                        <button
                            type="button"
                            class="glean-ghostreader-chip"
                            disabled={ghostreaderBusy}
                            onclick={() => void handleGhostreader("arguments")}
                        >
                            <span>🔍</span> 提炼核心论据
                        </button>
                        <button
                            type="button"
                            class="glean-ghostreader-chip"
                            disabled={ghostreaderBusy}
                            onclick={() => void handleGhostreader("critique")}
                        >
                            <span>⚡</span> 批判性思考
                        </button>
                    </div>
                    <div class="glean-ghostreader-custom-row">
                        <input
                            type="text"
                            class="glean-mini-input glean-ghostreader-input"
                            bind:value={ghostreaderCustomQuery}
                            placeholder={t(i18n, "ghost.customPlaceholder")}
                            onkeydown={(e) => {
                                if (e.isComposing || e.keyCode === 229) return;
                                if (e.key === "Enter" && ghostreaderCustomQuery.trim()) {
                                    void handleGhostreader("custom", ghostreaderCustomQuery);
                                }
                            }}
                        />
                        <button
                            type="button"
                            class="glean-btn glean-btn--pri glean-btn--xs"
                            disabled={ghostreaderBusy || !ghostreaderCustomQuery.trim()}
                            onclick={() => void handleGhostreader("custom", ghostreaderCustomQuery)}
                        >
                            追问
                        </button>
                        <button
                            type="button"
                            class="glean-icon-btn"
                            title={t(i18n, "action.close")}
                            onclick={() => { ghostreaderOpen = false; ghostreaderSnapshot = null; }}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg>
                        </button>
                    </div>
                    {/if}
                </div>
            {/if}

            {#if ghostreaderResult}
                <div class="glean-ghostreader-card" role="region" aria-label={t(i18n, "ghost.resultAria")}>
                    <div class="glean-ghostreader-card__head">
                        <div class="glean-ghostreader-card__title">
                            <span class="glean-ghostreader-card__badge">🤖 Ghostreader</span>
                            <strong>{ghostreaderResult.actionLabel}</strong>
                        </div>
                        <button
                            type="button"
                            class="glean-icon-btn"
                            onclick={cancelGhostreader}
                            title={t(i18n, "action.close")}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg>
                        </button>
                    </div>
                    <div class="glean-ghostreader-card__quote">
                        📌 {ghostreaderResult.sourceText}
                    </div>
                    <div class="glean-ghostreader-card__body">
                        {#if ghostreaderResult.status === "failed"}
                            <div class="glean-ghostreader-card__error">{ghostreaderResult.error || "生成失败"}</div>
                        {:else if ghostreaderBusy && !ghostreaderHasChunk}
                            <AiThinkingCard
                                scenario="socratic"
                                title={`Ghostreader · ${ghostreaderResult.actionLabel}`}
                                compact
                                signal={ghostreaderAbort?.signal}
                                onCancel={cancelGhostreader}
                            />
                        {:else}
                            <div class="glean-ghostreader-card__text">{ghostreaderResult.answer}</div>
                        {/if}
                    </div>
                    <div class="glean-ghostreader-card__actions">
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-btn--xs"
                            onclick={() => void copyText(ghostreaderResult!.answer)}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                            {t(i18n, "reader.copy")}
                        </button>
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-btn--xs"
                            disabled={ghostreaderInserting || ghostreaderResult.status !== "ready"}
                            onclick={() => void handleSaveGhostreaderCallout()}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                            {ghostreaderInserting ? "正在插入..." : "📌 存为正文便签块"}
                        </button>
                    </div>
                </div>
            {/if}
            {#if showBackToTop}
                <button
                    type="button"
                    class="glean-reader__back-to-top"
                    onclick={scrollToTop}
                    title={t(i18n, "reader.backToTop")}
                    aria-label={t(i18n, "reader.backToTop")}
                >
                    <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanArrowUp" /></svg>
                </button>
            {/if}
            {#if showBackToTop && (sidebarCollapsed || immersive)}
                <div class="glean-reader__floating-progress" role="status" aria-label={t(i18n, "reader.progress")}>
                    <span class="glean-reader__progress-pct">{readingPercentage}%</span>
                    {#if remainingMinutes && (readingPercentage ?? 0) < 95}
                        <span class="glean-reader__progress-remain">· {t(i18n, "reader.remainingMinutes", { n: remainingMinutes })}</span>
                    {/if}
                </div>
            {/if}
            {#if speechState === "playing" || speechState === "paused"}
                <div class="glean-reader__floating-speech" role="region" aria-label={t(i18n, "reader.speechTitle")}>
                    <span class="glean-reader__speech-pulse" class:glean-reader__speech-pulse--paused={speechState === "paused"}>
                        <span class="glean-reader__speech-bar"></span>
                        <span class="glean-reader__speech-bar"></span>
                        <span class="glean-reader__speech-bar"></span>
                    </span>
                    <span class="glean-reader__speech-progress">
                        {speechChunkIndex + 1}/{speechChunks.length}
                    </span>
                    <button
                        type="button"
                        class="glean-icon-btn glean-reader__floating-speech-btn"
                        title={speechState === "playing" ? t(i18n, "reader.speechPause") : t(i18n, "reader.speechResume")}
                        aria-label={speechState === "playing" ? t(i18n, "reader.speechPause") : t(i18n, "reader.speechResume")}
                        onclick={toggleSpeechPause}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href={speechState === "playing" ? "#iconGleanPause" : "#iconGleanPlay"} /></svg>
                    </button>
                    <button
                        type="button"
                        class="glean-icon-btn glean-reader__floating-speech-btn"
                        title={t(i18n, "reader.speechStop")}
                        aria-label={t(i18n, "reader.speechStop")}
                        onclick={stopSpeech}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanStop" /></svg>
                    </button>
                </div>
            {/if}
            {#if marginNotesOpen && docHighlights.length > 0 && !searchOpen && !facade.isMobile && !zenMode}
                <aside class="glean-margin-notes" aria-label={t(i18n, "reader.marginNotes")}>
                    {#each docHighlights as hl, idx (hl.id)}
                        {@const tagDef = resolveAnnotationTagDisplay(hl.annotationTag, whaleCustomTags)}
                        <div
                            class="glean-margin-note-card glean-margin-note-card--color-{hl.color || 'yellow'}"
                            role="button"
                            tabindex="0"
                            title={hl.text}
                            onclick={() => scrollToHighlight(hl.id)}
                            onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); scrollToHighlight(hl.id); } }}
                        >
                            <div class="glean-margin-note-card__head">
                                <span class="glean-margin-note-card__index">#{idx + 1}</span>
                                {#if tagDef}<span class="glean-annotation-tag glean-annotation-tag--{tagDef.value}" title={tagDef.label}>{tagDef.icon}</span>{/if}
                                {#if hl.annotationKind === "siyuan-comment"}<span class="glean-annotation-kind" title={t(i18n, "highlight.kindWhaleHint")}>🐋</span>{/if}
                                <span>{formatHighlightTime(hl.id)}</span>
                            </div>
                            <div class="glean-margin-note-card__text">{hl.text}</div>
                            {#if hl.memo}
                                <div class="glean-margin-note-card__memo"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg> <span>{hl.memo}</span></div>
                            {/if}
                            {#if hl.replies?.length}
                                <div class="glean-margin-note-card__replies">{t(i18n, "highlight.repliesCount", { n: hl.replies.length })}</div>
                            {/if}
                            <div class="glean-margin-note-card__actions" role="group" aria-label={t(i18n, "library.batchActions")}>
                                <button
                                    type="button"
                                    class="glean-margin-note-card__btn"
                                    title={t(i18n, "annotationEditor.openEditor")}
                                    aria-label={t(i18n, "annotationEditor.openEditor")}
                                    onclick={(e) => { e.stopPropagation(); editingAnnotation = hl; }}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                                </button>
                                {#if hl.annotationKind === "siyuan-comment" && whaleStatus.installed}
                                    <button
                                        type="button"
                                        class="glean-margin-note-card__btn"
                                        title={t(i18n, "highlight.whaleEdit")}
                                        aria-label={t(i18n, "highlight.whaleEdit")}
                                        onclick={(e) => { e.stopPropagation(); openWhaleCommentEditor(facade.pluginInstance.app, hl.commentBlockId || hl.id, e.currentTarget as HTMLElement); }}
                                    >🐋</button>
                                {/if}
                                <button
                                    type="button"
                                    class="glean-margin-note-card__btn"
                                    title={t(i18n, "action.copyBlockRef")}
                                    aria-label={t(i18n, "action.copyBlockRef")}
                                    onclick={(e) => { e.stopPropagation(); void copyHighlightBlockRef(hl); }}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                </button>
                                <button
                                    type="button"
                                    class="glean-margin-note-card__btn"
                                    title={t(i18n, "quoteCard.action")}
                                    aria-label={t(i18n, "quoteCard.action")}
                                    onclick={(e) => { e.stopPropagation(); quoteCardFromHighlight(hl); }}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                                </button>
                                <button
                                    type="button"
                                    class="glean-margin-note-card__btn"
                                    title={t(i18n, "highlight.copyShare")}
                                    aria-label={t(i18n, "highlight.copyShare")}
                                    onclick={(e) => { e.stopPropagation(); void copyHighlightQuote(hl); }}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                </button>
                            </div>
                        </div>
                    {/each}
                </aside>
            {/if}
        {:else}
            <div class="glean-reader__empty">
                <div class="glean-reader__empty-art"><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanCard" /></svg></div>
                <div class="glean-reader__empty-title">{t(i18n, "reader.empty")}</div>
                <div class="glean-reader__empty-hint">{t(i18n, "reader.emptyHint")}</div>
            </div>
        {/if}
    </div>
    {#if docId}
        <aside id={sidebarId} class="glean-reader__side" hidden={sidebarCollapsed || immersive} aria-labelledby={sidebarTitleId}>
            <div id={sidebarTitleId} class="glean-reader__title">
                <span>{t(i18n, "reader.companionTitle")}</span>
                <button
                    type="button"
                    class="glean-icon-btn glean-reader__side-close"
                    title={t(i18n, "action.close")}
                    aria-label={t(i18n, "action.close")}
                    onclick={toggleCompanion}
                >
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg>
                </button>
            </div>
            <div class="glean-reader__side-nav" role="tablist" aria-label={t(i18n, "reader.companionTitle")}>
                <button
                    type="button"
                    class="glean-reader__side-nav-btn glean-reader__side-nav-btn--notes"
                    class:glean-reader__side-nav-btn--active={companionTab === "notes"}
                    onclick={() => { companionTab = "notes"; highlightsOpen = true; }}
                >
                    <span>{t(i18n, "reader.companionHighlights")}{#if docHighlights.length > 0} ({docHighlights.length}){/if}</span>
                </button>
                <button
                    type="button"
                    class="glean-reader__side-nav-btn glean-reader__side-nav-btn--outline"
                    class:glean-reader__side-nav-btn--active={companionTab === "outline"}
                    onclick={() => { companionTab = "outline"; outlineOpen = true; }}
                >
                    <span>{t(i18n, "reader.companionOutline")}{#if outline.length > 0} ({outline.length}){/if}</span>
                </button>
                <button
                    type="button"
                    class="glean-reader__side-nav-btn glean-reader__side-nav-btn--tools"
                    class:glean-reader__side-nav-btn--active={companionTab === "tools" || companionTab === "ai" || companionTab === "fold"}
                    onclick={() => { if (companionTab !== "tools" && companionTab !== "ai" && companionTab !== "fold") { companionTab = "tools"; } }}
                >
                    <span>{t(i18n, "reader.companionMore")}</span>
                </button>
            </div>
            {#if companionTab === "tools" || companionTab === "ai" || companionTab === "fold"}
                <div class="glean-gm-subnav" role="tablist" aria-label={t(i18n, "reader.companionMore")}>
                    <button type="button" class="glean-gm-subnav__btn" class:is-active={companionTab === "tools"} onclick={() => { companionTab = "tools"; }}>属性与工具</button>
                    {#if aiOn}
                        <button type="button" class="glean-gm-subnav__btn" class:is-active={companionTab === "ai"} onclick={() => (companionTab = "ai")}>AI 伴读</button>
                    {/if}
                    <button type="button" class="glean-gm-subnav__btn" class:is-active={companionTab === "fold"} onclick={() => { companionTab = "fold"; if (foldNodes.length === 0) void refreshFoldNodes(); }}>五阶分层</button>
                </div>
            {/if}
            {#if isWechatArticle && (companionTab === "tools" || companionTab === "all")}
                <div class="glean-wechat-publisher" role="region" aria-label={t(i18n, "wechat.badge")}>
                    <div class="glean-wechat-publisher__head">
                        {#if wechatAvatar}
                            <img loading="lazy" decoding="async" class="glean-wechat-publisher__avatar" src={wechatAvatar} alt={context?.author || t(i18n, "wechat.officialAccount")} referrerpolicy="no-referrer" />
                        {/if}
                        <div class="glean-wechat-publisher__info">
                            <div class="glean-wechat-publisher__badge">
                                <span class="glean-wechat-publisher__dot" aria-hidden="true"></span>
                                {t(i18n, "wechat.badge")}
                            </div>
                            <div class="glean-wechat-publisher__name-row">
                                <div class="glean-wechat-publisher__name">{displayWechatAuthor(context?.author) || t(i18n, "wechat.officialAccount")}</div>
                                <button
                                    type="button"
                                    class="glean-icon-btn glean-wechat-publisher__rescan-btn"
                                    title={t(i18n, "wechat.rescanAuthor")}
                                    aria-label={t(i18n, "wechat.rescanAuthor")}
                                    onclick={() => void scanWechatPublisher(true)}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanRefresh" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="glean-wechat-publisher__actions">
                        {#if hasSourceAction(context?.contentType, context?.url)}
                            <button type="button" class="glean-btn glean-btn--ghost glean-wechat-publisher__btn" onclick={openSource} title={t(i18n, "wechat.openWebArticle")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanExternal" /></svg>
                                {t(i18n, "wechat.openWebArticle")}
                            </button>
                        {/if}
                        <button type="button" class="glean-btn glean-btn--ghost glean-wechat-publisher__btn" disabled={purifying} onclick={() => void runPurifyWechat()} title={t(i18n, "wechat.purifyTitle")}>
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                            <span>{purifying ? t(i18n, "wechat.purifying") : t(i18n, "wechat.purifyAction")}</span>
                        </button>
                        <button type="button" class="glean-btn glean-btn--ghost glean-wechat-publisher__btn" onclick={openWeread} title={t(i18n, "reader.openWeread")}>
                            {t(i18n, "reader.openWeread")}
                        </button>
                        <ActionPopover label={t(i18n, "library.moreActions")} compact>
                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyCleanUrl()} title={t(i18n, "reader.copyCleanUrl")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                <span>{t(i18n, "reader.copyCleanUrl")}</span>
                            </button>
                            <button type="button" class="glean-btn glean-btn--ghost" disabled={copyingCleanBody} onclick={() => void copyCleanMarkdown()} title={t(i18n, "reader.copyCleanMarkdownHint")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                <span>{copyingCleanBody ? t(i18n, "reader.copying") : t(i18n, "reader.copyCleanMarkdown")}</span>
                            </button>
                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyArticleBlockRef()} title={t(i18n, "action.copyBlockRef")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                <span>{t(i18n, "action.copyBlockRef")}</span>
                            </button>
                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyCitation("gbt")} title={t(i18n, "citation.copyGBT")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                                <span>{t(i18n, "citation.copyGBT")}</span>
                            </button>
                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyCitation("bibtex")} title={t(i18n, "citation.copyBibTeX")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArchive" /></svg>
                                <span>BibTeX</span>
                            </button>
                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyCitation("apa")} title={t(i18n, "citation.copyAPA")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanLocal" /></svg>
                                <span>APA</span>
                            </button>
                            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyCitation("mla")} title={t(i18n, "citation.copyMLA")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCard" /></svg>
                                <span>MLA</span>
                            </button>
                            <button type="button" class="glean-btn glean-btn--ghost" onclick={backToLibrary} title={t(i18n, "reading.backToLibrary")}>
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowLeft" /></svg>
                                <span>{t(i18n, "reading.backToLibrary")}</span>
                            </button>
                        </ActionPopover>
                    </div>
                    {#if seriesArticles.length > 0}
                        <details class="glean-wechat-publisher__series" open={seriesArticles.length <= 2}>
                            <summary class="glean-wechat-publisher__series-title glean-wechat-publisher__series-summary">
                                {t(i18n, "wechat.seriesTitle", { n: seriesArticles.length })}:
                            </summary>
                            <div class="glean-wechat-publisher__series-list">
                                {#each seriesArticles as item (item.id)}
                                    <button
                                        type="button"
                                        class="glean-wechat-publisher__series-chip"
                                        onclick={() => openRelatedDoc(item.id, item.title)}
                                        title={item.title}
                                    >
                                        {item.title}
                                    </button>
                                {/each}
                            </div>
                        </details>
                    {/if}
                    {#if authorArticles.length > 0}
                        <details class="glean-wechat-publisher__series" open={authorArticles.length <= 2}>
                            <summary class="glean-wechat-publisher__series-title glean-wechat-publisher__series-summary">
                                {t(i18n, "wechat.moreFromAuthor", { n: authorArticles.length })}:
                            </summary>
                            <div class="glean-wechat-publisher__series-list">
                                {#each authorArticles as item (item.id)}
                                    <button
                                        type="button"
                                        class="glean-wechat-publisher__series-chip"
                                        onclick={() => openRelatedDoc(item.id, item.title)}
                                        title={item.title}
                                    >
                                        {item.title}
                                    </button>
                                {/each}
                            </div>
                        </details>
                    {/if}
                </div>
            {:else if !isWechatArticle && (companionTab === "tools" || companionTab === "all")}
                {#if context}
                    <div class="glean-reader__meta">
                        <span class={`glean-carrier-badge glean-carrier-badge--${resolveCarrier(context.contentType)}`}>
                            {carrierLabel(context.contentType)}
                        </span>
                        {#if context.site}<span>{context.site}</span>{/if}
                        {#if context.author}<span>{context.author}</span>{/if}
                    </div>
                {:else if !contextLoading && !contextError}
                    <div class="glean-reader__meta">
                        <span class="glean-carrier-badge glean-carrier-badge--local">{t(i18n, "reader.notInLibraryBadge")}</span>
                        <button type="button" class="glean-btn glean-btn--pri glean-btn--xs" disabled={addingToLibrary} onclick={() => void addCurrentNoteToLibrary()}>
                            {addingToLibrary ? t(i18n, "reader.addingToLibrary") : t(i18n, "reader.addToLibrary")}
                        </button>
                    </div>
                {/if}
            {/if}
            {#if (companionTab === "outline" || companionTab === "all") && context && !contextLoading}
                <div class="glean-reader__metric-capsule" role="region" aria-label={t(i18n, "panel.rankTitle")}>
                    <div class="glean-reader__metric-item">
                        <span class="glean-reader__metric-val">{context.words ? context.words.toLocaleString() : "--"}</span>
                        <span class="glean-reader__metric-lbl">{t(i18n, "reader.metricWords")}</span>
                    </div>
                    <div class="glean-reader__metric-sep"></div>
                    <div class="glean-reader__metric-item">
                        <span class="glean-reader__metric-val glean-reader__metric-val--{readingTimeTier}">
                            {#if readingTimeTier === "short"}<span class="glean-time-dot glean-time-dot--short" aria-hidden="true"></span>{:else if readingTimeTier === "medium"}<span class="glean-time-dot glean-time-dot--medium" aria-hidden="true"></span>{:else if readingTimeTier === "long"}<span class="glean-time-dot glean-time-dot--long" aria-hidden="true"></span>{/if}
                            {estReadingMinutes ? `${estReadingMinutes}m` : "--"}
                        </span>
                        <span class="glean-reader__metric-lbl">{t(i18n, "reader.metricEstimate")}</span>
                    </div>
                    <div class="glean-reader__metric-sep"></div>
                    <div class="glean-reader__metric-item">
                        <span class="glean-reader__metric-val">{displayedReadMinutes}m</span>
                        <span class="glean-reader__metric-lbl">{t(i18n, "reader.metricRead")}</span>
                    </div>
                    <div class="glean-reader__metric-sep"></div>
                    <div class="glean-reader__metric-item">
                        <span class="glean-reader__metric-val">
                            <svg class="glean-progress-ring" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                                <circle class="glean-progress-ring__bg" cx="8" cy="8" r="6" />
                                <circle
                                    class="glean-progress-ring__bar"
                                    cx="8" cy="8" r="6"
                                    style="stroke-dasharray: 37.7; stroke-dashoffset: {37.7 - (37.7 * (readingPercentage ?? 0)) / 100}"
                                />
                            </svg>
                            {readingPercentage !== null ? `${readingPercentage}%` : "0%"}
                        </span>
                        <span class="glean-reader__metric-lbl">{t(i18n, "reader.metricProgress")}</span>
                    </div>
                </div>
                {#if (context.tags && context.tags.length > 0) || (context.aiTags && context.aiTags.length > 0)}
                    <div class="glean-reader__tags-bar" role="group" aria-label={t(i18n, "library.filterTag")}>
                        {#each context.tags ?? [] as tag}
                            <span class="glean-reader__tag" title={t(i18n, "reader.tagHint", {tag})}>#{tag}</span>
                        {/each}
                        {#each context.aiTags ?? [] as aiTag}
                            <span class="glean-reader__tag glean-reader__tag--ai" title={t(i18n, "reader.aiTagHint", {tag: aiTag})}>✨{aiTag}</span>
                        {/each}
                    </div>
                {/if}
            {/if}
            {#if contextLoading}
                <div class="glean-reader__context-state glean-reader__context-state--loading" role="status" aria-live="polite">
                    <span class="glean-reader__ai-status-dot" aria-hidden="true"></span>{t(i18n, "panel.loading")}
                </div>
            {:else if contextError}
                <div class="glean-reader__context-state glean-reader__context-state--error" role="alert">
                    <span>{t(i18n, "reader.actionFailed")}</span>
                    {#if docId}<button class="glean-btn glean-btn--ghost" aria-busy={contextLoading} disabled={contextLoading} onclick={retryContext}>{t(i18n, "action.retry")}</button>{/if}
                </div>
            {/if}
            {#if (companionTab === "outline" || companionTab === "tools" || companionTab === "all") && displayedReadMinutes > 0}
                <div class="glean-reader__hint glean-reader__reading-time" aria-live="polite">{t(i18n, "reader.readMinutes", { n: displayedReadMinutes })}</div>
            {/if}
            {#if (companionTab === "tools" || companionTab === "all") && context}
                <div class="glean-reader__section glean-reader__section--card glean-reader__tools-bento" aria-labelledby={rankTitleId}>
                    <div id={rankTitleId} class="glean-reader__section-title glean-reader__section-title--flat">
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanFlame" /></svg>
                        <span>{t(i18n, "status.reading")} · {t(i18n, "panel.rankTitle")}</span>
                    </div>
                    <div class="glean-reader__status-actions">
                        <ClipStatusActions
                            {i18n}
                            status={context.status}
                            contentType={context.contentType}
                            url={context.url}
                            disabled={statusBusy}
                            showDone={false}
                            onStartReading={() => void startReading()}
                            onSetStatus={(status) => void writeStatus(status)}
                            onArchive={() => { if (context) facade.openArchiveDialog(context.id); }}
                            onRestore={() => { if (context) facade.openRestoreDialog(context.id); }}
                            onUnregister={() => { if (context) facade.openUnregisterDialog?.(context.id); }}
                        />
                    </div>
                    <div class="glean-reader__rank-row" style="margin-top: 8px;">
                        <ClipRankControls
                            {i18n}
                            priority={context.priority}
                            rating={context.rating}
                            disabled={statusBusy}
                            onPriority={(value) => void setPriority(value)}
                            onRating={(value) => void setRating(value)}
                        />
                    </div>
                </div>

                <div class="glean-reader__section glean-reader__section--card glean-reader__tools-bento">
                    <div class="glean-reader__section-title glean-reader__section-title--flat">
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                        <span>{t(i18n, "resurface.quickActions")}</span>
                    </div>
                    <div class="glean-reader__quick-sync-grid">
                        <button
                            type="button"
                            class="glean-reader__sync-pill"
                            title={t(i18n, "reading.syncMetaCalloutHint")}
                            disabled={syncingMetaCallout || statusBusy}
                            onclick={() => void handleSyncMetaCallout()}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanPin" /></svg>
                            <span>{syncingMetaCallout ? t(i18n, "reading.syncingMetaCallout") : t(i18n, "reading.syncMetaCallout")}</span>
                        </button>
                        <button
                            type="button"
                            class="glean-reader__sync-pill"
                            title={t(i18n, "dailyNote.recordAction")}
                            disabled={recordingDailyNote || statusBusy}
                            onclick={() => void handleRecordDailyNote()}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                            <span>{recordingDailyNote ? t(i18n, "dailyNote.recording") : t(i18n, "dailyNote.recordAction")}</span>
                        </button>
                        {#if hasContactsInstalled && context?.author}
                            {#if authorPerson}
                                <button
                                    type="button"
                                    class="glean-reader__sync-pill"
                                    title={t(i18n, "author.factLoggedHint")}
                                    onclick={() => void logAuthorFact()}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                                    <span>{t(i18n, "author.recordFact")}</span>
                                </button>
                            {:else}
                                <button
                                    type="button"
                                    class="glean-reader__sync-pill"
                                    title={t(i18n, "author.enrollHint")}
                                    onclick={() => void enrollAuthorToContacts()}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanUser" /></svg>
                                    <span>{t(i18n, "author.enrollToContacts")}</span>
                                </button>
                            {/if}
                        {/if}
                    </div>
                </div>

                {#if context.id === docId}
                    <ReadingPositionControls
                        {facade}
                        {docId}
                        host={protyleHost}
                        instanceId={idFor("reading-position")}
                        onPositionChange={(snap) => {
                            currentBookmarkBlockId = snap?.position?.blockId ?? null;
                        }}
                    />
                {/if}
            {/if}

            {#if companionTab === "fold"}
                <div class="glean-reader__section glean-reader__section--card glean-reader__fold-section">
                    <FoldedReaderView
                        nodes={foldNodes}
                        globalLevel={foldGlobalLevel}
                        {i18n}
                        loading={foldLoading}
                        aiBusy={foldAiBusy}
                        aiEnriched={foldAiEnriched}
                        aiSignal={foldAiAbort?.signal}
                        onRunAiEnrich={runFoldAiEnrich}
                        onCancelAiEnrich={cancelFoldAiEnrich}
                        onLevelChange={(lvl) => {
                            foldGlobalLevel = lvl;
                            foldNodes = applyGlobalFoldLevel(foldNodes, lvl);
                        }}
                        onJumpToBlock={(blockId) => {
                            const jumped = scrollAndPulseReadPoint(protyleHost, blockId);
                            if (!jumped && /^\d{14}-[a-z0-9]{7}$/.test(blockId)) {
                                void openTab({ app: facade.pluginInstance.app, doc: { id: blockId }, keepCursor: false });
                            }
                        }}
                        onToggleNode={(nodeId) => {
                            foldNodes = foldNodes.map((n) => n.id === nodeId ? toggleNodeFold(n) : n);
                        }}
                    />
                </div>
            {/if}

            {#snippet outlineOps()}
                {#if outline.length > 0}
                    <div class="glean-reader__outline-head-ops">
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-btn--xs glean-reader__slice-btn"
                            class:glean-btn--active={outlineCopied}
                            title={t(i18n, "reader.copyOutlineHint")}
                            onclick={(e) => { e.preventDefault(); e.stopPropagation(); void copyOutlineMarkdown(); }}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href={outlineCopied ? "#iconGleanCheck" : "#iconGleanCopy"} /></svg>
                            <span>{outlineCopied ? t(i18n, "action.copied") : t(i18n, "reader.copyOutline")}</span>
                        </button>
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-btn--xs glean-reader__slice-btn"
                            title={t(i18n, "reader.createMindmapHint")}
                            disabled={mindmapBusy}
                            aria-busy={mindmapBusy}
                            onclick={(e) => { e.preventDefault(); e.stopPropagation(); void createMindmapDoc(); }}
                        >
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                            <span>{t(i18n, "reader.createMindmap")}</span>
                        </button>
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-btn--xs glean-reader__slice-btn"
                            title={t(i18n, "docSlicing.actionBtnHint")}
                            onclick={(e) => { e.preventDefault(); e.stopPropagation(); openSlicing(); }}
                        >
                            {t(i18n, "docSlicing.actionBtn")}
                        </button>
                    </div>
                {/if}
            {/snippet}

            {#snippet outlineBody()}
                <div class="glean-reader__outline-mode-switch" role="group" aria-label={t(i18n, "reader.outlineModeAria")}>
                    <button
                        type="button"
                        class="glean-reader__outline-mode-btn"
                        class:glean-reader__outline-mode-btn--active={outlineMode === "headings"}
                        onclick={() => { outlineMode = "headings"; }}
                    >
                        文章目录 ({outline.length})
                    </button>
                    <button
                        type="button"
                        class="glean-reader__outline-mode-btn"
                        class:glean-reader__outline-mode-btn--active={outlineMode === "highlights"}
                        onclick={() => {
                            outlineMode = "highlights";
                            if (!highlightOutlineTree || highlightOutlineTree.docId !== docId) {
                                void loadHighlightOutline();
                            }
                        }}
                    >
                        📑 划线大纲 ({docHighlights.length})
                    </button>
                </div>

                {#if outlineMode === "headings"}
                    {#if outline.length >= 6}
                        <div class="glean-reader__outline-filter-box">
                            <input
                                class="glean-mini-input glean-reader__outline-filter"
                                bind:value={outlineFilter}
                                placeholder={t(i18n, "reader.outlineFilterPlaceholder")}
                                aria-label={t(i18n, "reader.outlineFilterPlaceholder")}
                                onkeydown={(e) => { if (e.key === "Escape" && outlineFilter) { e.stopPropagation(); outlineFilter = ""; } }}
                            />
                            {#if outlineFilter}
                                <button type="button" class="glean-reader__outline-filter-clear" title={t(i18n, "library.clearFilters")} aria-label={t(i18n, "library.clearFilters")} onclick={() => { outlineFilter = ""; }}>
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg>
                                </button>
                            {/if}
                        </div>
                    {/if}
                    {#if outlineLoading && outline.length === 0}
                        <div class="glean-reader__hint" role="status" aria-live="polite">{t(i18n, "reader.outlineLoading")}</div>
                    {:else if outlineError}
                        <div class="glean-reader__issue" role="alert">{t(i18n, "reader.outlineFailed")}</div>
                        <button class="glean-btn glean-btn--ghost" onclick={() => docId && void loadOutline(docId)}>{t(i18n, "reader.outlineRetry")}</button>
                    {:else if visibleOutline.length === 0}
                        <div class="glean-reader__hint">{t(i18n, "reader.outlineEmpty")}</div>
                    {:else}
                        <nav class="glean-reader__outline" aria-label={t(i18n, "reader.outlineTitle")}>
                            {#each visibleOutline as item (item.id)}
                                {#if sliceStartMap.has(item.id)}
                                    {@const slice = sliceStartMap.get(item.id)}
                                    {#if slice}
                                        <div class="glean-reader__outline-slice-marker" role="separator">
                                            <span class="glean-reader__outline-slice-pill">
                                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                                                <span>{slice.title} · 约 {slice.estimatedMinutes}m</span>
                                            </span>
                                        </div>
                                    {/if}
                                {/if}
                                <div class="glean-reader__outline-row" class:glean-reader__outline-row--active={activeOutlineId === item.id}>
                                    <button
                                        type="button"
                                        class="glean-reader__outline-item"
                                        class:glean-reader__outline-item--active={activeOutlineId === item.id}
                                        style={`--glean-outline-level:${item.level}`}
                                        title={item.title}
                                        onclick={() => scrollToOutline(item)}
                                    >
                                        <span class="glean-reader__outline-tag">H{item.level}</span>
                                        <span class="glean-reader__outline-text">{item.title}</span>
                                        {#if activeOutlineId === item.id}
                                            <span class="glean-reader__outline-bookmark" title={t(i18n, "reading.position.title")} aria-label={t(i18n, "reading.position.title")}>
                                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanPin" /></svg>
                                            </span>
                                        {/if}
                                    </button>
                                    <button
                                        type="button"
                                        class="glean-reader__outline-copy-ref"
                                        title={t(i18n, "action.copyBlockRef")}
                                        aria-label={t(i18n, "action.copyBlockRef")}
                                        onclick={() => void copyOutlineBlockRef(item)}
                                    >
                                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                    </button>
                                </div>
                            {/each}
                        </nav>
                    {/if}
                {:else}
                    <div class="glean-highlight-outline-view">
                        <div class="glean-highlight-outline-actions">
                            <button
                                type="button"
                                class="glean-btn glean-btn--ghost glean-btn--xs"
                                disabled={highlightOutlineExporting || !highlightOutlineTree?.totalHighlights}
                                onclick={() => void handleExportHighlightOutline()}
                                title={t(i18n, "reader.exportReadingNotesHint")}
                            >
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                                <span>{highlightOutlineExporting ? "正在导出..." : "导出为读书笔记"}</span>
                            </button>
                            <button
                                type="button"
                                class="glean-btn glean-btn--ghost glean-btn--xs"
                                disabled={!highlightOutlineTree?.totalHighlights}
                                onclick={() => void handleCopyHighlightOutlineMd()}
                                title={t(i18n, "reader.copyOutlineMdHint")}
                            >
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                <span>复制大纲</span>
                            </button>
                            <button
                                type="button"
                                class="glean-btn glean-btn--ghost glean-btn--xs"
                                disabled={highlightOutlineLoading}
                                onclick={() => void loadHighlightOutline()}
                                title={t(i18n, "reader.outlineRefreshHint")}
                            >
                                <svg class="glean-icon glean-icon--xs" class:glean-spin={highlightOutlineLoading} aria-hidden="true"><use href="#iconGleanRefresh" /></svg>
                            </button>
                        </div>

                        {#if highlightOutlineLoading}
                            <div class="glean-reader__hint">正在生成划线结构化大纲...</div>
                        {:else if !highlightOutlineTree || highlightOutlineTree.sections.length === 0}
                            <div class="glean-reader__hint">本文暂无高亮划线。划词高亮后，此处将自动按章节聚合结构化大纲。</div>
                        {:else}
                            <div class="glean-highlight-outline-list">
                                {#each highlightOutlineTree.sections as section}
                                    <div class="glean-highlight-outline-section">
                                        {#if section.heading}
                                            <div class="glean-highlight-outline-heading" style={`--heading-level: ${section.heading.level}`}>
                                                <span class="glean-highlight-outline-tag">H{section.heading.level}</span>
                                                <strong>{section.heading.text}</strong>
                                                <small>({section.highlights.length})</small>
                                            </div>
                                        {:else}
                                            <div class="glean-highlight-outline-heading">
                                                <span class="glean-highlight-outline-tag">📌</span>
                                                <strong>前言 / 导言</strong>
                                                <small>({section.highlights.length})</small>
                                            </div>
                                        {/if}

                                        <div class="glean-highlight-outline-quotes">
                                            {#each section.highlights as hl (hl.id)}
                                                <button
                                                    type="button"
                                                    class="glean-highlight-outline-item"
                                                    onclick={() => scrollToHighlight(hl.id)}
                                                    title={t(i18n, "reader.highlightJumpHint")}
                                                >
                                                    <span class="glean-highlight-outline-dot glean-highlight-outline-dot--{hl.color || 'yellow'}"></span>
                                                    <div class="glean-highlight-outline-content">
                                                        <p class="glean-highlight-outline-text">{hl.text}</p>
                                                        {#if hl.memo}
                                                            <div class="glean-highlight-outline-memo">
                                                                💭 {hl.memo}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/if}
            {/snippet}

            {#if (companionTab === "all" || companionTab === "outline") && (outline.length > 0 || outlineLoading || outlineError)}
                {#if companionTab === "all"}
                    <details id={outlineTitleId} class="glean-reader__section glean-reader__section--card glean-reader__fold" aria-labelledby={outlineTitleId} bind:open={outlineOpen} ontoggle={onOutlineToggle}>
                        <summary id={outlineTitleId} class="glean-reader__section-title">
                            <span><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg> {t(i18n, "reader.outlineTitle")} ({outline.length})</span>
                            {@render outlineOps()}
                        </summary>
                        {@render outlineBody()}
                    </details>
                {:else}
                    <div id={outlineTitleId} class="glean-reader__section glean-reader__section--card glean-reader__tab-panel" aria-labelledby={outlineTitleId}>
                        <div class="glean-reader__section-title glean-reader__section-title--flat">
                            <span><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg> {t(i18n, "reader.outlineTitle")} ({outline.length})</span>
                            {@render outlineOps()}
                        </div>
                        {@render outlineBody()}
                    </div>
                {/if}
            {/if}

            {#snippet highlightsOps()}
                <div class="glean-reader__highlights-actions">
                    <button
                        type="button"
                        class="glean-btn glean-btn--ghost glean-btn--xs glean-reader__highlights-rescan-btn"
                        title={t(i18n, "action.refresh")}
                        aria-label={t(i18n, "action.refresh")}
                        aria-busy={highlightsLoading}
                        disabled={highlightsLoading || !docId}
                        onclick={(e) => { e.stopPropagation(); if (docId) void loadDocHighlights(docId); }}
                    >
                        <svg class="glean-icon glean-icon--xs" class:glean-spin={highlightsLoading} aria-hidden="true">
                            <use href="#iconGleanRefresh" />
                        </svg>
                    </button>
                    {#if docHighlights.length > 0 || whaleStatus.installed}
                        <ActionPopover label={t(i18n, "library.moreActions")} compact>
                            {#if docHighlights.length > 0}
                                <button
                                    type="button"
                                    class="glean-btn glean-btn--ghost glean-reader__highlights-copy-all"
                                    onclick={() => void copyAllDocHighlights()}
                                    title={t(i18n, "reader.copyAllHighlights")}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                    <span>{t(i18n, "reader.copyAllHighlights")}</span>
                                </button>
                                <button
                                    type="button"
                                    class="glean-btn glean-btn--ghost glean-reader__highlights-doc-btn"
                                    onclick={() => void createDocFromDocHighlights()}
                                    title={t(i18n, "highlight.createArticleDoc")}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                                    <span>{t(i18n, "highlight.createArticleDoc")}</span>
                                </button>
                            {/if}
                            {#if whaleStatus.installed}
                                <button
                                    type="button"
                                    class="glean-btn glean-btn--ghost glean-reader__whale-slide-btn"
                                    class:glean-btn--active={whaleStatus.slideActive}
                                    aria-pressed={whaleStatus.slideActive}
                                    onclick={handleToggleWhaleSlide}
                                >
                                    <span>{t(i18n, "reader.whaleSlideMode")}</span>
                                </button>
                            {/if}
                        </ActionPopover>
                    {/if}
                </div>
            {/snippet}

            {#snippet highlightsBody()}
                <div class="glean-reader__notes-guide">
                    <span class="glean-reader__notes-guide-text">{t(i18n, "reader.notesGuideHint")}</span>
                    {#if mode === "read"}
                        <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" onclick={() => setMode("edit")}>
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                            <span>{t(i18n, "reader.switchToEditForAnnotate")}</span>
                        </button>
                    {/if}
                </div>
                {#if highlightsLoading && docHighlights.length === 0}
                    <div class="glean-reader__hint" role="status" aria-live="polite">{t(i18n, "panel.loading")}</div>
                {:else if docHighlights.length === 0}
                        <div class="glean-reader__hint">{t(i18n, "reader.highlightsEmpty")}</div>
                    {:else}
                        {#if docHighlights.length >= 4}
                            <div class="glean-reader__outline-filter-bar">
                                <svg class="glean-icon glean-icon--xs glean-reader__outline-filter-icon" aria-hidden="true">
                                    <use href="#iconGleanSearch" />
                                </svg>
                                <input
                                    type="search"
                                    class="glean-mini-input glean-reader__outline-filter-input"
                                    bind:value={highlightFilter}
                                    placeholder={t(i18n, "reader.highlightFilterPlaceholder")}
                                    aria-label={t(i18n, "reader.highlightFilterPlaceholder")}
                                />
                                {#if highlightFilter}
                                    <button type="button" class="glean-reader__outline-filter-clear" title={t(i18n, "library.clearFilters")} aria-label={t(i18n, "library.clearFilters")} onclick={() => { highlightFilter = ""; }}>
                                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg>
                                    </button>
                                {/if}
                            </div>
                        {/if}
                        {#if highlightColorsPresent.length > 1 || highlightKindsPresent.length > 1 || highlightTagsPresent.length > 0}
                            <div class="glean-reader__highlight-color-filters" role="group" aria-label={t(i18n, "reader.filterByColor")}>
                                <button
                                    type="button"
                                    class="glean-reader__color-filter-btn"
                                    class:glean-reader__color-filter-btn--active={highlightColorFilter === "" && highlightKindFilter === "" && highlightTagFilter === ""}
                                    onclick={() => { highlightColorFilter = ""; highlightKindFilter = ""; highlightTagFilter = ""; }}
                                >{t(i18n, "action.filterAll")}</button>
                                {#if highlightColorsPresent.length > 1}
                                    {#each ["yellow", "red", "blue", "green"] as c}
                                        {#if highlightColorsPresent.includes(c)}
                                            <button
                                                type="button"
                                                class="glean-reader__color-filter-btn glean-reader__color-filter-btn--dot"
                                                class:glean-reader__color-filter-btn--active={highlightColorFilter === c}
                                                onclick={() => highlightColorFilter = highlightColorFilter === c ? "" : c}
                                                title={t(i18n, "reader.filterColorItem", { color: t(i18n, `reader.color.${c}`) })}
                                                aria-label={t(i18n, "reader.filterColorItem", { color: t(i18n, `reader.color.${c}`) })}
                                            >
                                                <span class="glean-reader__highlight-dot glean-reader__highlight-dot--{c}" aria-hidden="true"></span>
                                            </button>
                                        {/if}
                                    {/each}
                                {/if}
                                {#if highlightKindsPresent.includes("siyuan-comment")}
                                    <button
                                        type="button"
                                        class="glean-reader__color-filter-btn"
                                        class:glean-reader__color-filter-btn--active={highlightKindFilter === "siyuan-comment"}
                                        onclick={() => highlightKindFilter = highlightKindFilter === "siyuan-comment" ? "" : "siyuan-comment"}
                                    >{t(i18n, "highlight.kindWhale")}</button>
                                {/if}
                                {#each highlightTagsPresent as tagVal}
                                    {@const tagInfo = resolveAnnotationTagDisplay(tagVal, whaleCustomTags)}
                                    {#if tagInfo}
                                        <button
                                            type="button"
                                            class="glean-reader__color-filter-btn"
                                            class:glean-reader__color-filter-btn--active={highlightTagFilter === tagVal}
                                            onclick={() => highlightTagFilter = highlightTagFilter === tagVal ? "" : tagVal}
                                            title={tagInfo.label}
                                        >{tagInfo.icon} {tagInfo.label}</button>
                                    {/if}
                                {/each}
                            </div>
                        {/if}
                        <div class="glean-reader__highlights-list">
                            {#each visibleDocHighlights as hl (hl.id)}
                                {@const tagInfo = resolveAnnotationTagDisplay(hl.annotationTag, whaleCustomTags)}
                                <div class="glean-reader__highlight-card glean-reader__highlight-card--color-{hl.color || 'yellow'}" role="button" tabindex="0" onclick={() => openHighlightSource(hl)} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openHighlightSource(hl); } }}>
                                    <div class="glean-reader__highlight-header">
                                        <button
                                            type="button"
                                            class="glean-reader__highlight-dot-btn"
                                            title={t(i18n, "reader.cycleColorHint")}
                                            aria-label={t(i18n, "reader.cycleColorHint")}
                                            onclick={(e) => { e.stopPropagation(); void cycleHighlightColor(hl); }}
                                        >
                                            <span class="glean-reader__highlight-dot glean-reader__highlight-dot--{hl.color || 'yellow'}" style={hl.customColor ? `background:${hl.customColor}` : undefined} aria-hidden="true"></span>
                                        </button>
                                        {#if tagInfo}
                                            <span class="glean-annotation-tag glean-annotation-tag--{tagInfo.value}" style={tagInfo.color ? `color:${tagInfo.color};border-color:color-mix(in srgb, ${tagInfo.color} 30%, transparent)` : undefined}>
                                                {tagInfo.icon} {tagInfo.label}
                                            </span>
                                        {/if}
                                        {#if hl.annotationKind === "siyuan-comment"}
                                            <span class="glean-annotation-kind" title={t(i18n, "highlight.kindWhaleHint")}>{t(i18n, "highlight.kindWhale")}</span>
                                        {:else if hl.annotationKind === "native-memo"}
                                            <span class="glean-annotation-kind" title={t(i18n, "highlight.kindMemoHint")}>{t(i18n, "highlight.kindMemo")}</span>
                                        {/if}
                                        <span class="glean-reader__highlight-time">{formatHighlightTime(hl.id)}</span>
                                    </div>
                                    <div class="glean-reader__highlight-text">"{hl.text}"</div>
                                    {#if editingMemoId === hl.id}
                                        <div class="glean-annotation-inline-edit" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
                                            <textarea
                                                class="glean-mini-input glean-annotation-inline-edit__input"
                                                rows="2"
                                                bind:value={editingMemoDraft}
                                                placeholder={t(i18n, "highlight.memoPlaceholderEdit")}
                                                onkeydown={(e) => {
                                                    if (e.isComposing || e.keyCode === 229) return;
                                                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void submitEditMemo(hl); }
                                                    if (e.key === "Escape") { e.preventDefault(); editingMemoId = ""; }
                                                }}
                                            ></textarea>
                                            <div class="glean-annotation-inline-edit__actions">
                                                <button type="button" class="glean-btn glean-btn--pri glean-btn--xs" disabled={editingMemoBusy} onclick={() => void submitEditMemo(hl)}>{t(i18n, "action.save")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" onclick={() => { editingMemoId = ""; }}>{t(i18n, "action.cancel")}</button>
                                            </div>
                                        </div>
                                    {:else if hl.memo}
                                        <div class="glean-highlights__memo-bubble" role="note" aria-label={t(i18n, "highlight.memoThought")} ondblclick={(e) => { e.stopPropagation(); beginEditMemo(hl); }}>
                                            <span class="glean-highlights__memo-icon" aria-hidden="true">💡</span>
                                            <span class="glean-highlights__memo-text">{hl.memo}</span>
                                        </div>
                                    {/if}
                                    {#if hl.replies?.length}
                                        <div class="glean-annotation-replies" onclick={(e) => e.stopPropagation()} role="presentation">
                                            {#each hl.replies as reply (reply.id)}
                                                <div class="glean-annotation-reply">
                                                    <span class="glean-annotation-reply__body">{reply.md}</span>
                                                    {#if reply.time || reply.author}
                                                        <span class="glean-annotation-reply__meta">{[reply.author, reply.time].filter(Boolean).join(" · ")}</span>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                    {#if tagPickerId === hl.id}
                                        <div class="glean-annotation-tag-picker" role="group" aria-label={t(i18n, "highlight.filterAnnotationTag")}>
                                            {#each whaleCustomTags as tagDef (tagDef.value)}
                                                <button
                                                    type="button"
                                                    class="glean-annotation-tag-picker__btn"
                                                    class:glean-annotation-tag-picker__btn--active={hl.annotationTag === tagDef.value}
                                                    onclick={(e) => { e.stopPropagation(); void applyHighlightTag(hl, tagDef.value); }}
                                                >{tagDef.icon} {tagDef.label}</button>
                                            {/each}
                                            {#if hl.annotationTag}
                                                <button type="button" class="glean-annotation-tag-picker__btn" onclick={(e) => { e.stopPropagation(); void applyHighlightTag(hl, ""); }}>{t(i18n, "highlight.tagClear")}</button>
                                            {/if}
                                        </div>
                                    {/if}
                                    {#if replyingId === hl.id}
                                        <div class="glean-annotation-inline-edit" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
                                            <input
                                                class="glean-mini-input glean-annotation-inline-edit__input"
                                                bind:value={replyDraft}
                                                placeholder={t(i18n, "highlight.replyPlaceholder")}
                                                onkeydown={(e) => {
                                                    if (e.isComposing || e.keyCode === 229) return;
                                                    if (e.key === "Enter") { e.preventDefault(); void submitHighlightReply(hl); }
                                                    if (e.key === "Escape") { e.preventDefault(); replyingId = ""; }
                                                }}
                                            />
                                            <div class="glean-annotation-inline-edit__actions">
                                                <button type="button" class="glean-btn glean-btn--pri glean-btn--xs" disabled={replyBusy || !replyDraft.trim()} onclick={() => void submitHighlightReply(hl)}>{t(i18n, "action.save")}</button>
                                                <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" onclick={() => { replyingId = ""; }}>{t(i18n, "action.cancel")}</button>
                                            </div>
                                        </div>
                                    {/if}
                                    <div class="glean-reader__highlight-footer">
                                        <div class="glean-reader__highlight-footer-left">
                                            <button class="glean-linkish" type="button" onclick={(e) => { e.stopPropagation(); openHighlightSource(hl); }}>{t(i18n, "reader.jumpToBlock")}</button>
                                            <ActionPopover label={t(i18n, "library.moreActions")} compact>
                                                <button class="glean-btn glean-btn--ghost" type="button" onclick={() => { editingAnnotation = hl; }}>
                                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                                                    <span>{t(i18n, "annotationEditor.openEditor")}</span>
                                                </button>
                                                <button class="glean-btn glean-btn--ghost" type="button" onclick={() => { tagPickerId = tagPickerId === hl.id ? "" : hl.id; replyingId = ""; }}>
                                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanTag" /></svg>
                                                    <span>{t(i18n, "highlight.filterAnnotationTag")}</span>
                                                </button>
                                                <button class="glean-btn glean-btn--ghost" type="button" onclick={() => { replyingId = replyingId === hl.id ? "" : hl.id; replyDraft = ""; tagPickerId = ""; }}>
                                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanComment" /></svg>
                                                    <span>{t(i18n, "highlight.addReply")}</span>
                                                </button>
                                                {#if hl.annotationKind === "siyuan-comment" && whaleStatus.installed}
                                                    <button class="glean-btn glean-btn--ghost" type="button" onclick={(e) => openWhaleCommentEditor(facade.pluginInstance.app, hl.commentBlockId || hl.id, e.currentTarget as HTMLElement)}>
                                                        <span>🐋 {t(i18n, "highlight.whaleEdit")}</span>
                                                    </button>
                                                {/if}
                                                {#if hl.commentDocId}
                                                    <button class="glean-btn glean-btn--ghost" type="button" onclick={() => openHighlightCommentBlock(hl)}>{t(i18n, "highlight.jumpToComment")}</button>
                                                {/if}
                                                <button class="glean-btn glean-btn--ghost" type="button" onclick={() => void copyHighlightQuote(hl)}>
                                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                                    <span>{t(i18n, "highlight.copyShare")}</span>
                                                </button>
                                                <button class="glean-btn glean-btn--ghost" type="button" onclick={() => quoteCardFromHighlight(hl)}>
                                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                                                    <span>{t(i18n, "quoteCard.action")}</span>
                                                </button>
                                                {#if hasCommonInstalled}
                                                    <button class="glean-btn glean-btn--ghost glean-reader__push-common-btn" type="button" onclick={() => void saveHighlightToCommon(hl)}>
                                                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanBookmark" /></svg>
                                                        <span>{t(i18n, "quoteCard.saveToCommon")}</span>
                                                    </button>
                                                {/if}
                                                <button class="glean-btn glean-btn--ghost" type="button" class:glean-ghost-btn={!hasExamInstalled} onclick={() => void examFromHighlight(hl)}>
                                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanBolt" /></svg>
                                                    <span>{t(i18n, "reader.examMake")}</span>
                                                </button>
                                                <button class="glean-btn glean-btn--ghost" type="button" onclick={() => void handleDeleteHighlight(hl)}>
                                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanTrash" /></svg>
                                                    <span>{t(i18n, confirmDeleteId === hl.id ? "highlight.deleteConfirm" : "highlight.deleteAnnotation")}</span>
                                                </button>
                                            </ActionPopover>
                                        </div>
                                        <div class="glean-reader__highlight-footer-right">
                                            {#if hasCardsInstalled}
                                                <button
                                                    class="glean-btn glean-btn--xs glean-reader__push-cards-btn glean-reader__pipeline-btn glean-gm-btn--accent"
                                                    class:glean-reader__pipeline-btn--enrolled={enrolledFlashcardKeys.has(hl.id)}
                                                    class:glean-gm-btn--fresh={enrolledFlashcardKeys.has(hl.id)}
                                                    type="button"
                                                    aria-busy={flashcardPipelineBusy}
                                                    disabled={enrolledFlashcardKeys.has(hl.id) || flashcardPipelineBusy}
                                                    title={enrolledFlashcardKeys.has(hl.id) ? t(i18n, "pipeline.cardCreatedBadge") : t(i18n, "pipeline.makeFlashcard")}
                                                    aria-label={enrolledFlashcardKeys.has(hl.id) ? t(i18n, "pipeline.cardCreatedBadge") : t(i18n, "pipeline.makeFlashcard")}
                                                    onclick={(e) => { e.stopPropagation(); void pushHighlightToCards(hl); }}
                                                >
                                                    <span>{enrolledFlashcardKeys.has(hl.id) ? t(i18n, "pipeline.cardCreatedBadge") : `+ ${t(i18n, "pipeline.makeFlashcard")}`}</span>
                                                </button>
                                            {:else}
                                                <button
                                                    class="glean-btn glean-btn--xs glean-reader__pipeline-btn glean-gm-btn--accent"
                                                    class:glean-reader__pipeline-btn--enrolled={enrolledFlashcardKeys.has(hl.id)}
                                                    class:glean-gm-btn--fresh={enrolledFlashcardKeys.has(hl.id)}
                                                    type="button"
                                                    aria-busy={flashcardPipelineBusy}
                                                    disabled={enrolledFlashcardKeys.has(hl.id) || flashcardPipelineBusy}
                                                    title={enrolledFlashcardKeys.has(hl.id) ? t(i18n, "pipeline.cardCreatedBadge") : t(i18n, "flashcard.make")}
                                                    aria-label={enrolledFlashcardKeys.has(hl.id) ? t(i18n, "pipeline.cardCreatedBadge") : t(i18n, "flashcard.make")}
                                                    onclick={(e) => { e.stopPropagation(); void cardFromHighlight(hl); }}
                                                >
                                                    <span>{enrolledFlashcardKeys.has(hl.id) ? t(i18n, "pipeline.cardCreatedBadge") : `+ ${t(i18n, "flashcard.make")}`}</span>
                                                </button>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
            {/snippet}

            {#if companionTab === "all" || companionTab === "notes"}
                {#if companionTab === "all"}
                    <details id={highlightsTitleId} class="glean-reader__section glean-reader__section--card glean-reader__fold" aria-labelledby={highlightsTitleId} bind:open={highlightsOpen} ontoggle={onHighlightsToggle}>
                        <summary id={highlightsTitleId} class="glean-reader__section-title">
                            <span><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg> {t(i18n, "reader.highlightsTitle")} ({docHighlights.length})</span>
                            {@render highlightsOps()}
                        </summary>
                        {@render highlightsBody()}
                    </details>
                {:else}
                    <div id={highlightsTitleId} class="glean-reader__section glean-reader__section--card glean-reader__tab-panel" aria-labelledby={highlightsTitleId}>
                        <div class="glean-reader__section-title glean-reader__section-title--flat">
                            <span><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg> {t(i18n, "reader.highlightsTitle")} ({docHighlights.length})</span>
                            {@render highlightsOps()}
                        </div>
                        {@render highlightsBody()}
                    </div>
                {/if}
            {/if}

            {#snippet toolsBody()}
                <div class="glean-reader__more-tools-body">
                    <div class="glean-reader__section glean-reader__section--utility glean-reader__recent" aria-labelledby={recentTitleId}>
                        <div id={recentTitleId} class="glean-reader__section-title" role="heading" aria-level="3">{t(i18n, "reader.recentTitle")}</div>
                        <div class="glean-reader__recent-list">
                            {#each recentReadings as item (item.id)}
                                {@const displayRecentTitle = item.title || (item.id === docId ? docTitle : "") || t(i18n, "panel.untitled")}
                                <button
                                    class="glean-reader__recent-item"
                                    class:glean-reader__recent-item--current={item.id === docId}
                                    aria-current={item.id === docId ? "page" : undefined}
                                    title={displayRecentTitle}
                                    onclick={() => openRecentReading(item)}
                                >{displayRecentTitle}</button>
                            {:else}
                                <div class="glean-reader__hint">{t(i18n, "reader.recentEmpty")}</div>
                            {/each}
                        </div>
                    </div>
                    {#if context?.id === docId}<AuthorEditor {facade} {docId} onSaved={() => { if (docId) return loadContext(docId); }} />{/if}
                    {#if context && speechSupported}
                        <div class="glean-reader__section glean-reader__section--utility glean-reader__speech" aria-labelledby={speechTitleId}>
                            <div id={speechTitleId} class="glean-reader__section-title" role="heading" aria-level="3">{t(i18n, "reader.speechTitle")}</div>
                            <div class="glean-reader__speech-rate">
                                <label for={speechRateId}>{t(i18n, "reader.speechRate")}</label>
                                <input
                                    id={speechRateId}
                                    type="range"
                                    min="0.75"
                                    max="1.5"
                                    step="0.25"
                                    value={speechRate}
                                    aria-label={t(i18n, "reader.speechRate")}
                                    oninput={(event) => setSpeechRate(Number((event.currentTarget as HTMLInputElement).value))}
                                />
                                <span>{speechRate}×</span>
                            </div>
                            <div class="glean-reader__ops">
                                {#if excerpt?.text}
                                    <button class="glean-btn glean-btn--ghost" disabled={speechState === "playing" || speechState === "paused"} onclick={() => startSpeech("selection")}>
                                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                                        <span>{t(i18n, "reader.speechSelection")}</span>
                                    </button>
                                {/if}
                                <button class="glean-btn glean-btn--ghost" disabled={speechState === "playing" || speechState === "paused"} onclick={() => startSpeech("full")}>
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                                    <span>{t(i18n, "reader.speechFull")}</span>
                                </button>
                                {#if speechState === "playing" || speechState === "paused"}
                                    <button class="glean-btn glean-btn--ghost" onclick={toggleSpeechPause}>
                                        {speechState === "playing" ? t(i18n, "reader.speechPause") : t(i18n, "reader.speechResume")}
                                    </button>
                                    <button class="glean-btn glean-btn--ghost" onclick={stopSpeech}>{t(i18n, "reader.speechStop")}</button>
                                {:else if speechChunks.length > 0 && speechChunkIndex < speechChunks.length}
                                    <button class="glean-btn glean-btn--ghost" onclick={() => startSpeech(speechScope ?? "full", true)}>
                                        {t(i18n, "reader.speechContinue")}
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    <details id={toolsAppearancePanelId} class="glean-reader__section glean-reader__section--utility glean-reader__appearance glean-reader__fold" aria-labelledby={toolsAppearanceTitleId} bind:open={toolsAppearanceOpen}>
                        <summary id={toolsAppearanceTitleId} class="glean-reader__section-title"><span>{t(i18n, "reader.appearanceTitle")}</span></summary>
                        <label>{t(i18n, "reader.appearanceFontSize")}
                            <select class="b3-select" disabled={appearanceBusy} value={readerAppearance.fontSize} onchange={(event) => void updateAppearance("fontSize", (event.currentTarget as HTMLSelectElement).value)}>
                                <option value="small">{t(i18n, "reader.appearanceSmall")}</option>
                                <option value="normal">{t(i18n, "reader.appearanceNormal")}</option>
                                <option value="large">{t(i18n, "reader.appearanceLarge")}</option>
                            </select>
                        </label>
                        <label>{t(i18n, "reader.appearanceLineHeight")}
                            <select class="b3-select" disabled={appearanceBusy} value={readerAppearance.lineHeight} onchange={(event) => void updateAppearance("lineHeight", (event.currentTarget as HTMLSelectElement).value)}>
                                <option value="compact">{t(i18n, "reader.appearanceCompact")}</option>
                                <option value="normal">{t(i18n, "reader.appearanceNormal")}</option>
                                <option value="relaxed">{t(i18n, "reader.appearanceRelaxed")}</option>
                            </select>
                        </label>
                        <label>{t(i18n, "reader.appearanceWidth")}
                            <select class="b3-select" disabled={appearanceBusy} value={readerAppearance.width} onchange={(event) => void updateAppearance("width", (event.currentTarget as HTMLSelectElement).value)}>
                                <option value="narrow">{t(i18n, "reader.appearanceNarrow")}</option>
                                <option value="normal">{t(i18n, "reader.appearanceNormal")}</option>
                                <option value="wide">{t(i18n, "reader.appearanceWide")}</option>
                            </select>
                        </label>
                        <label>{t(i18n, "reader.appearanceTheme")}
                            <select class="b3-select" disabled={appearanceBusy} value={readerAppearance.theme} onchange={(event) => void updateAppearance("theme", (event.currentTarget as HTMLSelectElement).value)}>
                                <option value="follow">{t(i18n, "reader.appearanceFollow")}</option>
                                <option value="paper">{t(i18n, "reader.appearancePaper")}</option>
                                <option value="eye">{t(i18n, "reader.appearanceEye")}</option>
                            </select>
                        </label>
                    </details>
                </div>
            {/snippet}

            {#if companionTab === "all" || companionTab === "tools"}
                {#if companionTab === "all"}
                    <details id={moreToolsId} class="glean-reader__section glean-reader__section--utility glean-reader__more-tools glean-reader__fold" aria-labelledby={moreToolsTitleId} bind:open={moreToolsOpen}>
                        <summary id={moreToolsTitleId} class="glean-reader__section-title"><span>{t(i18n, "reader.moreTools")}</span></summary>
                        {@render toolsBody()}
                    </details>
                {:else}
                    <div id={moreToolsId} class="glean-reader__section glean-reader__section--utility glean-reader__more-tools glean-reader__tab-panel" aria-labelledby={moreToolsTitleId}>
                        <div class="glean-reader__section-title glean-reader__section-title--flat">{t(i18n, "reader.moreTools")}</div>
                        {@render toolsBody()}
                    </div>
                {/if}
            {/if}
            {#if (companionTab === "all" || companionTab === "notes") && excerpt}
                <div class="glean-reader__section glean-reader__section--enhanced" aria-labelledby={excerptTitleId}>
                    <div id={excerptTitleId} class="glean-reader__section-title" role="heading" aria-level="3">{t(i18n, "reader.excerptTitle")}</div>
                    {#if excerpt}
                        <div class="glean-reader__excerpt" title={excerpt.text}>
                            {excerpt.text.slice(0, 80)}{excerpt.text.length > 80 ? "…" : ""}
                        </div>
                        {#if !excerpt.blockId}
                            <div class="glean-reader__issue"><span>{t(i18n, "reader.excerptNoBlock")}</span></div>
                        {/if}
                        <div class="glean-reader__ops">
                            <button
                                class="glean-btn glean-btn--pri"
                                aria-busy={excerptBusy}
                                disabled={!excerpt.blockId || excerptBusy}
                                title={excerpt.blockId ? "" : t(i18n, "reader.excerptNoBlock")}
                                onclick={() => void quoteExcerpt()}
                            >{t(i18n, "reader.excerptQuote")}</button>
                            <button class="glean-btn glean-btn--ghost" disabled={!excerpt.blockId} title={excerpt.blockId ? "" : t(i18n, "reader.excerptNoBlock")} onclick={() => void cardFromExcerpt()}>
                                {t(i18n, "flashcard.make")}
                            </button>
                            <button class="glean-btn glean-btn--ghost" onclick={() => void copyExcerpt()}>
                                {t(i18n, "reader.copy")}
                            </button>
                        </div>
                    {:else}
                        <div class="glean-reader__hint">{t(i18n, "reader.excerptHint")}</div>
                    {/if}
                </div>
            {/if}
            {#if companionTab === "all" || companionTab === "ai"}
                <div class="glean-reader__section glean-reader__section--enhanced" aria-labelledby={aiTitleId}>
                    <div id={aiTitleId} class="glean-reader__section-title" role="heading" aria-level="3">{t(i18n, "reader.aiTitle")}</div>
                    {#if !context && !contextLoading && !contextError}
                        <div class="glean-reader__context-state glean-reader__context-state--unfiled" role="status">
                            <div class="glean-reader__hint">{t(i18n, "reader.aiUnfiledNotice")}</div>
                            <button type="button" class="glean-btn glean-btn--pri glean-btn--sm" disabled={addingToLibrary} onclick={() => void addCurrentNoteToLibrary()}>
                                {addingToLibrary ? t(i18n, "reader.addingToLibrary") : t(i18n, "reader.addToLibrary")}
                            </button>
                        </div>
                    {/if}
                    {#if !aiOn}
                        <div class="glean-reader__hint">{t(i18n, "reader.aiOff")}</div>
                        <button class="glean-btn glean-btn--ghost" onclick={() => facade.openSettings()}>{t(i18n, "panel.settings")}</button>
                    {:else}
                        <div class="glean-reader__hint">
                            {t(i18n, aiConfigured ? "reader.aiPrivacy" : "reader.aiSetupMissing")}
                        </div>
                        {#if !aiConfigured}
                            <button class="glean-btn glean-btn--ghost" onclick={() => facade.openSettings()}>{t(i18n, "panel.settings")}</button>
                        {/if}
                        <div class="glean-reader__ops">
                            <button class="glean-btn glean-btn--pri" aria-busy={Boolean(aiBusy)} disabled={Boolean(aiBusy) || !aiReady} onclick={() => void runSummarize()}>
                                <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanSpark" /></svg>{t(i18n, "reader.aiSummarize")}
                            </button>
                            <button
                                class="glean-btn glean-btn--ghost"
                                aria-busy={Boolean(aiBusy)}
                                disabled={Boolean(aiBusy) || !aiReady || !excerpt?.text}
                                title={excerpt?.text ? "" : t(i18n, "reader.excerptHint")}
                                onclick={() => void runTranslate()}
                            >{t(i18n, "reader.aiTranslate")}</button>
                            {#if relatedOn}
                                <button class="glean-btn glean-btn--ghost" aria-busy={Boolean(aiBusy)} disabled={Boolean(aiBusy)} onclick={() => void runRelated()}>
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                    <span>{t(i18n, "reader.aiRelated")}</span>
                                </button>
                            {/if}
                            {#if articleQuestionOn}
                                <div class="glean-reader__question">
                                    <input class="glean-mini-input" disabled={!aiReady} maxlength="1000" placeholder={t(i18n, "reader.articleQuestion.placeholder")} aria-label={t(i18n, "reader.articleQuestion.action")} bind:value={question} onkeydown={(event) => { if (event.isComposing || event.keyCode === 229) return; if (event.key === "Enter") void runArticleQuestion(); else if (event.key === "Escape" && question) { event.stopPropagation(); question = ""; } }} />
                                    <div class="glean-reader__preset-prompts" role="group" aria-label={t(i18n, "reader.articleQuestion.action")}>
                                        <button type="button" class="glean-reader__preset-chip" disabled={!aiReady || Boolean(aiBusy)} onclick={() => triggerQuickQuestion(t(i18n, "reader.quickPromptPoints"))}>
                                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
                                            <span>{t(i18n, "reader.quickPromptPoints")}</span>
                                        </button>
                                        <button type="button" class="glean-reader__preset-chip" disabled={!aiReady || Boolean(aiBusy)} onclick={() => triggerQuickQuestion(t(i18n, "reader.quickPromptActionable"))}>
                                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                                            <span>{t(i18n, "reader.quickPromptActionable")}</span>
                                        </button>
                                        <button type="button" class="glean-reader__preset-chip" disabled={!aiReady || Boolean(aiBusy)} onclick={() => triggerQuickQuestion(t(i18n, "reader.quickPromptSummary"))}>
                                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                                            <span>{t(i18n, "reader.quickPromptSummary")}</span>
                                        </button>
                                    </div>
                                    <div class="glean-reader__ops">
                                        <button class="glean-btn glean-btn--ghost" disabled={!aiReady} class:glean-seg__btn--on={questionMode === "full"} onclick={() => { questionMode = "full"; }}>{t(i18n, "reader.articleQuestion.full")}</button>
                                        <button class="glean-btn glean-btn--ghost" disabled={!aiReady || !excerpt?.blockId} class:glean-seg__btn--on={questionMode === "selection"} onclick={() => { questionMode = "selection"; }}>{t(i18n, "reader.articleQuestion.selection")}</button>
                                        <button class="glean-btn glean-btn--pri" aria-busy={Boolean(aiBusy)} disabled={Boolean(aiBusy) || !aiReady || !question.trim()} onclick={() => void runArticleQuestion()}>{t(i18n, "reader.articleQuestion.ask")}</button>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {#if aiBusy}
                        <AiThinkingCard
                            scenario={aiBusy === "translate" ? "transform" : aiBusy === "question" ? "socratic" : aiBusy === "related" ? "doc-judge" : "general"}
                            title={aiBusyMessage()}
                            compact
                            signal={aiAbort?.signal}
                            onCancel={cancelAiTask}
                        />
                    {/if}
                    {#if aiResult}
                        <div class="glean-reader__ai-card" role="status" aria-live="polite">
                            <div class="glean-reader__ai-src">
                                {t(i18n, "reader.aiSource", { channel: channelLabel, action: aiResult.action })}
                            </div>
                            <div class="glean-reader__ai-scope">{t(i18n, aiResult.scope === "full" ? "reader.aiScopeFull" : "reader.aiScopeSelection")}</div>
                            <div class="glean-reader__ai-text">{aiResult.text}</div>
                            <div class="glean-reader__ops">
                                <button class="glean-btn glean-btn--ghost" onclick={() => void copyAiResult()}>
                                    {t(i18n, "reader.copy")}
                                </button>
                                {#if aiResult.kind === "summarize" && context}
                                    <button class="glean-btn glean-btn--ghost" aria-busy={summarySaving} disabled={summarySaving || summarySaved} onclick={() => void keepSummary()}>
                                        {t(i18n, summarySaved ? "reader.aiSummarySaved" : "reader.aiSaveSummary")}
                                    </button>
                                {/if}
                                <button class="glean-btn glean-btn--ghost" disabled={insertingCallout} onclick={() => void insertAiResultCallout()}>
                                    {t(i18n, "reader.aiInsertCallout")}
                                </button>
                                <button class="glean-btn glean-btn--ghost" onclick={() => { aiResult = null; }}>
                                    {t(i18n, "action.close")}
                                </button>
                            </div>
                        </div>
                    {/if}
                    {#if questionResult}
                        <div class="glean-reader__ai-card" role="status" aria-live="polite">
                            <div class="glean-reader__ai-src">{t(i18n, "reader.articleQuestion.action")}</div>
                            <div class="glean-reader__ai-scope">{t(i18n, questionResult.scope === "full" ? "reader.aiScopeFull" : "reader.aiScopeSelection")}</div>
                            <div class="glean-reader__ai-text">{questionResult.answer}</div>
                            {#if questionResult.truncated}<div class="glean-reader__hint">{t(i18n, "reader.articleQuestion.truncated")}</div>{/if}
                            {#if questionResult.evidence.length > 0}
                                <div class="glean-reader__ai-src">{t(i18n, "reader.articleQuestion.evidence")}</div>
                                {#each questionResult.evidence as evidence}<blockquote>{evidence}</blockquote>{/each}
                            {:else}<div class="glean-reader__hint">{t(i18n, "reader.articleQuestion.insufficient")}</div>{/if}
                            <div class="glean-reader__ops">
                                <button class="glean-btn glean-btn--ghost" onclick={() => void copyText(`${questionResult!.answer}\n\n${questionResult!.evidence.join("\n")}`)}>{t(i18n, "reader.copy")}</button>
                                <button class="glean-btn glean-btn--ghost" disabled={insertingCallout} onclick={() => void insertQuestionCallout()}>{t(i18n, "reader.aiInsertCallout")}</button>
                                <button class="glean-btn glean-btn--ghost" onclick={() => { questionResult = null; }}>{t(i18n, "action.close")}</button>
                            </div>
                        </div>
                    {/if}
                    {#if relatedShown && relatedItems.length > 0}
                        <div class="glean-reader__related">
                            {#each relatedItems as item (item.id)}
                                <button class="glean-reader__related-item" title={item.title} onclick={() => openRelatedDoc(item.id, item.title)}>
                                    {item.title}
                                </button>
                            {/each}
                        </div>
                    {:else if relatedShown}
                        <div class="glean-reader__hint" role={relatedReason === "error" ? "alert" : "status"}>
                            {relatedStatusMessage(relatedReason)}
                        </div>
                    {/if}
                {/if}
            </div>
            {/if}
            {#if context}
                {#if companionTab === "tools" || companionTab === "all"}
                    <div class="glean-reader__ops glean-reader__tools-footer-ops">
                        <button class="glean-btn glean-btn--ghost" onclick={() => openFormattingDialog(facade, context!.id)}>{t(i18n, "formatting.open")}</button>
                        {#if hasSourceAction(context.contentType, context.url)}
                            <button class="glean-btn glean-btn--ghost" onclick={openSource}><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanExternal" /></svg>{t(i18n, "clip.openSource")}</button>
                        {:else if resolveCarrier(context.contentType) === "link"}
                            <span class="glean-source-missing">{t(i18n, "clip.sourceMissing")}</span>
                        {/if}
                        <button
                            class="glean-btn glean-btn--ghost"
                            disabled={snapping}
                            title={context.snapshot ? t(i18n, "snapshot.open") : t(i18n, "snapshot.take")}
                            aria-label={context.snapshot ? t(i18n, "snapshot.open") : t(i18n, "snapshot.take")}
                            onclick={() => void takeSnapshot()}
                        >
                            <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href={context.snapshot ? "#iconGleanArchive" : "#iconGleanCamera"} /></svg>
                        </button>
                    </div>
                    {#if bodyState === "unmeasured"}
                        <button class="glean-btn glean-btn--ghost" disabled={measuring} title={t(i18n, "clip.bodyCheckHint")} onclick={() => void checkBody()}>
                            <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanSearch" /></svg>{t(i18n, "clip.bodyCheck")}
                        </button>
                    {:else if bodyState === "missing"}
                        <div class="glean-reader__issue">
                            <span title={t(i18n, "clip.bodyMissingHint")}>{t(i18n, "clip.bodyMissing")}</span>
                            {#if hasSourceAction(context.contentType, context.url)}
                                <button class="glean-btn glean-btn--ghost" onclick={recapture}><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanRefresh" /></svg>{t(i18n, "clip.reclip")}</button>
                            {/if}
                        </div>
                    {/if}
                    <button class="glean-reader__back" onclick={backToLibrary}>{t(i18n, "reading.backToLibrary")}</button>
                {/if}
            {:else if !contextLoading && !contextError && (companionTab === "tools" || companionTab === "all")}
                <div class="glean-reader__hint">{t(i18n, "reader.toolsUnfiledHint")}</div>
            {/if}
        </aside>
    {/if}
    </div>
    <AnnotationEditorDialog
        item={editingAnnotation}
        items={visibleDocHighlights}
        {i18n}
        app={facade.pluginInstance.app}
        whaleTags={whaleCustomTags}
        whaleInstalled={whaleStatus.installed}
        onSelectItem={(next) => { editingAnnotation = next; }}
        onClose={() => { editingAnnotation = null; }}
        onUpdated={(next) => {
            docHighlights = docHighlights.map((item) => item.id === next.id ? next : item);
            if (docId) refreshWhaleDecorationsInProtyle(facade.pluginInstance.app, docId);
            facade.notifyDataChanged();
        }}
        onDeleted={(id) => {
            docHighlights = docHighlights.filter((item) => item.id !== id);
            if (docId) refreshWhaleDecorationsInProtyle(facade.pluginInstance.app, docId);
            facade.notifyDataChanged();
        }}
        onJumpToSource={(hl) => openHighlightSource(hl)}
        onJumpToComment={(hl) => openHighlightCommentBlock(hl)}
    />
</div>
