<script lang="ts">
    import { tick } from "svelte";
    import { showMessage } from "siyuan";
    import type { ClipStatus } from "../domain/schema";
    import type { I18nBundle } from "../libs/i18n";
    import { t } from "../libs/i18n";

    interface Props {
        i18n: I18nBundle;
        selectedCount: number;
        hiddenCount: number;
        displayedCount: number;
        displayedSelectedCount: number;
        busy?: boolean;
        onApply: (status: ClipStatus) => void | Promise<void>;
        onOpenAi: () => void;
        onClear: () => void;
        onSelectDisplayed: () => void;
        onKeepFiltered: (origin: Element | null) => void;
        onAddTag?: (tag: string) => void | Promise<void>;
        onSetAuthor?: (author: string) => void | Promise<void>;
        onPurifyWechat?: () => void | Promise<void>;
        onCopyBlockRefs?: () => void | Promise<void>;
        onCopyCitations?: () => void | Promise<void>;
        onCopyBibTeX?: () => void | Promise<void>;
        onCopyAPA?: () => void | Promise<void>;
        onCopyMLA?: () => void | Promise<void>;
        onCopySummaryList?: () => void | Promise<void>;
        onExportCsv?: () => void | Promise<void>;
        onBatchFavorite?: (fav: boolean) => void | Promise<void>;
        onBatchPriority?: (priority: number) => void | Promise<void>;
        onBatchRating?: (rating: number) => void | Promise<void>;
        allSelectedAreFavorite?: boolean;
        hasWechatSelected?: boolean;
        computeDiff?: (mode: "tag" | "author", text: string) => { update: number; skip: number };
    }

    let {
        i18n, selectedCount, hiddenCount, displayedCount, displayedSelectedCount, busy = false,
        onApply, onOpenAi, onClear, onSelectDisplayed, onKeepFiltered, onAddTag, onSetAuthor,
        onPurifyWechat, onCopyBlockRefs, onCopyCitations, onCopyBibTeX, onCopyAPA, onCopyMLA, onCopySummaryList, onExportCsv, onBatchFavorite,
        onBatchPriority, onBatchRating, allSelectedAreFavorite = false, hasWechatSelected = false,
        computeDiff,
    }: Props = $props();
    const filteredSelectedCount = $derived(Math.max(0, selectedCount - hiddenCount));
    let summaryEl = $state<HTMLElement | null>(null);
    let barEl = $state<HTMLElement | null>(null);
    type InlinePromptMode = "tag" | "author" | "priority" | "rating" | null;
    let inlineMode = $state<InlinePromptMode>(null);
    let inlineText = $state("");
    let inlineInputEl = $state<HTMLInputElement | null>(null);

    const inlineDiff = $derived.by(() => {
        if (!computeDiff || !inlineText.trim() || (inlineMode !== "tag" && inlineMode !== "author")) {
            return null;
        }
        return computeDiff(inlineMode, inlineText.trim());
    });

    async function keepFiltered(event: MouseEvent): Promise<void> {
        const origin = event.currentTarget as HTMLButtonElement;
        const restoreFocus = document.activeElement === origin;
        onKeepFiltered(origin);
        await tick();
        if (!restoreFocus || !summaryEl?.isConnected || selectedCount === 0) return;
        const active = document.activeElement;
        if (active === origin || (!origin.isConnected && (!active || active === document.body))) {
            summaryEl.focus({ preventScroll: true });
        }
    }

    function handleWindowKeydown(event: KeyboardEvent): void {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape" && !busy && selectedCount > 0) {
            if (barEl && document.activeElement && barEl.contains(document.activeElement)) {
                event.preventDefault();
                event.stopPropagation();
                if (inlineMode) {
                    inlineMode = null;
                    inlineText = "";
                    return;
                }
                onClear();
            }
        }
    }

    function openInlineMode(mode: Exclude<InlinePromptMode, null>): void {
        if (inlineMode === mode) {
            inlineMode = null;
            inlineText = "";
            return;
        }
        inlineMode = mode;
        inlineText = "";
        void tick().then(() => {
            inlineInputEl?.focus();
        });
    }

    function submitInlineText(): void {
        const val = inlineText.trim();
        if (!val) return;
        if (inlineMode === "tag" && onAddTag) {
            inlineMode = null;
            inlineText = "";
            void onAddTag(val.replace(/^#/, ""));
        } else if (inlineMode === "author" && onSetAuthor) {
            inlineMode = null;
            inlineText = "";
            void onSetAuthor(val);
        }
    }

    function selectInlineNumber(num: number): void {
        if (Number.isNaN(num) || num < 0 || num > 5) {
            showMessage(t(i18n, "library.batchRangeError"), 2500);
            return;
        }
        const currentMode = inlineMode;
        inlineMode = null;
        if (currentMode === "priority" && onBatchPriority) {
            void onBatchPriority(num);
        } else if (currentMode === "rating" && onBatchRating) {
            void onBatchRating(num);
        }
    }

    function triggerAddTag(): void {
        openInlineMode("tag");
    }

    function triggerSetAuthor(): void {
        openInlineMode("author");
    }

    function triggerSetPriority(): void {
        openInlineMode("priority");
    }

    function triggerSetRating(): void {
        openInlineMode("rating");
    }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if selectedCount > 0}
    <footer class="glean-batchbar" aria-busy={busy} bind:this={barEl}>
        <div class="glean-batchbar__summary" role="status" aria-live="polite" aria-atomic="true" tabindex="-1" bind:this={summaryEl}>
            <b>{t(i18n, "library.selectionSummary", { total: selectedCount, filtered: filteredSelectedCount })}</b>
            {#if hiddenCount > 0}
                <span class="glean-batchbar__hidden">{t(i18n, "library.selectionHidden", { n: hiddenCount })}</span>
            {/if}
        </div>
        <div class="glean-batchbar__scope" role="group" aria-label={t(i18n, "library.selectionScope")}>
            <button type="button" class="glean-bb" disabled={busy || displayedCount === 0 || displayedSelectedCount >= displayedCount} onclick={onSelectDisplayed}>{t(i18n, "library.selectDisplayed", { n: displayedCount })}</button>
            {#if hiddenCount > 0}
                <button type="button" class="glean-bb" disabled={busy} onclick={(event) => void keepFiltered(event)}>{t(i18n, "library.keepFiltered")}</button>
            {/if}
            <button type="button" class="glean-bb" disabled={busy} onclick={onClear}>{t(i18n, "library.clearSelection")}</button>
        </div>
        <div class="glean-batchbar__ops" role="group" aria-label={t(i18n, "library.batchActions")}>
            <button type="button" class="glean-bb" disabled={busy} onclick={() => void onApply("reading")}>{t(i18n, "status.reading")}</button>
            <button type="button" class="glean-bb" disabled={busy} onclick={() => void onApply("done")}>{t(i18n, "status.done")}</button>
            <button type="button" class="glean-bb glean-bb--pri" disabled={busy} onclick={() => void onApply("archived")}>{t(i18n, "action.batchArchive")}</button>
            {#if onAddTag}
                <button type="button" class="glean-bb" disabled={busy} onclick={triggerAddTag}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanPlus" /></svg> <span>{t(i18n, "library.batchAddTag")}</span></button>
            {/if}
            {#if onSetAuthor}
                <button type="button" class="glean-bb" disabled={busy} onclick={triggerSetAuthor}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanEdit" /></svg> <span>{t(i18n, "library.batchSetAuthor")}</span></button>
            {/if}
            {#if onBatchPriority}
                <button type="button" class="glean-bb glean-bb--priority" disabled={busy} onclick={triggerSetPriority} title={t(i18n, "library.batchSetPriority")}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanBolt" /></svg> <span>{t(i18n, "library.batchSetPriority")}</span></button>
            {/if}
            {#if onBatchRating}
                <button type="button" class="glean-bb glean-bb--rating" disabled={busy} onclick={triggerSetRating} title={t(i18n, "library.batchSetRating")}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanStar" /></svg> <span>{t(i18n, "library.batchSetRating")}</span></button>
            {/if}
            {#if onPurifyWechat && hasWechatSelected}
                <button type="button" class="glean-bb" disabled={busy} onclick={() => void onPurifyWechat?.()}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg> <span>{t(i18n, "wechat.batchPurify")}</span></button>
            {/if}
            {#if onCopyBlockRefs}
                <button type="button" class="glean-bb glean-bb--copy-refs" disabled={busy} onclick={() => void onCopyBlockRefs?.()} title="{t(i18n, 'action.copyBlockRef')}"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg> <span>{t(i18n, "action.copyBlockRef")}</span></button>
            {/if}
            {#if onCopyCitations}
                <button type="button" class="glean-bb glean-bb--copy-citations" disabled={busy} onclick={() => void onCopyCitations?.()} title="{t(i18n, 'citation.copyGBT')}"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg> <span>{t(i18n, "citation.copyGBT")}</span></button>
            {/if}
            {#if onCopyBibTeX}
                <button type="button" class="glean-bb glean-bb--copy-bibtex" disabled={busy} onclick={() => void onCopyBibTeX?.()} title="{t(i18n, 'citation.copyBibTeX')}"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArchive" /></svg> <span>{t(i18n, "citation.copyBibTeX")}</span></button>
            {/if}
            {#if onCopyAPA}
                <button type="button" class="glean-bb glean-bb--copy-apa" disabled={busy} onclick={() => void onCopyAPA?.()} title="{t(i18n, 'citation.copyAPA')}"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanLocal" /></svg> <span>{t(i18n, "citation.copyAPA")}</span></button>
            {/if}
            {#if onCopyMLA}
                <button type="button" class="glean-bb glean-bb--copy-mla" disabled={busy} onclick={() => void onCopyMLA?.()} title="{t(i18n, 'citation.copyMLA')}"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCard" /></svg> <span>{t(i18n, "citation.copyMLA")}</span></button>
            {/if}
            {#if onCopySummaryList}
                <button type="button" class="glean-bb glean-bb--copy-summary" disabled={busy} onclick={() => void onCopySummaryList?.()} title="{t(i18n, 'library.batchCopySummary')}"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg> <span>{t(i18n, "library.batchCopySummary")}</span></button>
            {/if}
            {#if onExportCsv}
                <button type="button" class="glean-bb glean-bb--csv" disabled={busy} onclick={() => void onExportCsv?.()} title="{t(i18n, 'library.batchExportCsv')}"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanDownload" /></svg> <span>{t(i18n, "library.batchExportCsv")}</span></button>
            {/if}
            {#if onBatchFavorite}
                {#if allSelectedAreFavorite}
                    <button type="button" class="glean-bb glean-bb--unfav" disabled={busy} onclick={() => void onBatchFavorite?.(false)} title="{t(i18n, 'library.batchUnfavorite')}">{t(i18n, "library.batchUnfavorite")}</button>
                {:else}
                    <button type="button" class="glean-bb glean-bb--fav" disabled={busy} onclick={() => void onBatchFavorite?.(true)} title="{t(i18n, 'library.batchFavorite')}">{t(i18n, "library.batchFavorite")}</button>
                {/if}
            {/if}
            <button type="button" class="glean-bb glean-bb--ai" disabled={busy} onclick={onOpenAi}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg> <span>{t(i18n, "aiBatch.title")}</span></button>
        </div>
        {#if inlineMode === "tag" || inlineMode === "author"}
            <form class="glean-batchbar__inline" onsubmit={(event) => { event.preventDefault(); submitInlineText(); }}>
                <input
                    type="text"
                    class="b3-text-field glean-batchbar__input"
                    bind:this={inlineInputEl}
                    bind:value={inlineText}
                    disabled={busy}
                    placeholder={t(i18n, inlineMode === "tag" ? "library.tagPrompt" : "library.authorPrompt")}
                    aria-label={t(i18n, inlineMode === "tag" ? "library.batchAddTag" : "library.batchSetAuthor")}
                />
                {#if inlineDiff && (inlineDiff.update > 0 || inlineDiff.skip > 0)}
                    <span class="glean-batchbar__diff-hint">{t(i18n, "library.batchDiffHint", { update: inlineDiff.update, skip: inlineDiff.skip })}</span>
                {/if}
                <button type="submit" class="glean-bb glean-bb--pri" disabled={busy || !inlineText.trim()}>{t(i18n, "action.save")}</button>
                <button type="button" class="glean-bb" disabled={busy} onclick={() => { inlineMode = null; inlineText = ""; }}>{t(i18n, "action.cancel")}</button>
            </form>
        {:else if inlineMode === "priority" || inlineMode === "rating"}
            <div class="glean-batchbar__inline" role="group" aria-label={t(i18n, inlineMode === "priority" ? "library.batchSetPriority" : "library.batchSetRating")}>
                {#each [0, 1, 2, 3, 4, 5] as level}
                    <button
                        type="button"
                        class="glean-bb"
                        disabled={busy}
                        onclick={() => selectInlineNumber(level)}
                    >
                        {level === 0 ? "—" : inlineMode === "priority" ? `P${level}` : `${level}★`}
                    </button>
                {/each}
                <button type="button" class="glean-bb" disabled={busy} onclick={() => { inlineMode = null; }}>{t(i18n, "action.cancel")}</button>
            </div>
        {/if}
    </footer>
{/if}
