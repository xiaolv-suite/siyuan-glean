<script lang="ts">
    import { showMessage } from "siyuan";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
    import { cleanWechatArticleUrl, isWechatUrl } from "../domain/wechat";
    import type { WeReadGuideArticleInfo } from "./weread-guide-dialog";

    interface Props {
        facade: GleanFacade;
        article: WeReadGuideArticleInfo;
        onClose?: () => void;
    }

    let { facade, article, onClose }: Props = $props();

    const i18n = $derived(facade.i18n);
    const cleanUrl = $derived(article.url && isWechatUrl(article.url) ? cleanWechatArticleUrl(article.url) : (article.url || ""));
    let copied = $state(false);

    async function copyLink(): Promise<void> {
        if (!cleanUrl) return;
        try {
            await navigator.clipboard.writeText(cleanUrl);
            copied = true;
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                try { navigator.vibrate?.(15); } catch { /* noop */ }
            }
            showMessage(t(i18n, "wechat.copiedLink"), 2500);
            setTimeout(() => { copied = false; }, 3000);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    function openShelf(): void {
        window.open("https://weread.qq.com/web/shelf", "_blank", "noopener,noreferrer");
    }

    function openLocalReader(): void {
        onClose?.();
        if (article.id) {
            (facade.openReader ?? facade.openReadingDocument).call(facade, article.id);
        }
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.repeat) return;
        const target = e.target instanceof Element ? e.target : null;
        if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose?.();
        } else if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            void copyLink();
        } else if (e.key === "Enter") {
            if (target?.closest("button, a[href], summary, [role='button']")) return;
            e.preventDefault();
            openShelf();
        } else if ((e.key === "r" || e.key === "R" || e.key === "o" || e.key === "O") && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            openLocalReader();
        }
    }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="glean-weread-guide">
    <div class="glean-weread-guide__head">
        <div class="glean-weread-guide__title">{article.title || t(i18n, "panel.untitled")}</div>
        <p class="glean-weread-guide__desc">{t(i18n, "wechat.wereadGuideDesc")}</p>
    </div>

    <div class="glean-weread-steps">
        <div class="glean-weread-step">
            <div class="glean-weread-step__badge">1</div>
            <div class="glean-weread-step__body">
                <div class="glean-weread-step__title">{t(i18n, "wechat.step1Title")}</div>
                <div class="glean-weread-step__desc">{t(i18n, "wechat.step1Desc")}</div>
                {#if cleanUrl}
                    <div class="glean-weread-url-box">
                        <span class="glean-weread-url-text" title={cleanUrl}>{cleanUrl}</span>
                        <button type="button" class="glean-btn glean-btn--ghost glean-btn--xs" onclick={copyLink}>
                            {#if copied}
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                                <span>{t(i18n, "wechat.copiedLink")}</span>
                            {:else}
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                <span>{t(i18n, "wechat.copyCleanLink")}</span>
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>
        </div>

        <div class="glean-weread-step">
            <div class="glean-weread-step__badge">2</div>
            <div class="glean-weread-step__body">
                <div class="glean-weread-step__title">{t(i18n, "wechat.step2Title")}</div>
                <div class="glean-weread-step__desc">{article.author ? t(i18n, "wechat.step2DescAuthor", { author: article.author }) : t(i18n, "wechat.step2Desc")}</div>
            </div>
        </div>

        <div class="glean-weread-step">
            <div class="glean-weread-step__badge">3</div>
            <div class="glean-weread-step__body">
                <div class="glean-weread-step__title">{t(i18n, "wechat.step3Title")}</div>
                <div class="glean-weread-step__desc">{t(i18n, "wechat.step3Desc")}</div>
                <div class="glean-weread-step__actions">
                    <button type="button" class="glean-btn glean-btn--pri glean-weread-shelf-btn" onclick={openShelf}>
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanExternal" /></svg>
                        <span>{t(i18n, "wechat.openWereadShelf")}</span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div class="glean-weread-local-card">
        <div class="glean-weread-local-card__head">
            <span class="glean-weread-local-card__icon" aria-hidden="true">
                <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
            </span>
            <div class="glean-weread-local-card__info">
                <strong>{t(i18n, "wechat.localReaderOption")}</strong>
                <p>{t(i18n, "wechat.localReaderDesc")}</p>
            </div>
        </div>
        <button type="button" class="glean-btn glean-btn--ghost glean-weread-local-btn" onclick={openLocalReader}>
            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanLocal" /></svg>
            <span>{t(i18n, "wechat.openLocalReader")}</span>
        </button>
    </div>

    <div class="glean-kbdhint glean-weread-guide__kbdhint">
        <span class="glean-kbdhint__keys" aria-hidden="true">
            <kbd>C</kbd> {t(i18n, "wechat.copyCleanLink")}
            <kbd>Enter</kbd> {t(i18n, "wechat.openWereadShelf")}
            <kbd>R</kbd> {t(i18n, "wechat.openLocalReader")}
            <kbd>Esc</kbd> {t(i18n, "action.close")}
        </span>
    </div>
</div>

<style>
    .glean-weread-guide__kbdhint {
        margin-top: var(--glean-space-3);
        justify-content: center;
    }
</style>
