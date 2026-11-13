import fs from "fs";
import path from "path";
import fg from "fast-glob";

const svelteFiles = await fg(["src/ui/*.svelte"]);
const indexContent = fs.readFileSync("src/index.ts", "utf8");

const items = [];
let idCounter = 1;

function makeId() {
  const num = String(idCounter++).padStart(3, "0");
  return `INV-${num}`;
}

// 1. Scan src/index.ts
// Topbar
items.push({
  id: makeId(),
  module: "宿主集成与全局导航",
  location: "src/index.ts:365",
  type: "IconButton",
  label: "顶栏图标 (iconGleanWheat)",
  action: "点击打开小驴拾遗主工作台页签 (openPanel)",
  state: "ready"
});
items.push({
  id: makeId(),
  module: "宿主集成与全局导航",
  location: "src/index.ts:166",
  type: "DockIcon",
  label: "Dock栏图标 (iconGleanWheat)",
  action: "点击展开/聚焦小驴拾遗侧边栏面板 (DockPanel)",
  state: "ready"
});

// Commands
const cmdMatches = [...indexContent.matchAll(/addCommand\(\{\s*langKey:\s*"([^"]+)",(?:[\s\S]*?callback:\s*([^,}]+))?/g)];
for (const m of cmdMatches) {
  items.push({
    id: makeId(),
    module: "宿主集成与全局导航",
    location: "src/index.ts",
    type: "Command",
    label: `命令面板: ${m[1]}`,
    action: `触发动作回调 ${m[2]?.trim() || "callback"}`,
    state: "ready"
  });
}

// Context menus
items.push({
  id: makeId(),
  module: "宿主集成与全局导航",
  location: "src/index.ts:935",
  type: "MenuItem",
  label: "编辑器右键菜单: 制作闪卡/摘录 (glean-make-card)",
  action: "获取当前选区文字并打开金句卡片预览 (makeQuoteCardPreview)",
  state: "ready"
});
items.push({
  id: makeId(),
  module: "宿主集成与全局导航",
  location: "src/index.ts:951",
  type: "MenuItem",
  label: "编辑器右键菜单: 加入读库 (glean-add-to-library)",
  action: "捕获当前根文档并写入 custom-clip-* 属性，自动触发 AI 富化",
  state: "ready"
});
items.push({
  id: makeId(),
  module: "宿主集成与全局导航",
  location: "src/index.ts:895",
  type: "MenuItem",
  label: "收集箱右键菜单: 迁入读库 (glean-inbox-migrate)",
  action: "迁移选中收集箱简记到锚定笔记本并设置属性",
  state: "ready"
});

// Siyuan URL protocol
items.push({
  id: makeId(),
  module: "宿主集成与全局导航",
  location: "src/index.ts:870",
  type: "ProtocolHandler",
  label: "URL 协议路由: siyuan://plugins/siyuan-glean",
  action: "解析 action 参数并路由到 workbench/library/resurface/highlights/stats/settings/open/capture",
  state: "ready"
});

// Agent tools
items.push({
  id: makeId(),
  module: "宿主集成与全局导航",
  location: "src/index.ts:1007",
  type: "AgentTool",
  label: "思源智能体工具: list_unread",
  action: "查询并结构化返回前 50 篇未读文章",
  state: "ready"
});
items.push({
  id: makeId(),
  module: "宿主集成与全局导航",
  location: "src/index.ts:1037",
  type: "AgentTool",
  label: "思源智能体工具: archive_stale",
  action: "将超过设定天数未读的文章批量归档",
  state: "ready"
});
items.push({
  id: makeId(),
  module: "宿主集成与全局导航",
  location: "src/index.ts:1066",
  type: "AgentTool",
  label: "思源智能体工具: weekly_digest",
  action: "汇总本周阅读指标、主题分布与完成名单",
  state: "ready"
});

console.log("Index scanned, total items so far:", items.length);
