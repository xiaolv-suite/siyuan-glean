<script lang="ts">
    import { openTab, showMessage } from "siyuan";
    import type { GleanFacade } from "../types";
    import { t } from "../libs/i18n";
    import { pickRoamingArticle, type RoamingPick, type RoamingTimeBudget } from "../domain/roaming";
    import { loadIndex, type GleanIndex } from "../services/index-store";
    import { displayWechatAuthor, isWechatUrl } from "../domain/wechat";
    import { writeClip } from "../services/clip-store";
    import { formatCitation, type CitationFormat, type CitationItem } from "../domain/citation";
    import { snapshotClip } from "../services/snapshot-service";

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
    let selectedTag = $state("");
    let favoriteOnly = $state(false);
    let highRatingPriority = $state(false);
    let availableTags = $state<string[]>([]);
    let loading = $state(false);
    let cachedIndex = $state<GleanIndex | null>(null);

    async function getIndex(): Promise<GleanIndex> {
        if (!cachedIndex) {
            cachedIndex = await loadIndex(facade.pluginInstance);
        }
        return cachedIndex;
    }

    $effect(() => {
        void getIndex().then((index) => {
            const counts: Record<string, number> = {};
            for (const clip of Object.values(index.clips)) {
                if (clip.status === "inbox" || clip.status === "later" || clip.status === "reading") {
                    for (const t of clip.tags || []) {
                        counts[t] = (counts[t] || 0) + 1;
                    }
                }
            }
            availableTags = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([tagKey]) => tagKey);
        }).catch(() => undefined);
    });

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
        const prevBudget = timeBudget;
        timeBudget = budget;
        loading = true;
        try {
            const index = await getIndex();
            const candidates = Object.values(index.clips);
            const next = pickRoamingArticle(candidates, { timeBudget: budget, tag: selectedTag || undefined, favoriteOnly, highRatingPriority });
            if (next) {
                history = [next];
                historyIndex = 0;
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { navigator.vibrate?.(10); } catch { /* noop */ }
                }
            } else {
                timeBudget = prevBudget;
                showMessage(t(i18n, "roaming.emptyBudgetPool"), 2500);
            }
        } catch (error) {
            timeBudget = prevBudget;
            console.warn("[glean] 切换时间预算漫游异常:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    async function changeTag(tagVal: string): Promise<void> {
        if (loading) return;
        const prevTag = selectedTag;
        selectedTag = tagVal;
        loading = true;
        try {
            const index = await getIndex();
            const candidates = Object.values(index.clips);
            const next = pickRoamingArticle(candidates, { timeBudget, tag: selectedTag || undefined, favoriteOnly, highRatingPriority });
            if (next) {
                history = [next];
                historyIndex = 0;
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { navigator.vibrate?.(10); } catch { /* noop */ }
                }
            } else {
                selectedTag = prevTag;
                showMessage(t(i18n, "roaming.emptyTopicPool"), 2500);
            }
        } catch (error) {
            selectedTag = prevTag;
            console.warn("[glean] 切换主题漫游异常:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    async function toggleFavoriteFilter(): Promise<void> {
        if (loading) return;
        const nextFav = !favoriteOnly;
        favoriteOnly = nextFav;
        loading = true;
        try {
            const index = await getIndex();
            const candidates = Object.values(index.clips);
            const next = pickRoamingArticle(candidates, { timeBudget, tag: selectedTag || undefined, favoriteOnly: nextFav, highRatingPriority });
            if (next) {
                history = [next];
                historyIndex = 0;
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { navigator.vibrate?.(10); } catch { /* noop */ }
                }
            } else {
                favoriteOnly = !nextFav;
                showMessage(t(i18n, "roaming.emptyPool"), 2500);
            }
        } catch (error) {
            favoriteOnly = !nextFav;
            console.warn("[glean] 切换收藏过滤漫游异常:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    async function toggleHighRatingPriority(): Promise<void> {
        if (loading) return;
        const nextHigh = !highRatingPriority;
        highRatingPriority = nextHigh;
        loading = true;
        try {
            const index = await getIndex();
            const candidates = Object.values(index.clips);
            const next = pickRoamingArticle(candidates, { timeBudget, tag: selectedTag || undefined, favoriteOnly, highRatingPriority: nextHigh });
            if (next) {
                history = [next];
                historyIndex = 0;
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { navigator.vibrate?.(10); } catch { /* noop */ }
                }
            } else {
                highRatingPriority = !nextHigh;
                showMessage(t(i18n, "roaming.emptyPool"), 2500);
            }
        } catch (error) {
            highRatingPriority = !nextHigh;
            console.warn("[glean] 切换高星级过滤漫游异常:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    async function nextPick(force = false): Promise<void> {
        if (loading && !force) return;
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
            const index = await getIndex();
            const candidates = Object.values(index.clips);
            const next = pickRoamingArticle(candidates, { excludedIds, timeBudget, tag: selectedTag || undefined, favoriteOnly, highRatingPriority });
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
            cachedIndex = null;
            await nextPick(true);
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
            cachedIndex = null;
            await nextPick(true);
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
        loading = true;
        try {
            await writeClip(facade.pluginInstance, currentPick.item.id, { favorite: nextFav }, { force: true });
            showMessage(t(i18n, nextFav ? "roaming.favoriteAdded" : "roaming.favoriteRemoved"), 2000);
            facade.notifyDataChanged();
        } catch (error) {
            currentPick.item.favorite = currentFav;
            console.warn("[glean] 盲盒收藏切换失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    let touchStartX = 0;
    let touchStartY = 0;

    function handleTouchStart(e: TouchEvent): void {
        const touch = e.touches[0];
        if (!touch) return;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }

    function handleTouchEnd(e: TouchEvent): void {
        const touch = e.changedTouches[0];
        if (!touch) return;
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
            if (deltaX < 0) {
                void nextPick();
            } else if (deltaX > 0 && canPrev) {
                prevPick();
            }
        }
    }

    async function copyCurrentBlockRef(): Promise<void> {
        const title = currentPick.item.title || t(i18n, "panel.untitled");
        const refText = `((${currentPick.item.id} '${title}'))`;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(refText);
                showMessage(t(i18n, "reader.blockRefCopied"), 2000);
            } else {
                showMessage(t(i18n, "msg.actionFailed"), 2000);
            }
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    }

    async function copyCurrentCitation(format: CitationFormat = "gbt"): Promise<void> {
        const citItem: CitationItem = {
            id: currentPick.item.id,
            title: currentPick.item.title,
            author: currentPick.item.author,
            site: currentPick.item.site,
            url: currentPick.item.url,
            time: currentPick.item.time,
        };
        const citText = formatCitation(citItem, format);
        const msgKey = format === "bibtex" ? "citation.bibtexCopied" : (format === "apa" ? "citation.apaCopied" : (format === "mla" ? "citation.mlaCopied" : "citation.gbtCopied"));
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(citText);
                showMessage(t(i18n, msgKey), 2000);
            } else {
                showMessage(t(i18n, "msg.actionFailed"), 2000);
            }
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    }

    async function cycleCurrentPriority(): Promise<void> {
        if (loading) return;
        const currentP = currentPick.item.priority ?? 0;
        const nextP = (currentP % 5) + 1;
        currentPick.item.priority = nextP;
        loading = true;
        try {
            await writeClip(facade.pluginInstance, currentPick.item.id, { priority: nextP }, { force: true });
            showMessage(t(i18n, "msg.rankSaved"), 2000);
            facade.notifyDataChanged();
        } catch (error) {
            currentPick.item.priority = currentP;
            console.warn("[glean] 盲盒优先级保存失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    async function cycleCurrentRating(): Promise<void> {
        if (loading) return;
        const currentR = currentPick.item.rating ?? 0;
        const nextR = (currentR % 5) + 1;
        currentPick.item.rating = nextR;
        loading = true;
        try {
            await writeClip(facade.pluginInstance, currentPick.item.id, { rating: nextR }, { force: true });
            showMessage(t(i18n, "msg.rankSaved"), 2000);
            facade.notifyDataChanged();
        } catch (error) {
            currentPick.item.rating = currentR;
            console.warn("[glean] 盲盒评分保存失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            loading = false;
        }
    }

    async function openOrTakeCurrentSnapshot(): Promise<void> {
        if (currentPick.item.snapshot) {
            void openTab({ app: facade.pluginInstance.app, asset: { path: currentPick.item.snapshot } });
            return;
        }
        if (loading) return;
        loading = true;
        try {
            const result = await snapshotClip(facade.pluginInstance, currentPick.item.id);
            if (result?.path) {
                currentPick.item.snapshot = result.path;
                showMessage(t(i18n, result.indexSyncFailed ? "msg.writeIndexPending" : "snapshot.done"), result.indexSyncFailed ? 4000 : 3000);
                facade.notifyDataChanged();
            } else {
                showMessage(t(i18n, "snapshot.failed"), 3000);
            }
        } catch (error) {
            console.warn("[glean] 漫游盲盒拍摄快照失败:", error);
            showMessage(t(i18n, "snapshot.failed"), 3000);
        } finally {
            loading = false;
        }
    }

    function startRead(): void {
        onClose?.();
        onOpenArticle(currentPick.item.id, currentPick.item.readPoint);
    }
</script>

<svelte:window onkeydown={(e) => {
    if (e.repeat) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
    } else if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        prevPick();
    } else if (e.key === "ArrowRight" || e.key === " " || e.code === "Space") {
        if ((e.key === " " || e.code === "Space") && target?.closest("button, a[href], summary, [role='button']")) return;
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
    } else if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) void copyCurrentCitation("bibtex");
        else void copyCurrentCitation("gbt");
    } else if ((e.key === "y" || e.key === "Y") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void copyCurrentBlockRef();
    } else if ((e.key === "s" || e.key === "S") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void openOrTakeCurrentSnapshot();
    } else if ((e.key === "p" || e.key === "P") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void cycleCurrentPriority();
    } else if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void cycleCurrentRating();
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
        if (target?.closest("button, a[href], summary, [role='button']")) return;
        e.preventDefault();
        startRead();
    }
}} />

<div class="glean-roaming-dialog">
    <div class="glean-roaming-banner">
        <div class="glean-roaming-badge">
            <span class="glean-roaming-icon" aria-hidden="true"><svg class="glean-icon" aria-hidden="true"><use href="#iconGleanRefresh" /></svg></span>
            <span>{currentPick.reason}</span>
        </div>
        <div class="glean-roaming-score" title={t(i18n, "roaming.scoreTitle")}>
            {#if history.length > 1}
                <span class="glean-roaming-pos">({historyIndex + 1}/{history.length})</span>
            {/if}
            <svg class="glean-icon glean-icon--xs glean-icon--flame" aria-hidden="true"><use href="#iconGleanFlame" /></svg> <span>{t(i18n, "roaming.scoreLabel", { score: currentPick.score })}</span>
        </div>
    </div>

    <div class="glean-roaming-budget-row">
        <div class="glean-roaming-budget" role="group" aria-label={t(i18n, "roaming.budgetGroupLabel")}>
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
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanBolt" /></svg> <span>≤5m</span>
            </button>
            <button
                type="button"
                class="glean-roaming-budget-btn"
                class:glean-roaming-budget-btn--active={timeBudget === "medium"}
                onclick={() => void changeBudget("medium")}
                title="{t(i18n, 'roaming.budgetMedium')} (3)"
            >
                <svg class="glean-icon glean-icon--xs glean-icon--clock" aria-hidden="true"><use href="#iconGleanClock" /></svg> <span>5-15m</span>
            </button>
            <button
                type="button"
                class="glean-roaming-budget-btn"
                class:glean-roaming-budget-btn--active={timeBudget === "long"}
                onclick={() => void changeBudget("long")}
                title="{t(i18n, 'roaming.budgetLong')} (4)"
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanLocal" /></svg> <span>>15m</span>
            </button>
        </div>

        {#if availableTags.length > 0}
            <select
                class="b3-select glean-roaming-tag-select"
                bind:value={selectedTag}
                onchange={() => void changeTag(selectedTag)}
                title={t(i18n, "roaming.allTopics")}
                aria-label={t(i18n, "roaming.allTopics")}
            >
                <option value="">🏷️ {t(i18n, "roaming.allTopics")}</option>
                {#each availableTags as tag (tag)}
                    <option value={tag}>#{tag}</option>
                {/each}
            </select>
        {/if}

        <button
            type="button"
            class="glean-roaming-budget-btn glean-roaming-fav-filter-btn"
            class:glean-roaming-budget-btn--active={favoriteOnly}
            onclick={() => void toggleFavoriteFilter()}
            title={t(i18n, "roaming.favoriteOnlyHint")}
        >
            <svg class="glean-icon glean-icon--xs" class:glean-icon--fav={favoriteOnly} aria-hidden="true"><use href={favoriteOnly ? "#iconGleanHeart" : "#iconGleanHeartOutline"} /></svg>
            <span>{t(i18n, "roaming.favoriteOnly")}</span>
        </button>

        <button
            type="button"
            class="glean-roaming-budget-btn glean-roaming-rating-filter-btn"
            class:glean-roaming-budget-btn--active={highRatingPriority}
            onclick={() => void toggleHighRatingPriority()}
            title={t(i18n, "roaming.highRatingPriorityHint")}
        >
            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanStar" /></svg>
            <span>{t(i18n, "roaming.highRatingPriority")}</span>
        </button>
    </div>

    <article
        class="glean-roaming-card"
        ontouchstart={handleTouchStart}
        ontouchend={handleTouchEnd}
    >
        <h3 class="glean-roaming-title">
            <button type="button" class="glean-roaming-title-btn" onclick={startRead} title={t(i18n, "roaming.startReadNow")}>
                {currentPick.item.title || t(i18n, "panel.untitled")}
            </button>
        </h3>
        <div class="glean-roaming-meta">
            {#if isWechat}
                <span class="glean-badge glean-source-wechat">
                    <span class="glean-wechat-dot" aria-hidden="true"></span>
                    {t(i18n, "wechat.name")}{#if safeAuthor} · {safeAuthor}{/if}
                </span>
            {:else if currentPick.item.site}
                <span class="glean-badge">{currentPick.item.site}</span>
            {/if}
            {#if (currentPick.item.minutes ?? 0) > 0}
                <span class="glean-tier-badge"><svg class="glean-icon glean-icon--xs glean-icon--clock" aria-hidden="true"><use href="#iconGleanClock" /></svg> <span>{t(i18n, "panel.minutes", { n: currentPick.item.minutes ?? 0 })}</span></span>
            {/if}
            {#if (currentPick.item.priority ?? 0) > 0}
                <span class="glean-tier-badge"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanBolt" /></svg> <span>P{currentPick.item.priority}</span></span>
            {/if}
            {#if (currentPick.item.rating ?? 0) > 0}
                <span class="glean-tier-badge"><svg class="glean-icon glean-icon--xs glean-icon--star" aria-hidden="true"><use href="#iconGleanStar" /></svg> <span>{currentPick.item.rating}★</span></span>
            {/if}
            {#if currentPick.item.favorite}
                <span class="glean-tier-badge glean-tier-badge--fav"><svg class="glean-icon glean-icon--xs glean-icon--fav" aria-hidden="true"><use href="#iconGleanHeart" /></svg> <span>{t(i18n, "roaming.favoriteAction")}</span></span>
            {/if}
            {#if (currentPick.item.words ?? 0) > 0}
                <span class="glean-tier-badge"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg> <span>{t(i18n, "panel.words", { n: currentPick.item.words ?? 0 })}</span></span>
            {/if}
            {#if currentPick.item.snapshot}
                <span class="glean-tier-badge" title={t(i18n, "roaming.snapshotSavedHint")}><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanShieldCheck" /></svg> <span>{t(i18n, "roaming.snapshotSaved")}</span></span>
            {/if}
            {#if currentPick.item.readPoint}
                <span class="glean-tier-badge glean-tier-badge--bookmark" title={t(i18n, "roaming.hasReadPoint")}><svg class="glean-icon glean-icon--xs glean-icon--bookmark" aria-hidden="true"><use href="#iconGleanBookmark" /></svg> <span>{t(i18n, "roaming.hasReadPoint")}</span></span>
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
                <svg class="glean-icon glean-icon--xs" class:glean-icon--fav={currentPick.item.favorite} aria-hidden="true"><use href={currentPick.item.favorite ? "#iconGleanHeart" : "#iconGleanHeartOutline"} /></svg> <span>{t(i18n, "roaming.favoriteAction")}</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void copyCurrentBlockRef()}
                title="{t(i18n, 'action.copyBlockRef')} (Y)"
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg> <span>{t(i18n, "action.copyBlockRef")}</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void copyCurrentCitation("gbt")}
                title="{t(i18n, 'citation.copyGBT')} (C)"
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg> <span>{t(i18n, "citation.copyGBT")}</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void copyCurrentCitation("bibtex")}
                title="{t(i18n, 'citation.copyBibTeX')} (Shift+C)"
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArchive" /></svg> <span>BibTeX</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void copyCurrentCitation("apa")}
                title={t(i18n, "citation.copyAPA")}
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanLocal" /></svg> <span>APA</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void copyCurrentCitation("mla")}
                title={t(i18n, "citation.copyMLA")}
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCard" /></svg> <span>MLA</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void cycleCurrentPriority()}
                title="{t(i18n, 'library.keyboardPriority')} (P)"
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanBolt" /></svg> <span>P{currentPick.item.priority || 0}</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void cycleCurrentRating()}
                title="{t(i18n, 'library.keyboardRating')} (M)"
            >
                <svg class="glean-icon glean-icon--xs glean-icon--star" aria-hidden="true"><use href="#iconGleanStar" /></svg> <span>{currentPick.item.rating || 0}★</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void openOrTakeCurrentSnapshot()}
                title="{(currentPick.item.snapshot ? t(i18n, 'snapshot.open') : t(i18n, 'snapshot.take'))} (S)"
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCamera" /></svg> <span>{currentPick.item.snapshot ? t(i18n, "snapshot.open") : t(i18n, "snapshot.take")}</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void markCurrentLater()}
                title="{t(i18n, 'queue.later')} (A)"
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanInbox" /></svg> <span>{t(i18n, "queue.later")}</span>
            </button>
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-roaming-triage-btn"
                disabled={loading}
                onclick={() => void markCurrentArchive()}
                title="{t(i18n, 'queue.archived')} (E)"
            >
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArchive" /></svg> <span>{t(i18n, "queue.archived")}</span>
            </button>
        </div>
        <div class="glean-roaming-nav">
            {#if canPrev}
                <button type="button" class="glean-btn glean-btn--ghost glean-roaming-prev-btn" onclick={prevPick} title={t(i18n, "roaming.prevBlindBox")}>
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowLeft" /></svg> <span>{t(i18n, "roaming.prevBlindBox")}</span>
                </button>
            {/if}
            <button type="button" class="glean-btn glean-btn--ghost glean-roaming-next-btn" disabled={loading} onclick={() => void nextPick()}>
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanRefresh" /></svg> <span>{t(i18n, "roaming.nextBlindBox")}</span>
            </button>
            <button type="button" class="glean-btn glean-btn--pri glean-roaming-read-btn" onclick={startRead}>
                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanNews" /></svg> <span>{t(i18n, "roaming.startReadNow")}</span>
            </button>
        </div>
    </div>

    <div class="glean-roaming-hint">
        {#if facade.isMobile}
            <span aria-hidden="true"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowRight" /></svg> <span>{t(i18n, "roaming.mobileSwipeTips")}</span></span>
        {:else}
            <span aria-hidden="true"><svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg> <span>{t(i18n, "roaming.keyboardTips")}</span></span>
        {/if}
    </div>
</div>
