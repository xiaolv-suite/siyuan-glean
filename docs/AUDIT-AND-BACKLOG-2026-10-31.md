# 小驴拾遗（siyuan-glean）全量盘点、实测审查与统一待办池（2026-10-31 / v1.4.1）

> **单一事实来源说明**：本文档是 2026-10-31 对全仓库存量材料、UI 原型、核心功能链路、代码缺陷与界面一致性的完整实测审查记录与统一待办池。所有结论均以当前源码与隔离思源内核（v3.8.9）实测为准。

---

## 一、 存量材料全量盘点与四态分级

扫描范围覆盖仓库内除 `src/`、`tests/`、`dist/`、`node_modules/` 与 `.git/` 以外的全部文档、任务单、设计原型与计划文件，逐份判定为 **有效（Valid）**、**过期（Outdated）**、**重复（Duplicate）**、**已落地未标记（Implemented-Unmarked）** 四态之一：

### 1.1 原型文件盘点与实现对照（`design/`）

| 文件路径 | 四态判定 | 处置与对照说明 |
| :--- | :--- | :--- |
| `design/prototype-v2.html` | **有效** | 现行 canonical 主原型（受 `tests/navigation-prototype.test.ts`、`tests/library-selection-prototype.test.ts`、`tests/visual-regression.test.ts` 守门）。 |
| `design/prototype-v2-additions.html` | **重复** | 历史增量补充稿，其交互动作已全部并入 `prototype-v2.html`（受 `tests/visual-regression.test.ts:182` 引用保留）。 |
| `design/prototype.html` | **过期** | M2/M4 阶段琥珀橙（`#FFB347 -> #F97316`）17 帧旧原型。已归档副本至 `design/archive/prototype-v1.html`，原文件顶部注明迁移去向。 |
| `design/prototype-settings.html` | **过期** | T-3314 阶段 760×640 琥珀色设置弹窗旧原型。已归档副本至 `design/archive/prototype-settings-v1.html`，原文件顶部注明迁移去向。 |

**原型与当前实现对照结论**：
1. **未实现**：0 项（`prototype-v2.html` 中的今日拾遗、情境选文、读库三视图、分面筛选、跨筛选批量选择、工作台预览、阅读器、摘录墙、统计回顾、设置模态框均已在 `src/ui/` 完整落地）。
2. **原型已过期部分**：v1.3.x–v1.4.0 期间新增的「5 阶语义保真折叠阅读器（`FoldedReaderView`）」、「漫游阅读盲盒（`RoamingDrawerDialog`）」、「金句卡片生成器（`QuoteCardDialog`）」、「长文渐进切片（`DocSlicingDialog`）」、「微信读书同步向导（`WeReadGuideDialog`）」及「快照健康度盾牌徽标（`.glean-snap-badge`）」直接在 Svelte 组件层演进，超越了静态 `prototype-v2.html` 的覆盖范围。
3. **实现走样（本轮已全部修正）**：
   - `DockPanel.svelte` 在桌面行表（`.glean-drow`）和看板卡片（`.glean-kcard`）展示了 `.glean-snap-badge` 快照健康度徽标，但在紧凑/移动端卡片（`.glean-card`）中漏挂该徽标，导致同面板三视图不一致；
   - `FoldedReaderView.svelte` 顶栏 1–5 阶胶囊按钮直接渲染硬编码中文 `cfg.badge`（`全文/逐字/论点/要旨/概念`），段落 `aria-label` 硬编码 `段落 ${idx + 1}`，在英文界面下走样；
   - `RoamingDrawerDialog.svelte` 存在裸 Emoji（`📝`、`💾 已快照`）及未国际化中文提示；
   - `folded-reader.scss` 与 `.glean-snap-badge` 存在裸色值（`#10B981`、`#059669`、`#D97706`、`#F59E0B`）与未在 `:root` 声明的运行时变量（`--glean-radius-20`、`--glean-badge-bg`）。

### 1.2 任务、计划与调研文档盘点（`.tasks/`、`.zcode/`、`docs/`、`TODO.md`）

