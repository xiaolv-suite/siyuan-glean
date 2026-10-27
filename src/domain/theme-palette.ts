export const THEME_PALETTE_IDS = [
    "teal",       // 北欧深松绿（默认）
    "amber",      // 金麦暖阳
    "violet",     // 极客紫罗兰
    "blue",       // 澄海天蓝
    "obsidian",   // 黑曜极简
    "rose",       // 绯红蔷薇
] as const;

export type ThemePaletteId = (typeof THEME_PALETTE_IDS)[number];

export interface ThemePaletteConfig {
    id: ThemePaletteId;
    nameKey: string;
    brand: string;
    brandHover: string;
    brandActive: string;
    accentWheat: string;
    previewHex: string;
    descriptionKey: string;
}

export const THEME_PALETTES: readonly ThemePaletteConfig[] = [
    {
        id: "teal",
        nameKey: "theme.teal",
        brand: "#0D9488",
        brandHover: "#0F766E",
        brandActive: "#115E59",
        accentWheat: "#FB923C",
        previewHex: "#0D9488",
        descriptionKey: "theme.tealDesc",
    },
    {
        id: "amber",
        nameKey: "theme.amber",
        brand: "#D97706",
        brandHover: "#B45309",
        brandActive: "#92400E",
        accentWheat: "#0D9488",
        previewHex: "#D97706",
        descriptionKey: "theme.amberDesc",
    },
    {
        id: "violet",
        nameKey: "theme.violet",
        brand: "#7C3AED",
        brandHover: "#6D28D9",
        brandActive: "#5B21B6",
        accentWheat: "#F59E0B",
        previewHex: "#7C3AED",
        descriptionKey: "theme.violetDesc",
    },
    {
        id: "blue",
        nameKey: "theme.blue",
        brand: "#2563EB",
        brandHover: "#1D4ED8",
        brandActive: "#1E40AF",
        accentWheat: "#10B981",
        previewHex: "#2563EB",
        descriptionKey: "theme.blueDesc",
    },
    {
        id: "obsidian",
        nameKey: "theme.obsidian",
        brand: "#4B5563",
        brandHover: "#374151",
        brandActive: "#1F2937",
        accentWheat: "#0D9488",
        previewHex: "#4B5563",
        descriptionKey: "theme.obsidianDesc",
    },
    {
        id: "rose",
        nameKey: "theme.rose",
        brand: "#E11D48",
        brandHover: "#BE123C",
        brandActive: "#9F1239",
        accentWheat: "#F59E0B",
        previewHex: "#E11D48",
        descriptionKey: "theme.roseDesc",
    },
];

export function normalizeThemePaletteId(value: unknown): ThemePaletteId {
    if (typeof value === "string" && (THEME_PALETTE_IDS as readonly string[]).includes(value)) {
        return value as ThemePaletteId;
    }
    return "teal";
}

export function resolveThemePalette(id: unknown): ThemePaletteConfig {
    const validId = normalizeThemePaletteId(id);
    return THEME_PALETTES.find((p) => p.id === validId) ?? THEME_PALETTES[0];
}
