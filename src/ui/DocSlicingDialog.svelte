<script lang="ts">
    import { showMessage } from "siyuan";
    import type { GleanFacade } from "../types.ts";
    import { t } from "../libs/i18n.ts";
    import { planDocSlices, type DocSlice, type DocSlicePlan } from "../domain/doc-slicing.ts";
    import type { OutlineItem } from "../domain/outline.ts";
    import type { ReadingClipContext } from "../services/clip-store.ts";
    import { createSliceSubDocuments } from "../services/doc-slicing-service.ts";

    interface Props {
        facade: GleanFacade;
        context: ReadingClipContext;
        outline: readonly OutlineItem[];
        onJumpToBlock?: (blockId: string) => void;
    }

    let { facade, context, outline, onJumpToBlock }: Props = $props();

    const i18n = $derived(facade.i18n);

    let targetMinutes = $state(8);
    let creating = $state(false);

    const estimatedMinutes = $derived(context.words ? Math.max(1, Math.round(context.words / 400)) : 1);

    const plan = $derived<DocSlicePlan>(
        planDocSlices(outline, {
            targetMinutesPerSlice: targetMinutes,
            totalWords: context.words,
            totalMinutes: estimatedMinutes,
        })
    );

    function handleJump(slice: DocSlice): void {
        if (slice.startBlockId && onJumpToBlock) {
            onJumpToBlock(slice.startBlockId);
        }
    }

    async function handleCreateSubDocs(): Promise<void> {
        if (creating || plan.slices.length === 0) return;
        creating = true;
        try {
            const result = await createSliceSubDocuments(facade.pluginInstance, context, plan);
            if (result.ok) {
                showMessage(t(i18n, "docSlicing.createdSuccess", { count: result.createdCount }), 3500);
                facade.notifyDataChanged();
            } else {
                showMessage(result.errors[0] || t(i18n, "msg.actionFailed"), 3500);
            }
        } catch (error) {
            console.warn("[glean] 生成切片子文档失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 3500);
        } finally {
            creating = false;
        }
    }
</script>

<div class="lv-glean glean-slicing-dialog">
    <div class="glean-slicing-head">
        <div class="glean-slicing-durations">
            <span class="glean-slicing-label">{t(i18n, "docSlicing.targetMinutes")}</span>
            <div class="glean-slicing-pills" role="radiogroup" aria-label={t(i18n, "docSlicing.targetMinutes")}>
                {#each [5, 8, 12, 15] as m}
                    <button
                        type="button"
                        class="glean-slicing-pill"
                        class:glean-slicing-pill--active={targetMinutes === m}
                        onclick={() => { targetMinutes = m; }}
                    >
                        {m}m
                    </button>
                {/each}
            </div>
        </div>
        <div class="glean-slicing-summary">
            {t(i18n, "docSlicing.summary", {
                count: plan.totalSlices,
                words: context.words ?? 0,
                minutes: estimatedMinutes,
            })}
        </div>
    </div>

    {#if outline.length === 0}
        <div class="glean-slicing-hint-empty">
            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSpark" /></svg>
            <span>{t(i18n, "docSlicing.emptyOutline")}</span>
        </div>
    {/if}

    <div class="glean-slicing-list" role="list">
        {#each plan.slices as slice (slice.index)}
            <div class="glean-slicing-card" role="listitem">
                <div class="glean-slicing-card__head">
                    <span class="glean-slicing-card__badge">{slice.index}</span>
                    <span class="glean-slicing-card__title" title={slice.title}>{slice.title}</span>
                    <span class="glean-slicing-card__time">约 {slice.estimatedMinutes} 分钟 · {slice.estimatedWords} 字</span>
                </div>
                {#if slice.sectionTitles.length > 0}
                    <div class="glean-slicing-card__sections">
                        {#each slice.sectionTitles.slice(0, 4) as sec}
                            <span class="glean-slicing-card__sec-chip">{sec}</span>
                        {/each}
                        {#if slice.sectionTitles.length > 4}
                            <span class="glean-slicing-card__sec-chip">+{slice.sectionTitles.length - 4}</span>
                        {/if}
                    </div>
                {/if}
                {#if slice.startBlockId && onJumpToBlock}
                    <div class="glean-slicing-card__ops">
                        <button type="button" class="glean-btn glean-btn--ghost glean-btn--sm" onclick={() => handleJump(slice)}>
                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanSearch" /></svg>
                            <span>{t(i18n, "docSlicing.previewBlock")}</span>
                        </button>
                    </div>
                {/if}
            </div>
        {/each}
    </div>

    <div class="glean-slicing-footer">
        <button
            type="button"
            class="glean-btn glean-btn--pri glean-slicing-create-btn"
            disabled={creating || plan.slices.length === 0}
            onclick={() => void handleCreateSubDocs()}
        >
            <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanWheat" /></svg>
            {creating ? t(i18n, "docSlicing.creating") : t(i18n, "docSlicing.createSubDocs", { count: plan.totalSlices })}
        </button>
    </div>
</div>