| 文件或目录 | 四态判定 | 处置与迁移说明 |
| :--- | :--- | :--- |
| `TODO.md` & `docs/TASK-LEDGER.md` | **有效** | 当前执行板与派生任务账本（受 `pnpm task:ledger --check` 守门），本轮同步登记 `T-3545`。 |
| `docs/DATA-CONTRACT.md`、`docs/DECISIONS.md`、`docs/CAPABILITY-MATRIX.md`、`docs/TERMINOLOGY.md`、`docs/UI-STANDARD.md`、`docs/UI-COMPONENTS.md`、`docs/RECOVERY-MATRIX.md`、`docs/PERFORMANCE-BASELINE.md`、`docs/BLOCKERS.md` | **有效** | 核心契约、架构决策、能力边界与验收基线文档（受静态契约单测守门）。 |
| `docs/ACCEPTANCE.md`、`docs/AI-ACCEPTANCE.md`、`docs/INTEGRATION-ACCEPTANCE.md`、`docs/READER-ACCEPTANCE.md`、`docs/SMOKE-E2E.md`、`docs/RELEASE.md`、`docs/RELEASE-CANDIDATE.md`、`docs/RELEASE-MEDIA.md` | **有效** | 现行验收规程与发布门禁文档（已同步更新至 `v1.4.1`）。 |
| `.tasks/TASK-20261030-textfold-reading-core.md`、`.tasks/TASK-20261031-github-benchmark-fusion.md` | **有效（已完成）** | 近期已完成特性的专项任务单，状态已标记为 `completed`。 |
| `.zcode/plans/plan-session_c0f1460b4557cf01777cf4ae8d5cf304.md` | **已落地未标记** | 阶段一至阶段四优化项已在 v1.3.100–v1.4.0 落地，已在文件头部补充状态与迁移标注。 |
| `docs/RESEARCH-benchmark-2026-10.md`、`docs/RESEARCH-feature-gap-2026-10.md`、`docs/RESEARCH-functional-ui-flow-audit-2026-09.md`、`docs/RESEARCH-ui-polish-audit-2026-09.md`、`docs/RESEARCH-expansion-2026-09.md` | **已落地未标记** | 调研提出的具体改进项（除远期库级 AI 问答 T-3334 外）均已实现，已在原文件顶部注明状态并归并剩余有效项至本文第 5 节待办池。 |
| `docs/QUALITY-AUDIT-2026-10-03.md`、`docs/BACKLOG-AUDIT-2026-10-04.md`、`docs/STATUS-REVIEW-2026-10-06.md`、`docs/AGENT-DEVELOPMENT-BACKLOG.md` | **过期** | v1.1.0 阶段历史审计快照，已在原文件头部标注过期并指向本文档。 |
| `docs/RESEARCH-ai-providers.md`、`docs/RESEARCH-archive-assets.md`、`docs/RESEARCH-browser-e2e.md`、`docs/RESEARCH-clipper-template.md`、`docs/RESEARCH-delete-recycle.md`、`docs/RESEARCH-folo.md`、`docs/RESEARCH-github-reference-products-2026-09.md`、`docs/RESEARCH-reading.md`、`docs/RESEARCH-siyuan-comment-integration-2026-09.md`、`docs/RESEARCH-siyuan-ocr-3.8.7.md` | **有效（研究基线）** | 专项技术实证（如内核 Stage Electron 依赖、归档资产孤儿边界、3.8.7 OCR 前置条件），保留作为架构决策依据。 |

---

## 二、 缺陷排查与实测复现证据

按项目实际选定 **数据类**、**状态类**、**集成类**、**交互类** 四个适用类别（崩溃/越界类此前已由 `tests/extreme-inputs.test.ts` 覆盖且本轮复测无新增崩溃，故跳过），本轮共定位并修复 **6 项实测可复现缺陷**：

