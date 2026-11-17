export type QuoteCardTheme = "teal" | "paper" | "obsidian" | "minimal";

export interface QuoteCardSource {
    quote: string;
    title?: string;
    author?: string;
    site?: string;
    url?: string;
    color?: string;
    time?: string;
    docId?: string;
    blockId?: string;
}

export interface QuoteCardThemeConfig {
    key: QuoteCardTheme;
    nameKey: string;
    background: string;
    textColor: string;
    secondaryColor: string;
    accentColor: string;
    border: string;
    watermarkColor: string;
}

export const QUOTE_CARD_THEMES: readonly QuoteCardThemeConfig[] = [
    {
        key: "teal",
        nameKey: "quoteCard.themeTeal",
        background: "linear-gradient(135deg, #0F172A 0%, #064E3B 100%)",
        textColor: "#F8FAFC",
        secondaryColor: "#94A3B8",
        accentColor: "#14B8A6",
        border: "1px solid rgba(20, 184, 166, 0.35)",
        watermarkColor: "rgba(248, 250, 252, 0.45)",
    },
    {
        key: "paper",
        nameKey: "quoteCard.themePaper",
        background: "#FBF8F1",
        textColor: "#292524",
        secondaryColor: "#78716C",
        accentColor: "#D97706",
        border: "1px solid #E7DFD0",
        watermarkColor: "rgba(120, 113, 108, 0.5)",
    },
    {
        key: "obsidian",
        nameKey: "quoteCard.themeObsidian",
        background: "#090D16",
        textColor: "#F1F5F9",
        secondaryColor: "#94A3B8",
        accentColor: "#10B981",
        border: "1px solid rgba(16, 185, 129, 0.3)",
        watermarkColor: "rgba(148, 163, 184, 0.55)",
    },
    {
        key: "minimal",
        nameKey: "quoteCard.themeMinimal",
        background: "#FFFFFF",
        textColor: "#0F172A",
        secondaryColor: "#475569",
        accentColor: "#0D9488",
        border: "1px solid #E2E8F0",
        watermarkColor: "rgba(71, 85, 105, 0.55)",
    },
];

export function formatQuoteCardAttribution(title?: string, author?: string, site?: string): string {
    const cleanTitle = (title || "").trim();
    const cleanAuthor = (author || "").trim();
    const cleanSite = (site || "").trim();
    if (!cleanTitle && !cleanAuthor && !cleanSite) return "";
    let res = "";
    if (cleanTitle) res += `《${cleanTitle}》`;
    if (cleanAuthor) res += (res ? ` · ${cleanAuthor}` : cleanAuthor);
    else if (cleanSite) res += (res ? ` · ${cleanSite}` : cleanSite);
    return res ? `—— ${res}` : "";
}

export function formatQuoteShareText(source: QuoteCardSource): string {
    const quote = (source.quote || "").trim();
    const attr = formatQuoteCardAttribution(source.title, source.author, source.site);
    return attr ? `“${quote}”\n\n${attr}` : `“${quote}”`;
}

export type QuoteCardFontSize = "sm" | "md" | "lg";

export interface QuoteCardFontConfig {
    key: QuoteCardFontSize;
    nameKey: string;
    fontSize: number;
    lineHeight: number;
    quoteMarkSize: number;
}

export const QUOTE_CARD_FONTS: Record<QuoteCardFontSize, QuoteCardFontConfig> = {
    sm: { key: "sm", nameKey: "quoteCard.fontSm", fontSize: 15, lineHeight: 26, quoteMarkSize: 30 },
    md: { key: "md", nameKey: "quoteCard.fontMd", fontSize: 17, lineHeight: 30, quoteMarkSize: 36 },
    lg: { key: "lg", nameKey: "quoteCard.fontLg", fontSize: 21, lineHeight: 36, quoteMarkSize: 42 },
};

export function resolveQuoteCardFont(size: QuoteCardFontSize = "md"): QuoteCardFontConfig {
    return QUOTE_CARD_FONTS[size] || QUOTE_CARD_FONTS.md;
}
