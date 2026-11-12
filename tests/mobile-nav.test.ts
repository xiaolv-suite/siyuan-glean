import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMobileKeyboardOpen, mobileKeyboardInset } from "../src/domain/mobile-viewport.ts";
import { clampSurfaceSwipe, resolveSurfaceSwipe } from "../src/domain/surface-swipe.ts";

const root = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

test("mobile dock exposes four navigation destinations without changing desktop views", () => {
    const source = read("src/ui/DockPanel.svelte");
    assert.match(source, /class:glean-panel--mobile=\{facade\.isMobile\}/);
    assert.match(source, /\{#if !facade\.isMobile\}/);
    assert.match(source, /<nav class="glean-mobile-nav"/);
    assert.match(source, /mobile\.navHome/);
    assert.match(source, /mobile\.navLibrary/);
    assert.match(source, /mobile\.navHighlights/);
    assert.match(source, /mobile\.navSettings/);
    assert.match(source, /aria-current=\{mobileActive === item\.key \? "page" : undefined\}/);
    assert.match(source, /facade\.openSettings\(\)/);
});

test("desktop Dock keeps a compact four-view navigator and wide workbench uses the measured host width", () => {
    const source = read("src/ui/DockPanel.svelte");
    const styles = read("src/index.scss");
    assert.match(source, /class="glean-panel-host"/);
    assert.match(source, /<div class="glean-views">/);
    assert.match(styles, /\.glean-panel-host\s*\{[\s\S]*container-name:\s*glean-shell/);
    assert.match(styles, /\.glean-panel-host > \.glean-panel\s*\{[\s\S]*width:\s*100%[\s\S]*min-width:\s*0/);
    assert.match(styles, /@container glean-shell \(min-width: 760px\)[\s\S]*\.glean-panel--shell:not\(\.glean-panel--mobile\)\s*\{[\s\S]*display:\s*grid/);
    assert.match(styles, /@container glean-shell \(max-width: 759px\)[\s\S]*\.glean-panel--shell:not\(\.glean-panel--mobile\) \.glean-views\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
});

test("mobile more menu provides a reachable statistics view", () => {
    const source = read("src/ui/DockPanel.svelte");
    assert.match(source, /aria-current=\{view === "stats" \? "page" : undefined\}/);
    assert.match(source, /closeMobileMore\(true\); selectMobileView\("stats"\)/);
    assert.match(source, /t\(i18n, "view\.stats"\)/);
});

test("mobile stats navigation returns focus after removing the More menu", () => {
    const source = read("src/ui/DockPanel.svelte");
    assert.match(source, /function closeMobileMore\(returnFocus = false\)/);
    assert.match(source, /if \(returnFocus\)[\s\S]*mobileMoreTrigger\?\.focus\(\)/);
});

test("no-cache initial sync failure has one inline alert and retry surface", () => {
    const source = read("src/ui/DockPanel.svelte");
    assert.match(source, /\{#if loadError && \(view !== "resurface" \|\| !!index\.updatedAt\)\}/);
    assert.match(source, /\{#if !\(view === "resurface" && loadError && !index\.updatedAt\)\}[\s\S]*class=\{`glean-mobile-task/);
});

test("today's gleaning distinguishes first sync, failed sync, and a real empty library", () => {
    const dock = read("src/ui/DockPanel.svelte");
    const view = read("src/ui/ResurfaceView.svelte");
    assert.match(dock, /\{loading\}[\s\S]*\{loadError\}[\s\S]*onRetry=\{\(\) => void reload\(\)\}/);
    assert.match(view, /if loading && !index\.updatedAt/);
    assert.match(view, /else if loadError && !index\.updatedAt/);
    assert.match(view, /resurface\.loading/);
    assert.match(view, /resurface\.loadFailed/);
    assert.match(view, /action\.retry/);
    assert.match(view, /else if picks\.length === 0 && clipCount === 0 && candidateCount === 0/);
});

test("mobile dock keeps touch-sized, theme-driven bottom navigation styles", () => {
    const source = read("src/index.scss");
    assert.match(source, /\.glean-panel--mobile\s*\{/);
    assert.match(source, /\.glean-mobile-nav\s*\{/);
    assert.match(source, /\.glean-panel--mobile\s*\{[\s\S]*?\.glean-mobile-nav\s*\{/);
    assert.doesNotMatch(source, /\.glean-panel--mobile\s*>\s*\.glean-mobile-nav/);
    assert.doesNotMatch(source, /\.glean-panel--mobile\s*>\s*\.glean-panel__head/);
    assert.match(source, /min-height:\s*48px/);
    assert.match(source, /var\(--b3-theme-surface\)/);
    assert.match(source, /env\(safe-area-inset-bottom/);
});

test("mobile dock exposes title, view-level back, more actions, and real reload state", () => {
    const source = read("src/ui/DockPanel.svelte");
    assert.match(source, /class="glean-mobile-topbar"/);
    assert.match(source, /mobileBack/);
    assert.match(source, /mobileMoreOpen/);
    assert.match(source, /mobileTaskState/);
    assert.match(source, /role="status"/);
    assert.match(source, /aria-expanded=\{mobileMoreOpen\}/);
    assert.match(source, /openPopup\(\)/);
    assert.match(source, /facade\.openMigrate\(\)/);
    assert.match(source, /facade\.openImport\(\)/);
    assert.match(source, /facade\.openSettings\(\)/);
});

test("mobile top actions keep a 44px touch target and theme variables", () => {
    const source = read("src/index.scss");
    assert.match(source, /\.glean-panel--mobile \.glean-mobile-topbar/);
    assert.match(source, /\.glean-mobile-topbar__back,/);
    assert.match(source, /min-width:\s*44px/);
    assert.match(source, /min-height:\s*44px/);
    assert.match(source, /var\(--b3-theme-background-light\)/);
    assert.match(source, /var\(--b3-border-color\)/);
});

test("mobile library filters use a draft drawer with explicit apply and clear actions", () => {
    const source = read("src/ui/DockPanel.svelte");
    assert.match(source, /mobileFilterOpen/);
    assert.match(source, /mobileFilterDraft/);
    assert.match(source, /openMobileFilters/);
    assert.match(source, /applyMobileFilters/);
    assert.match(source, /clearMobileFilterDraft/);
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /library\.resultCount/);
    assert.match(source, /library\.filterApply/);
    assert.match(source, /library\.filterClear/);
});

test("mobile library filter drawer keeps safe-area and touch-sized controls", () => {
    const source = read("src/index.scss");
    assert.match(source, /\.glean-mobile-filter-layer\s*\{/);
    assert.match(source, /\.glean-mobile-filter-sheet\s*\{/);
    assert.match(source, /env\(safe-area-inset-bottom/);
    assert.match(source, /\.glean-mobile-filter-sheet__close/);
    assert.match(source, /min-height:\s*44px/);
    assert.match(source, /var\(--b3-theme-surface\)/);
});

test("mobile filter drawer traps keyboard focus and returns it on close", () => {
    const source = read("src/ui/DockPanel.svelte");
    const modalFocus = read("src/libs/modal-focus.ts");
    assert.match(source, /mobileFilterSheet/);
    assert.match(source, /installModalFocus\(mobileFilterSheet/);
    assert.match(modalFocus, /event\.key === "Escape"/);
    assert.match(modalFocus, /event\.key !== "Tab"/);
    assert.match(modalFocus, /previousFocus && available\(previousFocus\)/);
    assert.match(modalFocus, /focus\(\{ preventScroll: true \}\)/);
});

test("mobile filter drawer isolates and restores its background", () => {
    const source = read("src/ui/DockPanel.svelte");
    const close = source.slice(source.indexOf("function closeMobileFilters"), source.indexOf("// 切换主视图", source.indexOf("function closeMobileFilters")));
    assert.match(source, /isolateMobileFilterBackground\(mobileFilterSheet\)/);
    assert.match(source, /while \(branch !== document\.body\)/);
    assert.match(source, /element\.inert = true/);
    assert.match(source, /element\.setAttribute\("aria-hidden", "true"\)/);
    assert.match(source, /rootStyle\.setProperty\("overflow", "hidden", "important"\)/);
    assert.match(source, /bodyStyle\.setProperty\("overflow", "hidden", "important"\)/);
    assert.match(source, /restoreMobileFilterBackground\(\)/);
    assert.match(source, /if \(ariaHidden === null\) element\.removeAttribute\("aria-hidden"\)/);
    assert.match(source, /saved\.priority/);
    assert.ok(close.indexOf("restoreMobileFilterBackground()") < close.indexOf("dispose()"));
});

test("library sort direction announces the current direction", () => {
    const filters = read("src/ui/LibraryFilters.svelte");
    const dock = read("src/ui/DockPanel.svelte");
    assert.match(filters, /library\.directionAscending/);
    assert.match(filters, /library\.directionDescending/);
    assert.match(dock, /mobileFilterDraft\.direction === "asc" \? "library\.directionAscending" : "library\.directionDescending"/);
});

test("mobile viewport math isolates keyboard inset and threshold", () => {
    assert.equal(mobileKeyboardInset({ innerHeight: 800, viewportHeight: 800 }), 0);
    assert.equal(mobileKeyboardInset({ innerHeight: 800, viewportHeight: 512 }), 288);
    assert.equal(mobileKeyboardInset({ innerHeight: 800, viewportHeight: 512, viewportOffsetTop: 12 }), 276);
    assert.equal(mobileKeyboardInset({ innerHeight: 800, viewportHeight: 900 }), 0);
    assert.equal(isMobileKeyboardOpen({ innerHeight: 800, viewportHeight: 721 }), false);
    assert.equal(isMobileKeyboardOpen({ innerHeight: 800, viewportHeight: 720 }), true);
});

test("mobile keyboard avoidance shares visual viewport vars across dock and dialogs", () => {
    const dock = read("src/ui/DockPanel.svelte");
    const dialog = read("src/libs/dialog.ts");
    const viewport = read("src/libs/mobile-viewport.ts");
    const styles = read("src/index.scss");
    assert.match(dock, /onMount/);
    assert.match(dock, /installMobileViewportVars/);
    assert.match(dialog, /getFrontend/);
    assert.match(dialog, /installMobileViewportVars/);
    assert.match(viewport, /visualViewport/);
    assert.match(styles, /bottom: var\(--glean-keyboard-inset, 0px\)/);
    assert.match(styles, /padding-bottom: var\(--glean-keyboard-inset, (?:0px|var\(--glean-space-0\))\)/);
    assert.match(styles, /max-height: calc\(var\(--glean-visual-viewport-height, 100vh\) - 16px\)/);
    assert.match(styles, /scroll-padding-bottom: calc\(72px \+ var\(--glean-keyboard-inset, 0px\)\)/);
});

test("mobile layout reserves all safe-area edges for dock content and sheets", () => {
    const styles = read("src/index.scss");
    assert.match(styles, /--glean-safe-top:\s*env\(safe-area-inset-top/);
    assert.match(styles, /--glean-safe-right:\s*env\(safe-area-inset-right/);
    assert.match(styles, /--glean-safe-bottom:\s*env\(safe-area-inset-bottom/);
    assert.match(styles, /--glean-safe-left:\s*env\(safe-area-inset-left/);
    assert.match(styles, /--glean-mobile-nav-space:\s*calc\(/);
    assert.match(styles, /padding-top:\s*calc\((?:12px|var\(--glean-space-3\)) \+ var\(--glean-safe-top/);
    assert.match(styles, /padding:\s*(?:6px|var\(--glean-space-1-5\)) calc\((?:8px|var\(--glean-space-2\)) \+ var\(--glean-safe-right/);
    assert.match(styles, /padding:\s*(?:12px|var\(--glean-space-3\)) calc\((?:12px|var\(--glean-space-3\)) \+ var\(--glean-safe-right/);
});

test("mobile narrow and landscape layouts keep long text and sheets usable", () => {
    const styles = read("src/index.scss");
    assert.match(styles, /@media \(max-width: 420px\)/);
    assert.match(styles, /@media \(orientation: landscape\) and \(max-height: 560px\)/);
    assert.match(styles, /white-space:\s*normal/);
    assert.match(styles, /overflow-wrap:\s*anywhere/);
    assert.match(styles, /min-width:\s*min\(190px/);
    assert.match(styles, /max-height:\s*min\(92%, 520px\)/);
    assert.match(styles, /\.glean-mobile-filter-sheet\s*\{[\s\S]*box-sizing:\s*border-box/);
});

test("mobile resurface swipe maps horizontal direction and clamps feedback", () => {
    assert.equal(resolveSurfaceSwipe(80, 10), "later");
    assert.equal(resolveSurfaceSwipe(-80, 10), "archive");
    assert.equal(resolveSurfaceSwipe(40, 0), null);
    assert.equal(resolveSurfaceSwipe(100, 120), null);
    assert.equal(clampSurfaceSwipe(999), 132);
    assert.equal(clampSurfaceSwipe(-999), -132);
});

test("mobile resurface swipe keeps explicit actions and guarded undo", () => {
    const view = read("src/ui/ResurfaceView.svelte");
    const service = read("src/services/resurface-service.ts");
    const styles = read("src/index.scss");
    for (const event of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
        assert.match(view, new RegExp(`on${event}=\\{facade\\.isMobile \\?`));
    }
    assert.match(view, /undoSurfaceAction/);
    assert.match(view, /resurface\.swipeHint/);
    assert.match(view, /onDestroy\(\(\) => \{[\s\S]*?clearSwipeTimers\(\)/);
    assert.match(view, /const swipeTimers = new Set<number>\(\)/);
    assert.match(view, /disposed \|\| generation !== swipeGeneration/);
    assert.match(view, /if \(disposed \|\| actingId \|\| undoingId\) return/);
    assert.match(service, /文章状态已变化，无法撤销/);
    assert.match(styles, /touch-action:\s*pan-y/);
    assert.match(styles, /\.glean-surf-act[\s\S]*min-height:\s*44px/);
});

test("today pin stays a visible action and uses the clip store path", () => {
    const view = read("src/ui/ResurfaceView.svelte");
    const service = read("src/services/resurface-service.ts");
    assert.match(view, /setSurfacePinned/);
    assert.match(view, /aria-pressed=\{isPinnedToday\(pick\)\}/);
    assert.match(view, /resurface\.pinToday/);
    assert.match(view, /resurface\.unpinToday/);
    assert.match(service, /withClipEditQueue\(plugin, docId, async \(write\) =>/);
    assert.match(service, /write\(\{ pinned: next \|\| null \}, \{[\s\S]*expectedAttrs:/);
    assert.match(service, /todayStamp\(\)/);
});

test("mobile controls use a 44px hit area across panels and dialogs", () => {
    const styles = read("src/index.scss");
    assert.match(styles, /@media \(max-width: 560px\)/);
    assert.match(styles, /\.glean-btn,[\s\S]*\.glean-status-actions__btn,[\s\S]*min-height: 44px/);
    assert.match(styles, /\.glean-op-btn[\s\S]*width: 44px/);
    assert.match(styles, /\.glean-search[\s\S]*min-height: 44px/);
    assert.match(styles, /\.dialog-content \.b3-select,[\s\S]*min-height: 44px/);
    assert.match(styles, /\.glean-panel--mobile \.glean-icon-btn,[\s\S]*min-height: 44px/);
});

test("mobile batch bar keeps horizontal safe-area insets at tablet and landscape widths", () => {
    const styles = read("src/index.scss");
    assert.match(styles, /\.glean-panel--mobile \.glean-batchbar\s*\{[\s\S]*margin-left:\s*calc\([^;]*--glean-safe-left/);
    assert.match(styles, /\.glean-panel--mobile \.glean-batchbar\s*\{[\s\S]*margin-right:\s*calc\([^;]*--glean-safe-right/);
});

test("settings switches keep the visual track while exposing a 44px button", () => {
    const styles = read("src/index.scss");
    assert.match(styles, /\.glean-sw\s*\{[\s\S]*width: 44px/);
    assert.match(styles, /\.glean-sw\s*\{[\s\S]*min-width: 44px/);
    assert.match(styles, /\.glean-sw\s*\{[\s\S]*height: 44px/);
    assert.match(styles, /\.glean-sw\s*\{[\s\S]*&::before[\s\S]*width: 36px/);
    assert.match(styles, /\.glean-sw\s*\{[\s\S]*&::after[\s\S]*width: 17px/);
});

test("mobile card operations and selection do not depend on hover", () => {
    const styles = read("src/index.scss");
    assert.match(styles, /\.glean-panel--mobile \.glean-card__ops,[\s\S]*\.glean-panel--mobile \.glean-card__check/);
    assert.match(styles, /\.glean-panel--mobile \.glean-card__ops,[\s\S]*opacity: 1/);
    assert.match(styles, /\.glean-panel--mobile \.glean-card__check[\s\S]*min-width: 44px/);
    assert.match(styles, /\.glean-panel--mobile \.glean-card__check[\s\S]*min-height: 44px/);
});

test("mobile offline state keeps cached content and exposes retry", () => {
    const view = read("src/ui/DockPanel.svelte");
    const styles = read("src/index.scss");
    assert.match(view, /navigator\.onLine/);
    assert.match(view, /addEventListener\("offline"/);
    assert.match(view, /addEventListener\("online"/);
    assert.match(view, /mobile\.taskOffline/);
    assert.match(view, /mobile\.offlineHint/);
    assert.match(view, /msg\.offlineRetry/);
    assert.match(styles, /\.glean-offline-notice\s*\{/);
});

test("Mobile Spec v1: 统一入口挂载 lvLaunchpad.ensureMobileEntry() 并在 onunload 清理", () => {
    const index = read("src/index.ts");
    assert.match(index, /lvLaunchpad\?\.ensureMobileEntry/);
    assert.match(index, /this\.mobileEntryCleaner = lvLaunchpad\.ensureMobileEntry\(\)/);
    assert.match(index, /this\.mobileEntryCleaner\?\.\(\);/);
    assert.match(index, /actions:\s*\["今日阅读池",\s*"继续上次阅读",\s*"稍后读收件箱",\s*"剪藏剪贴板内容"\]/);
});

test("Mobile Spec v1: 手机端自有面板唤起走全屏 Dialog (100vw/100dvh + safe-area + 下滑关闭)", () => {
    const index = read("src/index.ts");
    const dialog = read("src/libs/dialog.ts");
    const styles = read("src/index.scss");
    assert.match(index, /openMobileWorkbenchSingleton/);
    assert.match(index, /containerClass:\s*"glean-mobile-fullscreen-dialog"/);
    assert.doesNotMatch(index, /glean-tab-root\s+glean-mobile-fullscreen-dialog/);
    assert.match(dialog, /glean-dialog--fullscreen/);
    assert.match(dialog, /header\.style\.setProperty\("display",\s*"none",\s*"important"\)/);
    assert.match(dialog, /dialogBody\.style\.setProperty\("padding",\s*"0",\s*"important"\)/);
    assert.match(dialog, /args\.width === "100vw" \|\| args\.height === "100dvh"/);
    assert.match(dialog, /diffY > 80 && diffY > diffX \* 2 && touchStartY < 120/);
    assert.match(styles, /\.glean-mobile-fullscreen-dialog\s*\{[\s\S]*width:\s*100vw[\s\S]*height:\s*100dvh/);
    assert.match(styles, /env\(safe-area-inset-top/);
    assert.match(styles, /touch-action:\s*manipulation/);
});

test("Mobile Fix: 切断 isTabCanvas 误触发、横幅移入列表滚动区、软键盘隐藏底栏与 ReadingContext 默认胶囊态", () => {
    const dock = read("src/ui/DockPanel.svelte");
    const readingContext = read("src/ui/ReadingContext.svelte");
    const highlightView = read("src/ui/HighlightView.svelte");
    const styles = read("src/index.scss");

    assert.match(dock, /initialView\?:\s*string/);
    assert.match(dock, /if \(facade\.isMobile\)\s*\{\s*isTabCanvas = false;/);
    assert.match(dock, /\{#if !facade\.isMobile && isTabCanvas\}\s*<div class="glean-libbar">/);
    assert.match(dock, /class="glean-mobile-topbar__close"/);
    assert.match(dock, /<div class="glean-list">\s*\{#if facade\.isMobile\}\s*<div class="glean-mobile-list-banners">/);
    assert.match(styles, /\.glean-panel--mobile\[data-glean-keyboard-open\][\s\S]*?\.glean-mobile-nav\s*\{\s*display:\s*none\s*!important;/);
    assert.match(readingContext, /let pillMode = \$state\(untrack\(\(\) => Boolean\(facade\.isMobile\)\)\)/);
    assert.match(highlightView, /class="glean-highlights__export-more"/);
});

test("Mobile Spec v1: 手机阅读注入五态快捷悬浮条 (≥44px、毛玻璃、safe-area、单手流转、触感)", () => {
    const readingContext = read("src/ui/ReadingContext.svelte");
    const mobileBar = read("src/ui/MobileReadingBar.svelte");
    const styles = read("src/index.scss");
    assert.match(readingContext, /import MobileReadingBar from "\.\/MobileReadingBar\.svelte"/);
    assert.match(readingContext, /\{#if facade\.isMobile && context\}[\s\S]*<MobileReadingBar/);
    assert.match(mobileBar, /lvLaunchpad\.haptic\(10\)/);
    assert.match(mobileBar, /flowStates/);
    assert.match(mobileBar, /handleArchiveClick/);
    assert.match(styles, /\.glean-mobile-reading-bar\s*\{[\s\S]*position:\s*fixed[\s\S]*bottom:\s*0/);
    assert.match(styles, /backdrop-filter:\s*blur\(16px\)/);
    assert.match(styles, /min-width:\s*44px/);
    assert.match(styles, /min-height:\s*44px/);
    assert.match(styles, /touch-action:\s*manipulation/);
    assert.match(styles, /env\(safe-area-inset-bottom/);
});

test("Mobile Spec v1: 阅读页字号/行距快捷调节 (Aa 弹层拖动条 + 偏好持久化 + 键盘避让)", () => {
    const mobileBar = read("src/ui/MobileReadingBar.svelte");
    const prefs = read("src/services/prefs.ts");
    const styles = read("src/index.scss");
    assert.match(mobileBar, /typographyOpen/);
    assert.match(mobileBar, /glean-mobile-typography-sheet/);
    assert.match(mobileBar, /saveUiPrefs\(facade\.pluginInstance, \{ mobileReaderAppearance/);
    assert.match(mobileBar, /isMobileKeyboardOpen/);
    assert.match(mobileBar, /keyboardHidden/);
    assert.match(prefs, /export interface MobileReaderAppearance/);
    assert.match(prefs, /DEFAULT_MOBILE_READER_APPEARANCE/);
    assert.match(styles, /--glean-reader-font-size/);
    assert.match(styles, /--glean-reader-line-height/);
    assert.match(styles, /&--hidden\s*\{[\s\S]*transform:\s*translateY\(120%\)/);
});

test("Mobile Spec v1 深化: resolveLatestReadingPosition 双向跨端取较晚时间戳", async () => {
    const { resolveLatestReadingPosition } = await import("../src/domain/reading-position.ts");
    const posOld = { version: 1 as const, blockId: "20261103000000-block01", offset: 120, at: "2026-11-04T08:00:00.000Z" };
    const posNew = { version: 1 as const, blockId: "20261103000000-block02", offset: 240, at: "2026-11-04T09:30:00.000Z" };

    // 手机端较新
    assert.deepEqual(resolveLatestReadingPosition(posOld, posNew), posNew);
    // 桌面端较新
    assert.deepEqual(resolveLatestReadingPosition(posNew, posOld), posNew);
    // 单边缺失安全取另一端
    assert.deepEqual(resolveLatestReadingPosition(null, posNew), posNew);
    assert.deepEqual(resolveLatestReadingPosition(posOld, undefined), posOld);
    assert.equal(resolveLatestReadingPosition(null, null), null);
});

test("Mobile Spec v1 深化: 五态条长按 400ms 说明气泡与已同步微提示", () => {
    const mobileBar = read("src/ui/MobileReadingBar.svelte");
    const styles = read("src/index.scss");
    assert.match(mobileBar, /startLongPress/);
    assert.match(mobileBar, /activeBubble/);
    assert.match(mobileBar, /syncNotice/);
    assert.match(mobileBar, /reading\.syncedProgress/);
    assert.match(styles, /\.glean-mobile-reading-bar__sync-badge\s*\{/);
    assert.match(styles, /\.glean-mobile-reading-bar__bubble\s*\{/);
});

test("Mobile Spec v1 深化: 阅读池列表下拉 60px 触发刷新手势与旋转指示器", () => {
    const resurface = read("src/ui/ResurfaceView.svelte");
    const styles = read("src/index.scss");
    assert.match(resurface, /pullDistance/);
    assert.match(resurface, /pullRefreshing/);
    assert.match(resurface, /pullDistance >= 60/);
    assert.match(resurface, /glean-pull-refresh-indicator/);
    assert.match(resurface, /glean-pull-refresh-spin/);
    assert.match(styles, /\.glean-pull-refresh-indicator\s*\{/);
    assert.match(styles, /\.glean-pull-refresh-spin--active\s*\{[\s\S]*animation:\s*glean-reader-spin/);
});

test("Mobile Spec v1 深化: 弱网剪藏暂存与静默重试队列 (clip-sync-queue)", async () => {
    const index = read("src/index.ts");
    const queueSource = read("src/services/clip-sync-queue.ts");
    assert.match(index, /enqueuePendingClip/);
    assert.match(index, /installClipSyncQueue/);
    assert.match(queueSource, /glean_pending_clip_queue/);
    assert.match(queueSource, /flushPendingClips/);
    assert.match(queueSource, /window\.addEventListener\("online"/);
});
