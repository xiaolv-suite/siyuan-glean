<script lang="ts">
    import { showMessage } from "siyuan";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
    import { pickRoamingArticle, type RoamingPick } from "../domain/roaming";
    import { loadIndex } from "../services/index-store";
    import { displayWechatAuthor, isWechatUrl } from "../domain/wechat";

    interface Props {
        facade: GleanFacade;
        initialPick: RoamingPick;
        onOpenArticle: (id: string) => void;
        onClose?: () => void;
    }

    let { facade, initialPick, onOpenArticle, onClose }: Props = $props();

    const i18n = $derived(facade.i18n);
    let overridePick = $state<RoamingPick | null>(null);
    let excludedIds = $state<Set<string>>(new Set());
    const currentPick = $derived(overridePick ?? initialPick);
    let loading = $state(false);

    const safeAuthor = $derived(displayWechatAuthor(currentPick.item.author));
    const isWechat = $derived(isWechatUrl(currentPick.item.url) || isWechatUrl(currentPick.item.site));

    async function nextPick(): Promise<void> {
        loading = true;
        try {
            excludedIds.add(currentPick.item.id);
            const index = await loadIndex(facade.pluginInstance);
            const candidates = Object.values(index.clips);
            const next = pickRoamingArticle(candidates, excludedIds);
            if (next) {
                overridePick = next;
                excludedIds.add(next.item.id);
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { navigator.vibrate?.(12); } catch { /* noop */ }
                }
            } else {
                showMessage(t(i18n, "roaming.emptyPool"), 2500);
            }
        } catch (error) {
            console.warn("[glean] 漫游换篇异常:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    function startRead(): void {
        onClose?.();
        onOpenArticle(currentPick.item.id);
    }
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape") onClose?.(); }} />

<div class="glean-roaming-dialog">
    <div class="glean-roaming-banner">
        <div class="glean-roaming-badge">
            <span class="glean-roaming-icon" aria-hidden="true">🎲</span>
            <span>{currentPick.reason}</span>
        </div>
        <div class="glean-roaming-score" title="综合匹配得分">
            🔥 {currentPick.score}分
        </div>
    </div>

    <article class="glean-roaming-card">
        <h3 class="glean-roaming-title">{currentPick.item.title || t(i18n, "panel.untitled")}</h3>
        <div class="glean-roaming-meta">
            {#if isWechat}
                <span class="glean-badge glean-source-wechat">
                    <span class="glean-wechat-dot" aria-hidden="true"></span>
                    微信{#if safeAuthor} · {safeAuthor}{/if}
                </span>
            {:else if currentPick.item.site}
                <span class="glean-badge">{currentPick.item.site}</span>
            {/if}
            {#if (currentPick.item.minutes ?? 0) > 0}
                <span class="glean-tier-badge">⏱️ 约 {currentPick.item.minutes} 分钟</span>
            {/if}
            {#if (currentPick.item.priority ?? 0) >= 4}
                <span class="glean-tier-badge">⭐ P{currentPick.item.priority}</span>
            {/if}
            {#if (currentPick.item.rating ?? 0) > 0}
                <span class="glean-tier-badge">💖 {currentPick.item.rating}★</span>
            {/if}
        </div>
    </article>

    <div class="glean-roaming-actions">
        <button type="button" class="glean-btn glean-btn--ghost glean-roaming-next-btn" disabled={loading} onclick={() => void nextPick()}>
            🎲 {t(i18n, "roaming.nextBlindBox")}
        </button>
        <button type="button" class="glean-btn glean-btn--pri glean-roaming-read-btn" onclick={startRead}>
            🎯 {t(i18n, "roaming.startReadNow")}
        </button>
    </div>
</div>

<style>
    .glean-roaming-dialog {
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-3);
        padding: var(--glean-space-3) var(--glean-space-4);
        box-sizing: border-box;
    }
    .glean-roaming-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--glean-space-2);
        padding-bottom: var(--glean-space-2);
        border-bottom: 1px solid var(--glean-border-soft);
    }
    .glean-roaming-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--glean-text-xs-plus);
        font-weight: 600;
        color: var(--lv-brand);
    }
    .glean-roaming-score {
        font-size: 13px;
        font-weight: 700;
        color: var(--lv-accent-wheat, #F59E0B);
        background: color-mix(in srgb, var(--lv-accent-wheat, #F59E0B) 12%, var(--b3-theme-surface));
        padding: 2px 8px;
        border-radius: var(--glean-radius-pill);
    }
    .glean-roaming-card {
        background: var(--glean-section-surface, var(--b3-theme-surface));
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-md);
        padding: var(--glean-space-3-5);
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-2-5);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
    }
    .glean-roaming-title {
        margin: 0;
        font-size: var(--glean-text-base);
        font-weight: 650;
        color: var(--b3-theme-on-background);
        line-height: 1.45;
    }
    .glean-roaming-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--glean-space-1-5);
    }
    .glean-roaming-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--glean-space-2);
        padding-top: var(--glean-space-1);
    }
    .glean-roaming-read-btn {
        min-width: 140px;
        box-shadow: 0 2px 8px color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
    }
</style>
