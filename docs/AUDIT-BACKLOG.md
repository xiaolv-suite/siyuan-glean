# AUDIT-BACKLOG — 存量优化待办池

> **管理原则**：本待办池严格区分两类任务：
> 1. **已就地闭环修复（Direct Fixes）**：影响正常使用且风险较低的小缺陷，当轮直接修复并经由测试验证。
> 2. **入池待办（Backlog Items）**：涉及结构性调整、多端布局重构或需要较多跨模块验证的大优化，按批次排期推进。

---

## 一、本轮（第 1 轮 / Batch-01）已闭环修复清单

| 编号 | 影响范围 | 问题简述 | 修复方式与代码位置 | 验证结果 |
| :--- | :--- | :--- | :--- | :---: |
| **`FIX-01`** | 收集箱迁入 | 多选收集箱条目并快速连击时，缺少互斥锁导致发起重复迁移任务与重复新建文档 | 在 `src/index.ts` 引入 `inboxMigrating` 布尔互斥锁，并在 `finally` 中可靠释放 | ✅ 单测全通，重入拦截生效 |
| **`FIX-02`** | 文档收录 | 快捷键或右键连续点击收录同一文档时，并发网络延迟期间未拦截第二次收录请求 | 在 `src/index.ts` 引入 `capturingDocIds` 集合锁，收录期锁定同 ID 请求并拦截连击 | ✅ 单测全通，防并发写生效 |
| **`FIX-03`** | 状态命令 | 连续按快捷键修改状态可能触发并发写入与外部打卡桥重复调用 | 在 `src/index.ts` 引入 `statusBusyDocIds` 集合锁，排他锁定执行中的文档状态 | ✅ 单测全通，打卡事件幂等 |
| **`FIX-04`** | URL 协议安全 | `siyuan://plugins/siyuan-glean?action=open&id=...` 未对传入的 ID 做白名单清洗 | 在 `src/index.ts` 补充 `/^[\w-]+$/` 正则格式校验，过滤非法字符与空串，杜绝污染 `recentReadings` | ✅ 静态校验与单元测试通过 |
| **`FIX-05`** | 无障碍与门禁 | `DockPanel.svelte` 快照按钮在卡片精简后遗漏了 `title` 与 `aria-label` 属性，导致无障碍断言失败 | 为全 3 处快照文字按钮补齐 `title={snapshotLabel(entry)}` 与 `aria-label={snapshotLabel(entry)}` | ✅ `accessibility.test.ts` 32/32 PASS |
| **`FIX-06`** | 版本与发布候选 | `src/domain/schema.ts` 仍为旧常量 `1.4.2`，双语 README 与发布候选清单未对齐 `v1.4.3` | 四处版本号与更新日志统一对齐至 `1.4.3`，补齐 CHANGELOG 与发布候选复核 | ✅ `release-candidate.test.ts` 3/3 PASS |
| **`FIX-07`** | 工作台导轨偏好 | `DockPanel.svelte` 的 `collapseAllGroups` 与 `expandAllGroups` 在存储侧栏展开折叠偏好时缺少异常防御 | 补充 `try ... catch` 防御块，避免存储故障产生未捕获 Promise rejection | ✅ 代码鲁棒，测试通过 |
| **`FIX-08`** | 看板拖拽归档策略 | 看板卡片拖拽入「已归档」列时漏调 `openArchiveDialog`，导致物理归档笔记本策略分流失效 | 补齐 `if (status === "archived") { facade.openArchiveDialog(entry.id); return; }` | ✅ 策略一致，12 步 E2E 通过 |
| **`FIX-09`** | 预览双语 i18n | `WorkbenchPreview.svelte` 视口加宽/恢复按钮存在硬编码中文文案 | 补齐 `zh_CN` 与 `en_US` 的 `preview.widen` / `preview.restoreWidth` 词条 | ✅ 双语一致性门禁全通 |
| **`FIX-10`** | 搜索输入法守卫 | `ReaderSearch.svelte` 全文检索输入框在敲击中文拼音时（IME Composition）按 Enter/Esc 会误触发跳转或关闭 | 补充 `if (event.isComposing || event.keyCode === 229) return;` 保护 | ✅ 输入法友好，单测全绿 |
| **`FIX-11`** | 伴生栏双语对齐 | `ReadingContext.svelte` 微信公众号徽标存在硬编码 `"微信"` 中文字符串 | 补齐 `zh_CN` 与 `en_US` 的 `wechat.name` 词条，改为 `{t(i18n, "wechat.name")}` | ✅ 双语门禁全通，无硬编码 |
| **`FIX-12`** | 每日重浮双语对齐 | `ResurfaceView.svelte` 微信公众号徽标存在硬编码 `"微信"` 中文字符串 | 统一改为 `{t(i18n, "wechat.name")}` | ✅ 双语门禁全通，无硬编码 |
| **`FIX-13`** | 打卡连续步进器双语 | `ResurfaceView.svelte` 7 天连续打卡指示器 `title` 存在硬编码 `'已完成'`、`'今日待读'`、`'未读'` | 补齐 `resurface.stepCompleted`、`stepToday`、`stepUnread` 并在两处统一使用 | ✅ 双语一致性单测全绿 |
| **`FIX-14`** | 漫游抽屉双语对齐 | `RoamingDrawerDialog.svelte` 微信来源徽标存在硬编码 `"微信"` 中文字符串 | 统一改为 `{t(i18n, "wechat.name")}` | ✅ 双语门禁全通，无硬编码 |
| **`FIX-15`** | 批注块引用复制 | `HighlightView.svelte` 复制选中批注块引用时标题兜底存在硬编码 `"未命名"` | 统一改为 `{t(i18n, "panel.untitled")}` | ✅ 国际化门禁全通 |
| **`FIX-16`** | 批注过滤折叠指示 | `HighlightView.svelte` 过滤折叠头摘要徽标存在硬编码 `"已过滤"` | 补齐 `highlight.filteredBadge` 国际化双语词条 | ✅ 双语对齐全绿 |
| **`FIX-17`** | 批注思考无障碍标签 | `HighlightView.svelte` 批注思考气泡存在硬编码 `aria-label="批注思考"` | 补齐 `highlight.memoThought` 国际化双语词条并在全 2 处统一应用 | ✅ 屏幕阅读器友好 |
| **`FIX-18`** | 批注生态徽标双语 | `HighlightView.svelte` 置顶/重要/待办/存疑以及鲸鱼/原生备注徽标存在多处硬编码中文 | 补齐 `highlight.tag*` 与 `highlight.kind*` 国际化双语词条并在平铺与聚类两处统一应用 | ✅ 双语生态互通一致 |
| **`FIX-19`** | 新手引导徽章双语 | `OnboardingDialog.svelte` 欢迎屏 3 大亮点徽章及空态提示文案存在硬编码中文 | 补齐 `onboarding.heroBadge*` 与 `onboarding.emptyNote` 国际化双语词条 | ✅ 双语门禁全通，无硬编码 |
| **`FIX-20`** | 读库空态与导出双语 | `DockPanel.svelte` 空态快速起步卡片及批量导出清单存在硬编码中文与结构性 Emoji | 补齐 `library.quickStart`、`library.seedDemo*`、`library.importBookmarks*`、`library.onboardingGuide*`、`library.summaryAuthor/Site` 等双语词条并移除冗余 Emoji | ✅ 双语门禁全通，无障碍一致 |
| **`FIX-21`** | 批量微信提纯防御 | `DockPanel.svelte` 的 `batchPurifyWechat` 无微信条目时静默无反馈，且异常时遗漏重新对账重载 | 补充空条目友好提示，并在 `finally` 块中保证 `count > 0` 时的 `notifyDataChanged` 与 `reload` | ✅ 数据与界面状态可靠一致 |

