# [TASK-20261031-github-benchmark-fusion] 小驴拾遗 · GitHub 三大顶级对标产品深度调研与融合方案

- **任务状态**: `completed`
- **目标插件**: `小驴拾遗 (siyuan-glean)`
- **仓库路径**: `D:\思源插件\小驴拾遗`
- **对标产品**:
  1. [`omnivore-app/omnivore`](https://github.com/omnivore-app/omnivore) — 开源稍后读与深度阅读标杆
  2. [`hoarder-app/hoarder`](https://github.com/hoarder-app/hoarder) — AI 驱动的自托管书签与智能分拣系统
  3. [`chenxiachan/textfold`](https://github.com/chenxiachan/textfold) — 5 阶语义保真折叠阅读器

---

## 一、 三大参考产品深度调研剖析

### 1. `omnivore-app/omnivore` 核心精华
- **全键盘阅读流与 Vim 式导航 (`j/k` 漫游、`e` 归档、`h` 高亮、`n` 批注)**：读者双手不离键盘即可完成从列表筛选、段落跳转、划线批注到一键归档（Inbox Zero）的全套动作。
- **自动化标签分拣规则 (Label Rules Engine)**：当新文章入库时，基于来源域名、作者、标题正则或阅读时长，自动打上分类标签、分配初始状态（如长文直入 `later`，短讯直入 `inbox`）。
- **阅读进度百分比与剩余时间动态胶囊**：精准记录精确到段落偏移的阅读水位线，重开文章时平滑恢复并提示还需几分钟读完。

### 2. `hoarder-app/hoarder` 核心精华
- **入库异步 AI 智能标签与多维聚类 (Auto-Tagging & Smart Lists)**：剪藏保存瞬间不阻塞用户，后台队列异步提取核心实体标签，并自动与用户既有标签词表对齐（防标签爆炸）。
- **失效链接防腐与本地快照健康度 (Link Rot Guard & Snapshot Health)**：明确标注原文 URL 是否已 404 失效，并凸显本地思源归档正文与静态资源的完整度评分。
- **模糊全文检索与高亮联动过滤**：搜索时同时命中文章正文、AI 摘要与用户自己的划线批注，并在结果卡片中直接高亮匹配上下文片段。

### 3. `chenxiachan/textfold` 核心精华
- **保真优先，拒绝虚构重写 (Fidelity over AI Rewriting)**：不让 AI 用口水话改写全文，而是构建 **5 阶语义折叠树**（Level 5 概念卡片 → Level 4 单行要旨 → Level 3 论点与支撑 → Level 2 **100% 原作者逐字金句** → Level 1 原文整段）。
- **语义级连续缩放 (Semantic Zoom via `1`~`5`)**：按数字键 `1`~`5` 全局切换阅读粒度，单击单个段落可局部展开原文，划线高亮在 5 个层级间无缝穿透并锚定思源 `blockId`。

---

## 二、 适合融合进「小驴拾遗」的落地改造清单

### 改造项 A：5 阶语义保真折叠阅读模式（借鉴 TextFold）- [completed]
- **涉及目录**：`src/domain/`、`src/services/`、`src/ui/`
- **完成情况**：
  1. 建立 `FoldLevel (1|2|3|4|5)` 与 `FoldNode` 数据结构（`src/domain/folded-reader.ts`），每个节点严格锚定思源段落 `blockId`，其中 Level 2 (`brief`) 强制校验必须为原文逐字子串（`isVerbatimSubstring`，Verbatim Guard 机制）。
  2. 阅读器内支持数字键 `1`~`5` 全局缩放粒度、单段落点击独立展开/折叠，以及双栏模式下点击折叠卡片左侧原文块平滑滚动联动（`scrollAndPulseReadPoint`）。
  3. `ReaderTab.svelte` 接入顶栏 `Alt+Z` 折叠切换按钮与伴生栏专属 `fold` 页签；增加 `tests/folded-reader.test.ts` 专项单测守护。

### 改造项 B：入库自动分拣规则引擎与智能标签防膨胀（借鉴 Omnivore + Hoarder）- [completed]
- **涉及目录**：`src/domain/auto-triage.ts`、`src/services/import-service.ts`、`src/domain/enrich.ts`
- **完成情况**：
  1. 新增轻量级「入库自动分拣规则（Auto-Triage Rules）」：支持按来源域名（如 `mp.weixin.qq.com`、`arxiv.org`）、预计阅读时长（如 `>15min`、`<=5min`）与标题关键词，自动分配初始五态（`later`/`inbox`）与追加预设标签（如 `微信`、`学术论文`、`深度长文`、`速读`）。
  2. 在 `import-service.ts`（文件导入）与 `enrich.ts`（AI 摘要解析）中全面贯通分拣评估。
  3. 实现 `alignTagsWithVocabulary` 智能防膨胀算法：当生成新标签时，自动与用户既有高频标签词表进行规范化对齐（大小写归一、包含匹配），彻底避免标签爆炸。

### 改造项 C：Inbox Zero 极速键盘流与快照防腐徽标（借鉴 Omnivore + Hoarder）- [completed]
- **涉及目录**：`src/domain/snapshot-health.ts`、`src/domain/library-keyboard.ts`、`src/ui/DockPanel.svelte`、`src/domain/reader-shortcuts.ts`
- **完成情况**：
  1. 完备阅读列表与阅读器内的单键极速分拣（非文本输入态下：`j`/`k` 上下移动光标、`e` 一键读完归档、`l`/`a` 移入稍后读、`1`~`5` 连续切换折叠粒度）。
  2. 建立本地快照健康度模型（`SnapshotHealth`），评估正文字数充盈度与离线归档抗 404 防腐分值（0-100 分），分出 `healthy`（绿盾）、`partial`（黄盾）、`missing`（红盾）三级。
  3. 在读库列表卡片与行条（`DockPanel.svelte`）直接展示 `.glean-snap-badge` 盾牌微徽标与分数提示。

---

## 三、 质量门禁与验收标准 (Quality Gate)
1. 运行 `pnpm check:types` 与 `pnpm check:svelte` 零错误、零警告（PASS）；
2. 新增单元测试 `tests/auto-triage.test.ts` 与 `tests/folded-reader.test.ts`，覆盖 5 阶折叠 Verbatim 校验、自动分拣规则、词表防膨胀与快照健康度（PASS）；
3. 扩展 `tests/header-actions.test.ts` 守护全部契约（PASS）；
4. 运行 `pnpm build` 正常产出产物，本地 Git 提交，不执行 `git push`（PASS）。
