<script lang="ts">
    /**
     * 安全移出拾遗库确认对话框：
     * 仅清除 custom-clip-status 并写入 custom-clip-unregistered（除非用户勾选允许再次作为候选），
     * 绝不删除或移动思源原文档，绝不篡改正文、阅读进度、高亮或已建闪卡。
     */
    import { onMount, tick } from "svelte";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
    import { showMessage } from "../libs/notice";
    import { installEscapeHandler } from "../libs/modal-focus";
    import { buildUnregisterClipInfo, unregisterClip, type UnregisterClipInfo } from "../services/clip-store";
    import { listDocHighlights } from "../services/highlights";

    interface Props {
        facade: GleanFacade;
        docId: string;
        onClose: () => void;
        registerCloseGuard?: (guard: () => boolean) => () => void;
    }

    let { facade, docId, onClose, registerCloseGuard }: Props = $props();
    let rootEl = $state<HTMLElement | null>(null);
    const i18n = $derived(facade.i18n);
    const instanceId = $props.id();
    const titleId = `glean-unregister-title-${instanceId}`;
    const descId = `glean-unregister-desc-${instanceId}`;

    let loading = $state(true);
    let loadError = $state(false);
    let pending = $state(false);
    let actionError = $state("");
    let info = $state<UnregisterClipInfo | null>(null);
    let highlightCount = $state(0);
    let allowCandidate = $state(false);
    let cancelBtn = $state<HTMLButtonElement | null>(null);

    async function loadInfo(): Promise<void> {
        loading = true;
        loadError = false;
        try {
            const [docInfo, highlights] = await Promise.all([
                buildUnregisterClipInfo(docId),
                listDocHighlights(docId).catch(() => []),
            ]);
            if (!docInfo) {
                loadError = true;
                return;
            }
            info = docInfo;
            highlightCount = highlights.length;
        } catch {
            loadError = true;
        } finally {
            loading = false;
            await tick();
            cancelBtn?.focus({ preventScroll: true });
        }
    }

    onMount(() => {
        void loadInfo();
    });

    async function confirmUnregister(): Promise<void> {
        if (pending || loading || loadError) return;
        pending = true;
        actionError = "";
        try {
            const result = await unregisterClip(facade.pluginInstance, docId, { allowCandidate });
            facade.notifyDataChanged();
            showMessage(
                t(i18n, result.indexSyncFailed ? "msg.statusIndexPending" : "unregister.done"),
                result.indexSyncFailed ? 4000 : 3000,
            );
            pending = false;
            onClose();
        } catch (error) {
            console.warn("[glean] 移出拾遗库失败:", error);
            actionError = t(i18n, "msg.actionFailed");
            showMessage(actionError, 3000);
        } finally {
            pending = false;
        }
    }

    function handleWindowKeydown(e: KeyboardEvent): void {
        if (e.isComposing || e.keyCode === 229 || e.repeat) return;
        if (e.key === "Escape" && !pending) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    }

    $effect(() => registerCloseGuard?.(() => !pending));
    $effect(() => {
        if (!rootEl) return;
        return installEscapeHandler(rootEl, (event) => {
            if (pending) return true;
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return true;
        });
    });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="glean-unregister-dlg" bind:this={rootEl} role="group" aria-labelledby={titleId} aria-describedby={descId} aria-busy={pending || loading}>
    <div class="glean-unregister-dlg__promise" id={descId}>
        <span class="glean-unregister-dlg__icon" aria-hidden="true">
            <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanArrowUp" /></svg>
        </span>
        <div>
            <h3 id={titleId} class="glean-unregister-dlg__title">{t(i18n, "unregister.title")}</h3>
            <p class="glean-unregister-dlg__text">{t(i18n, "unregister.promise")}</p>
        </div>
    </div>

    {#if loading}
        <p class="glean-unregister-dlg__status" role="status" aria-live="polite">{t(i18n, "panel.loading")}</p>
    {:else if loadError}
        <div class="glean-load-error" role="alert">
            <span>{t(i18n, "msg.actionFailed")}</span>
            <button type="button" class="glean-btn glean-btn--ghost" onclick={() => void loadInfo()}>{t(i18n, "action.retry")}</button>
        </div>
    {:else if info}
        <dl class="glean-unregister-dlg__details">
            <dt>{t(i18n, "unregister.docTitle")}</dt>
            <dd>{info.title || t(i18n, "panel.untitled")}</dd>
            <dt>{t(i18n, "unregister.docPath")}</dt>
            <dd>{info.hpath}</dd>
        </dl>

        {#if highlightCount > 0 || info.hasReadingProgress}
            <ul class="glean-unregister-dlg__notes">
                {#if highlightCount > 0}
                    <li>
                        <strong>{t(i18n, "unregister.hasHighlights", { n: highlightCount })}</strong>
                        <span>{t(i18n, "unregister.highlightsGlobalHint")}</span>
                    </li>
                {/if}
                {#if info.hasReadingProgress}
                    <li>{t(i18n, "unregister.hasProgress")}</li>
                {/if}
            </ul>
        {/if}

        <label class="glean-unregister-dlg__opt">
            <input type="checkbox" bind:checked={allowCandidate} disabled={pending} />
            <span>{t(i18n, "unregister.allowCandidate")}</span>
        </label>
    {/if}

    {#if actionError}
        <div class="glean-load-error" role="alert">{actionError}</div>
    {/if}

    <div class="glean-unregister-dlg__actions">
        <button
            type="button"
            class="glean-btn glean-btn--ghost"
            bind:this={cancelBtn}
            disabled={pending}
            onclick={onClose}
        >{t(i18n, "action.cancel")}</button>
        <button
            type="button"
            class="glean-btn glean-btn--pri"
            disabled={pending || loading || loadError}
            aria-busy={pending}
            onclick={() => void confirmUnregister()}
        >{pending ? t(i18n, "panel.loading") : t(i18n, "unregister.confirmAction")}</button>
    </div>
</div>

<style>
    .glean-unregister-dlg {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        box-sizing: border-box;
        color: var(--glean-ink);
    }

    .glean-unregister-dlg__promise {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid color-mix(in srgb, var(--glean-color-action) 28%, var(--glean-border-soft));
        border-radius: var(--glean-radius-md, 12px);
        background: color-mix(in srgb, var(--glean-color-action) 7%, var(--glean-card-surface));
    }

    .glean-unregister-dlg__icon {
        flex: 0 0 30px;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--glean-color-action) 14%, var(--glean-card-surface));
        color: var(--glean-color-action);
    }

    .glean-unregister-dlg__title {
        margin: 0 0 4px;
        font-size: var(--glean-text-sm, 14px);
        font-weight: 600;
        color: var(--glean-ink);
    }

    .glean-unregister-dlg__text {
        margin: 0;
        font-size: var(--glean-text-xs, 12px);
        line-height: 1.5;
        color: var(--glean-ink-2);
    }

    .glean-unregister-dlg__status {
        margin: 0;
        font-size: var(--glean-text-xs, 12px);
        color: var(--glean-ink-2);
    }

    .glean-unregister-dlg__details {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        gap: 6px 12px;
        margin: 0;
        padding: 10px 12px;
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-md, 12px);
        background: var(--glean-card-surface);
        font-size: var(--glean-text-xs, 12px);
        overflow-wrap: anywhere;
    }

    .glean-unregister-dlg__details dt {
        color: var(--glean-ink-2);
        opacity: 0.78;
    }

    .glean-unregister-dlg__details dd {
        margin: 0;
        min-width: 0;
        color: var(--glean-ink);
    }

    .glean-unregister-dlg__notes {
        margin: 0;
        padding: 10px 12px 10px 26px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-md, 12px);
        background: var(--glean-inset-surface, var(--glean-app-background));
        font-size: var(--glean-text-xs, 12px);
        line-height: 1.45;
        color: var(--glean-ink-2);
    }

    .glean-unregister-dlg__notes li {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .glean-unregister-dlg__notes strong {
        color: var(--glean-ink);
        font-weight: 600;
    }

    .glean-unregister-dlg__opt {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: var(--glean-text-xs, 12px);
        color: var(--glean-ink);
        cursor: pointer;
        user-select: none;
    }

    .glean-unregister-dlg__opt input {
        accent-color: var(--glean-color-action);
        flex-shrink: 0;
    }

    .glean-unregister-dlg__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
    }

    .glean-unregister-dlg__actions .glean-btn {
        border-radius: var(--glean-radius-pill, 999px);
        padding: 6px 16px;
    }

    @media (max-width: 560px) {
        .glean-unregister-dlg {
            padding: 12px;
        }

        .glean-unregister-dlg__actions > .glean-btn {
            flex: 1 1 130px;
            min-height: 44px;
        }
    }

    @media (forced-colors: active) {
        .glean-unregister-dlg__promise,
        .glean-unregister-dlg__details,
        .glean-unregister-dlg__notes {
            border: 1px solid CanvasText;
        }
    }
</style>
