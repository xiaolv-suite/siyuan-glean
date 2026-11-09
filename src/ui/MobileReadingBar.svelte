<script lang="ts">
    /**
     * 手机阅读五态快捷悬浮条（Mobile Spec v1）。
     * 单手流转状态（稍后/进行/读完/归档），触控目标 ≥44px，毛玻璃，safe-area 适配，
     * 内置 Aa 排版字号/行距调节弹层（偏好持久化），对接 mobile-viewport 键盘避让。
     */
    import { onDestroy } from "svelte";
    import type { GleanFacade } from "../types";
    import type { ClipStatus } from "../domain/schema";
    import { t } from "../libs/i18n";
    import { lvLaunchpad } from "../libs/notice";
    import { loadUiPrefs, saveUiPrefs, type MobileReaderAppearance, DEFAULT_MOBILE_READER_APPEARANCE } from "../services/prefs";
    import { isMobileKeyboardOpen } from "../domain/mobile-viewport";
    import { parseReadingPosition, resolveLatestReadingPosition, estimateReadingPercentage, type ReadingPosition } from "../domain/reading-position";
    import { captureReadingPosition, restoreReadingPosition, readingViewport } from "../libs/reading-position";
    import { readClipContext, writeClip } from "../services/clip-store";

    interface Props {
        facade: GleanFacade;
        docId: string;
        status: ClipStatus;
        disabled?: boolean;
        onSetStatus: (status: ClipStatus) => Promise<boolean | void>;
        onArchive?: () => void;
        protyleElement?: HTMLElement | null;
    }

    let {
        facade,
        docId,
        status,
        disabled = false,
        onSetStatus,
        onArchive,
        protyleElement = null,
    }: Props = $props();

    const i18n = $derived(facade.i18n);

    // 核心单手流转状态列表
    const flowStates: Array<{ key: ClipStatus; labelKey: string; icon: string }> = [
        { key: "later", labelKey: "status.later", icon: "iconGleanClock" },
        { key: "reading", labelKey: "status.reading", icon: "iconGleanFlame" },
        { key: "done", labelKey: "status.done", icon: "iconGleanCheck" },
    ];

    let busyKey = $state<string | null>(null);
    let typographyOpen = $state(false);
    let keyboardHidden = $state(false);
    let syncNotice = $state("");
    let syncNoticeTimer: number | null = null;
    let activeBubble = $state<{ state: string; label: string; desc: string; x: number; y: number } | null>(null);
    let longPressTimer: number | null = null;
    let longPressed = false;

    // 跨端阅读进度双向取较晚时间戳恢复与微提示
    $effect(() => {
        if (!docId || typeof window === "undefined") return;

        void (async () => {
            try {
                const ctx = await readClipContext(docId);
                const remotePos = ctx?.readingPosition ?? null;
                let localPos: ReadingPosition | null = null;
                try {
                    const localRaw = localStorage.getItem(`glean_pos_${docId}`);
                    if (localRaw) localPos = parseReadingPosition(JSON.parse(localRaw));
                } catch {}

                // 双向取较晚时间戳
                const latestPos = resolveLatestReadingPosition(remotePos, localPos);
                if (latestPos && protyleElement) {
                    const restored = restoreReadingPosition(protyleElement, latestPos, docId);
                    if (restored) {
                        const viewport = readingViewport(protyleElement);
                        if (viewport) {
                            const pct = estimateReadingPercentage(viewport.scrollTop, viewport.scrollHeight, viewport.clientHeight);
                            if (pct !== null && pct > 0) {
                                syncNotice = t(i18n, "reading.syncedProgress", { pct: `${pct}%` });
                                if (syncNoticeTimer !== null) clearTimeout(syncNoticeTimer);
                                syncNoticeTimer = window.setTimeout(() => {
                                    syncNotice = "";
                                }, 3200);
                            }
                        }
                    }
                }
            } catch (err) {
                console.debug("[glean] 跨端断点读取跳过:", err);
            }
        })();
    });

    // 退出或卸载时自动保存最新进度断点
    onDestroy(() => {
        if (!docId || !protyleElement || typeof window === "undefined") return;
        try {
            const currentPos = captureReadingPosition(protyleElement, new Date(), docId);
            if (currentPos) {
                try {
                    localStorage.setItem(`glean_pos_${docId}`, JSON.stringify(currentPos));
                } catch {}
                void writeClip(facade.pluginInstance, docId, { readingPosition: currentPos }).catch(() => undefined);
            }
        } catch {}
        if (syncNoticeTimer !== null) clearTimeout(syncNoticeTimer);
        if (longPressTimer !== null) clearTimeout(longPressTimer);
    });

    // 字号与行距排版偏好
    let appearance = $state<MobileReaderAppearance>({ ...DEFAULT_MOBILE_READER_APPEARANCE });
    let saveTimer: number | null = null;

    // 应用排版样式到思源正文容器
    function applyAppearanceToDom(app: MobileReaderAppearance) {
        const target = protyleElement || (typeof document !== "undefined" ? document.querySelector(".protyle:not(.glean-protyle-host)") as HTMLElement : null);
        if (target) {
            target.style.setProperty("--glean-reader-font-size", `${app.fontSize}px`);
            target.style.setProperty("--glean-reader-line-height", `${app.lineHeight}`);
        }
    }

    $effect(() => {
        void (async () => {
            try {
                const prefs = await loadUiPrefs(facade.pluginInstance);
                if (prefs?.mobileReaderAppearance) {
                    appearance = { ...prefs.mobileReaderAppearance };
                    applyAppearanceToDom(appearance);
                }
            } catch {
                applyAppearanceToDom(appearance);
            }
        })();
    });

    function updateAppearance(patch: Partial<MobileReaderAppearance>) {
        appearance = { ...appearance, ...patch };
        applyAppearanceToDom(appearance);

        if (saveTimer !== null) clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
            void saveUiPrefs(facade.pluginInstance, { mobileReaderAppearance: { ...appearance } });
        }, 300);
    }

    function startLongPress(item: { key: ClipStatus; labelKey: string }, e: PointerEvent) {
        longPressed = false;
        if (longPressTimer !== null) clearTimeout(longPressTimer);
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        longPressTimer = window.setTimeout(() => {
            longPressed = true;
            lvLaunchpad.haptic(15);
            activeBubble = {
                state: item.key,
                label: t(i18n, item.labelKey),
                desc: t(i18n, `status.desc.${item.key}`),
                x: rect.left + rect.width / 2,
                y: rect.top,
            };
            setTimeout(() => {
                activeBubble = null;
            }, 2600);
        }, 400);
    }

    function cancelLongPress() {
        if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    // 状态切换处理
    async function handleStateClick(targetStatus: ClipStatus) {
        if (longPressed) {
            longPressed = false;
            return;
        }
        if (disabled || busyKey !== null) return;
        if (targetStatus === status) {
            // 已在当前状态，提供轻微震动感知
            lvLaunchpad.haptic(10);
            return;
        }

        busyKey = targetStatus;
        try {
            await onSetStatus(targetStatus);
            lvLaunchpad.haptic(10);
        } catch (err) {
            console.warn("[glean] 流转状态失败:", err);
        } finally {
            busyKey = null;
        }
    }

    function handleArchiveClick() {
        if (longPressed) {
            longPressed = false;
            return;
        }
        if (disabled || busyKey !== null) return;
        if (onArchive) {
            lvLaunchpad.haptic(10);
            onArchive();
        } else {
            void handleStateClick("archived");
        }
    }

    function toggleTypography() {
        lvLaunchpad.haptic(10);
        typographyOpen = !typographyOpen;
    }

    function handleBackToLibrary() {
        lvLaunchpad.haptic(10);
        if (docId) {
            void facade.openLibraryArticle(docId);
        } else {
            facade.openPanel();
        }
    }

    function isInputElement(el: Element | null): boolean {
        if (!el || !(el instanceof HTMLElement)) return false;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) {
            return !el.classList.contains("glean-mobile-slider");
        }
        return false;
    }

    // 真机教训审计：改实时读取 document.activeElement 重算，不依赖焦点移除时缺失的 focusout
    function recomputeKeyboardState() {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        const visualViewport = window.visualViewport;
        const metrics = {
            innerHeight: window.innerHeight,
            viewportHeight: visualViewport?.height ?? window.innerHeight,
            viewportOffsetTop: visualViewport?.offsetTop ?? 0,
        };
        const viewportKeyboardOpen = isMobileKeyboardOpen(metrics);
        const hasInputFocus = isInputElement(document.activeElement);

        const shouldHide = viewportKeyboardOpen || hasInputFocus;
        keyboardHidden = shouldHide;
    }

    // 键盘检测与输入框聚焦避让（实时重算 + DOM 变动监听）
    $effect(() => {
        if (typeof window === "undefined") return;

        recomputeKeyboardState();

        const handleFocusIn = () => recomputeKeyboardState();
        const handleInteraction = () => {
            // 在点击、轻触等动作后短延迟复查焦点状态
            setTimeout(recomputeKeyboardState, 80);
        };

        window.addEventListener("resize", recomputeKeyboardState);
        window.visualViewport?.addEventListener("resize", recomputeKeyboardState);
        window.visualViewport?.addEventListener("scroll", recomputeKeyboardState);
        document.addEventListener("focusin", handleFocusIn);
        document.addEventListener("pointerdown", handleInteraction, { passive: true });

        // 监听焦点元素被直接从 DOM 移除的场景
        let observer: MutationObserver | null = null;
        if (typeof MutationObserver !== "undefined" && document.body) {
            observer = new MutationObserver(() => {
                recomputeKeyboardState();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        return () => {
            window.removeEventListener("resize", recomputeKeyboardState);
            window.visualViewport?.removeEventListener("resize", recomputeKeyboardState);
            window.visualViewport?.removeEventListener("scroll", recomputeKeyboardState);
            document.removeEventListener("focusin", handleFocusIn);
            document.removeEventListener("pointerdown", handleInteraction);
            observer?.disconnect();
            if (saveTimer !== null) clearTimeout(saveTimer);
        };
    });
</script>

<!-- Aa 排版调节浮层（毛玻璃底部弹层） -->
{#if typographyOpen}
    <div
        class="glean-mobile-sheet-backdrop"
        role="presentation"
        onclick={() => (typographyOpen = false)}
        onkeydown={(e) => { if (e.key === "Escape") typographyOpen = false; }}
    >
        <div
            class="glean-mobile-typography-sheet"
            role="dialog"
            tabindex="-1"
            aria-modal="true"
            aria-label={t(i18n, "mobile.readingBar.typography")}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
        >
            <div class="glean-mobile-typography-sheet__handle" aria-hidden="true"></div>
            <div class="glean-mobile-typography-sheet__header">
                <span class="glean-mobile-typography-sheet__title">{t(i18n, "mobile.readingBar.typography")}</span>
                <button
                    type="button"
                    class="glean-mobile-typography-sheet__close"
                    aria-label={t(i18n, "action.close")}
                    onclick={() => (typographyOpen = false)}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanClose" /></svg>
                </button>
            </div>

            <!-- 字号拖动条 -->
            <div class="glean-mobile-typography-row">
                <div class="glean-mobile-typography-row__label">
                    <span>{t(i18n, "mobile.readingBar.fontSize")}</span>
                    <strong>{appearance.fontSize}px</strong>
                </div>
                <div class="glean-mobile-slider-wrap">
                    <span class="glean-mobile-slider__tag">小</span>
                    <input
                        type="range"
                        class="glean-mobile-slider"
                        min="12"
                        max="26"
                        step="1"
                        value={appearance.fontSize}
                        oninput={(e) => updateAppearance({ fontSize: parseInt((e.target as HTMLInputElement).value, 10) })}
                    />
                    <span class="glean-mobile-slider__tag">大</span>
                </div>
            </div>

            <!-- 行距拖动条 -->
            <div class="glean-mobile-typography-row">
                <div class="glean-mobile-typography-row__label">
                    <span>{t(i18n, "mobile.readingBar.lineHeight")}</span>
                    <strong>{appearance.lineHeight}</strong>
                </div>
                <div class="glean-mobile-slider-wrap">
                    <span class="glean-mobile-slider__tag">紧凑</span>
                    <input
                        type="range"
                        class="glean-mobile-slider"
                        min="1.3"
                        max="2.3"
                        step="0.1"
                        value={appearance.lineHeight}
                        oninput={(e) => updateAppearance({ lineHeight: parseFloat((e.target as HTMLInputElement).value) })}
                    />
                    <span class="glean-mobile-slider__tag">宽松</span>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- 跨端进度同步微提示 -->
{#if syncNotice}
    <div class="glean-mobile-reading-bar__sync-badge" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanCheck" /></svg>
        <span>{syncNotice}</span>
    </div>
{/if}

<!-- 长按状态说明气泡 -->
{#if activeBubble}
    <div
        class="glean-mobile-reading-bar__bubble"
        style:left={`${activeBubble.x}px`}
        role="tooltip"
    >
        <strong>{activeBubble.label}</strong>
        <span>{activeBubble.desc}</span>
        <div class="glean-mobile-reading-bar__bubble-arrow" aria-hidden="true"></div>
    </div>
{/if}

<!-- 手机阅读五态快捷悬浮条（主条） -->
<aside
    class="glean-mobile-reading-bar"
    class:glean-mobile-reading-bar--hidden={keyboardHidden}
    aria-label={t(i18n, "mobile.readingBar.title")}
>
    <!-- 左侧返回读库入口 -->
    <button
        type="button"
        class="glean-mobile-reading-bar__btn glean-mobile-reading-bar__btn--home"
        title={t(i18n, "reading.backToLibrary")}
        aria-label={t(i18n, "reading.backToLibrary")}
        onclick={handleBackToLibrary}
    >
        <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanWheat" /></svg>
    </button>

    <div class="glean-mobile-reading-bar__divider" aria-hidden="true"></div>

    <!-- 稍后 / 进行 / 读完 核心单手流转按钮 -->
    <div class="glean-mobile-reading-bar__states">
        {#each flowStates as item (item.key)}
            <button
                type="button"
                class="glean-mobile-reading-bar__btn glean-mobile-reading-bar__btn--state"
                class:glean-mobile-reading-bar__btn--active={status === item.key}
                class:glean-mobile-reading-bar__btn--busy={busyKey === item.key}
                disabled={disabled || busyKey !== null}
                aria-pressed={status === item.key}
                onpointerdown={(e) => startLongPress(item, e)}
                onpointerup={cancelLongPress}
                onpointercancel={cancelLongPress}
                onclick={() => handleStateClick(item.key)}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true"><use href={`#${item.icon}`} /></svg>
                <span>{t(i18n, item.labelKey)}</span>
            </button>
        {/each}

        <!-- 归档按钮 -->
        <button
            type="button"
            class="glean-mobile-reading-bar__btn glean-mobile-reading-bar__btn--state"
            class:glean-mobile-reading-bar__btn--active={status === "archived"}
            class:glean-mobile-reading-bar__btn--busy={busyKey === "archived"}
            disabled={disabled || busyKey !== null}
            aria-pressed={status === "archived"}
            onpointerdown={(e) => startLongPress({ key: "archived", labelKey: "status.archived" }, e)}
            onpointerup={cancelLongPress}
            onpointercancel={cancelLongPress}
            onclick={handleArchiveClick}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#iconGleanArchive" /></svg>
            <span>{t(i18n, "status.archived")}</span>
        </button>
    </div>

    <div class="glean-mobile-reading-bar__divider" aria-hidden="true"></div>

    <!-- 右侧 Aa 排版调节按钮 -->
    <button
        type="button"
        class="glean-mobile-reading-bar__btn glean-mobile-reading-bar__btn--aa"
        class:glean-mobile-reading-bar__btn--active={typographyOpen}
        title={t(i18n, "mobile.readingBar.typography")}
        aria-label={t(i18n, "mobile.readingBar.typography")}
        onclick={toggleTypography}
    >
        <span class="glean-mobile-reading-bar__aa-text" aria-hidden="true">Aa</span>
    </button>
</aside>
