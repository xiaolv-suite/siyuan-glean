import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    cleanHighlightText, decodeSiyuanCommentIalValue, escapeHighlightText, filterHighlights, formatHighlightShare, formatHighlightTime,
    groupHighlightsByArticle, highlightBlockLink, highlightFacets, highlightMarker, pageHighlights,
    parseIalAttr, parseSiyuanCommentReplies, renderArticleHighlightsMarkdown, renderHighlightsCsv, renderHighlightsMarkdown,
    resolveAnnotationTagDisplay, retainHighlightSelection, safeHighlightCsvCell, selectHighlights, type HighlightItem,
} from "../src/domain/highlights.ts";

const rootId = "20261004100000-aaaaaaa";
const labels = { title: "摘录汇编", original: "返回原块", source: "来源网页" };

function item(offset: number, overrides: Partial<HighlightItem> = {}): HighlightItem {
    return {
        id: `20261004120000-${String(offset).padStart(7, "0")}`, rootId, title: "文章", text: "正文摘录", markdown: "> **正文摘录**",
        box: "box-1", hpath: "/folder/文章", site: "example.test", tags: ["用户"], aiTags: ["模型"], url: "https://example.test/article",
        source: { content: "正文摘录", markdown: "> **正文摘录**", type: "b", highlight: "" }, ...overrides,
    };
}

test("搜索覆盖摘录及文章元数据，站点和两种标签独立精确筛选", () => {
    const items = [item(1, { color: "red" }), item(2, { tags: ["模型"], aiTags: ["用户"], site: "other.test", text: "other text", color: "blue" })];
    assert.deepEqual(filterHighlights(items, { search: "正文 EXAMPLE", site: "example.test", tag: "用户", aiTag: "模型" }).map((value) => value.id), [items[0].id]);
    assert.deepEqual(filterHighlights(items, { tag: "模型" }).map((value) => value.id), [items[1].id]);
    assert.deepEqual(filterHighlights(items, { aiTag: "模型" }).map((value) => value.id), [items[0].id]);
    assert.deepEqual(filterHighlights(items, { color: "red" }).map((value) => value.id), [items[0].id]);
    assert.deepEqual(filterHighlights(items, { color: "blue" }).map((value) => value.id), [items[1].id]);
    assert.equal(filterHighlights(items, { color: "yellow" }).length, 0);
    assert.equal(filterHighlights(items, { tag: "用" }).length, 0);
    assert.equal(filterHighlights(items, { search: "no-match" }).length, 0);
    assert.deepEqual(highlightFacets(items), { sites: ["example.test", "other.test"], tags: ["模型", "用户"], aiTags: ["模型", "用户"], annotationTags: [] });
    // 支持按批注思考 (memo) 搜索与按 annotationTag 筛选
    const itemWithMemo = item(3, { memo: "深度学习注意力机制瓶颈", annotationTag: "important", annotationKind: "siyuan-comment" });
    assert.deepEqual(filterHighlights([...items, itemWithMemo], { search: "注意力机制" }).map((v) => v.id), [itemWithMemo.id]);
    assert.deepEqual(filterHighlights([...items, itemWithMemo], { annotationTag: "important" }).map((v) => v.id), [itemWithMemo.id]);
});

test("稳定排序用块 ID 打破相同标题，纯投影不改变输入", () => {
    const items = [item(3, { title: "B" }), item(2, { title: "A" }), item(1, { title: "A" })];
    const before = structuredClone(items);
    assert.deepEqual(filterHighlights(items, { sort: "title", direction: "asc" }).map((value) => value.id), [items[2].id, items[1].id, items[0].id]);
    assert.deepEqual(filterHighlights(items, { sort: "title", direction: "desc" }).map((value) => value.id), [items[0].id, items[2].id, items[1].id]);
    assert.deepEqual(filterHighlights(items, { direction: "desc" }).map((value) => value.id), [items[0].id, items[1].id, items[2].id]);
    assert.deepEqual(items, before);
});

test("分页处理最后页、空结果与非法页值", () => {
    const items = Array.from({ length: 41 }, (_, offset) => item(offset + 1));
    assert.equal(pageHighlights(items, 2).items.length, 20);
    assert.deepEqual(pageHighlights(items, 999), { items: [items[40]], page: 3, pages: 3, total: 41 });
    assert.equal(pageHighlights(items, Number.NaN, -1).page, 1);
    assert.deepEqual(pageHighlights([], 8), { items: [], page: 1, pages: 1, total: 0 });
});

