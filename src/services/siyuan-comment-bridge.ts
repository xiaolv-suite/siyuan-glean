/**
 * 鲸鱼快速批注（HaoCeans/siyuan-comment）深度双向适配桥接层。
 *
 * 能力边界：
 * - 运行时探活：检测 siyuan-comment 是否启用，提取其自定义标记表（customTags）、滑动模式与 AI 助手开关；
 * - 从小驴拾遗直接唤起鲸鱼批注：划词创建批注、调用鲸鱼原生 AI 解释、开启滑动连续批注、点击打开鲸鱼 Protyle 富文本弹窗；
 * - 在拾遗自研 ProtyleHost 中同步触发鲸鱼下划线装饰（35+ 颜色/线型组合）与事件刷新；
 * - 零强依赖：未安装或未启用 siyuan-comment 时静默降级，绝不阻塞小驴拾遗自身功能。
 */
import type { App } from "siyuan";
import { readSiyuanCommentSettings } from "../api/client";
import { BUILTIN_ANNOTATION_TAGS, type AnnotationTagDef } from "../domain/highlights";

export interface SiyuanCommentPluginLike {
    name?: string;
    currentDocId?: string;
    customTags?: unknown[];
    aiAssistantEnabled?: boolean;
    isActivated?: () => boolean;
    handleAddComment?: (protyle: unknown, range?: Range, fromSlide?: boolean) => Promise<boolean> | boolean;
    handleAiAssistant?: (protyle: unknown) => void;
    openCommentEditorForBlock?: (commentBlockId: string, title?: string, anchor?: HTMLElement | null) => void;
    toggleSlideCommentMode?: () => boolean;
    isSlideCommentModeActive?: () => boolean;
    scheduleApplyCommentBlockDecorations?: (refreshIds?: boolean, full?: boolean, reason?: string) => Promise<void> | void;
    setCommentTag?: (commentBlockId: string, tag: string, prevTag?: string) => Promise<void>;
    addReply?: (commentBlockId: string, md: string) => Promise<string | null>;
}

export interface WhaleBridgeStatus {
    installed: boolean;
    activated: boolean;
    slideActive: boolean;
    aiAssistantEnabled: boolean;
    customTags: AnnotationTagDef[];
}

const WHALE_PLUGIN_NAME = "siyuan-comment";
let cachedCustomTags: AnnotationTagDef[] | null = null;

function normalizeTagDefs(rawList: unknown): AnnotationTagDef[] {
    if (!Array.isArray(rawList) || rawList.length === 0) {
        return [...BUILTIN_ANNOTATION_TAGS];
    }
    const out: AnnotationTagDef[] = [];
    const seen = new Set<string>();
    for (const item of rawList) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const value = typeof rec.value === "string" ? rec.value.trim() : "";
        const label = typeof rec.label === "string" ? rec.label.trim() : value;
        const icon = typeof rec.icon === "string" ? rec.icon.trim() : "🏷️";
        const color = typeof rec.color === "string" ? rec.color.trim() : undefined;
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push({
            value,
            label: label || value,
            icon: icon || "🏷️",
            color: color || undefined,
            builtin: Boolean(rec.builtin),
        });
    }
    return out.length > 0 ? out : [...BUILTIN_ANNOTATION_TAGS];
}

export function getSiyuanCommentPlugin(app?: App | null): SiyuanCommentPluginLike | null {
    const candidates: unknown[] = [];
    const appPlugins = (app as unknown as { plugins?: unknown[] } | null | undefined)?.plugins;
    if (Array.isArray(appPlugins)) candidates.push(...appPlugins);
    if (typeof window !== "undefined") {
        const win = window as unknown as {
            siyuan?: { ws?: { app?: { plugins?: unknown[] } } };
            app?: { plugins?: unknown[] };
        };
        if (Array.isArray(win.siyuan?.ws?.app?.plugins)) candidates.push(...win.siyuan.ws.app.plugins);
        if (Array.isArray(win.app?.plugins)) candidates.push(...win.app.plugins);
    }
    for (const entry of candidates) {
        if (entry && typeof entry === "object" && (entry as SiyuanCommentPluginLike).name === WHALE_PLUGIN_NAME) {
            return entry as SiyuanCommentPluginLike;
        }
    }
    return null;
}

