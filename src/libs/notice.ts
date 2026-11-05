/**
 * 小驴拾遗 · 全生态统一通知集成模块
 * 基于 Epoch 7 标准 lv-notice-kit.ts
 */

import {
    lvNotify,
    withDocLock,
    lvSurfaceStack,
    lvTicker,
    lvAi,
    lvActivity,
    lvBackup,
    lvEcosystem,
    lvLaunchpad,
    lvOmnisearch,
    type CardNoticeOptions,
    type CapsuleNoticeOptions,
    type SilentNoticeOptions,
    type LvNoticeLevel,
    type LvAiRequestOptions,
    type LvAiResponse,
    type LvActivityRecord,
    type LvPluginBackupPayload,
    type LvEcosystemFullBackup,
    type LvEcosystemDiagnostics,
    type LvLaunchpadItem,
    type LvSearchResultItem,
    type LvSearchProvider,
    lvAutomation,
} from "./lv-notice-kit.ts";

export { lvNotify, withDocLock, lvSurfaceStack, lvTicker, lvAi, lvActivity, lvBackup, lvEcosystem, lvLaunchpad, lvOmnisearch, lvAutomation };
export type {
    CardNoticeOptions,
    CapsuleNoticeOptions,
    SilentNoticeOptions,
    LvNoticeLevel,
    LvAiRequestOptions,
    LvAiResponse,
    LvActivityRecord,
    LvPluginBackupPayload,
    LvEcosystemFullBackup,
    LvEcosystemDiagnostics,
    LvLaunchpadItem,
    LvSearchResultItem,
    LvSearchProvider,
};

const PLUGIN_SOURCE = "小驴拾遗";

/**
 * 通用通知出口：智能拦截并分流为微胶囊或操作卡片
 */
export function showNotice(
    message: string,
    timeout = 3000,
    type: "info" | "error" | "success" | "warn" = "info",
    category?: string
): string {
    if (type === "error") {
        return lvNotify.card({
            source: PLUGIN_SOURCE,
            category: category || "error",
            title: "小驴拾遗提示",
            message,
            level: "error",
            duration: Math.max(timeout, 6000),
        });
    }

    return lvNotify.capsule({
        source: PLUGIN_SOURCE,
        category,
        message,
        level: type,
        duration: timeout,
    });
}

/**
 * 剪藏完成回执卡片化：使用 lvNotify.card，附带【查看文档】快捷跳转按钮
 */
export function notifyClipSuccess(options: {
    docId: string;
    title?: string;
    openAction?: () => void;
    duration?: number;
}): string {
    const displayTitle = options.title?.trim();
    return lvNotify.card({
        source: PLUGIN_SOURCE,
        category: "clip-success",
        title: "剪藏收录成功",
        message: displayTitle ? `《${displayTitle}》已成功收录至读库` : "文章已成功加入读库待读",
        level: "success",
        duration: options.duration ?? 6000,
        actions: options.openAction
            ? [
                {
                    label: "查看文档",
                    primary: true,
                    onClick: options.openAction,
                    dismissAfterClick: true,
                },
            ]
            : undefined,
    });
}

/**
 * 批量剪藏、导入、多图 OCR 解析等长任务进度提示：
 * 进度自动折叠为单条计数，严禁连环弹窗刷屏
 */
export function notifyBatchProgress(
    message: string,
    category = "glean-batch-progress",
    duration = 3000
): string {
    return lvNotify.capsule({
        source: PLUGIN_SOURCE,
        category,
        message,
        level: "info",
        duration,
    });
}

/**
 * 剪藏与批量处理规范进度提示：
 * 同类进度折叠为单个计数通知（如“正在剪藏 (3/10)...”），严禁连环弹窗刷屏
 */
export function notifyClipProgress(current: number, total: number, label = "剪藏"): string {
    const message = `正在${label} (${current}/${total})...`;
    return notifyBatchProgress(message, "glean-clip-progress");
}

/**
 * 后台常规任务（自动清洗、微信识别、快照健康扫描等）降级为静默模式，绝不弹窗打扰用户
 */
export function notifySilentTask(message: string, category = "background-task"): void {
    lvNotify.silent({
        source: PLUGIN_SOURCE,
        category,
        message,
        level: "info",
    });
}

/**
 * 原位微动效：复制、微标切换等高频操作坚决不弹窗，直接在操作元素上微弹反馈
 */
export function notifyInlineFeedback(
    target: HTMLElement | null | undefined,
    tipText?: string,
    isSuccess = true
): void {
    lvNotify.inline(target, tipText, isSuccess);
}
