# Lv Glean (小驴拾遗)

[![Quality gates](https://github.com/xiaolv-suite/siyuan-glean/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaolv-suite/siyuan-glean/actions/workflows/ci.yml) [![CodeQL](https://github.com/xiaolv-suite/siyuan-glean/actions/workflows/codeql.yml/badge.svg)](https://github.com/xiaolv-suite/siyuan-glean/actions/workflows/codeql.yml) [![Latest release](https://img.shields.io/github/v/release/xiaolv-suite/siyuan-glean?label=latest%20release)](https://github.com/xiaolv-suite/siyuan-glean/releases/latest) [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> Organize SiYuan clippings into a library for confirmation, read-later queues, reading management, and review; eligible SiYuan inbox items can also be imported when prerequisites are met.

Lv Glean organizes clippings and articles already in SiYuan. It does not crawl the web, and ordinary notes are never captured just because they sit in a selected notebook. You review the source evidence and confirm each candidate before it enters the library.

[中文说明](README.md) · [Latest Release](https://github.com/xiaolv-suite/siyuan-glean/releases/latest) · [Capability matrix](docs/CAPABILITY-MATRIX.md) · [Feedback](https://github.com/xiaolv-suite/siyuan-glean/issues/new/choose)

## 🎯 Positioning & Core Philosophy

1. 🛡️ **100% Data Sovereignty (Local-First)**: Article states, ratings, priorities, and tags live directly in SiYuan document attributes (`custom-clip-*`). Never sent to private cloud servers. User-modified fields are sacred and never overwritten.
2. 🔄 **Structured Reading Lifecycle**: Progressive lifecycle triage—**Inbox** ➔ **Later** ➔ **Reading** ➔ **Done** ➔ **Archived**.
3. 💡 **Deep Digestion & Knowledge Ingestion**: Companion reading, eye-level Margin Notes, 1-click Quote Card generation (Canvas 2x retina export, watermark toggle), 4 academic citation formats (GB/T 7714, BibTeX, APA, MLA 9th), and SiYuan Attribute View (AV Collection) automation.
4. ⚡ **Keyboard-First Workflow**: Universal `/` and `Ctrl+F` search focus across all main views, single-key ratings (`1-5`), cyclic priority adjustments (`P`), block-ref copying (`Y`), citation export (`C` / `Shift+C`), and blind-box roaming (`B`).

## ✨ Core Capabilities

- **📚 Library Workbench**: Table, Kanban, and Card views with adaptive rail width (180-420px, `BL-21`); native DropZone capture & flashcard creation (`BL-25`); multi-token AND search (`BL-28`); rail item context menus (`BL-29`); 2D keyboard navigation with arrow keys and `h/j/k` (`BL-30`); lightweight virtual Kanban columns (`BL-22`); and batch diff estimations (`BL-31`).
- **📖 Companion Reader (3-Zone Toolbar & 5 Partitioned Tabs)**: Balanced 3-zone header layout (metadata & author contact on left, mode toggle in center, search/5-tier fold/Aa typography palette/zen mode/favorites/more actions/✓→ Done & Next on right); 5 dedicated companion tabs (Outline, Notes, Fold, AI, Tools & Metadata); Zen Fullscreen Mode (`F11`, `BL-32`); TTS speech with real-time yellow pulse & smooth scroll tracking (`BL-33`); Mini Floating Pill mode (`BL-34`); 5-Tier Semantic Folded Reader (`Alt+Z`) with 1-click Markdown digest copy (`BL-35`); Quote Card custom red signature seals (`BL-38`); and multi-color Zettelkasten highlights export (`BL-39`).
- **🐴 Lv Ecosystem Federation (Epoch 7 Standard · Protocol v1.6.0)**:
  - **Lv Launchpad (`xiaolv-launchpad` · Phase 5)**: Top bar convergence dock saving 80% space, supporting 3-state visibility controls (pinned / docked / hidden), 4 rapid secondary actions (clip clipboard content, open unread inbox, generate AI summaries in batch, capture web page), and real-time unread count badges.
  - **Lv Omnisearch (`lvOmnisearch` · Phase 7)**: Decentralized cross-plugin search provider integration, allowing instant search of clippings across title, summary, tags, author, and site directly from the launchpad or sibling plugins.
  - **Lv Full Backup (`lvBackup` · Phase 4)**: Cross-ecosystem 1-click full backup facet registration (rules, tag vocabularies, notebook anchors, and clip indexes) for zero-loss migration.
  - **Lv Diagnostics (`lvEcosystem` · Phase 4)**: Real-time health badge rendering in settings navigation & footer (e.g. `🐴 小驴全家桶协同正常 · 8 插件已联结 · 今日活动 12 项`).
  - **Resource & Concurrency Hardening (Phase 2/3)**: Unified heartbeat clock (`lvTicker`), kernel document write queue mutex (`withDocLock`), surface and escape focus stack (`lvSurfaceStack`), shared AI credentials gateway (`lvAi`), and daily activity stream (`lvActivity`).
  - **Lv Cards (`siyuan-lv-cards`)**: 1-click extract push to incremental learning boxes with bidirectional backlink lineage, strictly isolated from FSRS algorithms; Today's Resurface due card banner with 1-click jump to review.
  - **Lv Contacts (`siyuan-contacts`)**: Automatic author contact recognition via protocol v2, toolbar badge navigation, 1-click contact enrollment (`ensurePerson`), and reading fact logging (`appendFact`).
  - **Lv Common (`xiaolv-common`)**: 1-click quote and extract ingestion (`captureQuote`) into the global snippet library from both Quote Cards and Companion Notes.
  - **Lv Checkin (`siyuan-checkin`)**: Automatic reporting of verified reading minutes (`readMinutes`, `unit: "min"`) on article completion.
  - **Quadruple Academic Citations**: GB/T 7714-2015, BibTeX `@article`, APA 7th, and MLA 9th citation standards.
- **🎨 SiYuan Native 24×24 Vector Icon Unification**: 100% aligned with SiYuan Note's native `litheness/icon.js` vector path standards (1.7px stroke width, rounded caps and joins, unified `#iconGlean*` symbol registry).
- **🎲 Daily Resurface & Blind-Box Roaming**: Ebbinghaus-driven resurfacing with high-rating priority boost (`BL-36`); 1-click Daily Note plan block insertion (`BL-37`); Command Palette roaming command (`cmd.roamingPick`, `BL-26`); topbar context menu (`BL-27`); and onboarding active doc capture (`BL-45`).
- **🛠️ Slicing, Safety & Portable Config**: Custom heading level progressive slicing (`BL-40`); promotional link stripping (`BL-41`); Omnivore highlight extraction (`BL-42`); automated 7-day rolling local backups (`BL-43`); and portable JSON settings export/import (`BL-44`).
- **📊 Reading Stats & Review**: 365-day reading heatmap, streak tracking, reading conversion funnel, instant search on completed articles (`/`), and periodic Markdown/CSV review reports.
- **⚡ Keyboard-First Workflow**: Universal `/` and `Ctrl+F` search focus across all main views, single-key ratings (`1-5`), cyclic priority adjustments (`P`), block-ref copying (`Y`), citation export (`C` / `Shift+C`), and blind-box roaming (`B`).

## 📦 Installation

1. **Marketplace Installation (Recommended)**:
   - Open SiYuan's **Settings ➔ Marketplace ➔ Plugins**;
   - Search for `Lv Glean` or `小驴拾遗` or `glean`;
   - Click **Install** and **Enable**.
2. **Manual Installation**:
   - Download `package.zip` from [GitHub Latest Releases](https://github.com/xiaolv-suite/siyuan-glean/releases/latest);
   - Extract the archive into your workspace plugins directory: `[SiYuan Workspace]/data/plugins/siyuan-glean`;
   - In SiYuan **Settings ➔ Plugins**, click **Reload** or restart SiYuan.

## 🚀 Quickstart: 3 Steps to Your First Reading Flow

In just 3 minutes, transform scattered clippings into structured knowledge assets:

1. **Step 1: Set Your Clipping Notebooks**
   - Click the wheat icon in the top bar or press `Alt+P` to open plugin **Settings**;
   - In **Workspace**, check the notebook(s) holding your web clippings or imported articles, then click Save.
2. **Step 2: Scan and Confirm Clippings**
   - Press `Ctrl+Alt+G` (macOS: `⌥⌘G`) to open the **Library Workbench**;
   - Click **Organize clippings** in the top bar to inspect candidates detected from source URLs;
   - Click **Confirm capture** to admit articles into the library lifecycle (stored purely in document attributes without modifying note content).
3. **Step 3: Read, Highlight, and Mark Done**
   - Click **Start reading** on any article to open the Companion Reader;
   - Select text to generate 2x retina **Quote Cards** or press `C` to copy academic citations;
   - When finished, press `D` (or click **Mark as done**) to move it to **Done**, updating your annual heatmap and streak records!

## 🖥️ Core Panels & Interface Guide

| Panel Name | Access Shortcut | Purpose & Capabilities |
| --- | --- | --- |
| **Library Workbench** | `Ctrl+Alt+G` / `⌥⌘G`, or Left Dock icon | Central hub for all library articles. Provides Table, Kanban, and Card views; left rail for multi-faceted filters (status, queues, sites, authors, tags, favorites); bottom batch bar for bulk priority, rating, and status changes; right-side drawer preview. |
| **Today's Resurface** | Top bar "Today's Resurface" or Command Palette | Anti-forgetting resurfacing hub. Recommends articles daily based on age, ratings, priorities, and diversity; full keyboard controls: `Enter` to read, `L` for later, `A` to archive, `P` to pin, `R` to replace; includes streak banner and blind-box roaming launcher. |
| **Companion Reader** | Click "Start reading" in library or native capsule | Dedicated reading environment with 3-zone balanced topbar & 5 partitioned companion tabs (Outline, Notes, Fold, AI, Tools). Left area displays title & author contact badge; center hosts Read/Edit segmented toggle; right area provides search, 5-tier semantic fold, typography palette popover, Zen mode, favorites, more actions, and ✓→ Done & Next. Selection capsule supports Quote Cards (`Alt+Q`), 1-click push to Lv Cards, Lv Common ingestion, and in-article search (`Ctrl+F`). |
| **Highlight Wall** | Top bar "Highlights" or Command Palette | Ingestion and synthesis hub. Aggregates all highlights and margin notes across the library; provides flat timeline and clustered views; 4-color filtering (yellow/red/blue/green); 1-click export to Markdown or SiYuan reading notes. |
| **Stats & Review** | Top bar "Stats" or Command Palette | Growth and achievement tracking. Displays 365-day reading heatmap, streak records, conversion funnels (Capture ➔ Reading ➔ Done ➔ Archived); instant fuzzy search on completed items (`/`); periodic review reports in Markdown and RFC 4180 CSV. |
| **Roaming Blind-Box Drawer** | Press `B`, or launcher in Resurface/Reader | Serendipitous reading tool. Pulls random unread articles filtered by time budget (<5m, 5-15m, >15m) or tags; supports browsing history and keyboard adjustments for priority (`P`), rating (`M`), and citations. |
| **WeRead Guide** | WeRead badge in preview or reader | WeChat ecosystem bridge. Generates clean WeRead web links for WeChat articles to prevent external 404s, offering 1-click reading on WeRead or clean local reading in SiYuan. |
| **Settings Modal** | Press `Alt+P` or SiYuan Settings ➔ Plugins | Global configuration hub with 8 categories: Workspace, Resurface, Reader, AI Features, AI Channel, Integration, Data & Recovery, and Maintenance. |

## ⚙️ Settings Reference (Category / Option / Default / Business Impact)

| Category | Option Key | Default Value | Business Impact & Advice |
| --- | --- | --- | --- |
| **Workspace** | `anchorNotebooks` | `[]` (None) | Defines notebooks containing clippings. Only selected notebooks are scanned, preserving the privacy of other personal notes. |
| **Workspace** | `snapshotOnCapture` | `false` (Off) | Automatically downloads and archives HTML/text web snapshots when articles are captured. |
| **Resurface** | `resurface.dailyCount` | `3` | Number of daily resurfaced articles. Recommended: 3 to 5 articles to keep a lightweight, sustainable pace. |
| **Resurface** | `resurface.includeDoneHighlights` | `false` (Off) | Allows completed articles with highlights to resurface for review and spaced repetition. |
| **Reader** | `reader.openInTab` | `false` (Off) | Opens the Companion Reader in a dedicated SiYuan editor tab rather than an overlay. |
| **Reader** | `reader.defaultMode` | `"read"` (Reader) | Initial mode when opening articles: `"read"` for companion reading with margin notes; `"edit"` for native Protyle editing. |
| **AI Features** | `ai.enrichMode` | `"manual"` (Manual) | AI processing strategy. `"off"` disables AI; `"manual"` only runs when explicitly requested; `"auto"` triggers on capture. |
| **AI Features** | `ai.enrichDailyCap` | `20` | Daily safety limit for AI API calls to prevent unintended token consumption. |
| **AI Features** | `ai.dedupOnEnrich` | `true` (On) | Identifies duplicate or similar articles during enrichment. |
| **AI Features** | `ai.relatedWhileReading` | `false` (Off) | Recommends semantically related notes in the companion sidebar while reading. |
| **AI Features** | `ai.formattingEnabled` | `false` (Off) | Provides formatting suggestions for messy web clippings. |
| **AI Features** | `ai.authorSuggestionEnabled` | `false` (Off) | Scans and standardizes author metadata and WeChat official account names. |
| **AI Features** | `ai.questionCardEnabled` | `false` (Off) | Generates reflective reading questions for deep comprehension. |
| **AI Features** | `ai.articleQuestionEnabled` | `false` (Off) | Enables in-context Q&A for selected text passages. |
| **AI Channel** | `ai.channel` | `"siyuan"` (Built-in) | `"siyuan"` uses SiYuan's native AI provider; `"custom"` allows any OpenAI-compatible API endpoint. |
| **AI Channel** | `ai.customBaseUrl` | `""` | Base URL for custom endpoint (e.g. `https://api.deepseek.com/v1`). |
| **AI Channel** | `ai.customModel` | `""` | Model identifier (e.g. `deepseek-chat`). |
| **AI Channel** | `ai.customSecretName` | `""` | Name of secret key in SiYuan's secure vault (plain keys are never stored by the plugin). |
| **Integration** | `integration.checkinEnabled` | `false` (Off) | Records a reading check-in event to the Lv Checkin plugin whenever an article is marked done. |
| **Integration** | `integration.bridgeWriteEnabled` | `false` (Off) | Allows sibling plugins in the Lv ecosystem to execute write operations via public bridges. |

## ⌨️ Keyboard-First Workflow & Hotkey Cheat-Sheet

| Scope | Shortcut | Action & Business Behavior |
| --- | --- | --- |
| **Global / Workbench** | `Ctrl+Alt+G` / `⌥⌘G` | Open or focus the Library Workbench (customizable in SiYuan settings) |
| **Global / Workbench** | `Alt+P` | Open plugin Settings modal |
| **Library / Highlights / Stats / Resurface** | `/` or `Ctrl+F` / `Cmd+F` | **Universal Search**: Focus and select the search bar across all views; `Escape` clears |
| **Library Workbench** | `J` / `K` or `↓` / `↑` | Move active keyboard focus between articles or cards |
| **Library Workbench** | `Enter` / `O` | Open selected article in the Companion Reader |
| **Library Workbench** | `Space` / `X` | Toggle selection for multi-item batch operations |
| **Workbench / Roaming** | `P` | **Cycle Priority**: Step through P0 ➔ P1 ➔ P2 ➔ P3 ➔ P4 ➔ P5 (batch-applied if selection active) |
| **Workbench / Roaming** | `1` - `5` | **Direct Rating**: Assign 1 to 5 stars (batch-applied if selection active) |
| **Workbench / Roaming** | `M` | **Cycle Rating**: Cycle through 1★ ➔ 2★ ➔ 3★ ➔ 4★ ➔ 5★ ➔ 0★ |
| **Workbench / Roaming** | `Alt+F` | **Toggle Favorite**: Flip favorite star status on active or selected items |
| **Library Workbench** | `D` | Mark selected article as **Done** |
| **Library Workbench** | `A` | Move selected article to **Archived** |
| **Library Workbench** | `L` | Triage selected article to **Later** queue |
| **Library Workbench** | `Y` | Copy SiYuan block reference link with anchor title |
| **Workbench / Roaming** | `C` | Copy Chinese standard academic citation (GB/T 7714-2015) |
| **Workbench / Roaming** | `Shift+C` | Copy standard BibTeX entry (`@article`) |
| **Workbench / Roaming** | `B` | Open the Roaming Blind-Box Drawer for serendipitous discovery |
| **Today's Resurface** | `J` / `K` | Move focus between daily recommendation cards |
| **Today's Resurface** | `Enter` | Start reading the focused recommendation |
| **Today's Resurface** | `L` | Defer reading to later and fetch a replacement |
| **Today's Resurface** | `A` | Archive current recommendation |
| **Today's Resurface** | `P` | Pin current article to the top of today's picks |
| **Today's Resurface** | `R` | Replace with another candidate |
| **Companion Reader** | `Alt+Q` | **Make Quote Card**: Open Quote Card generator with selected text |
| **Companion Reader** | `Space` / `Shift+Space` | Smooth page down / up in reader |
| **Companion Reader** | `Ctrl+F` / `Cmd+F` | Activate in-article search highlight capsule |
| **WeRead Guide** | `C` | Copy purified WeRead article short link |
| **WeRead Guide** | `Enter` | Open article directly in WeRead web bookshelf |
| **WeRead Guide** | `R` / `O` | Read cleanly inside SiYuan without distractions |
| **Modals / Drawers** | `Escape` | Dismiss modal or clear search query |

## ❓ FAQ & Troubleshooting

### Q1: Why are my clippings not showing up in the library?
1. Open **Settings ➔ Workspace** and verify that the notebook holding the clipping is checked;
2. In the workbench top bar, click **Organize clippings** to review candidates and confirm them;
3. Alternatively, open the note in SiYuan, click the top-bar wheat icon, and select **Capture current doc**.

### Q2: Batch priority or rating change does not respond?
- Check items using checkboxes (`Space` or click). The batch bar will slide up from the bottom;
- In the dialog, enter an integer between `0` and `5`. Values outside this range will show a validation notice.

### Q3: AI summaries or translations report configuration errors?
- The plugin defaults to `"manual"` mode and contains no bundled commercial API keys;
- For built-in AI, ensure your provider is configured and tested in SiYuan's **Settings ➔ AI**;
- For custom endpoints, configure your base URL and model in plugin **Settings ➔ AI Channel**, storing the API Key in SiYuan's secure vault.

### Q4: Why doesn't scrolling to the bottom automatically mark an article as done?
- We adhere strictly to **Data Sovereignty**. Scrolling or opening a note does not equate to comprehension;
- To keep reading metrics authentic, completing an article requires an explicit click on **Mark as done** or pressing `D`.

### Q5: Will my reading data be lost during plugin updates or synchronization?
- **No data is lost**. All reading states, ratings, priorities, authors, and notes reside directly in SiYuan document attributes (`custom-clip-*`) and sync automatically across devices;
- The local index is purely a derived cache. If you switch devices or experience sync delay, simply click **Rebuild index** under **Settings ➔ Maintenance Tools** to restore your library in seconds.

## 🛡️ Data Storage, Lifecycle & Local-First Privacy

- **100% Data Sovereignty (D-0001 Protocol)**:
  - All article state facts are stored as standard SiYuan document attributes (IAL): `custom-clip-status`, `custom-clip-priority`, `custom-clip-rating`, `custom-clip-author`, `custom-clip-readpoint`, `custom-clip-aitags`, etc.;
  - User-edited fields are never overwritten: manually adjusted URLs, authors, ratings, and statuses take absolute precedence;
  - Clean note bodies: The plugin makes zero modifications to note markdown content beyond user-created annotations. Uninstalling the plugin leaves all document attributes intact in SiYuan.
- **Local Storage Architecture**:
  - Runtime configurations, UI preferences, and the derived index live in your local workspace under: `data/storage/petal/siyuan-glean`;
  - You can export full read-only backups or standard RFC 4180 CSV / Markdown archives at any time via **Settings ➔ Data & Recovery**.
- **Zero Network Activity by Default**:
  - The core library, reader, quote cards, heatmap stats, roaming drawer, and citations operate **100% offline** with zero telemetry or tracking;
  - AI features are strictly opt-in and triggered solely by explicit user interaction.

## 🔌 Compatibility, Host Environments & Acceptance Boundaries

- **Supported Host Environment**:
  - SiYuan kernel: `v3.8.4` and above (verified on `v3.8.5`+ and current kernels);
  - Platforms: Windows (x64/arm64), macOS (Intel/Apple Silicon), Linux, Android, and iPad tablets;
  - Form factors: Desktop app, Web browser frontend, and adaptive mobile layouts.
- **Real-Environment Acceptance**:
  - Automated tests and architectural gates pass 100%. Device-specific touch behaviors, external AI integrations, and real-environment acceptance boundaries are detailed in the [capability matrix](docs/CAPABILITY-MATRIX.md) and [known blockers](docs/BLOCKERS.md).

## 📝 Recent Updates

**v1.4.7 (2026-11-12)**: SiYuan 3.8.10+ native adaptations (Zen mode dock coordination & doc tree context menus), Escape dismissal on tag alias manager, mobile status-pill/safe-area/16px companion bar polish, passive scroll & lazy avatar loading, and ecosystem regression contracts.

<details>
<summary>View v1.4.7 Highlights & Historical Releases</summary>

- **SiYuan 3.8.10+ Native Adaptations**: Immersive Zen reading mode (`F11`) automatically coordinates folding/restoring native docks; preview card titles and reader entry support native document tree context menus (`showDocTreeNativeMenu`).
- **Interaction & Shortcut Hardening**: Tag alias manager modal supports Escape key dismissal; ecosystem-wide clipboard error-handling contracts enforced.
- **Mobile & Style Polish**: Status group wraps with adaptive capsule shell; header actions avoid stretched scatter; sticky bottom bar gains iOS safe area inset; companion bar select standardized to 16px to prevent focus zoom.
- **Performance & Motion**: Scroll and touch listeners converted to passive; WeChat avatar list images lazy-loaded; desktop hover affordances added for card titles, rows, and toggles.

### Earlier Releases
- **v1.4.6 (2026-11-08)**: Topbar context menu now merges into SiYuan's native item menu; compass & popup layering governed by ecosystem Protocol v1.7.6.
- **v1.4.5 (2026-11-04)**: Complete mobile experience loop - dual compass entries, fullscreen panels, five-state reading action bar and smart keyboard avoidance.
- **v1.4.4 (2026-11-03)**: Decentralized ecosystem notification suite, three-zone companion reading toolbar, federated integration with sibling plugins.

</details>

👉 Full version history: [CHANGELOG.md](CHANGELOG.md).



## The Lv plugin family

| Plugin | One-line description | GitHub repository |
| --- | --- | --- |
| Lv Quickcut / 小驴雷切 | A unified workspace and context-switching platform. | [siyuan-speed-switch](https://github.com/xiaolv-suite/siyuan-speed-switch) |
| Lv Checkin / 小驴打卡 | A local-first workspace for habits, check-ins, and reviews. | [siyuan-checkin](https://github.com/xiaolv-suite/siyuan-checkin) |
| Lv Contacts / 小驴人脉 | Manage contacts, relationships, and related information in SiYuan. | [siyuan-contacts](https://github.com/xiaolv-suite/siyuan-contacts) |
| Lv Glean / 小驴拾遗 | Organize clippings with reading management and later review. | [siyuan-glean](https://github.com/xiaolv-suite/siyuan-glean) |
| Lv Exam / 小驴考试 (Beta) | A local question bank, practice, mock exams, review of mistakes, and AI assistance. | [siyuan-exam](https://github.com/xiaolv-suite/siyuan-exam) |
| Lv Home / 小驴管家 (Beta) | Household and life records, due-date reminders, and task follow-up. | [siyuan-home](https://github.com/xiaolv-suite/siyuan-home) |
| Lv Cards / 小驴闪卡 (Beta) | A local-first lifecycle flashcard learning platform in SiYuan. | [siyuan-lv-cards](https://github.com/xiaolv-suite/siyuan-lv-cards) |
| Lv Common / 小驴常用 (Beta) | Quickly insert common phrases, templates, and code from SiYuan blocks. | [xiaolv-common](https://github.com/xiaolv-suite/xiaolv-common) |

QQ group: **871707735** for bug reports, feature requests, and discussion.

## Community Feedback & Development

Please submit bug reports and feature requests via [GitHub Issues](https://github.com/xiaolv-suite/siyuan-glean/issues/new/choose). Include your SiYuan version, plugin version, frontend type, and reproduction steps. Remove sensitive information (document titles, body text, URLs, API keys) from screenshots or logs before posting. Join the community QQ group: **871707735**.

- Development & Testing Protocol: see [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md)
- Capability Boundaries & Environment Matrix: see [docs/CAPABILITY-MATRIX.md](docs/CAPABILITY-MATRIX.md)
- Real-Host Acceptance & Known Blockers: see [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) and [docs/BLOCKERS.md](docs/BLOCKERS.md)
- Build & Verification: Requires Node.js `>=24` and pnpm `12.5.1`. Common commands: `pnpm check`, `pnpm test`, and `pnpm build`.

## License

[MIT](LICENSE)
