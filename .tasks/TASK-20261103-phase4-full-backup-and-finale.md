# [TASK-20261103-phase4-full-backup-and-finale] 小驴拾遗 · 第四阶段：全家桶一键联合灾备与终局闭环工单

- **任务状态**: `completed`
- **目标插件**: `小驴拾遗 (siyuan-glean)`
- **核心库源**: `src/libs/lv-notice-kit.ts` (已升级至 Protocol v1.3.0 终局版)
- **标准协议**: Epoch 7 Phase 4 · 全生态联合灾备与自省闭环

---

## 一、 第四阶段核心改造目标

1. **全家桶一键联合灾备切面 (lvBackup)**：
   - 换机或备份时，用户可在任意小驴插件一键导出/导入全生态总包；
   - 本插件只需在 `onload` 中向总线登记备份生成与恢复函数：
     ```typescript
     this.backupCleaner = lvBackup.register(
         "siyuan-glean",
         async () => this.dumpData(),
         async (data) => this.restoreData(data)
     );
     ```
   - 在 `onunload` 时调用 `this.backupCleaner?.()` 干净注销。
2. **全生态健康自省与指示徽章 (lvEcosystem)**：
   - 在本插件的设置页或状态概览底部，嵌入调用 `lvEcosystem.getStatusBadgeText()`；
   - 动态呈现极精致的状态胶囊：`🐴 小驴全家桶协同正常 · 8 插件已联结 · 今日活动 12 项`。

---

## 二、 本插件专属改造重点

1. **注册全生态灾备切面 (lvBackup)**：注册剪藏规则、分类标签与剪藏索引数据的备份与还原切面；
2. **设置页展示协同指示器**：在关于/设置页底部展示 lvEcosystem.getStatusBadgeText()。

---

## 三、 质量门禁与验收标准

1. **类型检查**：运行 `pnpm run check` 或 `tsc --noEmit`，确保 0 报错；
2. **测试门禁**：运行 `pnpm test` 确保全量测试通过；
3. **任务状态回写**：完成后将首行 `- **任务状态**: `pending`` 改为 `completed`；
4. **严格本地提交**：Conventional Commit 规范（如 `feat(finale): integrate lvBackup and lvEcosystem for phase 4`），**严禁 git push**。
