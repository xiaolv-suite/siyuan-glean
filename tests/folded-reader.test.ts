import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    FOLD_LEVEL_CONFIGS,
    isVerbatimSubstring,
    extractVerbatimBrief,
    extractFoldPoints,
    extractGist,
    extractConcept,
    createFoldNode,
    parseBlocksToFoldNodes,
    applyGlobalFoldLevel,
    toggleNodeFold,
    formatFoldNodesToMarkdown,
    type FoldNode,
} from "../src/domain/folded-reader.ts";

test("FOLD_LEVEL_CONFIGS：严格定义 5 阶语义折叠层级与数字键快捷映射", () => {
    assert.equal(FOLD_LEVEL_CONFIGS.length, 5);
    const levels = FOLD_LEVEL_CONFIGS.map((c) => c.level);
    assert.deepEqual(levels, [1, 2, 3, 4, 5]);

    const shortcuts = FOLD_LEVEL_CONFIGS.map((c) => c.shortcut);
    assert.deepEqual(shortcuts, ["1", "2", "3", "4", "5"]);
});

test("isVerbatimSubstring：严格保真检验，判定子串是否 100% 逐字来自原文（拒绝 AI 幻觉与虚构改写）", () => {
    const fullText = "认知负荷理论指出，读者的工作记忆容量极其有限。因此，好的界面应当减少冗余视觉噪音。";

    // 100% 原文子串
    assert.equal(isVerbatimSubstring("认知负荷理论指出", fullText), true);
    assert.equal(isVerbatimSubstring("读者的工作记忆容量极其有限。", fullText), true);
    assert.equal(isVerbatimSubstring("好的界面应当减少冗余视觉噪音", fullText), true);

    // 容忍多余连续空白的逐字匹配
    assert.equal(isVerbatimSubstring("认知负荷理论指出，   读者的工作记忆容量极其有限。", fullText), true);

    // 严厉拒绝 AI 幻觉改写
    assert.equal(isVerbatimSubstring("作者认为工作记忆是非常有限的", fullText), false);
    assert.equal(isVerbatimSubstring("界面设计应当简约现代", fullText), false);
    assert.equal(isVerbatimSubstring("", fullText), false);
    assert.equal(isVerbatimSubstring("任何内容", ""), false);
});

test("extractVerbatimBrief：必须提取 100% 原文逐字子串作为 Level 2 Brief", () => {
    const text1 = "渐进阅读不仅是一种技术，更是一种心智模型的演化。它让我们在信息的洪流中保持清醒。";
    const brief1 = extractVerbatimBrief(text1);
    assert.ok(brief1.length > 0);
    assert.equal(isVerbatimSubstring(brief1, text1), true);
    assert.equal(brief1, "渐进阅读不仅是一种技术，更是一种心智模型的演化。");

    // 超长单句在标点处自然截取子串
    const longText = "在计算机科学的历史长河中，我们见证了无数架构范式的兴起与衰落，从单体架构到微服务，从客户端服务器到无服务器架构，每一次演进都在试图解决前一代技术带来的痛点与扩展性瓶颈。";
    const briefLong = extractVerbatimBrief(longText, 60);
    assert.ok(briefLong.length <= 60);
    assert.equal(isVerbatimSubstring(briefLong, longText), true);
});

test("extractFoldPoints 与 extractConcept：从原文中提取支撑论点与核心概念", () => {
    const text = "在《人月神话》中，布鲁克斯提出了著名的“没有银弹”论断；软件开发的本质复杂度无法被任何单一技术消除。";

    const concept = extractConcept(text);
    assert.ok(concept.includes("人月神话") || concept.includes("没有银弹"));

    const points = extractFoldPoints(text);
    assert.ok(points.length >= 1);
    for (const pt of points) {
        assert.equal(isVerbatimSubstring(pt, text), true);
    }

    const gist = extractGist(text);
    assert.ok(gist.length > 0);
    assert.equal(isVerbatimSubstring(gist, text), true);
});

test("createFoldNode：Verbatim Guard 机制强制拦截虚构 brief 并回退为真实子串", () => {
    const fullText = "保真优先是现代折叠阅读器的第一法则。所有提取摘要必须可回溯到原文段落。";

    // 传入虚构 brief
    const hallucinatedNode = createFoldNode("20261030120000-blk0001", fullText, {
        brief: "这是 AI 凭空捏造的一句话",
    });

    // 强校验机制必须剔除虚构内容，确保 brief 100% 逐字来自 fullText
    assert.equal(isVerbatimSubstring(hallucinatedNode.brief, fullText), true);
    assert.equal(hallucinatedNode.blockId, "20261030120000-blk0001");
    assert.equal(hallucinatedNode.id, "20261030120000-blk0001");

    // 传入合法逐字 brief
    const legitBrief = "所有提取摘要必须可回溯到原文段落。";
    const legitNode = createFoldNode("20261030120000-blk0002", fullText, {
        brief: legitBrief,
    });
    assert.equal(legitNode.brief, legitBrief);
});