export function getWhaleBridgeStatus(app?: App | null): WhaleBridgeStatus {
    const plugin = getSiyuanCommentPlugin(app);
    if (!plugin) {
        return {
            installed: false,
            activated: false,
            slideActive: false,
            aiAssistantEnabled: false,
            customTags: cachedCustomTags ?? [...BUILTIN_ANNOTATION_TAGS],
        };
    }
    let activated = true;
    try {
        if (typeof plugin.isActivated === "function") activated = Boolean(plugin.isActivated());
    } catch {
        activated = true;
    }
    let slideActive = false;
    try {
        if (typeof plugin.isSlideCommentModeActive === "function") slideActive = Boolean(plugin.isSlideCommentModeActive());
    } catch {
        slideActive = false;
    }
    const tags = Array.isArray(plugin.customTags) && plugin.customTags.length > 0
        ? normalizeTagDefs(plugin.customTags)
        : (cachedCustomTags ?? [...BUILTIN_ANNOTATION_TAGS]);
    return {
        installed: true,
        activated,
        slideActive,
        aiAssistantEnabled: Boolean(plugin.aiAssistantEnabled),
        customTags: tags,
    };
}

export async function loadWhaleCustomTags(app?: App | null, forceRefresh = false): Promise<AnnotationTagDef[]> {
    const plugin = getSiyuanCommentPlugin(app);
    if (plugin && Array.isArray(plugin.customTags) && plugin.customTags.length > 0) {
        cachedCustomTags = normalizeTagDefs(plugin.customTags);
        return cachedCustomTags;
    }
    if (cachedCustomTags && !forceRefresh) return cachedCustomTags;
    const settings = await readSiyuanCommentSettings();
    if (settings && Array.isArray(settings.customTags)) {
        cachedCustomTags = normalizeTagDefs(settings.customTags);
        return cachedCustomTags;
    }
    return [...BUILTIN_ANNOTATION_TAGS];
}

export function notifyWhaleCommentUpdated(): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new CustomEvent("siyuan-comment-updated"));
        window.dispatchEvent(new CustomEvent("siyuan-comment-render-refresh"));
    } catch {
        /* ignore */
    }
}

export function refreshWhaleDecorationsInProtyle(app: App | null | undefined, docId: string): void {
    const plugin = getSiyuanCommentPlugin(app);
    if (!plugin || !docId) return;
    try {
        if (!plugin.currentDocId || plugin.currentDocId !== docId) {
            plugin.currentDocId = docId;
        }
        if (typeof plugin.scheduleApplyCommentBlockDecorations === "function") {
            void plugin.scheduleApplyCommentBlockDecorations(false, false, "glean-reader");
        }
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("siyuan-comment-render-refresh"));
        }
    } catch {
        /* soft */
    }
}

export async function triggerWhaleAddComment(
    app: App | null | undefined,
    protyleInstance: unknown,
    range?: Range | null,
): Promise<{ ok: boolean; reason?: "not-installed" | "no-range" | "failed" }> {
    const plugin = getSiyuanCommentPlugin(app);
    if (!plugin || typeof plugin.handleAddComment !== "function") {
        return { ok: false, reason: "not-installed" };
    }
    if (!range || range.collapsed) {
        return { ok: false, reason: "no-range" };
    }
    try {
        if (typeof window !== "undefined") {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range.cloneRange());
            }
        }
        const ok = await plugin.handleAddComment(protyleInstance ?? null, range.cloneRange(), false);
        return { ok: Boolean(ok), reason: ok ? undefined : "failed" };
    } catch {
        return { ok: false, reason: "failed" };
    }
}

export function triggerWhaleAiExplain(
    app: App | null | undefined,
    protyleInstance: unknown,
    range?: Range | null,
): { ok: boolean; reason?: "not-installed" | "no-range" | "failed" } {
    const plugin = getSiyuanCommentPlugin(app);
    if (!plugin || typeof plugin.handleAiAssistant !== "function") {
        return { ok: false, reason: "not-installed" };
    }
    if (!range || range.collapsed) {
        return { ok: false, reason: "no-range" };
    }
    try {
        if (typeof window !== "undefined") {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range.cloneRange());
            }
        }
        plugin.handleAiAssistant(protyleInstance ?? null);
        return { ok: true };
    } catch {
        return { ok: false, reason: "failed" };
    }
}

export function openWhaleCommentEditor(
    app: App | null | undefined,
    commentBlockId: string,
    anchorEl?: HTMLElement | null,
): boolean {
    const plugin = getSiyuanCommentPlugin(app);
    if (!plugin || typeof plugin.openCommentEditorForBlock !== "function" || !commentBlockId) {
        return false;
    }
    try {
        plugin.openCommentEditorForBlock(commentBlockId, undefined, anchorEl ?? null);
        return true;
    } catch {
        return false;
    }
}

export function toggleWhaleSlideMode(app?: App | null): { ok: boolean; active: boolean } {
    const plugin = getSiyuanCommentPlugin(app);
    if (!plugin || typeof plugin.toggleSlideCommentMode !== "function") {
        return { ok: false, active: false };
    }
    try {
        const result = plugin.toggleSlideCommentMode();
        const active = typeof plugin.isSlideCommentModeActive === "function"
            ? Boolean(plugin.isSlideCommentModeActive())
            : Boolean(result);
        return { ok: true, active };
    } catch {
        return { ok: false, active: false };
    }
}

