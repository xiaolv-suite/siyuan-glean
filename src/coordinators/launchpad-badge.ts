/**
 * 罗盘与未读角标协调器（S6 切片）：
 * 将未读数统计与徽章分发、小驴罗盘入口注册、200+ 行 handleQuickAction 二级行动及穿透搜索彻底解耦。
 * 消除重复注册风险：在重新注册前主动调用旧 cleaner，并支持 Disposer 统一级联卸载。
 */
import type { Plugin } from "siyuan";
import type { GleanSettings } from "../services/settings.ts";
import type { I18nBundle } from "../libs/i18n.ts";
import { t } from "../libs/i18n.ts";
import type { IDisposerRegistry } from "../core/disposer.ts";
import type { RecentReadingEntry } from "../domain/recent-reading.ts";
import { pickContinueReadingDocId } from "../domain/recent-reading.ts";
import {
    showMessage,
    showNotice,
    lvLaunchpad,
    lvActivity,
    lvNotify,
    notifyClipSuccess,
    withLvAiWait,
} from "../libs/notice.ts";
import { normalizeUrl } from "../domain/url.ts";

export interface LaunchpadBadgeCoordinatorOptions {
    plugin: Plugin;
    getI18n: () => I18nBundle;
    getSettings: () => GleanSettings;
    isLoaded: () => boolean;
    getTopBarElement: () => HTMLElement | undefined;
    openPanel: (targetView?: string) => void;
    openInbox: () => void;
    openReadingDocument: (docId: string, focusBlockId?: string) => void;
    currentDocId: () => string;
    addCurrentDocToLibrary: () => Promise<void>;
    notifyDataChanged: () => void;
    syncKnownClipDocIds: (ids: Iterable<string>) => void;
    getRecentReadings: () => readonly RecentReadingEntry[];
    getLastReadingDocId: () => string;
    disposer?: IDisposerRegistry;
}

export class LaunchpadBadgeCoordinator {
    private readonly plugin: Plugin;
    private readonly getI18n: () => I18nBundle;
    private readonly getSettings: () => GleanSettings;
    private readonly isLoaded: () => boolean;
    private readonly getTopBarElement: () => HTMLElement | undefined;
    private readonly openPanel: (targetView?: string) => void;
    private readonly openInboxFn: () => void;
    private readonly openReadingDocumentFn: (docId: string, focusBlockId?: string) => void;
    private readonly currentDocIdFn: () => string;
    private readonly addCurrentDocToLibraryFn: () => Promise<void>;
    private readonly notifyDataChangedFn: () => void;
    private readonly syncKnownClipDocIdsFn: (ids: Iterable<string>) => void;
    private readonly getRecentReadingsFn: () => readonly RecentReadingEntry[];
    private readonly getLastReadingDocIdFn: () => string;

    unreadCount = 0;
    launchpadCleaner?: () => void;

    constructor(options: LaunchpadBadgeCoordinatorOptions) {
        this.plugin = options.plugin;
        this.getI18n = options.getI18n;
        this.getSettings = options.getSettings;
        this.isLoaded = options.isLoaded;
        this.getTopBarElement = options.getTopBarElement;
        this.openPanel = options.openPanel;
        this.openInboxFn = options.openInbox;
        this.openReadingDocumentFn = options.openReadingDocument;
        this.currentDocIdFn = options.currentDocId;
        this.addCurrentDocToLibraryFn = options.addCurrentDocToLibrary;
        this.notifyDataChangedFn = options.notifyDataChanged;
        this.syncKnownClipDocIdsFn = options.syncKnownClipDocIds;
        this.getRecentReadingsFn = options.getRecentReadings;
        this.getLastReadingDocIdFn = options.getLastReadingDocId;

        if (options.disposer) {
            options.disposer.add(() => {
                this.dispose();
            });
        }
    }

    getUnreadCount(): number {
        return this.unreadCount;
    }

    setUnreadCount(count: number): void {
        this.unreadCount = count;
    }