test("多选跨页保留，导出只消费显式 ID，不将空选解释为全部", () => {
    const items = [item(1), item(2), item(3)];
    assert.deepEqual(selectHighlights(items, [items[2].id, items[0].id]), [items[0], items[2]]);
    assert.deepEqual(selectHighlights(items, []), []);
    assert.deepEqual(retainHighlightSelection(items.slice(1), [items[0].id, items[2].id, items[2].id]), [items[2].id]);
    assert.throws(() => selectHighlights(items, ["unknown"]));
    assert.throws(() => selectHighlights([items[0], items[0]], [items[0].id]));
});

test("非空自定义标记精确取值，不消费相似键或未标记段落", () => {
    assert.equal(highlightMarker('{: id="x" custom-clip-highlight="yellow"}'), "yellow");
    assert.equal(highlightMarker('{: custom-clip-highlight=""}'), "");
    assert.equal(highlightMarker('{: other-custom-clip-highlight="yellow"}'), "");
    assert.equal(highlightMarker('{: custom-clip-highlight-extra="yellow"}'), "");
    assert.equal(cleanHighlightText(" &nbsp;首行\r\n第二行\u00a0 "), "首行\n第二行");
});

test("Markdown 逐行转义纯文本引述，HTML、块引用、IAL 和链接不成为指令", () => {
    const selected = item(1, { text: "# 标题\n\n<script>alert(1)</script>\n[链接](javascript:evil)\n((块引用))\n{: custom-x=\"value\"}\n```\n$公式$", title: "[文章]\n# 标题", url: "javascript:evil" });
    const markdown = renderHighlightsMarkdown([selected], labels);
    assert.ok(markdown.includes("> \\# 标题\n> \n> &lt;script&gt;alert\\(1\\)&lt;/script&gt;"));
    assert.ok(markdown.includes("> \\[链接\\]\\(javascript:evil\\)"));
    assert.ok(markdown.includes("> \\(\\(块引用\\)\\)"));
    assert.ok(markdown.includes("> \\{: custom\\-x=\"value\"\\}"));
    assert.ok(markdown.includes("> \\`\\`\\`"));
    assert.ok(markdown.includes("> \\$公式\\$"));
    assert.ok(markdown.includes(`siyuan://blocks/${selected.id}`));
    assert.ok(markdown.includes(`siyuan://blocks/${rootId}`));
    assert.ok(!markdown.includes("来源网页:"));
    assert.ok(!markdown.includes(selected.markdown));
    assert.equal(escapeHighlightText("\\* & <"), "\\\\\\* &amp; &lt;");
});

test("合法来源原始 URL 保留，危险目标不作为 Markdown 链接", () => {
    const url = "https://example.test/article?one=1&two=2#part";
    assert.ok(renderHighlightsMarkdown([item(1, { url })], labels).includes(`](<${url}>)`));
    for (const invalid of ["javascript:evil", "https://example.test/\nunsafe", "https://example.test/<unsafe>", "https://example.test/\\unsafe"]) {
        assert.ok(!renderHighlightsMarkdown([item(1, { url: invalid })], labels).includes("来源网页:"));
    }
    assert.throws(() => highlightBlockLink("bad'ID"));
});

test("CSV 每个字段防公式注入，保留引号、逗号、多行与独立标签列", () => {
    for (const value of ["=SUM(1,2)", "+cmd", "-2+3", "@cmd", " \t=cmd", "\u0000@cmd", "\tplain", "\rplain", "\nplain"]) assert.ok(safeHighlightCsvCell(value).startsWith('"\''));
    assert.equal(safeHighlightCsvCell('正常,"文字"'), '"正常,""文字"""');
    const csv = renderHighlightsCsv([item(1, { title: "=cmd", text: '两行\n第二行,"引用"', tags: ["=user"], aiTags: ["@model"] })]);
    assert.ok(csv.includes('"userTags","aiTags"'));
    assert.ok(csv.includes('"\'=cmd"'));
    assert.ok(csv.includes('"\'=user","\'@model"'));
    assert.ok(csv.includes('"两行\n第二行,""引用"""'));
    assert.ok(csv.endsWith("\r\n"));
    assert.ok(csv.includes(`siyuan://blocks/${item(1).id}`));
});

