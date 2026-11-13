# 小驴拾遗（siyuan-glean）全表面 UI 审查与全入口功能排查待办池（2026-10-31）

> **当前执行状态更新（2026-10-31 `v1.4.2` 收官轮全部落地后）**：
> - **已全部完成关闭（12 项）**：`BL-03`、`BL-01`、`BL-05`、`BL-11`、`BL-02`、`BL-08`、`BL-12`、`BL-09`、`BL-14`、`BL-13`、`BL-15`、`BL-16`（连同 `index-store` 继续阅读书签投影修复、首屏减法与 `scripts/e2e-isolated.mjs` 12 步隔离浏览器实测），已全部合入本地 `v1.4.2` 收官版本。
> - **长期冻结（4 项外围半成品/死代码）**：`BL-04`、`BL-06`、`BL-07`、`BL-10` 遵照收缩决议长期冻结，不再投入开发时间。
> - **待办池状态**：**可开发项已 100% 清零**，项目正式进入 `v1.4.2` 封版稳定态。

---

## 一、 全界面入口穷举与功能链路三态核验清单（覆盖一 / 二 / 三级）

按「已实现且可用」「技术上可行但未做（含主链断裂/半成品）」「受平台限制无法实现」三态，对插件全部对外入口与内部二三级子入口逐项走查（可用项均按“输入 ➔ 处理 ➔ 持久化 ➔ 重载仍在 ➔ 异常可恢复”五环核验）：

### 1.1 全局宿主与跨插件入口（一级 / 二级）

| 入口层级与位置 | 具体入口 / 触发方式 | 三态判定 | 链路核验说明与关联待办 |
| :--- | :--- | :--- | :--- |
| 顶栏图标（桌面端） | 小麦穗图标（`addTopBar`） | **已实现且可用** | 打开或聚焦工作台页签，重载后幂等挂载不重复。 |
| 侧栏 Dock | 右下 Dock 图标（`glean-dock`） | **已实现且可用** | 挂载窄画布 `DockPanel`，但未获焦时子视图存在全局按键劫持（见 `BL-03`）。 |
| 命令面板（12 条命令） | `打开面板 (Ctrl+Alt+G / ⌥⌘G)`、`继续阅读`、`将当前文档加入读库`、`整理剪藏库`、`从选区制卡`、`标记已读`、`读下一篇`、`转稍后读`、`归档当前文档`、`打开原文`、`选区摘录为引述`、`阅读快捷键帮助` | **已实现且可用** | 12 条命令均已注册并经 `clip-store` 持久化；其中弹窗类命令连按缺少单例守卫（见 `BL-09`）。 |
| 编辑器右键菜单 | `加入收件箱`、`制作闪卡（有选区时）`（`open-menu-content`） | **已实现且可用** | 查重、属性写入、自动富化钩子与失败提示完整。 |
| 收集箱右键菜单 | `小驴拾遗：迁入读库`（`open-menu-inbox`） | **已实现且可用** | 支持多条迁入、查重提示与 `inbox-recovery.json` 检查点恢复。 |
| 自定义协议 URL Scheme | `siyuan://plugins/siyuan-glean?action=workbench\|library\|resurface\|highlights\|settings\|open\|capture` | **技术上可行但未做（半成品）** | `open`/`settings`/`capture` 链路闭合；但 `action=library\|resurface\|highlights` 仅调用 `openPanel()` 未传递目标子视图参数，且漏支持 `action=stats`（见 `BL-09`）。 |
| 思源 AI 智能体工具 | `list_unread`、`archive_stale`、`weekly_digest`（`addAgentCapability`） | **已实现且可用** | 先对账再读取/批量归档，归档成功后广播 `notifyDataChanged()`。 |
| 生态联邦桥与雷切小组件 | `window.siyuanGlean` 只读/受控写桥、`glean-later-list` 小组件、小驴打卡/闪卡/考试桥接 | **已实现且可用** | 写桥默认关闭，卸载时安全注销，外部插件未装时幽灵态提示降级。 |

### 1.2 主工作台四大视图及二三级子面板

| 面板 / 层级 | 具体控件与操作入口 | 三态判定 | 链路核验说明与关联待办 |
| :--- | :--- | :--- | :--- |
| **顶栏壳与导航**（一级） | 快速收录、独立浮窗、整理剪藏库、设置按钮、**主题色盘快捷菜单**、四视图导航栏、移动端底栏与三点更多菜单 | **已实现且可用（含局部缺陷）** | 主题色盘快捷下拉菜单打开后点击外部或按 `Escape` 无法关闭，且缺 ARIA 菜单状态属性（见 `BL-11`）。 |
| **今日拾遗 `ResurfaceView`**（一级 ➔ 二级） | 继续阅读卡（最近3篇切换）、待确认候选提醒、7日连击打卡条、每日推荐卡（开始读/改天/归档/当天置顶/换一篇/离线快照/撤销条/移动端左右滑手势）、最近收录、漫游盲盒按钮、快速检索按钮 | **已实现且可用（含局部缺陷）** | 属性写入与撤销令牌校验完整；但 `<svelte:window>` 在未获焦/后台隐藏页签时仍全局拦截 `Ctrl+F`、`/`、`B`、`J/K` 等按键（见 `BL-03`），且缺少键盘单键“标记已读”（见 `BL-09`）。 |
| **情境选文 `ContextSelectionPanel`**（二级） | 5/15/30 分钟预算下拉、主题标签下拉（支持别名）、纳入已读复选框、纳入未知时长复选框、空结果诊断与打开动作 | **已实现且可用** | 纯会话投影不污染持久属性，载体退路与空态诊断完整。 |
| **读库工作台 `DockPanel`**（一级 ➔ 二级） | 核心指标条点击过滤、关键词搜索、保存视图（新建/切换/设默认/删除/5项智能预设）、分面侧栏（折叠/手风琴/全收起/全展开/Top8切换/分面内检索/标签别名管理弹窗 `tagAliasDialog`）、筛选下拉与更多筛选浮层（`LibraryFilters` + 移动端筛选抽屉） | **已实现且可用（含局部缺陷）** | 保存视图串行精确写回可靠；保存视图命名框缺 `aria-label` 与回车保存（见 `BL-14`）。 |
| **治理横幅与云收集箱 `InboxSection`**（二级 ➔ 三级） | 收件箱超配额提醒、超龄文章勾选归档、候选待确认跳转、微信未识别作者一键批量识别横幅；云收集箱展开/刷新/迁入/忽略/重复保留确认/检查点重试 | **已实现且可用** | 收集箱未订阅静默隐藏，半成功状态跨重载可按确切文档 ID 恢复。 |
| **读库三画布与卡片动作**（二级 ➔ 三级） | 桌面行表（`.glean-drow`）、紧凑卡片（`.glean-card`）、候选行（确认收录/补URL/转本地文档/排除误报）、行尾 `ActionPopover` 更多菜单（内嵌 `AuthorEditor` 作者编辑与 AI 署名建议、复制反链、四大著录、稍后读、归档、快照、导出 `.md`、AI 富化、今日置顶、打开原文） | **已实现且可用（含局部缺陷）** | ① `ActionPopover` 点击菜单项后不自动收起，且 `AuthorEditor` 展开后浮层不重算坐标导致底部溢出（见 `BL-11`）；② **看板视图 `.glean-kcard`** 缺失 `ActionPopover` 与预览联动，无法在看板卡执行作者编辑/著录/快照/置顶，拖拽移回 `inbox` 无等价按钮，从 `archived` 拖出绕过了 `RestoreDialog` 宿主移出策略，且窄容器/150% 缩放下五列硬挤压截断（见 `BL-12`、`BL-13`）。 |
| **工作台右侧预览 `WorkbenchPreview`**（二级 ➔ 三级） | 收藏切换、漫游、四大著录、复制反链、打开文档、导出 `.md`、拍摄/查看快照、关闭、分隔条拖拽/键盘调宽、微信读书向导、候选确认/补URL/转本地/排除、优先级与评分 `ClipRankControls`、内嵌只读 Protyle 划词摘录浮条 | **已实现且可用（含局部缺陷）** | `<svelte:window>` 未校验预览区焦点与页签可见性，全局拦截单键 `B/Y/C/S/F/R/O`（见 `BL-03`）；微信读书徽标硬编码 `#07c160` 亮色对比度仅 `2.47:1`（见 `BL-15`）。 |
| **读库批量操作栏 `LibraryBatchBar`**（二级 ➔ 三级） | 全选已显示、仅留当前筛选、清空选择、批量改状态（阅读中/已读/归档）、**加标签**、**设作者**、**设优先级**、**设评分**、**批量提纯公众号**、复制块引用、四大著录批量复制、复制大纲摘要、导出 CSV、批量星标/取消星标、批量 AI 富化面板（`AiBatchPanel`） | **技术上可行但未做（含严重阻断缺陷）** | ① **加标签/设作者/设优先级/设评分** 4 个按钮全部调用 `window.prompt()`，在思源桌面端（Electron）下 `window.prompt` 不受支持直接返回 `null`，点击完全无反应；且 `batchSetAuthor` 未传 `{ force: true }`，覆盖已有作者时静默跳过却虚报成功数（见 `BL-01`）；② **批量提纯公众号** 调用半成品 `purifyWechatArticle`，未持久化清洗后正文（见 `BL-04`）。 |
| **全局摘录墙 `HighlightView`**（一级 ➔ 二级） | 当前文档/全库切换、时间线/按文章聚类切换、全部折叠/展开、刷新、漫游、搜索与五维筛选（站点/标签/AI标签/颜色/排序）、本页全选/清空、批量导出（复制/反链/四大著录/CSV/Markdown/预览建独立摘录稿）、单卡 11 项操作、按文章整篇复制/下载/建读书笔记、底部 AI 相关旧文（及孤立未接线 `QuotesView`） | **已实现且可用（含局部缺陷）** | ① `<svelte:window>` 全局劫持按键（见 `BL-03`）；② 聚类模式 `<summary>` 内非法嵌套 4 个 `<button>` 且折叠后 `J/K` 光标落入隐藏项（见 `BL-14`）；③ 颜色筛选下拉直出英文 `yellow/red/blue/green`（见 `BL-16`）；④ 单卡平铺 11 个按钮严重过载（见 `BL-13`）；⑤ `createArticleHighlightsDoc` 标记 `internal` 失败无幂等会话（见 `BL-08`）；⑥ `QuotesView.svelte` 未接线悬空（见 `BL-10`）。 |
| **阅读统计与复盘 `StatsView`**（一级 ➔ 二级） | 周/月/年切换、参考日输入、刷新、漫游、预览报告/复制报告/导出 CSV、核心指标条、转化漏斗、成就勋章、30天趋势图、365天热力图（点击/回车下钻）与按日明细表、站点/作者/标签分布（`DistributionList`）、已完成文章清单（搜索/单日清除/复制清单/大纲摘要/四大著录/导出CSV/单行 5 个纯图标操作）、报告草稿保存 | **已实现且可用（含局部缺陷）** | ① `<svelte:window>` 全局劫持按键（见 `BL-03`）；② 热力图交互单元误标 `role="img"`，且内联 `style` 覆盖翡翠绿数据色并导致低频日悬浮提示变透明（见 `BL-14`、`BL-15`）；③ 已读清单每行 5 个纯图标按钮全部缺失 `aria-label` 且无文字区分四大著录（见 `BL-13`、`BL-14`）。 |