test("parseBlocksToFoldNodes 与层级切换 pure functions", () => {
    const blocks = [
        { id: "20261030120000-blk0001", content: "第一段：这是关于系统设计的基本原则。", type: "NodeParagraph" },
        { id: "20261030120000-blk0002", content: "   ", type: "NodeParagraph" }, // 应该被过滤
        { id: "20261030120000-blk0003", content: "第二段：双向链接与块引用构成网状知识体系。", type: "NodeParagraph" },
    ];

    const nodes = parseBlocksToFoldNodes(blocks, 2);
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].level, 2);
    assert.equal(nodes[1].level, 2);

    // 全局切换到 Level 4 (Gist)
    const level4Nodes = applyGlobalFoldLevel(nodes, 4);
    assert.equal(level4Nodes[0].level, 4);
    assert.equal(level4Nodes[1].level, 4);
    assert.equal(level4Nodes[0].expanded, false);

    // 单节点展开/折叠
    const toggled = toggleNodeFold(level4Nodes[0]);
    assert.equal(toggled.expanded, true);
    const collapsedAgain = toggleNodeFold(toggled);
    assert.equal(collapsedAgain.expanded, false);
});

test("FoldedReaderView 交互、键盘流、无障碍与双栏联动契约守门", () => {
    const viewCode = fs.readFileSync(new URL("../src/ui/FoldedReaderView.svelte", import.meta.url), "utf8");

    // WAI-ARIA radiogroup 语义
    assert.match(viewCode, /role="radiogroup"/);
    assert.match(viewCode, /role="radio"/);
    assert.match(viewCode, /aria-checked=\{currentLevel === cfg\.level\}/);

    // 方向键流转
    assert.match(viewCode, /handlePillKeyDown/);

    // 键盘 1-5 全局层级切换
    assert.match(viewCode, /handleWindowKeyDown/);
    assert.match(viewCode, /e\.key === "1"/);
    assert.match(viewCode, /e\.key === "2"/);
    assert.match(viewCode, /e\.key === "3"/);
    assert.match(viewCode, /e\.key === "4"/);
    assert.match(viewCode, /e\.key === "5"/);

    // 思源原文块联动与单卡展开
    assert.match(viewCode, /onJumpToBlock\?\.?\(node\.blockId\)/);
    assert.match(viewCode, /onToggleNode\?\.?\(node\.id\)/);
    assert.match(viewCode, /t\(i18n,\s*cfg\.badgeKey\)/);
    assert.match(viewCode, /t\(i18n,\s*"foldReader\.paragraphIndex"/);
    assert.match(viewCode, /REAL_BLOCK_ID\.test\(node\.blockId\)/);
});

test("ReaderTab 接入 5 阶语义折叠伴生栏与 Alt+Z 快捷键联动契约", () => {
    const readerCode = fs.readFileSync(new URL("../src/ui/ReaderTab.svelte", import.meta.url), "utf8");

    assert.match(readerCode, /import FoldedReaderView from "\.\/FoldedReaderView\.svelte"/);
    assert.match(readerCode, /loadDocumentFoldNodes/);
    assert.match(readerCode, /companionTab === "fold"/);
    assert.match(readerCode, /toggleFoldReader/);
    assert.match(readerCode, /event\.altKey && \(event\.key === "z" \|\| event\.key === "Z"\)/);
    assert.match(readerCode, /<dt><kbd>Alt\+Z<\/kbd><\/dt><dd>\{t\(i18n, "foldReader\.toggleAction"\)\}<\/dd>/);
    assert.match(readerCode, /scrollAndPulseReadPoint\(protyleHost, blockId\)/);
    assert.match(readerCode, /docId === targetDocId && generation === sessionGeneration && mounted/);
});

test("folded-reader.scss 样式规范符合 UI-UX-PRO-MAX 触控、高对比度与动效契约", () => {
    const scss = fs.readFileSync(new URL("../src/styles/components/folded-reader.scss", import.meta.url), "utf8");

    assert.match(scss, /\.glean-fold-reader\s*\{/);
    assert.match(scss, /\.glean-fold-card\s*\{[\s\S]*border-radius:\s*var\(--glean-radius-lg,\s*16px\);/);
    assert.match(scss, /\.glean-fold-reader__pill\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    assert.match(scss, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.glean-fold-card\s*\{[\s\S]*border:\s*1px solid CanvasText;/);
    assert.match(scss, /@media\s*\(max-width:\s*560px\)[\s\S]*\.glean-fold-reader__pill\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(scss, /@media\s*\(max-width:\s*560px\)[\s\S]*\.glean-fold-card__btn\s*\{[\s\S]*min-height:\s*44px;/);
    assert.match(scss, /@media\s*\(max-width:\s*360px\)[\s\S]*\.glean-fold-reader__levels\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*1fr\);/);
    assert.match(scss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*var\(--glean-motion-none\)\s*!important;/);
});

test("formatFoldNodesToMarkdown：将各层级折叠节点格式化为 Markdown 列表并附带块引用（BL-35）", () => {
    const nodes: FoldNode[] = [
        createFoldNode("20260101120000-aaaaaaa", "认知负荷理论指出，读者的工作记忆容量极其有限。"),
        createFoldNode("20260101120000-bbbbbbb", "因此，好的界面应当减少冗余视觉噪音，提升沉浸质感。"),
    ];

    const mdLevel2 = formatFoldNodesToMarkdown(nodes, 2);
    assert.match(mdLevel2, /^- .+ \(\(20260101120000-aaaaaaa '\*'\)\)/m);
    assert.match(mdLevel2, /^- .+ \(\(20260101120000-bbbbbbb '\*'\)\)/m);

    const mdLevel1 = formatFoldNodesToMarkdown(nodes, 1);
    assert.match(mdLevel1, /认知负荷理论指出/);
    assert.match(mdLevel1, /好的界面应当减少冗余视觉噪音/);
});
