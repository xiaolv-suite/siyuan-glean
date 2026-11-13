<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "../libs/notice";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
    import { installEscapeHandler } from "../libs/modal-focus";
    import { missingSnapshotEntries, snapshotCoverage, type SnapshotCoverageEntry } from "../domain/snapshot";
    import { batchSnapshotClips, type SnapshotBatchEntry, type SnapshotBatchFailure } from "../services/snapshot-service";
    import { reconcileIndex } from "../services/clip-store";

    interface Props {
        facade: GleanFacade;
    }

    let { facade }: Props = $props();
    let rootEl = $state<HTMLElement | null>(null);
    const i18n = $derived(facade.i18n);
    let entries = $state<SnapshotCoverageEntry[]>([]);
    const coverage = $derived(snapshotCoverage(entries));
    const missing = $derived(missingSnapshotEntries(entries));
    let busy = $state(false);
    let loading = $state(false);
    let loadError = $state(false);
    let failed = $state<SnapshotBatchFailure[]>([]);
    let lastResult = $state<{ succeeded: number; failed: number } | null>(null);

    onMount(() => { void refresh(); });

    async function refresh(): Promise<void> {
        if (busy || loading && !loadError) return;
        loading = true;
        loadError = false;
        try {
            const index = await reconcileIndex(facade.pluginInstance, facade.settings);
            entries = Object.values(index.clips)
                .filter((entry) => !entry.internal && Boolean(entry.status))
                .map(({ id, title, snapshot }) => ({ id, title, snapshot }));
            failed = failed.map((item) => {
                const current = index.clips[item.id];
                return current ? { ...item, title: current.title } : item;
            }).filter((item) => !index.clips[item.id]?.snapshot);
        } catch {
            loadError = true;
        } finally {
            loading = false;
        }
    }

    async function run(entriesToProcess: readonly SnapshotCoverageEntry[]): Promise<void> {
        if (busy || entriesToProcess.length === 0) return;
        busy = true;
        try {
            const result = await batchSnapshotClips(facade.pluginInstance, entriesToProcess as readonly SnapshotBatchEntry[]);
            failed = result.failed;
            lastResult = { succeeded: result.succeeded.length, failed: result.failed.length };
            const message = result.failed.length > 0
                ? t(i18n, "snapshot.batchPartial", { ok: result.succeeded.length, failed: result.failed.length })
                : t(i18n, "snapshot.batchDone", { n: result.succeeded.length });
            showMessage(result.indexSyncFailed.length ? `${message} ${t(i18n, "msg.indexSyncPendingShort")}` : message, 5000);
            facade.notifyDataChanged();
        } catch {
            showMessage(t(i18n, "snapshot.batchFailed"), 5000);
        } finally {
            busy = false;
            await refresh();
        }
    }

    function retryFailed(): void {
        void run(failed);
    }

    function handleWindowKeydown(event: KeyboardEvent): void {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape" && (busy || loading)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
    $effect(() => {
        if (!rootEl) return;
        return installEscapeHandler(rootEl, (event) => {
            if (!busy && !loading) return false;
            handleWindowKeydown(event);
            return true;
        });
    });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section class="glean-snapshot-governance" bind:this={rootEl} aria-labelledby="glean-snapshot-governance-title" aria-busy={busy || loading}>
    <header class="glean-snapshot-governance__head">
        <div>
            <h3 id="glean-snapshot-governance-title">{t(i18n, "snapshot.governanceTitle")}</h3>
            <p>{t(i18n, "snapshot.governanceDesc")}</p>
        </div>
        <strong aria-label={t(i18n, "snapshot.coverageLabel", { percent: coverage.percent })}>{loading ? "…" : `${coverage.percent}%`}</strong>
    </header>
    {#if !loading && !loadError}
        <div class="glean-snapshot-governance__meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={coverage.percent} aria-label={t(i18n, "snapshot.coverageLabel", { percent: coverage.percent })}>
            <span style={`width: ${coverage.percent}%`}></span>
        </div>
        <p class="glean-snapshot-governance__count">{t(i18n, "snapshot.coverageCount", { captured: coverage.captured, total: coverage.total, missing: coverage.missing })}</p>
    {/if}
    {#if loading}
        <p role="status">{t(i18n, "snapshot.governanceLoading")}</p>
    {:else if loadError}
        <p class="glean-snapshot-governance__error" role="alert">{t(i18n, "snapshot.governanceLoadFailed")}</p>
        <button class="glean-btn glean-btn--ghost" disabled={busy} onclick={() => void refresh()}>{t(i18n, "action.retry")}</button>
    {:else if coverage.total === 0}
        <p class="glean-snapshot-governance__empty">{t(i18n, "snapshot.governanceEmpty")}</p>
    {:else if missing.length === 0}
        <p class="glean-snapshot-governance__success" role="status">{t(i18n, "snapshot.governanceComplete")}</p>
    {:else}
        <div class="glean-snapshot-governance__actions">
            <button class="glean-btn glean-btn--pri" disabled={busy} aria-busy={busy} onclick={() => void run(missing)}>
                {busy ? t(i18n, "snapshot.batchWorking") : t(i18n, "snapshot.batchTake", { n: missing.length })}
            </button>
            {#if failed.length > 0}
                <button class="glean-btn glean-btn--ghost" disabled={busy} onclick={retryFailed}>{t(i18n, "snapshot.batchRetry", { n: failed.length })}</button>
            {/if}
        </div>
        {#if lastResult && lastResult.failed > 0}
            <p class="glean-snapshot-governance__error" role="status">{t(i18n, "snapshot.batchPartial", { ok: lastResult.succeeded, failed: lastResult.failed })}</p>
        {/if}
        <p class="glean-snapshot-governance__hint">{t(i18n, "snapshot.batchHint")}</p>
    {/if}
    <button class="glean-snapshot-governance__refresh" disabled={busy || loading} onclick={() => void refresh()}>{t(i18n, "action.refresh")}</button>
</section>

<style>
    .glean-snapshot-governance {
        padding: var(--glean-space-4);
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-lg, 16px);
        background: var(--glean-card-surface, var(--b3-theme-surface));
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    }
    .glean-snapshot-governance__head { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
    .glean-snapshot-governance h3, .glean-snapshot-governance p { margin: 0; }
    .glean-snapshot-governance__head p, .glean-snapshot-governance__hint { color: var(--b3-theme-on-surface); font-size: 12px; margin-top: 4px; }
    .glean-snapshot-governance__head strong { font-size: 20px; font-variant-numeric: tabular-nums; color: var(--glean-color-data); }
    .glean-snapshot-governance__meter { height: 6px; margin: 14px 0 8px; overflow: hidden; border-radius: var(--glean-radius-pill); background: var(--glean-inset-surface); }
    .glean-snapshot-governance__meter span { display: block; height: 100%; border-radius: var(--glean-radius-pill); background: linear-gradient(to right, color-mix(in srgb, var(--glean-color-action) 60%, transparent), var(--glean-color-action)); transition: width 180ms ease; }
    .glean-snapshot-governance__count { font-size: 13px; font-variant-numeric: tabular-nums; }
    .glean-snapshot-governance__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .glean-snapshot-governance__actions .glean-btn { border-radius: var(--glean-radius-pill); padding: var(--glean-space-1-5) var(--glean-space-3-5); }
    .glean-snapshot-governance :is(button, .glean-btn):focus-visible { outline: 2px solid var(--glean-color-action); outline-offset: 2px; }
    .glean-snapshot-governance__success { margin-top: 12px; color: var(--b3-theme-success); }
    .glean-snapshot-governance__error { margin-top: 12px; color: var(--b3-theme-error); }
    .glean-snapshot-governance__refresh { margin-top: 12px; border: 0; padding: 4px 8px; border-radius: var(--glean-radius-pill); background: transparent; color: var(--b3-theme-on-surface); cursor: pointer; font: inherit; font-size: 12px; transition: color 140ms var(--glean-ease-out); }
    .glean-snapshot-governance__refresh:hover:not(:disabled) { color: var(--glean-color-action); }
    .glean-snapshot-governance__refresh:disabled { cursor: default; opacity: .6; }
    @media (forced-colors: active) {
        .glean-snapshot-governance { border: 1px solid CanvasText; }
        .glean-snapshot-governance__meter { border: 1px solid CanvasText; }
        .glean-snapshot-governance__meter span { background: Highlight; }
    }
    @media (prefers-reduced-motion: reduce) {
        .glean-snapshot-governance__meter span { transition: var(--glean-motion-none) !important; }
    }
    @media (max-width: 560px) {
        .glean-snapshot-governance { padding: var(--glean-space-3); }
        .glean-snapshot-governance__actions .glean-btn { min-height: 44px; width: 100%; justify-content: center; }
        .glean-snapshot-governance__refresh { min-height: 44px; display: inline-flex; align-items: center; }
    }
</style>