---

## 二、后续批次结构性待办池（Backlog）

| 编号 | 所属模块 / 批次 | 事项概述与影响 | 预估复杂度 | 计划处理批次 |
| :--- | :--- | :--- | :---: | :---: |
| **`BL-18`** | 批次 3 (读库卡片与列表) | 看板卡片在长标题且带 5 个标签时的文本省略与徽标对齐微调 | 轻量 | Batch-03 已闭环验证 |
| **`BL-19`** | 批次 4 (工作台预览) | 预览分栏调宽在极窄分辨率（<800px）时增加最小宽度保护防止挤压主列表 | 轻量 | Batch-04 已闭环验证 |
| **`BL-20`** | 批次 7 (批注生态) | 按文章聚类的划线列表在折叠文章数极多时的大数据量虚拟渲染与滚动平滑度 | 中等 | Batch-07 已闭环验证 (DOM惰性折叠) |
| **`BL-21`** | 批次 2 (工作台主框架) | 超宽屏幕（如 21:9 / 32:9 带鱼屏）下导轨自适应宽度上限与拖拽调宽手柄 | 中等 | ✅ **已闭环验证**（`clampRailWidth` 180~420px，`railWidth` 偏好持久化，`.glean-rail-separator` 原生拖拽与全键盘流转） |
| **`BL-22`** | 批次 3 (读库卡片与列表) | 看板模式单列超过 50 篇卡片时的轻量虚拟滚动渲染支持 | 中等 | ✅ **已闭环验证**（`content-visibility: auto`，`kanbanColLimits` 单列独立加载与分页，消除超长列重排卡顿） |
| **`BL-23`** | 批次 4 (沉浸式阅读器) | 阅读器右侧边距大纲和批注列表在窗口高度过小时（<600px）采用微型手风琴自动折叠 | 轻量 | ✅ **已闭环验证**（`isShortViewport` 矮屏手风琴互斥收合，`@media (max-height: 600px)` 最大高度保护） |
| **`BL-24`** | 批次 5 (伴生栏与折叠阅读) | 伴生栏在移动端竖屏虚拟键盘唤起时结合 `visualViewport` 的自动上浮动态避让 | 轻量 | ✅ **已闭环验证**（`installMobileViewportVars` 动态注入 `--glean-keyboard-inset`，`transform` 平滑避让软键盘） |
| **`BL-25`** | 批次 1 (全局与快捷) | 原生编辑器文本/块手柄拖拽至侧栏或工作台 DropZone 自动收录与制卡 | 中等 | ✅ **已闭环验证**（`DockPanel` 挂载 `dropzone`，自动识别思源块 ID，文档入库，正文与文本直达闪卡制作） |
| **`BL-26`** | 批次 1 (全局与快捷) | 命令面板新增「漫游盲盒（随机抽选）」全局指令（`cmd.roamingPick`） | 极小 | ✅ **已闭环验证**（`cmd.roamingPick` 注册命令面板全局指令，漫游盲盒随时随地抽选好文重温） |
| **`BL-27`** | 批次 1 (全局与快捷) | 思源顶栏小麦穗图标右键扩展快捷上下文菜单（直达今日拾遗/摘录墙/统计/盲盒/设置） | 轻量 | ✅ **已闭环验证**（思源顶栏麦穗图标右键扩展快捷上下文菜单，直达今日拾遗/工作台/摘录墙/统计/盲盒/设置） |
| **`BL-28`** | 批次 2 (工作台检索) | 读库搜索输入框支持空格多关键词逻辑与（AND 匹配与多 Token 分词） | 轻量 | ✅ **已闭环验证**（`tokenizeKeyword` 支持空格多关键词 Token 拆分与逻辑与 AND 全文字段检索） |
| **`BL-29`** | 批次 2 (导轨交互) | 导轨分面项（作者/站点/标签）支持右键快捷操作菜单（设别名/全标已读/打开站点） | 中等 | ✅ **已闭环验证**（导轨作者/站点/标签分面项右键菜单，支持快捷筛选、设置别名、全标已读与浏览器打开站点） |
| **`BL-30`** | 批次 3 (全键盘流) | 读库网格与看板卡片支持方向键（↑ / ↓ / ← / →）平滑跨列二维键盘游走 | 中等 | ✅ **已闭环验证**（`moveKanbanCursor2D` 与 `moveKanbanCursorVertical` 二维平滑游走，方向键与 h/j/k 全键盘流转） |
| **`BL-31`** | 批次 3 (批量操作) | 批量操作底栏支持标签与作者批量变更的 Diff 预估提示（更新 X 篇、跳过 Y 篇） | 轻量 | ✅ **已闭环验证**（`computeBatchDiff` 实时预估标签与作者修改的变更数与跳过数，安全感提升） |
| **`BL-32`** | 批次 4 (沉浸阅读器) | 沉浸阅读器（ReaderTab）支持一键禅意全屏模式（Zen Mode / F11 隐藏顶栏与侧栏） | 轻量 | ✅ **已闭环验证**（`zenMode` / `F11` 禅意专注阅读模式，自动隐退伴生栏并居中排版，Escape 极简退出） |
| **`BL-33`** | 批次 4 (沉浸阅读器) | TTS 语音朗读支持正在朗读段落的实时黄色呼吸高亮视线跟踪 | 中等 | ✅ **已闭环验证**（`highlightTtsChunk` 结合 Protyle 实时黄色呼吸脉冲与视线平滑跟踪） |
| **`BL-34`** | 批次 5 (原生伴生栏) | 原生伴生栏增加极简悬浮圆点胶囊模式（Mini Floating Pill，hover 展开） | 轻量 | ✅ **已闭环验证**（`pillMode` 悬浮圆点胶囊模式，收折为微型悬浮麦穗，hover 平滑滑出，免正文打扰） |
| **`BL-35`** | 批次 5 (折叠阅读) | 折叠阅读器支持将当前阶数大纲摘要一键复制为 Markdown 结构化笔记草稿 | 极小 | ✅ **已闭环验证**（`formatFoldNodesToMarkdown` 一键将当前阶数大纲摘要复制为 Markdown 结构化笔记草稿与块引用） |
| **`BL-36`** | 批次 6 (今日拾遗) | 漫游抽屉（RoamingDrawer）支持按高星级与评分加权高频重浮抽选 | 轻量 | ✅ **已闭环验证**（`highRatingPriority` 选项为 4 星、5 星及星标收藏提供大幅重温加权加分） |
| **`BL-37`** | 批次 6 (今日拾遗) | 今日拾遗视图支持一键将今日必读卡导出为今日日记（Daily Note）计划嵌入块 | 中等 | ✅ **已闭环验证**（`recordBatchDailyNotePlan` 一键将今日 3 篇必读卡作为块引用清单插入今日日记阅读计划） |
| **`BL-38`** | 批次 7 (批注金句) | 金句卡片海报生成支持自定义背景图与个人笔名印章 | 中等 | ✅ **已闭环验证**（`signature` 个人笔名印章支持，在 Canvas 底层绘制朱砂红印泥印章与 DOM 实时印章徽标） |
| **`BL-39`** | 批次 7 (批注金句) | 批注墙支持批量按划线颜色自动分流导出卡片盒原子笔记（Zettelkasten） | 中等 | ✅ **已闭环验证**（`exportColorCardsZettelkasten` 按划线颜色自动分流聚类导出卡片盒原子笔记 Markdown） |
| **`BL-40`** | 批次 8 (切片排版) | 长文切片支持按自定义 Markdown 标题层级（H1/H2/H3）自由分切 | 轻量 | ✅ **已闭环验证**（`headingLevel` 自定义按 H1/H2/H3 精确独立分切长文大纲子文档） |
| **`BL-41`** | 批次 8 (切片排版) | 排版清洗候选规则支持一键剥离长文中的所有外部商业推广外链 | 轻量 | ✅ **已闭环验证**（`stripPromotionalLinks` 正则剥离商业营销与购买推广外链，纯化知识库资产） |
| **`BL-42`** | 批次 9 (导入迁移) | 外部导入支持自动从文章正文中解析并生成金句摘录与批注引述块 | 中等 | ✅ **已闭环验证**（`OmnivorePage` 解析 `highlights` 数组并直接在新建导入文档中生成金句与高亮摘录引述块） |
| **`BL-43`** | 批次 9 (导入迁移) | 读库元数据备份支持自动化定时本地轮转备份（Daily Local Auto-Backup，保留 7 份） | 轻量 | ✅ **已闭环验证**（`runDailyAutoBackup` 每日启动自动本地轮转备份元数据 JSON，保留最近 7 份历史快照） |
| **`BL-44`** | 批次 10 (设置引导) | 设置中心新增「全量设置导出与多设备导入」便携配置包（JSON） | 极小 | ✅ **已闭环验证**（`exportPortableSettings` 与 `importPortableSettings` 提供全量便携配置包 JSON 导出与恢复） |
| **`BL-45`** | 批次 10 (设置引导) | 新手引导完成页增加「一键收录当前打开的思源活动文档」起步动作 | 极小 | ✅ **已闭环验证**（新手引导就绪页一键收录当前打开的活动思源文档并立即开启阅读） |
