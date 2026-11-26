/**
 * 阅读行动协调器（S8 切片）：
 * 将状态标记、打开原文、选区摘录引述、读下一篇、摘录制卡、帮助浮层、漫游盲盒与顶栏右键菜单集中管理。
 */
import { getAllEditor, type subMenu } from "siyuan";
import { t } from "../libs/i18n.ts";
import type { GleanFacade } from "../types.ts";
import { showMessage, showNotice } from "../libs/notice.ts";
import { batchSetStatusDetailed, readClip, readClipContext } from "../services/clip-store.ts";
import { recordReadingDone } from "../services/checkin-bridge.ts";
import { sourceUrlForCarrier } from "../domain/carrier.ts";
import { excerptFromSelection, insertQuoteExcerpt } from "../services/excerpt-service.ts";
import { pickNextUnread } from "../services/resurface-service.ts";
import { makeQuoteCardPreview } from "../ui/flashcard-dialog.ts";
import { simpleDialog, svelteDialog } from "../libs/dialog.ts";
import ArchiveDialog from "../ui/ArchiveDialog.svelte";
import RestoreDialog from "../ui/RestoreDialog.svelte";
import { docUnderHostKind } from "../services/lifecycle-service.ts";

export type ReaderActionsHost = GleanFacade & {
    requireCurrentDoc: () => string;
};

export class ReaderActionsCoordinator {
    private readonly plugin: ReaderActionsHost;
    private readonly statusBusyDocIds = new Set<string>();
    private readonly openDialogDocIds = new Set<string>();

    constructor(plugin: ReaderActionsHost) {
        this.plugin = plugin;
    }

    async markCurrentStatus(status: "done" | "later" | "archived"): Promise<void> {
        const id = this.plugin.requireCurrentDoc();
        if (!id || this.statusBusyDocIds.has(id)) return;
        this.statusBusyDocIds.add(id);
        try {
            const result = await batchSetStatusDetailed(this.plugin.pluginInstance, [id], status);
            if (result.ok !== 1) {
                showMessage(t(this.plugin.i18n, "msg.statusFailed"), 3000);
                return;
            }
            if (status === "done" && this.plugin.settings.integration.checkinEnabled && this.plugin.settings.integration.checkinItemId) {
                const context = await readClipContext(id);
                void recordReadingDone(this.plugin.settings.integration.checkinItemId, id, context?.title ?? "");
            }
            this.plugin.notifyDataChanged();
            showMessage(t(this.plugin.i18n, result.indexSyncFailed.length ? "msg.statusIndexPending" : "msg.statusChanged"), 3500);
        } catch (error) {
            console.warn("[glean] 状态命令失败:", error);
            showMessage(t(this.plugin.i18n, "msg.statusFailed"), 3000);
        } finally {
            this.statusBusyDocIds.delete(id);
        }
    }

