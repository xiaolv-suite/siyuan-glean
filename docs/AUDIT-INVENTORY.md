# AUDIT-INVENTORY — 小驴拾遗全量交互元素清单与基线

> **基线确立时间**：2026-11-01  
> **基线版本**：v1.4.3  
> **全量交互元素总数**：**175 项**（源码实证提取，数出明确总数）  
> **规划执行**：分为 10 个业务模块批次（Batch 01 ~ Batch 10），本轮首启 Batch 01。

---

## 一、批次与风险分布统计

| 批次编号 | 业务模块名称 | 覆盖元素数 | 其中高风险写入/删除项 | 规划覆盖率 |
| :--- | :--- | :---: | :---: | :---: |
| `Batch-01` | 宿主集成与全局导航 | **23** | 8 | 13.1% |
| `Batch-02` | 工作台主框架与导轨 | **27** | 1 | 15.4% |
| `Batch-03` | 读库核心列表与卡片交互 | **26** | 12 | 14.9% |
| `Batch-04` | 工作台预览分栏与沉浸式阅读器 | **18** | 3 | 10.3% |
| `Batch-05` | 原生编辑器伴生栏与折叠阅读器 | **10** | 3 | 5.7% |
| `Batch-06` | 每日重浮与待读流 | **13** | 3 | 7.4% |
| `Batch-07` | 批注生态与金句卡片 | **14** | 3 | 8.0% |
| `Batch-08` | 长文切片与排版清洗 | **10** | 6 | 5.7% |
| `Batch-09` | 数据迁移、导入导出与微信助手 | **15** | 7 | 8.6% |
| `Batch-10` | 设置中心与新手引导 | **19** | 8 | 10.9% |
| **合计** | **全工程 10 大核心模块** | **175** | **54** | **100.0%** |

---

## 二、全量交互元素明细表 (Total: 175)

