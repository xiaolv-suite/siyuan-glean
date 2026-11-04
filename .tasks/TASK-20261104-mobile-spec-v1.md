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

---

## 二、 质量门禁与验收结果

1. **类型与模板检查**：
   - `pnpm run check` 结果：`svelte-check found 0 errors and 0 warnings`。
2. **测试门禁**：
   - `pnpm test` 全量单测通过：`1811 / 1811 PASS`，0 失败。
3. **国际化守门**：
   - `node --test tests/i18n.test.ts` 5/5 全绿，双语文案完全一致。
4. **架构守门**：
   - `node --test tests/architecture.test.ts` 4/4 全绿，分层依赖与规范 100% 遵守。
5. **本地闭环**：
   - 严格本地 commit，严禁 git push，`onunload` 严禁写入 petal。
