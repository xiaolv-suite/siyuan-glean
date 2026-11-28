/**
 * 生态集成与中枢网桥引导装配（S8 切片）：
 * 统一管理小驴通知、全生态灾备、万物穿透搜索、雷切卡片与时钟监听。
 */
import type { I18nBundle } from "../libs/i18n.ts";
import { registerRaikiriModuleSafely } from "../libs/ecosystem-bridge-kit.ts";
import { lvNotify, lvBackup, lvOmnisearch } from "../libs/notice.ts";
import { installGleanVaultAdapter } from "../services/vault-adapter.ts";

export interface EcosystemHost {
    i18n: I18nBundle;
    unregisterRaikiri?: () => void;
    cardsReviewedHandler?: () => void;
    noticeHubCleaner?: () => void;
    backupCleaner?: () => void;
    vaultCleaner?: () => void;
    searchCleaner?: () => void;
    openPanel: () => void;
    notifyDataChanged: () => void;
    dumpData: () => Promise<Record<string, unknown>>;
    restoreData: (d: Record<string, unknown>) => Promise<boolean>;
    searchClips: (keyword: string) => Promise<Array<{ id: string; docId: string; title: string; summary?: string; category?: string }>>;
    openClipDoc: (docId: string) => void;
}

export function installEcosystemBridges(plugin: EcosystemHost): void {
    plugin.unregisterRaikiri = registerRaikiriModuleSafely({
        moduleId: "glean-later-list",
        title: "小驴拾遗 · 待读列表",
        icon: "iconGleanWheat",
        category: "reading",
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["medium", "tall", "wide"],
        description: "展示小驴拾遗待读文章与重浮队列",
        source: { pluginId: "siyuan-glean", name: "小驴拾遗" },
        read: async () => {
            const { loadIndex } = await import("../services/index-store.ts");
            const index = await loadIndex(plugin as never);
            const laterClips = Object.values(index.clips)
                .filter((c) => c.status === "later" || c.status === "inbox")
                .slice(0, 5);
            return {
                title: "小驴拾遗 · 待读流",
                items: laterClips.map((c) => ({
                    label: c.title || "未命名文章",
                    value: c.site || "",
                    command: `siyuan://plugins/siyuan-glean?action=open&id=${c.id}`,
                })),
            };
        },
        open: () => plugin.openPanel(),
    });

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        plugin.cardsReviewedHandler = () => plugin.notifyDataChanged();
        window.addEventListener("lv-cards:reviewed", plugin.cardsReviewedHandler);
        window.addEventListener("lv-exam:stats", plugin.cardsReviewedHandler);
    }

    plugin.noticeHubCleaner = typeof lvNotify?.registerPlugin === "function"
        ? lvNotify.registerPlugin("siyuan-glean")
        : undefined;

    plugin.backupCleaner = typeof lvBackup?.register === "function"
        ? lvBackup.register(
            "siyuan-glean",
            async () => plugin.dumpData(),
            async (data: Record<string, unknown>) => plugin.restoreData(data),
        )
        : undefined;

    plugin.vaultCleaner = installGleanVaultAdapter(plugin as never);

    plugin.searchCleaner = typeof lvOmnisearch?.registerProvider === "function"
        ? lvOmnisearch.registerProvider("siyuan-glean", async (keyword) => {
            const hits = await plugin.searchClips(keyword);
            return hits.slice(0, 8).map((c) => ({
                id: c.id,
                source: "拾遗",
                category: c.category || "clip",
                title: c.title,
                snippet: c.summary,
                linkBlockId: c.docId,
                onClick: () => {
                    plugin.openClipDoc(c.docId);
                },
            }));
        })
        : undefined;
}
