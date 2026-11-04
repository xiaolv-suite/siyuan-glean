# [TASK-20261104-mobile-spec-v1] 小驴拾遗 · 手机端完整开发 Mobile Spec v1 工单

- **任务状态**: `completed`
- **目标插件**: `小驴拾遗 (siyuan-glean)`
- **核心套件源**: `src/libs/lv-notice-kit.ts` (Protocol v1.6.0 Mobile Standard)
- **标准协议**: Epoch 7 Phase 5/7 Mobile Spec v1

---

## 一、 规范与设计落地

1. **入口统一**：
   - 移除 `onLayoutReady` 中 `if (this.isMobile) return;` 阻断，改挂载 `this.mobileEntryCleaner = lvLaunchpad.ensureMobileEntry()`（罗盘顶栏+悬浮球双入口），在 `onunload` 中注入清理函数彻底注销。
2. **手机极速二级行动重构**：
   - 将 `lvLaunchpad.register` 中的 actions 重构为 4 项高频手机直办动作：`["今日阅读池", "继续上次阅读", "稍后读收件箱", "剪藏剪贴板内容"]`。
   - `handleQuickAction` 相应处理并在触发成功时调用 `lvLaunchpad.haptic(10)` 轻触感反馈。
3. **穿透搜索覆盖高频实体**：
   - `lvOmnisearch.registerProvider` 覆盖剪藏与待读实体（包含 category 与直达跳转）。
4. **手机自有面板全屏形态**：
   - 移动端唤起面板采用 100vw/100dvh 全屏 Dialog（`glean-mobile-fullscreen-dialog`），适配 safe-area，触控目标 ≥44px，支持顶部下滑手势关闭。
5. **手机阅读五态快捷悬浮条**：
   - 实现 `src/ui/MobileReadingBar.svelte`，在移动端原生查看器（Protyle）底部注入毛玻璃单手流转快捷条（稍后/进行/读完/归档），触控目标 ≥44px，适配 `safe-area-inset-bottom`，成功流转调 `lvLaunchpad.haptic(10)`。
6. **阅读页字号与行距快捷调节（Aa 弹层）**：
   - 内置 Aa 排版弹层，提供正文字号（12-28px）与行距（1.3-2.3）拖动条滑块，拖动实时通过 CSS 变量应用到 Protyle 容器，并在 `UiPrefs.mobileReaderAppearance` 中持久化存储。
7. **智能键盘避让**：
   - 接入 `mobile-viewport.ts`，检测到软键盘弹出或输入框聚焦时自动平滑收起五态快捷条，避免遮挡输入光标。
27	
28	---
29	
30	## 二、 第二轮真机教训审计与专项深化落地
31	
32	1. **Esc-only 关闭面审计**：
33	   - 审计思源手机端原生 Dialog 宿主无关闭按钮的问题，在 `simpleDialog` 中检测当 `isMobileFrontend() || isFullscreen` 且缺少 `.b3-dialog__close` 时，主动补齐可见的 44px ✕ 关闭按钮；
34	   - 在全屏面板 `glean-mobile-topbar` 首页麦穗图标开启直接退出 Dialog 交互，彻底杜绝无 Esc 键无法关闭的问题。
35	2. **焦点移除卡死审计**：
36	   - 重构 `MobileReadingBar.svelte` 键盘收起与避让逻辑，彻底摒弃不稳定的 `focusout`（Chromium 在元素移除时不派发 `focusout` 的通病），改为实时读取 `document.activeElement` 与 `isInputElement` 判定，结合 `MutationObserver` 监听 DOM 移除事件与销毁钩子主动复位，根治卡死。
37	3. **svgIcon 逐字一致性**：
38	   - 确认 `lvLaunchpad.register` 中的 `svgIcon: "icon-lv-glean"` 与 `addIcons` 中注入的真实 symbol id 逐字精确一致。
39	4. **阅读进度跨端双向同步**：
40	   - 落地 `resolveLatestReadingPosition` 纯函数，手机与桌面双向比对并取较晚时间戳；
41	   - 退出阅读时自动暂存并写回断点；
42	   - 跨端进度恢复时在五态条弹出淡雅微提示「已同步至 xx%」（3 秒后自动淡出）。
43	5. **五态条长按说明气泡**：
44	   - 按钮长按 400ms 触发触感（`haptic(15)`）并向上弹出状态说明气泡（稍后=想读未读 / 进行=正在读 / 读完=已完成 / 归档=知识封存），替代移动端无 hover 的缺陷，2.6 秒自动隐退。
45	6. **阅读池下拉 60px 刷新手势**：
46	   - `ResurfaceView.svelte` 容器顶部实现触摸下拉刷新（触控阻尼计算、拉满 60px 触发触感震动反馈、旋转指示器动态展开、松手自动触发刷新）。
47	7. **弱网容错待同步队列**：
48	   - 新增 `src/services/clip-sync-queue.ts`，剪藏因网络超时失败时自动进入 `glean_pending_clip_queue` 本地离线队列，网络恢复或切回前台时静默自动重试并上报，成功后 inline 打勾。
49	
50	---
51	
52	## 三、 质量门禁与验收结果
53	
54	1. **类型与模板检查**：
55	   - `pnpm run check` 结果：`svelte-check found 0 errors and 0 warnings`。
56	2. **测试门禁**：
57	   - `pnpm test` 全量单测通过：`1816 / 1816 PASS`，0 失败全部通过。
58	3. **国际化守门**：
59	   - `node --test tests/i18n.test.ts` 5/5 全绿，双语文案完全一致。
60	4. **架构守门**：
61	   - `node --test tests/architecture.test.ts` 4/4 全绿，分层依赖与规范 100% 遵守。
62	5. **本地闭环**：
63	   - 严格本地 commit，严禁 git push，`onunload` 严禁写入 petal。