    async refreshUnreadCount(): Promise<void> {
        try {
            const { loadIndex } = await import("../services/index-store.ts");
            const index = await loadIndex(this.plugin, { shouldPublish: () => this.isLoaded() });
            if (!this.isLoaded()) return;
            this.syncKnownClipDocIdsFn(Object.keys(index.clips));
            const unread = Object.values(index.clips)
                .filter((c) => (c.status === "inbox" || c.status === "later" || c.status === "reading") && !c.internal);
            const count = unread.length;
            if (count !== this.unreadCount) {
                this.unreadCount = count;
                this.registerLaunchpad();
            }
        } catch {
            // 静默降级
        }
    }

    /** 向小驴罗盘注册极速直达入口与二级行动（带防重复注册治理） */
    registerLaunchpad(): void {
        if (typeof lvLaunchpad?.register !== "function") return;
        // 彻底消除覆盖 cleaner 未注销的重复注册风险
        if (this.launchpadCleaner) {
            try {
                this.launchpadCleaner();
            } catch {
                // ignore
            }
            this.launchpadCleaner = undefined;
        }

        const unread = this.getUnreadCount();
        this.launchpadCleaner = lvLaunchpad.register({
            id: "siyuan-glean",
            name: "拾遗",
            fullName: "小驴拾遗",
            svgIcon: "icon-lv-glean",
            color: "#a855f7",
            desc: "文章剪藏 · 智能分拣",
            digit: 4,
            badge: unread > 0 ? `${unread} 篇未读` : undefined,
            badgeType: "primary",
            /* 罗盘每次打开实时拉取未读数，读完自动隐藏徽章 */
            badgeProvider: () => {
                const n = this.getUnreadCount();
                return n > 0 ? `${n} 篇未读` : undefined;
            },
            actions: ["剪藏剪贴板内容", "今日阅读池", "继续上次阅读", "稍后读收件箱"],
            topBarElement: this.getTopBarElement(),
            onClick: () => this.openInboxFn(),
            onAction: (action) => void this.handleQuickAction(action),
        });
    }