### 2.1 [B-01 · 数据类 · P0] `matchesAutoTriageRule` 在未知时长/字数时误判命中，污染外部导入书签标签与状态
- **位置**：`src/domain/auto-triage.ts:127-145`、`src/services/import-service.ts:54`
- **复现步骤**：
  1. 调用 `previewImport("title,url,time_added,status,tags\n测试文章,https://example.com/a,1577934245,unread,技术", "pocket-csv")` 或 `evaluateAutoTriage({ url: "https://example.com/a", title: "测试文章" })`；
  2. 检查返回条目的 `tags` 与 `status`。
- **修复前表现**：由于外部导入书签不含 `words` 与 `estimatedMinutes`，`minutes` 为 `undefined`；原代码 `if (minMinutes !== undefined && minutes !== undefined && minutes < minMinutes) return false;` 在 `minutes === undefined` 时条件为假未拦截，导致任何无时长条目同时命中 `rule-deep-read`（`minMinutes: 15`）与 `rule-quick-read`（`maxMinutes: 5`），每篇导入文章均被同时写入互斥的 `"深度长文"` 与 `"速读"` 两个脏标签。
- **修复与实测验证**：当规则声明了 `minMinutes`/`maxMinutes` 时强制要求 `minutes !== undefined` 且在区间内；声明了 `minWords`/`maxWords` 时强制要求 `item.words !== undefined` 且在区间内。运行 `node --test tests/auto-triage.test.ts tests/import-service.test.mjs` 全部通过。

### 2.2 [B-02 · 状态类 · P0] `RoamingDrawerDialog` 标记「稍后读 / 归档」后因 `loading` 重入锁死无法翻到下一篇
- **位置**：`src/ui/RoamingDrawerDialog.svelte:154-221`
- **复现步骤**：
  1. 按 `B` 键打开漫游阅读盲盒弹窗；
  2. 点击底部「稍后读 (A)」或「归档 (E)」按钮（或按键盘 `A` / `E`）。
- **修复前表现**：`markCurrentLater()` 与 `markCurrentArchive()` 在写入前设置 `loading = true`，写盘成功后调用 `await nextPick()`；但 `nextPick()` 首行 `if (loading) return;` 检测到 `loading === true` 直接短路返回，导致盲盒界面始终停留在刚被归档/移入稍后读的文章上。
- **修复与实测验证**：为 `nextPick(force = false)` 增加内部连调豁免参数，`markCurrentLater()` 与 `markCurrentArchive()` 在写盘成功后调用 `await nextPick(true)`。运行 `node --test tests/roaming-dialog.test.ts` 验证通过。

### 2.3 [B-03 · 集成类 · P0] 思源内核 v3.8.9 文档元数据异步就绪与父级目录校验导致 `createDocWithMd` 报错 `document metadata is not ready`
- **位置**：`src/api/client.ts:486-540`、`scripts/spike/kernel-harness.mjs`、`scripts/spike/glean-spike.mjs`
- **复现步骤**：
  1. 在本机思源内核 v3.8.9 下启动隔离工作区并新建笔记本；
  2. 调用 `/api/filetree/createDocWithMd` 创建多级路径文档（如 `/S1/待发现普通文`、`/导入/旧文`、`/收集箱/速记`）。
- **修复前表现**：思源 v3.8.9 新增了 `document_metadata_state` 与 `document_metadata_pending` 事务边界校验；新笔记本尚未触发打开恢复或直接传入未创建父目录的多级 `hPath` 时，内核在事务提交前拒止并返回 `code=-1, msg="document metadata is not ready"`，导致 `s1-flow.mjs` 与新建目录导入直接失败。
- **修复与实测验证**：在 `createDocWithMd` 中捕获前置拒止 `"document metadata is not ready"` 时，自动执行一次笔记本重开激活并以 `ensuredParentPaths` 幂等补建缺失的父级目录文档后再重试目标创建（对其他任何错误保持零重试幂等红线）。实测 `node scripts/e2e/s1-flow.mjs`（58/58 通过）与 `node scripts/spike/glean-spike.mjs`（8/8 通过）。

