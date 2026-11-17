import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("wide workbench header exposes prototype capture plus popup, organize and settings actions", () => {
    const source = read("src/ui/DockPanel.svelte");
    const actions = source.slice(source.indexOf('<div class="glean-head-actions">'), source.indexOf("</div>", source.indexOf('<div class="glean-head-actions">')));
    assert.match(actions, /isTabCanvas && \(view === "resurface" \|\| view === "library"\)/);
    assert.match(actions, /quickCapture\(\)/);
    assert.match(source, /async function quickCapture\(\): Promise<void>/);
    assert.match(source, /facade\.addCurrentDocToLibrary\(\)/);
    assert.match(actions, /aria-busy=\{quickCaptureBusy\}/);
    assert.match(actions, /disabled=\{quickCaptureBusy\}/);
    assert.match(actions, /action\.quickCapture/);
    assert.match(actions, /action\.addToInbox/);
    assert.match(actions, /panel\.popupShort/);
    assert.match(actions, /panel\.migrateShort/);
    assert.match(actions, /panel\.settings/);
    assert.equal((actions.match(/glean-head-action__label/g) ?? []).length, 4);
    assert.equal((actions.match(/aria-label=/g) ?? []).length, 4);
});

test("labels are enabled only by the wide canvas container and keep theme colors", () => {
    const styles = read("src/index.scss");
    assert.match(styles, /\.glean-tab-root\s*\{[^}]*container-name:\s*glean-workbench;[^}]*container-type:\s*inline-size;/s);
    assert.match(styles, /@container\s+glean-workbench\s*\(min-width:\s*760px\)/);
    assert.match(styles, /\.glean-head-action__label\s*\{\s*display:\s*none;/);
    assert.match(styles, /\.glean-head-action__label\s*\{\s*display:\s*inline;/);
    assert.match(styles, /border:\s*1px solid var\(--b3-border-color\)/);
    assert.match(styles, /background:\s*var\(--b3-theme-surface\)/);
    assert.match(styles, /\.glean-head-action--primary\s*\{[\s\S]*var\(--glean-grad\)/);
});

test("popup action uses the same wide-canvas wrapper as a workbench tab", () => {
    const source = read("src/index.ts");
    assert.match(source, /containerClass:\s*"glean-tab-root"/);
    assert.match(source, /container\.className\s*=\s*"glean-tab-root fn__flex-1"/);
});

test("svelte dialogs let workbench roots fill the popup content width", () => {
    const source = read("src/libs/dialog.ts");
    assert.match(source, /class=\"dialog-content\" style=\"display: flex; flex-direction: column; align-items: stretch; width: 100%; height: 100%; min-width: 0; min-height: 0; box-sizing: border-box;/);
    const styles = read("src/index.scss");
    assert.match(styles, /\.glean-settings\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*box-sizing:\s*border-box;/);
});

test("prototype workbench frame shows the three readable header actions", () => {
    const prototype = read("design/prototype-v2.html");
    assert.match(prototype, /⧉ 浮窗/);
    assert.match(prototype, /🧹 整理/);
    assert.match(prototype, /⚙ 设置/);
    assert.match(prototype, /data-action="popup"/);
    assert.match(prototype, /data-action="organize"/);
    assert.match(prototype, /data-action="settings"/);
});

test("prototype workbench frame keeps quick capture as the primary action", () => {
    const prototype = read("design/prototype-v2.html");
    assert.match(prototype, /＋ 快速收录/);
    assert.match(prototype, /＋ 收录/);
    assert.match(prototype, /data-action="quick-capture"/);
    assert.match(prototype, /data-page="library"[\s\S]*?data-action="quick-capture"/);
});

test("interactive prototype explicitly marks synthetic data and provides view, canvas, theme and async state controls", () => {
    const prototype = read("design/prototype-v2.html");
    assert.match(prototype, /合成示例数据/);
    assert.match(prototype, /不连接思源 \/ API \/ AI/);
    for (const view of ["home", "library", "stats", "highlights"]) assert.match(prototype, new RegExp(`data-view="${view}"`));
    assert.match(prototype, /data-page="reader"/);
    assert.match(prototype, /<dialog class="screen settings-dialog" id="settings"/);
    assert.match(prototype, /data-action="settings"/);
    for (const canvas of ["wide", "dock", "mobile"]) assert.match(prototype, new RegExp(`data-canvas="${canvas}"`));
    for (const state of ["idle", "loading", "success", "failure", "empty"]) assert.match(prototype, new RegExp(`data-state="${state}"`));
    assert.match(prototype, /data-action="theme"/);
    assert.match(prototype, /addEventListener\('popstate'/);
    assert.doesNotMatch(prototype, /讀庫 128 篇|已篩選 2 項/);
});

test("prototype empty result replaces sample content and mobile more opens real navigation actions", () => {
    const prototype = read("design/prototype-v2.html");
    assert.match(prototype, /html\[data-demo-state="empty"\] \[data-page\]\.is-active \.home-content/);
    assert.match(prototype, /html\[data-demo-state="empty"\] \[data-page\]\.is-active \.settings-content/);
    assert.match(prototype, /aria-controls="mobile-more-panel" aria-expanded="false"/);
    assert.match(prototype, /id="mobile-more-panel"[\s\S]*data-view="stats"[\s\S]*data-action="settings"/);
    assert.match(prototype, /data-action="mobile-maintenance"/);
    assert.match(prototype, /function closeMobileMore\(returnFocus=false\)/);
    assert.match(prototype, /function closeSettings\(\)[\s\S]*dialog\.close\(\)/);
    assert.match(prototype, /document\.querySelector\('#settings'\)\.addEventListener\('cancel'/);
    assert.match(prototype, /data-onboarding-dialog[\s\S]*data-onboarding-copy[\s\S]*onboarding-next/);
    assert.match(prototype, /case 'onboarding':onboardingStep=0;updateOnboarding\(\);document\.querySelector\('\[data-onboarding-dialog\]'\)\.classList\.remove\('hidden'\)/);
    assert.match(prototype, /mobile-maintenance':navigate\('settings'\)/);
});

test("mobile prototype canvas keeps a single-column shell in a wide preview viewport", () => {
    const prototype = read("design/prototype-v2.html");
    assert.match(prototype, /html\[data-canvas="mobile"\] \.grid,html\[data-canvas="mobile"\] \.grid2,html\[data-canvas="mobile"\] \.settings-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
    assert.match(prototype, /html\[data-canvas="mobile"\] nav\.tabs\[aria-label="主要视图"\]\{display:none\}/);
    assert.match(prototype, /html\[data-canvas="mobile"\] \.row\{grid-template-columns:10px minmax\(0,1fr\)/);
    assert.match(prototype, /html\[data-canvas="mobile"\] \.grid,html\[data-canvas="mobile"\] \.grid2,html\[data-canvas="mobile"\] \.settings-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
    assert.match(prototype, /html\[data-canvas="mobile"\] nav\.tabs\[aria-label="主要视图"\]\{display:none\}/);
    assert.match(prototype, /html\[data-canvas="mobile"\] \.row\{grid-template-columns:10px minmax\(0,1fr\)/);
    assert.match(prototype, /data-library-result="empty" aria-pressed="false">无文章（模拟）/);
    assert.doesNotMatch(prototype, />真实空库</);
});

test("prototype settings mirror eight real categories and dirty, save, failure and reset confirmation states", () => {
    const prototype = read("design/prototype-v2.html");
    for (const category of ["workspace", "resurface", "reading", "ai", "aiChannel", "integration", "data", "maintenance"]) {
        assert.match(prototype, new RegExp(`data-settings-tab="${category}"`));
        assert.match(prototype, new RegExp(`data-settings-panel="${category}"`));
    }
    assert.match(prototype, /data-settings-dirty/);
    assert.match(prototype, /data-settings-success/);
    assert.match(prototype, /data-settings-error/);
    assert.match(prototype, /role="alertdialog"/);
    assert.match(prototype, /data-discard-dialog[\s\S]*settings-discard-cancel[\s\S]*settings-discard-confirm/);
    assert.match(prototype, /data-action="settings-workspace"/);
    assert.match(prototype, /case 'settings-workspace':(?:setDemoState\('idle'\)|root\.dataset\.demoState='idle');[\s\S]*?document\.querySelector\('\[data-settings-tab="workspace"\]'\)\.click\(\)/);
    assert.match(prototype, /case 'retry-home':if\(button\.disabled\)return;button\.disabled=true;button\.setAttribute\('aria-busy','true'\)/);
    assert.match(prototype, /case 'report-retry':if\(button\.disabled\)return;button\.disabled=true;button\.setAttribute\('aria-busy','true'\)/);
    assert.match(prototype, /case 'highlight-retry':if\(button\.disabled\)return;button\.disabled=true;button\.setAttribute\('aria-busy','true'\)/);
    assert.doesNotMatch(prototype, /清理派生缓存/);
});

test("prototype separates library and highlights data, filtered-empty and empty-library states", () => {
    const prototype = read("design/prototype-v2.html");
    for (const selector of ["data-library-data", "data-library-filter-empty", "data-library-empty", "data-highlight-data", "data-highlight-filter-empty", "data-highlight-empty"]) {
        assert.ok(prototype.includes(selector), `missing ${selector}`);
    }
    assert.match(prototype, /data-action="batch-done"/);
    assert.match(prototype, /data-action="preview-toggle"/);
    assert.match(prototype, /data-action="highlight-copy"/);
    assert.match(prototype, /data-action="highlight-preview"/);
});

test("wide canvas resurface cards use an adaptive grid while dock stays single column", () => {
    const styles = read("src/index.scss");
    const wideStart = styles.indexOf("@container glean-content (min-width: 760px)");
    const wideEnd = styles.indexOf("@container glean-content (max-width: 560px)", wideStart);
    assert.ok(wideStart >= 0 && wideEnd > wideStart);
    const wide = styles.slice(wideStart, wideEnd);
    assert.match(wide, /\.glean-surf\s*\{[\s\S]*display:\s*grid/);
    assert.match(wide, /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 310px\), 1fr\)\)/);
    assert.match(wide, /\.glean-surf__acts\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(wide, /\.glean-surf-foot\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
    assert.match(wide, /\.glean-surf-swipe\s*\{[\s\S]*display:\s*flex/);
    assert.match(wide, /\.glean-surf-card\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
    assert.match(wide, /\.glean-surf-card \.glean-surf__acts\s*\{[\s\S]*margin-top:\s*auto/);
    const narrow = styles.slice(styles.indexOf(".glean-surf {"), styles.indexOf(".glean-surf-swipe-hint"));
    assert.match(narrow, /display:\s*flex/);
    assert.match(narrow, /flex-direction:\s*column/);
});

test("narrow workbench containers keep resurface actions readable without entrance animation", () => {
    const styles = read("src/index.scss");
    const wideStart = styles.indexOf("@container glean-content (min-width: 760px)");
    const narrowStart = styles.indexOf("@container glean-content (max-width: 560px)", wideStart);
    const narrowEnd = styles.indexOf(".glean-quota {", narrowStart);
    assert.ok(wideStart >= 0 && narrowStart > wideStart && narrowEnd > narrowStart);
    const narrow = styles.slice(narrowStart, narrowEnd);
    assert.match(narrow, /\.glean-surf__acts\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(narrow, /\.glean-surf-act--pri\s*\{[\s\S]*grid-column:\s*1 \/ -1/);
    assert.match(narrow, /\.glean-surf-act\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(narrow, /\.glean-surf-card\s*\{\s*animation:\s*var\(--glean-motion-none\)/);
});

test("mobile resurface exposes prototype quick actions through parent navigation callbacks", () => {
    const resurface = read("src/ui/ResurfaceView.svelte");
    const dock = read("src/ui/DockPanel.svelte");
    const styles = read("src/index.scss");
    assert.match(resurface, /onQuickCapture\?: \(\) => void/);
    assert.match(resurface, /onQuickSearch\?: \(\) => void/);
    assert.match(resurface, /onQuickCandidates\?: \(\) => void/);
    assert.match(resurface, /resurface\.quickCapture/);
    assert.match(resurface, /class="glean-resurface__quick-title"/);
    assert.match(resurface, /resurface\.quickSearch/);
    assert.match(resurface, /resurface\.quickCandidates/);
    assert.match(resurface, /onclick=\{onQuickCapture\}/);
    assert.doesNotMatch(resurface, /quickCapture.*facade\.openImport/s);
    assert.match(resurface, /const quickActionsTitleId =/);
    assert.match(resurface, /<section class="glean-resurface__quick" aria-labelledby=\{quickActionsTitleId\}>/);
    assert.match(resurface, /<h2 id=\{quickActionsTitleId\} class="glean-resurface__quick-title">/);
    assert.ok(resurface.indexOf('<section class="glean-resurface__quick"') > resurface.indexOf('<div class="glean-surf">'));
    assert.match(dock, /onQuickCapture=\{quickCapture\}/);
    assert.match(dock, /onQuickSearch={openLibrarySearchFromHome}/);
    assert.match(dock, /onQuickCandidates={openCandidateQueue}/);
    assert.match(styles, /\.glean-resurface__quick-action\s*\{[\s\S]*min-height: 44px/);
    assert.match(styles, /\.glean-resurface__quick-title\s*\{[\s\S]*font-weight:\s*700/);
});

test("wide canvas highlights use a two-column card area and center empty states", () => {
    const source = read("src/ui/HighlightView.svelte");
    assert.match(source, /class="glean-highlights__items"/);
    assert.match(source, /class="glean-empty glean-highlights__empty"/);
    assert.match(source, /@container\s+glean-workbench\s*\(min-width:\s*760px\)/);
    assert.match(source, /\.glean-highlights__items\s*\{\s*display:\s*grid;/);
    assert.match(source, /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 360px\), 1fr\)\)/);
    assert.match(source, /\.glean-highlights__empty\s*\{\s*width:\s*min\(100%, 720px\);\s*align-self:\s*center;/);
});

test("stats prioritize three primary metrics and keep the supplemental snapshot compact", () => {
    const source = read("src/ui/StatsView.svelte");
    const styles = read("src/index.scss");
    assert.match(source, /class="glean-stats__distribution"/);
    assert.match(source, /class="glean-stats__distributions"/);
    assert.match(source, /@container\s+glean-content\s*\(min-width:\s*760px\)/);
    assert.match(source, /\.glean-stats__overview\s*>\s*\.glean-stats__metrics\s*\{\s*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(source, /\.glean-stats__metrics--supplemental\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(source, /aria-labelledby=\{idFor\("breakdown-title"\)\}/);
    assert.match(source, /class="glean-sr-only">\{t\(i18n, "review\.bySite"\)\}/);
    assert.match(source, /review\.scopeShort/);
    assert.match(source, /<details class="glean-stats__scope">/);
    assert.match(source, /review\.moreMetrics/);
    assert.match(source, /review\.recentTrend/);
    assert.match(source, /review\.detailedActivity/);
    assert.match(source, /review\.detailedAnalysis/);
    assert.match(source, /class="glean-stats__completed-detail"/);
    assert.match(source, /glean-stats__trend-bar--empty/);
    assert.match(source, /role="img"/);
    assert.match(source, /i18n, "review\.heatmapDay"/);
    assert.match(source, /\.glean-stats__intro \{\s*align-items: flex-start;/);
    assert.match(source, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 136px\), 1fr\)\)/);
    assert.match(styles, /\.glean-stats__metrics\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(source, /\.glean-stats__distributions\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(source, /\.glean-stats__distribution\s*\{\s*min-width:\s*0/);
    assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.glean-stats__trend[\s\S]*grid-auto-columns: minmax\(3px, 1fr\)[\s\S]*overflow-x: auto/);
    assert.match(styles, /@container glean-content \(max-width: 640px\)[\s\S]*\.glean-stats__trend-bar \{ min-width: 3px; \}/);
});

test("all three canvas roots use the same workbench container contract", () => {
    const styles = read("src/index.scss");
    assert.match(styles, /\.glean-panel,\s*\.glean-tab-root\s*\{\s*container-name:\s*glean-workbench;\s*container-type:\s*inline-size;/);
    assert.match(styles, /@container\s+glean-workbench\s*\(min-width:\s*600px\)\s*\{[\s\S]*\.glean-list/);
    assert.doesNotMatch(styles, /\/\* tab 画布宽幅适配 \*\/\s*\.glean-tab-root\s*\{/);
});

test("settings, migration and import dialogs keep the standard bounded dialog contract", () => {
    const index = read("src/index.ts");
    const styles = read("src/index.scss");
    assert.match(index, /openMigrate\(\)[\s\S]*?width:\s*"720px",\s*height:\s*"560px"/);
    assert.match(index, /openImport\(\)[\s\S]*?width:\s*"720px",\s*height:\s*"560px"/);
    // 设置页大面板契约：对话框放大为 920px x 720px，提供充足横向展示空间
    assert.match(index, /openSettings\(\)[\s\S]*?width:\s*"920px",\s*height:\s*"720px"/);
    assert.match(styles, /\.glean-migrate\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden/);
    assert.match(styles, /\.glean-settings\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow-y:\s*auto/);
    assert.match(styles, /\.glean-mtable\s*\{[\s\S]*overflow:\s*auto/);
    // 分类导航版式契约：布局双栏、内容区滚动、窄容器降级为横向 tab（组件 scoped 样式）
    const settingsView = read("src/ui/SettingsView.svelte");
    assert.match(settingsView, /@container glean-settings \(max-width: 600px\)/);
    assert.match(settingsView, /\.glean-settings__content\s*\{[\s\S]*overflow-y:\s*auto/);
});

test("wide canvas exposes labels for compact popovers and sort direction", () => {
    const popover = read("src/ui/ActionPopover.svelte");
    const filters = read("src/ui/LibraryFilters.svelte");
    const highlights = read("src/ui/HighlightView.svelte");
    const styles = read("src/index.scss");
    assert.match(popover, /glean-action-popover__trigger--compact/);
    assert.match(popover, /glean-action-popover__trigger-label/);
    assert.match(filters, /glean-filter-dir__label/);
    assert.match(highlights, /glean-filter-dir__label/);
    assert.match(styles, /\.glean-action-popover__trigger-label,[\s\S]*\.glean-filter-dir__label\s*\{\s*display:\s*none/);
    assert.match(styles, /@container\s+glean-workbench\s*\(min-width:\s*760px\)[\s\S]*\.glean-action-popover__trigger-label,[\s\S]*\.glean-filter-dir__label\s*\{\s*display:\s*inline/);
});

test("resurface cards keep action slots and metric hints aligned", () => {
    const styles = read("src/index.scss");
    const view = read("src/ui/ResurfaceView.svelte");
    const stats = read("src/ui/StatsView.svelte");
    const filters = read("src/ui/LibraryFilters.svelte");
    assert.match(styles, /\.glean-surf__acts\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(styles, /\.glean-surf-act--pri\s*\{[\s\S]*grid-column:\s*1 \/ -1/);
    assert.match(styles, /\.glean-surf-source-missing\s*\{[\s\S]*justify-content:\s*center/);
    assert.match(styles, /\.glean-filters--compact \.glean-filter\s*\{[\s\S]*text-align:\s*center[\s\S]*text-align-last:\s*center/);
    assert.match(styles, /\.glean-stats__metric dd\.glean-stats__metric-hint\s*\{[\s\S]*font-size:\s*var\(--glean-text-xs\)[\s\S]*background:\s*none/);
    assert.match(stats, /\.glean-stats__metric > dd:not\(\.glean-stats__metric-hint\)/);
    assert.match(view, /class="glean-surf-source-missing"/);
    assert.match(filters, /class="b3-select glean-filter"/);
});

test("desktop header subtitle reflects the current view and active library filters", () => {
    const source = read("src/ui/DockPanel.svelte");
    const zh = read("public/i18n/zh_CN.json");
    const en = read("public/i18n/en_US.json");
    assert.match(source, /const headerSubtitle = \$derived\.by/);
    assert.match(source, /panel\.headerFiltered/);
    assert.match(source, /panel\.headerView/);
    assert.match(source, /<div class="glean-brand__sub">\{headerSubtitle\}<\/div>/);
    assert.match(source, /glean-libbar__fav-btn/);
    assert.match(source, /event\.altKey && \(event\.key === "f" \|\| event\.key === "F"\)/);
    assert.match(source, /copyEntryBlockRef\(entry\)/);
    assert.match(source, /copyEntryCitation\(entry, "gbt"\)/);
    assert.match(source, /copyEntryCitation\(entry, "bibtex"\)/);
    assert.match(source, /copyEntryCitation\(entry, "apa"\)/);
    assert.match(source, /copyEntryCitation\(entry, "mla"\)/);
    assert.match(zh, /"panel\.headerFiltered": "\$\{view\} · 读库 \$\{n\} 篇 · 已筛选 \$\{filters\} 项"/);
    assert.match(en, /"panel\.headerFiltered": "\$\{view\} · \$\{n\} in library · \$\{filters\} filters"/);
    assert.doesNotMatch(source, /glean-brand__badge/);
    const prototype = read("design/prototype-v2.html");
    assert.match(prototype, /合成示例数据 · 不连接思源 \/ API \/ AI/);
    assert.match(prototype, /今日回看 · 合成数据预览/);
    assert.doesNotMatch(prototype, /读库 128 篇|已筛选 2 项/);
});

test("local day rollover refreshes today's gleaning and statistics without polling", () => {
    const dock = read("src/ui/DockPanel.svelte");
    const resurface = read("src/ui/ResurfaceView.svelte");
    const stats = read("src/ui/StatsView.svelte");
    assert.match(dock, /nextDay\.setHours\(24, 0, 0, 50\)/);
    assert.match(dock, /document\.addEventListener\("visibilitychange"/);
    assert.match(dock, /dayRefreshTimer = window\.setTimeout/);
    assert.match(dock, /window\.clearTimeout\(dayRefreshTimer\)/);
    assert.match(dock, /<ResurfaceView[\s\S]*?\{currentTime\}/);
    assert.match(resurface, /computeDailyFromIndex\(index, facade\.settings, currentTime\)/);
    assert.match(dock, /<StatsView \{facade\} \{index\} \{currentTime\}/);
    assert.match(stats, /now: currentTime/);
});

test("library cards and rows expose today pin through the shared resurface service", () => {
    const source = read("src/ui/DockPanel.svelte");
    assert.match(source, /import \{ archiveStaleCandidates, setSurfacePinned \} from "\.\.\/services\/resurface-service"/);
    assert.match(source, /function isPinnedToday\(entry: ClipIndexEntry\)/);
    assert.match(source, /function toggleSurfacePin\(entry: ClipIndexEntry\)/);
    assert.match(source, /aria-pressed=\{isPinnedToday\(entry\)\}/);
    assert.match(source, /surfacePinLabel\(entry\)/);
    assert.match(source, /void toggleSurfacePin\(entry\)/);
    assert.match(source, /resurface\.pinToday/);
    assert.match(source, /resurface\.unpinToday/);
});

test("list, kanban and dock share one batch footer outside their layout branches", () => {
    const source = read("src/ui/DockPanel.svelte");
    const additions = read("design/prototype-v2-additions.html");
    const styles = read("src/index.scss");
    assert.match(source, /import LibraryBatchBar from "\.\/LibraryBatchBar\.svelte"/);
    assert.equal((source.match(/<LibraryBatchBar/g) ?? []).length, 1);
    assert.match(source, /\{\/if\}\s*<LibraryBatchBar[\s\S]*?\{\.\.\.selectionScope\}[\s\S]*?\/>\s*\{:else if view === "resurface"\}/);
    assert.match(source, /class="glean-kcard__select"/);
    assert.match(source, /class="glean-drow__select"/);
    assert.doesNotMatch(source, /class:glean-(?:kanban|lib__main|list)--batch/);
    const batchRules = styles.match(/\.glean-batchbar\s*\{[^}]*\}/g) ?? [];
    assert.ok(batchRules.length > 0);
    for (const rule of batchRules) assert.doesNotMatch(rule, /position:\s*(?:fixed|absolute)/);
    assert.doesNotMatch(styles, /\.glean-(?:kanban|lib__main|list)--batch\s*\{/);
    assert.match(additions, /列表 \/ 看板、预览侧栏和批量操作保持同一上下文/);
    assert.match(additions, /data-action="batch-start"/);
    assert.match(additions, /data-action="batch-failed"/);
});

test("additions prototype controls have local demo behavior and share semantic theme mapping", () => {
    const additions = read("design/prototype-v2-additions.html");
    assert.match(additions, /data-theme-toggle/);
    assert.match(additions, /data-theme=dark/);
    assert.match(additions, /data-action="reading-expand"/);
    assert.match(additions, /data-action="diagnostic-expand"/);
    assert.match(additions, /data-action="ai-expand"/);
    assert.match(additions, /addEventListener\('click'/);
    assert.match(additions, /合成示例 · 不调用 API/);
    assert.match(additions, /@media\(max-width:760px\)/);
});

test("highlight tag filter uses the same UI alias while retaining the original filter value", () => {
    const source = read("src/ui/HighlightView.svelte");
    assert.match(source, /loadUiPrefs\(facade\.pluginInstance\)/);
    assert.match(source, /glean:tag-aliases-changed/);
    assert.match(source, /<option value=\{value\}>\{displayTagAlias\(tagAliases, value\)\}<\/option>/);
    assert.match(source, /bind:value=\{tag\}/);
});

test("large library keeps full filtering but bounds list, table and kanban DOM windows", () => {
    const source = read("src/ui/DockPanel.svelte");
    const styles = read("src/index.scss");
    assert.match(source, /const LIBRARY_RENDER_PAGE = 80/);
    assert.match(source, /const visibleRows = \$derived\(rows\.slice\(0, renderLimit\)\)/);
    assert.match(source, /const hasMoreRows = \$derived\(visibleRows\.length < rows\.length\)/);
    assert.match(source, /function loadMoreRows\(\): void/);
    assert.equal((source.match(/\{#each visibleRows as entry/g) ?? []).length, 2);
    assert.match(source, /const visibleKanbanCols = \$derived\(kanbanCols\.map/);
    assert.match(source, /\{#each visibleKanbanCols as col/);
    assert.match(source, /library\.renderedCount/);
    assert.match(source, /library\.loadMore/);
    assert.match(styles, /\.glean-list-more\s*\{[\s\S]*justify-content:\s*center/);
});

test("列表行尾操作与看板选择框平滑微交互契约：默认低透、悬停/获焦浮现（T-3541）", () => {
    const styles = read("src/index.scss");
    const settings = read("src/ui/SettingsView.svelte");
    const marginNotes = read("src/styles/components/margin-notes.scss");

    // 1. 读库行尾操作按钮默认低透，hover/focus-within 浮现
    assert.match(styles, /\.glean-drow__ops\s*\{[\s\S]*opacity:\s*0\.35;/);
    assert.match(styles, /&:hover \.glean-drow__ops,[\s\S]*&:focus-within \.glean-drow__ops/);

    // 2. 看板选择框默认低透，hover/focus-within 浮现
    assert.match(styles, /\.glean-kcard__select\s*\{[\s\S]*opacity:\s*0\.35;/);
    assert.match(styles, /\.glean-kcard:hover \.glean-kcard__select,[\s\S]*\.glean-kcard:focus-within \.glean-kcard__select/);

    // 3. 设置面板分类导航与输入胶囊化
    assert.match(settings, /\.glean-settings__tab\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill/);
    assert.match(settings, /\.glean-settings__tab--on\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--glean-color-action\)/);
    assert.match(settings, /\.glean-settings \.glean-mini-input,[\s\S]*\.glean-settings \.b3-select\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 4. 阅读伴生大纲与悬浮边注胶囊化
    assert.match(styles, /\.glean-reader__outline-filter\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-reader__outline-item\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(marginNotes, /&__memo\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill/);
    assert.match(marginNotes, /&__btn\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill/);

    // 5. 趋势图与热力图深色胶囊工具提示、操作浮层大圆角与输入胶囊化
    const statsView = read("src/ui/StatsView.svelte");
    const statsScss = read("src/styles/components/stats.scss");
    assert.match(statsView, /class="glean-stats__trend-bar"[\s\S]*data-tooltip=/);
    assert.match(statsView, /class="glean-stats__day"[\s\S]*data-tooltip=/);
    assert.match(statsScss, /\.glean-stats__trend-bar[\s\S]*&::after\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill/);
    assert.match(styles, /\.glean-action-popover__body\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg/);
    assert.match(styles, /\.glean-action-popover__body \.glean-action-popover__field :where\(\.b3-select, input\)\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 6. 摘录墙搜索过滤、下拉与操作全圆角胶囊化
    const highlightScss = read("src/styles/components/highlights.scss");
    assert.match(highlightScss, /\.glean-highlights button,[\s\S]*\.glean-highlights select,[\s\S]*\.glean-highlights input\[type="search"\]\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(highlightScss, /\.glean-highlights__tools--selection\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(highlightScss, /\.glean-highlights__item,[\s\S]*\.glean-highlights__preview\s*\{[\s\S]*border:\s*1px solid var\(--glean-border-soft\);/);

    // 7. 漫游抽屉盲盒卡片柔和外壳与胶囊流
    const roamingScss = read("src/styles/components/roaming.scss");
    assert.match(roamingScss, /\.glean-roaming-card\s*\{[\s\S]*border:\s*1px solid var\(--glean-border-soft\);/);
    assert.match(roamingScss, /\.glean-roaming-tag\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(roamingScss, /\.glean-roaming-triage-btn\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 8. 金句分享卡片工作台舞台分层与按钮胶囊化
    const quoteCardDialog = read("src/ui/QuoteCardDialog.svelte");
    assert.match(quoteCardDialog, /\.glean-quote-card-stage\s*\{[\s\S]*border:\s*1px solid var\(--glean-border-soft\);/);
    assert.match(quoteCardDialog, /\.glean-quote-card-btn\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(quoteCardDialog, /\.glean-quote-card-theme-btn--active\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--glean-color-action\)/);

    // 9. 长文切片卡片柔和外壳与胶囊流
    const slicingScss = read("src/styles/components/slicing.scss");
    assert.match(slicingScss, /\.glean-slicing-card\s*\{[\s\S]*border:\s*1px solid var\(--glean-border-soft\);/);
    assert.match(slicingScss, /\.glean-slicing-card__sec-chip\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(slicingScss, /\.glean-read-point-badge\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 10. 微信公众号作者卡片与微信读书向导柔和外壳及胶囊流
    const wechatScss = read("src/styles/components/wechat.scss");
    assert.match(wechatScss, /\.glean-wechat-publisher\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(wechatScss, /\.glean-wechat-publisher__series-chip\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(wechatScss, /\.glean-weread-step\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(wechatScss, /\.glean-weread-url-box\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 11. 闪卡制作弹窗柔和外壳与胶囊按钮流
    const flashcardDialog = read("src/ui/FlashcardDialog.svelte");
    assert.match(flashcardDialog, /\.glean-flashcard__head\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(flashcardDialog, /\.glean-flashcard__actions \.glean-btn\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 12. 排版、备份、AI批处理、快照治理与存量迁移外壳与胶囊流
    const formattingDialog = read("src/ui/FormattingDialog.svelte");
    const backupPanel = read("src/ui/BackupPanel.svelte");
    const aiBatchPanel = read("src/ui/AiBatchPanel.svelte");
    const snapshotGov = read("src/ui/SnapshotGovernance.svelte");
    assert.match(formattingDialog, /\.glean-formatting__head\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(formattingDialog, /\.glean-formatting__toolbar \.glean-btn\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(backupPanel, /\.glean-backup__head\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(backupPanel, /\.glean-backup__file\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(aiBatchPanel, /\.glean-ai-batch__row\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(snapshotGov, /\.glean-snapshot-governance\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(styles, /\.glean-migrate__filter,[\s\S]*\.glean-migrate__batch-input\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 13. 情境选文面板柔和外壳与胶囊流
    const contextPanel = read("src/ui/ContextSelectionPanel.svelte");
    assert.match(contextPanel, /\.glean-context-selection\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(contextPanel, /\.glean-context-selection__item\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(contextPanel, /\.glean-context-selection__field select\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(contextPanel, /\.glean-context-selection__open\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 14. 归档与恢复对话框选项卡片柔和外壳与胶囊流
    const dialogsScss = read("src/styles/components/dialogs.scss");
    assert.match(dialogsScss, /\.glean-archive-dlg__opt\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(dialogsScss, /\.glean-archive-dlg__icon\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(dialogsScss, /\.glean-archive-dlg__purge\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 15. 收集箱迁入按钮与关闭微控胶囊化
    assert.match(styles, /\.glean-inbox__ops \.glean-cap-btn\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-inbox__dismiss\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 16. 阅读位置控制与作者编辑面板胶囊流
    const readingPos = read("src/ui/ReadingPositionControls.svelte");
    const authorEditor = read("src/ui/AuthorEditor.svelte");
    assert.match(readingPos, /\.glean-reading-position\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(readingPos, /\.glean-reading-position__actions :global\(button\)\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(authorEditor, /\.glean-author-editor__form input\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(authorEditor, /\.glean-author-editor__actions \.glean-btn\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 17. 阅读器正文搜索浮动工具条胶囊化
    const readerSearchScss = read("src/styles/components/reader-search.scss");
    const readerSearchSvelte = read("src/ui/ReaderSearch.svelte");
    assert.match(readerSearchScss, /\.glean-reader-search\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(readerSearchSvelte, /\.glean-reader-search__input\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 18. 优先级微选框与分布列表标签胶囊化
    const distList = read("src/ui/DistributionList.svelte");
    assert.match(styles, /\.glean-rank-controls__field\s*\{[\s\S]*\.b3-select\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(distList, /\.glean-distribution__item\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 19. 读库分面侧栏项胶囊化与松青背景块激活态
    assert.match(styles, /\.glean-rail__item\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-rail__item\.glean-rail__item--on\s*\{[\s\S]*border-color:\s*color-mix\(in srgb, var\(--glean-color-action\)/);

    // 20. 迁移统计卡柔和外壳与悬浮微交互
    assert.match(dialogsScss, /\.glean-mstat\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(dialogsScss, /\.glean-mstat\s*\{[\s\S]*&:hover\s*\{[\s\S]*border-color:\s*color-mix\(in srgb, var\(--glean-color-action\)/);

    // 21. 标签别名管理弹窗 16px 圆角外壳、微卡片与全圆角胶囊输入框
    assert.match(styles, /\.glean-tag-alias-dialog\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(styles, /\.glean-tag-alias-item\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-md,\s*12px\);/);
    assert.match(styles, /\.glean-tag-alias-form input,[\s\S]*\.glean-tag-alias-form select\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 22. 首启引导笔记本 Chip 胶囊全圆角与松青激活背景块
    assert.match(styles, /\.glean-onboarding \.glean-nb\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-onboarding \.glean-nb--on\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);

    // 23. 紧凑分面活动态与过滤 Chip 松青色彩统一
    assert.match(styles, /\.glean-filter-chip\s*\{[\s\S]*border-color:\s*color-mix\(in srgb, var\(--glean-color-action\)/);
    assert.match(styles, /\.glean-filters--compact \.glean-filter--active\s*\{[\s\S]*border-color:\s*color-mix\(in srgb, var\(--glean-color-action\)/);
    assert.match(styles, /\.glean-filters--compact \.glean-filter-dir--active\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);

    // 24. 全局搜索框胶囊化与松青获焦光圈
    assert.match(styles, /\.glean-search\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-search\s*\{[\s\S]*&:focus-within\s*\{[\s\S]*border-color:\s*color-mix\(in srgb, var\(--glean-color-action\)/);

    // 25. 顶栏分段视图与阅读模式切换器激活态背景块与松青操作色
    assert.match(styles, /\.glean-views__btn\.glean-views__btn--on\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(styles, /\.glean-reader__mode\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-reader__mode \.glean-seg__btn--on\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);

    // 26. 状态队列胶囊松青激活背景块与数字徽章
    assert.match(styles, /\.glean-q--on\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(styles, /\.glean-q--on \.glean-q__n\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);

    // 27. 保存视图工具栏控件全圆角胶囊化与松青操作色
    assert.match(styles, /\.glean-saved-views\s*\{[\s\S]*border-bottom:\s*1px solid var\(--glean-border-soft\);/);
    assert.match(styles, /\.glean-saved-views :where\(\.b3-select, \.b3-text-field, \.glean-btn\)\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-saved-views \.glean-btn:first-of-type:not\(:disabled\)\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);

    // 28. 移动端筛选抽屉柔和外壳、胶囊化关闭、选择框与松青激活状态
    assert.match(styles, /\.glean-mobile-filter-sheet\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-20,\s*20px\)[\s\S]*border:\s*1px solid var\(--glean-border-soft\);/);
    assert.match(styles, /\.glean-mobile-filter-sheet__close\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-mobile-filter-trigger\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-mobile-filter-trigger--active\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(styles, /\.glean-mobile-filter-badge\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(styles, /\.glean-mobile-filter-field\s*\{[\s\S]*\.b3-select\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-mobile-filter-direction\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 29. 侧栏手风琴开关、微操作按钮、搜索框与更多展开全圆角胶囊化及松青操作色
    assert.match(styles, /\.glean-icon-btn--sm\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-icon-btn--sm\s*\{[\s\S]*&.glean-icon-btn--active\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(styles, /\.glean-rail__toggle\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-rail__search\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-rail__more\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(styles, /\.glean-rail__item--on \.glean-rail__n\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);

    // 30. 关键指标条全胶囊圆角、松青点击激活态与自适应断点
    assert.match(styles, /\.glean-stat-strip__item\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-stat-strip__item\s*\{[\s\S]*&.glean-stat-strip__item--active\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(styles, /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*\.glean-stat-strip__val\s*\{[\s\S]*font-size:\s*20px;/);
    assert.match(styles, /@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*\.glean-stat-strip__val\s*\{[\s\S]*font-size:\s*17px;/);

    // 31. 漫游阅读盲盒松青色彩统一、预算分段激活态与移动端断点
    assert.match(roamingScss, /\.glean-roaming-badge\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(roamingScss, /\.glean-roaming-budget-btn--active\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(roamingScss, /\.glean-roaming-title-btn\s*\{[\s\S]*&:hover\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(roamingScss, /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.glean-roaming-budget-btn\s*\{[\s\S]*min-height:\s*32px;/);
    assert.match(roamingScss, /@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*\.glean-roaming-triage\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*1fr\);/);

    // 32. 超窄视口（< 360px）紧凑筛选框、行条、看板卡片与保存视图弹性自适应
    assert.match(styles, /@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*\.glean-filters--compact \.glean-filter\s*\{[\s\S]*flex:\s*1 1 calc\(50% - var\(--glean-space-1\)\);/);
    assert.match(styles, /@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*\.glean-saved-views\s*\{[\s\S]*flex-direction:\s*column;/);

    // 33. 摘录墙松青主题色统一与过滤器 16px 柔和外壳
    assert.match(highlightScss, /\.glean-highlights__filters,\s*\.glean-highlights__tools--selection\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(highlightScss, /\.glean-highlights__item::after\s*\{[\s\S]*border:\s*2px solid var\(--glean-color-action\);/);
    assert.match(highlightScss, /\.glean-highlights__tools--card button\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);[\s\S]*color:\s*var\(--glean-color-action\);/);

    // 34. 空状态艺术图标 20px 圆角与松青底色、消除按钮与动作全圆角胶囊化
    assert.match(styles, /\.glean-empty__art\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-20,\s*20px\);[\s\S]*background:\s*color-mix\(in srgb, var\(--glean-color-action\)/);
    assert.match(styles, /\.glean-empty__clear-btn\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-empty__actions \.glean-empty__action,\s*\.glean-empty__actions \.glean-resurface__setup\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 35. 批量操作按钮全圆角胶囊聚焦光圈与禁用指针语义
    assert.match(styles, /\.glean-bb\s*\{[\s\S]*&:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(styles, /\.glean-bb\s*\{[\s\S]*&:disabled\s*\{[\s\S]*cursor:\s*not-allowed;/);

    // 36. 减弱动效响应覆盖核心指标条、搜索框、手风琴开关与分布标签
    assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-stat-strip__item,[\s\S]*\.glean-search,[\s\S]*\.glean-rail__toggle/);

    // 37. 原生阅读胶囊栏松青操作色、胶囊状态徽标、聚焦光圈与超窄自适应
    assert.match(styles, /\.glean-reading-context\s*\{[\s\S]*border-bottom:\s*1px solid var\(--glean-border-soft\);/);
    assert.match(styles, /\.glean-reading-context__status\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(styles, /\.glean-reading-context__source-btn[\s\S]*?&:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(styles, /\.glean-reading-context__source-btn--primary\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(styles, /@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*\.glean-reading-context\s*\{[\s\S]*padding:\s*var\(--glean-space-1-5\)\s*var\(--glean-space-2\);/);

    // 38. 原生状态动作按钮与阅读上下文微控制条减弱动效与松青悬停
    assert.match(styles, /\.glean-status-actions__btn\s*\{[\s\S]*border-color:\s*color-mix\(in srgb, var\(--glean-color-action\)/);
    assert.match(styles, /\.glean-status-actions__btn\s*\{[\s\S]*outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-reading-context__source-btn,[\s\S]*\.glean-status-actions__btn/);

    // 39. 长文切片圆环进度条松青强调色、药丸高对比度与移动端触控热区
    assert.match(slicingScss, /&__bar\s*\{[\s\S]*stroke:\s*var\(--glean-color-action\);/);
    assert.match(slicingScss, /\.glean-slicing-pill--active\s*\{[\s\S]*@media\s*\(forced-colors:\s*active\)[\s\S]*border:\s*1px solid Highlight;/);
    assert.match(slicingScss, /\.glean-star-btn\s*\{[\s\S]*&:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(slicingScss, /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.glean-slicing-create-btn\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(slicingScss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-slicing-create-btn\s*\{[\s\S]*transition:\s*var\(--glean-motion-none\)\s*!important;/);

    // 40. 微信读书向导松青色彩统一、聚焦光圈与移动端触控响应式折行
    assert.match(wechatScss, /\.glean-weread-local-card\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--glean-color-action\)/);
    assert.match(wechatScss, /\.glean-weread-local-btn\s*\{[\s\S]*border-color:\s*var\(--glean-color-action\);/);
    assert.match(wechatScss, /\.glean-weread-shelf-btn\s*\{[\s\S]*outline:\s*2px solid var\(--glean-color-wechat\);/);
    assert.match(wechatScss, /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.glean-weread-shelf-btn\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(wechatScss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-weread-shelf-btn,\s*\.glean-weread-local-btn\s*\{[\s\S]*transition:\s*var\(--glean-motion-none\)\s*!important;/);

    // 41. 弹窗通用组件样式松青勾选框、彻底删除聚焦光圈与移动端断点
    assert.match(dialogsScss, /\.glean-import-confirm__check input\s*\{[\s\S]*accent-color:\s*var\(--glean-color-action\);/);
    assert.match(dialogsScss, /\.glean-archive-dlg__purge\s*\{[\s\S]*&:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--b3-theme-error\);/);
    assert.match(dialogsScss, /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.glean-mstats \.glean-mstat\s*\{[\s\S]*min-height:\s*48px;/);
    assert.match(dialogsScss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-archive-dlg__opt,\s*\.glean-archive-dlg__purge\s*\{[\s\S]*transition:\s*var\(--glean-motion-none\)\s*!important;/);

    // 42. Bento 统计卡 16px 柔和外壳、松青标签悬停与移动端单列排版
    const bentoScss = read("src/styles/components/bento.scss");
    assert.match(bentoScss, /\.glean-tile\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(bentoScss, /\.glean-tile\s*\{[\s\S]*box-shadow:\s*var\(--glean-shadow-card\);/);
    assert.match(bentoScss, /\.glean-tag\s*\{[\s\S]*border-color:\s*var\(--glean-color-action\);[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(bentoScss, /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.glean-bento\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    assert.match(bentoScss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-tile,[\s\S]*\.glean-tag[\s\S]*transition:\s*var\(--glean-motion-none\)\s*!important;/);

    // 43. 统计回顾样式松青色彩统一、搜索清空聚焦光圈与移动端排版
    assert.match(statsScss, /\.glean-stats__distribution h3::before\s*\{[\s\S]*background:\s*var\(--glean-color-action\);/);
    assert.match(statsScss, /\.glean-stats__search-clear\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);
    assert.match(statsScss, /\.glean-stats__field\s*\{[\s\S]*&:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(statsScss, /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.glean-stats__completed-acts\s*\{[\s\S]*\.glean-btn\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(statsScss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-stats__trend-bar,[\s\S]*\.glean-stats__day[\s\S]*transition:\s*var\(--glean-motion-none\)\s*!important;/);

    // 44. 色彩主题体系 16px 柔和外壳、高对比度与移动端触控热区
    const paletteScss = read("src/styles/components/palette.scss");
    assert.match(paletteScss, /\.glean-palette-card\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(paletteScss, /\.glean-palette-card--active\s*\{[\s\S]*@media\s*\(forced-colors:\s*active\)[\s\S]*border:\s*2px solid Highlight;/);
    assert.match(paletteScss, /\.glean-reader__palette-dropdown,[\s\S]*\.glean-palette-quick-menu\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(paletteScss, /\.glean-reader__palette-opt,[\s\S]*\.glean-palette-quick-item\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);
    assert.match(paletteScss, /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.glean-palette-card\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(paletteScss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-palette-card,[\s\S]*\.glean-reader__palette-opt[\s\S]*transition:\s*var\(--glean-motion-none\)\s*!important;/);

    // 45. 次级维护弹窗（FormattingDialog 与 FlashcardDialog）松青色彩、等宽排版、聚焦光圈与移动端触控热区
    const formattingSvelte = read("src/ui/FormattingDialog.svelte");
    const flashcardSvelte = read("src/ui/FlashcardDialog.svelte");
    assert.match(formattingSvelte, /accent-color:\s*var\(--glean-color-action\);/);
    assert.match(formattingSvelte, /\.glean-formatting__selected\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(formattingSvelte, /@media\s*\(forced-colors:\s*active\)\s*\{[\s\S]*\.glean-formatting__mode\s*\{[\s\S]*border:\s*1px solid Highlight;/);
    assert.match(formattingSvelte, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-formatting__candidate\s*\{[\s\S]*transition:\s*var\(--glean-motion-none\)\s*!important;/);
    assert.match(flashcardSvelte, /\.glean-flashcard__sides label span\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(flashcardSvelte, /\.glean-flashcard button:focus-visible[\s\S]*outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(flashcardSvelte, /@media\s*\(forced-colors:\s*active\)\s*\{[\s\S]*\.glean-flashcard__mode\s*\{[\s\S]*border:\s*1px solid Highlight;/);
    assert.match(flashcardSvelte, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-flashcard__actions \.glean-btn/);

    // 46. AI批量/标签合并/备份/快照治理面板松青聚焦光圈、等宽计数与触控热区守门
    const aiBatchSvelte = read("src/ui/AiBatchPanel.svelte");
    const aiTagMergeSvelte = read("src/ui/AiTagMergePanel.svelte");
    const backupSvelte = read("src/ui/BackupPanel.svelte");
    const snapshotSvelte = read("src/ui/SnapshotGovernance.svelte");
    const flashcardRecoverySvelte = read("src/ui/FlashcardRecoveryPanel.svelte");
    assert.match(aiBatchSvelte, /\.glean-ai-batch :is\(button, \.glean-btn, input, details summary\):focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(aiBatchSvelte, /\.glean-ai-batch__count\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(aiBatchSvelte, /\.glean-ai-batch input\[type="checkbox"\]\s*\{[\s\S]*accent-color:\s*var\(--glean-color-action\);/);
    assert.match(aiTagMergeSvelte, /\.glean-ai-tag-merge :is\(button, \.glean-btn, select\):focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(aiTagMergeSvelte, /\.glean-ai-tag-merge__affected\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(backupSvelte, /\.glean-backup input\[type="checkbox"\]\s*\{[\s\S]*accent-color:\s*var\(--glean-color-action\);/);
    assert.match(backupSvelte, /\.glean-backup__meta, \.glean-backup__section-hint\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(snapshotSvelte, /\.glean-snapshot-governance :is\(button, \.glean-btn\):focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(snapshotSvelte, /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.glean-snapshot-governance__actions \.glean-btn\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(flashcardRecoverySvelte, /\.glean-flashcard-recovery__id\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);

    // 47. 归档与恢复对话框（ArchiveDialog 与 RestoreDialog）SVG 矢量图标替代、键盘防抖与高对比度无障碍守门
    const archiveSvelte = read("src/ui/ArchiveDialog.svelte");
    const restoreSvelte = read("src/ui/RestoreDialog.svelte");
    assert.match(archiveSvelte, /use href="#iconGleanArrowDown"/);
    assert.match(archiveSvelte, /use href="#iconGleanArchive"/);
    assert.match(archiveSvelte, /use href="#iconGleanClose"/);
    assert.match(archiveSvelte, /if \(e\.repeat\) return;/);
    assert.match(archiveSvelte, /@media\s*\(forced-colors:\s*active\)\s*\{[\s\S]*\.glean-confirm\s*\{[\s\S]*border:\s*1px solid CanvasText;/);
    assert.match(restoreSvelte, /use href="#iconGleanArrowUp"/);
    assert.match(restoreSvelte, /use href="#iconGleanExternal"/);
    assert.match(restoreSvelte, /if \(e\.repeat\) return;/);
    assert.match(dialogsScss, /\.glean-archive-dlg__icon\s*\{[\s\S]*\.glean-icon\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/);

    // 48. 切片向导/引述墙/作者编辑器（DocSlicingDialog, QuotesView, AuthorEditor）SVG 矢量图标、等宽排版与触控热区守门
    const docSlicingSvelte = read("src/ui/DocSlicingDialog.svelte");
    const quotesViewSvelte = read("src/ui/QuotesView.svelte");
    const authorEditorSvelte = read("src/ui/AuthorEditor.svelte");
    assert.match(docSlicingSvelte, /use href="#iconGleanSpark"/);
    assert.match(docSlicingSvelte, /use href="#iconGleanSearch"/);
    assert.match(quotesViewSvelte, /use href="#iconGleanNews"/);
    assert.match(quotesViewSvelte, /use href="#iconGleanArrowLeft"/);
    assert.match(quotesViewSvelte, /use href="#iconGleanCopy"/);
    assert.match(quotesViewSvelte, /\.glean-quotes__count\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(authorEditorSvelte, /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*\.glean-author-editor__form input\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(authorEditorSvelte, /@media\s*\(forced-colors:\s*active\)\s*\{[\s\S]*\.glean-author-editor__form\s*\{[\s\S]*border:\s*1px solid CanvasText;/);

    // 49. 微信读书向导弹窗（WeReadGuideDialog）全量采用 SVG 矢量图标替代 Emoji，纯净链接复制条与本地阅读卡无障碍对齐
    const wereadGuideSvelte = read("src/ui/WeReadGuideDialog.svelte");
    assert.match(wereadGuideSvelte, /use href="#iconGleanCopy"/);
    assert.match(wereadGuideSvelte, /use href="#iconGleanCheck"/);
    assert.match(wereadGuideSvelte, /use href="#iconGleanExternal"/);
    assert.match(wereadGuideSvelte, /use href="#iconGleanSpark"/);
    assert.match(wereadGuideSvelte, /use href="#iconGleanLocal"/);
    assert.match(wechatScss, /\.glean-weread-local-card\s*\{[\s\S]*&__icon\s*\{[\s\S]*\.glean-icon\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/);
    assert.match(wechatScss, /\.glean-weread-shelf-btn\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*gap:\s*var\(--glean-space-1-5,\s*6px\);/);

    // 50. 金句卡片与读库批量操作条（QuoteCardDialog 与 LibraryBatchBar）SVG 矢量图标、全圆角胶囊与无障碍契约守门
    const quoteCardSvelte = read("src/ui/QuoteCardDialog.svelte");
    const libraryBatchBarSvelte = read("src/ui/LibraryBatchBar.svelte");
    assert.match(quoteCardSvelte, /use href="#iconGleanDownload"/);
    assert.match(quoteCardSvelte, /use href="#iconGleanEdit"/);
    assert.match(quoteCardSvelte, /\.glean-quote-card-wm-btn\s*\{[\s\S]*display:\s*inline-flex;/);
    assert.match(libraryBatchBarSvelte, /use href="#iconGleanPlus"/);
    assert.match(libraryBatchBarSvelte, /use href="#iconGleanEdit"/);
    assert.match(libraryBatchBarSvelte, /use href="#iconGleanCopy"/);
    assert.match(libraryBatchBarSvelte, /use href="#iconGleanNews"/);
    assert.match(libraryBatchBarSvelte, /use href="#iconGleanArchive"/);
    assert.match(libraryBatchBarSvelte, /use href="#iconGleanDownload"/);

    // 51. 摘录墙/工作台预览/统计回顾/阅读上下文全套采用 SVG 矢量图标替代 Emoji，等宽数字排版与无障碍契约守门
    const highlightViewSvelte = read("src/ui/HighlightView.svelte");
    const workbenchPreviewSvelte = read("src/ui/WorkbenchPreview.svelte");
    const statsViewSvelte = read("src/ui/StatsView.svelte");
    const readingContextSvelte = read("src/ui/ReadingContext.svelte");
    assert.match(highlightViewSvelte, /use href="#iconGleanRefresh"/);
    assert.match(highlightViewSvelte, /use href="#iconGleanClose"/);
    assert.match(highlightViewSvelte, /use href="#iconGleanNews"/);
    assert.match(highlightViewSvelte, /use href="#iconGleanArchive"/);
    assert.match(highlightViewSvelte, /use href="#iconGleanLocal"/);
    assert.match(highlightViewSvelte, /use href="#iconGleanCard"/);
    assert.match(highlightScss, /\.glean-highlights__selection-count\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(workbenchPreviewSvelte, /use href="#iconGleanCamera"/);
    assert.match(workbenchPreviewSvelte, /use href="#iconGleanNews"/);
    assert.match(statsViewSvelte, /use href="#iconGleanCopy"/);
    assert.match(statsViewSvelte, /use href="#iconGleanClose"/);
    assert.match(statsViewSvelte, /use href="#iconGleanDownload"/);
    assert.match(readingContextSvelte, /use href="#iconGleanCopy"/);
    assert.match(readingContextSvelte, /use href="#iconGleanNews"/);

    // 52. 读库主工作台（DockPanel）更多操作、视图分段与漫游盲盒全套采用 SVG 矢量图标替代 Emoji，分段切换聚焦光圈契约守门
    const dockPanelSvelte = read("src/ui/DockPanel.svelte");
    assert.match(dockPanelSvelte, /glean-mobile-more__item[\s\S]*use href="#iconGleanRefresh"/);
    assert.match(dockPanelSvelte, /glean-views__btn--roam[\s\S]*use href="#iconGleanRefresh"/);
    assert.match(dockPanelSvelte, /use href="#iconGleanNews"[\s\S]*view\.modeList/);
    assert.match(dockPanelSvelte, /use href="#iconGleanCard"[\s\S]*view\.modeKanban/);
    assert.match(styles, /\.glean-seg__btn\s*\{[\s\S]*&:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--glean-color-action\);/);

    // 53. 今日拾遗与漫游阅读抽屉（ResurfaceView 与 RoamingDrawerDialog）SVG 矢量图标替代、全圆角胶囊与无障碍契约守门
    const resurfaceViewSvelte = read("src/ui/ResurfaceView.svelte");
    const roamingDrawerSvelte = read("src/ui/RoamingDrawerDialog.svelte");
    const roamingScssStyles = read("src/styles/components/roaming.scss");
    assert.match(resurfaceViewSvelte, /use href="#iconGleanRefresh"/);
    assert.match(resurfaceViewSvelte, /use href="#iconGleanSearch"/);
    assert.match(resurfaceViewSvelte, /use href="#iconGleanCopy"/);
    assert.match(resurfaceViewSvelte, /use href="#iconGleanNews"/);
    assert.match(resurfaceViewSvelte, /use href="#iconGleanArchive"/);
    assert.match(resurfaceViewSvelte, /use href="#iconGleanCamera"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanRefresh"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanCopy"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanNews"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanArchive"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanLocal"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanCard"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanCamera"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanInbox"/);
    assert.match(roamingScssStyles, /\.glean-roaming-tag--ai\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);

    // 54. 独立阅读页签（ReaderTab）伴生栏大纲/批注/划选快捷操作/微信导引/朗读全套采用 SVG 矢量图标替代 Emoji 契约守门
    const readerTabSvelte = read("src/ui/ReaderTab.svelte");
    assert.match(readerTabSvelte, /glean-reader__toolbar-margin-notes[\s\S]*use href="#iconGleanNews"/);
    assert.match(readerTabSvelte, /glean-reader__toolbar-roam[\s\S]*use href="#iconGleanRefresh"/);
    assert.match(readerTabSvelte, /glean-reader__selection-btn[\s\S]*use href="#iconGleanEdit"/);
    assert.match(readerTabSvelte, /glean-margin-note-card__memo[\s\S]*use href="#iconGleanEdit"/);
    assert.match(readerTabSvelte, /glean-wechat-publisher__btn[\s\S]*use href="#iconGleanNews"/);
    assert.match(readerTabSvelte, /glean-wechat-publisher__btn[\s\S]*use href="#iconGleanArchive"/);
    assert.match(readerTabSvelte, /glean-reader__outline-filter-clear[\s\S]*use href="#iconGleanClose"/);
    assert.match(readerTabSvelte, /glean-reader__outline-bookmark[\s\S]*use href="#iconGleanPin"/);
    assert.match(readerTabSvelte, /glean-reader__outline-copy-ref[\s\S]*use href="#iconGleanCopy"/);
    assert.match(readerTabSvelte, /glean-reader__preset-chip[\s\S]*use href="#iconGleanSpark"/);
    assert.match(readerTabSvelte, /glean-reader__preset-chip[\s\S]*use href="#iconGleanEdit"/);
    assert.match(readerTabSvelte, /glean-reader__preset-chip[\s\S]*use href="#iconGleanNews"/);

    // 55. 状态动作栏、侧边导轨、设置视图与初始化/迁移引导 SVG 矢量图标与无障碍规范守门
    const clipStatusActionsSvelte = read("src/ui/ClipStatusActions.svelte");
    const inboxSectionSvelte = read("src/ui/InboxSection.svelte");
    const libraryRailGroupSvelte = read("src/ui/LibraryRailGroup.svelte");
    const settingsViewSvelte = read("src/ui/SettingsView.svelte");
    const onboardingDialogSvelte = read("src/ui/OnboardingDialog.svelte");
    const migrateDialogSvelte = read("src/ui/MigrateDialog.svelte");

    assert.match(clipStatusActionsSvelte, /glean-status-actions__btn--restore[\s\S]*use href="#iconGleanArrowUp"/);
    assert.match(clipStatusActionsSvelte, /glean-status-actions__btn--primary[\s\S]*use href="#iconGleanNews"/);
    assert.match(clipStatusActionsSvelte, /use href="#iconGleanArrowRight"/);
    assert.match(clipStatusActionsSvelte, /use href="#iconGleanCheck"/);
    assert.match(clipStatusActionsSvelte, /glean-status-actions__btn--archive[\s\S]*use href="#iconGleanArchive"/);

    assert.match(inboxSectionSvelte, /glean-inbox__arrow[\s\S]*expanded \? "#iconGleanArrowDown" : "#iconGleanArrowRight"/);
    assert.match(libraryRailGroupSvelte, /glean-rail__arrow[\s\S]*prefs\.collapsed \? "#iconGleanArrowRight" : "#iconGleanArrowDown"/);

    assert.match(settingsViewSvelte, /role="radio"[\s\S]*aria-checked=\{currentThemePalette === palette\.id\}/);
    assert.match(settingsViewSvelte, /glean-palette-check[\s\S]*use href="#iconGleanCheck"/);
    assert.match(settingsViewSvelte, /glean-nb-search__clear[\s\S]*use href="#iconGleanClose"/);
    assert.match(settingsViewSvelte, /\.glean-nb-count\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(settingsViewSvelte, /@media \(forced-colors: active\)/);
    assert.match(settingsViewSvelte, /@media \(prefers-reduced-motion: reduce\)/);

    assert.match(onboardingDialogSvelte, /glean-onb-progress__dot[\s\S]*use href="#iconGleanCheck"/);
    assert.match(onboardingDialogSvelte, /glean-nb[\s\S]*use href="#iconGleanCheck"/);

    assert.match(migrateDialogSvelte, /case "ok": return t\(i18n, "migrate\.okLabel"\);/);
    assert.match(migrateDialogSvelte, /glean-step__ball[\s\S]*use href="#iconGleanCheck"/);
    assert.match(dialogsScss, /@media \(forced-colors: active\)\s*\{[\s\S]*\.glean-step__ball/);
    assert.match(dialogsScss, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.glean-step__ball/);

    // 56. 漫游红心收藏、打卡火苗、书签、朗读控制与滑动微交互 SVG 矢量图标标准化守门
    assert.match(resurfaceViewSvelte, /use href="#iconGleanFlame"/);
    assert.match(resurfaceViewSvelte, /use href=\{clip\?\.favorite \? "#iconGleanHeart" : "#iconGleanHeartOutline"\}/);
    assert.match(resurfaceViewSvelte, /glean-surf-swipe__action--archive[\s\S]*use href="#iconGleanArrowLeft"/);
    assert.match(resurfaceViewSvelte, /glean-surf-swipe__action--later[\s\S]*use href="#iconGleanArrowRight"/);

    assert.match(readerTabSvelte, /use href=\{context\.favorite \? "#iconGleanHeart" : "#iconGleanHeartOutline"\}/);
    assert.match(readerTabSvelte, /use href=\{speechState === "playing" \? "#iconGleanPause" : "#iconGleanPlay"\}/);
    assert.match(readerTabSvelte, /use href="#iconGleanStop"/);

    assert.match(workbenchPreviewSvelte, /use href=\{attrs\.favorite \? "#iconGleanHeart" : "#iconGleanHeartOutline"\}/);

    assert.match(roamingDrawerSvelte, /use href=\{favoriteOnly \? "#iconGleanHeart" : "#iconGleanHeartOutline"\}/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanBookmark"/);

    assert.match(dockPanelSvelte, /use href=\{selectedFavoriteOnly \? "#iconGleanHeart" : "#iconGleanHeartOutline"\}/);
    assert.match(dockPanelSvelte, /use href="#iconGleanBookmark"/);

    assert.match(styles, /\.glean-icon--fav\s*\{\s*color:\s*#EF4444;/);
    assert.match(styles, /\.glean-icon--flame\s*\{\s*color:\s*#F97316;/);
    assert.match(styles, /\.glean-icon--bookmark\s*\{\s*color:\s*var\(--glean-color-action\);/);

    // 57. 漏斗图连接箭头、星级打分 WAI-ARIA Radio Group 与微信识别/漫游提示矢量化守门
    const clipRankControlsSvelte = read("src/ui/ClipRankControls.svelte");

    assert.match(statsViewSvelte, /glean-stats__funnel-arrow[\s\S]*use href="#iconGleanArrowRight"/);
    assert.match(styles, /\.glean-stats__funnel-count\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);

    assert.match(clipRankControlsSvelte, /role="radio"[\s\S]*aria-checked=\{\(rating \?\? 0\) === star\}/);

    assert.match(dockPanelSvelte, /use href="#iconGleanSpark"[\s\S]*wechat\.recognizeSingle/);

    assert.match(roamingDrawerSvelte, /glean-roaming-score[\s\S]*use href="#iconGleanFlame"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanArrowRight"[\s\S]*roaming\.mobileSwipeTips/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanSpark"[\s\S]*roaming\.keyboardTips/);
    assert.match(roamingScss, /\.glean-roaming-score\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);

    // 58. 批量条优先级/评分按钮、星级微控与读库/漫游闪电/星标/时钟 SVG 矢量图标守门
    assert.match(libraryBatchBarSvelte, /glean-bb--priority[\s\S]*use href="#iconGleanBolt"/);
    assert.match(libraryBatchBarSvelte, /glean-bb--rating[\s\S]*use href="#iconGleanStar"/);

    assert.match(clipRankControlsSvelte, /use href=\{\(rating \?\? 0\) >= star \? "#iconGleanStar" : "#iconGleanStarOutline"\}/);

    assert.match(dockPanelSvelte, /use href="#iconGleanBolt"/);
    assert.match(dockPanelSvelte, /use href="#iconGleanStar"/);

    assert.match(roamingDrawerSvelte, /use href="#iconGleanBolt"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanStar"/);
    assert.match(roamingDrawerSvelte, /use href="#iconGleanClock"/);

    assert.match(styles, /\.glean-icon--bolt\s*\{\s*color:\s*#EAB308;/);
    assert.match(styles, /\.glean-icon--star\s*\{\s*color:\s*#F59E0B;/);
    assert.match(styles, /\.glean-icon--clock\s*\{\s*color:\s*var\(--b3-theme-on-surface\);/);
    assert.match(styles, /\.glean-tier-badge\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(slicingScss, /\.glean-star-btn\s*\{[\s\S]*\.glean-icon\s*\{[\s\S]*width:\s*13px;/);

    // 59. 金句卡片与渐进长文切片 WAI-ARIA Radio Group、方向键焦点流转、高对比度与超窄视口弹性排版守门
    const freshQuoteCard = read("src/ui/QuoteCardDialog.svelte");
    const freshDocSlicing = read("src/ui/DocSlicingDialog.svelte");
    const freshSlicingScss = read("src/styles/components/slicing.scss");

    // WAI-ARIA Radio Group 与 Radio 状态绑定
    assert.match(freshQuoteCard, /<div class="glean-quote-card-themes" role="radiogroup"/);
    assert.match(freshQuoteCard, /<div class="glean-quote-card-font-group" role="radiogroup"/);
    assert.match(freshQuoteCard, /role="radio"[\s\S]*aria-checked=\{activeThemeKey === theme\.key\}/);
    assert.match(freshQuoteCard, /role="radio"[\s\S]*aria-checked=\{activeFontSize === "sm"\}/);
    assert.match(freshQuoteCard, /aria-pressed=\{showWatermark\}/);

    assert.match(freshDocSlicing, /<div class="glean-slicing-pills" role="radiogroup"/);
    assert.match(freshDocSlicing, /role="radio"[\s\S]*aria-checked=\{targetMinutes === m\}/);

    // 键盘流转与方向键切换
    assert.match(freshQuoteCard, /handleThemeRadioKeyDown/);
    assert.match(freshQuoteCard, /handleFontRadioKeyDown/);
    assert.match(freshDocSlicing, /handlePillKeyDown/);

    // 高对比度与移动端触控热区 (>=44px)
    assert.match(freshQuoteCard, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.glean-quote-card-preview[\s\S]*border:\s*2px solid CanvasText;/);
    assert.match(freshQuoteCard, /@media\s*\(max-width:\s*560px\)[\s\S]*\.glean-quote-card-theme-btn[\s\S]*min-height:\s*44px;/);
    assert.match(freshQuoteCard, /@media\s*\(max-width:\s*560px\)[\s\S]*\.glean-quote-card-font-btn[\s\S]*min-height:\s*44px;/);
    assert.match(freshQuoteCard, /@media\s*\(max-width:\s*560px\)[\s\S]*\.glean-quote-card-wm-btn[\s\S]*min-height:\s*44px;/);

    assert.match(freshSlicingScss, /\.glean-slicing-pill\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(freshSlicingScss, /@media\s*\(max-width:\s*560px\)[\s\S]*\.glean-slicing-pill\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(freshSlicingScss, /@media\s*\(max-width:\s*360px\)[\s\S]*\.glean-slicing-card__head\s*\{[\s\S]*flex-wrap:\s*wrap;/);
    assert.match(freshSlicingScss, /@media\s*\(forced-colors:\s*active\)[\s\S]*border:\s*1px solid CanvasText;/);

    // 60. 5 阶语义折叠交互阅读器 (Folded Reader) WAI-ARIA、1-5 数字键缩放、双栏滚动联动与保真契约守门
    const freshFoldedReader = read("src/ui/FoldedReaderView.svelte");
    const freshReaderTab = read("src/ui/ReaderTab.svelte");
    const freshFoldedScss = read("src/styles/components/folded-reader.scss");

    assert.match(freshFoldedReader, /<div\s+class="glean-fold-reader__levels"\s+role="radiogroup"/);
    assert.match(freshFoldedReader, /role="radio"[\s\S]*aria-checked=\{currentLevel === cfg\.level\}/);
    assert.match(freshFoldedReader, /handlePillKeyDown/);
    assert.match(freshFoldedReader, /handleWindowKeyDown/);
    assert.match(freshFoldedReader, /e\.key === "1"/);
    assert.match(freshFoldedReader, /e\.key === "5"/);
    assert.match(freshFoldedReader, /onJumpToBlock\?\.?\(node\.blockId\)/);

    assert.match(freshReaderTab, /FoldedReaderView/);
    assert.match(freshReaderTab, /glean-reader__toolbar-fold/);
    assert.match(freshReaderTab, /companionTab === "fold"/);
    assert.match(freshReaderTab, /toggleFoldReader/);
    assert.match(freshReaderTab, /scrollAndPulseReadPoint\(protyleHost,\s*blockId\)/);

    assert.match(freshFoldedScss, /\.glean-fold-reader\s*\{/);
    assert.match(freshFoldedScss, /\.glean-fold-card\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(freshFoldedScss, /@media\s*\(max-width:\s*560px\)[\s\S]*\.glean-fold-reader__pill\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(freshFoldedScss, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.glean-fold-card\s*\{[\s\S]*border:\s*1px solid CanvasText;/);

    // 61. 入库自动分拣规则引擎、词表防膨胀、快照健康度盾牌徽标与 j/k/e/l Inbox Zero 极速流守门
    const freshImportService = read("src/services/import-service.ts");
    const freshEnrichDomain = read("src/domain/enrich.ts");
    const freshDockPanel = read("src/ui/DockPanel.svelte");
    const freshIndexTs = read("src/index.ts");
    const freshLibKeyboard = read("src/domain/library-keyboard.ts");
    const freshReaderShortcuts = read("src/domain/reader-shortcuts.ts");

    assert.match(freshImportService, /evaluateAutoTriage/);
    assert.match(freshEnrichDomain, /alignTagsWithVocabulary/);

    assert.match(freshDockPanel, /calculateSnapshotHealth/);
    assert.match(freshDockPanel, /glean-snap-badge/);
    assert.match(freshIndexTs, /<symbol id="iconGleanShield"/);
    assert.match(freshIndexTs, /<symbol id="iconGleanShieldCheck"/);
    assert.match(styles, /\.glean-snap-badge\s*\{/);

    assert.match(freshLibKeyboard, /lower === "a" \|\| lower === "l"/);
    assert.match(freshReaderShortcuts, /input\.key === "a" \|\| input\.key === "l"/);

    // 62. 看板单列虚拟滚动与轻量分页（BL-22）守门：content-visibility: auto 与独立分页加载
    assert.match(styles, /\.glean-kcard\s*\{[\s\S]*content-visibility:\s*auto;/);
    assert.match(styles, /\.glean-kcard\s*\{[\s\S]*contain-intrinsic-size:\s*auto\s*120px;/);
    assert.match(freshDockPanel, /KANBAN_INITIAL_LIMIT\s*=\s*50;/);
    assert.match(freshDockPanel, /kanbanColLimits/);
    assert.match(freshDockPanel, /loadMoreCol/);

    // 63. 沉浸式阅读器矮屏（<600px）大纲与划线手风琴折叠自适应（BL-23）守门
    assert.match(styles, /@media\s*\(max-height:\s*600px\)\s*\{[\s\S]*\.glean-reader__outline,[\s\S]*\.glean-reader__highlights\s*\{[\s\S]*max-height:\s*180px;/);
    assert.match(freshReaderTab, /isShortViewport/);
    assert.match(freshReaderTab, /onOutlineToggle/);
    assert.match(freshReaderTab, /onHighlightsToggle/);
    assert.match(freshReaderTab, /bind:open=\{outlineOpen\}/);

    // 64. 原生编辑器阅读伴生栏移动端软键盘动态避让（BL-24）守门
    const freshReadingContext = read("src/ui/ReadingContext.svelte");
    assert.match(styles, /\.glean-reading-context\s*\{[\s\S]*transform:\s*translateY\(calc\(-1\s*\*\s*var\(--glean-keyboard-inset,\s*0px\)\)\);/);
    assert.match(styles, /\.glean-reading-context\[data-glean-keyboard-open\]\s*\{/);
    assert.match(freshReadingContext, /installMobileViewportVars/);
    assert.match(freshReadingContext, /bind:this=\{rootEl\}/);

    // 65. 全局快捷与入口增强：漫游盲盒指令、顶栏右键快捷菜单与新手引导活动文档起步（BL-26/BL-27/BL-45）
    // BL-27 已迁移至官方 addTopBar contextMenu 通道：右键菜单并入思源原生顶栏条目菜单，
    // 严禁回退为自建 contextmenu 监听 + preventDefault（会拦掉 3.8.x 的固定/隐藏条目管理）
    assert.match(freshIndexTs, /langKey:\s*"cmd\.roamingPick"/);
    assert.match(freshIndexTs, /async triggerRoamingPick\(\)/);
    assert.match(freshIndexTs, /contextMenu:\s*\(menu\)\s*=>\s*this\.appendTopBarContextMenuItems\(menu\)/);
    assert.match(freshIndexTs, /appendTopBarContextMenuItems\(menu: subMenu\)/);
    assert.doesNotMatch(freshIndexTs, /topBarContextMenuHandler/);
    assert.doesNotMatch(freshIndexTs, /addEventListener\("contextmenu"/);
    assert.match(freshIndexTs, /topbarMenu\.resurface/);
    assert.match(freshIndexTs, /topbarMenu\.library/);
    assert.match(freshIndexTs, /topbarMenu\.highlights/);
    assert.match(freshIndexTs, /topbarMenu\.stats/);
    assert.match(freshIndexTs, /topbarMenu\.roaming/);
    assert.match(freshIndexTs, /topbarMenu\.settings/);

    assert.match(onboardingDialogSvelte, /const activeDocId = \$derived\(facade\.currentDocId/);
    assert.match(onboardingDialogSvelte, /async function finishWithCurrentDoc\(\)/);
    assert.match(onboardingDialogSvelte, /onboarding\.captureCurrentDoc/);
    assert.match(onboardingDialogSvelte, /onboarding\.captureCurrentHint/);

    // 66. 原生编辑器文本/块手柄拖拽至读库 DropZone 自动收录与制卡（BL-25）守门
    assert.match(freshDockPanel, /handleExternalDragEnter/);
    assert.match(freshDockPanel, /handleExternalDragLeave/);
    assert.match(freshDockPanel, /handleExternalDragOver/);
    assert.match(freshDockPanel, /handleExternalDrop/);
    assert.match(freshDockPanel, /isExternalDragActive/);
    assert.match(freshDockPanel, /glean-dropzone-overlay/);
    assert.match(freshDockPanel, /dropzone\.title/);
    assert.match(freshDockPanel, /dropzone\.desc/);
    assert.match(styles, /\.glean-dropzone-overlay\s*\{[\s\S]*border:\s*2px dashed var\(--glean-color-action\);/);

    // 67. 导轨分面项（作者/站点/标签）右键快捷操作菜单（BL-29）守门
    const freshRailGroupSvelte = read("src/ui/LibraryRailGroup.svelte");
    assert.match(freshRailGroupSvelte, /onContextMenu\?:\s*\(event:\s*MouseEvent,\s*item:\s*LibraryFacet\)\s*=>\s*void/);
    assert.match(freshRailGroupSvelte, /oncontextmenu=\{/);
    assert.match(freshDockPanel, /handleRailItemContextMenu/);
    assert.match(freshDockPanel, /markGroupArticlesDone/);
    assert.match(freshDockPanel, /railMenu\.filterTag/);
    assert.match(freshDockPanel, /railMenu\.setAlias/);
    assert.match(freshDockPanel, /railMenu\.markGroupDone/);
    assert.match(freshDockPanel, /railMenu\.filterAuthor/);
    assert.match(freshDockPanel, /railMenu\.filterSite/);
    assert.match(freshDockPanel, /railMenu\.openExternalSite/);

    // 68. 看板二维方向键导航（BL-30）与批量操作 Diff 预估提示（BL-31）守门
    const freshBatchBarSvelte = read("src/ui/LibraryBatchBar.svelte");
    assert.match(freshDockPanel, /moveKanbanCursor2D/);
    assert.match(freshDockPanel, /moveKanbanCursorVertical/);
    assert.match(freshDockPanel, /computeBatchDiff/);
    assert.match(freshBatchBarSvelte, /computeDiff\?:/);
    assert.match(freshBatchBarSvelte, /inlineDiff/);
    assert.match(freshBatchBarSvelte, /glean-batchbar__diff-hint/);
    assert.match(freshBatchBarSvelte, /library\.batchDiffHint/);
    assert.match(styles, /\.glean-batchbar__diff-hint\s*\{[\s\S]*color:\s*var\(--glean-color-action\);/);

    // 69. 沉浸阅读器禅意模式（BL-32）与 TTS 语音朗读段落黄色呼吸跟踪（BL-33）守门
    assert.match(freshReaderTab, /zenMode/);
    assert.match(freshReaderTab, /toggleZenMode/);
    assert.match(freshReaderTab, /exitZenMode/);
    assert.match(freshReaderTab, /glean-reader__toolbar-zen/);
    assert.match(freshReaderTab, /reader\.zenEnter/);
    assert.match(freshReaderTab, /reader\.zenExit/);
    assert.match(freshReaderTab, /event\.key === "F11"/);
    assert.match(styles, /\.glean-reader--zen\s*\{[\s\S]*\.glean-reader__toolbar\s*\{[\s\S]*opacity:\s*0\.15;/);

    assert.match(freshReaderTab, /highlightTtsChunk/);
    assert.match(freshReaderTab, /clearTtsHighlight/);
    assert.match(freshReaderTab, /glean-tts-reading-pulse/);
    assert.match(styles, /\.glean-tts-reading-pulse\s*\{[\s\S]*outline:\s*2px solid #f59e0b/);
    assert.match(styles, /@keyframes gleanTtsPulse/);

    // 70. 伴生栏悬浮胶囊模式（BL-34）与折叠大纲笔记草稿复制（BL-35）守门
    assert.match(freshReadingContext, /pillMode/);
    assert.match(freshReadingContext, /togglePillMode/);
    assert.match(freshReadingContext, /glean-reading-context--pill/);
    assert.match(freshReadingContext, /glean-reading-context__pill-toggle/);
    assert.match(freshReadingContext, /reading\.pillCollapse/);
    assert.match(freshReadingContext, /reading\.pillExpand/);
    assert.match(styles, /\.glean-reading-context--pill\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\)/);

    const freshFoldedSvelte = read("src/ui/FoldedReaderView.svelte");
    assert.match(freshFoldedSvelte, /copyCurrentOutlineMarkdown/);
    assert.match(freshFoldedSvelte, /formatFoldNodesToMarkdown/);
    assert.match(freshFoldedSvelte, /glean-fold-reader__copy-btn/);
    assert.match(freshFoldedSvelte, /foldReader\.copyMarkdown/);
    assert.match(freshFoldedSvelte, /foldReader\.markdownCopied/);

    // 71. 漫游高星级加权抽选（BL-36）与今日必读卡导出今日日记计划（BL-37）守门
    assert.match(roamingDrawerSvelte, /highRatingPriority/);
    assert.match(roamingDrawerSvelte, /toggleHighRatingPriority/);
    assert.match(roamingDrawerSvelte, /glean-roaming-rating-filter-btn/);
    assert.match(roamingDrawerSvelte, /roaming\.highRatingPriority/);

    assert.match(resurfaceViewSvelte, /exportingDailyNote/);
    assert.match(resurfaceViewSvelte, /exportPicksToDailyNote/);
    assert.match(resurfaceViewSvelte, /glean-surf-ops-bar/);
    assert.match(resurfaceViewSvelte, /resurface\.exportToDailyNote/);
    assert.match(styles, /\.glean-surf-ops-bar\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    // 72. 金句卡片笔名印章（BL-38）与批注墙划线分流导出卡片盒笔记（BL-39）守门
    const freshQuoteDialog = read("src/ui/QuoteCardDialog.svelte");
    assert.match(freshQuoteDialog, /let signature = \$state\(""\)/);
    assert.match(freshQuoteDialog, /glean-quote-card-stamp/);
    assert.match(freshQuoteDialog, /glean-quote-card-seal-input/);
    assert.match(freshQuoteDialog, /quoteCard\.sealPlaceholder/);
    assert.match(styles, /\.glean-quote-card-stamp\s*\{[\s\S]*border:\s*1\.5px solid #DC2626;/);

    const freshHighlightSvelte = read("src/ui/HighlightView.svelte");
    assert.match(freshHighlightSvelte, /exportColorCardsZettelkasten/);
    assert.match(freshHighlightSvelte, /glean-highlights__zettel-btn/);
    assert.match(freshHighlightSvelte, /highlight\.exportZettel/);
    assert.match(freshHighlightSvelte, /highlight\.zettelHeading/);
    assert.match(freshHighlightSvelte, /highlight\.zettelCopied/);

    // 73. 长文切片自定义层级分切（BL-40）与排版清洗剥离商业推广外链（BL-41）守门
    const freshDocSlicingSvelte = read("src/ui/DocSlicingDialog.svelte");
    assert.match(freshDocSlicingSvelte, /sliceHeadingLevel/);
    assert.match(freshDocSlicingSvelte, /glean-slicing-level-select/);
    assert.match(freshDocSlicingSvelte, /docSlicing\.headingLevel/);
    assert.match(styles, /\.glean-slicing-level-select\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-pill\);/);

    const freshFormattingDomain = read("src/domain/formatting.ts");
    assert.match(freshFormattingDomain, /export function stripPromotionalLinks/);

    // 74. 外部导入金句摘录块生成（BL-42）守门
    assert.match(read("src/services/import-service.ts"), /金句与高亮摘录/);

    // 75. 读库元数据定时轮转自动备份与快照载入（BL-43）守门
    const freshBackupService = read("src/services/backup-service.ts");
    assert.match(freshBackupService, /export async function runDailyAutoBackup/);
    const freshBackupPanel = read("src/ui/BackupPanel.svelte");
    assert.match(freshBackupPanel, /autoSnapshots/);
    assert.match(freshBackupPanel, /loadSnapshot/);
    assert.match(freshBackupPanel, /glean-backup__snapshots/);
    assert.match(styles, /\.glean-backup__snapshots\s*\{/);

    // 76. 设置配置包导出与导入（BL-44）守门
    const freshSettingsView = read("src/ui/SettingsView.svelte");
    assert.match(freshSettingsView, /exportPortableSettings/);
    assert.match(freshSettingsView, /importPortableSettings/);
    assert.match(freshSettingsView, /settings\.portableConfig/);
    assert.match(freshSettingsView, /settings\.exportConfig/);
    assert.match(freshSettingsView, /settings\.importConfig/);
});