    /** 处理小驴罗盘二级快捷行动直达（支持手机直办） */
    async handleQuickAction(action: string): Promise<void> {
        if (action === "今日阅读池" || action === "打开今日阅读池") {
            if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
            this.openPanel("resurface");
            return;
        }

        if (action === "继续上次阅读") {
            const cur = this.currentDocIdFn();
            const targetId = pickContinueReadingDocId(this.getRecentReadingsFn(), cur, this.getLastReadingDocIdFn());
            if (targetId) {
                if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
                this.openReadingDocumentFn(targetId);
                return;
            }
            void (async () => {
                try {
                    const { loadIndex } = await import("../services/index-store.ts");
                    const index = await loadIndex(this.plugin);
                    const readingDoc = Object.values(index.clips).find((c) => c.status === "reading" && !c.internal);
                    if (readingDoc?.id) {
                        if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
                        this.openReadingDocumentFn(readingDoc.id);
                        return;
                    }
                } catch {}
                showMessage(t(this.getI18n(), "reading.noRecent"), 3000);
            })();
            return;
        }

        if (action === "稍后读收件箱" || action === "打开未读文章收件箱 (Inbox)") {
            if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
            this.openInboxFn();
            return;
        }

        if (action === "剪藏剪贴板内容" || action === "剪藏当前系统剪贴板内容") {
            let text = "";
            if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
                try {
                    text = (await navigator.clipboard.readText())?.trim() ?? "";
                } catch {
                    // 权限受限或剪贴板不可读
                }
            }

            if (!text) {
                const docId = this.currentDocIdFn();
                if (docId) {
                    await this.addCurrentDocToLibraryFn();
                    if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
                } else {
                    showNotice("剪贴板内容为空，请先复制需要剪藏的链接或文本", 3500, "warn");
                }
                return;
            }

            const normalizedClipboardUrl = !/\s/.test(text) ? normalizeUrl(text) : "";
            const isUrl = Boolean(normalizedClipboardUrl);
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
            const title = isUrl ? `剪藏 ${dateStr}` : (text.slice(0, 30).replace(/[/\\:<>|?*"~\p{Cc}\p{Cf}\r\n]+/gu, " ").trim() || `剪藏 ${dateStr}`);
            const md = isUrl ? `[来源链接](${normalizedClipboardUrl})\n\n> 剪藏自系统剪贴板` : `${text}\n\n> 剪藏自系统剪贴板`;
            let targetNotebook = this.getSettings().anchorNotebooks[0] || "";
            let createdDocId: string | undefined;

            try {
                const { listNotebooks, createDocWithMd, querySql, removeDoc, deleteBlock } = await import("../api/client.ts");
                const openNbs = await listNotebooks();
                const hubNb = openNbs.find(
                    (n) => /^(🐴\s*)?小驴(生态|空间|笔记本)/.test(n.name?.trim() || "")
                );
                targetNotebook = targetNotebook || hubNb?.id || openNbs[0]?.id || "";
                if (!targetNotebook) {
                    showNotice(t(this.getI18n(), "capture.noAnchorNotebook"), 4000, "warn");
                    return;
                }

                const { captureDocument, findClipUrlConflict } = await import("../services/clip-store.ts");
                const notifyUrlConflict = (conflict: { id: string; title?: string; hpath?: string }) => {
                    const confTitle = conflict.title || conflict.hpath || "";
                    lvNotify.card({
                        source: "小驴拾遗",
                        category: "clip-conflict",
                        title: t(this.getI18n(), "inbox.duplicate"),
                        message: confTitle ? `已存在相同来源文章：《${confTitle}》` : "读库中已收录过同 URL 的文章",
                        level: "warn",
                        duration: 6000,
                        actions: [
                            {
                                label: "查看已有文档",
                                primary: true,
                                onClick: () => this.openReadingDocumentFn(conflict.id),
                            },
                        ],
                    });
                };

                if (isUrl) {
                    const preConflict = await findClipUrlConflict(normalizedClipboardUrl, undefined, this.plugin).catch(() => null);
                    if (preConflict) {
                        notifyUrlConflict(preConflict);
                        return;
                    }
                }

                const rootPrefix = this.getSettings().rootPath
                    ? this.getSettings().rootPath!.trim().replace(/\/+$/, "")
                    : targetNotebook === hubNb?.id
                      ? "/04-小驴拾遗"
                      : "";

                const docId = await createDocWithMd(targetNotebook, `${rootPrefix}/剪藏/${title}`, md);
                if (docId) {
                    createdDocId = docId;
                    const captured = await captureDocument(this.plugin, docId, { src: "manual", url: isUrl ? normalizedClipboardUrl : undefined });
                    if (captured.conflict) {
                        if (!captured.attrs?.status && docId !== captured.conflict.id) {
                            try {
                                const rows = await querySql<{ box?: string; path?: string }>(
                                    `SELECT box, path FROM blocks WHERE id = '${docId}' AND type = 'd' LIMIT 1`,
                                ).catch(() => []);
                                if (rows?.[0]?.box && rows?.[0]?.path) {
                                    await removeDoc(rows[0].box, rows[0].path);
                                } else {
                                    await deleteBlock(docId);
                                }
                            } catch { /* ignore cleanup error */ }
                        }
                        notifyUrlConflict(captured.conflict);
                        return;
                    }
                    if (typeof lvLaunchpad?.haptic === "function") lvLaunchpad.haptic(10);
                    notifyClipSuccess({
                        docId,
                        title,
                        openAction: () => this.openReadingDocumentFn(docId),
                    });
                    lvActivity.record({
                        source: "拾遗",
                        category: "clip",
                        title: `剪藏剪贴板内容：《${title}》`,
                        linkBlockId: docId,
                    });
                    this.notifyDataChangedFn();
                }
            } catch (err) {
                console.warn("[glean] 剪贴板剪藏失败，进入离线待同步队列:", err);
                try {
                    const { enqueuePendingClip } = await import("../services/clip-sync-queue.ts");
                    enqueuePendingClip({
                        notebookId: targetNotebook,
                        title,
                        md,
                        url: isUrl ? normalizedClipboardUrl : undefined,
                        isUrl,
                        ...(createdDocId ? { createdDocId } : {}),
                    });
                } catch (queueErr) {
                    console.warn("[glean] 离线队列写入失败:", queueErr);
                }
            }
            return;
        }

        if (action === "一键批量生成AI结构化摘要") {
            try {
                const { loadIndex } = await import("../services/index-store.ts");
                const index = await loadIndex(this.plugin);
                const candidates = Object.values(index.clips)
                    .filter((c) => !c.summary && !c.internal && (c.status === "inbox" || c.status === "later" || c.status === "reading"))
                    .slice(0, 5);

                if (candidates.length === 0) {
                    showNotice("未读文章均已生成结构化摘要", 3000, "info");
                    return;
                }

                let okCount = 0;
                let doneCount = 0;
                let wasAborted = false;
                const total = candidates.length;

                await withLvAiWait(
                    {
                        scenario: "general",
                        title: "一键批量生成 AI 结构化摘要",
                        subtitle: `准备为 ${total} 篇未读文章提炼摘要与标签…`,
                        cancelLabel: "⏹ 停止批量生成",
                    },
                    async (signal, controls) => {
                        const { enrichClip } = await import("../services/enrich-service.ts");
                        for (const clip of candidates) {
                            if (signal.aborted) {
                                wasAborted = true;
                                break;
                            }
                            controls.update({
                                subtitle: `正在处理（${doneCount + 1}/${total}）：${clip.title || "未命名文章"}`,
                            });
                            try {
                                const outcome = await enrichClip(this.plugin, clip.id, this.getSettings(), { signal });
                                if (outcome.aborted || signal.aborted) {
                                    wasAborted = true;
                                    break;
                                }
                                if (outcome.ok) {
                                    okCount += 1;
                                    this.notifyDataChangedFn();
                                }
                            } catch (err) {
                                console.warn("[glean] 自动摘要单篇失败:", err);
                            }
                            doneCount += 1;
                        }
                        if (signal.aborted) wasAborted = true;
                    },
                );

                if (wasAborted) {
                    showNotice(`已停止批量生成，已完成 ${okCount}/${total} 篇`, 3000, "info");
                } else if (okCount > 0) {
                    showNotice(`已完成 ${okCount}/${total} 篇文章的 AI 结构化摘要`, 3500, "success");
                } else {
                    showNotice("未能生成 AI 结构化摘要，请检查模型配置或今日额度", 3500, "warn");
                }
            } catch (err) {
                console.warn("[glean] 批量生成摘要失败:", err);
                showNotice("批量生成摘要失败", 3000, "error");
            }
            return;
        }

        if (action === "抓取当前网页全文并存入思源") {
            let url = "";
            const cur = this.currentDocIdFn();
            if (cur) {
                try {
                    const { readClip } = await import("../services/clip-store.ts");
                    const clip = await readClip(cur);
                    if (clip?.url) url = clip.url;
                } catch {}
            }

            if (!url && typeof navigator !== "undefined" && navigator.clipboard?.readText) {
                try {
                    const text = (await navigator.clipboard.readText())?.trim() ?? "";
                    if (/^https?:\/\//i.test(text)) url = text;
                } catch {}
            }

            if (!url) {
                showNotice(t(this.getI18n(), "capture.noValidUrl"), 4000, "warn");
                return;
            }

            showNotice(t(this.getI18n(), "capture.webCapturing", { url: url.slice(0, 36) }), 3000, "info");
            const { listNotebooks, createDocWithMd } = await import("../api/client.ts");
            const { resolveDefaultAnchorNotebook, resolveGleanRootPrefix } = await import("../services/settings.ts");
            const notebooks = await listNotebooks().catch(() => []);
            const targetNotebook = resolveDefaultAnchorNotebook(notebooks, this.getSettings().anchorNotebooks);
            if (!targetNotebook) {
                showNotice(t(this.getI18n(), "capture.noAnchorNotebook"), 4000, "warn");
                return;
            }

            const { captureDocument } = await import("../services/clip-store.ts");
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
            const title = t(this.getI18n(), "capture.webClipTitle", { date: dateStr });
            const md = `[${t(this.getI18n(), "capture.webClipSourceLabel")}](${url})\n\n> ${t(this.getI18n(), "capture.webClipLinkOnlyNote")}\n\n- ${t(this.getI18n(), "capture.webClipTargetLabel", { url })}`;

            try {
                const rootPrefix = resolveGleanRootPrefix(this.getSettings(), notebooks, targetNotebook);
                const docId = await createDocWithMd(targetNotebook, `${rootPrefix}/剪藏/${title}`, md);
                if (docId) {
                    await captureDocument(this.plugin, docId, { src: "manual", url });
                    notifyClipSuccess({
                        docId,
                        title,
                        openAction: () => this.openReadingDocumentFn(docId),
                    });
                    lvActivity.record({
                        source: "拾遗",
                        category: "clip",
                        title: `网页收录入库：《${title}》`,
                        linkBlockId: docId,
                        detail: url,
                    });
                    this.notifyDataChangedFn();
                }
            } catch (err) {
                console.warn("[glean] 网页全文收录失败:", err);
                showNotice("网页全文收录失败", 3000, "error");
            }
            return;
        }
    }

    /** 检索剪藏文章标题、摘要与标签（用于小驴罗盘穿透搜索等） */
    async searchClips(keyword: string): Promise<Array<{ id: string; docId: string; title: string; summary?: string; category?: string }>> {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return [];
        try {
            const { loadIndex } = await import("../services/index-store.ts");
            const index = await loadIndex(this.plugin);
            const clips = Object.values(index.clips).filter((c) => !c.internal);
            const matched = clips.filter((c) => {
                const titleMatch = (c.title || "").toLowerCase().includes(kw);
                const summaryMatch = (c.summary || "").toLowerCase().includes(kw);
                const tagMatch = (c.tags || []).some((tag) => tag.toLowerCase().includes(kw));
                const aiTagMatch = (c.aiTags || []).some((tag) => tag.toLowerCase().includes(kw));
                const authorMatch = (c.author || "").toLowerCase().includes(kw);
                const siteMatch = (c.site || "").toLowerCase().includes(kw);
                return titleMatch || summaryMatch || tagMatch || aiTagMatch || authorMatch || siteMatch;
            });
            matched.sort((a, b) => {
                const aTitle = (a.title || "").toLowerCase();
                const bTitle = (b.title || "").toLowerCase();
                const aExact = aTitle === kw ? 2 : aTitle.includes(kw) ? 1 : 0;
                const bExact = bTitle === kw ? 2 : bTitle.includes(kw) ? 1 : 0;
                return bExact - aExact;
            });
            return matched.map((c) => ({
                id: c.id,
                docId: c.id,
                category: c.status === "later" ? "later" : c.status === "done" ? "done" : "clip",
                title: c.title || "未命名文章",
                summary: c.summary || (c.site ? `来源: ${c.site}` : undefined),
            }));
        } catch {
            return [];
        }
    }

    dispose(): void {
        if (this.launchpadCleaner) {
            try {
                this.launchpadCleaner();
            } catch {
                // ignore
            }
            this.launchpadCleaner = undefined;
        }
    }
}

export function createLaunchpadBadge(options: LaunchpadBadgeCoordinatorOptions): LaunchpadBadgeCoordinator {
    try {
        if (typeof LaunchpadBadgeCoordinator === "function") return new LaunchpadBadgeCoordinator(options);
    } catch { /* mock */ }
    return {
        unreadCount: 0, launchpadCleaner: undefined, getUnreadCount: () => 0, setUnreadCount: () => {},
        refreshUnreadCount: () => Promise.resolve(), registerLaunchpad: () => {}, handleQuickAction: () => Promise.resolve(),
        searchClips: () => Promise.resolve([]), dispose: () => {},
    } as unknown as LaunchpadBadgeCoordinator;
}