### 1.3 伴读阅读器（`ReaderTab`）与原生上下文条（`ReadingContext`）

| 面板 / 层级 | 具体控件与操作入口 | 三态判定 | 链路核验说明与关联待办 |
| :--- | :--- | :--- | :--- |
| **原生编辑器上下文条 `ReadingContext`**（一级 ➔ 二级） | 复制块引用、**在拾遗阅读器打开**、打开原文、返回读库定位、五态流转按钮、维护折叠区（重新检测字数、重新剪藏、排版整理） | **技术上可行但未做（含路由错误）** | 「**在拾遗阅读器打开**」误调 `facade.openReadingDocument()` 而非 `facade.openReader()`，在默认 `reader.openInTab=false` 时点击只会重开当前原生页签，无法打开拾遗阅读器（见 `BL-05`）。 |
| **伴读阅读器顶栏与正文 `ReaderTab`**（一级 ➔ 二级） | 返回读库、阅读/编辑切换、标记已读、读完并下一篇、折叠阅读（`Alt+Z`）、正文查找浮条（`ReaderSearch`）、阅读主题循环（跟随/纸感/护眼）、全局色盘下拉、沉浸全屏、漫游换篇、星标收藏、键盘聚焦、`?` 快捷键帮助、浮动进度胶囊、回到顶部、划词悬浮胶囊（四色高亮/引述/带想法批注/金句卡片/朗读选区/摘录到闪卡/提炼待办/AI解释翻译/AI出题）、边距悬浮注记 | **已实现且可用（含局部缺陷）** | ① 色盘下拉点击外部/Esc 不关闭（见 `BL-11`）；② `Alt+*` 快捷键未过滤 `event.repeat` 与 `modalOpen`（见 `BL-09`）；③ 边距注记与批注颜色圆点共 5 处纯图标按钮缺 `aria-label`，划词批注输入框缺 `aria-label`，颜色筛选提示直出英文色名（见 `BL-14`、`BL-16`）。 |
| **伴生栏：5 阶语义折叠 `FoldedReaderView`**（二级 ➔ 三级） | `1`–`5` 阶胶囊切换与数字键缩放、单段卡片展开/收起、点击定位 Protyle 原文块 | **技术上可行但未做（半成品分支）** | `folded-reader-service.ts` 误用 `"NodeCodeBlock"`/`"NodeTable"` 过滤 `getChildBlocks` 的短类型码 `"c"`/`"t"`，代码块与表格混入正文；且未递归遍历引述/列表容器导致容器内段落全部丢失；Level 2/4 文本重合、Level 5 概念徽标头尾重复（见 `BL-06`）。 |
| **伴生栏：微信展台、大纲、批注、AI 与辅助工具**（二级 ➔ 三级） | 微信重扫作者、**提纯正文**、微信读书向导、复制纯净短链、复制纯净正文、同号/同专栏连读；大纲过滤、复制大纲、**思源脑图**、**渐进切片**；批注颜色循环与过滤、复制全部批注、创建摘录笔记；AI 总结/相关旧文/问这篇文章/插入正文开头；阅读位置书签 `ReadingPositionControls`、TTS 朗读与语速记忆、排版整理、离线快照、作者编辑 | **技术上可行但未做（含半成品）** | ① 微信「**提纯正文**」未写回或保存提纯后正文（见 `BL-04`）；② 「**思源脑图**」无防重入忙碌锁且误写 `status: "done"` 污染读库（见 `BL-08`）。 |

### 1.4 模态弹窗与设置页八大分类（二级 / 三级）

| 弹窗 / 子面板 | 具体控件与操作入口 | 三态判定 | 链路核验说明与关联待办 |
| :--- | :--- | :--- | :--- |
| **设置大窗 `SettingsView`**（二级） | 8 大分类导航（工作区/每日拾遗/阅读/AI增强/AI通道/集成/数据与恢复/维护）、6色主题卡片、锚点笔记本搜索与多选、自动快照开关、重浮数量/配额/超龄输入、阅读页签开关与模式、AI 模式/上限/8项子能力开关、自定义 AI 通道配置与连接测试、打卡与外部写桥开关、挂库向导、CSV/诊断/Markdown ZIP 导出、重建索引、AI 日志、放弃脏草稿确认、恢复默认、保存 | **已实现且可用（含局部缺陷）** | ① 固定 `920×720px` 在 150% 缩放下溢出视口（见 `BL-12`）；② 同一「AI 增强」组混用胶囊开关与原生复选框（见 `BL-13`）；③ 主题 `radiogroup` 缺方向键流转，校验错误仅在弹窗顶部提示未关联字段（见 `BL-14`）；④ 「恢复默认」无二次确认即清空全 8 组草稿（见 `BL-16`）；⑤ 缺少入库自动分拣规则开关配置（见 `BL-07`）。 |
| **设置内嵌 5 个三级维护面板** | `BackupPanel`（JSON 备份导出/差异预览/勾选恢复）、`FlashcardRecoveryPanel`（闪卡异常检查点恢复/清理）、`SnapshotGovernance`（覆盖率统计与批量补拍）、`AiTagMergePanel`（相似 AI 标签扫描与合并）、`AiBatchPanel`（读库内嵌批量 AI 富化与日志恢复） | **已实现且可用（含局部缺陷）** | 5 个子面板的 `<svelte:window>` `Escape` 忙碌守卫与分级回退均被外层 `installModalFocus` 捕获阶段短路绕过，运行中按 `Escape` 会直接关掉整个设置窗（见 `BL-02`）。 |
| **其余 10 个独立模态弹窗** | `OnboardingDialog`、`MigrateDialog`、`ImportDialog`、`ArchiveDialog`、`RestoreDialog`、`RoamingDrawerDialog`、`QuoteCardDialog`、`DocSlicingDialog`、`WeReadGuideDialog`、`FormattingDialog`、`FlashcardDialog` | **已实现且可用（含局部缺陷）** | ① 7 个弹窗的 `<svelte:window>` `Escape` 分级取消与忙碌锁死被 `installModalFocus` 捕获阶段绕过（见 `BL-02`）；② 10 个弹窗缺防叠开单例（见 `BL-09`）；③ `WeReadGuideDialog` 本地阅读按钮路由错误（见 `BL-05`）；④ `DocSlicingDialog` 部分切片失败漏报且重开可重复创建（见 `BL-08`）；⑤ `FlashcardDialog`/`FormattingDialog` 主按钮在 125%/150% 缩放下滚出首屏，`QuoteCardDialog` 长文大字顶部被居中容器裁切，`ArchiveDialog` 删除确认框固定高截断（见 `BL-12`）。 |

### 1.5 判定为「受平台限制无法实现」的 4 项（不混入开发修复池）

以下 4 项经源码与内核实证确认受宿主或运行平台架构限制无法实现，已提供明确替代方案：

1. **PL-01：思源多维表格（AV）单元格手动修改反向实时同步回文档根属性**
   - **限制来源**：思源内核未暴露 AV 单元格编辑的插件级持久化订阅钩子，且双向写回会破坏文档根块 `custom-clip-*` 单一事实源（D-0001）并造成循环覆盖冲突。
   - **替代方案**：坚持文档根块属性为唯一事实源，AV 定位为单向投影视图；在插件内修改状态后自动/手动通过设置页「刷新思源数据库视图」单向对齐。
2. **PL-02：浏览器 Web 前端（`browser-desktop` / `browser-mobile`）直连未开放 CORS 的第三方自定义 AI 接口**
   - **限制来源**：浏览器同源策略（CORS）禁止前端直接跨域请求未返回 `Access-Control-Allow-Origin` 的第三方大模型 API，而思源内核 `/api/ai/chatGPT` 端点不支持单次请求动态传入自定义 BaseURL 与密钥。
   - **替代方案**：按 `getFrontend()` 检测前端形态，Web 浏览器端自动提示并引导用户使用思源内置 AI 通道（由思源内核服务端转发），桌面 Electron 客户端支持直连自定义通道。
