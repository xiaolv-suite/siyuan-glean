<script lang="ts">
    /**
     * 手机阅读五态快捷悬浮条（Mobile Spec v1）。
     * 单手流转状态（稍后/进行/读完/归档），触控目标 ≥44px，毛玻璃，safe-area 适配，
     * 内置 Aa 排版字号/行距调节弹层（偏好持久化），对接 mobile-viewport 键盘避让。
     */
    import type { GleanFacade } from "../types";
    import type { ClipStatus } from "../domain/schema";
    import { t } from "../libs/i18n";
    import { lvLaunchpad } from "../libs/notice";
    import { loadUiPrefs, saveUiPrefs, type MobileReaderAppearance, DEFAULT_MOBILE_READER_APPEARANCE } from "../services/prefs";
    import { isMobileKeyboardOpen } from "../domain/mobile-viewport";

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

    // 状态切换处理
    async function handleStateClick(targetStatus: ClipStatus) {
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

    // 键盘检测与输入框聚焦避让
    $effect(() => {
        if (typeof window === "undefined") return;

        const checkKeyboard = () => {
            const visualViewport = window.visualViewport;
            const metrics = {
                innerHeight: window.innerHeight,
                viewportHeight: visualViewport?.height ?? window.innerHeight,
                viewportOffsetTop: visualViewport?.offsetTop ?? 0,
            };
            const open = isMobileKeyboardOpen(metrics);
            if (open !== keyboardHidden) {
                keyboardHidden = open;
            }
        };

        const handleFocusIn = (e: FocusEvent) => {
            const el = e.target as HTMLElement;
            if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
                // 如果是 Aa 面板自己的 range 滑块，不触发整体隐藏
                if (el.classList.contains("glean-mobile-slider")) return;
                keyboardHidden = true;
            }
        };

        const handleFocusOut = () => {
            // 短延迟检测是否真的失焦
            setTimeout(() => {
                const active = document.activeElement as HTMLElement;
                if (!active || !(active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
                    keyboardHidden = false;
                }
            }, 100);
        };

        window.addEventListener("resize", checkKeyboard);
        window.visualViewport?.addEventListener("resize", checkKeyboard);
        document.addEventListener("focusin", handleFocusIn);
        document.addEventListener("focusout", handleFocusOut);

        return () => {
            window.removeEventListener("resize", checkKeyboard);
            window.visualViewport?.removeEventListener("resize", checkKeyboard);
            document.removeEventListener("focusin", handleFocusIn);
            document.removeEventListener("focusout", handleFocusOut);
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