/**
 * 等待 Protyle 从 preview 切换到 wysiwyg 并完成块 DOM 挂载。
 */
export async function waitForWysiwygReady(hostEl: HTMLElement | null, timeoutMs = 1800): Promise<HTMLElement | null> {
    if (!hostEl) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
        const wysiwyg = hostEl.querySelector<HTMLElement>(".protyle-wysiwyg");
        if (wysiwyg && !wysiwyg.classList.contains("fn__none") && wysiwyg.querySelector("[data-node-id]")) {
            return wysiwyg;
        }
        await new Promise((r) => window.setTimeout(r, 40));
    }
    return hostEl.querySelector<HTMLElement>(".protyle-wysiwyg");
}

function findRangeInContainer(container: HTMLElement, needle: string, compactNeedle: string): Range | null {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const normChars: string[] = [];
    const normStart: Array<{ node: Text; offset: number }> = [];
    const normEnd: Array<{ node: Text; offset: number }> = [];
    const compactChars: string[] = [];
    const compactStart: Array<{ node: Text; offset: number }> = [];
    const compactEnd: Array<{ node: Text; offset: number }> = [];
    let lastWasSpace = true;

    let cur: Node | null;
    while ((cur = walker.nextNode())) {
        if (!(cur instanceof Text)) continue;
        if (cur.parentElement?.closest(".protyle-attr, .protyle-action, [custom-siyuan-comment-zone]")) continue;
        const value = cur.nodeValue ?? "";
        for (let i = 0; i < value.length; i += 1) {
            const ch = value[i];
            if (ch === "\u200b" || ch === "\ufeff") continue;
            if (/\s/.test(ch)) {
                if (!lastWasSpace) {
                    normChars.push(" ");
                    normStart.push({ node: cur, offset: i });
                    normEnd.push({ node: cur, offset: i + 1 });
                    lastWasSpace = true;
                }
            } else {
                normChars.push(ch);
                normStart.push({ node: cur, offset: i });
                normEnd.push({ node: cur, offset: i + 1 });
                compactChars.push(ch);
                compactStart.push({ node: cur, offset: i });
                compactEnd.push({ node: cur, offset: i + 1 });
                lastWasSpace = false;
            }
        }
    }
    if (normChars.length === 0) return null;

    const normText = normChars.join("");
    let matchIdx = normText.indexOf(needle);
    let matchLen = needle.length;
    let useCompact = false;

    if (matchIdx < 0 && needle.length > 48) {
        const head = needle.slice(0, 48);
        matchIdx = normText.indexOf(head);
        matchLen = head.length;
    }
    if (matchIdx < 0 && compactNeedle.length >= 4) {
        const compactText = compactChars.join("");
        const sub = compactNeedle.slice(0, Math.min(80, compactNeedle.length));
        const cIdx = compactText.indexOf(sub);
        if (cIdx >= 0) {
            matchIdx = cIdx;
            matchLen = sub.length;
            useCompact = true;
        }
    }
    if (matchIdx < 0) return null;

    const starts = useCompact ? compactStart : normStart;
    const ends = useCompact ? compactEnd : normEnd;
    const startPos = starts[matchIdx];
    const endPos = ends[Math.min(ends.length - 1, matchIdx + matchLen - 1)];
    if (!startPos || !endPos) return null;
    try {
        const range = document.createRange();
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
        return range.collapsed ? null : range;
    } catch {
        return null;
    }
}

/**
 * 在 .protyle-wysiwyg DOM 内按纯文本精确查找对应的 Range（用于从阅读预览态无缝切到鲸鱼批注）。
 * 建立规范化字符到原始 (Text, offset) 的一一映射，解决换行、零宽字符、跨行内标签与跨块选区匹配问题。
 */
export function findTextRangeInWysiwyg(wysiwygEl: HTMLElement | null, targetText: string): Range | null {
    if (!wysiwygEl || typeof document === "undefined") return null;
    const needle = targetText.replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
    if (!needle) return null;
    const compactNeedle = needle.replace(/\s+/g, "");

    const blocks = Array.from(wysiwygEl.querySelectorAll<HTMLElement>("div[data-node-id]"));
    for (const block of blocks) {
        if (block.closest("[custom-siyuan-comment-zone]")) continue;
        const hit = findRangeInContainer(block, needle, compactNeedle);
        if (hit) return hit;
    }
    return findRangeInContainer(wysiwygEl, needle, compactNeedle);
}
