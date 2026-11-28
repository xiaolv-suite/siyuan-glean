<script lang="ts">
    /**
     * 已移出拾遗库的原文档列表：
     * 让用户随时安心找回曾移出拾遗库的文档，支持一键「重新入库」无损恢复进度与摘录，或「打开原文档」。
     */
    import { onMount } from "svelte";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
    import { showMessage } from "../libs/notice";
    import { installEscapeHandler } from "../libs/modal-focus";
    import { captureDocument, listUnregisteredDocs, type UnregisteredDocEntry } from "../services/clip-store";

    interface Props {
        facade: GleanFacade;
        onClose: () => void;
        registerCloseGuard?: (guard: () => boolean) => () => void;
    }

    let { facade, onClose, registerCloseGuard }: Props = $props();
    let rootEl = $state<HTMLElement | null>(null);
    const i18n = $derived(facade.i18n);

    let loading = $state(true);
    let loadError = $state(false);
    let items = $state<UnregisteredDocEntry[]>([]);
    let busyId = $state("");

    async function loadList(): Promise<void> {
        loading = true;
        loadError = false;
        try {
            items = await listUnregisteredDocs();
        } catch (error) {
            console.warn("[glean] 读取已移出文档失败:", error);
            loadError = true;
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        void loadList();
    });

    async function readdDoc(entry: UnregisteredDocEntry): Promise<void> {
        if (busyId) return;
        busyId = entry.id;
        try {
            const result = await captureDocument(facade.pluginInstance, entry.id, { allowDuplicate: true });
            if (result.captured || result.attrs.status) {
                items = items.filter((item) => item.id !== entry.id);
                facade.notifyDataChanged();
                showMessage(
                    t(i18n, result.indexSyncFailed ? "msg.statusIndexPending" : "unregister.readdDone"),
                    result.indexSyncFailed ? 4000 : 3000,
                );
            } else {
                showMessage(t(i18n, "msg.actionFailed"), 3000);
            }
        } catch (error) {
            console.warn("[glean] 重新入库失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 3000);
        } finally {
            busyId = "";
        }
    }

    function openOriginal(entry: UnregisteredDocEntry): void {
        facade.openReadingDocument(entry.id);
        onClose();
    }

    function handleWindowKeydown(e: KeyboardEvent): void {
        if (e.isComposing || e.keyCode === 229 || e.repeat) return;
        if (e.key === "Escape" && !busyId) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    }

    $effect(() => registerCloseGuard?.(() => !busyId));
    $effect(() => {
        if (!rootEl) return;
        return installEscapeHandler(rootEl, (event) => {
            if (busyId) return true;
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return true;
        });
    });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="glean-unregistered-list" bind:this={rootEl} aria-busy={loading || Boolean(busyId)}>
    <div class="glean-unregistered-list__head">
        <p class="glean-unregistered-list__hint">{t(i18n, "unregister.listHint")}</p>
        <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" disabled={loading || Boolean(busyId)} onclick={() => void loadList()}>
            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanRefresh" /></svg>
            <span>{t(i18n, "action.refresh")}</span>
        </button>
    </div>

    {#if loading}
        <div class="glean-unregistered-list__state" role="status" aria-live="polite">{t(i18n, "panel.loading")}</div>
    {:else if loadError}
        <div class="glean-load-error" role="alert">
            <span>{t(i18n, "msg.actionFailed")}</span>
            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void loadList()}>{t(i18n, "action.retry")}</button>
        </div>
    {:else if items.length === 0}
        <div class="glean-unregistered-list__empty" role="status">
            <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanWheat" /></svg>
            <span>{t(i18n, "unregister.empty")}</span>
        </div>
    {:else}
        <ul class="glean-unregistered-list__items">
            {#each items as entry (entry.id)}
                <li class="glean-unregistered-list__row">
                    <div class="glean-unregistered-list__info">
                        <div class="glean-unregistered-list__title" title={entry.title || t(i18n, "panel.untitled")}>
                            {entry.title || t(i18n, "panel.untitled")}
                        </div>
                        <div class="glean-unregistered-list__meta">
                            <span title={entry.hpath}>{entry.hpath}</span>
                            {#if entry.site}<span>· {entry.site}</span>{/if}
                            {#if entry.hasReadingProgress}
                                <span class="glean-unregistered-list__badge">{t(i18n, "unregister.progressBadge")}</span>
                            {/if}
                        </div>
                    </div>
                    <div class="glean-unregistered-list__ops">
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-btn--sm"
                            disabled={Boolean(busyId)}
                            onclick={() => openOriginal(entry)}
                        >{t(i18n, "unregister.openOriginal")}</button>
                        <button
                            type="button"
                            class="glean-btn glean-btn--pri glean-btn--sm"
                            disabled={Boolean(busyId)}
                            aria-busy={busyId === entry.id}
                            onclick={() => void readdDoc(entry)}
                        >{busyId === entry.id ? t(i18n, "panel.loading") : t(i18n, "unregister.readd")}</button>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .glean-unregistered-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        box-sizing: border-box;
        color: var(--glean-ink);
    }

    .glean-unregistered-list__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
    }

    .glean-unregistered-list__hint {
        margin: 0;
        font-size: var(--glean-text-xs, 12px);
        line-height: 1.5;
        color: var(--glean-ink-2);
    }

    .glean-unregistered-list__state,
    .glean-unregistered-list__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 28px 16px;
        border: 1px dashed var(--glean-border-soft);
        border-radius: var(--glean-radius-md, 12px);
        color: var(--glean-ink-2);
        font-size: var(--glean-text-sm, 14px);
    }

    .glean-unregistered-list__items {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 56vh;
        overflow-y: auto;
    }

    .glean-unregistered-list__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-md, 12px);
        background: var(--glean-card-surface);
    }

    .glean-unregistered-list__info {
        min-width: 0;
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .glean-unregistered-list__title {
        font-size: var(--glean-text-sm, 14px);
        font-weight: 600;
        color: var(--glean-ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .glean-unregistered-list__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        font-size: var(--glean-text-xs, 12px);
        color: var(--glean-ink-2);
        overflow-wrap: anywhere;
    }

    .glean-unregistered-list__badge {
        display: inline-flex;
        align-items: center;
        padding: 1px 8px;
        border-radius: var(--glean-radius-pill, 999px);
        background: color-mix(in srgb, var(--glean-color-action) 12%, var(--glean-card-surface));
        color: var(--glean-color-action);
        font-size: 11px;
    }

    .glean-unregistered-list__ops {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex-shrink: 0;
    }

    @media (max-width: 560px) {
        .glean-unregistered-list {
            padding: 12px;
        }

        .glean-unregistered-list__row {
            flex-direction: column;
            align-items: stretch;
        }

        .glean-unregistered-list__ops {
            width: 100%;
        }

        .glean-unregistered-list__ops .glean-btn {
            flex: 1 1 120px;
            min-height: 44px;
        }
    }

    @media (forced-colors: active) {
        .glean-unregistered-list__row,
        .glean-unregistered-list__empty {
            border: 1px solid CanvasText;
        }
    }
</style>