3. **PL-03：纯浏览器（非 Electron）直接加载思源桌面 Stage 执行完整宿主 Web UI 自动化**
   - **限制来源**：思源桌面端 `stage/build/app` 前端包顶层硬编码调用 `require("electron")`，在无 Electron 注入的普通浏览器环境中启动即抛错中止。
   - **替代方案**：采用「隔离思源内核服务级 E2E（58 项真实读写断言）+ Vite 真实 Svelte 组件隔离渲染与 Chrome 截图」双轨自动化验证，宿主原生交互归入 `B-0002` 真机走查。
4. **PL-04：思源内置 OCR 自动扫描识别剪藏图片（对应历史延后项 `T-3327`）**
   - **限制来源**：思源上游插件侧正式公开的 OCR 调用契约与共享 OCR 缓存/索引副作用尚未锁定，且自动后台扫描图片违反数据主权与零打扰平静原则。
   - **替代方案**：保持关闭不依赖预览版私有接口，待上游正式版契约稳定后，仅评估阅读器内由用户主动对单张图片显式触发的会话级识别辅助。

---

## 二、 合并去重后的统一开发待办池（共 16 条）

> **统计与去重口径**：
> - **UI 审查（`$ui-ux-pro-max` + 令牌/缩放/状态专项）** 共查出 **8 条**（`BL-02`、`BL-09`、`BL-11`、`BL-12`、`BL-13`、`BL-14`、`BL-15`、`BL-16`）；
> - **功能实现与链路排查** 共查出 **14 条**（含 **4 条** 受平台限制无法实现项 `PL-01`–`PL-04`，以及 **10 条** 可开发项 `BL-01`–`BL-10`）；
> - 其中 `BL-02`（模态框 Escape 捕获短路与忙碌关闭守卫）与 `BL-09`（弹窗单例、快捷键防抖与路由/键位一致性）为 UI 审查与功能排查双侧同根因共现，已合并去重，最终形成 **16 条** 可直接进入开发的合格待办。
> - **优先级公式**：$\text{优先级得分} = \frac{\text{影响面 (1–5整数)} \times \text{频率 (1–5整数)}}{\text{成本 (小=1, 中=2, 大=3)}}$。

---

### BL-03 · [缺陷] 四组件 `<svelte:window>` 未校验可见性与焦点归属，后台/侧栏全局劫持思源快捷键
- **来源**：功能实现排查
- **优先级**：**25.00**（影响面 `5` × 频率 `5` ÷ 成本 `1`；理由：影响整个思源宿主全部页签的日常键盘输入与 `Ctrl+F` 查找，侧栏 Dock 常驻首屏即为 `ResurfaceView`，每次按键必触发判断，修复仅需收束事件挂载作用域，成本小）
- **问题描述**：
  - **位置**：`src/ui/ResurfaceView.svelte:516-554, 749`、`src/ui/HighlightView.svelte:547-580, 667`、`src/ui/StatsView.svelte:360-421`、`src/ui/WorkbenchPreview.svelte:377-428`。
  - **复现步骤**：
    1. 在思源右侧 Dock 打开小驴拾遗（默认停留在 `ResurfaceView`），或在主编辑区打开小驴拾遗页签后切换到另一篇思源原生只读文档/PDF/数据库页签（此时拾遗页签处于后台隐藏态 `display: none`）；
    2. 在当前活动的思源文档树、只读笔记或 `ReaderTab` 阅读模式中按 `Ctrl+F`、`/`、`B`、`J`、`K`、`M`、`Y`、`C`。
  - **当前表现**：4 个组件均使用 `<svelte:window onkeydown>` 且未校验自身根节点是否可见（`getClientRects().length > 0`）以及焦点是否位于自身容器内，导致后台隐藏页签或未获焦的侧栏 Dock 直接调用 `preventDefault()` + `stopPropagation()` 劫持全局 `Ctrl+F`（跳回拾遗搜索）、按 `B` 突然弹出漫游盲盒、按 `M` 抢走 `ReaderTab` 的“标记已读”动作；当 Dock 与工作台页签同时打开时还会双倍触发。
  - **期望表现**：与 `DockPanel.svelte:2621`（挂载于 `root`）和 `ReaderTab.svelte:301`（挂载于 `readerRoot`）保持一致，仅当组件自身可见且当前焦点（`document.activeElement` 或 `event.target`）位于该面板容器内部时才响应单键快捷键与面板级 `Ctrl+F`。
- **解决方案**：将 `ResurfaceView`、`HighlightView`、`StatsView` 与 `WorkbenchPreview` 的键盘监听从 `<svelte:window>` 改为绑定在各自根容器元素（`tabindex="-1"`）上，或在入口处强制校验 `rootEl && rootEl.getClientRects().length > 0 && (rootEl.contains(target) || rootEl.contains(document.activeElement))`。改动范围仅限上述 4 个 Svelte 组件的事件绑定与焦点守卫。
- **成本**：**小（1）** — 已有 `DockPanel` 与 `ReaderTab` 成熟容器作用域模式可直接复用，改动集中且不涉及数据结构。
- **风险**：当用户刚点击面板空白处时需确保根容器具备 `tabindex="-1"` 以承接焦点，避免面板内点击后焦点落回 `document.body` 导致快捷键失效；需同步回归 `tests/resurface.test.ts`、`tests/highlights.test.ts`、`tests/stats.test.ts`、`tests/workbench-preview.test.ts`。

---

### BL-01 · [缺陷] 读库批量栏四项操作依赖 `window.prompt` 在思源桌面端静默失效，且批量设作者漏传 `force: true`
- **来源**：功能实现排查
- **优先级**：**16.00**（影响面 `4` × 频率 `4` ÷ 成本 `1`；理由：直接导致桌面端客户端读库批量工具栏 4 个核心属性操作 100% 点击无反应，且覆盖作者逻辑虚报成功数，改动局限于 `LibraryBatchBar` 与 `DockPanel`，成本小）
- **问题描述**（合并同根因项）：
  - **位置**：`src/ui/LibraryBatchBar.svelte:70-106`、`src/ui/DockPanel.svelte:1020-1044`（`batchAddTag`）、`src/ui/DockPanel.svelte:1344-1364`（`batchSetAuthor`）。
  - **复现步骤**：
    1. 在思源桌面客户端（Electron 环境）打开读库工作台，勾选 2 篇文章；
    2. 依次点击底部批量工具栏的「`+ 加标签`」「`✎ 设作者`」「`⚡ 设优先级`」「`⭐ 设评分`」按钮；
    3. 在浏览器端对已有公众号作者的文章执行批量「设作者」。
  - **当前表现**：Electron 原生禁用 `window.prompt()` 并直接返回 `null`，导致桌面端点击上述 4 个按钮毫无反应且无任何提示；在支持 `prompt` 的浏览器端，`batchSetAuthor` 调用 `writeClip(plugin, id, { author })` 未传 `{ force: true }`，遇到已有作者的文章被 `clip-store` 手填保护静默跳过，但计数仍 `count += 1` 并弹出“已为 N 篇文章设置作者”的虚假成功提示；此外 `batchAddTag` 实际写入的是 `aiTags`（AI 标签）却命名为“加标签”，且中途抛错时未在 `finally` 中对已成功项刷新索引。
  - **期望表现**：不依赖 `window.prompt()`，在批量栏内提供原生内联胶囊输入条/档位选择浮层（优先级 P0–P5 药丸、评分 0–5★ 药丸、标签/作者单行输入框 + 确认/取消）；用户显式批量设作者时传入 `{ force: true }` 并按真实写入成功数提示；明确区分或标注追加标签目标字段，并在 `finally` 中对 `count > 0` 可靠刷新。
- **解决方案**：在 `LibraryBatchBar.svelte` 内新增轻量内联展开输入/档位选择行（支持 `Enter` 提交、`Escape` 收起关闭），彻底移除 4 处 `window.prompt()`；在 `DockPanel.svelte` 的 `batchSetAuthor` 与 `batchAddTag` 中补齐 `{ force: true }`、`finally` 块 `count > 0` 对账刷新与准确文案。
- **成本**：**小（1）** — 纯前端交互替换与 `writeClip` 现有参数补齐，无需新增后端接口。
- **风险**：内联输入展开时会增加底部批量栏高度约 44px，需确保正常流布局在窄移动端和键盘弹出时不遮挡确认按钮；需更新 `tests/library-selection.test.ts` 与 `tests/header-actions.test.ts`。

---

### BL-05 · [缺陷] 原生编辑器上下文条与微信读书向导「在拾遗阅读器打开」路由错误，默认配置下无法打开伴读页签
- **来源**：功能实现排查
- **优先级**：**16.00**（影响面 `4` × 频率 `4` ÷ 成本 `1`；理由：`reader.openInTab` 默认关闭，绝大多数用户从原生笔记顶栏或微信向导点击“在拾遗阅读器打开”时完全无法进入伴读阅读器，修复仅两处方法调用替换，成本小）
- **问题描述**（合并同根因项）：
  - **位置**：`src/ui/ReadingContext.svelte:278`、`src/ui/WeReadGuideDialog.svelte:42`、`src/index.ts:459-481`。
  - **复现步骤**：
    1. 保持插件默认设置（`reader.openInTab = false`）；
    2. 在思源原生编辑器打开任意已收录文章，点击顶部拾遗胶囊栏的「在拾遗阅读器打开」按钮；或打开微信读书向导点击「在拾遗阅读器中直接打开」。
  - **当前表现**：两处按钮均调用了 `facade.openReadingDocument(id)`；该方法在 `reader.openInTab === false` 时走 `openNativeReadingDocument(id)`，即再次调用思源原生编辑器打开当前文档，界面停留在原地，根本不会打开拾遗伴读阅读器（`ReaderTab`）。同时读库列表/预览的“更多操作”中也缺少在不开启全局实验开关时单篇临时用拾遗阅读器打开的入口。
  - **期望表现**：点击明确标有“在拾遗阅读器打开”的按钮时，桌面端应调用 `facade.openReader(id)` 显式唤起 `ReaderTab` 伴读页签（移动端按契约自动回退原生查看器）。
