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
    let history = $state<RoamingPick[]>([]);
    let historyIndex = $state(0);
    const activeHistory = $derived(history.length > 0 ? history : [initialPick]);
    const currentPick = $derived(activeHistory[historyIndex] ?? initialPick);
    const canPrev = $derived(historyIndex > 0);
    let loading = $state(false);

    const safeAuthor = $derived(displayWechatAuthor(currentPick.item.author));
    const isWechat = $derived(isWechatUrl(currentPick.item.url) || isWechatUrl(currentPick.item.site));

    function prevPick(): void {
        if (historyIndex > 0) {
            historyIndex -= 1;
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                try { navigator.vibrate?.(10); } catch { /* noop */ }
            }
        }
    }

    async function nextPick(): Promise<void> {
        const currentList = history.length > 0 ? history : [initialPick];
        if (historyIndex < currentList.length - 1) {
            historyIndex += 1;
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                try { navigator.vibrate?.(10); } catch { /* noop */ }
            }
            return;
        }
        loading = true;
        try {
            const excludedIds = new Set(currentList.map((h) => h.item.id));
            const index = await loadIndex(facade.pluginInstance);
            const candidates = Object.values(index.clips);
            const next = pickRoamingArticle(candidates, excludedIds);
            if (next) {
                history = [...currentList, next];
                historyIndex = history.length - 1;
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

<svelte:window onkeydown={(e) => {
    if (e.key === "Escape") {
        onClose?.();
    } else if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        prevPick();
    } else if (e.key === "ArrowRight") {
        e.preventDefault();
        void nextPick();
    } else if (e.key === "Enter") {
        e.preventDefault();
        startRead();
    }
}} />

<div class="glean-roaming-dialog">
    <div class="glean-roaming-banner">
        <div class="glean-roaming-badge">
            <span class="glean-roaming-icon" aria-hidden="true">🎲</span>
            <span>{currentPick.reason}</span>
        </div>
        <div class="glean-roaming-score" title="综合匹配得分">
            {#if history.length > 1}
                <span class="glean-roaming-pos">({historyIndex + 1}/{history.length})</span>
            {/if}
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
            {#if currentPick.item.readPoint}
                <span class="glean-tier-badge glean-tier-badge--bookmark" title={t(i18n, "roaming.hasReadPoint")}>🔖 {t(i18n, "roaming.hasReadPoint")}</span>
            {/if}
        </div>
        {#if currentPick.item.summary}
            <p class="glean-roaming-summary">{currentPick.item.summary}</p>
        {/if}
        {#if (currentPick.item.tags && currentPick.item.tags.length > 0) || (currentPick.item.aiTags && currentPick.item.aiTags.length > 0)}
            <div class="glean-roaming-tags">
                {#each (currentPick.item.tags || []).slice(0, 3) as tag}
                    <span class="glean-roaming-tag">#{tag}</span>
                {/each}
                {#each (currentPick.item.aiTags || []).slice(0, 2) as aiTag}
                    <span class="glean-roaming-tag glean-roaming-tag--ai">✨{aiTag}</span>
                {/each}
            </div>
        {/if}
    </article>

    <div class="glean-roaming-actions">
        {#if canPrev}
            <button type="button" class="glean-btn glean-btn--ghost glean-roaming-prev-btn" onclick={prevPick} title={t(i18n, "roaming.prevBlindBox")}>
                ⏮️ {t(i18n, "roaming.prevBlindBox")}
            </button>
        {/if}
        <button type="button" class="glean-btn glean-btn--ghost glean-roaming-next-btn" disabled={loading} onclick={() => void nextPick()}>
            🎲 {t(i18n, "roaming.nextBlindBox")}
        </button>
        <button type="button" class="glean-btn glean-btn--pri glean-roaming-read-btn" onclick={startRead}>
            🎯 {t(i18n, "roaming.startReadNow")}
        </button>
    </div>

    <div class="glean-roaming-hint">
        <span aria-hidden="true">💡 {t(i18n, "roaming.keyboardTips")}</span>
    </div>
</div>
