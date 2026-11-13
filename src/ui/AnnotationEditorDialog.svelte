<script lang="ts">
    import { tick } from "svelte";
    import type { App } from "siyuan";
    import { showMessage } from "../libs/notice";
    import { t, type I18nBundle } from "../libs/i18n";
    import { installModalFocus } from "../libs/modal-focus";
    import {
        formatHighlightShare, formatHighlightTime, resolveAnnotationTagDisplay,
        type AnnotationTagDef,
    } from "../domain/highlights";
    import {
        addAnnotationReply, deleteAnnotation, removeAnnotationReply,
        setAnnotationColor, setAnnotationTag, updateHighlightMemo,
        type HighlightItem,
    } from "../services/highlights";
    import { openWhaleCommentEditor } from "../services/siyuan-comment-bridge";

    interface Props {
        item: HighlightItem | null;
        items?: readonly HighlightItem[];
        i18n: I18nBundle;
        app?: App | null;
        whaleTags: readonly AnnotationTagDef[];
        whaleInstalled?: boolean;
        onClose: () => void;
        onSelectItem?: (next: HighlightItem) => void;
        onUpdated: (next: HighlightItem) => void;
        onDeleted: (id: string) => void;
        onJumpToSource?: (item: HighlightItem) => void;
        onJumpToComment?: (item: HighlightItem) => void;
    }

    let {
        item,
        items = [],
        i18n,
        app = null,
        whaleTags,
        whaleInstalled = false,
        onClose,
        onSelectItem,
        onUpdated,
        onDeleted,
        onJumpToSource,
        onJumpToComment,
    }: Props = $props();

    const instanceId = $props.id();
    const titleId = `glean-ann-editor-title-${instanceId}`;
    const colors: Array<"yellow" | "red" | "blue" | "green"> = ["yellow", "red", "blue", "green"];

    let dialogEl = $state<HTMLElement | null>(null);
    let textareaEl = $state<HTMLTextAreaElement | null>(null);
    let returnFocus: HTMLElement | null = null;
    let disposeFocus = () => {};

    let memoDraft = $state("");
    let colorDraft = $state<"yellow" | "red" | "blue" | "green">("yellow");
    let tagDraft = $state("");
    let repliesDraft = $state<NonNullable<HighlightItem["replies"]>>([]);
    let replyInput = $state("");

    let saving = $state(false);
    let replyBusy = $state(false);
    let deleting = $state(false);
    let confirmDelete = $state(false);
    let activeItemId = "";

    $effect(() => {
        const current = item;
        if (!current) {
            activeItemId = "";
            disposeFocus();
            disposeFocus = () => {};
            return;
        }
        if (current.id !== activeItemId) {
            activeItemId = current.id;
            returnFocus = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            memoDraft = current.memo || "";
            const normColor = (current.color === "red" || current.color === "blue" || current.color === "green")
                ? current.color
                : "yellow";
            colorDraft = normColor;
            tagDraft = current.annotationTag || "";
            repliesDraft = current.replies ? [...current.replies] : [];
            replyInput = "";
            confirmDelete = false;
            void tick().then(() => {
                if (dialogEl) {
                    disposeFocus();
                    disposeFocus = installModalFocus(dialogEl, {
                        onClose,
                        returnFocus,
                    });
                    textareaEl?.focus({ preventScroll: true });
                }
            });
        }
        return () => {
            disposeFocus();
            disposeFocus = () => {};
        };
    });

    const isDirty = $derived.by(() => {
        if (!item) return false;
        const baseColor = (item.color === "red" || item.color === "blue" || item.color === "green") ? item.color : "yellow";
        return memoDraft.trim() !== (item.memo || "").trim()
            || colorDraft !== baseColor
            || tagDraft !== (item.annotationTag || "");
    });

    const currentIndex = $derived(item && items.length > 0 ? items.findIndex((entry) => entry.id === item.id) : -1);
    const prevItem = $derived(currentIndex > 0 ? items[currentIndex - 1] : null);
    const nextItem = $derived(currentIndex >= 0 && currentIndex + 1 < items.length ? items[currentIndex + 1] : null);

    async function copyQuoteOnly(): Promise<void> {
        if (!item) return;
        try {
            await navigator.clipboard.writeText(formatHighlightShare({ ...item, memo: memoDraft.trim() || undefined }));
            showMessage(t(i18n, "highlight.shareCopied"), 2000);
        } catch {
            showMessage(t(i18n, "highlight.clipboardUnavailable"), 2500);
        }
    }

    async function saveChanges(closeAfter = true): Promise<boolean> {
        if (!item || saving) return false;
        saving = true;
        try {
            let nextItem: HighlightItem = { ...item, replies: [...repliesDraft] };
            const baseColor = (item.color === "red" || item.color === "blue" || item.color === "green") ? item.color : "yellow";

            if (memoDraft.trim() !== (item.memo || "").trim()) {
                const savedMemo = await updateHighlightMemo(nextItem, memoDraft, app);
                nextItem = { ...nextItem, memo: savedMemo || undefined };
            }
            if (colorDraft !== baseColor) {
                const savedColor = await setAnnotationColor(nextItem, colorDraft);
                nextItem = { ...nextItem, color: savedColor, customColor: undefined };
            }
            if (tagDraft !== (item.annotationTag || "")) {
                const savedTag = await setAnnotationTag(nextItem, tagDraft, app);
                nextItem = { ...nextItem, annotationTag: savedTag || undefined };
            }
            onUpdated(nextItem);
            if (closeAfter) {
                showMessage(t(i18n, "highlight.memoSaved"), 2000);
                onClose();
            }
            return true;
        } catch (error) {
            console.warn("[glean] 批注精修保存失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
            return false;
        } finally {
            saving = false;
        }
    }

    async function navigateTo(target: HighlightItem | null): Promise<void> {
        if (!target || !onSelectItem || saving || deleting) return;
        if (isDirty) {
            const ok = await saveChanges(false);
            if (!ok) return;
        }
        onSelectItem(target);
    }

    function insertTemplate(prefixKey: string): void {
        const prefix = t(i18n, prefixKey);
        if (!memoDraft.trim()) {
            memoDraft = prefix;
        } else if (!memoDraft.includes(prefix.trim())) {
            memoDraft = `${memoDraft.trimEnd()}\n${prefix}`;
        }
        textareaEl?.focus({ preventScroll: true });
    }

    function onDialogKeyDown(e: KeyboardEvent): void {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
            const idx = ["1", "2", "3", "4"].indexOf(e.key);
            if (idx >= 0) {
                e.preventDefault();
                colorDraft = colors[idx];
                return;
            }
        }
        if (e.altKey && !e.ctrlKey && !e.metaKey) {
            if (e.key === "ArrowLeft" && prevItem) {
                e.preventDefault();
                void navigateTo(prevItem);
            } else if (e.key === "ArrowRight" && nextItem) {
                e.preventDefault();
                void navigateTo(nextItem);
            }
        }
    }

    async function submitReply(): Promise<void> {
        if (!item || replyBusy || !replyInput.trim()) return;
        replyBusy = true;
        try {
            const nextReplies = await addAnnotationReply({ ...item, replies: repliesDraft }, replyInput, app);
            repliesDraft = nextReplies;
            replyInput = "";
            onUpdated({ ...item, replies: nextReplies });
            showMessage(t(i18n, "highlight.replyAdded"), 1800);
        } catch (error) {
            console.warn("[glean] 追加追记失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            replyBusy = false;
        }
    }

    async function deleteReply(replyId: string): Promise<void> {
        if (!item || replyBusy) return;
        replyBusy = true;
        try {
            const nextReplies = await removeAnnotationReply({ ...item, replies: repliesDraft }, replyId);
            repliesDraft = nextReplies;
            onUpdated({ ...item, replies: nextReplies });
            showMessage(t(i18n, "annotationEditor.replyDeleted"), 1800);
        } catch (error) {
            console.warn("[glean] 删除追记失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            replyBusy = false;
        }
    }

    async function handleDelete(): Promise<void> {
        if (!item || deleting) return;
        if (!confirmDelete) {
            confirmDelete = true;
            window.setTimeout(() => { confirmDelete = false; }, 3200);
            return;
        }
        deleting = true;
        try {
            await deleteAnnotation(item, item.source?.type === "b" ? "delete-block" : "unmark");
            showMessage(t(i18n, "highlight.deleted"), 2000);
            onDeleted(item.id);
            onClose();
        } catch (error) {
            console.warn("[glean] 删除批注失败:", error);
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        } finally {
            deleting = false;
        }
    }

    const activeTagDef = $derived(resolveAnnotationTagDisplay(tagDraft, whaleTags));
</script>

{#if item}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
        class="glean-ann-editor-backdrop"
        role="presentation"
        onclick={(e) => { if (e.target === e.currentTarget && !saving && !deleting) onClose(); }}
    >
        <div
            bind:this={dialogEl}
            class="glean-ann-editor glean-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabindex="-1"
            onkeydown={onDialogKeyDown}
        >
            <header class="glean-ann-editor__head">
                <div class="glean-ann-editor__title-group">
                    <span class="glean-ann-editor__badge-icon" aria-hidden="true">
                        <svg class="glean-icon glean-icon--sm"><use href="#iconGleanEdit" /></svg>
                    </span>
                    <div class="glean-ann-editor__title-copy">
                        <h2 id={titleId} class="glean-ann-editor__title">{t(i18n, "annotationEditor.title")}</h2>
                        <div class="glean-ann-editor__sub">
                            {#if item.annotationKind === "siyuan-comment"}
                                <span class="glean-annotation-kind">{t(i18n, "highlight.kindWhale")}</span>
                            {:else if item.annotationKind === "native-memo"}
                                <span class="glean-annotation-kind">{t(i18n, "highlight.kindMemo")}</span>
                            {:else}
                                <span class="glean-annotation-kind">{t(i18n, "highlight.kindGlean")}</span>
                            {/if}
                            {#if item.title}
                                <span class="glean-ann-editor__doc-title" title={item.title}>{item.title}</span>
                            {/if}
                            {#if formatHighlightTime(item.id)}
                                <span class="glean-ann-editor__time">{formatHighlightTime(item.id)}</span>
                            {/if}
                        </div>
                    </div>
                </div>
                <div class="glean-ann-editor__head-ops">
                    {#if currentIndex >= 0 && items.length > 1 && onSelectItem}
                        <div class="glean-ann-editor__pager" role="group" aria-label={t(i18n, "annotationEditor.title")}>
                            <button
                                type="button"
                                class="glean-icon-btn glean-ann-editor__pager-btn"
                                disabled={!prevItem || saving || deleting}
                                title={t(i18n, "annotationEditor.prevItem")}
                                aria-label={t(i18n, "annotationEditor.prevItem")}
                                onclick={() => void navigateTo(prevItem)}
                            >
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowLeft" /></svg>
                            </button>
                            <span class="glean-ann-editor__pager-pos">{currentIndex + 1}/{items.length}</span>
                            <button
                                type="button"
                                class="glean-icon-btn glean-ann-editor__pager-btn"
                                disabled={!nextItem || saving || deleting}
                                title={t(i18n, "annotationEditor.nextItem")}
                                aria-label={t(i18n, "annotationEditor.nextItem")}
                                onclick={() => void navigateTo(nextItem)}
                            >
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanArrowRight" /></svg>
                            </button>
                        </div>
                    {/if}
                    <button
                        type="button"
                        class="glean-icon-btn glean-ann-editor__close"
                        title={t(i18n, "action.close")}
                        aria-label={t(i18n, "action.close")}
                        onclick={onClose}
                    >
                        <svg class="glean-icon" aria-hidden="true"><use href="#iconGleanClose" /></svg>
                    </button>
                </div>
            </header>

            <div class="glean-ann-editor__body">
                <!-- 原文摘录展示卡片 -->
                <section class="glean-ann-editor__quote-box glean-ann-editor__quote-box--{colorDraft}">
                    <div class="glean-ann-editor__section-head">
                        <span class="glean-ann-editor__section-label">{t(i18n, "annotationEditor.quoteLabel")}</span>
                        <div class="glean-ann-editor__quote-ops">
                            {#if onJumpToSource}
                                <button
                                    type="button"
                                    class="glean-ann-editor__mini-link"
                                    onclick={() => { if (item) onJumpToSource(item); onClose(); }}
                                >
                                    <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanExternal" /></svg>
                                    <span>{t(i18n, "highlight.original")}</span>
                                </button>
                            {/if}
                            {#if item.commentDocId && onJumpToComment}
                                <button
                                    type="button"
                                    class="glean-ann-editor__mini-link"
                                    onclick={() => { if (item) onJumpToComment(item); onClose(); }}
                                >
                                    <span>{t(i18n, "highlight.jumpToComment")}</span>
                                </button>
                            {/if}
                            <button
                                type="button"
                                class="glean-ann-editor__mini-link"
                                onclick={() => void copyQuoteOnly()}
                            >
                                <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
                                <span>{t(i18n, "highlight.copyShare")}</span>
                            </button>
                        </div>
                    </div>
                    <blockquote class="glean-ann-editor__quote-text">{item.text}</blockquote>
                </section>

                <!-- 颜色 + 分类标记栏 -->
                <div class="glean-ann-editor__meta-grid">
                    <div class="glean-ann-editor__field">
                        <span class="glean-ann-editor__section-label">{t(i18n, "annotationEditor.colorLabel")}</span>
                        <div class="glean-ann-editor__colors" role="radiogroup" aria-label={t(i18n, "annotationEditor.colorLabel")}>
                            {#each colors as c}
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={colorDraft === c}
                                    class="glean-ann-editor__color-btn glean-ann-editor__color-btn--{c}"
                                    class:glean-ann-editor__color-btn--active={colorDraft === c}
                                    title={t(i18n, `reader.color.${c}`)}
                                    aria-label={t(i18n, `reader.color.${c}`)}
                                    onclick={() => { colorDraft = c; }}
                                >
                                    <span class="glean-reader__highlight-dot glean-reader__highlight-dot--{c}"></span>
                                </button>
                            {/each}
                        </div>
                    </div>
                    <div class="glean-ann-editor__field glean-ann-editor__field--grow">
                        <span class="glean-ann-editor__section-label">
                            {t(i18n, "annotationEditor.tagLabel")}
                            {#if activeTagDef}
                                <span class="glean-annotation-tag glean-annotation-tag--{activeTagDef.value}">{activeTagDef.icon} {activeTagDef.label}</span>
                            {/if}
                        </span>
                        <div class="glean-ann-editor__tags">
                            {#each whaleTags as tagDef (tagDef.value)}
                                <button
                                    type="button"
                                    class="glean-annotation-tag-picker__btn"
                                    class:glean-annotation-tag-picker__btn--active={tagDraft === tagDef.value}
                                    onclick={() => { tagDraft = tagDraft === tagDef.value ? "" : tagDef.value; }}
                                >{tagDef.icon} {tagDef.label}</button>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- 想法批注编辑区 -->
                <section class="glean-ann-editor__thought">
                    <div class="glean-ann-editor__section-head">
                        <label for="glean-ann-thought-{instanceId}" class="glean-ann-editor__section-label">
                            {t(i18n, "annotationEditor.thoughtLabel")}
                        </label>
                        <span class="glean-ann-editor__hint">
                            {t(i18n, "annotationEditor.charCount", { n: memoDraft.trim().length })} · {t(i18n, "annotationEditor.thoughtHint")}
                        </span>
                    </div>
                    <div class="glean-ann-editor__templates">
                        {#each ["annotationEditor.tplInsight", "annotationEditor.tplAction", "annotationEditor.tplQuestion", "annotationEditor.tplQuote"] as tplKey}
                            <button type="button" class="glean-ann-editor__tpl-chip" onclick={() => insertTemplate(tplKey)}>
                                {t(i18n, tplKey).replace(/[：:]\s*$/, "")}
                            </button>
                        {/each}
                    </div>
                    <textarea
                        bind:this={textareaEl}
                        id="glean-ann-thought-{instanceId}"
                        class="glean-ann-editor__textarea"
                        rows="4"
                        bind:value={memoDraft}
                        placeholder={t(i18n, "highlight.memoPlaceholderEdit")}
                        onkeydown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                                e.preventDefault();
                                void saveChanges();
                            }
                        }}
                    ></textarea>
                </section>

                <!-- 追记时间线 -->
                <section class="glean-ann-editor__replies">
                    <div class="glean-ann-editor__section-head">
                        <span class="glean-ann-editor__section-label">
                            {t(i18n, "annotationEditor.repliesLabel")}
                            {#if repliesDraft.length > 0}({repliesDraft.length}){/if}
                        </span>
                    </div>
                    {#if repliesDraft.length > 0}
                        <div class="glean-ann-editor__reply-list">
                            {#each repliesDraft as reply (reply.id)}
                                <div class="glean-ann-editor__reply-item">
                                    <div class="glean-ann-editor__reply-content">{reply.md}</div>
                                    <div class="glean-ann-editor__reply-foot">
                                        <span class="glean-ann-editor__reply-meta">
                                            {[reply.author, reply.time].filter(Boolean).join(" · ") || "—"}
                                        </span>
                                        <button
                                            type="button"
                                            class="glean-ann-editor__reply-del"
                                            disabled={replyBusy}
                                            title={t(i18n, "annotationEditor.replyDelete")}
                                            aria-label={t(i18n, "annotationEditor.replyDelete")}
                                            onclick={() => void deleteReply(reply.id)}
                                        >
                                            <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanTrash" /></svg>
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="glean-ann-editor__replies-empty">{t(i18n, "annotationEditor.repliesEmpty")}</p>
                    {/if}
                    <div class="glean-ann-editor__reply-compose">
                        <input
                            type="text"
                            class="glean-ann-editor__reply-input"
                            bind:value={replyInput}
                            placeholder={t(i18n, "highlight.replyPlaceholder")}
                            onkeydown={(e) => {
                                if (e.key === "Enter" && !e.isComposing && replyInput.trim()) {
                                    e.preventDefault();
                                    void submitReply();
                                }
                            }}
                        />
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-btn--sm"
                            disabled={replyBusy || !replyInput.trim()}
                            onclick={() => void submitReply()}
                        >
                            {t(i18n, "annotationEditor.replySend")}
                        </button>
                    </div>
                </section>
            </div>

            <footer class="glean-ann-editor__foot">
                <div class="glean-ann-editor__foot-left">
                    <button
                        type="button"
                        class="glean-btn glean-btn--ghost glean-ann-editor__del-btn"
                        class:glean-ann-editor__del-btn--confirm={confirmDelete}
                        disabled={deleting || saving}
                        onclick={() => void handleDelete()}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanTrash" /></svg>
                        <span>{t(i18n, confirmDelete ? "highlight.deleteConfirm" : "highlight.deleteAnnotation")}</span>
                    </button>
                    {#if item.annotationKind === "siyuan-comment" && whaleInstalled}
                        <button
                            type="button"
                            class="glean-btn glean-btn--ghost glean-btn--sm"
                            onclick={(e) => {
                                if (item) openWhaleCommentEditor(app, item.commentBlockId || item.id, e.currentTarget as HTMLElement);
                                onClose();
                            }}
                        >
                            <span>🐋 {t(i18n, "annotationEditor.openWhale")}</span>
                        </button>
                    {/if}
                </div>
                <div class="glean-ann-editor__foot-right">
                    <button type="button" class="glean-btn glean-btn--ghost" disabled={saving} onclick={onClose}>
                        {t(i18n, "action.cancel")}
                    </button>
                    <button
                        type="button"
                        class="glean-btn glean-btn--pri"
                        disabled={saving || !isDirty}
                        aria-busy={saving}
                        onclick={() => void saveChanges()}
                    >
                        <svg class="glean-icon glean-icon--xs" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
                        <span>{t(i18n, "annotationEditor.saveAll")}</span>
                    </button>
                </div>
            </footer>
        </div>
    </div>
{/if}

<style>
    .glean-ann-editor-backdrop {
        position: fixed;
        inset: 0;
        z-index: var(--glean-z-modal, 10000);
        display: grid;
        place-items: center;
        padding: var(--glean-space-4, 16px);
        background: color-mix(in srgb, #0b1317 48%, transparent);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
    }

    .glean-ann-editor {
        width: min(640px, 100%);
        max-height: min(88dvh, 780px);
        display: flex;
        flex-direction: column;
        background: var(--glean-card-surface, #ffffff);
        color: var(--glean-ink, #1f2937);
        border: 1px solid var(--glean-border-soft);
        border-radius: var(--glean-radius-xl, 20px);
        box-shadow: var(--glean-shadow-float);
        overflow: hidden;
        animation: glean-dialog-pop 0.16s var(--glean-ease-out) both;
    }

    .glean-ann-editor__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 20px 14px;
        border-bottom: 1px solid var(--glean-border-soft);
        background: color-mix(in srgb, var(--glean-app-background) 65%, var(--glean-card-surface));
    }

    .glean-ann-editor__head-ops {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .glean-ann-editor__pager {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px 4px;
        border-radius: var(--glean-radius-pill);
        background: var(--glean-inset-surface);
        border: 1px solid var(--glean-border-soft);
    }

    .glean-ann-editor__pager-btn {
        width: 24px;
        height: 24px;
        padding: 0;
    }

    .glean-ann-editor__pager-pos {
        font-size: 11px;
        font-weight: 600;
        color: var(--glean-ink-2);
        font-variant-numeric: tabular-nums;
        padding: 0 4px;
    }

    .glean-ann-editor__templates {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
    }

    .glean-ann-editor__tpl-chip {
        padding: 3px 9px;
        border-radius: var(--glean-radius-pill);
        border: 1px solid var(--glean-border-soft);
        background: var(--glean-inset-surface);
        color: var(--glean-ink-2);
        font-size: 11px;
        cursor: pointer;
        transition: border-color 140ms ease, color 140ms ease, background 140ms ease;
    }

    .glean-ann-editor__tpl-chip:hover {
        border-color: var(--glean-color-action);
        color: var(--glean-color-action);
        background: var(--glean-primary-soft);
    }

    .glean-ann-editor__title-group {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
    }

    .glean-ann-editor__badge-icon {
        width: 34px;
        height: 34px;
        border-radius: var(--glean-radius-md, 12px);
        background: var(--glean-primary-soft);
        color: var(--glean-color-action);
        display: grid;
        place-items: center;
        flex-shrink: 0;
    }

    .glean-ann-editor__title-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .glean-ann-editor__title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        line-height: 1.25;
        color: var(--glean-ink);
    }

    .glean-ann-editor__sub {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 11.5px;
        color: var(--glean-ink-2);
    }

    .glean-ann-editor__doc-title {
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
    }

    .glean-ann-editor__time {
        opacity: 0.7;
        font-variant-numeric: tabular-nums;
    }

    .glean-ann-editor__body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .glean-ann-editor__section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
    }

    .glean-ann-editor__section-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--glean-ink-2);
    }

    .glean-ann-editor__hint {
        font-size: 11px;
        color: var(--glean-ink-3);
    }

    .glean-ann-editor__quote-box {
        padding: 12px 14px;
        border-radius: var(--glean-radius-md, 12px);
        background: var(--glean-inset-surface);
        border: 1px solid var(--glean-border-soft);
        border-left: 4px solid var(--glean-st-inbox);
    }

    .glean-ann-editor__quote-box--red { border-left-color: var(--glean-danger); }
    .glean-ann-editor__quote-box--blue { border-left-color: var(--glean-st-later); }
    .glean-ann-editor__quote-box--green { border-left-color: var(--glean-st-done); }

    .glean-ann-editor__quote-ops {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .glean-ann-editor__mini-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: 0;
        background: transparent;
        padding: 2px 6px;
        border-radius: var(--glean-radius-pill);
        font-size: 11.5px;
        color: var(--glean-color-action);
        cursor: pointer;
        transition: background 140ms ease;

        &:hover {
            background: var(--glean-primary-soft);
        }
    }

    .glean-ann-editor__quote-text {
        margin: 0;
        font-size: 14px;
        line-height: 1.65;
        color: var(--glean-ink);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-height: 140px;
        overflow-y: auto;
    }

    .glean-ann-editor__meta-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: flex-start;
    }

    .glean-ann-editor__field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .glean-ann-editor__field--grow {
        flex: 1 1 260px;
        min-width: 0;
    }

    .glean-ann-editor__colors {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: var(--glean-radius-pill);
        background: var(--glean-inset-surface);
        border: 1px solid var(--glean-border-soft);
    }

    .glean-ann-editor__color-btn {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 2px solid transparent;
        background: transparent;
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: transform 120ms ease, border-color 120ms ease;

        .glean-reader__highlight-dot {
            width: 14px;
            height: 14px;
        }

        &:hover {
            transform: scale(1.12);
        }
    }

    .glean-ann-editor__color-btn--active {
        border-color: var(--glean-ink);
        background: var(--glean-card-surface);
    }

    .glean-ann-editor__tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .glean-ann-editor__textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border-radius: var(--glean-radius-md, 12px);
        border: 1px solid var(--glean-border-soft);
        background: var(--glean-app-background);
        color: var(--glean-ink);
        font: inherit;
        font-size: 13.5px;
        line-height: 1.6;
        resize: vertical;
        min-height: 92px;
        transition: border-color 140ms ease, box-shadow 140ms ease;

        &:focus {
            outline: none;
            border-color: var(--glean-color-action);
            box-shadow: var(--glean-shadow-focus);
            background: var(--glean-card-surface);
        }
    }

    .glean-ann-editor__replies {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 14px;
        border-radius: var(--glean-radius-md, 12px);
        background: var(--glean-inset-surface);
        border: 1px solid var(--glean-border-soft);
    }

    .glean-ann-editor__reply-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 180px;
        overflow-y: auto;
    }

    .glean-ann-editor__reply-item {
        padding: 8px 10px;
        border-radius: var(--glean-radius-sm, 8px);
        background: var(--glean-card-surface);
        border: 1px solid var(--glean-border-soft);
        border-left: 3px solid var(--glean-color-action);
    }

    .glean-ann-editor__reply-content {
        font-size: 13px;
        line-height: 1.5;
        color: var(--glean-ink);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    .glean-ann-editor__reply-foot {
        margin-top: 4px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .glean-ann-editor__reply-meta {
        font-size: 11px;
        color: var(--glean-ink-3);
    }

    .glean-ann-editor__reply-del {
        border: 0;
        background: transparent;
        color: var(--glean-ink-3);
        padding: 2px 5px;
        border-radius: var(--glean-radius-xs);
        cursor: pointer;

        &:hover {
            color: var(--glean-danger);
            background: var(--glean-error-surface);
        }
    }

    .glean-ann-editor__replies-empty {
        margin: 0;
        font-size: 12px;
        color: var(--glean-ink-3);
    }

    .glean-ann-editor__reply-compose {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 2px;
    }

    .glean-ann-editor__reply-input {
        flex: 1 1 auto;
        min-width: 0;
        height: 34px;
        padding: 0 12px;
        border-radius: var(--glean-radius-pill);
        border: 1px solid var(--glean-border-soft);
        background: var(--glean-card-surface);
        color: var(--glean-ink);
        font: inherit;
        font-size: 12.5px;

        &:focus {
            outline: none;
            border-color: var(--glean-color-action);
            box-shadow: var(--glean-shadow-focus);
        }
    }

    .glean-ann-editor__foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        padding: 12px 20px;
        border-top: 1px solid var(--glean-border-soft);
        background: color-mix(in srgb, var(--glean-app-background) 55%, var(--glean-card-surface));
    }

    .glean-ann-editor__foot-left,
    .glean-ann-editor__foot-right {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .glean-ann-editor__del-btn {
        color: var(--glean-ink-2);
    }
    .glean-ann-editor__del-btn:hover {
        color: var(--glean-danger);
        background: var(--glean-error-surface);
    }
    .glean-ann-editor__del-btn--confirm {
        color: var(--glean-danger);
        background: var(--glean-error-surface);
        border-color: color-mix(in srgb, var(--glean-danger) 40%, transparent);
        font-weight: 600;
    }

    @media (max-width: 640px) {
        .glean-ann-editor-backdrop {
            padding: 0;
            align-items: end;
        }
        .glean-ann-editor {
            width: 100%;
            max-height: 92dvh;
            border-radius: 20px 20px 0 0;
        }
        .glean-ann-editor__foot {
            padding-bottom: max(12px, env(safe-area-inset-bottom));
        }
    }
</style>
