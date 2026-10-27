<script lang="ts">
    import { tick } from "svelte";
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
        hasWechatSelected?: boolean;
    }

    let { i18n, selectedCount, hiddenCount, displayedCount, displayedSelectedCount, busy = false, onApply, onOpenAi, onClear, onSelectDisplayed, onKeepFiltered, onAddTag, onSetAuthor, onPurifyWechat, hasWechatSelected = false }: Props = $props();
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
                <button type="button" class="glean-bb" disabled={busy} onclick={triggerAddTag}>＋ {t(i18n, "library.batchAddTag")}</button>
            {/if}
            {#if onSetAuthor}
                <button type="button" class="glean-bb" disabled={busy} onclick={triggerSetAuthor}>👤 {t(i18n, "library.batchSetAuthor")}</button>
            {/if}
            {#if onPurifyWechat && hasWechatSelected}
                <button type="button" class="glean-bb" disabled={busy} onclick={() => void onPurifyWechat?.()}>✨ {t(i18n, "wechat.batchPurify")}</button>
            {/if}
            <button type="button" class="glean-bb glean-bb--ai" disabled={busy} onclick={onOpenAi}>{t(i18n, "aiBatch.title")}</button>
        </div>
    </footer>
{/if}