    async openCurrentSource(): Promise<void> {
        const id = this.plugin.requireCurrentDoc();
        if (!id) return;
        try {
            const attrs = await readClip(id);
            const url = sourceUrlForCarrier(attrs.contentType, attrs.url);
            if (!url) {
                showMessage(t(this.plugin.i18n, "clip.sourceMissing"), 3000);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
        } catch (error) {
            console.warn("[glean] 打开原文失败:", error);
            showMessage(t(this.plugin.i18n, "reader.actionFailed"), 3000);
        }
    }

    async excerptQuoteFromSelection(): Promise<void> {
        const selection = window.getSelection();
        const editor = getAllEditor().find((item) => item?.protyle?.element?.contains(selection?.anchorNode ?? null));
        const picked = excerptFromSelection(editor?.protyle?.element ?? null, selection ?? null);
        if (!picked) {
            showMessage(t(this.plugin.i18n, "flashcard.noSelection"), 3000);
            return;
        }
        if (!picked.blockId) {
            showMessage(t(this.plugin.i18n, "reader.excerptNoBlock"), 3000);
            await navigator.clipboard.writeText(picked.text).catch(() => undefined);
            return;
        }
        try {
            await insertQuoteExcerpt(picked.blockId, picked.text);
            this.plugin.notifyDataChanged();
            showMessage(t(this.plugin.i18n, "reader.excerptDone"), 2500);
        } catch (error) {
            console.warn("[glean] 摘录引述块失败:", error);
            showMessage(t(this.plugin.i18n, "reader.actionFailed"), 3000);
        }
    }

    async readNextArticle(): Promise<void> {
        try {
            const next = await pickNextUnread(this.plugin.pluginInstance, "");
            if (!next) {
                showMessage(t(this.plugin.i18n, "reader.noNext"), 3000);
                return;
            }
            this.plugin.openReadingDocument(next);
        } catch (error) {
            console.warn("[glean] 打开下一篇失败:", error);
            showMessage(t(this.plugin.i18n, "reader.actionFailed"), 3000);
        }
    }

    showReaderHelp(): void {
        const actions: Array<[string, string]> = [
            ["cmd.continueReading", "cmd.markDone"],
            ["cmd.readNext", "cmd.markLater"],
            ["cmd.openSource", "cmd.archiveCurrent"],
            ["cmd.excerptQuote", "cmd.makeCard"],
        ];
        const wrap = document.createElement("div");
        wrap.className = "glean-reader-help";
        const hint = document.createElement("p");
        hint.className = "glean-reader-help__hint";
        hint.textContent = t(this.plugin.i18n, "help.hint");
        wrap.append(hint);
        const list = document.createElement("div");
        list.className = "glean-reader-help__list";
        list.setAttribute("role", "list");
        for (const [left, right] of actions) {
            const row = document.createElement("div");
            row.className = "glean-reader-help__row";
            row.setAttribute("role", "listitem");
            const primary = document.createElement("span");
            primary.className = "glean-reader-help__action";
            primary.textContent = t(this.plugin.i18n, left);
            const secondary = document.createElement("span");
            secondary.className = "glean-reader-help__action";
            secondary.textContent = t(this.plugin.i18n, right);
            row.append(primary, secondary);
            list.append(row);
        }
        wrap.append(list);
        simpleDialog({
            title: t(this.plugin.i18n, "help.title"),
            closeLabel: t(this.plugin.i18n, "action.close"),
            ele: wrap,
            width: "520px",
        });
    }

    cardSelection(): { quote: string; docId: string; blockId: string } | null {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return null;
        const editor = getAllEditor().find((item) => item?.protyle?.element?.contains(selection.anchorNode));
        const host = editor?.protyle?.element;
        const excerpt = excerptFromSelection(host ?? null, selection);
        const docId = editor?.protyle?.block?.rootID;
        if (!excerpt || !docId) return null;
        return { quote: selection.toString().trim(), docId, blockId: excerpt.blockId };
    }

    async makeCardFromSelection(): Promise<void> {
        const selection = this.cardSelection();
        if (!selection) {
            showMessage(t(this.plugin.i18n, "flashcard.noSelection"), 3000);
            return;
        }
        const { docId, blockId, quote } = selection;
        let docTitle = "";
        try {
            const { querySql } = await import("../api/client.ts");
            const rows = await querySql<{ content: string }>(
                "SELECT content FROM blocks WHERE id = '" + docId.replace(/'/g, "''") + "' LIMIT 1",
            );
            docTitle = rows[0]?.content ?? "";
        } catch {
            // 标题取不到就用无来源卡面
        }
        try {
            makeQuoteCardPreview(this.plugin, { title: docTitle, quote, docId, blockId });
        } catch (error) {
            console.warn("[glean] 分享卡生成失败:", error);
            showMessage(t(this.plugin.i18n, "msg.actionFailed"), 3000);
        }
    }

    async triggerRoamingPick(): Promise<void> {
        try {
            const { loadIndex } = await import("../services/index-store.ts");
            const { pickRoamingArticle } = await import("../domain/roaming.ts");
            const { openRoamingDialog } = await import("../ui/roaming-dialog.ts");
            const index = await loadIndex(this.plugin.pluginInstance);
            const candidates = Object.values(index.clips);
            const pick = pickRoamingArticle(candidates);
            if (pick) {
                openRoamingDialog(this.plugin, pick, (id, readPoint) => {
                    this.plugin.openReadingDocument(id, readPoint);
                });
            } else {
                showMessage(t(this.plugin.i18n, "roaming.emptyPool"), 2500);
            }
        } catch (error) {
            console.warn("[glean] 漫游抽选失败:", error);
            showMessage(t(this.plugin.i18n, "msg.actionFailed"), 2500);
        }
    }

    appendTopBarContextMenuItems(menu: subMenu): void {
        if (!menu || typeof menu.addItem !== "function") return;
        menu.addItem({
            iconHTML: "",
            label: t(this.plugin.i18n, "topbarMenu.resurface"),
            click: () => this.plugin.openPanel("resurface"),
        });
        menu.addItem({
            iconHTML: "",
            label: t(this.plugin.i18n, "topbarMenu.library"),
            click: () => this.plugin.openPanel("library"),
        });
        menu.addItem({
            iconHTML: "",
            label: t(this.plugin.i18n, "topbarMenu.highlights"),
            click: () => this.plugin.openPanel("highlights"),
        });
        menu.addItem({
            iconHTML: "",
            label: t(this.plugin.i18n, "topbarMenu.stats"),
            click: () => this.plugin.openPanel("stats"),
        });
        menu.addSeparator();
        menu.addItem({
            iconHTML: "",
            label: t(this.plugin.i18n, "topbarMenu.roaming"),
            click: () => void this.triggerRoamingPick(),
        });
        menu.addSeparator();
        menu.addItem({
            iconHTML: "",
            label: t(this.plugin.i18n, "topbarMenu.settings"),
            click: () => this.plugin.openSettings(),
        });
    }

    openArchiveDialog(docId: string): void {
        if (!docId || this.openDialogDocIds.has(docId)) return;
        this.openDialogDocIds.add(docId);
        svelteDialog({
            title: t(this.plugin.i18n, "archive.title"),
            closeLabel: t(this.plugin.i18n, "action.close"),
            component: ArchiveDialog,
            props: { facade: this.plugin as never, docId },
            width: "min(440px, 94vw)",
            height: "auto",
            callback: () => { this.openDialogDocIds.delete(docId); },
        });
    }

    openRestoreDialog(docId: string): void {
        if (!docId || this.openDialogDocIds.has(docId)) return;
        this.openDialogDocIds.add(docId);
        void (async () => {
            let dialogOpened = false;
            try {
                const kind = await docUnderHostKind(docId);
                if ((this.plugin.pluginInstance as { loaded?: boolean })?.loaded === false) return;
                if (!kind) {
                    const result = await batchSetStatusDetailed(this.plugin.pluginInstance, [docId], "later");
                    if (result.ok === 1) {
                        this.plugin.notifyDataChanged();
                        showNotice(t(this.plugin.i18n, "msg.statusChanged"), 3500, "info");
                    }
                    return;
                }
                svelteDialog({
                    title: t(this.plugin.i18n, "restore.title"),
                    closeLabel: t(this.plugin.i18n, "action.close"),
                    component: RestoreDialog,
                    props: { facade: this.plugin as never, docId },
                    width: "min(440px, 94vw)",
                    height: "auto",
                    callback: () => { this.openDialogDocIds.delete(docId); },
                });
                dialogOpened = true;
            } finally {
                if (!dialogOpened) {
                    this.openDialogDocIds.delete(docId);
                }
            }
        })();
    }

    currentDocId(): string {
        const editors = getAllEditor().filter((item): item is NonNullable<typeof item> & { protyle: { block: { rootID: string }; element: Element } } => Boolean(item?.protyle?.block?.rootID && item?.protyle?.element));
        if (editors.length <= 1) return editors[0]?.protyle?.block?.rootID ?? "";
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            const anchored = editors.find((item) => item.protyle.element?.contains(selection.anchorNode));
            if (anchored) return anchored.protyle.block.rootID;
        }
        const active = document.activeElement;
        if (active instanceof Element) {
            const focused = editors.find((item) => item.protyle.element?.contains(active));
            if (focused) return focused.protyle.block.rootID;
        }
        return editors[0].protyle.block.rootID;
    }
}

export function createReaderActions(plugin: ReaderActionsHost): ReaderActionsCoordinator {
    return new ReaderActionsCoordinator(plugin);
}
