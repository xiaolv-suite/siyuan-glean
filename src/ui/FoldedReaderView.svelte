<script lang="ts">
    import { showMessage } from "siyuan";
    import { t, type I18nBundle } from "../libs/i18n.ts";
    import {
        FOLD_LEVEL_CONFIGS,
        formatFoldNodesToMarkdown,
        type FoldLevel,
        type FoldNode,
    } from "../domain/folded-reader.ts";

    interface Props {
        nodes: FoldNode[];
        globalLevel?: FoldLevel;
        i18n: I18nBundle;
        loading?: boolean;
        onLevelChange?: (level: FoldLevel) => void;
        onJumpToBlock?: (blockId: string) => void;
        onToggleNode?: (nodeId: string) => void;
    }

    let {
        nodes,
        globalLevel = 2,
        i18n,
        loading = false,
        onLevelChange,
        onJumpToBlock,
        onToggleNode,
    }: Props = $props();

    let currentLevel = $state<FoldLevel>(2);
    let rootEl = $state<HTMLElement | null>(null);
    const REAL_BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/;

    $effect(() => {
        currentLevel = globalLevel;
    });

    const activeConfig = $derived(
        FOLD_LEVEL_CONFIGS.find((c) => c.level === currentLevel) ?? FOLD_LEVEL_CONFIGS[1]
    );

    function setLevel(lvl: FoldLevel): void {
        currentLevel = lvl;
        if (onLevelChange) {
            onLevelChange(lvl);
        }
    }

    async function copyCurrentOutlineMarkdown(): Promise<void> {
        if (nodes.length === 0) return;
        const md = formatFoldNodesToMarkdown(nodes, currentLevel);
        if (!md.trim()) return;
        try {
            await navigator.clipboard.writeText(md);
            showMessage(t(i18n, "foldReader.markdownCopied", { n: nodes.length }), 2500);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    }

    function handlePillKeyDown(e: KeyboardEvent, lvl: FoldLevel): void {
        const levels: FoldLevel[] = [1, 2, 3, 4, 5];
        const idx = levels.indexOf(lvl);
        if (idx === -1) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            const next = levels[(idx + 1) % levels.length];
            setLevel(next);
            const container = (e.currentTarget as HTMLElement).parentElement;
            const nextBtn = container?.children[(idx + 1) % levels.length] as HTMLElement | undefined;
            nextBtn?.focus();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            const prev = levels[(idx - 1 + levels.length) % levels.length];
            setLevel(prev);
            const container = (e.currentTarget as HTMLElement).parentElement;
            const prevBtn = container?.children[(idx - 1 + levels.length) % levels.length] as HTMLElement | undefined;
            prevBtn?.focus();
        }
    }

    function handleWindowKeyDown(e: KeyboardEvent): void {
        if (e.repeat) return;
        const target = e.target instanceof Element ? e.target : null;
        if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
        if (e.isComposing || e.keyCode === 229) return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        if (typeof document !== "undefined") {
            const modalOpen = Array.from(document.querySelectorAll<HTMLElement>('.b3-dialog, .b3-menu, [role="dialog"], [aria-modal="true"], .glean-dialog'))
                .some((el) => el.getClientRects().length > 0);
            if (modalOpen) return;
            if (rootEl && rootEl.getClientRects().length === 0) return;
            const readerHost = rootEl?.closest(".glean-reader") ?? rootEl;
            const active = document.activeElement;
            if (readerHost && target && !readerHost.contains(target) && active && active !== document.body && !readerHost.contains(active)) return;
        }

        if (e.key === "1") {
            e.preventDefault();
            setLevel(1);
        } else if (e.key === "2") {
            e.preventDefault();
            setLevel(2);
        } else if (e.key === "3") {
            e.preventDefault();
            setLevel(3);
        } else if (e.key === "4") {
            e.preventDefault();
            setLevel(4);
        } else if (e.key === "5") {
            e.preventDefault();
            setLevel(5);
        }
    }
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div bind:this={rootEl} class="glean-fold-reader" role="region" aria-label={t(i18n, "foldReader.title")}>
    <header class="glean-fold-reader__head">
        <div class="glean-fold-reader__levels-row">
            <div
                class="glean-fold-reader__levels"
                role="radiogroup"
                aria-label={t(i18n, "foldReader.title")}
            >
                {#each FOLD_LEVEL_CONFIGS as cfg}
                    <button
                        type="button"
                        class="glean-fold-reader__pill"
                        class:glean-fold-reader__pill--active={currentLevel === cfg.level}
                        role="radio"
                        aria-checked={currentLevel === cfg.level}
                        tabindex={currentLevel === cfg.level ? 0 : -1}
                        title="{t(i18n, cfg.nameKey)} ({cfg.shortcut})"
                        onclick={() => setLevel(cfg.level)}
                        onkeydown={(e) => handlePillKeyDown(e, cfg.level)}
                    >
                        <span class="glean-fold-reader__pill-num">{cfg.level}</span>
                        <span>{t(i18n, cfg.badgeKey)}</span>
                    </button>
                {/each}
            </div>
            {#if currentLevel === 2}
                <span class="glean-fold-reader__verbatim-tag">
                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                    <span>{t(i18n, "foldReader.verbatimBadge")}</span>
                </span>
            {/if}
        </div>
        <div class="glean-fold-reader__desc-row">
            <span>{t(i18n, activeConfig.descKey)}</span>
            <div class="glean-fold-reader__ops-row">
                {#if nodes.length > 0}
                    <button
                        type="button"
                        class="glean-linkish glean-fold-reader__copy-btn"
                        title={t(i18n, "foldReader.copyMarkdown")}
                        onclick={copyCurrentOutlineMarkdown}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                        <span>{t(i18n, "foldReader.copyMarkdown")}</span>
                    </button>
                {/if}
                <span class="glean-kbdhint" aria-hidden="true"><kbd>1-5</kbd> {t(i18n, "foldReader.desc")}</span>
            </div>
        </div>
    </header>

    {#if loading}
        <div class="glean-fold-reader__loading" role="status">
            <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
            <span>{t(i18n, "foldReader.loading")}</span>
        </div>
    {:else if nodes.length === 0}
        <div class="glean-fold-reader__empty" role="status">
            <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanCard" /></svg>
            <span>{t(i18n, "foldReader.empty")}</span>
        </div>
    {:else}
        <div class="glean-fold-reader__list" role="feed" aria-label={t(i18n, "foldReader.title")}>
            {#each nodes as node, idx (node.id)}
                {@const isExpanded = node.expanded}
                {@const effectiveLevel = isExpanded ? 1 : currentLevel}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                <article
                    class="glean-fold-card glean-fold-card--level-{effectiveLevel}"
                    class:glean-fold-card--expanded={isExpanded}
                    tabindex="0"
                    aria-label={t(i18n, "foldReader.paragraphIndex", { n: idx + 1 })}
                    onclick={() => {
                        if (REAL_BLOCK_ID.test(node.blockId)) onJumpToBlock?.(node.blockId);
                        else onToggleNode?.(node.id);
                    }}
                    onkeydown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (REAL_BLOCK_ID.test(node.blockId)) onJumpToBlock?.(node.blockId);
                            else onToggleNode?.(node.id);
                        } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                            e.preventDefault();
                            e.stopPropagation();
                            onToggleNode?.(node.id);
                        }
                    }}
                >
                    <header class="glean-fold-card__head">
                        <div class="glean-fold-card__meta">
                            <span class="glean-fold-card__idx">#{idx + 1}</span>
                            {#if node.concept}
                                <span class="glean-fold-card__concept">{node.concept}</span>
                            {/if}
                        </div>
                        <div class="glean-fold-card__ops">
                            <button
                                type="button"
                                class="glean-fold-card__btn"
                                title={isExpanded ? t(i18n, "foldReader.collapseCard") : t(i18n, "foldReader.expandCard")}
                                aria-label={isExpanded ? t(i18n, "foldReader.collapseCard") : t(i18n, "foldReader.expandCard")}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    onToggleNode?.(node.id);
                                }}
                            >
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true">
                                    <use href={isExpanded ? "#iconGleanClose" : "#iconGleanSpark"} />
                                </svg>
                                <span>{isExpanded ? t(i18n, "foldReader.collapseCard") : t(i18n, "foldReader.expandCard")}</span>
                            </button>
                            {#if REAL_BLOCK_ID.test(node.blockId)}
                                <button
                                    type="button"
                                    class="glean-fold-card__btn"
                                    title={t(i18n, "foldReader.jumpToBlock")}
                                    aria-label={t(i18n, "foldReader.jumpToBlock")}
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        onJumpToBlock?.(node.blockId);
                                    }}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                                </button>
                            {/if}
                        </div>
                    </header>

                    <div class="glean-fold-card__body">
                        {#if effectiveLevel === 1}
                            <p class="glean-fold-card__text-full">{node.fullText}</p>
                        {:else if effectiveLevel === 2}
                            <blockquote class="glean-fold-card__brief">“{node.brief}”</blockquote>
                        {:else if effectiveLevel === 3}
                            <div class="glean-fold-card__brief">“{node.brief}”</div>
                            {#if node.points && node.points.length > 0}
                                <ul class="glean-fold-card__points">
                                    {#each node.points as pt}
                                        <li>{pt}</li>
                                    {/each}
                                </ul>
                            {/if}
                        {:else if effectiveLevel === 4}
                            <div class="glean-fold-card__gist">
                                <strong>{node.gist}</strong>
                            </div>
                        {:else if effectiveLevel === 5}
                            <div class="glean-fold-card__concept-view">
                                <span>{node.gist || node.brief}</span>
                            </div>
                        {/if}
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</div>
