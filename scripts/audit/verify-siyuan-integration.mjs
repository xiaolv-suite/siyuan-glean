import fs from "fs";

// 检查思源联动相关实现
console.log("Analyzing Siyuan Integration implementations...");

// 1. 拖拽行为
// 检查 DockPanel 与 看板拖拽实现
const dockContent = fs.readFileSync("src/ui/DockPanel.svelte", "utf8");
const hasDragDrop = dockContent.includes("ondragstart") || dockContent.includes("ondrop");
console.log("1. Drag & Drop in DockPanel:", hasDragDrop);

// 2. 块属性写回
const clipStore = fs.readFileSync("src/services/clip-store.ts", "utf8");
const hasSetBlockAttrs = clipStore.includes("/api/attr/setBlockAttrs");
console.log("2. SetBlockAttrs implemented in clip-store:", hasSetBlockAttrs);

// 3. 块定位与平滑滚动
const protyleCtrl = fs.readFileSync("src/libs/protyle-controller.ts", "utf8");
const hasScrollAndPulse = protyleCtrl.includes("scrollAndPulseReadPoint") || protyleCtrl.includes("scrollIntoView");
console.log("3. Scroll and pulse block navigation:", hasScrollAndPulse);

// 4. 反向链接与块引用
const actionPopover = fs.readFileSync("src/ui/ActionPopover.svelte", "utf8");
const hasBlockRef = actionPopover.includes("((") && actionPopover.includes("))");
console.log("4. Block ref syntax ((id 'title')) in ActionPopover:", hasBlockRef);

// 5. 块插入与渲染
const excerptService = fs.readFileSync("src/services/excerpt-service.ts", "utf8");
const hasInsertBlock = excerptService.includes("insertBlock") || excerptService.includes("/api/block/insertBlock");
console.log("5. InsertBlock in excerptService:", hasInsertBlock);

// 6. 文档变化同步
const indexTs = fs.readFileSync("src/index.ts", "utf8");
const hasDataChanged = indexTs.includes("onDataChanged") && indexTs.includes("glean:data-changed");
console.log("6. onDataChanged and event dispatching in index.ts:", hasDataChanged);

// 7. 多窗口/标签一致性
const hasMultiTab = indexTs.includes("pendingReaderDocIds") && indexTs.includes("openTab");
console.log("7. Multi-window / tab target isolation in index.ts:", hasMultiTab);

// 8. 历史记录与撤销 (Transactions)
const hasTransactions = clipStore.includes("/api/transactions");
console.log("8. Transactions API used in clip-store (for undo):", hasTransactions);

// 9. 导出与分享
const exportService = fs.readFileSync("src/services/library-export-service.ts", "utf8");
console.log("9. Markdown/CSV export service exists:", exportService.length > 0);
