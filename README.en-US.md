# Lv Glean (小驴拾遗)

[![Quality gates](https://github.com/ai68298100/siyuan-glean/actions/workflows/ci.yml/badge.svg)](https://github.com/ai68298100/siyuan-glean/actions/workflows/ci.yml) [![CodeQL](https://github.com/ai68298100/siyuan-glean/actions/workflows/codeql.yml/badge.svg)](https://github.com/ai68298100/siyuan-glean/actions/workflows/codeql.yml) [![Latest release](https://img.shields.io/github/v/release/ai68298100/siyuan-glean?label=latest%20release)](https://github.com/ai68298100/siyuan-glean/releases/latest)

> Organize SiYuan clippings into a library for confirmation, read-later queues, reading management, and review; eligible SiYuan inbox items can also be imported when prerequisites are met.

Lv Glean organizes clippings and articles already in SiYuan. It does not crawl the web, and ordinary notes are never captured just because they sit in a selected notebook. You review the source evidence and confirm each candidate before it enters the library.

[中文说明](README.md) · [Latest Release](https://github.com/ai68298100/siyuan-glean/releases/latest) · [Capability matrix](docs/CAPABILITY-MATRIX.md) · [Feedback](https://github.com/ai68298100/siyuan-glean/issues/new/choose)

## v1.3.38 update (2026-10-27)

This release implements 1-click clean markdown copying in the companion bar and reader search modular styling.

**New features & improvements:**

- **1-Click Copy Clean Markdown**: `ReaderTab.svelte` adds a dedicated action to copy purified markdown (stripped noise & repaired media) directly to clipboard, ready for LLMs.
- **Modular Reader Search SCSS**: Decoupled `reader-search.scss` into components.

## v1.3.37 update (2026-10-27)

This release implements batch WeChat content purification on the workbench and modular SCSS architectural decoupling.

**New features & improvements:**

- **Batch WeChat Content Purification**: `LibraryBatchBar.svelte` adds WeChat awareness; when selected items contain WeChat clippings, the batch bar exposes a 1-click "✨ Purify WeChat" action to repair multiple legacy articles simultaneously.
- **Modular SCSS Architecture**: Established the `src/styles/components/` modular system, decoupling `wechat.scss`, `slicing.scss`, and `palette.scss` for improved maintainability and faster hot reloading.

## v1.3.36 update (2026-10-27)

This release implements WeChat deep content purification, SVG interactive layout extraction, component cards conversion, and canonical deduplication fingerprints.

**New features & improvements:**

- **WeChat Deep Content Purification**: Added `purifyWechatArticle` in `wechat-service.ts`; companion bar provides a 1-click "✨ Purify Article" action to chain lazy-load, background images, LaTeX, code snippets, voice notes, and noise cleanup with updated pure word counts.
- **SVG Interactive Layout Purification**: Extracts embedded images from complex third-party SVG layouts while stripping empty animation containers and XML noise.
- **Cross-Channel Canonical WeChat Fingerprint**: Added `canonicalWechatUrlKey` using `__biz`, `mid`, and `idx` to prevent duplicate captures across varied sharing links.

## v1.3.35 update (2026-10-27)

This release implements progressive slice awareness in daily resurfacing, mobile haptic touch feedback, and shortcut matrix alignment.

**New features & improvements:**

- **Slice Awareness in Daily Resurfacing**: Resurfacing cards automatically detect doc slices, highlighting "✂️ Progressive slice · ~X min quick read" to eliminate hesitation.
- **Mobile Swipe Haptic Feedback**: `ResurfaceView.svelte` triggers a crisp 12ms tactile vibration when swipe actions lock, bringing native app touch feel.
- **Shortcut Matrix Alignment**: Added `Alt+E` card extraction keycap in reader shortcut help.

## v1.3.34 update (2026-10-27)

This release implements the quick theme switcher on the main library dock toolbar and quote card theme synchronization.

**New features & improvements:**

- **Quick Theme Switcher on Library Toolbar**: `DockPanel.svelte` adds a quick color palette menu next to settings; readers can switch between 6 themes right from the library workbench with live instant rendering.
- **Quote Card Theme Synchronization**: `QuoteCardDialog.svelte` automatically detects and syncs with the active plugin palette for cohesive visual export.

## v1.3.33 update (2026-10-27)

This release implements the quick theme palette picker on the reader toolbar and progressive slice markers in the outline tree.

**New features & improvements:**

- **Quick Theme Palette Picker on Toolbar**: Added a dedicated "🎨" theme palette menu to `ReaderTab.svelte` top toolbar, allowing readers to instantly switch between all 6 color palettes while reading without opening settings.
- **Progressive Slice Markers in Outline Tree**: The companion outline tree automatically annotates slice starting sections with estimated reading time pills (`✂️ Slice 1 · ~8m`), delivering clear pacing for longform reading.

## v1.3.32 update (2026-10-27)

This release implements the plugin-wide Theme Palette System, offering 6 curated high-quality color themes with instant live preview.

**New features & improvements:**

- **Plugin-Wide Theme Palette System**: Added `theme-palette.ts` and `theme-palette-controller.ts`, featuring 6 distinct palettes: Nordic Teal, Warm Amber, Deep Violet, Ocean Blue, Obsidian Dark, and Crimson Rose.
- **Bento Theme Cards in Settings**: `SettingsView.svelte` features a visual color palette grid on the general settings page; clicking any theme immediately switches all brand CSS variables live and persists your preference.

## v1.3.31 update (2026-10-27)

This release implements progressive document slicing (Doc Slicing), the high-precision Read-Point Engine, and selection Alt+E card creation, alongside resolving onboarding dialog screen flicker.

**New features & improvements:**

- **Progressive Doc Slicing by Outline**: For long articles, the companion outline header provides a "✂️ Slice Doc" shortcut and `DocSlicingDialog.svelte`. It divides long articles into 5~15 min reading slices based on H2/H3 headings, generating sub-documents with native block reference backlinks into the later queue.
- **High-Precision Read-Point Engine**: Added `read-point-observer.ts` using `IntersectionObserver` to track the viewport center line (10% slice). Dwell times over 1 second save `custom-lv-read-point` block IDs; opening articles automatically smooth-scrolls to the block with 1.5s pulse glow (`.glean-pulse-highlight`).
- **Quick Selection Extract (Alt+E) to Lv Cards**: Selection toolbar adds a 1-click "Extract to Cards" action and global `Alt+E` shortcut, dispatching backlink cards to Lv Cards with 45% ghost button fallback when uninstalled.
- **Onboarding Dialog Anti-Flicker Overhaul (Issue #16)**: Introduced asynchronous pre-resolution and smooth skeleton transitions, removing layout jumps between steps and immediately dismissing completed dialogs without ghost frames.

## v1.3.30 update (2026-10-27)

This release implements WeChat article series/collection auto-tagging, a brand-new Quote Card generator, and high-DPI 2x Canvas PNG export.

**New features & improvements:**

- **WeChat Series / Collection Auto-tagging**: `wechat-service.ts` automatically extracts article series names (e.g. "LLM Frontier Practice") into `custom-clip-ai-tags`, enabling 1-click sidebar filtering by series.
- **Quote Card Generator & Retina PNG Export**: Designed `QuoteCardDialog.svelte` featuring 4 themes (Nordic Teal, Wheat & Paper, Obsidian, Minimal White); native Canvas 2x super-sampled export supports "Copy Image" and "Save PNG".
- **Quote Card Action Across Views**: Added "🖼️ Quote Card" shortcuts to both `HighlightView.svelte` and `ReaderTab.svelte`.

## v1.3.29 update (2026-10-27)

This release implements direct interactive heatmap drill-down, auto-expanding completed lists, preview-to-library author filtering, and concise domain pills in editor context.

**New features & improvements:**

- **Interactive Heatmap Cell Drill-down**: Click or press Enter/Space on any heatmap cell in `StatsView.svelte` to instantly highlight and filter completed articles for that day with auto-expanded list.
- **Preview Author Drill-down**: Click publisher or author names in `WorkbenchPreview.svelte` to instantly filter the entire library by that author.
- **Concise Domain Pills in Editor Context**: Replaced raw, overflowing URLs in `ReadingContext.svelte` with clean, concise host pills and full URL tooltips.

## v1.3.28 update (2026-10-27)

This release implements keyboard shortcut highlight hopping (h/H), zero-token WeChat official description backfill, one-click copy of all article highlights, and author URL defensive rendering.

**New features & improvements:**

- **Keyboard Shortcut Highlight Hopping**: Navigate smoothly across article highlights using single key `h` (next) and `H` (previous) with automatic center-scrolling and soft breath animations.
- **Zero-Token WeChat Description Auto-fill**: Automatically extracts official `<meta og:description>` during background scan and populates `custom-clip-summary` without calling LLMs.
- **Copy All Article Highlights in Companion Bar**: One-click action in the companion notes header copies all highlights in standard Markdown format with SiYuan block references.
- **All-Surface WeChat Author URL Defense**: Companion publisher badge leverages `displayWechatAuthor` to prevent raw link exposure everywhere.

## v1.3.27 update (2026-10-27)

This release implements a 4-color quick highlighter palette on the selection bar, WeRead accessible reader links, and batch tag/author actions.

**New features & improvements:**

- **Quick 4-Color Highlighter Palette**: Directly click yellow, red, blue, or green dots on the selection toolbar to instantly create and colorize excerpts with block IAL properties.
- **WeRead Web Quick Launch**: Added a dedicated WeRead capsule badge in `WorkbenchPreview.svelte` for one-click distraction-free reading of WeChat articles.
- **Batch Add Tag & Set Author**: `LibraryBatchBar.svelte` adds quick actions to append tags and assign authors across multiple articles simultaneously.
- **4-Color Accent Border for Highlights**: Highlight cards in both `HighlightView.svelte` and companion sidebars now feature 3px color stripes for clear visual categorization.

## v1.3.26 update (2026-10-25)

This release implements strict long-URL suppression for WeChat authors, concise source pill capsules in the workbench preview, and deep palette harmonization.

**New features & improvements:**

- **Strict URL Author Filtering**: `cleanExtractedName` and `displayWechatAuthor` defensively filter out raw HTTP/HTTPS links and domains from author fields, ensuring only genuine publisher names appear on cards.
- **Concise Preview Source Pill**: `WorkbenchPreview.svelte` replaces raw URL strings with an elegant `.glean-preview__source-link` pill badge, keeping titles clean while preserving link access.
- **Harmonized Surface Badges**: Fulltext carrier badges and AI tags harmonize into subtle translucent Nordic Teal, resolving multi-color clashes.

## v1.3.25 update (2026-10-25)

This release implements the silent background WeChat publisher auto-recognition queue and elegant localized Chinese site projection in the navigation rail.

**New features & improvements:**

- **Silent Background WeChat Recognition Queue**: Added `triggerSilentWechatScan` in `DockPanel.svelte`, which automatically and gently processes WeChat articles in batches of 6 in the background after library load, requiring zero manual clicks or confirmation from the reader.
- **Friendly Chinese Site Projection in Rail**: `LibraryRailGroup.svelte` maps `mp.weixin.qq.com` to the friendly label "微信" (WeChat) in the sidebar rail, making navigation more intuitive and consistent.

## v1.3.24 update (2026-10-25)

This release delivers the Nordic Library Teal aesthetic overhaul, significantly elevating UI texture and visual calm across all surfaces.

**New features & improvements:**

- **Nordic Library Teal Aesthetic Overhaul**: Primary brand gradient `--glean-grad` is upgraded to deep, sophisticated Nordic pine/teal (`#0D9488` → `#0F766E`); primary capture and action buttons embrace subtle teal glows, retiring high-saturation orange and eliminating visual noise.
- **Queue and Facet Visual De-Noising**: Status capsules like "Inbox" and active rail facets now use gentle, translucent teal backdrops with pill counters, reducing eye strain.
- **Frosted Batch Bar & Dark Mode Tuning**: The batch action bar features 12px backdrop-blur and soft diffused shadows; dark mode contrast adapts automatically for nighttime comfort.

## v1.3.23 update (2026-10-25)

This release delivers automatic, mandatory WeChat publisher recognition & backfill without requiring user confirmation, plus silent hiding for unavailable cloud inboxes.

**New features & improvements:**

- **Mandatory Auto-Recognition for WeChat Publishers**: Added `wechat-service.ts` for fast, zero-token local extraction; `WorkbenchPreview.svelte` now silently and automatically detects and saves publisher names to `custom-clip-author`; `DockPanel.svelte` adds a one-click banner to scan and backfill all WeChat articles in batch.
- **Silent Hiding for Unavailable Inboxes**: Strictly adheres to the silent-hide contract when cloud inboxes are unavailable or unconfigured, completely removing intrusive error banners and checkmarks from the library workbench.

## v1.3.22 update (2026-10-25)

This release delivers comprehensive E2E verification across all user paths, legacy clipping data robustness, and refined multi-tier filter alignment.

**New features & improvements:**

- **Reading Time Filter Chips Alignment**: `domain/library-filter-chips.ts` now tracks `readingTimeTier`, allowing readers to see and clear reading duration filters (`<5 min`, `5-15 min`, `>15 min`) directly in the active filter bar.
- **Legacy WeChat Article Recognition Hardening**: `domain/wechat.ts` now defensively identifies scheme-less domains (`mp.weixin.qq.com`) and legacy aliases (`微信`/`微信公众号`), bringing 100% badge recognition to older clippings.
- **Escape Keyboard Dismiss for Selection Bar & Memo**: Escape key now immediately collapses the selection toolbar and memo input box, seamlessly returning keyboard focus to the document root.
- **Defensive Note Generation for Companion Highlights**: Added parent notebook/path fallbacks in `createArticleHighlightsDoc` ensuring 100% note generation success even for isolated blocks from older databases.

## v1.3.21 update (2026-10-24)

This release implements a floating waveform audio player capsule (`.glean-reader__floating-speech`) for in-viewport playback and pause control during text-to-speech reading.

**New features & improvements:**

- **In-Viewport Floating Audio Player Capsule**: An unobtrusive frosted-glass audio capsule manifests in the bottom-left corner when TTS playback begins, delivering real-time animated waveforms (`@keyframes glean-speech-wave`), progress indicators (`X/Y`), and in-place play/pause/stop buttons.

## v1.3.20 update (2026-10-24)

This release equips immersive and collapsed reading modes with a frosted-glass floating progress pill showing current percentage and estimated minutes remaining.

**New features & improvements:**

- **Floating Reading Progress Capsule**: `ReaderTab.svelte` automatically manifests a frosted-glass floating pill (`.glean-reader__floating-progress`) when the companion sidebar is collapsed or in immersive mode and progress exceeds 12%, keeping readers aware of both percentage and remaining minutes (`45% · 3 min left`).

## v1.3.19 update (2026-10-24)

This release closes the loop on multi-color highlight filtering across the global highlights wall (`filterHighlights` with `color` support and in-place color selector dropdown).

**New features & improvements:**

- **Global Highlights Wall Multi-Color Filter**: `HighlightView.svelte` dynamically presents a color filter dropdown (`reader.filterByColor`) whenever multiple colors exist, enabling seamless sorting among yellow/red/blue/green marks.

## v1.3.18 update (2026-10-24)

This release delivers the interactive site/publisher drill-down filter loop (`handleSiteClick`) across library cards, ensuring effortless publisher filtering even when metadata is incomplete.

**New features & improvements:**

- **Interactive WeChat Publisher Filtering Loop**: `DockPanel.svelte` equips all cards with smart `handleSiteClick` routing; clicking the emerald badge filters by recognized author publisher directly, or falls back gracefully to `mp.weixin.qq.com`.

## v1.3.17 update (2026-10-24)

This release enables one-click study note generation directly from the companion sidebar highlights stream and refines dual-attribute WeChat detection in formatting analysis.

**New features & improvements:**

- **In-Place Highlight Note Generation**: Added "Create highlight note" (`highlight.createArticleDoc`) in `ReaderTab.svelte` sidebar header, letting readers compile all highlights into a dedicated SiYuan block-reference note on the fly.
- **Dual-Attribute WeChat Formatting Detection**: `formatting-service.ts` now probes both `attrs.url` and `attrs.site` with `isWechatUrl`, guaranteeing content repairing triggers for WeChat clippings regardless of metadata location.

## v1.3.16 update (2026-10-24)

This release delivers multi-dimensional metadata alignment on resurface cards and interactive annual heatmap filtering in the stats review view.

**New features & improvements:**

- **Resurface Cards Rich Metadata Alignment**: Cards in `ResurfaceView.svelte` now present emerald WeChat publisher badges (`.glean-source-wechat`), reading duration tier badges, and user tags (`#tag`) along with AI tags (`✨aiTag`).
- **Interactive Annual Heatmap Cell Drill-Down**: Cells in `StatsView.svelte` (`glean-stats__day`) now support keyboard focus and click-to-filter for completed articles on that specific day (`selectedDayDate`).

## v1.3.15 update (2026-10-24)

This release equips the native SiYuan reading context capsule with emerald WeChat identification and a direct reader launch button, plus interactive tag pills across all library cards.

**New features & improvements:**

- **Native Reading Capsule WeChat Badge & Direct Reader Access**: `ReadingContext.svelte` now displays the emerald WeChat badge and publisher name on WeChat notes, along with an "📖 Open in Glean Reader" button to jump directly into deep distraction-free reading with companion tools.
- **Library Cards Interactive Tag & AI Tag Pills**: Kanban, list, and table items in `DockPanel.svelte` now render user tags (`#tag`) and AI tags (`✨aiTag`) with instant drill-down filtering on click.

## v1.3.14 update (2026-10-24)

This release delivers deep URL-level WeChat article recognition in the library workbench, smooth Space / Shift+Space page turning shortcuts for the reader, and full AI Quiz question generation across the highlights wall.

**New features & improvements:**

- **WeChat Article Identification in Library Workbench**: `DockPanel.svelte` integrates `isWechatUrl` to ensure WeChat clippings are identified and styled with the emerald badge even without `entry.site` metadata, preventing "unknown source" fallbacks and enabling one-click publisher filtering.
- **Modern Spacebar Page-Turn Shortcuts**: Following Readwise Reader / Cubox / Kindle standards, reader mode now supports `Space` (smooth page-down) and `Shift+Space` (smooth page-up); clearly documented in the `?` shortcut modal.
- **Highlights Wall Lv Exam Federation**: Highlights cards across timeline and article views now feature the "📝 AI Quiz" button, connecting directly to Lv Exam (`LvExam`) with ghost button fallback.

## v1.3.13 update (2026-10-23)

This release implements the ecosystem directive hardening, thoroughly eliminating `.dialog-content input` global CSS leaks, synchronizing ghost button degradation across the highlights wall, adapting cross-platform hotkeys, and guarding the new 256x256 high-contrast `icon.png` asset.

**New features & improvements:**

- **Eliminated Global `.dialog-content input` Leaks**: Scoped mobile dialog form styles strictly under `.lv-glean`, `.glean-dialog`, and `[class*="glean"]` namespaces, preventing unwanted overrides on native SiYuan or third-party modals.
- **Synchronized Ghost Flashcard Buttons**: Highlights timeline and grouped article views now detect Lv Cards (`hasCardsInstalled`) and apply 45% ghost button styling with an informative tooltip when uninstalled.
- **Cross-Platform Adaptive Hotkeys**: Tuned default workbench shortcut dynamically (`⌥⌘G` on macOS, `Ctrl+Alt+G` on Windows/Linux), eliminating modifier parsing issues on non-Mac desktops.

## v1.3.12 update (2026-10-23)

This release brings automatic WeChat Official Account recognition and manual rescan, in-sidebar highlight keyword search filtering, and single-highlight AI Quiz generation (Lv Exam federation with ghost button fallback).

**New features & improvements:**

- **Automatic WeChat Official Account Recognition**: Automatically probes content DOM and header text upon opening WeChat clippings without author; seamlessly writes back `custom-clip-author`; provides a one-click "Rescan publisher" button in the WeChat card.
- **Enhanced Sidebar Highlight Study Stream**: Highlights filter bar automatically displays when 4 or more highlights exist; added "📝 AI Quiz" button to highlight cards with ghost fallback for uninstalled Lv Exam plugin.

## v1.3.11 update (2026-10-23)

This release implements the unified `.lv-dialog-title-wrap` branded dialog header standard across all dialog surfaces (22×22 pine green wheat icon + title text + compact version badge) and reinforces deep series article path null-safety.

**New features & improvements:**

- **Unified `.lv-dialog-title-wrap` Dialog Headers**: Dialog header bars across settings, formatting, onboarding, migration, import, flashcards, and workbench popup surfaces are now unified with standard brand insignia and version badge.
- **Micro-Interaction & Defensiveness Hardening**: Fortified optional chaining and undefined checks in series collection traversal to eliminate edge-case null pointer hazards.

## v1.3.10 update (2026-10-23)

This release implements the full Lv Ecosystem Directive (Epoch 6), featuring ecosystem federation bridge integration, automatic reading checkin logging, ghost degradation for flashcard and exam quiz creation, Raikiri workbench widget registration, 32×32 monochrome wheat icon upgrade, global CSS pollution elimination, and Nordic Pine Green + Harvest Wheat aesthetic tokens.

**New features & improvements:**

- **Ecosystem Federation & Automatic Checkin**: Deep integration with `ecosystem-bridge-kit` SDK; automatically logs checkin events when articles are marked done with zero hard dependencies; four bridge aliases (`siyuanGlean`, `xiaolvGlean`, `lvGlean`, `LvGlean`) with first-instance-wins and safe teardown.
- **Flashcard & Exam Question Ghost Degradation**: In-article selection bar detects Lv Cards (`window.xiaolvCards`) and Lv Exam (`window.LvExam`); renders a 45% ghost button with helpful installation tooltips when uninstalled; registers the `glean-later-list` reading stream widget with Lv Raikiri.
- **Monochrome Vector Icon Upgrade**: Upgrades `iconGleanWheat` to an open-book base with wheat stalk, two pairs of grain seeds, and top wisdom bead, ensuring needle-sharp rendering on 16px retina displays.
- **Global CSS Pollution Cleansing & Brand Styling**: Completely wraps raw `.dialog-content` selectors to prevent pollution of SiYuan native modals; injects brand tokens `--lv-brand: #0D9488` and `--lv-accent-wheat: #FB923C` with active physical micro-tactile button feedback.
- **Marketplace Discovery & Engineering Hardening**: Prepends brand keywords `"小驴"`, `"小驴拾遗"`, `"xiaolv"`, `"lv"` to `plugin.json`; enables `"settingsWindow": true`; adds root `CHANGELOG.md` and `.github/workflows/release.yml`.

## v1.3.9 update (2026-10-22)

This release focuses on alignment with SiYuan's latest official Petal lifecycle contracts, four-dimensional reading metrics with tier color dots, in-place highlight color cycling and color filtering, smooth back-to-top floating capsule for deep reading, and one-click expand/collapse all for article highlight groups.

**New features & improvements:**

- **Official Petal Lifecycle Alignment**: Implements `onDataChanged` to prevent full plugin reload during cross-device cloud sync or external writes; adds single-instance guard to `onLayoutReady` to prevent duplicate topbar icons; integrates official `open-siyuan-url-plugin` protocol and `sync-end` event for instant UI refresh.
- **Reading Metrics & Highlight Color Management**: Four-dimensional metrics capsule integrates `resolveReadingTimeTier` color dots (short/emerald, medium/azure, long/amber); sidebar highlight dots support 1-click cycling across 4 colors (yellow/red/blue/green) with block-level IAL persistence and in-place color filtering; compact tag bar display below metrics.
- **Smooth Back-to-Top Floating Capsule**: Floating action button (`.glean-reader__back-to-top`) smoothly appears when reading progress exceeds 12%, allowing effortless return to document start in long essays.
- **Expand/Collapse All in Grouped Highlights**: Highlights view toolbar adds one-click "Collapse all / Expand all" action in article grouping mode (`allGroupsOpen`).

## v1.3.8 update (2026-10-22)

This release delivers comprehensive WeChat Official Account clipping optimizations, fulltext in-page highlight search, floating selection toolbar with inline notes, precision highlight targeting, Bento streak and reading achievement milestones, and an overhauled settings dialog.

**Added & Enhanced:**

- **WeChat Official Account deep optimizations**:
  - Automatically identifies publisher names, publication time, and author lead summaries without extra AI token costs.
  - Automatically fixes `data-src` lazy-loaded images, restores CSS `background-image` panoramic illustrations, and avoids anti-hotlink 403 errors.
  - Reverse-engineers LaTeX math formulas into standard Markdown syntax and purifies code blocks without line-number clutter.
  - Converts `<mpvideo>` and Tencent Video embeds to structured cards and extracts audio widgets to voice quote cards.
  - Adds a dedicated WeChat companion card with publisher avatar, Biz ID, WeRead web reading shortcut, clean short link copying, and series/folder chapter continuous navigation.
  - Library cards and rows feature one-click WeChat source facet filtering.
- **Enhanced deep reader (ReaderTab)**:
  - In-page fulltext search using the modern, non-invasive `CSS.highlights` API with bidirectional navigation.
  - Selection floating toolbar (`glean-reader__selection-bar`) for instant quotes, inline notes ("Quote with Memo"), flashcards, and translation.
  - Theme switching (Follow SiYuan / Paper / Eye-protection green), immersive mode with breathing toolbar fade-out and Escape restoration.
- **Highlight and quote knowledge flow**:
  - Companion panel lists document highlights with smooth scroll and pulse highlight feedback.
  - Highlights wall "Original" action precisely targets and scrolls directly to the referenced quote block.
  - Flat timeline view with vertical rail and interactive circular anchors; exports quotes to linked SiYuan documents with native block references.
- **Today's Gleaning and stats achievements**:
  - Bento habit loop: streak flame card and 7-day stepper pill bar for calm reading motivation.
  - Reading achievements: 6 milestone badges on the stats review page.
  - Reading time tier badges (emerald green for short, azure blue for medium, amber orange for long); Kanban titles capped with `line-clamp: 3`.
- **Expanded settings panel**:
  - Expanded to 920×720px with 8 categories equipped with dedicated SVG icons; fixed newbie hint banner truncation.
- **Complete keyboard accessibility**:
  - Collapsible library rail (`railCollapsed`); full keyboard triage across library, highlights, resurface, and modal dialogs.

## v1.3.7 update (2026-10-19)

This release unifies keyboard accessibility across dialogs, introduces reading time tier filtering inspired by Readwise Reader and Cubox, and completes reading-facade routing for uninterrupted reading continuity.

**Added:**

- **Reading time tier filtering**: Filter articles by estimated reading time (short ≤5 min, medium 6-15 min, long >15 min) in library secondary filters, combining seamlessly with site, author, tag, and content type.
- **Keyboard accessibility and shortcut workflows**: Escape closes FormattingDialog, FlashcardDialog, ArchiveDialog, and RestoreDialog; `Ctrl+Enter` / `Cmd+Enter` provides quick draft saving and card confirmation.
- **Unified reading-facade routing and session continuity**: Opening existing inbox articles routes through `facade.openReadingDocument` to connect recent reading history and ReaderTab; Today's Gleaning features an in-session "Continue Reading" card; TTS playback remembers speech rate (0.75x–1.5x) and resumes from the current chunk; "Continue Reading" command supports alternating between reading history and current document.
- **Friendly site branding**: New `displaySiteName` pure function projects high-frequency domains (WeChat, Zhihu, Bilibili, SSPAI, Juejin, GitHub, etc.) to clean brand names while preserving raw `custom-clip-site` facts.
- **Excerpts and statistics enhancements**: Highlights wall supports one-click "Clear selection" and formatted Markdown quote copying, plus bulk export to `.md` files; stats heatmap and daily table support click-to-filter completed articles; added calm conversion funnel card.
- **Data sovereignty and security safeguards**: Canonical URL deduplication strips tracking parameters; custom AI endpoint validates HTTP vs HTTPS and warns on cleartext public endpoints; backup exports adopt standard timestamped filenames with package summaries; hardened high-contrast and forced-colors styling.

**Improved & Fixed:**

- Responsive titles and row density for library and candidate views, preventing horizontal text squeezing in narrow split panes.
- Batch action bar preserves selections across filter changes, returning keyboard focus safely; fixed mobile topbar/bottombar CSS selectors for edge-to-edge safe areas.
- Candidate source replenishment input supports Enter to submit and Escape to cancel; restore dialog supports partial-failure retry.

See the [release candidate record](docs/RELEASE-CANDIDATE.md) for automated gates and release evidence. Real-host, screen-reader, mobile, and external capabilities remain tracked under B-0002 and B-0004–B-0008.

## v1.3.6 update (2026-10-16)

This hotfix addresses repeated reading-context refresh related to [#16](https://github.com/ai68298100/siyuan-glean/issues/16), with the same lifecycle paths reviewed in native editors, ReaderTab, and Workbench preview.

- Repeated load/switch events for the same native editor now reuse its reading context, avoiding remounts and repeated loading skeletons.
- Background refresh keeps the resolved article content or no-bar state, reducing guide-background and reading-bar flicker.
- Embedded editors in ReaderTab and Workbench preview no longer receive an extra native reading context.
- Highlights, ReaderTab, and Settings keep existing content during background refresh, reducing skeleton-card, loading-bar, and usage-counter jumps.

See the [release candidate record](docs/RELEASE-CANDIDATE.md) for this run's automated gates and release evidence. Real-host, screen-reader, mobile, and external capabilities remain subject to B-0002 and B-0004–B-0008 acceptance.

## v1.3.5 update (2026-10-16)

This patch makes the “document facts saved, derived index sync pending” outcome explicit across write paths and tightens the acceptance boundaries for AI, AV, imports, snapshots, flashcards, and check-in integration. Real-host, model, and external-service acceptance remains tracked under B-0002 and B-0004–B-0008.

**Fixed:**

- Capture, status, rating/priority, author edits, reading AI, Today's Gleaning, archive/restore, snapshots, and Workbench preview now show an index-pending result when document attributes were saved but the derived index could not be persisted.
- Added service and UI regressions to keep user attributes intact and avoid reporting ordinary success or snapshot failure for an index-only failure.

**Documentation:**

- Expanded the real acceptance matrices for article Q&A, author suggestions, one-way AV projection, flashcard recovery, Pocket HTML/CSV, and automatic snapshots.

## v1.3.4 update (2026-10-14)

This patch consolidates the shared design-token system without changing user-facing behavior or visual intent, while making asynchronous actions, index writes, and migration recovery more reliable. Real-host visual, screen-reader, and external integrations remain subject to B-0002/B-0005 acceptance.

**Added:**

- Three-layer design tokens (primitive, semantic, and component) plus the `tokens:audit` script; see [`docs/UI-STANDARD.md`](docs/UI-STANDARD.md).
- Migration checkpoint task identity and incremental recovery guards, so failed rows can be re-confirmed and retried against current document facts.

**Improved:**

- Shared colors, 4px spacing, typography, radii, shadows, z-index, and motion tokens; buttons, labels, and cards now reuse component variants.
- Kernel requests and bulk actions now share busy locks, timeouts, race protection, classified errors, and retryable feedback to prevent duplicate writes and stale responses.
- Empty, error, validation, and recovery states are aligned across migration, library refresh, Today's Gleaning, settings, and AI tag cleanup.

**Fixed:**

- Index read/save failures no longer report silent success; fact-source readback failures show refresh/rebuild guidance, while full reconciliation and rebuild can clear the damaged-index guard.
- Corrected field validation and focus placement, disabled invalid entry points, compressed recovery checkpoints, and duplicate AV bindings caused by delayed index visibility.

Measured consolidation: spacing token coverage improved from 36.7% to 96.7%; typography coverage from 31.6% to 99.8%; radii, shadows, z-index, and motion reached 100%. Color literals fell from 32 occurrences/27 values to 24/20, and token declarations from 231 to 210. The 24-case real-host visual matrix still awaits B-0002 evidence.

**Added:**

- AV refresh retry protection: when existing rows are temporarily unavailable, the refresh waits before deciding that bindings are missing.
- Retrying failed imports now requires explicit confirmation; AI channel test exceptions show localized feedback; failed items from bulk archiving remain selected and can be retried.

**Improved:**

- Article preview and open actions now use title buttons consistently; related controls are locked during settings saves and bulk actions to prevent accidental changes.
- Today's Gleaning actions use a fixed two-column layout with centered labels and equal-width unavailable-source slots; filter labels are centered and the period-completed note uses a smaller type size.

**Fixed:**

- Flashcards can no longer be created from excerpts without a locatable source block; partial archive failures now provide feedback, and alignment and type-size issues in Today's Gleaning, filters, and statistics are corrected.

## The Lv plugin family

| Plugin | One-line description | GitHub repository |
| --- | --- | --- |
| Lv Quickcut / 小驴雷切 | A unified workspace and context-switching platform. | [siyuan-speed-switch](https://github.com/ai68298100/siyuan-speed-switch) |
| Lv Checkin / 小驴打卡 | A local-first workspace for habits, check-ins, and reviews. | [siyuan-checkin](https://github.com/ai68298100/siyuan-checkin) |
| Lv Contacts / 小驴人脉 | Manage contacts, relationships, and related information in SiYuan. | [siyuan-contacts](https://github.com/ai68298100/siyuan-contacts) |
| Lv Glean / 小驴拾遗 | Organize clippings with reading management and later review. | [siyuan-glean](https://github.com/ai68298100/siyuan-glean) |
| Lv Exam / 小驴考试 (Beta) | A local question bank, practice, mock exams, review of mistakes, and AI assistance. | [siyuan-exam](https://github.com/ai68298100/siyuan-exam) |
| Lv Home / 小驴管家 (Beta) | Household and life records, due-date reminders, and task follow-up. | [siyuan-home](https://github.com/ai68298100/siyuan-home) |
| Lv Cards / 小驴闪卡 (Beta) | A local-first lifecycle flashcard learning platform in SiYuan. | [siyuan-lv-cards](https://github.com/ai68298100/siyuan-lv-cards) |
| Lv Common / 小驴常用 (Beta) | Quickly insert common phrases, templates, and code from SiYuan blocks. | [xiaolv-common](https://github.com/ai68298100/xiaolv-common) |

QQ group: **871707735** for bug reports, feature requests, and discussion.

<details>
<summary>Released version history (click to expand)</summary>

### v1.3.6 (2026-10-16)

Fixed: native reading contexts now handle repeated load/switch events idempotently and preserve resolved content or the no-bar state during background refresh. Embedded editors in ReaderTab and Workbench preview no longer mount an extra native reading context. Related issue: [#16](https://github.com/ai68298100/siyuan-glean/issues/16).

### v1.3.5 (2026-10-16)

This patch makes index-sync failures explicit across the main write paths and tightens the AI, AV, import, snapshot, flashcard, and check-in acceptance boundaries. Real-host, model, and external-service acceptance remains tracked separately.

Fixed: show an index-pending result when document attributes were saved but the derived index failed, without overwriting user attributes or misreporting snapshot failures; added service and UI regressions.

Documentation: expanded the matrices for article Q&A, author suggestions, one-way AV projection, flashcard recovery, Pocket HTML/CSV, and automatic snapshots.

### v1.3.4 (2026-10-14)

This release consolidated design tokens and tightened asynchronous actions, index writes, and migration recovery. Real-host visual, screen-reader, and external acceptance remained subject to B-0002/B-0005.

### v1.3.3 (2026-10-10)

This release prevented duplicate library bindings during SiYuan's asynchronous database refresh window and improved reading-companion performance and action feedback. Real-host visual and screen-reader acceptance remained pending under B-0002.

Added: AV refresh retry protection, explicit confirmation for failed import retries, localized AI channel test errors, and retryable failed items from bulk archive.

Improved: consistent article preview/open actions, busy states for settings and bulk actions, and clearer Today's Gleaning, filter, and statistics hierarchy.

Fixed: excerpt flashcards without a locatable source block, partial archive feedback, and related bilingual copy.

### v1.3.2 (2026-10-10)

This release tightened action completeness and visual consistency, added missing failure feedback, and aligned Today's Gleaning, filters, and statistics.

Improved: article preview, settings saves, bulk actions and Today's Gleaning entry points, busy states, alignment and type hierarchy; import, AI-channel testing and bulk archive failures now explain and preserve retryable work.

Fixed: excerpt flashcard preconditions, Today's Gleaning/filter/statistics display issues and related bilingual copy.

### v1.3.1 (2026-10-09)

Improved: large-library refresh and Kanban performance

- Library database binding refresh now uses efficient membership checks instead of scanning the existing binding list for every article.
- Kanban columns are bucketed in one pass after filtering and sorting, while preserving the existing order and results.
- This performance patch does not change article attributes, index format, endpoints, or settings fields.

### v1.3.0 (2026-10-09)

Added: settings category navigation

- Settings now use a "category navigation + content pane" layout: the 11 flat groups are consolidated into 8 categories (Workspace, Daily gleaning, Reading, AI enrichment, AI channel, Integrations, Data & recovery, Maintenance), each with a one-line description; the dialog widened to 720×640.
- Library notebook selection gained search, a selection counter and one-tap clear — no more scrolling through long chip lists.
- Narrow windows / mobile automatically fall back to horizontal category tabs with 44px touch targets.

Added: AI tag cleanup entry

- Settings can scan similar AI tags on demand; each group requires choosing the name to keep before merging. Only the AI tag field is changed.

Improved: immediate review after merging

- Each group shows its affected article count, then rescans and refreshes the workbench after a successful merge.

Fixed: interaction and logic defects found in a full walkthrough

- "Continue reading" in the reader tab no longer reads the previous article after switching; session reading minutes survive transient context errors; the appearance toggle now opens and closes.
- An empty filtered library now shows "no articles match" with a clear-filters action instead of a blank list; candidate row actions gain busy guards against double submits.
- The migrator guards against concurrent double-click runs and confirms discarding progress; backup files can be re-selected and preview cancellation is no longer shown as an error; settings saving gained multi-window conflict protection.
- Settings show errors and retry for notebooks, check-in items and AI logs; about 25 bilingual copy fixes, including the mislabeled source-URL toast and the AI usage counter label.

Fixed: service and logic defects found in a second walkthrough

- With a pinned pick for today, daily gleaning no longer collapses to the pinned article only, and "read next" can offer other articles again; swipe action labels (later/archive) now match the actual direction.
- With split editors or multiple tabs, current-document actions (mark done, capture, AI summary) target the document you are viewing; the gear entry under SiYuan's plugin settings works again.
- Derived-index writes are now serialized so property writes can no longer overwrite a running full reconciliation; large exports and snapshot uploads use a 180s long timeout; imports gained a 32 MiB size guard.
- Text-to-speech no longer splits decimals; Omnivore imports recognize the `state` archived marker and millisecond timestamps; stats tag counts no longer inflate on duplicate tags within one article.

Improved: third-walkthrough experience details

- Running backup restores, flashcard recovery or AI tag cleanup no longer aborts when you switch settings categories; settings conflict recovery is more robust; category navigation supports arrow keys and Home/End; the notebook list distinguishes "no notebooks yet" from "no matches"; touch targets apply in narrow panels on wide viewports; keyboard focus indicators are more complete.

Hardened: fifth-walkthrough data and experience fixes

- Saved views created on one canvas are no longer silently overwritten by actions on the other; auto-save pauses when workbench preferences fail to load, so an empty snapshot cannot wipe user data.
- Duplicate saved-view names now show a notice; busy exclusion for row actions is complete; archive/restore dialogs no longer stack; the corrupted-import-progress reset entry actually works and no longer deletes healthy progress.

Hardened: fourth-walkthrough import and failure defenses

- Import parsing is hardened against malformed export files: oversized fields are capped, malformed timestamps rejected, a corrupted import-progress file can now be reset from the UI (previously required deleting the data file manually), and the progress detail list no longer stutters on tens of thousands of rows.
- The inbox shows a retry entry when its query fails instead of hiding silently, without overlapping toasts; the highlights view distinguishes "no matches" from "no highlights" and no longer shows a stale list after load failures; local documents read "Local note" in the source column.

Fixed: missing user entry for the AI tag service

- The existing suggestion/merge service is now available from Settings. Bulk author backfill remains a separate task with per-article confirmation boundaries.

### v1.2.1 (2026-10-08)

Added: v1.2.1 mainline release

- The current `main` line, popup layout fixes, README update summaries, and merged reliability improvements are published together as `v1.2.1`.

Improved: wide-canvas and standalone popup layout

- Wide-canvas Today's Gleaning cards stay bottom-aligned; standalone Workbench and settings popups now stretch across the content area instead of wrapping Chinese text or squeezing buttons.

Fixed: accidental narrow-layout activation

- Fixed host dialog content shrinking and incorrectly activating narrow-container rules; flashcard recovery, source ownership checks, and data sovereignty boundaries are unchanged.

</details>

## Install and get started

Compatible with SiYuan `v3.8.5+`. Download `package.zip` from the [Latest Release](https://github.com/ai68298100/siyuan-glean/releases/latest), then install and enable the plugin in SiYuan.

1. In plugin settings, select one or more clipping notebooks for your library.
2. Open the library and choose **Organize clippings**. Start with the report preview, which makes no writes.
3. Review the source evidence for each candidate. Confirm it, add a source URL, keep it as a local document, or exclude a false positive.
4. Triage items into Inbox, Read later, Reading, or Archived. Explicitly choose **Mark as done** when you finish an article.

Ordinary notes are not bulk-captured just because of their location, and opening an article does not mark it as done.

## What you can do

- **Build a trusted library**: find candidates from source evidence, preview before confirmation, migrate existing clippings, filter, sort, and triage in batches.
- **Read by content type**: distinguish full-text clippings, link-only items, and local documents. Dock, Workbench, and Kanban share the same article state. Start reading and Mark as done are separate actions.
- **Resurface and review**: Today's Gleaning explains why an item returned; weekly, monthly, and yearly reviews can produce reports and CSV files.
- **Add capabilities as needed**: the reader tab (experimental and off by default), highlights, formatting drafts, AI, imports, snapshots, the SiYuan inbox, and plugin bridges have separate prerequisites. See the [capability matrix](docs/CAPABILITY-MATRIX.md).

## Data and privacy

- SiYuan document attributes are the source of truth for article state and metadata; the plugin index can be rebuilt. Uninstalling the plugin does not actively remove article attributes.
- Automatic processing protects existing source URLs, status, priority, rating, and author values. Explicit edits update only their selected fields.
- The plugin does not provide RSS crawling, cloud-account sync, or automatic reading, and it ships no model API key.
- AI features can be disabled individually. They are manual-only by default and require a configured model or channel. When used, article text is sent to the service you configured. Review the privacy terms of a custom endpoint. AI failures or quota limits do not block the core library.

## Compatibility and acceptance

This release is [v1.3.30](https://github.com/ai68298100/siyuan-glean/releases/tag/v1.3.30). See the [release candidate record](docs/RELEASE-CANDIDATE.md) for automated gates and release evidence; this does not mean every real environment has been accepted.

Desktop host, Android/mobile, browser frontend, real models, the official clipper, external files, and subscription services still require environment-specific checks. Prerequisites, fallbacks, and open blockers are listed in the [capability matrix](docs/CAPABILITY-MATRIX.md) and [known blockers](docs/BLOCKERS.md). Unit tests and isolated E2E are not device acceptance.

## Documentation

- [Capability matrix](docs/CAPABILITY-MATRIX.md): implementation, verification, prerequisites, and real-environment boundaries.
- [Data contract](docs/DATA-CONTRACT.md): article attributes, indexes, and recovery rules.
- [Real-host acceptance guide](docs/ACCEPTANCE.md) · [Reader acceptance](docs/READER-ACCEPTANCE.md).
- [AI acceptance](docs/AI-ACCEPTANCE.md) · [Integration acceptance](docs/INTEGRATION-ACCEPTANCE.md) · [Known blockers](docs/BLOCKERS.md).
- [Changelog](docs/CHANGELOG.md): release notes per version.

> Shortcut: `⌥⌘G` opens the workbench (customizable in SiYuan's Settings → Hotkeys).

## Feedback and community

Use the [issue templates](https://github.com/ai68298100/siyuan-glean/issues/new/choose) and include your SiYuan version, plugin version, frontend type, and reproduction steps. Remove document titles, body text, URLs, and secrets from screenshots or logs before sharing. The QQ group **871707735** is also available for bug reports, feature requests, and discussion.

## Development

Requires Node.js `>=24` and pnpm `12.5.1`. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before contributing. Common commands: `pnpm install`, `pnpm dev`, `pnpm check`, `pnpm test`, and `pnpm build`.

## License

[MIT](LICENSE)