- **解决方案**：将 `ReadingContext.svelte:278` 与 `WeReadGuideDialog.svelte:42` 中的 `facade.openReadingDocument(...)` 修正为 `facade.openReader(...)`；并在 `WorkbenchPreview.svelte` / `DockPanel.svelte` 的 `ActionPopover` 中按桌面端条件补充「在拾遗阅读器打开」动作项。
- **成本**：**小（1）** — `GleanFacade.openReader` 已在 `src/index.ts:472` 完整实现并含失败回退逻辑，直接接线即可。
- **风险**：需确认移动端（`facade.isMobile === true`）隐藏或回退该按钮文案，避免移动端显示“在拾遗阅读器打开”却打开原生页签造成预期偏差。

---

### BL-11 · [缺陷] 主题色盘下拉外部点击/Esc 无法关闭，且 `ActionPopover` 点击动作后常驻不收起、展开子项溢出视口
- **来源**：UI 审查（`$ui-ux-pro-max` Navigation `modal-escape` / Layout `overflow-menu`）
- **优先级**：**16.00**（影响面 `4` × 频率 `4` ÷ 成本 `1`；理由：覆盖主工作台顶栏、伴读器顶栏与读库每行“更多操作”菜单，属于高频交互浮层缺陷，修复范围集中，成本小）
- **问题描述**（合并同根因项）：
  - **位置**：`src/ui/DockPanel.svelte:2944-2970`、`src/ui/ReaderTab.svelte:2100-2126`、`src/ui/ActionPopover.svelte:12-72`。
  - **复现步骤**：
    1. 点击读库顶栏或阅读器顶栏的彩色圆点打开「主题色盘菜单」，随后点击页面空白处或按 `Escape` 键；
    2. 点击读库行尾 `⋯` 打开 `ActionPopover` 更多操作菜单，点击其中「复制块引用」或「复制 GB/T 引用」；
    3. 在靠近窗口底部的文章行打开 `ActionPopover`，点击菜单内的「编辑作者」展开 `AuthorEditor` 表单。
  - **当前表现**：① 两个主题色盘菜单没有任何外部点击（`pointerdown` outside）或 `Escape` 关闭逻辑，浮层一直悬停遮挡下方工具栏，且触发器缺 `aria-expanded` / `aria-haspopup`，选项缺 `role="menuitemradio"` 与 `aria-checked`；② `ActionPopover` 点击普通动作按钮后菜单不会自动关闭，一直遮挡列表；③ `ActionPopover` 仅在初次打开和窗口 `resize` 时计算 `top/left`，当内部 `AuthorEditor` 展开高度突增约 180px 时未重算位置，导致保存/建议按钮溢出视口底边；且在 `AuthorEditor` 内按 `Escape` 会被原生 `popover="auto"` 直接关掉整个菜单并丢失草稿。
  - **期望表现**：色盘菜单支持点击外部关闭、`Escape` 关闭并退回焦点，补齐完整 ARIA 菜单单选语义；`ActionPopover` 点击非展开型动作按钮后自动收起，对 `.glean-action-popover__body` 挂载 `ResizeObserver` 实时贴边防溢出，并在子表单激活时协调 `Escape` 层级。
- **解决方案**：为两个色盘下拉接入外部点击与 `installEscapeHandler` 关闭守卫（或统一改用增强后的 `ActionPopover`）；在 `ActionPopover.svelte` 中增加 `ResizeObserver` 动态重算 `position()`，并对不带 `data-keep-popover-open` 的普通菜单按钮点击自动执行 `close()`。
- **成本**：**小（1）** — 集中在 `ActionPopover.svelte` 与两处色盘模板，约 60 行代码内可闭合。
- **风险**：`AuthorEditor` 位于 `ActionPopover` 内，必须给 `AuthorEditor` 容器标记保持展开属性，防止点击「编辑作者」或「建议作者」时误触发菜单自动关闭。

---

### BL-02 · [缺陷] `installModalFocus` 捕获阶段短路 `Escape`，致 12 个弹窗与设置三级面板的分级取消及忙碌防关全部失效
- **来源**：功能实现排查 + UI 审查共现（`$ui-ux-pro-max` Accessibility `escape-routes` / Forms `sheet-dismiss-confirm`）
- **优先级**：**10.00**（影响面 `5` × 频率 `4` ÷ 成本 `2`；理由：波及全插件 7 个独立弹窗与 5 个维护恢复子面板的键盘安全与运行期防中断保护，需统一改造模态框关闭协议接线，成本中）
- **问题描述**（合并同根因项）：
  - **位置**：`src/libs/modal-focus.ts:88-102, 118`、`src/libs/dialog.ts:132-158`，以及 `ArchiveDialog.svelte:108`、`RestoreDialog.svelte:70`、`ImportDialog.svelte:302`、`MigrateDialog.svelte:390`、`OnboardingDialog.svelte:248`、`FormattingDialog.svelte:125`、`FlashcardDialog.svelte:93`、`BackupPanel.svelte:148`、`FlashcardRecoveryPanel.svelte:66`、`AiBatchPanel.svelte:165`、`AiTagMergePanel.svelte:88`、`SnapshotGovernance.svelte:69`。
  - **复现步骤**：
    1. 打开 `ArchiveDialog` 点击「彻底删除文章」展开红色二次确认框，按 `Escape`（期望仅退回上一层选项，实际直接销毁整个弹窗）；
    2. 打开 `ImportDialog` 或 `MigrateDialog` 开始执行批量导入/迁移（处于 `running` 忙碌态），按 `Escape` 或点击弹窗右上角 `×`（期望运行中锁定防中断，实际弹窗被立即强制销毁卸载）；
    3. 打开 `SettingsView` 切到「数据与恢复 / 维护」，在 `BackupPanel` 生成恢复预览或在 `SnapshotGovernance` 批量补拍快照期间按 `Escape`（期望取消预览或锁定忙碌态，实际整个设置大窗被直接关闭）。
  - **当前表现**：`installModalFocus` 在 `document` 的 **捕获阶段（capture=true）** 监听 `Escape`，仅分发给显式调用 `installEscapeHandler` 的组件（目前全仓仅 `DockPanel` 与 `SettingsView` 调用），随后立即执行 `event.stopImmediatePropagation()` 和 `options.onClose()`。上述 12 个组件全部把 `Escape` 逻辑写在 `<svelte:window onkeydown>`（`window` 冒泡阶段）且未调用 `registerCloseGuard`，导致其分级回退与忙碌锁在运行时 100% 永不可达。
  - **期望表现**：所有模态弹窗及内嵌多阶段子面板按栈序消费 `Escape`（先取消局部编辑/二次确认/预览会话，空闲无子态时才关窗），且处于异步写入/扫描/批处理忙碌期时同时锁住 `Escape` 与弹窗右上角 `×` 关闭按钮。
- **解决方案**：在 7 个独立模态弹窗中统一接入 `svelteDialog` 已注入的 `registerCloseGuard` 与 `installEscapeHandler(rootEl, ...)`（替代 `<svelte:window>` 上的 `Escape` 分支）；在 `SettingsView` 内嵌的 5 个三级子面板中通过 `installEscapeHandler` 注册局部捕获处理器，并向上层 `SettingsView` 汇总 `childBusy` 状态纳入 `canCloseSettings()`。
- **成本**：**中（2）** — 机制已在 `modal-focus.ts` 与 `dialog.ts` 备齐，但需逐一迁移 12 个组件的接线并补齐真实捕获顺序集成单测（替换原 `tests/modal-escape.test.ts` 的纯源码正则匹配）。
- **风险**：必须确保任何子面板卸载（`onDestroy`）或异常分支（`finally`）都可靠释放 `busy` 守卫，否则一旦 `canClose` 卡在 `false` 将导致用户无法关闭弹窗。

---

### BL-08 · [缺陷] 衍生文档（思源脑图 / 渐进切片 / 整篇摘录笔记）防重入缺失、内部标记错配污染读库及部分失败漏报
- **来源**：功能实现排查
- **优先级**：**9.00**（影响面 `3` × 频率 `3` ÷ 成本 `1`；理由：直接产生污染读库统计的伪已读条目、重复子文档或误入候选池的孤儿文档，修复逻辑清晰集中，成本小）
- **问题描述**（合并同根因项）：
  - **位置**：`src/ui/ReaderTab.svelte:542-557`、`src/services/doc-slicing-service.ts:19-123`、`src/ui/DocSlicingDialog.svelte:47-56`、`src/services/highlights.ts:282-319`。
  - **复现步骤**：
    1. 在阅读器大纲栏快速双击「思源脑图」按钮，随后回到读库查看「已读」队列与阅读统计；
    2. 在 `DocSlicingDialog` 生成切片子文档后再次打开弹窗点击生成，或模拟其中 1 片写入失败；
    3. 在摘录墙聚类视图点击「创建摘录笔记」，模拟 `createDocWithMd` 成功但随后的 `writeClip({ internal: true })` 超时失败，刷新读库候选池。
  - **当前表现**：① `createMindmapDoc()` 无忙碌互斥锁，双击会并发创建两份同名脑图文档；且 `createOutlineMindmapDocument` 对脑图文档写入了 `status: "done"` 而未写 `internal: true`，导致插件衍生的思维导图被当成一篇“已读文章”混入读库列表与统计；② `createSliceSubDocuments` 只要 `createdCount > 0` 即返回 `ok: true`，UI 仅提示“已成功创建 N 篇”而完全吞掉 `failedCount > 0` 的失败切片提醒，且无同路径已生成切片的防重提示；③ `createArticleHighlightsDoc` 每次拼接随机节点 ID 建档，若标记 `internal: true` 失败则留下含原文链接的未标记孤儿文档，下次对账时被误识别为新剪藏候选，重试又会再建新文档。
  - **期望表现**：脑图按钮具备 `mindmapBusy` 防重入锁且衍生脑图统一标记 `internal: true`（不写 `status: "done"` 污染读库）；切片部分失败时明确提示成功数与失败数，已存在切片子文档时提示复用或确认；整篇摘录建稿复用 `saveHighlightDraft` 的会话幂等标记机制。
