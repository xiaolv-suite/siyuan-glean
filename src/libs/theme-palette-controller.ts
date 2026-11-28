import { resolveThemePalette, type ThemePaletteId } from "../domain/theme-palette.ts";

export const GLEAN_THEME_PALETTE_STYLE_ID = "glean-theme-palette-vars";

const GLEAN_CONTAINER_SELECTOR =
    ".glean-dock-root, .glean-tab-root, .glean-dialog-root, .glean-mobile-modal, .glean-mobile-fullscreen-dialog, .glean-reading-context-host, .glean-reading-context, .glean-panel, .glean-reader, .glean-settings, .glean-workbench, .glean-ann-editor-backdrop, .glean-ann-editor, .glean-dialog, .glean-popover, .glean-action-popover__body, .glean-reader-help, .glean-preview-pane";

const GLEAN_DIALOG_HOST_SELECTOR = ".b3-dialog.glean-dialog-host";

const PALETTE_STYLE_PROPS = [
    "--lv-brand",
    "--lv-brand-hover",
    "--lv-brand-active",
    "--lv-brand-soft",
    "--lv-accent-wheat",
    "--glean-color-action",
    "--glean-color-action-hover",
    "--glean-color-action-soft",
    "--glean-accent-a",
    "--glean-accent-b",
    "--glean-grad",
    "--glean-grad-soft",
    "--glean-shadow-accent",
] as const;

function buildPaletteDeclarations(paletteId: ThemePaletteId): Array<[string, string]> {
    const config = resolveThemePalette(paletteId);
    const soft = `color-mix(in srgb, ${config.brand} 12%, transparent)`;
    return [
        ["--lv-brand", config.brand],
        ["--lv-brand-hover", config.brandHover],
        ["--lv-brand-active", config.brandActive],
        ["--lv-brand-soft", soft],
        ["--lv-accent-wheat", config.accentWheat],
        ["--glean-color-action", config.brand],
        ["--glean-color-action-hover", config.brandHover],
        ["--glean-color-action-soft", soft],
        ["--glean-accent-a", config.brand],
        ["--glean-accent-b", config.brandHover],
        ["--glean-grad", config.brand],
        [
            "--glean-grad-soft",
            `color-mix(in srgb, ${config.brand} 8%, var(--glean-card-surface))`,
        ],
        ["--glean-shadow-accent", `0 1px 4px color-mix(in srgb, ${config.brand} 22%, transparent)`],
    ];
}

function isGlobalHostElement(el: unknown): boolean {
    if (typeof document === "undefined" || !el) return false;
    return el === document.documentElement || el === document.body;
}

function clearInlinePaletteOnGleanRoots(): void {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
    for (const selector of [GLEAN_CONTAINER_SELECTOR, GLEAN_DIALOG_HOST_SELECTOR]) {
        try {
            const roots = document.querySelectorAll<HTMLElement>(selector);
            for (const root of Array.from(roots)) {
                for (const prop of PALETTE_STYLE_PROPS) {
                    root.style?.removeProperty?.(prop);
                }
            }
        } catch {
            // 测试 DOM 查询异常时安全忽略
        }
    }
}

/**
 * 动态注入拾遗主题色彩变量到指定容器或拾遗自身根容器作用域（严禁污染 <html> / <body> 全局样式）
 */
export function applyThemePaletteToDom(
    targetElement: HTMLElement | null = null,
    paletteId: ThemePaletteId = "teal",
): void {
    if (typeof document === "undefined" && !targetElement) return;
    const effectiveTarget = isGlobalHostElement(targetElement) ? null : targetElement;

    if (effectiveTarget) {
        for (const [prop, value] of buildPaletteDeclarations(paletteId)) {
            effectiveTarget.style?.setProperty?.(prop, value);
        }
        return;
    }

    if (typeof document === "undefined") return;

    const existing = typeof document.getElementById === "function"
        ? document.getElementById(GLEAN_THEME_PALETTE_STYLE_ID)
        : null;

    // 默认 teal 由 index.scss 自身根容器浅/暗色作用域规则接管，不覆盖暗色模式配色
    if (paletteId === "teal") {
        existing?.remove?.();
        clearInlinePaletteOnGleanRoots();
        return;
    }

    const cssBody = buildPaletteDeclarations(paletteId)
        .map(([prop, value]) => `${prop}: ${value};`)
        .join(" ");
    const cssText = `:is(${GLEAN_CONTAINER_SELECTOR}) { ${cssBody} }\n${GLEAN_DIALOG_HOST_SELECTOR} { ${cssBody} }`;

    if (existing) {
        existing.textContent = cssText;
    } else if (document.head && typeof document.createElement === "function") {
        const styleEl = document.createElement("style");
        styleEl.id = GLEAN_THEME_PALETTE_STYLE_ID;
        styleEl.textContent = cssText;
        document.head.appendChild(styleEl);
    }

    clearInlinePaletteOnGleanRoots();
}

/**
 * 插件卸载（onunload）时彻底清理拾遗注入的主题样式节点与根容器内联变量
 */
export function clearThemePaletteFromDom(): void {
    if (typeof document === "undefined") return;
    try {
        const existing = typeof document.getElementById === "function"
            ? document.getElementById(GLEAN_THEME_PALETTE_STYLE_ID)
            : null;
        existing?.remove?.();
    } catch {
        // ignore
    }
    clearInlinePaletteOnGleanRoots();
}
