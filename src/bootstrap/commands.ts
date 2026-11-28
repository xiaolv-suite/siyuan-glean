/**
 * 命令与快捷键注册协调器（S8 切片）：
 * 统一管理小驴拾遗在思源快捷键系统中的命令声明。
 */
import { pickContinueReadingDocId, type RecentReadingEntry } from "../domain/recent-reading.ts";

export interface CommandHost {
    addCommand: (cmd: { langKey: string; hotkey?: string; callback: () => void }) => void;
    openPanel: () => void;
    currentDocId: () => string;
    recentReadingDocuments: () => readonly RecentReadingEntry[];
    lastReadingDocId: string;
    openReadingDocument: (id: string) => void;
    addCurrentDocToLibrary: () => Promise<void>;
    openMigrate: () => void;
    makeCardFromSelection: () => Promise<void>;
    markCurrentStatus: (status: "done" | "later" | "archived") => Promise<void>;
    readNextArticle: () => Promise<void>;
    requireCurrentDoc: () => string;
    openArchiveDialog: (id: string) => void;
    openCurrentSource: () => Promise<void>;
    excerptQuoteFromSelection: () => Promise<void>;
    showReaderHelp: () => void;
    triggerRoamingPick: () => Promise<void>;
}

export function registerCommands(plugin: CommandHost): void {
    plugin.addCommand({
        langKey: "cmd.openPanel",
        hotkey: "⌥⌘G",
        callback: () => plugin.openPanel(),
    });

    plugin.addCommand({
        langKey: "cmd.continueReading",
        hotkey: "⌥⌘R",
        callback: () => {
            const cur = plugin.currentDocId();
            const targetId = pickContinueReadingDocId(plugin.recentReadingDocuments(), cur, plugin.lastReadingDocId);
            if (targetId) {
                plugin.openReadingDocument(targetId);
                return;
            }
            void (async () => {
                try {
                    const { loadIndex } = await import("../services/index-store.ts");
                    const index = await loadIndex(plugin as never);
                    const readingDoc = Object.values(index.clips).find((c) => c.status === "reading" && !c.internal);
                    if (readingDoc?.id) {
                        plugin.openReadingDocument(readingDoc.id);
                        return;
                    }
                } catch {}
            })();
        },
    });

    plugin.addCommand({
        langKey: "cmd.addToList",
        callback: () => void plugin.addCurrentDocToLibrary(),
    });

    plugin.addCommand({
        langKey: "cmd.openMigrate",
        callback: () => plugin.openMigrate(),
    });

    plugin.addCommand({
        langKey: "cmd.makeCard",
        callback: () => void plugin.makeCardFromSelection(),
    });

    plugin.addCommand({ langKey: "cmd.markDone", callback: () => void plugin.markCurrentStatus("done") });
    plugin.addCommand({ langKey: "cmd.readNext", callback: () => void plugin.readNextArticle() });
    plugin.addCommand({ langKey: "cmd.markLater", callback: () => void plugin.markCurrentStatus("later") });
    plugin.addCommand({
        langKey: "cmd.archiveCurrent",
        callback: () => {
            const id = plugin.requireCurrentDoc();
            if (id) plugin.openArchiveDialog(id);
        },
    });
    plugin.addCommand({ langKey: "cmd.openSource", callback: () => void plugin.openCurrentSource() });
    plugin.addCommand({ langKey: "cmd.excerptQuote", callback: () => void plugin.excerptQuoteFromSelection() });
    plugin.addCommand({ langKey: "cmd.readerHelp", callback: () => plugin.showReaderHelp() });
    plugin.addCommand({ langKey: "cmd.roamingPick", callback: () => void plugin.triggerRoamingPick() });
}
