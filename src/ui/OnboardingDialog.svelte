<script lang="ts">
/** 首启引导向导（平静原则：三步走完，可随时跳过，不催促不羞辱）。
 * T-1719：第 3 步为只读扫描预览——只读属性并展示分类计数，逐篇确认才写入。 */
import { onDestroy, onMount } from "svelte";
import { listNotebooks, type NotebookMeta } from "../api/client";
import { t } from "../libs/i18n";
import { installEscapeHandler } from "../libs/modal-focus";
import type { GleanFacade } from "../types";
import { loadUiPrefs, saveUiPrefs, type OnboardingStep } from "../services/prefs";
import { scanPreview, type ScanPreview } from "../services/clip-store";

interface Props {
    facade: GleanFacade;
    onClose: () => void;
    registerCloseGuard?: (guard: () => boolean) => () => void;
}

let { facade, onClose, registerCloseGuard }: Props = $props();
let rootEl = $state<HTMLElement | null>(null);

const i18n = $derived(facade.i18n);
const instanceId = $props.id();
const idPrefix = `glean-onboarding-${instanceId}`;
const titleId = `${idPrefix}-title`;
const descId = `${idPrefix}-desc`;
const anchorTitleId = `${idPrefix}-anchor-title`;
const previewTitleId = `${idPrefix}-preview-title`;
const activeDocId = $derived(facade.currentDocId?.() ?? "");

let step = $state<OnboardingStep>(1);
let notebooks = $state<NotebookMeta[]>([]);
let anchorNotebooks = $state<string[]>([]);

let scanning = $state(false);
let scanFailed = $state(false);
let actionFailed = $state(false);
/** 保存设置、切换步骤和完成动作共用一把锁，避免双击产生并发写入。 */
let actionBusy = $state(false);
let preview = $state<ScanPreview | null>(null);
let completed = false;
let disposed = false;
let progressTouched = false;
let completionRequested = false;
let doneBeforeOpen = false;
let prefsLoaded = $state(false);
/** 用户已请求的目标步骤：moveTo 的 await 期间关窗时，onDestroy 保存意图步骤而非旧值 */
let requestedStep: OnboardingStep = 1;
let seedStarterArticles = $state(true);

onMount(() => {
    anchorNotebooks = [...facade.settings.anchorNotebooks];
    let active = true;
    void loadUiPrefs(facade.pluginInstance).then((prefs) => {
        if (!active || disposed || completed) return;
        // 手动重新打开引导时，从第 1 步开始浏览，绝不自动关闭
        if (prefs.onboardingDone && !progressTouched) {
            step = 1;
            prefsLoaded = true;
            return;
        }
        if (progressTouched) {
            prefsLoaded = true;
            return;
        }
        // 扫描预览是派生数据，关闭后不落盘；从第 4 步恢复时回到第 3 步重算。
        step = prefs.onboardingStep === 4 ? 3 : (prefs.onboardingStep || 1);
        prefsLoaded = true;
        if (step === 3) void runScan();
    }).catch((error) => {
        if (!active || disposed || completed) return;
        prefsLoaded = true;
        console.warn("[glean] 引导进度读取失败:", error);
        actionFailed = true;
    });
    void listNotebooks().then((items) => {
        if (active && !disposed) {
            notebooks = items;
            // 若用户尚未指定读库笔记本，默认勾选首个笔记本，防止空选
            if (anchorNotebooks.length === 0 && items.length > 0) {
                anchorNotebooks = [items[0].id];
            }
        }
    }).catch((error) => {
        if (!active || disposed || completed) return;
        console.warn("[glean] 引导笔记本读取失败:", error);
        actionFailed = true;
    });
    return () => {
        active = false;
    };
});

onDestroy(() => {
    disposed = true;
    if (completed || completionRequested || doneBeforeOpen || !prefsLoaded) return;
    // 原生弹窗右上角关闭与“稍后继续”都会走这里；只记 UI 进度，不记扫描结果。
    void saveUiPrefs(facade.pluginInstance, {
        onboardingDone: false,
        onboardingStep: requestedStep > step ? requestedStep : step,
        onboardingInterrupted: true,
    }).catch(() => undefined);
});