### 2.4 [B-04 · 交互类 · P1] `RoamingDrawerDialog`、`WorkbenchPreview` 与 `FoldedReaderView` 全局键盘监听穿透及按钮焦点冲突
- **位置**：`src/ui/RoamingDrawerDialog.svelte:384-427`、`src/ui/WorkbenchPreview.svelte:377-382`、`src/ui/FoldedReaderView.svelte:67-90`
- **复现步骤**：
  1. 在 `RoamingDrawerDialog` 中用 `Tab` 聚焦任意操作按钮后按 `Enter` 或 `Space`，被全局窗口监听拦截执行 `startRead()` 或 `nextPick()`；
  2. 在 `WorkbenchPreview` 打开时唤起任意思源弹窗（`.b3-dialog`），按键 `B/Y/C/S/F/R/O` 穿透触发底层预览区操作；
  3. 在 `FoldedReaderView` 挂载时打开金句卡片弹窗按 `1`–`4` 切换卡片主题，同时触发底层折叠层级切换。
- **修复与实测验证**：`RoamingDrawerDialog` 在 `Enter`/`Space` 分支放行 `button, a[href], summary, [role='button']` 原生焦点激活；`WorkbenchPreview` 与 `FoldedReaderView` 补齐 `event.repeat`、`event.shiftKey`、`.b3-dialog, .b3-menu, [role="dialog"], [aria-modal="true"], .glean-dialog` 模态检测及宿主容器可见性守卫。

### 2.5 [B-05 · 状态类 · P1] `ReaderTab` 折叠阅读器异步切文竞态、外部变更失步与块定位回退缺失
- **位置**：`src/ui/ReaderTab.svelte:165-184, 1280-1290, 2667-2673`、`src/ui/FoldedReaderView.svelte:155-205`
- **复现步骤**：
  1. 在阅读器开启 `Alt+Z` 折叠阅读时快速切换到另一篇文章，前一篇慢速返回的 `loadDocumentFoldNodes` 覆盖当前文章节点；
  2. 当 `loadDocumentFoldNodes` 走 Markdown 降级分支生成合成 ID（`${docId}-para1`）或目标块不在当前 DOM 视口时，点击卡片定位按钮无任何反应。
- **修复与实测验证**：`refreshFoldNodes(targetDocId)` 绑定请求时的 `targetDocId` 与 `sessionGeneration`，并在 `onData` 事件且处于 `fold` 页签时自动刷新；`FoldedReaderView` 区分真实块 ID（`/^\d{14}-[a-z0-9]{7}$/`）与降级合成段落（合成段落点击直接展开/折叠），`ReaderTab` 在 `scrollAndPulseReadPoint` 返回 `false` 时回退调用 `openTab` 定位真实块。

### 2.6 [B-06 · 交互类 · P1] `DocSlicingDialog` 定位预览被模态窗遮挡、生成中缺关闭守卫且成功后可重复点击
- **位置**：`src/ui/DocSlicingDialog.svelte:10-78`
- **复现步骤**：
  1. 打开「长文渐进切片」弹窗，点击切片卡片的「定位小节」，底层编辑器滚动但模态弹窗未关闭，遮挡正文；
  2. 点击「生成切片子文档」期间按 `Escape` 会强制销毁弹窗，生成成功后弹窗不关闭可被重复点击创建重复子文档。
- **修复与实测验证**：接入 `svelteDialog` 的 `onClose` 与 `registerCloseGuard(() => !creating)`，点击「定位小节」或生成成功后自动关闭弹窗，生成期间拦截 `Escape`。

---

## 三、 核心功能全链路验证与半成品清零

### 3.1 核心链路实测结果（输入 ➔ 处理 ➔ 持久化 ➔ 重载仍在 ➔ 异常可恢复）

通过 `node scripts/e2e/s1-flow.mjs`（58 项服务级 E2E 断言）与 `node scripts/spike/glean-spike.mjs`（8 大内核能力闭环）在思源 v3.8.9 隔离内核上逐项实测：

