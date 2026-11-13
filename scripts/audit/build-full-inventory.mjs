import fs from "fs";
import path from "path";
import fg from "fast-glob";

const inventory = [];
let seq = 1;

function addItem({ module, location, type, label, action, risk = "normal" }) {
  const id = `INV-${String(seq++).padStart(3, "0")}`;
  inventory.push({ id, module, location, type, label, action, risk });
  return id;
}

// ==========================================
// 模块 1: 宿主集成与全局导航 (Host & Navigation)
// ==========================================
const mod1 = "宿主集成与全局导航";
addItem({ module: mod1, location: "src/index.ts:365", type: "IconButton", label: "顶栏图标 (iconGleanWheat)", action: "点击打开工作台页签 (openPanel)", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:166", type: "DockIcon", label: "Dock栏侧栏图标 (iconGleanWheat)", action: "展开/聚焦侧边栏面板 (toggleDockSidebar)", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:193", type: "Command", label: "命令面板: 打开工作台 (cmd.openPanel)", action: "唤起工作台页签 (默认快捷键 ⌥⌘G / Ctrl+Alt+G)", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:200", type: "Command", label: "命令面板: 继续阅读 (cmd.continueReading)", action: "定位并接续上一篇阅读中的文章", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:225", type: "Command", label: "命令面板: 加入读库 (cmd.addToList)", action: "将当前编辑器根文档加入读库并写属性", risk: "high" });
addItem({ module: mod1, location: "src/index.ts:230", type: "Command", label: "命令面板: 打开迁移 (cmd.openMigrate)", action: "打开存量剪藏属性迁移向导", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:235", type: "Command", label: "命令面板: 摘录制卡 (cmd.makeCard)", action: "从当前选区制作金句卡片或闪卡", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:241", type: "Command", label: "命令面板: 标记已读 (cmd.markDone)", action: "当前文档标记为 done 并触发打卡桥", risk: "high" });
addItem({ module: mod1, location: "src/index.ts:242", type: "Command", label: "命令面板: 下一篇待读 (cmd.readNext)", action: "自动挑选并跳转下一篇未读文章", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:243", type: "Command", label: "命令面板: 移入稍后读 (cmd.markLater)", action: "当前文档标记为 later 稍后读", risk: "high" });
addItem({ module: mod1, location: "src/index.ts:244", type: "Command", label: "命令面板: 归档当前文章 (cmd.archiveCurrent)", action: "打开归档确认弹窗进行归档", risk: "high" });
addItem({ module: mod1, location: "src/index.ts:245", type: "Command", label: "命令面板: 打开原文链接 (cmd.openSource)", action: "外部浏览器打开文章 sourceUrl", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:246", type: "Command", label: "命令面板: 选区摘录引述块 (cmd.excerptQuote)", action: "在原文当前段落下方插入引述块", risk: "high" });
addItem({ module: mod1, location: "src/index.ts:247", type: "Command", label: "命令面板: 阅读动作快捷键帮助 (cmd.readerHelp)", action: "弹窗显示阅读动作和快捷键说明", risk: "normal" });

addItem({ module: mod1, location: "src/index.ts:935", type: "MenuItem", label: "编辑器右键菜单: 制作闪卡/摘录 (glean-make-card)", action: "将选中文本转换为金句卡片预览", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:951", type: "MenuItem", label: "编辑器右键菜单: 加入读库 (glean-add-to-library)", action: "收录当前文档为读库条目并触发 AI 富化", risk: "high" });
addItem({ module: mod1, location: "src/index.ts:895", type: "MenuItem", label: "收集箱右键菜单: 迁入读库 (glean-inbox-migrate)", action: "批量将思源收集箱碎片迁入读库", risk: "high" });

addItem({ module: mod1, location: "src/index.ts:870", type: "ProtocolHandler", label: "自定义协议 URL: siyuan://plugins/siyuan-glean", action: "解析 action 路由至工作台/设置/阅读等子页面", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:1007", type: "AgentTool", label: "智能体工具: list_unread", action: "思源 AI 列出未读文章清单", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:1037", type: "AgentTool", label: "智能体工具: archive_stale", action: "思源 AI 批量归档超期文章", risk: "high" });
addItem({ module: mod1, location: "src/index.ts:1066", type: "AgentTool", label: "智能体工具: weekly_digest", action: "思源 AI 生成周度阅读摘要与统计", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:315", type: "EcosystemBridge", label: "小驴雷切生态桥 (registerRaikiriModuleSafely)", action: "向雷切工作台注册待读流小组件", risk: "normal" });
addItem({ module: mod1, location: "src/index.ts:342", type: "EventListener", label: "闪卡复习联动 (lv-cards:reviewed / lv-exam:stats)", action: "接收外部闪卡复习事件并就地刷新", risk: "normal" });

console.log("Module 1 built:", seq - 1);