- **解决方案**：在 `ReaderTab.svelte` 为脑图按钮补充 `mindmapBusy` 状态与 `disabled`/`aria-busy`；修改 `doc-slicing-service.ts:113` 改写 `{ internal: true }`（遵循 D-0001 与 `DATA-CONTRACT.md` §1 衍生文档规范）；在 `DocSlicingDialog.svelte` 区分全成功与部分失败反馈并在生成前扫描同父路径切片；将 `createArticleHighlightsDoc` 收敛至 `prepareHighlightExport` + `saveHighlightDraft` 幂等会话管线。
- **成本**：**小（1）** — 涉及 3 个服务/组件文件的边界修正，可完全复用现有 `internal: true` 与 `saveHighlightDraft` 模式。
- **风险**：历史版本已生成的脑图文档若带有 `custom-clip-status="done"`，本轮遵循“不删改用户既有文档数据”底线不做静默批量篡改，仅对新建脑图生效并在变更记录说明。

---

### BL-12 · [缺陷] 125% / 150% 系统缩放与窄容器下固定像素弹窗截断、主按钮滚出首屏、长金句顶部裁切及看板五列挤压
- **来源**：UI 审查（`$ui-ux-pro-max` Layout `horizontal-scroll` / `fixed-element-offset` / `Dynamic Type & Zoom`）
- **优先级**：**8.00**（影响面 `4` × 频率 `4` ÷ 成本 `2`；理由：Windows 笔记本默认普遍开启 125% 或 150% 系统缩放，直接导致设置窗、归档删除确认、制卡/排版主按钮、金句预览和看板布局截断或不可达，需统一调整多处容器盒模型，成本中）
- **问题描述**（合并同根因项）：
  - **位置**：`src/index.ts:62-63, 87-88, 713-714, 743-744, 789, 1118-1119, 1129-1130, 1146-1147`、`src/ui/FlashcardDialog.svelte:154-194`、`src/ui/FormattingDialog.svelte:215-240`、`src/ui/QuoteCardDialog.svelte:724-735`、`src/index.scss:6092-6100`。
  - **复现步骤**：
    1. 在 1920×1080 屏幕开启 Windows **150% 缩放**（逻辑视口 `1280×720`，思源可用高约 `650px`）或 1366×768 屏幕开启 **125% 缩放**，依次打开 `设置（920×720）`、`独立浮窗（1020×680）`、`归档弹窗（440×360）` 并点击「彻底删除文章」；
    2. 在 125%/150% 缩放下打开 `FlashcardDialog`（展开原句）或 `FormattingDialog`；
    3. 在 `QuoteCardDialog` 选择一段 200 字长句并切换为「大字」档位；
    4. 在 `900px` 宽的分屏页签或 150% 缩放下将读库切为「看板」视图。
  - **当前表现**：① `src/index.ts` 中 8 处弹窗宽高写死纯像素（未像新弹窗那样使用 `min(..., 94vw)` / `min(..., 88vh)`），150% 缩放下弹窗底部与右侧超出窗口，`ArchiveDialog` 展开删除确认面板后确认按钮被 `360px` 固定高裁切；② `FlashcardDialog` 与 `FormattingDialog` 将 `overflow: auto` 设在最外层根容器，底部主按钮（「确认制卡」「保存为独立整理稿」）随正文滚出首屏，不滚动根本看不见；③ `QuoteCardDialog` 的 `.glean-quote-card-stage` 同时设置 `display: flex; align-items: center; overflow-y: auto;`，卡片超高时向上下双向溢出，顶部引言与引号超出 `scrollTop = 0` 被永久裁切；④ `.glean-kanban` 硬写 `grid-template-columns: repeat(5, 1fr); overflow: hidden;`，窄工作台下每列被挤到 `140px`–`170px`，卡片按钮文字严重挤压截断且无法横向滚动。
  - **期望表现**：全插件弹窗统一使用 `min(目标px, 94vw)` 与 `min(目标px, 88vh)`（或自适应高度 + `max-height: 88vh`）；`FlashcardDialog` 与 `FormattingDialog` 改为中间内容区独立滚动、底部操作栏常驻可见；`QuoteCardDialog` 舞台移除父级 `align-items: center` 改用子卡片 `margin-block: auto` 实现短卡居中且长卡完整可滚；看板网格改为 `repeat(5, minmax(220px, 1fr))` 并开启 `overflow-x: auto` 平滑横滚。
- **解决方案**：更新 `src/index.ts` 中 8 处 `svelteDialog`/`simpleDialog` 尺寸表达式并让 `ArchiveDialog`/`RestoreDialog` 使用 `height: "auto"` + `max-height: 88vh`；重构 `FlashcardDialog.svelte` 与 `FormattingDialog.svelte` 为 `height: 100%; display: flex; flex-direction: column` + 中部滚动区 + `flex-shrink: 0` 底栏；修正 `QuoteCardDialog.svelte:728` 与 `src/index.scss:6096`。
- **成本**：**中（2）** — 覆盖主入口与 4 个弹窗/看板的弹性布局调整，需在多分辨率与缩放比下逐屏截图核验。
- **风险**：修改 `src/index.ts` 中设置/迁移/导入弹窗宽高表达式时，需同步核对 `tests/header-actions.test.ts` 中对标准弹窗尺寸契约的断言正则，确保契约单测同步升级。

---

### BL-04 · [缺陷] 微信公众号「提纯正文 / 批量提纯」清洗结果丢弃未落盘，属于半成品假实现（落盘形态待确认）
- **来源**：功能实现排查
- **优先级**：**6.00**（影响面 `4` × 频率 `3` ÷ 成本 `2`；理由：伴读器微信展台与读库批量栏两个显眼按钮承诺“修复懒加载/背景长图/逆向公式与代码块/清除噪点”，实际未持久化任何正文清洗结果，需接入安全落盘链路，成本中）
- **问题描述**：
  - **位置**：`src/services/wechat-service.ts:160-219`（`purifyWechatArticle`）、`src/ui/ReaderTab.svelte:849-867, 2488`、`src/ui/DockPanel.svelte:1309-1342`、`src/ui/LibraryBatchBar.svelte:142-144`。
  - **复现步骤**：
    1. 打开一篇带有 `data-src` 懒加载裂图、赞赏码与推广尾注的微信公众号剪藏文章；
    2. 在伴读阅读器右侧微信卡片点击「提纯正文」（或在读库勾选后点击底部批量栏「提纯公众号」）；
    3. 看到提示“正文提纯完成！当前纯净正文约 X 字”后，查看正文并重载文档。
  - **当前表现**：`purifyWechatArticle` 导出 Markdown 并在内存局部变量 `cleaned` 中执行了 `repairWechatContent` 与 `cleanWechatNoise`，随后**直接丢弃了 `cleaned` 字符串**，仅将重算后的 `words`/`minutes` 与提取的作者/摘要写入属性便返回 `ok: true`，思源文档中的裂图与广告噪点分毫未改。
  - **期望表现**：用户触发提纯后，清洗修复后的纯净正文必须真实落盘可见、重载仍在，同时不违反数据主权与块引用安全红线。
- **解决方案**：**【方案待确认】** 存在两种持久化路径，实施前需先确认产品契约（参照 `T-3220` 与 `D-0063` 原文写入红线）：
  - **推荐方案 A（零风险遵循现有 `D-0063` 契约）**：不原地覆写原文档块树（防止破坏已有引述块 ID 与闪卡绑定），单篇点击「提纯正文」直接打开预填好微信提纯结果的 `FormattingDialog` 或像 `saveFormattingDraft` 一样一键生成带原文回链的独立提纯稿（`《原标题》· 微信提纯稿`）并打开；若仅需校准字数/提取公众号元数据，则按钮应明确更名为「校准元数据与字数」而非误导性的「提纯正文」。
  - **备选方案 B（原地更新正文）**：需先完成 `T-3220` 复杂块树原地替换与撤销栈 spike 验证，确认不破坏文档内已有块引用与 riff 闪卡锚点后方可实施。
- **成本**：**中（2）** — 若采纳推荐方案 A，可完全复用 `formatting-service.ts` 的建稿与回链管线并校准批量动作语义。
- **风险**：若贸然原地整篇覆盖 Markdown，会导致用户已在该微信文章上做的划词引述块 ID、反链和闪卡锚点全部断裂（严重数据损坏风险），因此严禁未经事务验证直接覆写原文档根块。

---

