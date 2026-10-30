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
    }

    let {
        i18n, selectedCount, hiddenCount, displayedCount, displayedSelectedCount, busy = false,
        onApply, onOpenAi, onClear, onSelectDisplayed, onKeepFiltered, onAddTag, onSetAuthor,
        onPurifyWechat, onCopyBlockRefs, onCopyCitations, onCopyBibTeX, onCopyAPA, onCopyMLA, onCopySummaryList, onExportCsv, onBatchFavorite,
        onBatchPriority, onBatchRating, allSelectedAreFavorite = false, hasWechatSelected = false,
    }: Props = $props();
    const filteredSelectedCount = $derived(Math.max(0, selectedCount - hiddenCount));
    let summaryEl = $state<HTMLElement | null>(null);
    let barEl = $state<HTMLElement | null>(null);

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
                onClear();
            }
        }
    }

    function triggerAddTag(): void {
        const tag = window.prompt(t(i18n, "library.tagPrompt"));
        if (tag && tag.trim() && onAddTag) {
            void onAddTag(tag.trim().replace(/^#/, ""));
        }
    }

    function triggerSetAuthor(): void {
        const author = window.prompt(t(i18n, "library.authorPrompt"));
        if (author && author.trim() && onSetAuthor) {
            void onSetAuthor(author.trim());
        }
    }

    function triggerSetPriority(): void {
        const input = window.prompt(t(i18n, "library.batchPriorityPrompt"));
        if (input !== null) {
            const num = parseInt(input.trim(), 10);
            if (!Number.isNaN(num) && num >= 0 && num <= 5 && onBatchPriority) {
                void onBatchPriority(num);
            } else {
                showMessage(t(i18n, "library.batchRangeError"), 2500);
            }
        }
    }

    function triggerSetRating(): void {
        const input = window.prompt(t(i18n, "library.batchRatingPrompt"));
        if (input !== null) {
            const num = parseInt(input.trim(), 10);
            if (!Number.isNaN(num) && num >= 0 && num <= 5 && onBatchRating) {
                void onBatchRating(num);
            } else {
                showMessage(t(i18n, "library.batchRangeError"), 2500);
            }
        }
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
                <button type="button" class="glean-bb glean-bb--priority" disabled={busy} onclick={triggerSetPriority} title={t(i18n, "library.batchSetPriority")}>⚡ {t(i18n, "library.batchSetPriority")}</button>
            {/if}
            {#if onBatchRating}
                <button type="button" class="glean-bb glean-bb--rating" disabled={busy} onclick={triggerSetRating} title={t(i18n, "library.batchSetRating")}>⭐ {t(i18n, "library.batchSetRating")}</button>
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
    </footer>
{/if}
