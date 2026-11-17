import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Margin Notes 样式契约守门：严格包含便签卡片四色指示条与动画", () => {
    const scss = fs.readFileSync(new URL("../src/styles/components/margin-notes.scss", import.meta.url), "utf8");
    assert.match(scss, /\.glean-margin-notes/);
    assert.match(scss, /\.glean-margin-note-card/);
    assert.match(scss, /&--color-yellow/);
    assert.match(scss, /&--color-red/);
    assert.match(scss, /&--color-blue/);
    assert.match(scss, /&--color-green/);
    assert.match(scss, /__memo/);
    assert.match(scss, /__actions/);
    assert.match(scss, /__btn/);
    assert.match(scss, /color:\s*var\(--glean-color-action\);/);
    assert.match(scss, /outline:\s*2px solid var\(--glean-color-action\);/);
    assert.match(scss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.glean-margin-note-card\s*\{[\s\S]*transition:\s*var\(--glean-motion-none\)\s*!important;/);
});

test("ReaderTab 边距注记接线契约：接入 marginNotesOpen、Alt+M 快捷键与平滑滚动", () => {
    const tabSource = fs.readFileSync(new URL("../src/ui/ReaderTab.svelte", import.meta.url), "utf8");
    assert.match(tabSource, /let marginNotesOpen = \$state\(true\)/);
    assert.match(tabSource, /event\.altKey && \(event\.key === "m" \|\| event\.key === "M"\)/);
    assert.match(tabSource, /glean-reader__toolbar-margin-notes/);
    assert.match(tabSource, /glean-margin-notes/);
    assert.match(tabSource, /scrollToHighlight\(hl\.id\)/);
    assert.match(tabSource, /glean-margin-note-card__actions/);
    assert.match(tabSource, /glean-margin-note-card__btn/);
});

test("双语 i18n 覆盖：边距注记文案对齐", () => {
    const zh = JSON.parse(fs.readFileSync(new URL("../public/i18n/zh_CN.json", import.meta.url), "utf8"));
    const en = JSON.parse(fs.readFileSync(new URL("../public/i18n/en_US.json", import.meta.url), "utf8"));
    assert.ok(zh["reader.marginNotes"]);
    assert.ok(en["reader.marginNotes"]);
    assert.ok(zh["reader.marginNotesToggle"]);
    assert.ok(en["reader.marginNotesToggle"]);
});
