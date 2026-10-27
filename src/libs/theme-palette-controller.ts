import { resolveThemePalette, type ThemePaletteId } from "../domain/theme-palette.ts";

/**
 * 动态注入全局主题色彩变量到目标 DOM 容器或 documentElement
 */
export function applyThemePaletteToDom(
    targetElement: HTMLElement | null = null,
    paletteId: ThemePaletteId = "teal",
): void {
    if (typeof document === "undefined" && !targetElement) return;
    const config = resolveThemePalette(paletteId);
    const target = targetElement ?? (typeof document !== "undefined" ? document.documentElement : null);
    if (!target) return;

    target.style.setProperty("--lv-brand", config.brand);
    target.style.setProperty("--lv-brand-hover", config.brandHover);
    target.style.setProperty("--lv-brand-active", config.brandActive);
    target.style.setProperty("--lv-brand-soft", `color-mix(in srgb, ${config.brand} 12%, transparent)`);
    target.style.setProperty("--lv-accent-wheat", config.accentWheat);
    target.style.setProperty("--glean-accent-a", config.brand);
    target.style.setProperty("--glean-accent-b", config.brandHover);
    target.style.setProperty("--glean-grad", `linear-gradient(135deg, ${config.brand} 0%, ${config.brandHover} 100%)`);
    target.style.setProperty(
        "--glean-grad-soft",
        `linear-gradient(135deg, color-mix(in srgb, ${config.brand} 12%, transparent), color-mix(in srgb, ${config.brand} 6%, transparent))`
    );
    target.style.setProperty("--glean-shadow-accent", `0 4px 14px -4px color-mix(in srgb, ${config.brand} 36%, transparent)`);
}