test("formatHighlightShare：格式化单条引述、来源与确切块链接（T-1803）", () => {
    const single = item(1, {
        id: "20261019153000-block01",
        title: "设计之美",
        site: "design.test",
        text: ["设计不仅是外观，更是事物运作的方式。", "细节决定成败。"].join(String.fromCharCode(10)),
    });

    const share = formatHighlightShare(single);
    assert.ok(share.includes("> 设计不仅是外观，更是事物运作的方式。"));
    assert.ok(share.includes("> 细节决定成败。"));
    assert.ok(share.includes("> —— 设计之美（design.test）"));
    assert.ok(share.includes("> siyuan://blocks/20261019153000-block01"));

    const noSite = item(2, {
        id: "20261019153000-block02",
        title: "无站点文章",
        site: "",
        text: "简单至上",
    });
    assert.ok(formatHighlightShare(noSite).includes("> —— 无站点文章"));
});

test("formatHighlightTime：从思源块 ID 解析时间线索（T-1753）", () => {
    assert.equal(formatHighlightTime("20261019153000-abcdefg"), "2026-10-19 15:30");
    assert.equal(formatHighlightTime("20250101090500-1234567"), "2025-01-01 09:05");
    assert.equal(formatHighlightTime("invalid-id"), "");
    assert.equal(formatHighlightTime(""), "");
});

