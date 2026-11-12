# SIYUAN-INTEGRATION-VERIFICATION — 小驴拾遗与思源本体联动实测报告

> **实测环境**：思源笔记 v3.8.9 内核 / Windows 10 x64 / Chrome CDP 靶场  
> **验证基线**：v1.4.3 生产构建产物 (`dist/`)  
> **实测时间**：2026-11-01  
> **责任范围**：逐条实测思源联动 9 大核心项，绝不写“已支持联动”等空泛词汇，给出代码与内核行为实测结论。

---

## 逐条实测结论清单

### 1. 从文档拖拽内容进入插件是否正常
- **代码实现位置**：`src/ui/DockPanel.svelte` (看板拖拽 `ondragstart` / `ondragover` / `ondrop`)
- **联动实测结果**：**部分满足（仅内部看板拖拽就绪，外部拖入暂未设 DropZone）**
- **实测详细过程与机制**：
  - 插件内部看板（`.glean-kanban__column`）具备完整的 HTML5 拖拽事件捕获，支持将卡片在“新剪藏 → 稍后读 → 阅读中 → 已读 → 归档”列之间拖曳，并能正确触发状态写回与属性更新。
  - 从原生文档编辑器中鼠标划选一段文字直接拖拽至小驴拾遗侧边栏或工作台面板时，由于插件容器未注册外部文本或块 ID 的全局 `drop` 事件捕获器，浏览器/宿主默认不接收放置，无法自动触发“拖入即收录”。
  - 目前推荐的工作流是：在编辑器选区右键唤起「小驴拾遗：制作闪卡/摘录」或「加入读库」，或按快捷键 `⌥⌘G` / `Ctrl+Alt+G`，体验更稳定无误触。
- **改进建议**：已记入候选功能清单（FC-001：侧边栏支持从编辑器拖入段落块快速收录/制卡）。

### 2. 插件结果能否写回文档、块或块属性，写回后格式是否被破坏
- **代码实现位置**：`src/services/clip-store.ts` (`writeClip`, `setBlockAttrs`)、`src/api/client.ts` (`/api/attr/setBlockAttrs`)
- **联动实测结果**：**完全正常，格式 100% 保真**
- **实测详细过程与机制**：
  - 插件所有文章状态（`custom-clip-status`、`custom-clip-priority`、`custom-clip-rating`、`custom-clip-author` 等）一律通过思源官方的 `/api/attr/setBlockAttrs` 写入根文档属性。
  - 块级引述写入使用 `src/services/excerpt-service.ts` 调用官方 `/api/block/insertBlock`，以思源标准 Kramdown 节点格式插入（Callout 提示块与 Blockquote 引述块）。
  - 检查写入后的正文 DOM 与底层 markdown 文件，原文标题、段落、列表、代码块、图片等语法树均未发生任何形变或空格断裂，完全符合“数据主权（D-0001）”铁律。

### 3. 通过块标识跳转时能否正确定位并滚动到位
- **代码实现位置**：`src/libs/read-point-observer.ts` (`scrollAndPulseReadPoint`)、`src/ui/ReaderTab.svelte` (`scrollToHighlight`, `scrollToOutline`)
- **联动实测结果**：**完全正常，定位精准并伴随闪烁动效**
- **实测详细过程与机制**：
  - 批注、大纲或阅读书签在点击时，传入具体的思源 22 位 `blockId`；
  - 核心定位方法执行 `host.querySelector('[data-node-id="' + blockId + '"]')`；
  - 命中后执行 `target.scrollIntoView({ block: "center", behavior: "smooth" })`，同时向该块追加 `.glean-read-point--active` CSS 动画类，触发宿主边框脉冲高亮 1.6 秒；
  - 当跳转跨越视口或位于内嵌阅读器时，`scrollAndPulseReadPoint` 能正确兼容未完全加载的动态段落。

### 4. 生成的引用与反向链接是否正常建立
- **代码实现位置**：`src/ui/ActionPopover.svelte` (`((blockId 'title'))`)、`src/domain/citation.ts`、`src/domain/doc-slicing.ts`
- **联动实测结果**：**完全正常，反向链接实时在思源面板建立**
- **实测详细过程与机制**：
  - 复制块引用时生成标准思源语法 `((20261031120000-xxxxxxx '文章标题'))`；
  - 在大纲与切片文档中生成的双向引用块，写回思源后，思源内核的后台解析器即刻在本地 SQLite `refs` 索引表中登记引用关系；
  - 打开目标文章时，原生思源底部的「反向链接」或悬浮窗能实时列出切片文档和批注引述的来源块。

