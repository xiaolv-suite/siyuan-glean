/**
 * 高亮转闪卡流水线服务（Highlight-to-Flashcard Pipeline Service）。
 * 优先通过 lvAutomation.trigger("siyuan-glean", "create-card-request", payload) 全生态广播，
 * 无规则消费/未安装闪卡时优雅降级为复制闪卡 Markdown 到剪贴板。
 */
import { showMessage } from "siyuan";
import type { GleanFacade } from "../types.ts";
import { t } from "../libs/i18n.ts";
import { lvLaunchpad, lvActivity } from "../libs/notice.ts";
import { createCardSafely } from "../libs/ecosystem-bridge-kit.ts";
import { extractDeliveryKey } from "../domain/extract-delivery.ts";
import { formatFlashcardMarkdown, type HighlightFlashcardPayload } from "../domain/highlight-pipeline.ts";

export interface PipelineDispatchResult {
    success: boolean;
    mode: "automated" | "clipboard" | "failed";
}

export async function dispatchHighlightToFlashcard(
    facade: GleanFacade,
    payload: HighlightFlashcardPayload
): Promise<PipelineDispatchResult> {
    const i18n = facade.i18n;

    const receipt = await createCardSafely({ front: payload.front, back: payload.back,
        tags: payload.tags, sourceBlockId: payload.sourceBlockId, deckName: payload.sourceTitle,
        requestId: extractDeliveryKey("", payload.sourceBlockId, payload.front + "\n" + payload.back) });
    if (receipt.ok && receipt.createdBlockID) {
        lvLaunchpad?.haptic?.(10);
        lvActivity?.record?.({ source: "拾遗", category: "clip", title: `高亮转闪卡: ${payload.sourceTitle}`, linkBlockId: receipt.createdBlockID });
        showMessage(t(i18n, "pipeline.cardCreatedSuccess"), 2500);
        return { success: true, mode: "automated" };
    }
    if (receipt.state === "unknown") {
        showMessage(t(i18n, "reader.extractPending"), 4000);
        return { success: false, mode: "failed" };
    }

    // 2. 闪卡未安装或无规则消费时，优雅降级为复制闪卡 Markdown 到剪贴板
    const markdown = formatFlashcardMarkdown(payload);
    try {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
            showMessage(t(i18n, "pipeline.copyFailed"), 3000);
            return { success: false, mode: "failed" };
        }
        await navigator.clipboard.writeText(markdown);
        if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
        if (typeof lvActivity?.record === "function") {
            lvActivity.record({
                source: "拾遗",
                category: "clip",
                title: `高亮转闪卡: ${payload.sourceTitle}`,
                linkBlockId: payload.sourceBlockId,
            });
        }
        showMessage(t(i18n, "pipeline.cardCopiedFallback"), 3000);
        return { success: true, mode: "clipboard" };
    } catch (error) {
        console.warn("[glean] 闪卡降级复制剪贴板失败:", error);
        showMessage(t(i18n, "pipeline.copyFailed"), 3000);
        return { success: false, mode: "failed" };
    }
}