| 编号 | 批次 | 代码位置 | 控件类型 | 元素名称 / 语义标识 | 触发动作 / 响应行为 | 风险判定 |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| `INV-001` | `Batch-01` | `src/index.ts:365` | `IconButton` | 顶栏图标 (iconGleanWheat) | 点击唤起小驴拾遗主工作台页签 | 常规(读/显) |
| `INV-002` | `Batch-01` | `src/index.ts:166` | `DockIcon` | Dock侧栏图标 (iconGleanWheat) | 展开/聚焦侧边栏面板 (toggleDockSidebar) | 常规(读/显) |
| `INV-003` | `Batch-01` | `src/index.ts:193` | `Command` | 命令面板: 打开工作台 (cmd.openPanel) | 唤起工作台页签 (默认快捷键 ⌥⌘G / Ctrl+Alt+G) | 常规(读/显) |
| `INV-004` | `Batch-01` | `src/index.ts:200` | `Command` | 命令面板: 继续阅读 (cmd.continueReading) | 定位并接续上一篇阅读中的文章 | 常规(读/显) |
| `INV-005` | `Batch-01` | `src/index.ts:225` | `Command` | 命令面板: 加入读库 (cmd.addToList) | 将当前活动编辑器根文档加入读库并写属性 | ⚠️ 高风险(写/删) |
| `INV-006` | `Batch-01` | `src/index.ts:230` | `Command` | 命令面板: 打开迁移 (cmd.openMigrate) | 打开存量剪藏属性迁移向导 | 常规(读/显) |
| `INV-007` | `Batch-01` | `src/index.ts:235` | `Command` | 命令面板: 摘录制卡 (cmd.makeCard) | 从当前选区制作金句卡片或闪卡 | 常规(读/显) |
| `INV-008` | `Batch-01` | `src/index.ts:241` | `Command` | 命令面板: 标记已读 (cmd.markDone) | 当前文档标记为 done 并触发打卡桥 | ⚠️ 高风险(写/删) |
| `INV-009` | `Batch-01` | `src/index.ts:242` | `Command` | 命令面板: 下一篇待读 (cmd.readNext) | 自动挑选并跳转下一篇未读文章 | 常规(读/显) |
| `INV-010` | `Batch-01` | `src/index.ts:243` | `Command` | 命令面板: 移入稍后读 (cmd.markLater) | 当前文档标记为 later 稍后读 | ⚠️ 高风险(写/删) |
| `INV-011` | `Batch-01` | `src/index.ts:244` | `Command` | 命令面板: 归档当前文章 (cmd.archiveCurrent) | 打开归档确认弹窗进行归档 | ⚠️ 高风险(写/删) |
| `INV-012` | `Batch-01` | `src/index.ts:245` | `Command` | 命令面板: 打开原文链接 (cmd.openSource) | 外部浏览器打开文章 sourceUrl | 常规(读/显) |
| `INV-013` | `Batch-01` | `src/index.ts:246` | `Command` | 命令面板: 选区摘录引述块 (cmd.excerptQuote) | 在原文当前段落下方插入引述块 | ⚠️ 高风险(写/删) |
| `INV-014` | `Batch-01` | `src/index.ts:247` | `Command` | 命令面板: 阅读动作快捷键帮助 (cmd.readerHelp) | 弹窗显示阅读动作和快捷键说明 | 常规(读/显) |
| `INV-015` | `Batch-01` | `src/index.ts:935` | `MenuItem` | 编辑器右键菜单: 制作闪卡/摘录 (glean-make-card) | 将选中文本转换为金句卡片预览 | 常规(读/显) |
| `INV-016` | `Batch-01` | `src/index.ts:951` | `MenuItem` | 编辑器右键菜单: 加入读库 (glean-add-to-library) | 收录当前文档为读库条目并触发 AI 富化 | ⚠️ 高风险(写/删) |
| `INV-017` | `Batch-01` | `src/index.ts:895` | `MenuItem` | 收集箱右键菜单: 迁入读库 (glean-inbox-migrate) | 批量将思源收集箱碎片迁入读库 | ⚠️ 高风险(写/删) |
| `INV-018` | `Batch-01` | `src/index.ts:870` | `ProtocolHandler` | 自定义协议 URL: siyuan://plugins/siyuan-glean | 解析 action 路由至工作台/设置/阅读等子页面 | 常规(读/显) |
| `INV-019` | `Batch-01` | `src/index.ts:1007` | `AgentTool` | 思源智能体工具: list_unread | 思源 AI 列出未读文章清单 | 常规(读/显) |
| `INV-020` | `Batch-01` | `src/index.ts:1037` | `AgentTool` | 思源智能体工具: archive_stale | 思源 AI 批量归档超期文章 | ⚠️ 高风险(写/删) |
| `INV-021` | `Batch-01` | `src/index.ts:1066` | `AgentTool` | 思源智能体工具: weekly_digest | 思源 AI 生成周度阅读摘要与统计 | 常规(读/显) |
| `INV-022` | `Batch-01` | `src/index.ts:315` | `EcosystemBridge` | 小驴雷切生态桥 (registerRaikiriModuleSafely) | 向雷切工作台注册待读流小组件 | 常规(读/显) |
| `INV-023` | `Batch-01` | `src/index.ts:342` | `EventListener` | 闪卡复习联动 (lv-cards:reviewed / lv-exam:stats) | 接收外部闪卡复习事件并就地刷新 | 常规(读/显) |
| `INV-024` | `Batch-02` | `src/ui/DockPanel.svelte:2869` | `Button` | 导轨快速收录按钮 (.glean-workbench-rail__capture) | 调用 captureDocument 收录当前活动文档 | ⚠️ 高风险(写/删) |
| `INV-025` | `Batch-02` | `src/ui/DockPanel.svelte:2875` | `Button` | 导轨切换: 每日重浮 (resurface) | 切换到每日重浮与待读流视图 | 常规(读/显) |
| `INV-026` | `Batch-02` | `src/ui/DockPanel.svelte:2880` | `Button` | 导轨切换: 读库文章 (library) | 切换到读库文章主列表视图 | 常规(读/显) |
| `INV-027` | `Batch-02` | `src/ui/DockPanel.svelte:2885` | `Button` | 导轨切换: 批注高亮 (highlights) | 切换到高亮划线与批注汇总视图 | 常规(读/显) |
| `INV-028` | `Batch-02` | `src/ui/DockPanel.svelte:2890` | `Button` | 导轨切换: 统计分析 (stats) | 切换到阅读统计与热力图视图 | 常规(读/显) |
| `INV-029` | `Batch-02` | `src/ui/DockPanel.svelte:2895` | `IconButton` | 导轨设置按钮 (.glean-workbench-rail__settings) | 打开插件设置主面板 (openSettings) | 常规(读/显) |
| `INV-030` | `Batch-02` | `src/ui/DockPanel.svelte:2910` | `IconButton` | 导轨全部折叠按钮 (iconGleanCollapseAll) | 折叠导轨所有手风琴分组 | 常规(读/显) |
| `INV-031` | `Batch-02` | `src/ui/DockPanel.svelte:2915` | `IconButton` | 导轨全部展开按钮 (iconGleanExpandAll) | 展开导轨所有手风琴分组 | 常规(读/显) |
| `INV-032` | `Batch-02` | `src/ui/LibraryRailGroup.svelte:45` | `Button` | 手风琴分组标题折叠头 | 点击切换当前分组的展开/收起状态 | 常规(读/显) |
| `INV-033` | `Batch-02` | `src/ui/LibraryRailGroup.svelte:70` | `Button` | 导轨项: 状态队列筛选 (inbox/later/reading/done/archived) | 过滤当前队列文章 | 常规(读/显) |
| `INV-034` | `Batch-02` | `src/ui/LibraryRailGroup.svelte:95` | `Button` | 导轨项: 优先级/星级筛选 (P0-P3 / 0-5星) | 按评级过滤读库条目 | 常规(读/显) |
| `INV-035` | `Batch-02` | `src/ui/LibraryRailGroup.svelte:115` | `Button` | 导轨项: 载体类型筛选 (微信/长文/PDF/快照/书签) | 按内容载体分类过滤 | 常规(读/显) |
| `INV-036` | `Batch-02` | `src/ui/LibraryRailGroup.svelte:135` | `Button` | 导轨项: 主题标签筛选 (Tag Filter) | 按文章标签过滤 | 常规(读/显) |
| `INV-037` | `Batch-02` | `src/ui/LibraryRailGroup.svelte:155` | `Button` | 导轨项: 站点来源筛选 (Site Filter) | 按站点来源过滤 | 常规(读/显) |
| `INV-038` | `Batch-02` | `src/ui/DockPanel.svelte:2980` | `Button` | 智能预设视图胶囊 (Smart View Preset) | 一键应用长文/高优/快照/速读预设筛选 | 常规(读/显) |
| `INV-039` | `Batch-02` | `src/ui/DockPanel.svelte:3005` | `Button` | 保存当前视图按钮 (Save View) | 将当前过滤与排序条件保存为自定义视图 | 常规(读/显) |
| `INV-040` | `Batch-02` | `src/ui/DockPanel.svelte:3020` | `Button` | 删除自定义视图按钮 | 移除已保存的自定义视图 | 常规(读/显) |
| `INV-041` | `Batch-02` | `src/ui/DockPanel.svelte:3040` | `IconButton` | 主题色盘触发按钮 (.glean-palette-trigger) | 弹出主题配色切换气泡菜单 | 常规(读/显) |
| `INV-042` | `Batch-02` | `src/ui/DockPanel.svelte:3055` | `Button` | 主题配色选项项 (Teal/Amber/Indigo/Rose/Emerald) | 切换插件主题调色盘并持久化 | 常规(读/显) |
| `INV-043` | `Batch-02` | `src/ui/DockPanel.svelte:3090` | `Button` | 快捷键帮助提示胶囊 (<kbd>?</kbd> 快捷键) | 展开/收起键盘流转说明抽屉 | 常规(读/显) |
| `INV-044` | `Batch-02` | `src/ui/LibraryFilters.svelte:25` | `Input` | 读库搜索输入框 (input[type='search']) | 实时防抖搜索读库匹配项 | 常规(读/显) |
| `INV-045` | `Batch-02` | `src/ui/LibraryFilters.svelte:40` | `Select` | 搜索目标下拉 (标题/标签/正文/URL/别名) | 切换搜索匹配字段 | 常规(读/显) |
| `INV-046` | `Batch-02` | `src/ui/LibraryFilters.svelte:60` | `Select` | 排序键下拉 (收录时间/阅读时长/星级/优先级/进度) | 切换读库排序字段 | 常规(读/显) |
| `INV-047` | `Batch-02` | `src/ui/LibraryFilters.svelte:75` | `IconButton` | 排序方向切换按钮 (升序/降序) | 切换升序或降序排布 | 常规(读/显) |
| `INV-048` | `Batch-02` | `src/ui/DockPanel.svelte:3120` | `SegmentedControl` | 布局形态切换分段 (表格/看板/紧凑卡片) | 切换文章展示容器形态 | 常规(读/显) |
| `INV-049` | `Batch-02` | `src/ui/DockPanel.svelte:3220` | `EmptyState` | 读库无匹配条目空态 (.glean-library-empty) | 展示无结果提示与重置过滤入口 | 常规(读/显) |
| `INV-050` | `Batch-02` | `src/ui/DockPanel.svelte:3235` | `ErrorState` | 读库索引加载失败错误态 (.glean-index-error) | 展示错误信息与重新加载按钮 | 常规(读/显) |
| `INV-051` | `Batch-03` | `src/ui/DockPanel.svelte:3310` | `Button` | 卡片主操作: 开始/继续阅读 (.glean-card__btn-read) | 打开文章阅读页签或原生编辑器并滚动定位 | 常规(读/显) |
| `INV-052` | `Batch-03` | `src/ui/ActionPopover.svelte:35` | `IconButton` | 卡片更多操作触发按钮 (ActionPopover) | 弹出文章级动作菜单 (快照/AI/置顶/原文/作者/引用) | 常规(读/显) |
| `INV-053` | `Batch-03` | `src/ui/ActionPopover.svelte:55` | `MenuItem` | 菜单项: 生成离线快照 | 抓取并保存离线 HTML 纯文本快照 | 常规(读/显) |
| `INV-054` | `Batch-03` | `src/ui/ActionPopover.svelte:65` | `MenuItem` | 菜单项: AI 智能富化 | 调用 AI 生成摘要与标签词表 | 常规(读/显) |
| `INV-055` | `Batch-03` | `src/ui/ActionPopover.svelte:75` | `MenuItem` | 菜单项: 今日置顶重浮 | 将文章置顶加入今日重浮必读池 | 常规(读/显) |
| `INV-056` | `Batch-03` | `src/ui/ActionPopover.svelte:85` | `MenuItem` | 菜单项: 打开原文链接 | 在系统浏览器打开源网站 | 常规(读/显) |
| `INV-057` | `Batch-03` | `src/ui/ActionPopover.svelte:95` | `MenuItem` | 菜单项: 修改作者信息 | 弹出作者编辑胶囊输入框 | 常规(读/显) |
| `INV-058` | `Batch-03` | `src/ui/ActionPopover.svelte:105` | `MenuItem` | 菜单项: 复制块引用 | 复制 Markdown 格式 ((id 'title')) | 常规(读/显) |
| `INV-059` | `Batch-03` | `src/ui/ActionPopover.svelte:115` | `MenuItem` | 菜单项: 复制 GB/T 7714 学术著录 | 生成国标引文并写入剪贴板 | 常规(读/显) |
| `INV-060` | `Batch-03` | `src/ui/ActionPopover.svelte:125` | `MenuItem` | 菜单项: 复制 BibTeX / APA / MLA 引文 | 生成外文引文格式并写入剪贴板 | 常规(读/显) |
| `INV-061` | `Batch-03` | `src/ui/ClipStatusActions.svelte:20` | `Button` | 状态切换: 移至新剪藏 (inbox) | 修改文档状态属性为 inbox | ⚠️ 高风险(写/删) |
| `INV-062` | `Batch-03` | `src/ui/ClipStatusActions.svelte:30` | `Button` | 状态切换: 移至稍后读 (later) | 修改文档状态属性为 later | ⚠️ 高风险(写/删) |
| `INV-063` | `Batch-03` | `src/ui/ClipStatusActions.svelte:40` | `Button` | 状态切换: 开始阅读 (reading) | 修改文档状态属性为 reading | ⚠️ 高风险(写/删) |
| `INV-064` | `Batch-03` | `src/ui/ClipStatusActions.svelte:50` | `Button` | 状态切换: 标记已读 (done) | 修改文档状态属性为 done 并触发打卡 | ⚠️ 高风险(写/删) |
| `INV-065` | `Batch-03` | `src/ui/ClipStatusActions.svelte:60` | `Button` | 状态切换: 归档 (archived) | 弹出归档策略弹窗并归档 | ⚠️ 高风险(写/删) |
| `INV-066` | `Batch-03` | `src/ui/ClipRankControls.svelte:25` | `Button` | 优先级调节按钮 (P0~P3 循环点击) | 循环切换并写回 custom-clip-priority | ⚠️ 高风险(写/删) |
| `INV-067` | `Batch-03` | `src/ui/ClipRankControls.svelte:45` | `Select` | 星级评分调节下拉 (0~5 星) | 修改评分并写回 custom-clip-rating | ⚠️ 高风险(写/删) |
| `INV-068` | `Batch-03` | `src/ui/AuthorEditor.svelte:30` | `Input` | 作者内联编辑输入框 | 输入自定义作者姓名 | 常规(读/显) |
| `INV-069` | `Batch-03` | `src/ui/AuthorEditor.svelte:45` | `Button` | 作者建议候选人胶囊 | 一键采用推荐提取的作者姓名 | 常规(读/显) |
| `INV-070` | `Batch-03` | `src/ui/AuthorEditor.svelte:60` | `Button` | 作者保存按钮 | 写回文档 custom-clip-author 属性 | ⚠️ 高风险(写/删) |
| `INV-071` | `Batch-03` | `src/ui/AuthorEditor.svelte:70` | `Button` | 作者取消编辑按钮 | 放弃输入并关闭作者编辑框 | 常规(读/显) |
| `INV-072` | `Batch-03` | `src/ui/DockPanel.svelte:3420` | `KanbanCard` | 看板卡片拖拽把手 (Kanban Drag) | 拖动卡片跨列更新状态 | ⚠️ 高风险(写/删) |
| `INV-073` | `Batch-03` | `src/ui/LibraryBatchBar.svelte:40` | `Button` | 批量底栏: 全选/反选/取消 | 切换当前筛选条目的选中集合 | 常规(读/显) |
| `INV-074` | `Batch-03` | `src/ui/LibraryBatchBar.svelte:55` | `Button` | 批量标记稍后读 (Batch Later) | 将所有选中文档批量标记为 later | ⚠️ 高风险(写/删) |
| `INV-075` | `Batch-03` | `src/ui/LibraryBatchBar.svelte:65` | `Button` | 批量标记已读 (Batch Done) | 将所有选中文档批量标记为 done | ⚠️ 高风险(写/删) |
| `INV-076` | `Batch-03` | `src/ui/LibraryBatchBar.svelte:75` | `Button` | 批量归档 (Batch Archive) | 将所有选中文档批量归档 | ⚠️ 高风险(写/删) |
| `INV-077` | `Batch-04` | `src/ui/WorkbenchPreview.svelte:45` | `Button` | 预览分栏展开/折叠按钮 | 切换右侧预览视口显隐 | 常规(读/显) |
| `INV-078` | `Batch-04` | `src/ui/WorkbenchPreview.svelte:60` | `SplitterHandle` | 预览调宽拖拽手柄 | 拖动调整预览分栏与列表宽度占比 | 常规(读/显) |
| `INV-079` | `Batch-04` | `src/ui/WorkbenchPreview.svelte:80` | `IconButton` | 预览工具栏: 在新页签打开 (Open in Tab) | 唤起独立沉浸式阅读页签 | 常规(读/显) |
| `INV-080` | `Batch-04` | `src/ui/WorkbenchPreview.svelte:95` | `IconButton` | 预览工具栏: 全屏浮窗预览 (Popup) | 在全屏独立弹窗中阅读文章 | 常规(读/显) |
| `INV-081` | `Batch-04` | `src/ui/WorkbenchPreview.svelte:110` | `IconButton` | 预览工具栏: 关闭预览 (Close Preview) | 关闭当前预览分栏释放视口 | 常规(读/显) |
| `INV-082` | `Batch-04` | `src/ui/WorkbenchPreview.svelte:130` | `MetaCallout` | 预览元数据卡片 (Meta Callout Card) | 展示字数、时长、标签、来源与书签位置 | 常规(读/显) |
| `INV-083` | `Batch-04` | `src/ui/ProtyleHost.svelte:35` | `ProtyleContainer` | Protyle 内核编辑器挂载容器 | 渲染真实思源排版正文与交互块 | 常规(读/显) |
| `INV-084` | `Batch-04` | `src/ui/ReaderTab.svelte:120` | `Button` | 阅读页签返回读库按钮 | 关闭阅读页签回到工作台列表 | 常规(读/显) |
| `INV-085` | `Batch-04` | `src/ui/ReaderTab.svelte:140` | `Select` | 阅读器状态切换下拉 (reading/done/later/archived) | 修改当前阅读文章生命周期状态 | ⚠️ 高风险(写/删) |
| `INV-086` | `Batch-04` | `src/ui/ReaderTab.svelte:160` | `IconButton` | 阅读器打开原文链接按钮 | 在系统浏览器打开源页面 | 常规(读/显) |
| `INV-087` | `Batch-04` | `src/ui/ReaderTab.svelte:175` | `IconButton` | 折叠阅读器切换按钮 (Alt+Z / TextFold) | 进入 5 阶语义折叠视图 | 常规(读/显) |
| `INV-088` | `Batch-04` | `src/ui/ReaderTab.svelte:190` | `IconButton` | 生成思维导图脑图按钮 (Mindmap) | 提取各级标题生成脑图文档 | ⚠️ 高风险(写/删) |
| `INV-089` | `Batch-04` | `src/ui/ReaderTab.svelte:205` | `IconButton` | 长文渐进切片按钮 (Doc Slicing) | 弹出切片对话框将长文拆分阅读 | 常规(读/显) |
| `INV-090` | `Batch-04` | `src/ui/ReaderTab.svelte:220` | `IconButton` | 正文排版清洗按钮 (Format Clean) | 弹出清洗弹窗优化排版与多余空行 | 常规(读/显) |
| `INV-091` | `Batch-04` | `src/ui/ReaderSearch.svelte:30` | `Input` | 正文搜索输入框 (input[type='search']) | 实时查找正文关键词并匹配所有块 | 常规(读/显) |
| `INV-092` | `Batch-04` | `src/ui/ReaderSearch.svelte:45` | `IconButton` | 搜索上一个/下一个匹配项按钮 | 视口平滑滚动至命中段落 | 常规(读/显) |
| `INV-093` | `Batch-04` | `src/ui/ReadingPositionControls.svelte:25` | `Button` | 保存/恢复当前阅读位置书签按钮 | 记录并平滑恢复阅读百分比与块锚点 | ⚠️ 高风险(写/删) |
| `INV-094` | `Batch-04` | `src/ui/ReaderTab.svelte:260` | `TTSControls` | TTS 语音播控条 (播放/暂停/停止/语速) | 调用 Web Speech API 朗读正文文本 | 常规(读/显) |
| `INV-095` | `Batch-05` | `src/ui/ReadingContext.svelte:30` | `IconButton` | 伴生栏折叠/展开胶囊按钮 | 展开原生编辑器右下角悬浮控制台 | 常规(读/显) |
| `INV-096` | `Batch-05` | `src/ui/ReadingContext.svelte:50` | `Button` | 伴生栏: 快速标记已读 | 将当前原生文档标记为已读并打卡 | ⚠️ 高风险(写/删) |
| `INV-097` | `Batch-05` | `src/ui/ReadingContext.svelte:60` | `Button` | 伴生栏: 移至稍后读 | 将当前原生文档标记为稍后读 | ⚠️ 高风险(写/删) |
| `INV-098` | `Batch-05` | `src/ui/ReadingContext.svelte:70` | `Button` | 伴生栏: 归档当前文章 | 弹出归档对话框归档当前文档 | ⚠️ 高风险(写/删) |
| `INV-099` | `Batch-05` | `src/ui/ReadingContext.svelte:80` | `Button` | 伴生栏: 打开原文 | 在外部浏览器打开源网页 | 常规(读/显) |
| `INV-100` | `Batch-05` | `src/ui/ReadingContext.svelte:90` | `Button` | 伴生栏: 摘录制卡 | 从选区直接生成闪卡 | 常规(读/显) |
| `INV-101` | `Batch-05` | `src/ui/FoldedReaderView.svelte:40` | `SegmentedControl` | 折叠阶数切换分段 (Level 1~5 缩放) | 按数字 1~5 动态切换语义保真折叠层级 | 常规(读/显) |
| `INV-102` | `Batch-05` | `src/ui/FoldedReaderView.svelte:70` | `Button` | 段落卡片折叠/展开切换头 | 点击单个段落展开其全文内容 | 常规(读/显) |
| `INV-103` | `Batch-05` | `src/ui/FoldedReaderView.svelte:90` | `Button` | 段落定位回原块按钮 | 联动宿主 Protyle 平滑滚动并高亮该段落 | 常规(读/显) |
| `INV-104` | `Batch-05` | `src/ui/FoldedReaderView.svelte:110` | `Button` | 退出折叠阅读器按钮 | 返回完整版正文阅读排版 | 常规(读/显) |
| `INV-105` | `Batch-06` | `src/ui/ResurfaceView.svelte:80` | `Button` | 今日必读卡通栏主按钮: 开始阅读 | 直达首篇推荐文章阅读界面 | 常规(读/显) |
| `INV-106` | `Batch-06` | `src/ui/ResurfaceView.svelte:95` | `Button` | 今日必读卡: 今天略过 (Skip Today) | 从今日浮现池移除，顺延至明日 | 常规(读/显) |
| `INV-107` | `Batch-06` | `src/ui/ResurfaceView.svelte:105` | `Button` | 今日必读卡: 直接归档 (Archive) | 将该推荐文章直接归档 | ⚠️ 高风险(写/删) |
| `INV-108` | `Batch-06` | `src/ui/ResurfaceView.svelte:120` | `IconButton` | 今日必读卡: 更多动作气泡菜单 | 收纳快照、AI富化、复制著录等二级操作 | 常规(读/显) |
| `INV-109` | `Batch-06` | `src/ui/ResurfaceView.svelte:145` | `Button` | 按时间挑一篇胶囊 (5/15/30/60分钟) | 根据预估阅读时长快速筛选推荐文章 | 常规(读/显) |
| `INV-110` | `Batch-06` | `src/ui/ResurfaceView.svelte:170` | `Button` | 漫游盲盒入口按钮 (Roaming Dice) | 打开随机漫游盲盒抽屉 (openRoamingDialog) | 常规(读/显) |
| `INV-111` | `Batch-06` | `src/ui/RoamingDrawerDialog.svelte:50` | `Button` | 漫游抽屉: 换一篇抽盲盒 (Next Pick) | 重新执行加权随机算法抽取下一篇 | 常规(读/显) |
| `INV-112` | `Batch-06` | `src/ui/RoamingDrawerDialog.svelte:70` | `Button` | 漫游抽屉: 立即阅读 | 跳转打开抽中文章的正文阅读器 | 常规(读/显) |
| `INV-113` | `Batch-06` | `src/ui/RoamingDrawerDialog.svelte:85` | `Button` | 漫游抽屉: 放入稍后读 | 将抽中文章移入稍后读队列 | ⚠️ 高风险(写/删) |
| `INV-114` | `Batch-06` | `src/ui/RoamingDrawerDialog.svelte:95` | `Button` | 漫游抽屉: 归档此文 | 将抽中文章归档并不再抽选 | ⚠️ 高风险(写/删) |
| `INV-115` | `Batch-06` | `src/ui/RoamingDrawerDialog.svelte:110` | `IconButton` | 漫游抽屉: 关闭抽屉 | 关闭漫游盲盒视窗 | 常规(读/显) |
| `INV-116` | `Batch-06` | `src/ui/InboxSection.svelte:40` | `Button` | 待读流文章行点击导航 | 在列表中点击行直接打开文章 | 常规(读/显) |
| `INV-117` | `Batch-06` | `src/ui/ResurfaceView.svelte:220` | `EmptyState` | 今日重浮队列全部读完空态 (.glean-resurface-empty) | 显示今日已达标成就插画与休息提示 | 常规(读/显) |
| `INV-118` | `Batch-07` | `src/ui/HighlightView.svelte:80` | `SegmentedControl` | 批注展示模式分段 (平铺流 / 按文章聚类) | 切换批注列表是按时间平铺还是按文章折叠分组 | 常规(读/显) |
| `INV-119` | `Batch-07` | `src/ui/HighlightView.svelte:105` | `SegmentedControl` | 批注来源过滤分段 (全部 / 💬 鲸鱼批注 / 📝 原生块备注) | 按第三方批注插件或思源原生备注过滤 | 常规(读/显) |
| `INV-120` | `Batch-07` | `src/ui/HighlightView.svelte:130` | `Select` | 批注分类下拉 (全部 / 📌 置顶 / ⭐ 重要 / 📖 阅读 / ✔️ 待办 / ❓ 存疑) | 按批注标签或分类进行筛选 | 常规(读/显) |
| `INV-121` | `Batch-07` | `src/ui/HighlightView.svelte:160` | `Button` | 批注卡片: 点击金句跳转原块 | 平滑滚动到原文段落并触发脉冲高亮 | 常规(读/显) |
| `INV-122` | `Batch-07` | `src/ui/HighlightView.svelte:180` | `IconButton` | 批注卡片: 复制批注文本/块引用 | 将划线金句与批注思考复制到剪贴板 | 常规(读/显) |
| `INV-123` | `Batch-07` | `src/ui/HighlightView.svelte:210` | `IconButton` | 批注卡片: 制作金句海报 | 以当前批注为内容打开金句卡片设计弹窗 | 常规(读/显) |
| `INV-124` | `Batch-07` | `src/ui/HighlightView.svelte:230` | `Button` | 生成整篇批注汇总文档按钮 | 将该文章下所有批注整理输出为新笔记 | ⚠️ 高风险(写/删) |
| `INV-125` | `Batch-07` | `src/ui/HighlightView.svelte:250` | `EmptyState` | 暂无划线批注空态 | 提示用户划线和添加批注的方法 | 常规(读/显) |
| `INV-126` | `Batch-07` | `src/ui/QuoteCardDialog.svelte:60` | `SegmentedControl` | 海报卡片主题配色选择 (极简/羊皮纸/黑曜石/水墨) | 切换金句海报视觉样式 | 常规(读/显) |
| `INV-127` | `Batch-07` | `src/ui/QuoteCardDialog.svelte:85` | `Button` | 导出海报图片/复制图片到剪贴板 | 将 DOM 舞台渲染为高清 PNG 下载或复制 | 常规(读/显) |
| `INV-128` | `Batch-07` | `src/ui/FlashcardDialog.svelte:40` | `Textarea` | 闪卡正面/背面内容编辑框 | 编辑闪卡正面提问与背面解答 | 常规(读/显) |
| `INV-129` | `Batch-07` | `src/ui/FlashcardDialog.svelte:70` | `Button` | 确认制卡并加入牌组按钮 | 在闪卡插件或指定笔记本创建复习卡片 | ⚠️ 高风险(写/删) |
| `INV-130` | `Batch-07` | `src/ui/FlashcardRecoveryPanel.svelte:45` | `Button` | 闪卡隔离区: 扫描孤立卡片 | 扫描未绑定文章的游离闪卡 | 常规(读/显) |
| `INV-131` | `Batch-07` | `src/ui/FlashcardRecoveryPanel.svelte:65` | `Button` | 闪卡隔离区: 批量恢复关联 | 尝试根据原文块 ID 重新绑定文章 | ⚠️ 高风险(写/删) |
| `INV-132` | `Batch-08` | `src/ui/DocSlicingDialog.svelte:45` | `SegmentedControl` | 切片粒度选择 (按一级标题 / 按二级标题 / 按字数) | 解析文章大纲结构树并划分小节 | 常规(读/显) |
| `INV-133` | `Batch-08` | `src/ui/DocSlicingDialog.svelte:75` | `Button` | 切片小节项: 点击定位小节 | 平滑滚动宿主视口至对应标题块 | 常规(读/显) |
| `INV-134` | `Batch-08` | `src/ui/DocSlicingDialog.svelte:95` | `Button` | 一键拆分子文档集合按钮 | 在当前笔记本下为各小节生成独立子文档 | ⚠️ 高风险(写/删) |
| `INV-135` | `Batch-08` | `src/ui/DocSlicingDialog.svelte:110` | `Button` | 生成阅读索引目录文档按钮 | 生成带有反向链接的小节索引页 | ⚠️ 高风险(写/删) |
| `INV-136` | `Batch-08` | `src/ui/FormattingDialog.svelte:40` | `Switch` | 清洗规则: 清理无用空行开关 | 合并连续多个空白段落 | ⚠️ 高风险(写/删) |
| `INV-137` | `Batch-08` | `src/ui/FormattingDialog.svelte:55` | `Switch` | 清洗规则: 盘古之白(中英文间距空格)开关 | 汉字与英文/数字间自动补充半角空格 | ⚠️ 高风险(写/删) |
| `INV-138` | `Batch-08` | `src/ui/FormattingDialog.svelte:70` | `Switch` | 清洗规则: 微信尾部导流与广告清理开关 | 根据模式识别剔除底栏无用推广段落 | ⚠️ 高风险(写/删) |
| `INV-139` | `Batch-08` | `src/ui/FormattingDialog.svelte:90` | `Button` | 确认清洗并写回文档按钮 | 应用清洗规则并更新正文块 | ⚠️ 高风险(写/删) |
| `INV-140` | `Batch-08` | `src/ui/FormattingDialog.svelte:105` | `Button` | 取消清洗放弃修改按钮 | 关闭对话框不保存任何改动 | 常规(读/显) |
| `INV-141` | `Batch-08` | `src/ui/ContextSelectionPanel.svelte:30` | `Button` | 选区 AI 深度解释 / 生成引述摘录块 | 针对划选句子调用 AI 或追加引述 | 常规(读/显) |
| `INV-142` | `Batch-09` | `src/ui/MigrateDialog.svelte:50` | `Button` | 存量扫描按钮 (Scan Existing Docs) | 遍历全库查找旧版剪藏与非标准文档 | 常规(读/显) |
| `INV-143` | `Batch-09` | `src/ui/MigrateDialog.svelte:80` | `Button` | 开始存量属性迁移按钮 (Start Migration) | 按规则批量注入 custom-clip-* 属性 | ⚠️ 高风险(写/删) |
| `INV-144` | `Batch-09` | `src/ui/MigrateDialog.svelte:95` | `Button` | 中断迁移执行按钮 (Abort) | 安全暂停当前正在跑的批量迁移作业 | 常规(读/显) |
| `INV-145` | `Batch-09` | `src/ui/ImportDialog.svelte:40` | `SegmentedControl` | 导入格式选择 (Omnivore/Cubox/Readwise/简悦/CSV/HTML) | 切换外部数据解析器与字段映射器 | 常规(读/显) |
| `INV-146` | `Batch-09` | `src/ui/ImportDialog.svelte:70` | `Input` | 导入文件上传控件 (input[type='file']) | 选取本地导出的外部备份文件 | 常规(读/显) |
| `INV-147` | `Batch-09` | `src/ui/ImportDialog.svelte:95` | `Select` | 导入目标笔记本下拉选择器 | 选定存入文章的目标笔记本与根目录 | 常规(读/显) |
| `INV-148` | `Batch-09` | `src/ui/ImportDialog.svelte:115` | `Switch` | 智能 URL 查重策略开关 | 若已收录相同 URL 则跳过或覆盖更新 | 常规(读/显) |
| `INV-149` | `Batch-09` | `src/ui/ImportDialog.svelte:135` | `Button` | 开始导入任务按钮 (Start Import) | 解析条目并逐篇创建思源文档与属性 | ⚠️ 高风险(写/删) |
| `INV-150` | `Batch-09` | `src/ui/ArchiveDialog.svelte:45` | `SegmentedControl` | 归档策略分段 (仅标记归档 / 移动至归档笔记本) | 选择归档行为是否搬迁物理文档 | ⚠️ 高风险(写/删) |
| `INV-151` | `Batch-09` | `src/ui/ArchiveDialog.svelte:65` | `Button` | 确认归档按钮 | 执行归档动作并更新索引与属性 | ⚠️ 高风险(写/删) |
| `INV-152` | `Batch-09` | `src/ui/RestoreDialog.svelte:45` | `SegmentedControl` | 恢复策略分段 (原地恢复为稍后读 / 移回收录笔记本) | 选择文档恢复时的物理位置与状态 | ⚠️ 高风险(写/删) |
| `INV-153` | `Batch-09` | `src/ui/RestoreDialog.svelte:65` | `Button` | 确认恢复按钮 | 执行恢复动作写回属性 | ⚠️ 高风险(写/删) |
| `INV-154` | `Batch-09` | `src/ui/WeReadGuideDialog.svelte:40` | `Button` | 微信读书指引: 一键打开微信读书导入向导 | 引导用户如何将微信读书笔记迁入 | 常规(读/显) |
| `INV-155` | `Batch-09` | `src/ui/BackupPanel.svelte:40` | `Button` | 备份面板: 导出/恢复读库元数据 JSON 快照 | 备份或还原所有文章属性与阅读进度 | ⚠️ 高风险(写/删) |
| `INV-156` | `Batch-09` | `src/ui/SnapshotGovernance.svelte:45` | `Button` | 快照治理: 全库快照健康度体检 / 批量重抓 | 扫描并重新抓取离线 HTML 纯文本快照 | 常规(读/显) |
| `INV-157` | `Batch-10` | `src/ui/SettingsView.svelte:65` | `Select` | 设置: 读库锚定笔记本选择器 | 指定小驴拾遗文章默认归属的笔记本 | ⚠️ 高风险(写/删) |
| `INV-158` | `Batch-10` | `src/ui/SettingsView.svelte:85` | `Switch` | 设置: 新增剪藏自动收录开关 | 开启后自动监听并为新剪藏注入属性 | ⚠️ 高风险(写/删) |
| `INV-159` | `Batch-10` | `src/ui/SettingsView.svelte:105` | `Input` | 设置: 超期文章自动归档天数 (天) | 设置稍后读超时归档的天数阈值 | ⚠️ 高风险(写/删) |
| `INV-160` | `Batch-10` | `src/ui/SettingsView.svelte:130` | `SegmentedControl` | 设置: 默认启动视图 (每日重浮 / 读库文章) | 配置打开插件时优先呈现的默认页面 | 常规(读/显) |
| `INV-161` | `Batch-10` | `src/ui/SettingsView.svelte:150` | `Switch` | 设置: 使用沉浸式内嵌阅读页签 | 开启时点击阅读打开 ReaderTab，否则用原生页签 | 常规(读/显) |
| `INV-162` | `Batch-10` | `src/ui/SettingsView.svelte:170` | `Switch` | 设置: 自动记忆阅读位置与书签 | 滚动时自动记录当前阅读百分比 | 常规(读/显) |
| `INV-163` | `Batch-10` | `src/ui/SettingsView.svelte:190` | `Input` | 设置: 阅读速度预估基准 (字/分钟) | 调整文章预计阅读耗时的折算系数 | 常规(读/显) |
| `INV-164` | `Batch-10` | `src/ui/SettingsView.svelte:215` | `Switch` | 设置: 离线快照自动抓取开关 | 新文章入库时是否自动抓取纯文本快照 | 常规(读/显) |
| `INV-165` | `Batch-10` | `src/ui/SettingsView.svelte:240` | `Select` | 设置: AI 提供商通道 (思源内置 / 自定义接口) | 切换 AI 调用后端与密钥读取路径 | ⚠️ 高风险(写/删) |
| `INV-166` | `Batch-10` | `src/ui/SettingsView.svelte:260` | `Switch` | 设置: 自动 AI 富化开关 | 新文章入库时是否后台自动生成摘要与标签 | ⚠️ 高风险(写/删) |
| `INV-167` | `Batch-10` | `src/ui/SettingsView.svelte:280` | `Input` | 设置: 每日 AI 富化限额 (篇) | 防止超出用户大模型 Token 额度上限 | 常规(读/显) |
| `INV-168` | `Batch-10` | `src/ui/SettingsView.svelte:305` | `Switch` | 设置: 小驴打卡生态联动开关 | 读完文章时自动向打卡项目发送打卡记录 | 常规(读/显) |
| `INV-169` | `Batch-10` | `src/ui/SettingsView.svelte:320` | `Input` | 设置: 小驴打卡项目 ID 输入框 | 绑定打卡插件的项目唯一标识 | 常规(读/显) |
| `INV-170` | `Batch-10` | `src/ui/SettingsView.svelte:340` | `Switch` | 设置: 微信公众号智能识别开关 | 自动从微信剪藏正文中提取公众号作者 | 常规(读/显) |
| `INV-171` | `Batch-10` | `src/ui/SettingsView.svelte:370` | `Button` | 设置: 恢复所有设置默认值按钮 | 带二级防误触的配置重置 (Reset Defaults) | ⚠️ 高风险(写/删) |
| `INV-172` | `Batch-10` | `src/ui/OnboardingDialog.svelte:60` | `Button` | 新手引导: 步骤向导「下一步/上一步」按钮 | 流转至下一向导步骤或返回 | 常规(读/显) |
| `INV-173` | `Batch-10` | `src/ui/OnboardingDialog.svelte:100` | `Button` | 新手引导: 完成引导/跳过引导按钮 | 标记引导完成并初次打开工作台 | 常规(读/显) |
| `INV-174` | `Batch-10` | `src/ui/AiBatchPanel.svelte:45` | `Button` | AI 批量处理: 启动/停止批量富化任务 | 排队对未富化文章依次执行 AI 提要 | ⚠️ 高风险(写/删) |
| `INV-175` | `Batch-10` | `src/ui/AiTagMergePanel.svelte:50` | `Button` | AI 标签合并: 确认同义标签归并 | 将语义相近的多个标签统一合并更新至各文档 | ⚠️ 高风险(写/删) |
