# [TASK-20261030-textfold-reading-core] 小驴拾遗 · 5 阶语义折叠交互阅读器 (Folded Reader)

- **任务状态**: `completed`
- **目标组件**: `FoldedReaderView.svelte`, `src/domain/folded-reader.ts`, `src/services/folded-reader-service.ts`
- **设计哲学**: 借鉴 GitHub 优秀标杆 `chenxiachan/textfold` 的“保真优先，拒绝虚构重写 (Fidelity over AI Rewriting)”哲学。

## 核心任务要求
1. **数据契约（领域层纯函数）**：
   - 定义 `FoldLevel (1 | 2 | 3 | 4 | 5)` 与 `FoldNode` 数据结构。
   - 保证每个折叠节点严格锚定思源段落 `blockId`。
   - Level 2 (`brief`) 必须 100% 逐字摘自原文（Verbatim Guard 强制检验），严禁 AI 幻觉重写。
   - 支持从块列表生成结构化折叠节点，并支持全局及单节点展开/折叠。
2. **交互与动效（UI / UX-PRO-MAX）**：
   - 数字键 `1`~`5` 全局折叠层级切换（Level 1 全文 -> Level 2 逐字金句 -> Level 3 论点支撑 -> Level 4 单行要旨 -> Level 5 概念卡片）。
   - 单段卡片点击独立展开/折叠，平滑过渡动效。
   - 双栏联动：点击折叠卡片平滑滚动并高亮联动思源 Protyle 原文块。
   - WAI-ARIA `radiogroup`/`radio` 层级选择器，WCAG 2.2 AA 高对比度与移动端触控（>=44px）适配。
3. **门禁闭环**：
   - `pnpm check:types` 与 `pnpm check:svelte` 零错误零警告。
   - 增加 `tests/folded-reader.test.ts` 单元测试，覆盖 5 阶折叠模型、Verbatim 保真校验与键盘流转。
   - 全量 `pnpm test` 100% 通过（1,760 / 1,760 PASS）。

## 交付与验证记录
- 领域层 `src/domain/folded-reader.ts`：纯函数层严守单向依赖，实现 `isVerbatimSubstring` 保真检验、`extractVerbatimBrief`、`createFoldNode`、`parseBlocksToFoldNodes`、`applyGlobalFoldLevel` 与 `toggleNodeFold`。
- 服务层 `src/services/folded-reader-service.ts`：内核块解析与清洗，支持直接从 `listChildBlocks` 提取真实思源段落块，降级备用 `exportMdContent`。
- 交互层 `src/ui/FoldedReaderView.svelte` 与 `src/styles/components/folded-reader.scss`：数字键 1~5 全局切换、单段卡片展开/折叠、双栏平滑滚动联动到思源原文块，对齐 UI-UX-PRO-MAX 现代外壳分层与高对比度规范。
- 宿主集成 `src/ui/ReaderTab.svelte`：顶栏新增折叠阅读按钮、快捷键 `Alt+Z`、伴生栏专属 `fold` 页签与双栏滚动联动。
- 测试守护 `tests/folded-reader.test.ts` 与 `tests/header-actions.test.ts`（Assertion 60）：9 项专项测试全通，全仓测试 1,760 / 1,760 通过。
