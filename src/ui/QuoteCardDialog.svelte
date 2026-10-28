<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { t } from "../libs/i18n";
    import { loadUiPrefs } from "../services/prefs";
    import type { GleanFacade } from "../types";
    import {
        QUOTE_CARD_THEMES,
        formatQuoteCardAttribution,
        formatQuoteShareText,
        type QuoteCardSource,
        type QuoteCardTheme,
    } from "../domain/quote-card";
    import { formatCitation, type CitationItem } from "../domain/citation";

    interface Props {
        facade: GleanFacade;
        source: QuoteCardSource;
    }

    let { facade, source }: Props = $props();
    const i18n = $derived(facade.i18n);

    let activeThemeKey = $state<QuoteCardTheme>("teal");
    let copying = $state(false);
    let downloading = $state(false);

    onMount(() => {
        void loadUiPrefs(facade.pluginInstance).then((prefs) => {
            if (prefs.themePalette === "amber") activeThemeKey = "paper";
            else if (prefs.themePalette === "obsidian") activeThemeKey = "obsidian";
            else if (prefs.themePalette === "teal") activeThemeKey = "teal";
        }).catch(() => undefined);
    });

    const activeTheme = $derived(
        QUOTE_CARD_THEMES.find((theme) => theme.key === activeThemeKey) ?? QUOTE_CARD_THEMES[0]
    );

    const attributionText = $derived(
        formatQuoteCardAttribution(source.title, source.author, source.site)
    );

    function colorLabel(color?: string): string {
        switch (color) {
            case "red": return t(i18n, "reader.color.red");
            case "blue": return t(i18n, "reader.color.blue");
            case "green": return t(i18n, "reader.color.green");
            default: return t(i18n, "reader.color.yellow");
        }
    }

    function colorBadgeHex(color?: string): string {
        switch (color) {
            case "red": return "#EF4444";
            case "blue": return "#3B82F6";
            case "green": return "#10B981";
            default: return "#EAB308";
        }
    }

    /** 将卡片绘制到高分辨率 Canvas（2x Retina） */
    function renderCardToCanvas(): HTMLCanvasElement {
        const width = 640;
        const padding = 44;
        const scale = 2;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("无法创建 Canvas 2D 绘图上下文");

        // 预估行高与文本换行
        ctx.font = '17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
        const maxTextWidth = width - padding * 2;
        const lines: string[] = [];

        const rawParagraphs = (source.quote || "").split(/\r?\n/).filter((p) => p.trim());
        for (const para of rawParagraphs) {
            let currentLine = "";
            for (const char of para) {
                const testLine = currentLine + char;
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxTextWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) lines.push(currentLine);
        }

        const lineHeight = 30;
        const quoteTextHeight = Math.max(lines.length * lineHeight, 40);
        const topHeaderHeight = 44;
        const attrHeight = attributionText ? 40 : 0;
        const footerHeight = 40;
        const totalHeight = padding * 2 + topHeaderHeight + quoteTextHeight + attrHeight + footerHeight;

        canvas.width = width * scale;
        canvas.height = totalHeight * scale;
        ctx.scale(scale, scale);

        // 1. 绘制背景
        if (activeTheme.key === "teal") {
            const grad = ctx.createLinearGradient(0, 0, width, totalHeight);
            grad.addColorStop(0, "#0F172A");
            grad.addColorStop(1, "#064E3B");
            ctx.fillStyle = grad;
        } else if (activeTheme.key === "paper") {
            ctx.fillStyle = "#FBF8F1";
        } else if (activeTheme.key === "obsidian") {
            ctx.fillStyle = "#090D16";
        } else {
            ctx.fillStyle = "#FFFFFF";
        }
        ctx.fillRect(0, 0, width, totalHeight);

        // 2. 绘制卡片内框与发光微边框
        ctx.lineWidth = 1;
        ctx.strokeStyle = activeTheme.key === "teal"
            ? "rgba(20, 184, 166, 0.4)"
            : activeTheme.key === "obsidian"
            ? "rgba(16, 185, 129, 0.3)"
            : activeTheme.key === "paper"
            ? "#E7DFD0"
            : "#E2E8F0";
        ctx.strokeRect(16, 16, width - 32, totalHeight - 32);

        // 3. 顶部：装饰性引号与色彩标签
        ctx.font = 'bold 36px Georgia, serif';
        ctx.fillStyle = activeTheme.accentColor;
        ctx.fillText("“", padding, padding + 24);

        // 色彩小微标
        const badgeText = colorLabel(source.color);
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const badgeMetrics = ctx.measureText(badgeText);
        const badgeX = width - padding - badgeMetrics.width - 24;
        const badgeY = padding + 6;

        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeMetrics.width + 24, 22, 11);
        ctx.fill();

        ctx.fillStyle = colorBadgeHex(source.color);
        ctx.beginPath();
        ctx.arc(badgeX + 10, badgeY + 11, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = activeTheme.secondaryColor;
        ctx.fillText(badgeText, badgeX + 18, badgeY + 15);

        // 4. 正文引语
        let textY = padding + topHeaderHeight + 20;
        ctx.font = '17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = activeTheme.textColor;
        for (const line of lines) {
            ctx.fillText(line, padding, textY);
            textY += lineHeight;
        }

        // 5. 出处信息
        if (attributionText) {
            textY += 16;
            ctx.font = 'italic 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.fillStyle = activeTheme.secondaryColor;
            ctx.fillText(attributionText, padding, textY);
            textY += 20;
        }

        // 6. 底部水印
        const footerY = totalHeight - padding + 10;
        ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = activeTheme.watermarkColor;
        ctx.fillText(t(i18n, "quoteCard.watermark"), padding, footerY);

        return canvas;
    }

    async function copyCardImage(): Promise<void> {
        if (copying) return;
        copying = true;
        try {
            const canvas = renderCardToCanvas();
            canvas.toBlob(async (blob) => {
                if (!blob) throw new Error("生成图片 Blob 失败");
                try {
                    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                    showMessage(t(i18n, "quoteCard.copiedImage"), 3000);
                } catch {
                    // 若剪贴板图片写入不支持，自动降级为保存图片
                    saveCardImage();
                } finally {
                    copying = false;
                }
            }, "image/png");
        } catch (error) {
            console.warn("[LvGlean] 复制金句卡片图片失败:", error);
            saveCardImage();
            copying = false;
        }
    }

    function saveCardImage(): void {
        if (downloading) return;
        downloading = true;
        try {
            const canvas = renderCardToCanvas();
            canvas.toBlob((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `quote-${source.docId || "card"}-${Date.now().toString(36)}.png`;
                document.body.append(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                downloading = false;
            }, "image/png");
        } catch (error) {
            console.warn("[LvGlean] 保存金句卡片图片失败:", error);
            downloading = false;
        }
    }

    async function copyCardText(): Promise<void> {
        try {
            await navigator.clipboard.writeText(formatQuoteShareText(source));
            showMessage(t(i18n, "quoteCard.copiedText"), 2500);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2500);
        }
    }

    async function copyCardBlockRef(): Promise<void> {
        const id = source.blockId || source.docId;
        if (!id) return;
        const title = source.title || source.quote.trim().slice(0, 30);
        const refText = `((${id} '${title}'))`;
        try {
            await navigator.clipboard.writeText(refText);
            showMessage(t(i18n, "reader.blockRefCopied"), 2000);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    }

    async function copyCardCitation(): Promise<void> {
        const item: CitationItem = {
            id: source.docId || "",
            title: source.title || "",
            author: source.author,
            site: source.site,
            url: "",
            time: source.time,
        };
        const text = formatCitation(item, "gbt");
        try {
            await navigator.clipboard.writeText(text);
            showMessage(t(i18n, "citation.gbtCopied"), 2000);
        } catch {
            showMessage(t(i18n, "msg.actionFailed"), 2000);
        }
    }

    function onKeyDown(e: KeyboardEvent): void {
        const target = e.target instanceof Element ? e.target : null;
        if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "1") {
            e.preventDefault();
            activeThemeKey = "teal";
        } else if (e.key === "2") {
            e.preventDefault();
            activeThemeKey = "paper";
        } else if (e.key === "3") {
            e.preventDefault();
            activeThemeKey = "obsidian";
        } else if (e.key === "4") {
            e.preventDefault();
            activeThemeKey = "minimal";
        } else if ((e.key === "c" || e.key === "C") && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void copyCardImage();
        } else if (e.altKey && (e.key === "c" || e.key === "C")) {
            e.preventDefault();
            void copyCardCitation();
        } else if ((e.key === "c" || e.key === "C") && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) void copyCardText();
            else void copyCardImage();
        } else if ((e.key === "s" || e.key === "S") && !e.altKey) {
            e.preventDefault();
            saveCardImage();
        } else if ((e.key === "y" || e.key === "Y") && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (source.blockId || source.docId) {
                e.preventDefault();
                void copyCardBlockRef();
            }
        }
    }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="glean-quote-card-dialog">
    <div class="glean-quote-card-themes" role="group" aria-label={t(i18n, "reader.appearanceTheme")}>
        {#each QUOTE_CARD_THEMES as theme, idx}
            <button
                type="button"
                class="glean-quote-card-theme-btn"
                class:glean-quote-card-theme-btn--active={activeThemeKey === theme.key}
                onclick={() => activeThemeKey = theme.key}
                title={`${t(i18n, theme.nameKey)} (${idx + 1})`}
            >
                <span class="glean-quote-card-theme-preview glean-quote-card-theme-preview--{theme.key}"></span>
                <span>{t(i18n, theme.nameKey)}</span>
            </button>
        {/each}
    </div>

    <div class="glean-quote-card-stage">
        <article
            class="glean-quote-card-preview glean-quote-card-preview--{activeThemeKey}"
            style:background={activeTheme.background}
            style:color={activeTheme.textColor}
            style:border={activeTheme.border}
        >
            <div class="glean-quote-card-header">
                <span class="glean-quote-card-quote-mark" style:color={activeTheme.accentColor}>“</span>
                <span class="glean-quote-card-color-badge" style:color={activeTheme.secondaryColor}>
                    <i class="glean-quote-card-dot" style:background={colorBadgeHex(source.color)}></i>
                    {colorLabel(source.color)}
                </span>
            </div>

            <blockquote class="glean-quote-card-body">
                {source.quote}
            </blockquote>

            {#if attributionText}
                <div class="glean-quote-card-attr" style:color={activeTheme.secondaryColor}>
                    {attributionText}
                </div>
            {/if}

            <footer class="glean-quote-card-footer" style:color={activeTheme.watermarkColor}>
                <span>{t(i18n, "quoteCard.watermark")}</span>
            </footer>
        </article>
    </div>

    <div class="glean-quote-card-actions">
        <button
            type="button"
            class="glean-btn glean-btn--pri glean-quote-card-btn"
            disabled={copying}
            onclick={() => void copyCardImage()}
            title="{t(i18n, 'quoteCard.copyImage')} (C)"
        >
            <svg class="glean-icon glean-icon--sm" aria-hidden="true"><use href="#iconGleanCopy" /></svg>
            <span>{copying ? t(i18n, "panel.loading") : t(i18n, "quoteCard.copyImage")}</span>
        </button>
        <button
            type="button"
            class="glean-btn glean-btn--ghost glean-quote-card-btn"
            disabled={downloading}
            onclick={saveCardImage}
            title="{t(i18n, 'quoteCard.saveImage')} (S)"
        >
            <span>💾 {downloading ? t(i18n, "panel.loading") : t(i18n, "quoteCard.saveImage")}</span>
        </button>
        <button
            type="button"
            class="glean-btn glean-btn--ghost glean-quote-card-btn"
            onclick={() => void copyCardText()}
            title="{t(i18n, 'quoteCard.copyText')} (Shift+C)"
        >
            <span>📝 {t(i18n, "quoteCard.copyText")}</span>
        </button>
        {#if source.blockId || source.docId}
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-quote-card-btn"
                onclick={() => void copyCardBlockRef()}
                title="{t(i18n, 'action.copyBlockRef')} (Y)"
            >
                <span>🔗 {t(i18n, "action.copyBlockRef")}</span>
            </button>
        {/if}
        {#if source.title}
            <button
                type="button"
                class="glean-btn glean-btn--ghost glean-quote-card-btn"
                onclick={() => void copyCardCitation()}
                title="{t(i18n, 'citation.copyGBT')} (Alt+C)"
            >
                <span>📄 {t(i18n, "citation.copyGBT")}</span>
            </button>
        {/if}
    </div>

    <div class="glean-kbdhint" style="margin-top: 2px; justify-content: center;">
        <span class="glean-kbdhint__keys" aria-hidden="true">
            <kbd>1-4</kbd> {t(i18n, "reader.appearanceTheme")}
            <kbd>C</kbd> {t(i18n, "quoteCard.copyImage")}
            <kbd>Shift+C</kbd> {t(i18n, "quoteCard.copyText")}
            <kbd>S</kbd> {t(i18n, "quoteCard.saveImage")}
            {#if source.blockId || source.docId}<kbd>Y</kbd> {t(i18n, "action.copyBlockRef")}{/if}
            {#if source.title}<kbd>Alt+C</kbd> {t(i18n, "citation.copyGBT")}{/if}
        </span>
    </div>
</div>

<style>
    .glean-quote-card-dialog {
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-3);
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
    }

    .glean-quote-card-themes {
        display: flex;
        align-items: center;
        gap: var(--glean-space-2);
        padding: var(--glean-space-1);
        border-radius: var(--glean-radius-pill);
        background: color-mix(in srgb, var(--b3-theme-surface) 90%, transparent);
        border: 1px solid var(--glean-border-soft);
        flex-wrap: wrap;
    }

    .glean-quote-card-theme-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: var(--glean-radius-pill);
        border: 1px solid transparent;
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: var(--glean-text-xs-plus);
        cursor: pointer;
        transition: all var(--glean-duration-fast) ease;
    }

    .glean-quote-card-theme-btn:hover {
        background: color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
    }

    .glean-quote-card-theme-btn--active {
        background: color-mix(in srgb, var(--lv-brand) 12%, var(--b3-theme-surface));
        color: var(--lv-brand);
        font-weight: var(--glean-weight-semibold);
        border-color: color-mix(in srgb, var(--lv-brand) 28%, transparent);
    }

    .glean-quote-card-theme-preview {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 1px solid rgba(0,0,0,0.15);
    }

    .glean-quote-card-theme-preview--teal { background: #064E3B; }
    .glean-quote-card-theme-preview--paper { background: #FBF8F1; }
    .glean-quote-card-theme-preview--obsidian { background: #090D16; }
    .glean-quote-card-theme-preview--minimal { background: #FFFFFF; }

    .glean-quote-card-stage {
        flex: 1;
        min-height: 280px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow-y: auto;
        padding: var(--glean-space-3);
        background: color-mix(in srgb, var(--b3-theme-background) 80%, transparent);
        border-radius: var(--glean-radius-md);
        border: 1px solid var(--glean-border-soft);
    }

    .glean-quote-card-preview {
        width: 100%;
        max-width: 520px;
        padding: 32px 28px;
        border-radius: var(--glean-radius-14);
        box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.25);
        display: flex;
        flex-direction: column;
        gap: var(--glean-space-3);
        box-sizing: border-box;
        transition: all var(--glean-duration-base) var(--glean-ease-out);
    }

    .glean-quote-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .glean-quote-card-quote-mark {
        font-family: Georgia, serif;
        font-size: 32px;
        line-height: 1;
        font-weight: bold;
    }

    .glean-quote-card-color-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: var(--glean-radius-pill);
        background: color-mix(in srgb, currentColor 8%, transparent);
    }

    .glean-quote-card-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
    }

    .glean-quote-card-body {
        margin: 0;
        font-size: 15.5px;
        line-height: 1.65;
        letter-spacing: 0.01em;
        white-space: pre-wrap;
        word-break: break-word;
        font-weight: 500;
    }

    .glean-quote-card-attr {
        font-size: 12.5px;
        line-height: 1.4;
        font-style: italic;
        text-align: right;
    }

    .glean-quote-card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10.5px;
        padding-top: var(--glean-space-2);
        border-top: 1px dashed color-mix(in srgb, currentColor 20%, transparent);
    }

    .glean-quote-card-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--glean-space-2);
        flex-wrap: wrap;
    }

    .glean-quote-card-btn {
        min-height: 36px;
        padding: 0 var(--glean-space-3);
    }
</style>
