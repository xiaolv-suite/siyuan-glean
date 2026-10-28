<script lang="ts">
    import { showMessage } from "siyuan";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
    import { pickRoamingArticle, type RoamingPick, type RoamingTimeBudget } from "../domain/roaming";
    import { loadIndex } from "../services/index-store";
    import { displayWechatAuthor, isWechatUrl } from "../domain/wechat";
    import { writeClip } from "../services/clip-store";

    interface Props {
        facade: GleanFacade;
        initialPick: RoamingPick;
        onOpenArticle: (id: string, readPoint?: string) => void;
        onClose?: () => void;
    }

    let { facade, initialPick, onOpenArticle, onClose }: Props = $props();

    const i18n = $derived(facade.i18n);
    let history = $state<RoamingPick[]>([]);
    let historyIndex = $state(0);
    const activeHistory = $derived(history.length > 0 ? history : [initialPick]);
    const currentPick = $derived(activeHistory[historyIndex] ?? initialPick);
    const canPrev = $derived(historyIndex > 0);
    let timeBudget = $state<RoamingTimeBudget>("all");
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

    async function changeBudget(budget: RoamingTimeBudget): Promise<void> {
        if (timeBudget === budget || loading) return;
        timeBudget = budget;
        loading = true;
        try {
            const index = await loadIndex(facade.pluginInstance);
            const candidates = Object.values(index.clips);
            const next = pickRoamingArticle(candidates, { timeBudget: budget });
            if (next) {
                history = [next];
                historyIndex = 0;
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { navigator.vibrate?.(10); } catch { /* noop */ }
                }
            } else {
                showMessage(t(i18n, "roaming.emptyBudgetPool"), 2500);
            }
        } catch (error) {
            console.warn("[glean] 切换时间预算漫游异常:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
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
            const next = pickRoamingArticle(candidates, { excludedIds, timeBudget });
            if (next) {
                history = [...currentList, next];
                historyIndex = history.length - 1;
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { navigator.vibrate?.(12); } catch { /* noop */ }
                }
            } else {
                showMessage(t(i18n, timeBudget === "all" ? "roaming.emptyPool" : "roaming.emptyBudgetPool"), 2500);
            }
        } catch (error) {
            console.warn("[glean] 漫游换篇异常:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    async function markCurrentLater(): Promise<void> {
        if (loading) return;
        loading = true;
        try {
            const id = currentPick.item.id;
            await writeClip(facade.pluginInstance, id, { status: "later" }, { force: true });
            showMessage(t(i18n, "msg.statusChanged"), 2000);
            facade.notifyDataChanged();
            await nextPick();
        } catch (error) {
            console.warn("[glean] 盲盒稍后读写入失败:", error);
            showMessage(t(i18n, "msg.statusFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    async function markCurrentArchive(): Promise<void> {
        if (loading) return;
        loading = true;
        try {
            const id = currentPick.item.id;
            await writeClip(facade.pluginInstance, id, { status: "archived" }, { force: true });
            showMessage(t(i18n, "msg.statusChanged"), 2000);
            facade.notifyDataChanged();
            await nextPick();
        } catch (error) {
            console.warn("[glean] 盲盒归档写入失败:", error);
            showMessage(t(i18n, "msg.statusFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    async function toggleCurrentFavorite(): Promise<void> {
        if (loading) return;
        const currentFav = Boolean(currentPick.item.favorite);
        const nextFav = !currentFav;
        currentPick.item.favorite = nextFav;
        try {
            await writeClip(facade.pluginInstance, currentPick.item.id, { favorite: nextFav }, { force: true });
            showMessage(t(i18n, nextFav ? "roaming.favoriteAdded" : "roaming.favoriteRemoved"), 2000);
            facade.notifyDataChanged();
        } catch (error) {
            currentPick.item.favorite = currentFav;
            console.warn("[glean] 盲盒收藏切换失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    function startRead(): void {
        onClose?.();
        onOpenArticle(currentPick.item.id, currentPick.item.readPoint);
    }
</script>

<svelte:window onkeydown={(e) => {
    if (e.key === "Escape") {
        onClose?.();
    } else if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        prevPick();
    } else if (e.key === "ArrowRight" || e.key === " " || e.code === "Space") {
        e.preventDefault();
        void nextPick();
    } else if ((e.key === "a" || e.key === "A") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void markCurrentLater();
    } else if ((e.key === "e" || e.key === "E") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void markCurrentArchive();
    } else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void toggleCurrentFavorite();
    } else if (e.key === "1" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void changeBudget("all");
    } else if (e.key === "2" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void changeBudget("short");
    } else if (e.key === "3" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void changeBudget("medium");
    } else if (e.key === "4" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void changeBudget("long");
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

    <div class="glean-roaming-budget-row">
        <div class="glean-roaming-budget" role="group" aria-label="可用时间">
            <button
                type="button"
                class="glean-roaming-budget-btn"
                class:glean-roaming-budget-btn--active={timeBudget === "all"}
                onclick={() => void changeBudget("all")}
                title="{t(i18n, 'roaming.budgetAll')} (1)"
            >
                {t(i18n, "action.filterAll")}
            </button>
            <button
                type="button"
                class="glean-roaming-budget-btn"
                class:glean-roaming-budget-btn--active={timeBudget === "short"}
                onclick={() => void changeBudget("short")}
                title="{t(i18n, 'roaming.budgetShort')} (2)"
            >
                ⚡ ≤5m
            </button>
            <button
                type="button"
                class="glean-roaming-budget-btn"
                class:glean-roaming-budget-btn--active={timeBudget === "medium"}
                onclick={() => void changeBudget("medium")}
                title="{t(i18n, 'roaming.budgetMedium')} (3)"
            >
                ⏱️ 5-15m
            </button>
            <button
                type="button"
                class="glean-roaming-budget-btn"
                class:glean-roaming-budget-btn--active={timeBudget === "long"}
                onclick={() => void changeBudget("long")}
                title="{t(i18n, 'roaming.budgetLong')} (4)"
            >
                📚 >15m
            </button>
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
            {#if currentPick.item.favorite}
                <span class="glean-tier-badge glean-tier-badge--fav">❤️ 已收藏</span>
            {/if}
            {#if (currentPick.item.words ?? 0) > 0}
                <span class="glean-tier-badge">📝 {t(i18n, "panel.words", { n: currentPick.item.words ?? 0 })}</span>
            {/if}
            {#if currentPick.item.snapshot}
                <span class="glean-tier-badge" title="已保存离线网页单文件快照">💾 已快照</span>
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
        <div class="glean-roaming-triage">
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                class:glean-roaming-triage-btn--active={currentPick.item.favorite}
                disabled={loading}
                onclick={() => void toggleCurrentFavorite()}
                title={t(i18n, "roaming.favoriteAction") + " (F)"}
            >
                {currentPick.item.favorite ? "❤️" : "🤍"} {t(i18n, "roaming.favoriteAction")}
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void markCurrentLater()}
                title="稍后读 (A)"
            >
                📥 {t(i18n, "queue.later")}
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void markCurrentArchive()}
                title="归档 (E)"
            >
                📦 {t(i18n, "queue.archived")}
            </button>
        </div>
        <div class="glean-roaming-nav">
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
    </div>

    <div class="glean-roaming-hint">
        <span aria-hidden="true">💡 {t(i18n, "roaming.keyboardTips")}</span>
    </div>
</div>