### BL-06 · [缺陷] 5 阶折叠阅读器误判 `getChildBlocks` 类型码致代码块/表格混入且漏读容器内段落，各阶内容高度重合
- **来源**：功能实现排查
- **优先级**：**6.00**（影响面 `3` × 频率 `4` ÷ 成本 `2`；理由：直接影响伴读器核心特色功能 `Alt+Z` 折叠阅读的段落完整性与 5 阶缩放区分度，需改造服务层块树遍历与域层提取策略，成本中）
- **问题描述**（合并同根因项）：
  - **位置**：`src/services/folded-reader-service.ts:34-55`、`src/domain/folded-reader.ts:69-161`、`src/ui/FoldedReaderView.svelte:169-229`。
  - **复现步骤**：
    1. 打开一篇包含代码块、表格、引述块（`>`）和无序列表的技术剪藏文章，按 `Alt+Z` 开启 5 阶语义折叠阅读；
    2. 按数字键 `1` ➔ `2` ➔ `3` ➔ `4` ➔ `5` 依次切换折叠粒度观察卡片内容。
  - **当前表现**：① 思源 `/api/block/getChildBlocks` 实际返回短类型码（`"p"` 段落、`"h"` 标题、`"c"` 代码块、`"t"` 表格、`"b"` 引述、`"l"` 列表，见 `outline-service.ts:5` 实证），而 `folded-reader-service.ts:40` 却用 DOM 字符串 `r.type === "NodeCodeBlock" || r.type === "NodeTable"` 过滤，导致过滤分支 100% 失效，代码块和表格原样混入折叠流；② 未像 `outline-service.ts` 那样递归遍历容器块（`b/l/i/s/callout`），而容器块顶层 `content` 为空被 `length < 3` 过滤，导致引述块和列表内的正文段落全部丢失；③ `extractGist`（Level 4，限 90 字）直接调用 `extractVerbatimBrief`（Level 2，限 140 字），绝大多数段落首句短于 90 字导致 Level 2 与 Level 4 显示一字不差；Level 5 在卡片头部已显示 `node.concept` 的情况下，卡片正文再次重复渲染同一个 `node.concept` 加 `node.gist`。
  - **期望表现**：准确使用思源短类型码排除 `"c"`/`"t"`/`"m"`/`"html"`/`"tb"`，受控递归展开引述块与列表项中的正文段落（保留确切叶块 `blockId` 供点击精准滚动定位）；5 个层级具有清晰递进的信息密度差异（如 Level 5 呈现紧凑概念索引芯片墙或无重复单行概念脉络，Level 4 提炼核心主谓短句/首尾结论句区别于 Level 2 完整原句）。
- **解决方案**：在 `folded-reader-service.ts` 复用 `outline-service.ts` 的有界容器遍历（预算上限保护）并按真实短类型码 `"p" | "h"` 采集叶块；优化 `domain/folded-reader.ts` 中 Level 3/4/5 的确定性结构化抽取与 `FoldedReaderView.svelte` Level 5 紧凑概念网格视图（消除头部与正文的概念标签重复）。
- **成本**：**中（2）** — 需同步调整服务层递归采集、域层提取纯函数与 Level 5 模板，并补充容器嵌套与代码块排除单测。
- **风险**：超长列表文档递归调用 `getChildBlocks` 可能增加内核请求次数，必须复用 `outline-service.ts` 的请求次数预算（如最多 200 次容器展开）并在超预算时平滑回退 `exportMdContent`。

---

### BL-09 · [缺陷] 10 个弹窗缺少防叠开单例、`ReaderTab` 组合键缺防连发/遮罩守卫、URL 协议丢弃子视图参数且读库缺标记已读键位
- **来源**：功能实现排查 + UI 审查共现
- **优先级**：**6.00**（影响面 `3` × 频率 `4` ÷ 成本 `2`；理由：涉及多入口重复唤起弹窗叠层冲突、外部协议深链失准以及键盘分拣流核心键位与文档失配，改动跨 `index.ts` 与快捷键模块，成本中）
- **问题描述**（合并同根因项）：
  - **位置**：`src/index.ts:758-791, 867-887, 1112-1149`、`src/ui/*-dialog.ts`、`src/ui/ReaderTab.svelte:1011-1084`、`src/domain/library-keyboard.ts:74-129`、`README.md:104-120`。
  - **复现步骤**：
    1. 在 `ReaderTab` 按住或连按两次 `Alt+B` / `Alt+Q`，或通过命令面板/URL 协议连续触发两次 `openSettings()` / `openImport()` / `openMigrate()`；
    2. 访问 `siyuan://plugins/siyuan-glean?action=highlights` 或 `?action=stats`；
    3. 在读库工作台或今日拾遗用 `J/K` 选中文章后尝试用键盘将其标记为「已读」，并对照 `README.md` 快捷键表按 `D`、`A`、`1-5`。
  - **当前表现**：① `Settings`、`Migrate`、`Import`、`Roaming`、`QuoteCard`、`Flashcard`、`Formatting`、`WeReadGuide`、`DocSlicing`、`ReaderHelp` 共 10 个弹窗均未包裹 `createDialogSingleton`，且 `ReaderTab.svelte:1012-1084` 的 `Alt+*` 分支未检查 `event.repeat` 与 `modalOpen`，导致连按或长按会叠开多层相同模态窗、双倍响应键盘事件；② `onPluginUrl` 对 `library/resurface/highlights` 一律只调 `openPanel()` 忽略目标视图，也不识别 `stats`；③ `library-keyboard.ts` 无任何键位可触发“标记已读（`done`）”，且实际键位（`1-5` 设优先级、`A` 稍后读、`E` 归档、`T` 置顶、`H` 换篇）与双语 `README` 所写（`1-5` 评星、`D` 已读、`A` 归档、`P` 置顶、`R` 换篇）严重不符。
  - **期望表现**：所有模态弹窗具备单例防叠开（已打开时聚焦现有实例而非再开一层）；`ReaderTab` 的 `Alt+*` 动作过滤 `event.repeat` 与顶层弹窗遮罩；URL Scheme 精确切换到指定子视图（含 `stats`）；读库键盘流补齐 `D` 键标记已读，并校准双语 `README` 与界面 `kbdhint` 键位说明完全一致。
- **解决方案**：用 `createDialogSingleton` 统一封装 `index.ts` 与 `src/ui/*-dialog.ts` 中的 10 个弹窗入口；在 `ReaderTab.svelte:1011` 顶部加入 `if (event.repeat || modalOpen) return;`；为 `openPanel(targetView?)` 增加可选目标视图事件投递；在 `library-keyboard.ts` 增加 `lower === "d" -> { type: "markDone" }` 并在 `DockPanel` 接线，同步校对 `README.md` / `README.en-US.md` 快捷键表。
- **成本**：**中（2）** — 改动点明确但分布于入口壳、弹窗封装、键盘纯函数与文档四处。
- **风险**：新增 `D` 键标记已读时必须走既有 `setStatus(entry, "done")` 以确保同步触发 `doneTime` 记录与小驴打卡桥接钩子，并纳入 `REPEAT_SENSITIVE` 防长按误标整列。

---

### BL-14 · [缺陷] 10 处纯图标按钮缺 `aria-label`、热力图误标 `role="img"`、摘录聚类 `<summary>` 嵌套按钮且设置校验未关联字段
- **来源**：UI 审查（`$ui-ux-pro-max` Accessibility `aria-labels` / `focus-not-obscured` / `error-placement` / `keyboard-nav`）
- **优先级**：**6.00**（影响面 `3` × 频率 `4` ÷ 成本 `2`；理由：属于 WCAG 2.2 A/AA 核心可访问性与键盘可达性硬伤，影响读屏与纯键盘操作，修复涉及 5 个组件模板属性，成本中）
- **问题描述**（合并同根因项）：
  - **位置**：`src/ui/ReaderTab.svelte:2237, 2372, 2380, 2388, 2857, 2874`、`src/ui/StatsView.svelte:568, 691-705`、`src/ui/HighlightView.svelte:81-85, 864-886`、`src/ui/SettingsView.svelte:618, 690-712, 824, 908, 917, 924, 942, 950, 954`、`src/ui/DockPanel.svelte:3206`。
  - **复现步骤**：
    1. 使用键盘 `Tab` 或读屏软件走查 `StatsView` 已读清单行尾 5 个纯图标按钮、`ReaderTab` 边距注记卡片 3 个纯图标按钮及批注颜色筛选/切换圆点按钮；
    2. 键盘聚焦 `StatsView` 年度热力图单元格，或在 `HighlightView` 切换为“按文章”视图后折叠第一组 `<details>` 再按 `J/K`，或在 `<summary>` 内的 4 个操作按钮上按 `Space`；
    3. 在 `SettingsView` 聚焦主题色盘卡片按方向键，或输入非法每日上限点击保存。
  - **当前表现**：① 共 10 个纯图标 `<button>` 无可见文本且无 `aria-label`，读屏播报为空按钮；`DockPanel` 保存视图名称输入框与 `ReaderTab` 划词批注输入框仅靠 `placeholder` 无 `aria-label`；② `StatsView` 热力图单元格可聚焦可点击下钻，却标记 `role="img"` 且无 `aria-pressed`；③ `HighlightView` 将 4 个 `<button>` 嵌套在 `<summary>`（隐式 `role="button"`）内部，违反 HTML 交互嵌套规范且按 `Space` 会连带折叠分组；同时单向绑定 `open={allGroupsOpen}` 未追踪各组实际开合状态，折叠分组后 `visibleIds` 仍包含隐藏卡片，`J/K` 光标落入不可见元素；④ `SettingsView` 主题 `role="radiogroup"` 缺漫游 `tabindex` 与方向键切换，表单校验错误仅在弹窗最顶部渲染，7 个受检 `<input>` 均无就近错误提示与 `aria-describedby` 绑定。
  - **期望表现**：所有纯图标按钮与无显式 `<label>` 输入框 100% 具备准确 `aria-label`；热力图交互格改为 `role="button"` + `aria-pressed`；摘录聚类头部改为独立折叠触发按钮与同级操作组分离，且 `visibleIds` 仅收集当前展开分组内的条目；设置页 `radiogroup` 支持方向键流转，错误提示就近渲染在对应字段下方并通过 `aria-describedby` 关联。
- **解决方案**：逐处补齐 `aria-label`；将 `HighlightView` 聚类容器由 `<details>/<summary>` 改为由 `openGroups: Record<string, boolean>` 受控的卡片头（左侧折叠按钮 `aria-expanded` + 右侧独立动作按钮组）并同步过滤 `visibleIds`；为 `SettingsView` 补齐 `handlePaletteRadioKeyDown` 与字段级错误关联。
- **成本**：**中（2）** — 涉及 5 个组件的模板语义重构与 `tests/accessibility.test.ts` 守门断言扩充。
- **风险**：重构 `HighlightView` 聚类头部 DOM 结构时需同步更新 `highlights.scss` 中依赖 `details[open]` / `summary` 的选择器，避免样式丢失。

