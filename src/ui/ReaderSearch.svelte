<svelte:options runes={true} />
<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import { t } from "../libs/i18n";
    import { ReaderDOMSearchController } from "../libs/reader-search-dom";
    import { formatMatchCount, type ReaderSearchState } from "../domain/reader-search";

    interface Props {
        host: HTMLElement | null;
        i18n: any;
        open?: boolean;
        onClose?: () => void;
    }

    let { host, i18n, open = $bindable(false), onClose }: Props = $props();

    const controller = new ReaderDOMSearchController();
    let searchState = $state<ReaderSearchState>(controller.getState());
    let inputEl = $state<HTMLInputElement | null>(null);

    // 订阅控制器状态
    const unsubscribe = controller.subscribe((newState) => {
        searchState = newState;
    });

    export function focusInput(): void {
        tick().then(() => {
            if (inputEl) {
                inputEl.focus();
                inputEl.select();
            }
        });
    }

    export function openSearch(): void {
        open = true;
        controller.open(searchState.keyword);
        focusInput();
    }

    export function closeSearch(): void {
        controller.close();
        open = false;
        onClose?.();
    }

    export function searchNext(): void {
        if (!open) return;
        controller.next();
    }

    export function searchPrev(): void {
        if (!open) return;
        controller.prev();
    }

    function onQueryInput(event: Event): void {
        const val = (event.target as HTMLInputElement).value;
        controller.search(val);
    }

    function toggleCaseSensitive(): void {
        controller.setCaseSensitive(!searchState.caseSensitive);
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeSearch();
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
                searchPrev();
            } else {
                searchNext();
            }
        }
    }

    $effect(() => {
        controller.setRoot(host);
    });

    $effect(() => {
        if (open) {
            if (!searchState.open) {
                controller.open(searchState.keyword);
            }
            focusInput();
        } else if (searchState.open) {
            controller.close();
        }
    });

    onDestroy(() => {
        unsubscribe();
        controller.dispose();
    });
</script>

{#if open}
    <div
        class="glean-reader-search"
        role="search"
        aria-label={t(i18n, "reader.searchTitle")}
    >
        <svg class="glean-icon glean-reader-search__icon" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
        <input
            bind:this={inputEl}
            type="search"
            class="glean-mini-input glean-reader-search__input"
            value={searchState.keyword}
            placeholder={t(i18n, "reader.searchPlaceholder")}
            aria-label={t(i18n, "reader.searchTitle")}
            oninput={onQueryInput}
            onkeydown={onKeyDown}
        />
        {#if searchState.keyword}
            <button
                type="button"
                class="glean-reader-search__clear"
                title={t(i18n, "panel.searchClear")}
                aria-label={t(i18n, "panel.searchClear")}
                onclick={() => { controller.search(""); focusInput(); }}
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg>
            </button>
        {/if}
        <span
            class="glean-reader-search__count"
            class:glean-reader-search__count--empty={searchState.keyword.trim().length > 0 && searchState.totalMatches === 0}
            aria-live="polite"
        >
            {formatMatchCount(searchState.activeIndex, searchState.totalMatches).text}
        </span>
        <button
            type="button"
            class="glean-btn glean-btn--ghost glean-reader-search__btn"
            class:glean-reader-search__btn--active={searchState.caseSensitive}
            title={t(i18n, "reader.searchCaseSensitive")}
            aria-pressed={searchState.caseSensitive}
            onclick={toggleCaseSensitive}
        >
            Aa
        </button>
        <button
            type="button"
            class="glean-btn glean-btn--ghost glean-reader-search__btn"
            disabled={searchState.totalMatches === 0}
            title={t(i18n, "reader.searchPrev")}
            aria-label={t(i18n, "reader.searchPrev")}
            onclick={searchPrev}
        >
            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowUp" /></svg>
        </button>
        <button
            type="button"
            class="glean-btn glean-btn--ghost glean-reader-search__btn"
            disabled={searchState.totalMatches === 0}
            title={t(i18n, "reader.searchNext")}
            aria-label={t(i18n, "reader.searchNext")}
            onclick={searchNext}
        >
            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowDown" /></svg>
        </button>
        <button
            type="button"
            class="glean-btn glean-btn--ghost glean-reader-search__btn glean-reader-search__btn--close"
            title={t(i18n, "reader.searchClose")}
            aria-label={t(i18n, "reader.searchClose")}
            onclick={closeSearch}
        >
            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanClose" /></svg>
        </button>
    </div>
{/if}

<style>
    .glean-reader-search {
        position: absolute;
        top: 12px;
        right: 24px;
        z-index: 100;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        background: var(--glean-card-surface, var(--b3-theme-surface));
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-pill);
        box-shadow: var(--glean-shadow-float);
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        backdrop-filter: blur(12px);
    }

    .glean-reader-search__icon {
        font-size: 13px;
        opacity: 0.7;
        user-select: none;
    }

    .glean-reader-search__input {
        width: 160px;
        height: 26px;
        padding: 2px 10px;
        font-size: 12px;
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-pill);
        background: var(--glean-inset-surface, var(--b3-theme-background));
        color: var(--b3-theme-on-background);
        outline: none;
        transition: border-color 0.15s ease;
    }

    .glean-reader-search__input:focus {
        border-color: var(--glean-color-action);
    }

    .glean-reader-search__count {
        min-width: 44px;
        text-align: center;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        user-select: none;
        font-variant-numeric: tabular-nums;
        opacity: 0.8;
    }

    .glean-reader-search__count--empty {
        color: var(--b3-theme-error, #e53e3e);
        opacity: 1;
    }

    .glean-reader-search__btn {
        height: 24px;
        min-width: 24px;
        padding: 0 4px;
        font-size: 11px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--glean-radius-pill);
        cursor: pointer;
        user-select: none;
        background: transparent;
        border: 1px solid transparent;
        color: var(--b3-theme-on-surface);
    }

    .glean-reader-search__btn:hover:not(:disabled) {
        background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
    }

    .glean-reader-search__btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }

    .glean-reader-search__btn--active {
        background: color-mix(in srgb, var(--glean-color-action) 14%, var(--b3-theme-surface));
        color: var(--glean-color-action);
        font-weight: 600;
        border-color: var(--glean-color-action);
    }

    .glean-reader-search__btn--close {
        margin-left: 2px;
    }

    @media (max-width: 640px), (pointer: coarse) {
        .glean-reader-search {
            top: 8px;
            right: 8px;
            left: 8px;
            max-width: calc(100vw - 16px);
            box-sizing: border-box;
            flex-wrap: wrap;
            padding: 6px 10px;
        }

        .glean-reader-search__input {
            height: 44px;
            min-height: 44px;
            font-size: 16px;
            flex: 1 1 100px;
            width: auto;
        }

        .glean-reader-search__btn {
            height: 44px;
            min-height: 44px;
            min-width: 44px;
            padding: 0 8px;
        }
    }
</style>
