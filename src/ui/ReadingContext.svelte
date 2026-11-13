<script lang="ts">
    /**
     * 原生思源编辑器上的低干扰阅读上下文（S3/T-1721）。
     *
     * 这里只渲染标题、载体、来源和状态，正文始终由思源编辑器承载。
     * 当前根块属性每次加载都从 clip-store 读取，索引不能覆盖编辑器里的事实。
     */
    import { showMessage } from "../libs/notice";
    import { untrack } from "svelte";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
    import { hasSourceAction, openTargetForCarrier, resolveCarrier, sourceUrlForCarrier } from "../domain/carrier";
    import { fulltextBodyState, type FulltextBodyState } from "../domain/content";
    import { batchSetStatusDetailed, measureClipBody, readClipContext, type ReadingClipContext } from "../services/clip-store";
    import type { ClipStatus } from "../domain/schema";
    import { recordReadingDone } from "../services/checkin-bridge";
    import { isWechatUrl, displayWechatAuthor } from "../domain/wechat";
    import ClipStatusActions from "./ClipStatusActions.svelte";
    import MobileReadingBar from "./MobileReadingBar.svelte";
    import { openFormattingDialog } from "./formatting-dialog";
    import { syncMetaCalloutToDocument } from "../services/meta-callout-service";
    import { installMobileViewportVars } from "../libs/mobile-viewport";

    interface Props {
        facade: GleanFacade;
        docId: string;
    }

    let { facade, docId }: Props = $props();
    const i18n = $derived(facade.i18n);
    const instanceId = $props.id();
    const titleId = `glean-reading-context-title-${instanceId}`;
    const maintenanceId = `glean-reading-context-maintenance-${instanceId}`;
    const maintenanceTitleId = `glean-reading-context-maintenance-title-${instanceId}`;
    let context = $state<ReadingClipContext | null>(null);
    let loading = $state(true);
    let refreshing = $state(false);
    let loadError = $state(false);
    let busy = $state(false);
    let maintenanceOpen = $state(false);
    let pillMode = $state(untrack(() => Boolean(facade.isMobile)));

    function togglePillMode(): void {
        pillMode = !pillMode;
    }
    let reloadToken = 0;
    let mounted = true;
    let rootEl = $state<HTMLElement | null>(null);
    // 包括“普通文档，无阅读栏”的已判定结果；后台重读不重放骨架屏。
    let settled = false;
    const isWechat = $derived(Boolean((context?.url && isWechatUrl(context.url)) || (context?.site && isWechatUrl(context.site))));

    async function reload(): Promise<void> {
        const token = ++reloadToken;
        if (!mounted) return;
        if (!docId) {
            if (token !== reloadToken || !mounted) return;
            context = null;
            loadError = false;
            loading = false;
            return;
        }
        if (!settled) {
            loading = true;
            loadError = false;
        }
        refreshing = true;
        try {
            const next = await readClipContext(docId);
            if (token !== reloadToken || !mounted) return;
            context = next;
            if (next && next.id) {
                facade.recordRecentReading?.(next.id, next.title);
            }
            loadError = false;
        } catch (error) {
            // 编辑器切换期间根块可能已经销毁；上下文退出即可，不打扰正文。
            console.debug("[glean] 阅读上下文读取失败:", error);
            if (token !== reloadToken || !mounted) return;
            context = null;
            loadError = true;
        } finally {
            if (token === reloadToken && mounted) {
                settled = true;
                loading = false;
                refreshing = false;
            }
        }
    }

    $effect(() => {
        const id = docId;
        mounted = true;
        settled = false;
        context = null;
        loading = true;
        refreshing = false;
        loadError = false;
        maintenanceOpen = false;
        untrack(() => void reload());
        const handler = () => void reload();
        const refreshHandler = (event: Event) => {
            if ((event as CustomEvent<{ id?: string }>).detail?.id === id) void reload();
        };
        document.addEventListener("glean:data-changed", handler);
        document.addEventListener("glean:reading-context-refresh", refreshHandler);
        return () => {
            mounted = false;
            reloadToken += 1;
            document.removeEventListener("glean:data-changed", handler);
            document.removeEventListener("glean:reading-context-refresh", refreshHandler);
        };
    });

    $effect(() => {
        return installMobileViewportVars(rootEl, facade.isMobile);
    });

    $effect(() => {
        if (!maintenanceOpen || typeof document === "undefined") return;
        const onDocPointerDown = (event: PointerEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest(".glean-reading-context__maintenance")) return;
            maintenanceOpen = false;
        };
        const onDocKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") maintenanceOpen = false;
        };
        document.addEventListener("pointerdown", onDocPointerDown, true);
        document.addEventListener("keydown", onDocKeyDown, true);
        return () => {
            document.removeEventListener("pointerdown", onDocPointerDown, true);
            document.removeEventListener("keydown", onDocKeyDown, true);
        };
    });

    function carrierLabel(value: string | undefined): string {
        return t(i18n, `clip.type.${resolveCarrier(value)}`);
    }

    function statusLabel(value: ClipStatus): string {
        return t(i18n, `status.${value}`);
    }

    function contextDisplaySource(url?: string, site?: string): string {
        if (!url) return "";
        if (isWechatUrl(url) || isWechatUrl(site)) return "";
        if (site && site.trim()) return site.trim();
        try {
            return new URL(url).hostname;
        } catch {
            return url.slice(0, 40);
        }
    }

    let bodyState = $derived<FulltextBodyState>(context ? fulltextBodyState(context.contentType, context.words) : "na");
    let measuring = $state(false);

    $effect(() => {
        if (bodyState === "missing") maintenanceOpen = true;
    });

    /** 显式"检测正文"（T-1727）：导出重算字数并写回；不修改正文，不触碰快照。 */
    async function checkBody(): Promise<void> {
        if (!context || measuring) return;
        measuring = true;
        try {
            const measured = await measureClipBody(facade.pluginInstance, context.id);
            if (context) context = { ...context, words: measured.words };
            showMessage(
                measured.indexSyncFailed
                    ? t(i18n, "msg.writeIndexPending")
                    : measured.missing
                    ? t(i18n, "clip.bodyMissingConfirm")
                    : t(i18n, "clip.bodyOk", { n: measured.words }),
                measured.indexSyncFailed ? 4000 : 3500
            );
            facade.notifyDataChanged();
        } catch (error) {
            console.warn("[glean] 正文检测失败:", error);
            showMessage(t(i18n, "clip.bodyCheckFailed"), 3000);
        } finally {
            measuring = false;
        }
    }

    /** "重新剪藏"是打开原文的显式导航：官方剪藏扩展产出新文档，本文不被覆盖。 */
    function recapture(): void {
        if (!context) return;
        const url = sourceUrlForCarrier(context.contentType, context.url);
        if (!url) {
            showMessage(t(i18n, "clip.sourceMissing"), 3000);
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        showMessage(t(i18n, "clip.reclipHint"), 4500);
    }

    function openContextSource(current: ReadingClipContext): void {
        const url = sourceUrlForCarrier(current.contentType, current.url);
        if (!url) {
            showMessage(t(i18n, "clip.sourceMissing"), 3000);
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
    }

    function openSource(): void {
        if (context) openContextSource(context);
    }

    async function writeStatus(status: ClipStatus): Promise<boolean> {
        if (!context || busy) return false;
        const current = context;
        busy = true;
        try {
            const result = await batchSetStatusDetailed(facade.pluginInstance, [current.id], status);
            if (result.ok !== 1) {
                showMessage(t(i18n, "msg.statusFailed"), 3000);
                return false;
            }
            if (status === "done" && facade.settings.integration.checkinEnabled && facade.settings.integration.checkinItemId) {
                void recordReadingDone(facade.settings.integration.checkinItemId, current.id, current.title);
            }
            if (status === "done" && facade.settings.integration.dailyNoteEnabled && facade.settings.anchorNotebooks?.[0]) {
                const notebookId = facade.settings.anchorNotebooks[0];
                const docId = current.id;
                void (async () => {
                    const { recordDailyNoteReading } = await import("../services/daily-note-service");
                    await recordDailyNoteReading(notebookId, docId);
                })().catch(() => undefined);
            }
            // 对账可能在写入期间完成；保留最新标题/来源，只覆盖刚刚成功的状态。
            context = { ...(context?.id === current.id ? context : current), status };
            facade.notifyDataChanged();
            showMessage(t(i18n, result.indexSyncFailed.length ? "msg.statusIndexPending" : "msg.statusChanged"), 3500);
            return true;
        } catch (error) {
            console.warn("[glean] 阅读上下文状态变更失败:", error);
            showMessage(t(i18n, "msg.statusFailed"), 3000);
            return false;
        } finally {
            busy = false;
        }
    }

    async function setStatus(status: ClipStatus): Promise<void> {
        await writeStatus(status);
    }

    async function startReading(): Promise<void> {
        if (!context || busy) return;
        const current = context;
        if (current.status !== "reading" && !await writeStatus("reading")) return;
        // link 的主动作是来源；全文即使有来源也继续留在思源正文。
        if (openTargetForCarrier(current.contentType, current.url) === "source") openContextSource(current);
        else facade.openReadingDocument(current.id);
    }

    async function copyDocBlockRef(): Promise<void> {
        if (!context) return;
        const title = context.title || t(i18n, "panel.untitled");
        const refText = `((${context.id} '${title}'))`;
        try {
            await navigator.clipboard.writeText(refText);
            showMessage(t(i18n, "reader.blockRefCopied"), 2000);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    }

    function backToLibrary(): void {
        if (context) void facade.openLibraryArticle(context.id);
    }

    let syncingCallout = $state(false);

    async function handleSyncMetaCallout(): Promise<void> {
        if (!context || syncingCallout || busy) return;
        syncingCallout = true;
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
            const res = await syncMetaCalloutToDocument(facade.pluginInstance, context.id, labels);
            if (res.ok) {
                showMessage(t(i18n, res.created ? "reading.metaCalloutCreated" : "reading.metaCalloutUpdated"), 3000);
            } else {
                showMessage(t(i18n, "reading.metaCalloutFailed") + (res.error ? `: ${res.error}` : ""), 3000);
            }
        } catch {
            showMessage(t(i18n, "reading.metaCalloutFailed"), 3000);
        } finally {
            syncingCallout = false;
        }
    }

    let recordingDailyNote = $state(false);

    async function handleRecordDailyNote(): Promise<void> {
        if (!context || recordingDailyNote || busy) return;
        const notebookId = facade.settings.anchorNotebooks?.[0];
        if (!notebookId) {
            showMessage(t(i18n, "settings.notebookHint"), 3000);
            return;
        }
        recordingDailyNote = true;
        try {
            const { recordDailyNoteReading } = await import("../services/daily-note-service");
            const res = await recordDailyNoteReading(notebookId, context.id);
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
</script>

{#if loading}
    <aside bind:this={rootEl} class="glean-reading-context glean-reading-context--loading" aria-label={t(i18n, "panel.loading")} aria-busy="true">
        <div class="glean-reading-context__loading-main" aria-hidden="true">
            <span class="glean-reading-context__skeleton glean-reading-context__skeleton--title"></span>
            <span class="glean-reading-context__skeleton glean-reading-context__skeleton--meta"></span>
        </div>
        <div class="glean-reading-context__loading-label" role="status" aria-live="polite">{t(i18n, "panel.loading")}</div>
    </aside>
{:else if loadError}
    <aside bind:this={rootEl} class="glean-reading-context glean-reading-context--error" role="alert" aria-live="polite" aria-busy={refreshing}>
        <div class="glean-reading-context__error-main">
            <strong>{t(i18n, "reading.contextFailed")}</strong>
            <span>{t(i18n, "reading.contextLabel")}</span>
        </div>
        <button type="button" class="glean-reading-context__source-btn" disabled={refreshing} onclick={() => void reload()}>{t(i18n, "action.retry")}</button>
    </aside>
{:else if context}
    <aside bind:this={rootEl} class="glean-reading-context" class:glean-reading-context--pill={pillMode} aria-labelledby={titleId} aria-busy={busy || measuring || refreshing}>
        <div class="glean-reading-context__main">
            <div class="glean-reading-context__headline">
                <span class={`glean-dot glean-dot--${context.status}`} aria-hidden="true"></span>
                <div id={titleId} class="glean-reading-context__title" role="heading" aria-level="2" title={context.title}>{context.title || t(i18n, "panel.untitled")}</div>
            </div>
            <div class="glean-reading-context__meta">
                <span class={`glean-carrier-badge glean-carrier-badge--${resolveCarrier(context.contentType)}`}>
                    {carrierLabel(context.contentType)}
                </span>
                <span class={`glean-reading-context__status glean-st-badge glean-st-badge--${context.status}`}>{statusLabel(context.status)}</span>
                {#if isWechat}
                    <span class="glean-badge glean-source-wechat" title={displayWechatAuthor(context?.author) || t(i18n, "wechat.officialAccount")}>
                        <span class="glean-wechat-dot" aria-hidden="true"></span>{t(i18n, "wechat.name")}{#if displayWechatAuthor(context?.author)} · {displayWechatAuthor(context?.author)}{/if}
                    </span>
                {/if}
                {#if context.url && contextDisplaySource(context.url, context.site)}
                    <span class="glean-reading-context__source" title={context.url}>{contextDisplaySource(context.url, context.site)}</span>
                {/if}
                {#if (context.words ?? 0) > 0}
                    <span class="glean-reading-context__words">{t(i18n, "panel.words", { n: context.words ?? 0 })}</span>
                {/if}
            </div>
        </div>
        <div class="glean-reading-context__actions">
            <button type="button" class="glean-reading-context__source-btn glean-reading-context__source-btn--primary" title={t(i18n, "reading.openInReader")} onclick={() => { if (context) (facade.openReader ?? facade.openReadingDocument).call(facade, context.id); }}>
                <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                <span>{t(i18n, "reading.openInReader")}</span>
            </button>
            {#if hasSourceAction(context.contentType, context.url)}
                <button type="button" class="glean-reading-context__source-btn" title={t(i18n, "reading.sourceHint")} onclick={openSource}>
                    <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanExternal" /></svg>
                    <span>{t(i18n, "clip.openSource")}</span>
                </button>
            {:else if resolveCarrier(context.contentType) === "link"}
                <span class="glean-reading-context__missing">{t(i18n, "clip.sourceMissing")}</span>
            {/if}
            {#if bodyState === "missing"}
                <span class="glean-reading-context__missing" title={t(i18n, "clip.bodyMissingHint")}>
                    {t(i18n, "clip.bodyMissing")}
                </span>
                {#if hasSourceAction(context.contentType, context.url)}
                    <button
                        type="button"
                        class="glean-reading-context__source-btn glean-reading-context__reclip"
                        title={t(i18n, "clip.bodyMissingHint")}
                        aria-label={t(i18n, "clip.bodyMissingHint")}
                        onclick={recapture}
                    ><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanRefresh" /></svg></button>
                {/if}
            {/if}
            <ClipStatusActions
                i18n={i18n}
                status={context.status}
                disabled={busy}
                onStartReading={startReading}
                onSetStatus={setStatus}
                onArchive={() => { if (context) facade.openArchiveDialog(context.id); }}
                onRestore={() => { if (context) facade.openRestoreDialog(context.id); }}
            />
            <button type="button" class="glean-reading-context__source-btn" title={t(i18n, "action.copyBlockRef")} aria-label={t(i18n, "action.copyBlockRef")} onclick={() => void copyDocBlockRef()}>
                <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
            </button>
            <button type="button" class="glean-reading-context__back" onclick={backToLibrary}>
                {t(i18n, "reading.backToLibrary")}
            </button>
            <details id={maintenanceId} class="glean-reading-context__maintenance" aria-labelledby={maintenanceTitleId} bind:open={maintenanceOpen}>
                <summary id={maintenanceTitleId}>{t(i18n, "reading.maintenance")}</summary>
                <div class="glean-reading-context__maintenance-panel">
                    {#if bodyState === "unmeasured"}
                        <button
                            type="button"
                            class="glean-reading-context__source-btn"
                            disabled={measuring}
                            title={t(i18n, "clip.bodyCheckHint")}
                            aria-label={t(i18n, "clip.bodyCheckHint")}
                            aria-busy={measuring}
                            onclick={checkBody}
                        ><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanSearch" /></svg><span>{t(i18n, "clip.bodyCheck")}</span></button>
                    {/if}
                    <button
                        type="button"
                        class="glean-reading-context__source-btn"
                        title={t(i18n, "reading.syncMetaCalloutHint")}
                        disabled={syncingCallout || busy}
                        onclick={() => void handleSyncMetaCallout()}
                    >
                        <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanPin" /></svg>
                        <span>{syncingCallout ? t(i18n, "reading.syncingMetaCallout") : t(i18n, "reading.syncMetaCallout")}</span>
                    </button>
                    <button type="button" class="glean-reading-context__source-btn" onclick={() => openFormattingDialog(facade, context!.id)}>
                        <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanEdit" /></svg>
                        <span>{t(i18n, "formatting.open")}</span>
                    </button>
                    <button
                        type="button"
                        class="glean-reading-context__source-btn"
                        disabled={recordingDailyNote || busy}
                        title={t(i18n, "dailyNote.recordAction")}
                        onclick={() => void handleRecordDailyNote()}
                    >
                        <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanNews" /></svg>
                        <span>{recordingDailyNote ? t(i18n, "dailyNote.recording") : t(i18n, "dailyNote.recordAction")}</span>
                    </button>
                </div>
            </details>
            <button
                type="button"
                class="glean-reading-context__source-btn glean-reading-context__pill-toggle"
                title={t(i18n, pillMode ? "reading.pillExpand" : "reading.pillCollapse")}
                aria-label={t(i18n, pillMode ? "reading.pillExpand" : "reading.pillCollapse")}
                onclick={togglePillMode}
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanWheat" /></svg>
            </button>
        </div>
    </aside>
{/if}

{#if facade.isMobile && context}
    <MobileReadingBar
        {facade}
        docId={context.id}
        status={context.status}
        disabled={busy}
        onSetStatus={setStatus}
        onArchive={() => { if (context) facade.openArchiveDialog(context.id); }}
        protyleElement={rootEl?.closest(".protyle")}
    />
{/if}