| 功能模块 | 实测结论 | 实测验证证据 |
| :--- | :--- | :--- |
| **收录、候选识别与存量迁移** | **已实现且可用** | 真实扫描锚点笔记本，仅含来源或 `#剪藏` 证据进入候选；普通笔记与内部宿主（`custom-clip-internal="true"`）严格排除；迁移器支持 dry-run、分批暂停恢复与手填保护。 |
| **五态流转、优先级/评分与数据主权** | **已实现且可用** | `inbox/later/reading/done/archived` 状态流转、优先级（P1–P5）、星级（1–5★）、收藏、阅读断点均写回根块 `custom-clip-*`；清空 `glean-index.json` 后可从文档属性 100% 重建。 |
| **外部导入与思源收集箱迁入** | **已实现且可用** | 支持 Pocket HTML/CSV、Omnivore JSON、wallabag JSON 四格式预览、URL 规范化查重、自动分拣规则评估与 `import-progress.json` / `inbox-recovery.json` 跨重载断点恢复。 |
| **今日拾遗、情境选文与漫游盲盒** | **已实现且可用** | 确定性每日重浮、当天置顶、换一篇、改天撤销、5/15/30 分钟情境选文、多维加权漫游盲盒及全键盘流转均验证通过。 |
| **伴读阅读器、5 阶语义折叠与渐进切片** | **已实现且可用** | 原生 Protyle 挂载、大纲 h1–h6 定位、视口断点续读、5 阶 Verbatim 保真折叠（`Alt+Z` / `1`–`5`）、划词引述/批注、金句卡片（2x Canvas）、长文渐进切片与原生思维导图生成均验证可用。 |
| **全局摘录墙、riff 闪卡与统计回顾** | **已实现且可用** | 跨 500 条 SQL 游标分页聚合、按文章聚类、四色高亮筛选、riff 闪卡创建与 `flashcard-recovery.json` 恢复、周/月/年回顾报告、365 天热力图下钻、CSV/Markdown ZIP 分卷导出均验证通过。 |
| **AI 富化、伴读问答与既有词表防膨胀** | **已实现且可用** | **本轮清零半成品 F-01**：此前 `alignTagsWithVocabulary` 仅在 `domain/enrich.ts` 实现而未在 `services/enrich-service.ts` 传入词表；本轮已在 `enrich-service.ts` 接入 `loadExistingTagVocabulary` 从 `glean-index.json` 按频次提取既有标签词表并传入 `parseEnrichResponse`，单测与集成测试验证通过。 |

### 3.2 技术上可行但未做 / 受平台限制无法实现项清单

| 项目 | 结论分类 | 原因、限制来源与替代方案 |
| :--- | :--- | :--- |
| **库级跨文档 AI 问答（T-3334）** | **技术上可行但未做** | 依赖思源嵌入基建（`semanticSearchBlock`）在真实多文档环境下的召回质量验证（B-0004），当前优先保障单篇有依据问答（`articleQuestion`），归入远期研究池。 |
| **思源多维表格（AV）单元格编辑反向同步回文档属性** | **受平台限制无法实现** | **限制来源**：思源内核未提供 AV 单元格变更的插件级持久化订阅契约，且多视图编辑易与文档根块属性产生双主冲突。<br>**替代方案**：严格以文档根块 `custom-clip-*` 为唯一事实源（D-0001），AV 仅作为单向只读投影视图，用户在插件内改状态后支持一键刷新同步至 AV。 |
| **纯浏览器（非 Electron）直接驱动桌面 Stage Web UI 自动化** | **受平台限制无法实现** | **限制来源**：思源桌面版 `stage/build/app` 编译产物顶层硬依赖 `require("electron")`，在无 Electron 容器的纯浏览器中会中止初始化（详见 `docs/RESEARCH-browser-e2e.md`）。<br>**替代方案**：采用「真实隔离思源内核服务级 E2E（`s1-flow.mjs` 58 项断言）+ Vite 真实 Svelte 组件隔离渲染与 Headless Chrome 截图」双轨验证。 |
| **思源内置 OCR 自动扫描图片（T-3327）** | **受平台限制无法实现** | **限制来源**：思源 OCR 配置与端点在早期版本尚处预览演进阶段，且自动后台扫描违反平静原则与隐私边界。<br>**替代方案**：保持关闭，待正式契约稳定后仅作为阅读器内用户显式触发的单图辅助能力评估。 |