---

### BL-16 · [体验] 颜色筛选直出英文枚举值、多处残留裸 Emoji、设置「恢复默认」缺确认保护且部分动作缺加载态反馈
- **来源**：UI 审查（`$ui-ux-pro-max` Style `no-emoji-icons` / Forms `confirmation-dialogs` / `loading-buttons`）
- **优先级**：**4.50**（影响面 `3` × 频率 `3` ÷ 成本 `2`；理由：影响中文界面专业度与设置防误触安全，改动跨多个视图文案与按钮状态绑定，成本中）
- **问题描述**（合并同根因项）：
  - **位置**：`src/ui/HighlightView.svelte:738, 938`、`src/ui/ReaderTab.svelte:2144, 2614, 2857`、`src/ui/SettingsView.svelte:482-484, 1189`、`src/ui/DockPanel.svelte:1244, 3544, 3637`、`src/ui/RoamingDrawerDialog.svelte:494`。
  - **复现步骤**：
    1. 在中文界面下对文章添加两种颜色高亮，打开 `HighlightView` 查看「按颜色筛选批注」下拉选项，并悬停 `ReaderTab` 伴生栏批注颜色过滤圆点；
    2. 打开 `SettingsView` 切到「每日拾遗」分类，点击底部「恢复默认」按钮；
    3. 检查阅读器顶栏「`✓→` 读完并下一篇」、漫游盲盒下拉「`🏷️` 全部主题」、摘录墙「`✨` 相关旧文」、分面侧栏「`✨` AI 标签」与专栏「`📚`」前缀。
  - **当前表现**：① `HighlightView.svelte:738` 直接渲染 `<option value={c}>{c}</option>`，中文界面出现生硬英文 `yellow` / `red` / `blue` / `green`；`ReaderTab.svelte:2857` 悬浮提示渲染为“筛选 yellow”（尽管词表已有 `reader.color.yellow` 等双语键）；② 点击「恢复默认」无任何二次确认或范围说明，瞬间清空全部 8 个分类草稿（包括用户在「工作区」已选的锚点笔记本和「AI 通道」已填的接口地址）；③ 上述控件仍使用平台字体不一的裸 Emoji/字符充当结构图标；④ 批量复制/导出与脑图创建等按钮在执行期间缺少统一的 `aria-busy` / 禁用防重入视觉反馈。
  - **期望表现**：颜色筛选与提示统一调用 `t(i18n, "reader.color." + c)` 显示本地化名称；结构图标统一替换为 `#iconGlean*` 线性 SVG 符号；「恢复默认」点击后弹出内联确认条（类似放弃脏草稿确认条）说明将重置所有分类草稿；异步按钮补齐 `busy` 禁用与状态反馈。
- **解决方案**：映射四色 i18n 键；将残留的 `🏷️`、`📚`、`✨`、`✓→`、`⏱️` 收口至现有 SVG symbol；在 `SettingsView.svelte` 底栏复用 `confirmDiscardOpen` 同款内联确认模式保护 `resetDefaults()`。
- **成本**：**中（2）** — 涉及多处模板图标替换与设置底栏确认状态扩展。
- **风险**：需检查 `tests/header-actions.test.ts` 或 `tests/settings.test.ts` 是否对 `resetDefaults` 单击即重置有直接调用断言，必要时分离确认态与执行函数。

---

### BL-13 · [体验] 跨面板控件形态与主次层级不一致：设置同组混用两套开关、摘录卡 11 按钮与统计行 5 图标平铺过载、看板卡缺预览/更多菜单及拖拽等价按钮
- **来源**：UI 审查（`$ui-ux-pro-max` Style `consistency` / `primary-action` / Accessibility `dragging-alternative`）
- **优先级**：**4.00**（影响面 `3` × 频率 `4` ÷ 成本 `3`；理由：跨设置页、摘录墙、统计页与读库看板四大面板的信息密度与组件一致性治理，涉及交互收纳与看板动作补齐，成本大）
- **问题描述**（合并同根因项）：
  - **位置**：`src/ui/SettingsView.svelte:838-875`、`src/ui/HighlightView.svelte:820-850, 897-927`、`src/ui/StatsView.svelte:690-706`、`src/ui/DockPanel.svelte:3485, 3549-3558, 1387-1392`、`src/ui/ClipStatusActions.svelte`。
  - **复现步骤**：
    1. 打开 `SettingsView` ➔「AI 增强」，对比同一卡片内上下相邻的 7 个布尔开关；
    2. 在 `380px` 宽的 Dock 侧栏打开 `HighlightView` 浏览摘录卡片底部操作区，并打开 `StatsView` 展开已完成文章清单观察每行右侧的 5 个小图标按钮；
    3. 在读库切换到「看板」视图，尝试对某张卡片打开右侧 `WorkbenchPreview` 抽屉、编辑作者、复制著录、置顶，或不使用鼠标拖拽将一张卡片移回「待分拣（Inbox）」、将【归档】宿主下的卡片移回「稍后读」。
  - **当前表现**：① 设置页同一卡片内前 4 项使用 `.glean-sw` 胶囊开关，后 3 项突变为浏览器原生 `<input type="checkbox">`；② `HighlightView` 每张卡片平铺 11 个同级按钮（窄栏折成 4–5 行，完全淹没主操作），`StatsView` 每行平铺 5 个无文字纯图标按钮（视觉上无法分辨哪一个是 GB/T、BibTeX、APA、MLA），与 `DockPanel` 使用 `ActionPopover` 收纳低频著录的模式割裂；③ 看板卡片点击标题直接跳走打开正文而非联动预览抽屉，缺失 `ActionPopover` 更多菜单，无非拖拽按钮可移回 `inbox`，且从 `archived` 列拖出卡片直接调用 `setStatus` 绕过了 `openRestoreDialog` 宿主移出选择。
  - **期望表现**：① 设置页布尔项统一使用 `.glean-sw` 胶囊开关（附 `role="switch"` + `aria-checked`）；② 摘录卡仅常驻 3 个高频主次动作（「定位原文」「金句卡片」「复制引用」），其余制卡、出题、反链与四大著录收纳进 `ActionPopover`；统计已读行同样以 `ActionPopover` 带明确文字标签收纳四大著录与反链复制；③ 看板卡片补齐紧凑 `ActionPopover`（含预览/移回待分拣/作者/著录/快照/置顶），且从 `archived` 列拖出位于归档宿主内的卡片时统一分流至 `openRestoreDialog`。
- **解决方案**：替换 `SettingsView.svelte:855-875` 三处复选框为 `.glean-sw`；在 `HighlightView` 与 `StatsView` 引入 `ActionPopover` 收纳低频引用导出按钮；在 `DockPanel` 看板卡片头部增设 `ActionPopover` 并在 `moveTo()` 中当 `entry.status === "archived"` 且目标为活跃状态时检测 `docUnderHostKind` 分流恢复弹窗。
- **成本**：**大（3）** — 涉及四大核心视图的操作区结构收敛与大量现有源码静态匹配单测（如断言卡片存在特定按钮的测试）同步调整。
- **风险**：`tests/highlights.test.ts`、`tests/stats.test.ts`、`tests/settings.test.ts` 中存在对按钮类名或 input 结构的静态断言，收纳进 `ActionPopover` 时必须保持原有处理函数名并在单测中同步验证菜单项存在性。

---

### BL-15 · [体验] 微信徽标 `#07c160` 亮色对比度不达标、热力图内联样式覆盖数据色并透明化提示框，且 15 个组件局部 `<style>` 游离于令牌审计之外
- **来源**：UI 审查（`$ui-ux-pro-max` Accessibility `color-contrast` / Typography & Color `color-semantic`）
- **优先级**：**4.00**（影响面 `3` × 频率 `4` ÷ 成本 `3`；理由：直接影响亮/暗主题视觉对比度合规性与全局令牌单一事实源，需清理 15 个组件私有 `<style>` 并升级令牌审计脚本，成本大）
- **问题描述**（合并同根因项）：
  - **位置**：`src/ui/WorkbenchPreview.svelte:598-603`、`src/styles/components/wechat.scss:236-237`、`src/ui/StatsView.svelte:568`、`src/index.scss:2006-2009, 7093-7095, 9617-9621`、`src/styles/components/palette.scss:69,124,131`、`src/styles/components/stats.scss:112,364` 及 `AiBatchPanel.svelte` / `HighlightView.svelte` / `SettingsView.svelte` / `StatsView.svelte` / `QuoteCardDialog.svelte` 等 15 个组件的 `<style>` 块。
  - **复现步骤**：
    1. 在亮色主题下打开微信文章右侧预览，测量「微信读书」绿色胶囊文字（`#07c160` 在浅色底上）对比度；
    2. 在 `StatsView` 悬停某一天完成篇数为 1（非最高峰值）的热力图格子，观察格子颜色与弹出的日期提示胶囊；
    3. 检查 `scripts/design-token-audit.mjs` 的扫描目标范围。
  - **当前表现**：① `WorkbenchPreview.svelte:599` 与 `wechat.scss:237` 硬编码 `color: #07c160`，在白色表面对比度仅 **2.47:1**（远低于 WCAG AA 4.5:1 标准），且未引用 `--glean-color-wechat`；② `StatsView.svelte:568` 使用内联 `style="background: var(--b3-theme-primary); opacity: 0.32"`，不仅覆盖了 `stats.scss` 定义的翡翠绿数据语义色 `--glean-color-data`，而且父元素 `opacity: 0.32` 导致其 `::after` 悬浮提示框连带变成半透明残影无法看清；③ `index.scss` 与子样式表仍有收藏红 `#EF4444`、火焰橙 `#F97316`、闪电黄 `#EAB308`、星标金 `#F59E0B`、提示底 `#18181B` 等硬编码色值未抽象语义令牌，且 15 个 `.svelte` 文件内的 `<style>` 块存在 330+ 处裸 `px` 间距/字号，因 `design-token-audit.mjs` 只扫 `src/index.scss` 而长期漏检。
  - **期望表现**：微信文字色统一通过 `color-mix(in srgb, var(--glean-color-wechat) 72%, var(--b3-theme-on-background))` 保证亮暗双主题对比度 `>= 4.5:1`；热力图改用 CSS 变量 `--glean-heat-alpha` 控制 `color-mix(in srgb, var(--glean-color-data) ..., var(--b3-theme-surface))` 背景色深浅，彻底移除父元素 `opacity` 以保持 `::after` 提示框 100% 不透明清晰；抽齐 `--glean-color-favorite` / `--glean-color-star` / `--glean-tooltip-bg` 等语义令牌，并将 `src/styles/**/*.scss` 与 `src/ui/*.svelte` `<style>` 全部纳入 `pnpm tokens:audit`。
