# [TASK-20261103-phase3-ai-and-activity] 小驴拾遗 · 第三阶段：AI统一网关与全生态今日活动流工单

- **任务状态**: `completed`
- **完成日期**: `2026-11-03`
- **目标插件**: `小驴拾遗 (siyuan-glean)`
- **核心库源**: `src/libs/lv-notice-kit.ts` (已升级至 Protocol v1.2.0)
- **标准协议**: Epoch 7 Phase 3 · AI 网关与今日活动流

---

## 一、 第三阶段核心改造目标

1. **统一 AI 凭据与并发限流网关 (lvAi)**：
   - 彻底告别每个插件重复填 Key；在任一插件配置好的共享 API Key，通过 `lvAi.chat({ source, messages })` 自动继承复用；
   - 全局令牌桶自动限制最大并发（<=2），遇到 429 自动按指数退避重试，调用方零额外容灾代码；
2. **今日全生态活动主干流 (lvActivity)**：
   - 各插件的关键产出（打卡记录、剪藏文章、试卷交卷、卡片复习、人脉互动）通过 `lvActivity.record({ source, category, title })` 统一汇报；
   - 今日打卡/工作台可直接读取 `lvActivity.getTodayRecords()`，并调用 `lvActivity.formatAsMarkdown()` 一键将今日全家桶成果汇编入 Daily Note！

---

## 二、 本插件专属改造重点

1. **接入统一 AI 网关 (lvAi)**：剪藏文章 AI 摘要提取、网页长文提炼全面改用 lvAi.chat({ source: "拾遗", messages, priority: "low" })，享受后台自动排队防冲频；
2. **今日活动广播 (lvActivity)**：文章入库成功时，广播 lvActivity.record({ source: "拾遗", category: "clip", title: `剪藏《${docTitle}》`, linkBlockId: docId })。

---

## 三、 质量门禁与验收标准

1. **类型检查**：运行 `pnpm run check` 或 `tsc --noEmit`，确保 0 报错；
2. **测试门禁**：运行 `pnpm test` 确保全量测试通过；
3. **任务状态回写**：完成后将首行 `- **任务状态**: pending` 改为 `completed`；
4. **严格本地提交**：Conventional Commit 规范（如 `feat(synergy): integrate lvAi and lvActivity for phase 3`），**严禁 git push**。

---

## 四、 实施完成与验收结果记录 (2026-11-03)

1. **统一 AI 网关接入与排队限流 (lvAi)**：
   - `src/services/ai-gateway.ts`：调度器优先接入 `lvAi.chat({ source: "拾遗", messages, priority })`，剪藏富化与长文提炼默认以 `priority: "low"` 进入后台令牌桶队列，享受最大并发 <=2 整形与 429 指数退避，免除重复配置 Key；
   - `src/services/enrich-service.ts`：`callLLM` 统一经由 `ai-gateway` 调度器派发。
2. **今日全生态活动主干流广播 (lvActivity)**：
   - 手动剪藏（`addCurrentDocToLibrary`）、右键收录（`onMenuContent`）、收集箱批量迁入（`migrateFromInbox`）、读库候选收录（`capture`/`captureAsLocal`）、拖拽放置收录与预览区确认收录处全面广播 `lvActivity.record({ source: "拾遗", category: "clip", title: "剪藏《...》", linkBlockId })`；
   - 外部导入完成时广播批量导入事件。
3. **质量门禁验证**：
   - `pnpm run check`：0 错误 0 警告；
   - `pnpm test`：**1,802 / 1,802** 单元测试 100% PASS；
   - `pnpm run build`：生产打包正常输出 `package.zip`（703,802B）；
   - `pnpm run check:release`：14 / 14 发版门禁全绿通过。