---

## 四、 界面审查与截图证据

本轮使用 `node scripts/visual/preview-workbench.mjs --build` 构建真实 Svelte 组件隔离预览，并通过 Headless Chrome 采集多视口/明暗主题实测截图存档于 `output/round-v141-audit/`：

1. **样式令牌引用与未声明变量清零**：
   - **位置**：`src/styles/tokens.scss`、`src/index.scss`、`src/styles/components/folded-reader.scss`
   - **发现与修复**：修复前 `pnpm tokens:audit` 报告 `--glean-radius-20` 与 `--glean-badge-bg` 未在 `:root` 声明，且 `folded-reader.scss` 与 `.glean-snap-badge` 含 7 处裸色值（`#059669`、`#10B981`、`#D97706`、`#F59E0B`）及 `10.5px`/`11.5px` 裸字号。本轮已全部收敛为 `:root` 标准令牌（`--glean-color-data`、`--glean-st-done-text`、`--glean-st-inbox-text`、`--glean-text-caption` 等），`pnpm tokens:audit` 实测“未在 `:root` 声明的运行时变量：无”。
2. **同一控件在不同画布/视图的一致性**：
   - **位置**：`src/ui/DockPanel.svelte:3524, 3734, 3938`
   - **发现与修复**：修复前桌面行表（`.glean-drow`）与看板卡片（`.glean-kcard`）均有 `.glean-snap-badge` 快照健康度徽标，唯独窄 Dock / 移动端紧凑卡片（`.glean-card`）缺失。本轮已为 `.glean-card` 补齐该徽标并统一双语提示文案。
   - **截图证据**：
     - 桌面宽屏读库行表（1280×820，亮色）：`output/round-v141-audit/library-tab-1280.png`
     - 窄 Dock 紧凑卡片视图（380×820，亮色，含快照健康度徽标）：`output/round-v141-audit/library-dock-compact-380.png`
     - 移动端深色模式读库卡片（390×844，暗色）：`output/round-v141-audit/library-mobile-dark-390.png`
     - 今日拾遗工作台（1280×820，亮色）：`output/round-v141-audit/resurface-1280.png`
     - 阅读统计与回顾漏斗（1280×820，亮色）：`output/round-v141-audit/stats-1280.png`

---

## 五、 统一待办池（Single Source of Truth Backlog Pool）

> **优先级计算公式**：$\text{Priority Score} = \frac{\text{影响面 (1–5)} \times \text{触发频率 (1–5)}}{\text{实现成本 (1–5)}}$。同一根因事项已合并。本轮批次（`T-3545`）按“先修缺陷 ➔ 再补未完成功能 ➔ 最后体验优化”顺序已全部闭环。

