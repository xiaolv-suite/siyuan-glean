import test from "node:test";
import assert from "node:assert/strict";
import {
    THEME_PALETTES,
    THEME_PALETTE_IDS,
    normalizeThemePaletteId,
    resolveThemePalette,
} from "../src/domain/theme-palette.ts";
import { applyThemePaletteToDom } from "../src/libs/theme-palette-controller.ts";

test("THEME_PALETTES 包含 6 款精选主题方案且字段完备", () => {
    assert.equal(THEME_PALETTES.length, 6);
    for (const id of THEME_PALETTE_IDS) {
        const item = THEME_PALETTES.find((p) => p.id === id);
        assert.ok(item, `缺失主题 ${id}`);
        assert.ok(item.brand.startsWith("#"));
        assert.ok(item.brandHover.startsWith("#"));
        assert.ok(item.brandActive.startsWith("#"));
        assert.ok(item.accentWheat.startsWith("#"));
        assert.ok(item.previewHex.startsWith("#"));
    }
});

test("normalizeThemePaletteId 非法值默认安全回退到 teal", () => {
    assert.equal(normalizeThemePaletteId("violet"), "violet");
    assert.equal(normalizeThemePaletteId("amber"), "amber");
    assert.equal(normalizeThemePaletteId("blue"), "blue");
    assert.equal(normalizeThemePaletteId("obsidian"), "obsidian");
    assert.equal(normalizeThemePaletteId("rose"), "rose");
    assert.equal(normalizeThemePaletteId("non-exist"), "teal");
    assert.equal(normalizeThemePaletteId(null), "teal");
    assert.equal(normalizeThemePaletteId(undefined), "teal");
});

test("resolveThemePalette 准确返回对应的主题配置", () => {
    const teal = resolveThemePalette("teal");
    assert.equal(teal.brand, "#0D9488");

    const violet = resolveThemePalette("violet");
    assert.equal(violet.brand, "#7C3AED");

    const amber = resolveThemePalette("amber");
    assert.equal(amber.brand, "#D97706");
});

test("applyThemePaletteToDom 正确注入 CSS 变量到 DOM 元素", () => {
    const styleMap = new Map<string, string>();
    const mockElement = {
        style: {
            setProperty(prop: string, val: string) {
                styleMap.set(prop, val);
            },
        },
    } as unknown as HTMLElement;

    applyThemePaletteToDom(mockElement, "violet");
    assert.equal(styleMap.get("--lv-brand"), "#7C3AED");
    assert.equal(styleMap.get("--lv-brand-hover"), "#6D28D9");
    assert.equal(styleMap.get("--lv-accent-wheat"), "#F59E0B");
    assert.ok(styleMap.get("--glean-grad")?.includes("#7C3AED"));

    applyThemePaletteToDom(mockElement, "amber");
    assert.equal(styleMap.get("--lv-brand"), "#D97706");
});