test("HighlightView 接线：全库制卡贯通与导出预览 Escape 退出交互（T-3394）", () => {
    const view = readFileSync(new URL("../src/ui/HighlightView.svelte", import.meta.url), "utf8");
    // 全库与当前文档均支持制卡（不再用 {#if scope === "current"} 人为屏蔽）
    assert.doesNotMatch(view, /\{#if scope === "current"\}<button[^>]*flashcard\.make/);
    assert.match(view, /onclick=\{\(\) => void card\(item\)\}\s+title=\{t\(i18n, "flashcard\.make"\)\}/);
    // 导出预览支持 <svelte:window> Escape 关闭
    assert.match(view, /<svelte:window onkeydown=\{onWindowKeyDown\} \/>/);
    assert.match(view, /if \(event\.key === "Escape"\) \{/);
    assert.match(view, /if \(session && !exportBusy\)/);
    // 搜索输入框按 Escape 清空当前搜索词
    assert.match(view, /if \(event\.key === "Escape" && search\)/);
    // 统计优先：顶部指标条
    assert.match(view, /class="glean-stat-strip"/);
});

test("HighlightView 行级键盘导航复用读库仲裁层（T-3399 / T-3509）", () => {
    const view = readFileSync(new URL("../src/ui/HighlightView.svelte", import.meta.url), "utf8");
    assert.match(view, /import \{ moveLibraryCursor, resolveLibraryShortcut \} from "\.\.\/domain\/library-keyboard"/);
    assert.match(view, /function hasBlockingOverlay\(\): boolean/);
    assert.match(view, /if \(hasBlockingOverlay\(\)\) return;/);
    assert.match(view, /overlay: hasBlockingOverlay\(\)/);
    assert.match(view, /const visibleIds = \$derived\(/);
    assert.match(view, /if \(cursorId && !visibleIds\.includes\(cursorId\)\) cursorId = ""/);
    assert.match(view, /setCursor\(moveLibraryCursor\(visibleIds, cursorId, action\.delta\)\)/);
    assert.match(view, /if \(action\.type === "toggleSelect"\) toggle\(item\.id\)/);
    assert.match(view, /if \(action\.type === "activate"\) openDoc\(item\.rootId, item\.id\)/);
    assert.match(view, /if \(!\["move", "toggleSelect", "activate", "copyBlockRef", "copyCitation", "copyBibTeX"\]\.includes\(action\.type\)\) return;/);
    assert.match(view, /if \(action\.type === "copyBlockRef"\) void copyQuoteBlockRef\(item\)/);
    assert.match(view, /if \(action\.type === "copyCitation"\) void copyQuote\(item\)/);
    assert.match(view, /if \(action\.type === "copyBibTeX"\) void copyQuoteCitation\(item, "bibtex"\)/);
    assert.match(view, /copyQuoteCitation/);
    assert.match(view, /copySelectedHighlightBlockRefs/);
    assert.match(view, /copySelectedHighlightCitations/);
    assert.match(view, /data-glean-highlight-id=\{item\.id\}/);
    assert.match(view, /class:glean-highlights__item--cursor=\{cursorId === item\.id\}/);
    assert.match(view, /action\.type === "roaming"/);
    assert.match(view, /triggerRoaming/);
    assert.match(view, /glean-highlights__roam/);
    assert.match(view, /<kbd>B<\/kbd>/);
    assert.match(view, /<kbd>\/<\/kbd>/);
    assert.match(view, /action\.type === "focusSearch"/);
    assert.match(view, /searchInputEl\?\.focus\(\)/);
    assert.match(view, /event\.key === "f" \|\| event\.key === "F"/);
    assert.match(view, /<kbd>C<\/kbd>/);
});

test("groupHighlightsByArticle 与 renderArticleHighlightsMarkdown：按文章聚类与单篇导出（T-3415）", () => {
    const doc1 = "20261020100000-doc0001";
    const doc2 = "20261020100000-doc0002";
    const item1 = item(1, { id: "20261020100001-aaaaaaa", rootId: doc1, title: "文章一", site: "site1.test", text: "第一摘录" });
    const item2 = item(2, { id: "20261020100002-bbbbbbb", rootId: doc2, title: "文章二", site: "site2.test", text: "第二摘录" });
    const item3 = item(3, { id: "20261020100003-ccccccc", rootId: doc1, title: "文章一", site: "site1.test", text: "第三摘录" });

    const groups = groupHighlightsByArticle([item1, item2, item3]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].rootId, doc1);
    assert.equal(groups[0].title, "文章一");
    assert.equal(groups[0].items.length, 2);
    assert.deepEqual(groups[0].items.map((i) => i.id), [item1.id, item3.id]);

    assert.equal(groups[1].rootId, doc2);
    assert.equal(groups[1].title, "文章二");
    assert.equal(groups[1].items.length, 1);

    // 空列表返回空数组
    assert.deepEqual(groupHighlightsByArticle([]), []);

    // 渲染单篇文章全部摘录为 Markdown
    const markdown = renderArticleHighlightsMarkdown(groups[0], labels);
    assert.ok(markdown.includes("# 文章一"));
    assert.ok(markdown.includes(labels.source));
    assert.ok(markdown.includes(groups[0].site.replace(".", "\\.")));
    assert.ok(markdown.includes("> 第一摘录"));
    assert.ok(markdown.includes("> 第三摘录"));
    assert.ok(markdown.includes(`siyuan://blocks/${doc1}`));
    assert.ok(markdown.includes(`siyuan://blocks/${item1.id}`));
    assert.ok(markdown.includes(`siyuan://blocks/${item3.id}`));
});

test("HighlightView 接线：支持平铺与按文章聚类双视图切换（T-3415）", () => {
    const view = readFileSync(new URL("../src/ui/HighlightView.svelte", import.meta.url), "utf8");
    assert.match(view, /groupHighlightsByArticle/);
    assert.match(view, /renderArticleHighlightsMarkdown/);
    assert.match(view, /let viewMode = \$state<"timeline" \| "article">\("timeline"\)/);
    assert.match(view, /const articleGroups = \$derived\(groupHighlightsByArticle\(filtered\)\)/);
    assert.match(view, /onclick=\{\(\) => viewMode = "timeline"\}/);
    assert.match(view, /onclick=\{\(\) => viewMode = "article"\}/);
    assert.match(view, /class="glean-highlights__article-groups"/);
    assert.match(view, /copyArticleQuotes\(group\)/);
    assert.match(view, /exportArticleQuotes\(group\)/);
    assert.match(view, /createDocFromArticleQuotes\(group\)/);
    assert.match(view, /\{t\(i18n, "highlight\.createArticleDoc"\)\}/);
});

test("HighlightView 兼容显示 siyuan-comment 鲸鱼批注与思源原生块备注", () => {
    const view = readFileSync(new URL("../src/ui/HighlightView.svelte", import.meta.url), "utf8");
    assert.match(view, /class="glean-annotation-tag glean-annotation-tag--\{item\.annotationTag\}"/);
    assert.match(view, /class="glean-annotation-kind"/);
    assert.match(view, /openDoc\(item\.rootId, item\.sourceBlockId \|\| item\.id\)/);
    assert.match(view, /openDoc\(group\.rootId, item\.sourceBlockId \|\| item\.id\)/);
});

test("siyuan-comment IAL 实体解码、追记解析、自定义标签与来源筛选", () => {
    const encoded = "第一行 &quot;重点&quot;_esc_newline_第二行 &lt;tag&gt; &amp; &#65;";
    assert.equal(decodeSiyuanCommentIalValue(encoded), "第一行 \"重点\"\n第二行 <tag> & A");

    const ial = `{: id="20261112100000-abc1234" custom-siyuan-comment="true" custom-comment-text="${encoded}" custom-comment-tag="custom-9999" custom-comment-replies="[{&quot;id&quot;:&quot;r1&quot;,&quot;time&quot;:&quot;2026-11-12 10:00&quot;,&quot;author&quot;:&quot;whale&quot;,&quot;md&quot;:&quot;一条追记&quot;}]"}`;
    assert.equal(parseIalAttr(ial, "custom-comment-text"), "第一行 \"重点\"\n第二行 <tag> & A");
    assert.equal(parseIalAttr(ial, "custom-comment-tag"), "custom-9999");

    const replies = parseSiyuanCommentReplies(parseIalAttr(ial, "custom-comment-replies"));
    assert.deepEqual(replies, [{ id: "r1", time: "2026-11-12 10:00", author: "whale", md: "一条追记" }]);

    const customDisplay = resolveAnnotationTagDisplay("custom-9999", [{ value: "custom-9999", label: "经典金句", icon: "💎", color: "#007AFF" }]);
    assert.deepEqual(customDisplay, { value: "custom-9999", label: "经典金句", icon: "💎", color: "#007AFF" });

    const gleanItem = item(1, { annotationKind: "glean", text: "拾遗摘要" });
    const whaleItem = item(2, { annotationKind: "siyuan-comment", annotationTag: "important", replies, text: "划线正文", memo: "深度思考" });
    assert.deepEqual(filterHighlights([gleanItem, whaleItem], { annotationKind: "siyuan-comment" }).map((v) => v.id), [whaleItem.id]);
    assert.deepEqual(filterHighlights([gleanItem, whaleItem], { search: "一条追记" }).map((v) => v.id), [whaleItem.id]);

    const share = formatHighlightShare(whaleItem);
    assert.ok(share.includes("> 💡 深度思考"));
    const md = renderHighlightsMarkdown([whaleItem], labels);
    assert.ok(md.includes("> 💡 深度思考"));
    assert.ok(md.includes("一条追记"));
});

test("AnnotationEditorDialog 接线、连续批注切换与边距注记防遮挡契约", () => {
    const editor = readFileSync(new URL("../src/ui/AnnotationEditorDialog.svelte", import.meta.url), "utf8");
    const reader = readFileSync(new URL("../src/ui/ReaderTab.svelte", import.meta.url), "utf8");
    const view = readFileSync(new URL("../src/ui/HighlightView.svelte", import.meta.url), "utf8");
    const svc = readFileSync(new URL("../src/services/highlights.ts", import.meta.url), "utf8");

    assert.match(svc, /export async function setAnnotationColor/);
    assert.match(svc, /export async function removeAnnotationReply/);
    assert.match(editor, /setAnnotationColor/);
    assert.match(editor, /removeAnnotationReply/);
    assert.match(editor, /glean-ann-editor__pager/);
    assert.match(editor, /glean-ann-editor__templates/);
    assert.match(reader, /import AnnotationEditorDialog from "\.\/AnnotationEditorDialog\.svelte";/);
    assert.match(reader, /class:glean-reader--has-margin-notes=/);
    assert.match(view, /import AnnotationEditorDialog from "\.\/AnnotationEditorDialog\.svelte";/);
});

test("阅读器划词选区防清除锁、wysiwyg 就绪等待与伴生栏标签显式呈现契约", () => {
    const reader = readFileSync(new URL("../src/ui/ReaderTab.svelte", import.meta.url), "utf8");
    const bridge = readFileSync(new URL("../src/services/siyuan-comment-bridge.ts", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../src/index.scss", import.meta.url), "utf8");

    assert.match(reader, /lockSelectionBar/);
    assert.match(reader, /onpointerdown=\{/);
    assert.match(reader, /waitForWysiwygReady/);
    assert.match(bridge, /export async function waitForWysiwygReady/);
    assert.match(bridge, /normStart/);
    assert.match(styles, /\.glean-reader__side-nav-btn[\s\S]*span\s*\{[\s\S]*display:\s*inline\s*!important;/);
    assert.match(styles, /\.glean-reader__host \.protyle-preview__action\s*\{\s*display:\s*none\s*!important;/);
    assert.match(styles, /\.glean-reader__appearance-popover[\s\S]*&:not\(\[open\]\)\s*\{\s*display:\s*none\s*!important;/);
    assert.match(reader, /toolsAppearancePanelId/);
    assert.match(reader, /toolsAppearanceOpen/);
});