- **解决方案**：在 `tokens.scss` 补齐缺失语义色令牌；重写 `StatsView.svelte:568` 背景色混合变量；收敛 `wechat.scss`、`WorkbenchPreview.svelte` 及各组件 `<style>` 中的裸色值与高频裸字号/间距，并扩展 `scripts/design-token-audit.mjs` 扫描全量样式文件。
- **成本**：**大（3）** — 涉及 15+ 个组件局部样式块盘点替换及审计脚本扩围。
- **风险**：`QuoteCardDialog.svelte` 中用于真实 Canvas 导出渲染的四套固定卡面配色（冷杉/纸墨/曜黑/素白）属于导出图片画布主题而非宿主 UI 壳样式，应在审计脚本中明确标注豁免，不可误改为宿主动态变量导致导出 PNG 配色随思源主题漂移。

---

### BL-07 · [功能] 入库自动分拣规则引擎（`auto-triage.ts`）仅单点接导入预览且状态/优先级动作实效为零，缺全入口贯通与设置开关
- **来源**：功能实现排查
- **优先级**：**3.00**（影响面 `3` × 频率 `2` ÷ 成本 `2`；理由：属于已入库但仅停留在表面单点接线的半成品功能，不影响手动分拣但导致宣传的自动分配状态与优先级实际未生效，需契约对齐与设置接入，成本中）
- **问题描述**：
  - **位置**：`src/domain/auto-triage.ts:33-87, 150-186`、`src/services/import-service.ts:53-70`、`src/services/clip-store.ts`、`src/services/inbox-service.ts`、`src/services/settings.ts`。
  - **复现步骤**：
    1. 导入一份含 ArXiv 学术论文链接（`status=unread`）的 Pocket CSV 文件观察预览状态与导入后的优先级；
    2. 通过右键菜单/顶栏手动收录或从思源云收集箱迁入一篇 20 分钟深度长文或微信公众号文章；
    3. 打开设置页查找自动分拣规则的启用/关闭开关。
  - **当前表现**：① `evaluateAutoTriage` 全仓仅在 `import-service.ts:54` 一处被调用，手动收录、候选确认、存量迁移与收集箱迁入均未接入；② 即便在唯一调用的 `import-service.ts` 中，因 `importers.ts` 恒返回非空 `item.status = "inbox"`，触发 `auto-triage.ts:160` 的 `statusAssigned = Boolean(item.currentStatus) === true`，导致规则定义的 `targetStatus: "later"` 100% 永不生效，同时 `ImportPreviewRow` 无 `priority` 字段，`appliedPriority` 也被直接丢弃；③ 设置页无任何开关可关闭默认自动追加的「微信」「学术论文」等标签，默认开启可能违背部分用户不希望自动改标签的预期。
  - **期望表现**：在设置页「工作区」或「每日拾遗」提供显式的「入库自动分拣规则」开关（遵循插件自动化默认克制原则，或允许逐条启停 4 条预设规则）；开启时，对未明确指定已完成/已归档的新入库文章（外部未读导入、收集箱迁入、首次确认收录）统一在未有手填状态/优先级的前提下应用匹配的初始状态（`inbox`/`later`）、初始优先级与预设标签。
- **解决方案**：先在 `docs/DATA-CONTRACT.md` 与 `services/settings.ts` 增补 `autoTriageEnabled`（及可选预设规则开关数组）设置契约；修正 `evaluateAutoTriage` 区分“外部默认未读（可由规则分流至 `later`）”与“用户显式状态/历史已读（不可覆盖）”；在 `import-service.ts`（扩展支持 `later` 预览汇总与初始优先级）及首次 `captureDocument` / `migrateShorthand` 中按设置开关受控接入。
- **成本**：**中（2）** — 需同步扩展 `settings.ts`、`import-service.ts` 状态汇总枚举与 `SettingsView.svelte` 开关项，并更新契约文档。
- **风险**：若默认开启并在 `captureDocument` 中向思源根块 `IAL.tags` 自动追加标签，会改变现有手动收录只读 `IAL.tags` 的契约边界（违反手填保护），因此新规则开关应默认关闭，或仅写入插件管理的分类属性而不擅改用户原生 `tags`。

---

### BL-10 · [技术债] 孤立未接线组件 `QuotesView.svelte` 及配套域/服务代码长期悬空，与 `HighlightView` 双轨并存（去留待确认）
- **来源**：功能实现排查
- **优先级**：**1.00**（影响面 `1` × 频率 `1` ÷ 成本 `1`；理由：运行时未被挂载不产生直接线上故障，但增加构建体积、i18n 维护成本与双套摘录逻辑混淆，成本小）
- **问题描述**：
  - **位置**：`src/ui/QuotesView.svelte`、`src/domain/quotes.ts`、`src/services/highlights.ts`（`listLibraryQuotes` / `listQuoteRoots`）、`src/services/excerpt-service.ts`（`exportQuotesToDoc`）。
  - **复现步骤**：全局检索 `QuotesView` 的导入与挂载位置。
  - **当前表现**：全仓没有任何入口引用或挂载 `QuotesView.svelte`，主面板「摘录」页签实际挂载的是 `HighlightView.svelte`（仅聚合已收录读库文章的摘录），而 `QuotesView.svelte`（聚合思源全库任意文档引述块）自早期开发后一直处于未接线悬空状态，形成两套相似组件与导出函数并存的半成品残留。
  - **期望表现**：代码库内不保留无人消费的悬空页面组件，要么正式并入 `HighlightView` 作为可选范围分支，要么移除悬空 UI 组件以保持单一事实源。
- **解决方案**：**【方案待确认】** 实施前需先明确产品范围取舍：
  - **推荐方案 A（归档清理悬空组件）**：小驴拾遗的核心边界是“管理已确认收录进读库的文章，不越界接管普通笔记”（D-0016），`HighlightView` 的「当前文档 / 整个读库」已完整覆盖产品定位，建议移除未接线的 `QuotesView.svelte` 及仅被其消费的死代码，保留 `domain/quotes.ts` 若有共享纯函数则并入 `domain/highlights.ts`。
  - **备选方案 B（并入 `HighlightView` 第三作用域）**：若希望提供“包含未收录普通笔记的全思源引述检索”，则在 `HighlightView` 作用域切换器增加「全思源引述」开关复用其查询，废除独立 `QuotesView.svelte`。
- **成本**：**小（1）** — 无论清理死代码或合并查询分支均在 3 个文件以内，同步调整 `tests/quotes.test.ts` 即可。
- **风险**：清理前需核对 `public/i18n/` 中 `quotes.*` 键是否被 `HighlightView` 共用，避免误删仍在使用的翻译键触发 `tests/i18n.test.ts` 失败。

---

## 三、 后续开发分批执行建议

每批严格控制在 **4 项（一轮对话可高质量闭环并完成单测与回归验证的规模）**，后续开发轮次可直接按批次顺序取用，无需重新排期：

### 第一批：P0 高频阻断与桌面端静默失效清障（✅ 已完成闭环）
- **包含条目**：`BL-03`（✅ 已完成）、`BL-01`（✅ 已完成）、`BL-05`（✅ 已完成）、`BL-11`（✅ 已完成） plus `BL-02`（✅ 已提前并入完成）
- **完成说明**：已连同界面首屏减法（今日拾遗卡收敛为「开始阅读 / 今天略过 / 归档 / ⋯ 更多操作」、情境选文与漫游盲盒合并为折叠栏、22 键提示带收入 `? 快捷键`）一并落地，`pnpm check` 0 错 0 警，`pnpm test` 1,770/1,770 全通。

### 下一批候选（待一周 10 步真机主链试用反馈后按需取用）：高分屏缩放适配、弹窗单例与衍生文档隔离
- **包含条目**：`BL-08`（得分 9.00）、`BL-12`（得分 8.00）、`BL-09`（得分 6.00）、`BL-14`（得分 6.00）
- **批次目标与理由**：若真机试用中遇到 125%/150% 缩放弹窗截断（`BL-12`）、衍生文档污染已读统计（`BL-08`）、连按快捷键叠开弹窗或需要 `D` 键标已读（`BL-09`），直接取本批在单轮内闭环。

### 冻结与延后池（试用一周内未用到的外围功能暂不开发）
- **外围功能冻结项**：`BL-04`（公众号提纯落盘）、`BL-06`（5 阶折叠阅读器块类型扩展）、`BL-07`（自动分拣规则全入口开关）、`BL-10`（孤立 `QuotesView` 清理）。
- **低优视觉与一致性微调项**：`BL-16`（得分 4.50）、`BL-13`（得分 4.00）、`BL-15`（得分 4.00）。仅在真实使用中形成干扰时再按单点取出。