function toggleNotebook(id: string) {
    if (actionBusy || scanning) return;
    anchorNotebooks = anchorNotebooks.includes(id)
        ? anchorNotebooks.filter((item) => item !== id)
        : [...anchorNotebooks, id];
}

async function persist(): Promise<void> {
    // T-1709 后首启不再询问 AI：enrichMode 保持默认 manual（D-0013），能力卡引导稍后在设置开启。
    await facade.updateSettings({
        ...facade.settings,
        anchorNotebooks: [...anchorNotebooks],
    });
}

function reportActionFailure(label: string, error: unknown): void {
    console.warn(`[glean] ${label}:`, error);
    actionFailed = true;
}

async function markDone(): Promise<void> {
    await saveUiPrefs(facade.pluginInstance, {
        onboardingDone: true,
        onboardingStep: 1,
        onboardingInterrupted: false,
        onboardingHintDismissed: true,
    });
}

async function moveTo(nextStep: OnboardingStep): Promise<void> {
    if (disposed || completed || actionBusy || scanning) return;
    actionBusy = true;
    requestedStep = nextStep;
    progressTouched = true;
    try {
        await saveUiPrefs(facade.pluginInstance, {
            onboardingDone: false,
            onboardingStep: nextStep,
            onboardingInterrupted: false,
        });
        actionFailed = false;
        step = nextStep;
    } catch (error) {
        reportActionFailure("引导进度保存失败", error);
    } finally {
        actionBusy = false;
    }
}

/** T-1719：只读扫描（读属性 + 重建派生索引缓存），不写任何文章属性。 */
async function runScan(): Promise<void> {
    if (disposed || completed || scanning || actionBusy) return;
    scanning = true;
    scanFailed = false;
    preview = null;
    try {
        const nextPreview = await scanPreview(facade.pluginInstance, facade.settings);
        if (!disposed && !completed) preview = nextPreview;
    } catch (error) {
        if (!disposed && !completed) {
            console.warn("[glean] 引导扫描失败:", error);
            scanFailed = true;
        }
    } finally {
        if (!disposed) scanning = false;
    }
}

async function next(): Promise<void> {
    if (disposed || completed || actionBusy || scanning) return;
    actionBusy = true;
    try {
        await persist();
        if (disposed || completed) return;
        requestedStep = 3;
        progressTouched = true;
        await saveUiPrefs(facade.pluginInstance, {
            onboardingDone: false,
            onboardingStep: 3,
            onboardingInterrupted: false,
        });
        step = 3;
        actionFailed = false;
    } catch (error) {
        reportActionFailure("引导设置保存失败", error);
        return;
    } finally {
        actionBusy = false;
    }
    if (!actionFailed) void runScan();
}

async function moveToCapabilities(): Promise<void> {
    await moveTo(4);
}

async function finish(openImport: boolean): Promise<void> {
    if (disposed || completed || actionBusy || scanning) return;
    actionBusy = true;
    completionRequested = true;
    try {
        await persist();
        if (disposed || completed) return;
        await markDone();
        if (disposed || completed) return;
        // 自动为新笔记本预置示范精读长文
        if (seedStarterArticles && anchorNotebooks.length > 0) {
            try {
                const { createStarterArticles } = await import("../services/starter-service");
                await createStarterArticles(facade.pluginInstance, anchorNotebooks[0]);
            } catch (seedErr) {
                console.debug("[glean] 预置示范文章降级:", seedErr);
            }
        }
        actionFailed = false;
        completed = true;
        actionBusy = false;
        onClose();
        facade.notifyDataChanged();
        if (openImport) facade.openImport();
        else facade.openWorkbenchPopup();
    } catch (error) {
        completionRequested = false;
        reportActionFailure("引导完成失败", error);
    } finally {
        actionBusy = false;
    }
}