### 5. 编辑器内插入的块能否正常渲染、编辑与再次打开
- **代码实现位置**：`src/services/excerpt-service.ts` (`insertQuoteExcerpt`)、`src/services/doc-slicing-service.ts`
- **联动实测结果**：**完全正常，原生编辑器无缝支持编辑与二次重开**
- **实测详细过程与机制**：
  - 摘录生成的引述块，采用标准 Kramdown 规范：`> [!NOTE]\n> 引述内容\n> ((blockId '来源出处'))`；
  - 在原生 Protyle 编辑器中插入后，能够即刻渲染为带样式的提示块，光标点击即可直接增删改查；
  - 关闭页签并重新打开该文档，块样式和双链依然完整，没有任何未闭合标签或损坏块导致的解析白屏。

### 6. 文档变化时插件内的展示是否同步更新
- **代码实现位置**：`src/index.ts` (`onDataChanged`, `notifyDataChanged`)、`src/ui/DockPanel.svelte` (`reload`)
- **联动实测结果**：**完全正常，事件驱动双向同步刷新**
- **实测详细过程与机制**：
  - 当插件自身修改文档属性时，立即在 `document` 与 `window` 上派发 `glean:data-changed` 和 `lv-glean:data-changed` 自定义事件；
  - 当外部其他插件或云同步（`sync-end` / `onDataChanged`）修改文档时，插件接住通知并平滑调用 `reload()` 刷新内存索引；
  - 工作台列表、卡片、重浮视图与统计图表均可就地响应，无需用户手动按 F5 刷新。

### 7. 同一文档在多窗口或多标签下状态是否一致
- **代码实现位置**：`src/index.ts` (`pendingReaderDocIds`, `pendingLibraryDocIds`)、`src/services/clip-store.ts`
- **联动实测结果**：**完全正常，以底层文档属性为单一事实源**
- **实测详细过程与机制**：
  - 插件不把核心状态存储在单实例内存私有变量中，所有文章状态唯一事实源为文档自身的属性；
  - 当在多窗口或分屏下操作时，A 窗口修改了状态（如标记为 done），思源内核广播 Block 更新，B 窗口收到通知后重新载入属性，呈现的状态与 A 窗口完全一致；
  - `ReaderTab` 与 `DockPanel` 打开新页签时，各自维护独立的 `tabId` 与防并发 `requestGeneration`，避免了多页签相互抢占焦点。

### 8. 插件内操作是否进入思源历史记录并可撤销
- **代码实现位置**：`src/services/clip-store.ts`、`src/api/client.ts`
- **联动实测结果**：**正文块编辑可撤销；文档属性修改不进思源 Ctrl+Z 历史栈（思源内核自身设计）**
- **实测详细过程与机制**：
  - **正文块插入（如引述块、格式化清洗、切片大纲）**：通过思源 block 接口注入，受思源编辑器事务管理器管理，用户在编辑器中按 `Ctrl+Z` 可撤销该块的插入。
  - **文章元数据属性（custom-clip-*）修改**：通过 `/api/attr/setBlockAttrs` 写入。根据思源内核底层的架构设计，属性变更不记录在编辑器的 Undo 事务栈中，因此在思源正文中按 `Ctrl+Z` 无法直接撤回属性更改。
  - **业务层兜底闭环**：插件在界面层设计了逆向操作通道，例如归档操作配有「恢复（Restore）」对话框，稍后读/已读可随时反向切换回原状态。

### 9. 插件生成的内容在导出或分享时是否仍正常
- **代码实现位置**：`src/domain/markdown-export.ts`、`src/services/library-export-service.ts`
- **联动实测结果**：**完全正常，标准 Markdown / PDF 导出无畸形**
- **实测详细过程与机制**：
  - 插件本身提供的 Markdown 导出功能提取纯粹的 YAML Frontmatter 与 Kramdown 正文，不含有任何专有私有标签；
  - 使用思源本体的「导出为 Markdown」或「导出为 PDF」功能时，插件生成的引述块、切片文档完全按照思源标准的样式渲染并打印，不会出现样式丢失、乱码或标签溢出。
