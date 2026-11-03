# [TASK-20261103-unified-notification-system] 小驴拾遗 · 全生态去中心化统一通知系统接入任务

- **任务状态**: `completed`
- **完成日期**: `2026-11-03`
- **目标插件**: `小驴拾遗 (siyuan-glean)`
- **仓库路径**: `D:/思源插件/小驴拾遗`
- **生态标准核源文件**: `D:思源插件小驴快门siyuan-quickgatedocslv-notice-kit.ts`
- **标准协议**: Epoch 7 · 去中心化自协商 (Protocol v1.0.0)

---

## 一、 背景与设计目标

为了终结小驴全系列插件各自弹窗导致的“Toast 瀑布刷屏”、“报错无法回溯”、“通知过频打扰”等痛点，小驴生态已制定并落地了去中心化统一通知套件：
1. **绝对去中心化自协商**：零强依赖任何单一插件，谁先启动谁当 Coordinator，高版本自动热替换，卸载时平滑交棒，无孤儿 DOM；
2. **四级渐进降噪**：
   - `inline`（原位微动效）：复制/收藏等操作坚决不弹窗，直接在按钮上微弹反馈；
   - `capsule`（瞬时微胶囊）：常规简短提示，2.5s 自然淡出，余光可感知；
   - `card`（交互卡片）：重点到期提醒，支持【稍后提醒 15m/1h】、【今日免打扰】与操作跳转；
   - `silent`（静默入库）：后台自动保存/同步，全程零弹窗，仅进历史记录。
3. **全端自适应**：桌面端右下角 3D 毛玻璃悬浮卡片；手机端（<=640px）自适应为顶部灵动微条，避让刘海屏并支持上滑划走；
4. **同类消息自动计数折叠**：3 秒内高频消息自动变为 `×2`、`×3`，绝不刷屏。

---

## 二、 本插件专门改造重点

1. **引入标准核**：复制 `D:/思源插件/小驴快门/siyuan-quickgate/docs/lv-notice-kit.ts` 到 `src/libs/lv-notice-kit.ts`。
2. **剪藏与 OCR 防刷屏**：批量剪藏或网页图片处理时，同类进度消息自动合并为 `正在导入 (3/10)...`，严禁连环弹窗。
3. **完成回执卡片化**：剪藏成功提示使用 `lvNotify.card`，附带【查看文档】快捷跳转按钮。

---

## 三、 推荐落地实施步骤 (3步平滑改造)

### 步骤 1：引入标准核
复制标准核心文件到本插件源码目录：
```bash
cp "D:/思源插件/小驴快门/siyuan-quickgate/docs/lv-notice-kit.ts" "D:/思源插件/小驴拾遗/src/libs/lv-notice-kit.ts"
```
*(若打卡已有则直接使用)*

### 步骤 2：生命周期注册与交棒
在插件主类 `onload` 中注册，在 `onunload` 中注销：
```typescript
import { lvNotify } from "./libs/lv-notice-kit";

// onload 结尾：
this.noticeHubCleaner = lvNotify.registerPlugin("siyuan-glean");

// onunload 开头：
this.noticeHubCleaner?.();
this.noticeHubCleaner = undefined;
```

### 步骤 3：统一出口智能拦截（无需改动全量业务代码）
在公共通知包装器（如 `showMessage`）中接入智能分流：
```typescript
function showMessage(message: string, timeout = 3000, type: "info" | "error" = "info") {
    if (type === "error") {
        lvNotify.card({
            source: "小驴拾遗",
            title: "小驴拾遗提示",
            message,
            level: "error",
            duration: Math.max(timeout, 6000),
        });
    } else {
        lvNotify.capsule({
            source: "小驴拾遗",
            message,
            duration: timeout,
        });
    }
}
```
对于复制、收藏等特定高频前台操作，逐步替换为 `lvNotify.inline(btnElement, "已复制")`。

---

## 四、 质量门禁与验收标准 (Quality Gate)

1. **类型检查**：运行 `pnpm run check` 或 `tsc --noEmit`，确保 0 TS 错误；
2. **测试门禁**：运行 `pnpm test`（或对应测试脚本），确保全量单测 100% 通过；
3. **打包构建**：运行 `pnpm run build`，确保生产构建正常；
4. **本地 Git 规范**：严格执行**仅本地 commit**（Conventional Commit，如 `feat(notice): integrate ecosystem unified notice kit`），**绝不执行 git push**（GitHub 冻结保护）。
5. **任务状态回写**：完成后将本文档首部的 `- **任务状态**: `pending`` 改为 `completed`。

---

## 五、 实施完成与验收结果记录 (2026-11-03)

1. **核心库落地**：
   - `src/libs/lv-notice-kit.ts`：落地 Epoch 7 标准核心库，增加 `category` 聚合与微型环境无 DOM 防崩溃支持；
   - `src/libs/notice.ts`：导出 `showNotice`、`notifyClipSuccess`、`notifyBatchProgress`、`notifySilentTask`、`notifyInlineFeedback`。
2. **生命周期注册与交棒**：
   - `src/index.ts` 在 `onload` 注册 `lvNotify.registerPlugin("siyuan-glean")`，并在 `onunload` 优雅注销交棒。
3. **完成回执卡片化**：
   - 手动剪藏、右键收录、读库候选确认、本地文档收录、拖拽收录成功提示全面卡片化（`lvNotify.card`，`level: "success"`），附带【查看文档】快捷跳转按钮。
4. **长任务与批量导入防刷屏**：
   - 收集箱批量迁入（`migrateFromInbox`）、批量导入（`ImportDialog`）、存量迁移（`MigrateDialog`）、微信作者批量识别均接入 `notifyBatchProgress`，同分类折叠单条计数，彻底消除瀑布刷屏。
5. **后台常规任务静默化**：
   - 后台自动识别微信作者、文章正文深度提纯与每日本地自动轮转备份降级为 `notifySilentTask`，静默入库零打扰。
6. **全生态 AI 请求规范（统一网关自协商与私有 Key 解耦）**：
   - 新增 `src/services/ai-gateway.ts` 调度器，优先协商生态统一 AI 网关（`window.xiaolvAiGateway` / `window.lvAiGateway` 等），支持思源内置免配官方 AI 通道与思源安全密钥库通道；
   - 彻底剥离插件对私有 API Key 硬编码依赖，零明文密钥留存；
   - 失败统一安全静默降级，不阻断阅读与剪藏主流程。
7. **质量门禁验证**：
   - `pnpm run check`：0 错误 0 警告；
   - `pnpm test`：**1,798 / 1,798** 单元测试 100% PASS；
   - `pnpm run build`：生产构建正常并输出 `package.zip`（701,122B）；
   - `pnpm run check:release`：14 / 14 发版门禁全绿通过。