/** 有待确认候选时，完成键直达工作台逐篇确认（T-1719 的行动闭环）。 */
async function finishByConfirmingCandidates(): Promise<void> {
    if (disposed || completed || actionBusy || scanning) return;
    actionBusy = true;
    completionRequested = true;
    try {
        await persist();
        if (disposed || completed) return;
        await markDone();
        if (disposed || completed) return;
        actionFailed = false;
        completed = true;
        actionBusy = false;
        onClose();
        facade.notifyDataChanged();
        facade.openWorkbenchPopup(preview?.examples.candidates[0]?.id);
    } catch (error) {
        completionRequested = false;
        reportActionFailure("引导候选确认入口失败", error);
    } finally {
        actionBusy = false;
    }
}

async function finishWithCurrentDoc(): Promise<void> {
    if (disposed || completed || actionBusy || scanning) return;
    const docId = activeDocId;
    actionBusy = true;
    completionRequested = true;
    try {
        await persist();
        if (disposed || completed) return;
        await markDone();
        if (disposed || completed) return;
        actionFailed = false;
        completed = true;
        actionBusy = false;
        onClose();
        facade.notifyDataChanged();
        if (docId) {
            await facade.addCurrentDocToLibrary();
            facade.openReadingDocument(docId);
        } else {
            facade.openWorkbenchPopup();
        }
    } catch (error) {
        completionRequested = false;
        reportActionFailure("引导收录活动文档失败", error);
    } finally {
        actionBusy = false;
    }
}

async function skip(): Promise<void> {
    if (disposed || completed || actionBusy || scanning) return;
    actionBusy = true;
    completionRequested = true;
    try {
        await markDone();
        if (disposed || completed) return;
        actionFailed = false;
        completed = true;
        actionBusy = false;
        onClose();
        facade.notifyDataChanged();
    } catch (error) {
        completionRequested = false;
        reportActionFailure("跳过引导失败", error);
    } finally {
        actionBusy = false;
    }
}

function continueLater(): void {
    onClose();
}