| 编号 | 类型 | 标题与根因说明 | 影响面 | 验收方式 | 成本 | 依赖项 | 优先级分值与理由 | 状态 |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- | :---: |
| **Pool-01** (`B-01`) | 缺陷 | `matchesAutoTriageRule` 未知时长/字数时不误触发时长规则，根除外部导入书签标签污染 | 5 | `node --test tests/auto-triage.test.ts tests/import-service.test.mjs` | 1 | 无（已关闭） | **25.0**（5×5÷1：影响全部外部导入条目，成本极低） | ✅ 本轮完成 |
| **Pool-02** (`B-02`) | 缺陷 | `RoamingDrawerDialog` 稍后读/归档操作后 `nextPick(true)` 豁免 `loading` 锁，恢复自动翻页 | 4 | `node --test tests/roaming-dialog.test.ts` | 1 | 无（已关闭） | **20.0**（4×5÷1：盲盒核心分拣动作必现卡死，成本极低） | ✅ 本轮完成 |
| **Pool-03** (`B-03`) | 缺陷 | 思源内核 v3.8.9 `createDocWithMd` 兼容 `document metadata is not ready` 与多级父目录自动预建 | 5 | `node scripts/e2e/s1-flow.mjs` & `pnpm spike` | 2 | SiYuan 3.8.9 | **12.5**（5×5÷2：宿主升级后新建目录建档直接报错，属阻断级集成缺陷） | ✅ 本轮完成 |
| **Pool-04** (`B-04`) | 缺陷 | `RoamingDrawerDialog` 按钮原生回车/空格放行，以及 `WorkbenchPreview` / `FoldedReaderView` 模态遮罩键盘隔离 | 4 | `node --test tests/roaming-dialog.test.ts tests/folded-reader.test.ts tests/workbench-preview.test.ts` | 1 | 无（已关闭） | **16.0**（4×4÷1：多弹窗叠加与无障碍键盘流高频触发） | ✅ 本轮完成 |
| **Pool-05** (`B-05`) | 缺陷 | `ReaderTab` 折叠阅读器异步切文代次守卫、数据变更刷新与块定位回退 `openTab` | 3 | `node --test tests/folded-reader.test.ts` | 1 | 无（已关闭） | **9.0**（3×3÷1：快速切文与长文跨视口定位必现） | ✅ 本轮完成 |
| **Pool-06** (`B-06`) | 缺陷 | `DocSlicingDialog` 定位小节自动关窗、生成期间挂载 `registerCloseGuard` 并在成功后自动收起 | 3 | `node --test tests/doc-slicing.test.ts tests/header-actions.test.ts` | 1 | 无（已关闭） | **9.0**（3×3÷1：消除模态窗遮挡与重复点击创建子文档风险） | ✅ 本轮完成 |
| **Pool-07** (`F-01`) | 功能 | `enrich-service.ts` 接入 `loadExistingTagVocabulary`，打通 AI 富化既有标签词表防膨胀全链路 | 4 | `node --test tests/enrich-service.test.mjs` | 1 | `domain/auto-triage.ts` | **16.0**（4×4÷1：补齐已实现域函数到服务层的最后一公里接线） | ✅ 本轮完成 |
| **Pool-08** (`U-01`) | 体验 | 补齐 `.glean-card` 快照健康度徽标、清理 6 组件硬编码中文/裸 Emoji、收口 `:root` 运行时令牌与双语 README | 4 | `pnpm check`、`pnpm test`、`pnpm tokens:audit`、Headless Chrome 截图 | 2 | 无（已关闭） | **8.0**（4×4÷2：跨画布视觉统一、英文环境零中文残留、令牌审计零未声明变量） | ✅ 本轮完成 |
| **Pool-09** (`T-3275`–`T-3286`) | 体验 | 作者真实宿主与真机环境走查（桌面主链、Android 触控、真实扩展剪藏、真实 AI 模型与双插件联调） | 4 | 作者按 `docs/BLOCKERS.md`（B-0001–B-0008）在真实工作区点验 | 4 | 需作者真机与外部凭据 | **2.0**（4×2÷4：受外部环境与真机阻塞，隔离验证已全部通过） | ⏸ 待真机 (B-0001~B-0008) |
| **Pool-10** (`T-3334`) | 功能 | 库级跨文档 AI 问答（基于读库索引与语义嵌入检索回答跨文章问题并附来源跳转） | 3 | 先完成 B-0004 嵌入召回实测与检索证据契约，再做 spike | 4 | B-0004 嵌入基建验收 | **1.5**（3×2÷4：高成本新能力，需前置嵌入验收完成） | ☐ 远期池 |
| **Pool-11** (`T-3327`) | 功能 | 阅读器内用户显式触发的单图 OCR 辅助识别 | 2 | 思源 OCR 正式版 API 契约实证与 spike | 4 | 上游正式版 OCR 契约 | **0.5**（2×1÷4：受上游正式契约限制，暂不启动） | ⏸ 延后 |
