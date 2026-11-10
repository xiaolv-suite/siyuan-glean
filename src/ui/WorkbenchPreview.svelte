<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { openTab, showMessage } from "siyuan";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
    import { createLatestRequestGate } from "../libs/latest-request";
    import type { ClipAttrs, ClipStatus } from "../domain/schema";
    import { normalizeUrl } from "../domain/url";
    import type { ClipIndexEntry, CandidateEntry } from "../services/index-store";
    import { loadIndex } from "../services/index-store";
    import { readClip, writeClip } from "../services/clip-store";
    import { autoEnrich } from "../services/enrich-service";
    import { recordReadingDone } from "../services/checkin-bridge";
    import { excerptFromSelection, selectionBelongsToHost, type ExcerptSelection } from "../services/excerpt-service";
    import { confirmPreviewCandidate, excludePreviewCandidate, PreviewActionError, quotePreviewExcerpt, savePreviewCandidateUrl, setPreviewStatus, type PreviewWriteResult } from "../services/workbench-preview";
    import ProtyleHost from "./ProtyleHost.svelte";
    import AuthorEditor from "./AuthorEditor.svelte";
    import ActionPopover from "./ActionPopover.svelte";
    import { exportArticleMarkdown } from "../services/library-export-service";
    import { formatBibTeX, formatCitation, citationSuccessKey, type CitationFormat } from "../domain/citation";
    import { pickRoamingArticle } from "../domain/roaming";
    import { openRoamingDialog } from "./roaming-dialog";
    import { isWechatUrl, displayWechatAuthor } from "../domain/wechat";
    import { openWeReadGuideDialog } from "./weread-guide-dialog";
    import { scanAndFillWechatAuthor } from "../services/wechat-service";
    import { notifyClipSuccess, lvActivity } from "../libs/notice";
    import { snapshotClip } from "../services/snapshot-service";
    import { openQuoteCardDialog } from "./quote-card-dialog";

    type PreviewItem = ({ kind: "clip" } & ClipIndexEntry) | ({ kind: "candidate" } & CandidateEntry);
    interface Props {
        facade: GleanFacade;
        entry: PreviewItem;
        onClose: () => void;
        onProcessed: () => Promise<void>;
        onRefresh: () => Promise<void>;
        onFilterAuthor?: (author: string) => void;
        widen?: boolean;
        onToggleWiden?: () => void;
    }
    let { facade, entry, onClose, onProcessed, onRefresh, onFilterAuthor, widen = false, onToggleWiden }: Props = $props();
    const instanceId = $props.id();
    const titleId = `glean-preview-title-${instanceId}`;
    const metaId = `glean-preview-meta-${instanceId}`;
    const i18n = $derived(facade.i18n);
    let host = $state<HTMLDivElement | null>(null);
    let attrs = $state<ClipAttrs | null>(null);
    let loadFailed = $state(false);
    let busy = $state(false);
    let exporting = $state(false);
    let editingUrl = $state(false);
    let urlDraft = $state("");
    let expectedUrl = "";
    let excerpt = $state<ExcerptSelection | null>(null);
    let wechatAvatar = $state<string | null>(null);
    let mounted = false;
    const requests = createLatestRequestGate();
    const candidate = $derived(entry.kind === "candidate" && attrs && !attrs.status && !attrs.internal && !attrs.excluded);
    const confirmed = $derived(entry.kind === "clip" && attrs?.status && !attrs.internal);
    const sourceUrl = $derived(attrs?.url || entry.url);
    const safeAuthor = $derived(displayWechatAuthor(attrs?.author || entry.author));

    function previewSourceLabel(): string {
        if (isWechatUrl(sourceUrl) || isWechatUrl(entry.site)) {
            return safeAuthor ? `微信 · ${safeAuthor}` : "微信公众号原文";
        }
        if (entry.site) return entry.site;
        try {
            const u = new URL(sourceUrl);
            return u.hostname;
        } catch {
            return t(i18n, "clip.openSource");
        }
    }
    // 预览里的状态动作应覆盖读库五态，避免“阅读中”的文章只能回到收件箱/稍后。
    // 与 ClipStatusActions、LibraryBatchBar 保持同一套状态入口。
    const statuses: ClipStatus[] = ["inbox", "later", "reading", "done", "archived"];

    async function load(): Promise<void> {
        const id = entry.id;
        const isCurrent = requests.begin();
        try {
            const next = await readClip(id);
            if (!mounted || !isCurrent() || entry.id !== id) return;
            attrs = next;
            loadFailed = false;

            // 微信公众号作者自动强行识别（强需求，无需用户同意）
            const isWechat = isWechatUrl(next.url || entry.url) || isWechatUrl(next.site || entry.site);
            if (isWechat && (!next.author || !next.author.trim())) {
                void autoDetectWechatAuthor(id, isCurrent);
            }
        } catch {
            if (mounted && isCurrent() && entry.id === id) { attrs = null; loadFailed = true; }
        }
    }

    async function autoDetectWechatAuthor(id: string, isCurrent: () => boolean): Promise<void> {
        try {
            let domSnippet = "";
            if (host) {
                const jsName = host.querySelector("#js_name");
                if (jsName?.textContent?.trim()) domSnippet = jsName.textContent.trim();
                const avatarImg = host.querySelector<HTMLImageElement>('img.radius_avatar, img.profile_avatar, img[data-src*="avatar"], img[src*="avatar"]');
                if (avatarImg) {
                    wechatAvatar = avatarImg.src || avatarImg.getAttribute("data-src") || null;
                }
                if (!domSnippet) {
                    const nickname = host.querySelector(".profile_nickname, .profile_meta_value");
                    if (nickname?.textContent?.trim()) domSnippet = nickname.textContent.trim();
                }
                if (!domSnippet) {
                    domSnippet = host.innerText?.slice(0, 2500) || "";
                }
            }
            const detected = await scanAndFillWechatAuthor(facade.pluginInstance, id, {
                url: attrs?.url || entry.url,
                site: attrs?.site || entry.site,
                domText: domSnippet,
            });
            if (detected && mounted && isCurrent() && entry.id === id) {
                if (attrs) attrs.author = detected;
                facade.notifyDataChanged();
                await onRefresh();
            }
        } catch (error) {
            console.debug("[LvGlean] 预览区自动识别微信公众号失败:", error);
        }
    }

    onMount(() => {
        mounted = true;
        void load();
        const onSelect = () => {
            const selection = window.getSelection();
            excerpt = selectionBelongsToHost(host, selection) ? excerptFromSelection(host, selection) : null;
        };
        const onData = () => { void load(); };
        document.addEventListener("selectionchange", onSelect);
        document.addEventListener("glean:data-changed", onData);
        return () => {
            mounted = false;
            requests.invalidate();
            document.removeEventListener("selectionchange", onSelect);
            document.removeEventListener("glean:data-changed", onData);
        };
    });

    function fail(error: unknown): void {
        const key = error instanceof PreviewActionError
            ? ({ changed: "preview.changed", invalidUrl: "msg.candidateInvalidUrl", conflict: "inbox.duplicate", failed: "reader.actionFailed" } as const)[error.reason]
            : "reader.actionFailed";
        const detail = error instanceof PreviewActionError ? error.detail : "";
        showMessage(`${t(i18n, key)}${detail ? `: ${detail}` : ""}`, 3500);
    }

    async function process(action: () => Promise<void | PreviewWriteResult>, successKey: string, advance = true): Promise<void> {
        if (!mounted || busy) return;
        const id = entry.id;
        const isCurrent = () => mounted && entry.id === id;
        const processed = untrack(() => onProcessed);
        const refresh = untrack(() => onRefresh);
        busy = true;
        try {
            const result = await action();
            facade.notifyDataChanged();
            if (!isCurrent()) return;
            showMessage(t(i18n, result?.indexSyncFailed ? "msg.writeIndexPending" : successKey), result?.indexSyncFailed ? 4000 : 2500);
            if (advance) await processed();
            else {
                await refresh();
                if (isCurrent()) { editingUrl = false; await load(); }
            }
        } catch (error) {
            if (!isCurrent()) return;
            fail(error);
            void load();
        } finally {
            if (isCurrent()) busy = false;
        }
    }

    function statusAction(status: ClipStatus): void {
        const id = entry.id;
        const title = entry.title;
        void process(async () => {
            const result = await setPreviewStatus(facade.pluginInstance, id, status);
            if (status === "done" && facade.settings.integration.checkinEnabled && facade.settings.integration.checkinItemId) {
                void recordReadingDone(facade.settings.integration.checkinItemId, id, title);
            }
            return result;
        }, "msg.statusChanged");
    }

    function confirm(asLocal = false): void {
        const id = entry.id;
        const title = entry.title;
        const url = sourceUrl;
        void process(async () => {
            const result = await confirmPreviewCandidate(facade.pluginInstance, id, url, asLocal);
            lvActivity.record({
                source: "拾遗",
                category: "clip",
                title: `剪藏《${title || "未命名文章"}》`,
                linkBlockId: id,
            });
            notifyClipSuccess({
                docId: id,
                title,
                openAction: () => facade.openReadingDocument(id),
            });
            autoEnrich(facade.pluginInstance, id, facade.settings, () => facade.notifyDataChanged());
            return result;
        }, "msg.added");
    }

    function editUrl(): void {
        expectedUrl = attrs?.url ?? "";
        urlDraft = sourceUrl;
        editingUrl = true;
    }

    function saveUrl(): void {
        const id = entry.id;
        const expected = expectedUrl;
        const draft = urlDraft;
        void process(() => savePreviewCandidateUrl(facade.pluginInstance, id, expected, draft), "msg.urlSaved", false);
    }

    function quote(): void {
        const selected = excerpt;
        const id = entry.id;
        if (!selected?.blockId) return;
        void process(() => quotePreviewExcerpt(id, selected.blockId, selected.text), "reader.excerptDone", false);
    }

    async function copyExcerpt(): Promise<void> {
        const text = excerpt?.text;
        if (!text) return;
        try { await navigator.clipboard.writeText(text); showMessage(t(i18n, "reader.copied"), 2000); }
        catch (error) { fail(error); }
    }

    async function copyBlockRef(): Promise<void> {
        const title = entry.title || t(i18n, "panel.untitled");
        const refText = `((${entry.id} '${title}'))`;
        try {
            await navigator.clipboard.writeText(refText);
            showMessage(t(i18n, "reader.blockRefCopied"), 2500);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function copyCitation(format: CitationFormat = "gbt"): Promise<void> {
        const item = {
            id: entry.id,
            title: entry.title || t(i18n, "panel.untitled"),
            author: attrs?.author || entry.author,
            site: attrs?.site || entry.site,
            url: sourceUrl,
            time: attrs?.time || (entry.kind === "clip" ? entry.time : ""),
        };
        const text = format === "bibtex" ? formatBibTeX(item) : formatCitation(item, format);
        const msgKey = citationSuccessKey(format);
        try {
            await navigator.clipboard.writeText(text);
            showMessage(t(i18n, msgKey), 2500);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function toggleFavorite(): Promise<void> {
        if (busy || !attrs || entry.kind !== "clip") return;
        const currentFav = Boolean(attrs.favorite);
        const nextFav = !currentFav;
        attrs = { ...attrs, favorite: nextFav };
        try {
            await writeClip(facade.pluginInstance, entry.id, { favorite: nextFav }, { force: true });
            showMessage(t(i18n, nextFav ? "roaming.favoriteAdded" : "roaming.favoriteRemoved"), 2000);
            facade.notifyDataChanged();
            await onRefresh();
        } catch (error) {
            attrs = { ...attrs, favorite: currentFav };
            console.warn("[glean] 预览收藏切换失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    function handleOpenWeread(event?: MouseEvent): void {
        event?.preventDefault();
        openWeReadGuideDialog(facade, {
            id: entry.id,
            title: entry.title,
            url: sourceUrl,
            author: safeAuthor,
        });
    }

    async function downloadMarkdown(): Promise<void> {
        if (exporting || entry.kind !== "clip") return;
        exporting = true;
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
            exporting = false;
        }
    }

    async function triggerRoaming(): Promise<void> {
        try {
            const index = await loadIndex(facade.pluginInstance);
            const candidates = Object.values(index.clips);
            const pick = pickRoamingArticle(candidates, [entry.id]);
            if (pick) {
                openRoamingDialog(facade, pick, (id, readPoint) => {
                    facade.openReadingDocument(id, readPoint);
                });
            } else {
                showMessage(t(i18n, "roaming.emptyPool"), 2500);
            }
        } catch (error) {
            console.warn("[glean] 预览漫游异常:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function copySelectedBlockRef(): Promise<void> {
        if (!excerpt?.blockId) return;
        const snippet = excerpt.text.trim().slice(0, 30);
        const refText = `((${excerpt.blockId} '${snippet}'))`;
        try {
            await navigator.clipboard.writeText(refText);
            showMessage(t(i18n, "reader.blockRefCopied"), 2000);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    }

    function makeExcerptQuoteCard(): void {
        if (!excerpt?.text) return;
        openQuoteCardDialog(facade, {
            quote: excerpt.text,
            title: entry.title,
            author: attrs?.author || (entry.kind === "clip" ? entry.author : ""),
            site: attrs?.site || (entry.kind === "clip" ? entry.site : ""),
            url: attrs?.url || (entry.kind === "clip" ? entry.url : ""),
            time: attrs?.time || (entry.kind === "clip" ? entry.time : ""),
            docId: entry.id,
            blockId: excerpt.blockId,
        });
    }

    async function openOrTakeSnapshot(): Promise<void> {
        const snapPath = attrs?.snapshot || (entry.kind === "clip" ? entry.snapshot : "");
        if (snapPath) {
            void openTab({ app: facade.pluginInstance.app, asset: { path: snapPath } });
            return;
        }
        if (busy || entry.kind !== "clip") return;
        busy = true;
        try {
            const result = await snapshotClip(facade.pluginInstance, entry.id);
            if (result?.path) {
                if (attrs) attrs = { ...attrs, snapshot: result.path };
                showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "snapshot.done"), result.indexSyncFailed ? 4000 : 3000);
                facade.notifyDataChanged();
                await onRefresh();
            } else {
                showMessage(t(i18n, "snapshot.failed"), 3000);
            }
        } catch (error) {
            console.warn("[glean] 预览区拍摄快照失败:", error);
            showMessage(t(i18n, "snapshot.failed"), 3000);
        } finally {
            busy = false;
        }
    }

    let rootEl = $state<HTMLElement | null>(null);

    function onPreviewKeyDown(event: KeyboardEvent): void {
        if (event.repeat) return;
        if (!rootEl || rootEl.getClientRects().length === 0) return;
        const evtTarget = event.target instanceof Node ? event.target : null;
        if (!rootEl.contains(evtTarget) && !rootEl.contains(document.activeElement)) return;
        const target = event.target instanceof Element ? event.target : null;
        const textEntry = Boolean(target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
        if (textEntry || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
        if (Array.from(document.querySelectorAll<HTMLElement>('dialog[open], .b3-dialog, .b3-menu, [role="dialog"], [aria-modal="true"], .glean-dialog')).some((el) => el.getClientRects().length > 0)) return;

        const lower = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (event.shiftKey && lower !== "c") return;
        if (lower === "b") {
            event.preventDefault();
            event.stopPropagation();
            void triggerRoaming();
        } else if (lower === "y") {
            event.preventDefault();
            event.stopPropagation();
            if (excerpt?.blockId) {
                void copySelectedBlockRef();
            } else {
                void copyBlockRef();
            }
        } else if (lower === "c") {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
                void copyCitation("bibtex");
            } else {
                void copyCitation("gbt");
            }
        } else if (lower === "s") {
            event.preventDefault();
            event.stopPropagation();
            void openOrTakeSnapshot();
        } else if (lower === "f") {
            event.preventDefault();
            event.stopPropagation();
            void toggleFavorite();
        } else if (lower === "r") {
            event.preventDefault();
            event.stopPropagation();
            facade.openReadingDocument(entry.id);
        } else if (lower === "o") {
            if (normalizeUrl(sourceUrl)) {
                event.preventDefault();
                event.stopPropagation();
                window.open(sourceUrl, "_blank", "noopener,noreferrer");
            }
        }
    }
</script>

<svelte:window onkeydown={onPreviewKeyDown} />

<section class="glean-preview" bind:this={rootEl} tabindex="-1" aria-labelledby={titleId} aria-describedby={metaId} aria-busy={busy}>
    <div class="glean-preview__header">
        <h2 id={titleId} title={entry.title}>{entry.title || t(i18n, "panel.untitled")}</h2>
        <div class="glean-preview__header-actions" role="group" aria-label={t(i18n, "preview.title")}>
            {#if onToggleWiden}
                <button
                    type="button"
                    class="glean-btn glean-btn--ghost glean-preview__widen-btn"
                    title={widen ? t(i18n, "preview.restoreWidth") : t(i18n, "preview.widen")}
                    aria-label={widen ? t(i18n, "preview.restoreWidth") : t(i18n, "preview.widen")}
                    onclick={() => onToggleWiden?.()}
                >
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true">
                        <use href={widen ? "#iconGleanCollapseAll" : "#iconGleanExpandAll"} />
                    </svg>
                </button>
            {/if}
            {#if entry.kind === "clip" && attrs?.status}
                <button
                    type="button"
                    class="glean-btn glean-btn--ghost glean-preview__fav-btn"
                    class:glean-preview__fav-btn--active={attrs.favorite}
                    title={attrs.favorite ? t(i18n, "roaming.favoriteRemoved") : t(i18n, "roaming.favoriteAction") + " (F)"}
                    aria-label={attrs.favorite ? t(i18n, "roaming.favoriteRemoved") : t(i18n, "roaming.favoriteAction")}
                    onclick={() => void toggleFavorite()}
                >
                    <svg class="glean-icon glean-icon--xs" class:glean-icon--fav={attrs.favorite} aria-hidden="true"><use href={attrs.favorite ? "#iconGleanHeart" : "#iconGleanHeartOutline"} /></svg>
                </button>
            {/if}
            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => facade.openReadingDocument(entry.id)}>{t(i18n, "preview.openDocument")}</button>
            <ActionPopover label={t(i18n, "library.moreActions")} compact>
                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void triggerRoaming()} title={t(i18n, "roaming.buttonHint")}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanRefresh" /></svg> <span>{t(i18n, "roaming.button")}</span></button>
                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyBlockRef()}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg> <span>{t(i18n, "action.copyBlockRef")}</span></button>
                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyCitation("gbt")} title="{t(i18n, 'citation.copyGBT')} (C)"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg> <span>GB/T</span></button>
                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyCitation("bibtex")} title="{t(i18n, 'citation.copyBibTeX')} (Shift+C)"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArchive" /></svg> <span>BibTeX</span></button>
                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyCitation("apa")} title={t(i18n, "citation.copyAPA")}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanLocal" /></svg> <span>APA</span></button>
                <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyCitation("mla")} title={t(i18n, "citation.copyMLA")}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCard" /></svg> <span>MLA</span></button>
                {#if entry.kind === "clip"}<button type="button" class="glean-btn glean-btn--ghost" disabled={busy || exporting} onclick={() => void downloadMarkdown()}>{exporting ? t(i18n, "settings.exporting") : t(i18n, "export.markdown")}</button>{/if}
                {#if entry.kind === "clip"}
                    <button
                        type="button"
                        class="glean-btn glean-btn--ghost glean-preview__snapshot-btn"
                        title={attrs?.snapshot ? t(i18n, "snapshot.open") : t(i18n, "snapshot.take") + " (S)"}
                        onclick={() => void openOrTakeSnapshot()}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCamera" /></svg> <span>{attrs?.snapshot ? t(i18n, "snapshot.open") : t(i18n, "snapshot.take")}</span>
                    </button>
                {/if}
            </ActionPopover>
            <button type="button" class="glean-btn glean-btn--ghost" onclick={onClose}>{t(i18n, "preview.close")}</button>
        </div>
    </div>
    <div id={metaId} class="glean-preview__meta glean-preview__toolbar">
        <div class="glean-preview__meta-left">
            {#if safeAuthor}
                <span class="glean-preview__author">
                    {#if onFilterAuthor}
                        <button type="button" class="glean-source-author glean-preview__author-btn" onclick={() => onFilterAuthor?.(safeAuthor)} title={safeAuthor}>
                            {safeAuthor}
                        </button>
                    {:else}
                        {safeAuthor}
                    {/if}
                </span>
            {/if}
            {#if normalizeUrl(sourceUrl)}
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" class="glean-preview__source-link" title={sourceUrl}>
                    {#if wechatAvatar}
                        <img class="glean-preview__avatar" src={wechatAvatar} alt="" referrerpolicy="no-referrer" />
                    {:else}
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanExternal" /></svg>
                    {/if}
                    <span>{previewSourceLabel()}</span>
                </a>
                <button
                    type="button"
                    class="glean-preview__source-link glean-preview__source-link--reader"
                    title={t(i18n, "reading.openInReader")}
                    onclick={() => (facade.openReader ?? facade.openReadingDocument).call(facade, entry.id)}
                >
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg> <span>{t(i18n, "reading.openInReader")}</span>
                </button>
                {#if isWechatUrl(sourceUrl)}
                    <button
                        type="button"
                        class="glean-preview__source-link glean-preview__source-link--weread"
                        title={t(i18n, "wechat.wereadGuide")}
                        onclick={handleOpenWeread}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanExternal" /></svg> <span>{t(i18n, "wechat.openInWeread")}</span>
                    </button>
                {/if}
            {:else if sourceUrl}
                <span class="glean-preview__source-link">{previewSourceLabel()}</span>
            {/if}
            {#if confirmed}
                <AuthorEditor {facade} docId={entry.id} onSaved={onRefresh} />
            {/if}
            {#if entry.kind === "candidate"}
                <div class="glean-preview__evidence" aria-label={t(i18n, "candidate.evidenceLabel")}>
                    <span class="glean-preview__evidence-chip glean-preview__evidence-chip--signal">{t(i18n, "candidate.evidenceLabel")}: {entry.evidence.map((value) => t(i18n, `candidate.evidence.${value}`)).join(" · ")}</span>
                    {#if entry.missing.filter((value) => value !== "status").length > 0}
                        <span class="glean-preview__evidence-chip glean-preview__evidence-chip--missing">{entry.missing.filter((value) => value !== "status").map((value) => t(i18n, `candidate.missing.${value}`)).join(" · ")}</span>
                    {/if}
                </div>
            {/if}
        </div>
        <div class="glean-preview__actions glean-preview__actions--compact" role="group" aria-label={t(i18n, "preview.title")} aria-busy={busy}>
            {#if loadFailed}
                <span class="glean-preview__state glean-preview__state--error" role="alert">{t(i18n, "preview.changed")}</span>
                <button type="button" class="glean-btn glean-btn--sm" onclick={() => void load()}>{t(i18n, "action.retry")}</button>
            {:else if !attrs}
                <span class="glean-preview__state glean-preview__state--loading" role="status" aria-live="polite">{t(i18n, "panel.loading")}</span>
            {:else if candidate}
                <button type="button" class="glean-btn glean-btn--sm" disabled={busy || !normalizeUrl(sourceUrl)} onclick={() => confirm()}>{t(i18n, "action.addToInbox")}</button>
                {#if !sourceUrl}<button type="button" class="glean-btn glean-btn--sm" disabled={busy} onclick={() => confirm(true)}>{t(i18n, "candidate.captureLocal")}</button>{/if}
                <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" disabled={busy} onclick={editUrl}>{t(i18n, "candidate.fixUrl")}</button>
                <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" disabled={busy} onclick={() => { const id = entry.id; void process(() => excludePreviewCandidate(facade.pluginInstance, id), "msg.candidateExcluded"); }}>{t(i18n, "candidate.exclude")}</button>
            {:else if confirmed}
                <div class="glean-preview__status-group" role="group" aria-label="状态流转">
                    {#each statuses as status}
                        <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" class:glean-btn--active={attrs.status === status} aria-pressed={attrs.status === status} disabled={busy || attrs.status === status} onclick={() => statusAction(status)}>{t(i18n, `queue.${status}`)}</button>
                    {/each}
                </div>
            {:else}
                <span class="glean-preview__state glean-preview__state--error" role="alert">{t(i18n, "preview.changed")}</span>
                <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" disabled={busy} onclick={() => void load()}>{t(i18n, "action.retry")}</button>
            {/if}
        </div>
    </div>
    {#if editingUrl && candidate}
        <div class="glean-preview__url">
            <input class="b3-text-field" type="url" bind:value={urlDraft} disabled={busy} placeholder={t(i18n, "candidate.urlPlaceholder")} aria-label={t(i18n, "candidate.urlPlaceholder")} onkeydown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveUrl(); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); editingUrl = false; } }} />
            <button type="button" class="glean-btn" disabled={busy} onclick={saveUrl}>{t(i18n, "action.save")}</button>
            <button type="button" class="glean-btn glean-btn--ghost" disabled={busy} onclick={() => editingUrl = false}>{t(i18n, "action.cancel")}</button>
        </div>
    {/if}
    <ProtyleHost app={facade.pluginInstance.app} docId={entry.id} mode="preview" {i18n} bind:host onOpenDocument={() => facade.openReadingDocument(entry.id)} />
    {#if excerpt}
        <div class="glean-preview__excerpt">
            <span title={excerpt.text}>{excerpt.text.slice(0, 100)}</span>
            <button type="button" class="glean-btn" disabled={busy || !confirmed || !excerpt.blockId} title={excerpt.blockId ? "" : t(i18n, "reader.excerptNoBlock")} onclick={quote}>{t(i18n, "reader.excerptQuote")}</button>
            <button type="button" class="glean-btn glean-btn--ghost" disabled={!excerpt.blockId} onclick={() => void copySelectedBlockRef()} title="{t(i18n, 'action.copyBlockRef')} (Y)">{t(i18n, "action.copyBlockRef")}</button>
            <button type="button" class="glean-btn glean-btn--ghost glean-preview__excerpt-quote-btn" onclick={makeExcerptQuoteCard} title={t(i18n, "quoteCard.action")}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg> <span>{t(i18n, "quoteCard.action")}</span></button>
            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void copyExcerpt()}>{t(i18n, "reader.copy")}</button>
        </div>
    {/if}
</section>

<style>
    .glean-preview__meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--glean-space-2);
        padding: var(--glean-space-1-5) var(--glean-space-3);
        font-size: var(--glean-text-xs);
        color: var(--b3-theme-on-surface);
        background: color-mix(in srgb, var(--b3-theme-surface) 95%, transparent);
        border-bottom: 1px solid var(--glean-border-soft);
    }
    .glean-preview__source-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border: none;
        border-radius: var(--glean-radius-pill);
        background: color-mix(in srgb, var(--lv-brand) 10%, var(--b3-theme-surface));
        color: var(--lv-brand);
        text-decoration: none;
        font: inherit;
        cursor: pointer;
        font-weight: var(--glean-weight-medium);
        transition: all var(--glean-duration-fast) ease;

        &:hover {
            background: color-mix(in srgb, var(--lv-brand) 18%, var(--b3-theme-surface));
            color: var(--lv-brand-hover);
        }
    }
    .glean-preview__source-link--weread {
        background: color-mix(in srgb, var(--glean-color-wechat, #059669) 12%, var(--b3-theme-surface));
        color: color-mix(in srgb, var(--glean-color-wechat, #059669) 72%, var(--b3-theme-on-background));

        &:hover {
            background: color-mix(in srgb, var(--glean-color-wechat, #059669) 20%, var(--b3-theme-surface));
            color: color-mix(in srgb, var(--glean-color-wechat, #059669) 82%, var(--b3-theme-on-background));
        }
    }
    .glean-preview__meta,
    .glean-preview__author {
        min-width: 0;
        overflow-wrap: anywhere;
        font-size: var(--glean-text-xs);
    }
</style>