function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.repeat || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
        if (actionBusy || scanning) return;
        event.preventDefault();
        event.stopPropagation();
        continueLater();
    }
}
$effect(() => registerCloseGuard?.(() => completed || (!actionBusy && !scanning)));
$effect(() => {
    if (!rootEl) return;
    return installEscapeHandler(rootEl, (event) => {
        handleWindowKeydown(event);
        return true;
    });
});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="glean-migrate glean-onboarding" bind:this={rootEl} class:glean-onboarding--scanning={scanning} aria-labelledby={titleId} aria-describedby={descId} aria-busy={scanning || actionBusy}>
    <div class="glean-dlg-head">
        <div class="glean-brand__mark glean-dlg-head__mark">
            <svg aria-hidden="true"><use href="#iconGleanWheat" /></svg>
        </div>
        <div>
            <h2 id={titleId} class="glean-dlg-head__t">{t(i18n, "onboarding.title")}</h2>
            <div id={descId} class="glean-dlg-head__sub">{t(i18n, "tagline")}</div>
        </div>
    </div>
    <div class="glean-sr-only" aria-live="polite">{t(i18n, "onboarding.stepProgress", { n: step })}</div>
    <nav class="glean-onb-progress" aria-label={t(i18n, "onboarding.stepProgress", { n: step })}>
        {#each [1, 2, 3, 4] as progressStep, index}
            <span class="glean-onb-progress__item" class:glean-onb-progress__item--done={progressStep < step} class:glean-onb-progress__item--current={progressStep === step} aria-current={progressStep === step ? "step" : undefined}>
                <span class="glean-onb-progress__dot" aria-hidden="true">
                    {#if progressStep < step}
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                    {:else}
                        {progressStep}
                    {/if}
                </span>
                <span class="glean-onb-progress__text">{t(i18n, `onboarding.step${progressStep}`)}</span>
                <span class="glean-sr-only">{t(i18n, "onboarding.stepProgress", { n: progressStep })}</span>
            </span>
            {#if index < 3}<span class="glean-onb-progress__line" class:glean-onb-progress__line--done={progressStep < step} aria-hidden="true"></span>{/if}
        {/each}
    </nav>
    {#if actionFailed}
        <div class="glean-empty glean-onb-empty glean-onb-empty--error" role="alert">{t(i18n, "msg.actionFailed")}</div>
    {/if}

    {#if !prefsLoaded}
        <div class="glean-onb-hero" role="region" aria-busy="true">
            <div class="glean-panel__loading glean-onb-loading" role="status">
                {t(i18n, "panel.loading")}
            </div>
        </div>
        <div class="glean-migrate__ops">
            <button class="glean-linkish glean-onb-pause" disabled>{t(i18n, "onboarding.continueLater")}</button>
        </div>
    {:else if step === 1}
        <div class="glean-onb-hero" role="region" aria-labelledby={`${idPrefix}-welcome-title`}>
            <div class="glean-empty__art"><svg aria-hidden="true"><use href="#iconGleanWheat" /></svg></div>
            <h3 id={`${idPrefix}-welcome-title`} class="glean-empty__title">{t(i18n, "onboarding.welcomeTitle")}</h3>
            <div class="glean-empty__hint">{t(i18n, "onboarding.welcomeBody")}</div>
            <div class="glean-onb-hero__highlights">
                <span class="glean-badge glean-onb-hero__badge"><span class="glean-dot glean-dot--live"></span>{t(i18n, "onboarding.heroBadge1")}</span>
                <span class="glean-badge glean-onb-hero__badge"><span class="glean-dot glean-dot--live"></span>{t(i18n, "onboarding.heroBadge2")}</span>
                <span class="glean-badge glean-onb-hero__badge"><span class="glean-dot glean-dot--live"></span>{t(i18n, "onboarding.heroBadge3")}</span>
            </div>
        </div>
        <div class="glean-migrate__ops">
            <button class="glean-linkish glean-onb-pause" disabled={actionBusy} onclick={continueLater}>{t(i18n, "onboarding.continueLater")}</button>
            <button class="glean-btn glean-btn--ghost" disabled={actionBusy || scanning} aria-busy={actionBusy} onclick={() => void skip()}>
                {t(i18n, "onboarding.skip")}
            </button>
            <button class="glean-btn glean-btn--pri" disabled={actionBusy || scanning} aria-busy={actionBusy} onclick={() => void moveTo(2)}>{t(i18n, "onboarding.next")}</button>
        </div>
    {:else if step === 2}
        <div id={anchorTitleId} class="glean-sect" role="heading" aria-level="3">{t(i18n, "settings.anchorNotebooks")}</div>
        <div class="glean-set-group">
            <div class="glean-nb-wrap" role="group" aria-labelledby={anchorTitleId}>
                {#each notebooks as notebook (notebook.id)}
                    <button
                        class="glean-nb"
                        title={notebook.name}
                        class:glean-nb--on={anchorNotebooks.includes(notebook.id)}
                        aria-pressed={anchorNotebooks.includes(notebook.id)}
                        disabled={actionBusy || scanning}
                        onclick={() => toggleNotebook(notebook.id)}
                    >
                        {#if anchorNotebooks.includes(notebook.id)}
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                        {/if}
                        <span>{notebook.name}</span>
                    </button>
                {/each}
                {#if notebooks.length === 0}
                    <span class="glean-onb-empty__mark" role="status">{t(i18n, "onboarding.anchorNone")}</span>
                {/if}
            </div>
            <div class="glean-empty glean-onb-empty">
                <div class="glean-empty__hint">{t(i18n, "onboarding.anchorHint")}</div>
            </div>
            <div class="glean-onb-selection" role="status" aria-live="polite">
                <strong>{t(i18n, "onboarding.anchorSelected", { n: anchorNotebooks.length })}</strong>
                {#if anchorNotebooks.length === 0}
                    <span>{t(i18n, "onboarding.anchorNone")}</span>
                {/if}
            </div>
        </div>
        <div class="glean-migrate__ops">
            <button class="glean-linkish glean-onb-pause" disabled={actionBusy} onclick={continueLater}>{t(i18n, "onboarding.continueLater")}</button>
            <button class="glean-btn glean-btn--ghost" disabled={actionBusy || scanning} onclick={() => void moveTo(1)}>{t(i18n, "onboarding.back")}</button>
            <button class="glean-btn glean-btn--pri" disabled={actionBusy || scanning} aria-busy={actionBusy} onclick={() => void next()}>{t(i18n, "onboarding.next")}</button>
        </div>
    {:else if step === 3}
        <div id={previewTitleId} class="glean-sect" role="heading" aria-level="3">{t(i18n, "onboarding.previewTitle")}</div>
        {#if scanning}
            <div class="glean-panel__loading" role="status" aria-live="polite">{t(i18n, "panel.loading")}</div>
        {:else if scanFailed}
            <div class="glean-empty glean-onb-empty glean-onb-empty--error" role="alert">
                <div class="glean-empty__hint">{t(i18n, "onboarding.scanFailed")}</div>
            </div>
            <div class="glean-migrate__ops">
                <button class="glean-linkish glean-onb-pause" disabled={actionBusy} onclick={continueLater}>{t(i18n, "onboarding.continueLater")}</button>
                <button class="glean-btn glean-btn--ghost" disabled={actionBusy || scanning} onclick={() => void moveTo(2)}>{t(i18n, "onboarding.back")}</button>
                <button class="glean-btn glean-btn--pri" disabled={actionBusy || scanning} aria-busy={scanning} onclick={() => void runScan()}>{t(i18n, "onboarding.rescan")}</button>
            </div>
        {:else if preview}
            <div class="glean-mstats" role="region" aria-labelledby={previewTitleId}>
                <div class="glean-mstat"><div class="glean-mstat__n">{preview.confirmed}</div><div class="glean-mstat__l">{t(i18n, "onboarding.previewClips")}</div></div>
                <div class="glean-mstat"><div class="glean-mstat__n">{preview.candidates}</div><div class="glean-mstat__l">{t(i18n, "onboarding.previewCandidates")}</div></div>
                <div class="glean-mstat"><div class="glean-mstat__n">{preview.candidatesMissingUrl}</div><div class="glean-mstat__l">{t(i18n, "onboarding.previewMissingUrl")}</div></div>
                <div class="glean-mstat"><div class="glean-mstat__n">{preview.ordinary}</div><div class="glean-mstat__l">{t(i18n, "onboarding.previewOrdinary")}</div></div>
            </div>
            <div class="glean-onb-preview__total">{t(i18n, "onboarding.previewTotal", { n: preview.total })}</div>
            {#if preview.total > 0}
                <div class="glean-onb-preview__examples">
                    <div class="glean-onb-preview__group">
                        <div class="glean-onb-preview__label">{t(i18n, "onboarding.previewClips")}</div>
                        {#if preview.examples.confirmed.length === 0}
                            <div class="glean-onb-preview__empty">{t(i18n, "onboarding.previewNoExamples")}</div>
                        {:else}
                            {#each preview.examples.confirmed as item (item.id)}
                                <div class="glean-onb-preview__item" title={item.hpath || item.id}>
                                    <span>{item.title || item.hpath || item.id}</span>
                                    <span class="glean-onb-preview__meta">{item.status}</span>
                                </div>
                            {/each}
                        {/if}
                    </div>
                    <div class="glean-onb-preview__group">
                        <div class="glean-onb-preview__label">{t(i18n, "onboarding.previewCandidates")}</div>
                        {#if preview.examples.candidates.length === 0}
                            <div class="glean-onb-preview__empty">{t(i18n, "onboarding.previewNoExamples")}</div>
                        {:else}
                            {#each preview.examples.candidates as item (item.id)}
                                <div class="glean-onb-preview__item" title={item.hpath || item.id}>
                                    <span>{item.title || item.hpath || item.id}</span>
                                    <span class="glean-onb-preview__meta">{item.url || t(i18n, "onboarding.previewMissingUrl")}</span>
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            {:else}
                <div class="glean-empty glean-onb-empty">
                    <div class="glean-empty__hint">{t(i18n, "onboarding.emptyNote")}</div>
                </div>
            {/if}
            <div class="glean-migrate__ops">
                <button class="glean-linkish glean-onb-pause" disabled={actionBusy} onclick={continueLater}>{t(i18n, "onboarding.continueLater")}</button>
                <button class="glean-btn glean-btn--ghost" disabled={actionBusy || scanning} onclick={() => void moveTo(2)}>{t(i18n, "onboarding.back")}</button>
                <button class="glean-btn glean-btn--ghost" disabled={actionBusy || scanning} aria-busy={scanning} onclick={() => void runScan()}>{t(i18n, "onboarding.rescan")}</button>
                <button class="glean-btn glean-btn--pri" disabled={actionBusy || scanning} aria-busy={actionBusy} onclick={() => void moveToCapabilities()}>{t(i18n, "onboarding.next")}</button>
            </div>
        {/if}
    {:else}
        <div class="glean-onb-features" role="region" aria-label={t(i18n, "onboarding.title")}>
            <div class="glean-onb-feat">
                <div class="glean-onb-feat__icon"><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanInbox" /></svg></div>
                <div class="glean-onb-feat__text">
                    <div class="glean-onb-feat__title">{t(i18n, "onboarding.feat1Title")}</div>
                    <div class="glean-onb-feat__desc">{t(i18n, "onboarding.feat1Desc")}</div>
                </div>
            </div>
            <div class="glean-onb-feat">
                <div class="glean-onb-feat__icon"><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanNews" /></svg></div>
                <div class="glean-onb-feat__text">
                    <div class="glean-onb-feat__title">{t(i18n, "onboarding.feat2Title")}</div>
                    <div class="glean-onb-feat__desc">{t(i18n, "onboarding.feat2Desc")}</div>
                </div>
            </div>
            <div class="glean-onb-feat">
                <div class="glean-onb-feat__icon"><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanSpark" /></svg></div>
                <div class="glean-onb-feat__text">
                    <div class="glean-onb-feat__title">{t(i18n, "onboarding.feat3Title")}</div>
                    <div class="glean-onb-feat__desc">{t(i18n, "onboarding.feat3Desc")}</div>
                </div>
            </div>
        </div>

        <div class="glean-onb-seed-bar">
            <label class="glean-onb-seed-label">
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={seedStarterArticles} disabled={actionBusy || scanning} />
                <span>{t(i18n, "onboarding.seedStarter")}</span>
            </label>
        </div>

        <div class="glean-empty glean-onb-empty glean-onb-empty--import">
            <div class="glean-empty__hint">
                {t(i18n, "onboarding.importLink")}
                <button class="glean-linkish" disabled={actionBusy || scanning} aria-busy={actionBusy} onclick={() => void finish(true)}>{t(i18n, "import.title")} <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowRight" /></svg></button>
            </div>
        </div>
        {#if activeDocId}
            <div class="glean-empty glean-onb-empty glean-onb-empty--activedoc" style="margin-top: 8px;">
                <div class="glean-empty__hint">
                    {t(i18n, "onboarding.captureCurrentHint")}
                </div>
            </div>
        {/if}
        <div class="glean-migrate__ops">
            <button class="glean-linkish glean-onb-pause" disabled={actionBusy} onclick={continueLater}>{t(i18n, "onboarding.continueLater")}</button>
            {#if activeDocId}
                <button class="glean-btn glean-btn--pri" disabled={actionBusy || scanning} aria-busy={actionBusy} onclick={() => void finishWithCurrentDoc()}>{t(i18n, "onboarding.captureCurrentDoc")}</button>
            {/if}
            {#if (preview?.candidates ?? 0) > 0}
                <button class="glean-btn" class:glean-btn--pri={!activeDocId} class:glean-btn--ghost={Boolean(activeDocId)} disabled={actionBusy || scanning} aria-busy={actionBusy} onclick={() => void finishByConfirmingCandidates()}>{t(i18n, "onboarding.ctaConfirm")}</button>
            {:else}
                <button class="glean-btn" class:glean-btn--pri={!activeDocId} class:glean-btn--ghost={Boolean(activeDocId)} disabled={actionBusy || scanning} aria-busy={actionBusy} onclick={() => void finish(false)}>{t(i18n, "onboarding.startExploring")}</button>
            {/if}
        </div>
    {/if}
</div>

<style>
    .glean-onb-loading {
        min-height: 120px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
</style>
