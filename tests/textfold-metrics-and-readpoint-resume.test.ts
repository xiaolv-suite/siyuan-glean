import { test } from "node:test";
import assert from "node:assert/strict";
import {
    createFoldNode,
    calculateFoldLevelMetrics,
    resolveNodeDisplayContent,
    formatFoldNodesToMarkdown,
    type FoldNode,
} from "../src/domain/folded-reader.ts";
import {
    deriveReadingMilestone,
    formatReadPointResumeNotice,
    type ReadingPosition,
} from "../src/domain/reading-position.ts";

test("Station 4: TextFold 5-Level Semantic Metrics & Read-Point Resume Engine", async (t) => {
    await t.test("1. 5 阶语义折叠压缩比与时间节省度量看板 (TextFold Metrics)", () => {
        const nodes: FoldNode[] = [
            createFoldNode("20261108100000-aaaaaaa", "知识的获取从来不是一蹴而就的，它需要经过剪藏、过滤、咀嚼、批判、重构五个阶段。只有经过深度处理的知识才能真正转化为自己的认知资产。"),
            createFoldNode("20261108100000-bbbbbbb", "在长文阅读中，通过视口锚点观察者捕捉读者停留段落，能够自动记录阅读锚点。下次打开时无缝接续，消除中断焦虑。"),
            createFoldNode("20261108100000-ccccccc", "现代笔记系统的核心不仅在于快速记录，更在于长期沉淀与多维联通。双链和间隔复习是个人知识库的护城河。"),
        ];

        // 验证 Level 1 全文模式
        const m1 = calculateFoldLevelMetrics(nodes, 1);
        assert.equal(m1.level, 1);
        assert.ok(m1.totalOriginalChars > 150);
        assert.equal(m1.foldedChars, m1.totalOriginalChars);
        assert.equal(m1.retentionRatio, 1);
        assert.equal(m1.savedPercentage, 0);

        // 验证 Level 2 逐字金句模式（应有明显的字符压缩）
        const m2 = calculateFoldLevelMetrics(nodes, 2);
        assert.equal(m2.level, 2);
        assert.ok(m2.foldedChars < m1.foldedChars);
        assert.ok(m2.savedPercentage > 0);
        assert.ok(m2.retentionRatio < 1);

        // 验证 Level 4 单行要旨模式（压缩比应更高）
        const m4 = calculateFoldLevelMetrics(nodes, 4);
        assert.equal(m4.level, 4);
        assert.ok(m4.foldedChars <= m2.foldedChars);
        assert.ok(m4.savedPercentage >= m2.savedPercentage);

        // 验证 Level 5 概念模式
        const m5 = calculateFoldLevelMetrics(nodes, 5);
        assert.equal(m5.level, 5);
        assert.ok(m5.foldedChars <= m4.foldedChars);
        assert.ok(m5.savedPercentage >= 50);

        // 验证空节点防御
        const mEmpty = calculateFoldLevelMetrics([], 3);
        assert.equal(mEmpty.totalOriginalChars, 0);
        assert.equal(mEmpty.savedPercentage, 0);
    });

    await t.test("2. formatFoldNodesToMarkdown 支持标题大纲感知导出", () => {
        const nodes: FoldNode[] = [
            createFoldNode("20261108100000-h111111", "第一章 深度阅读导论", { type: "NodeHeading" }),
            createFoldNode("20261108100000-p222222", "剪藏的第一步是快速略读与核心论点提取。"),
        ];

        const md = formatFoldNodesToMarkdown(nodes, 2);
        // 标题块应格式化为 Markdown 标题，而段落块应附带引用反链
        assert.ok(md.includes("### 第一章 深度阅读导论"));
        assert.ok(md.includes("((20261108100000-p222222 '*'))"));
    });

    await t.test("3. deriveReadingMilestone 5 阶阅读进度里程碑派生", () => {
        // 0% -> unread
        const r0 = deriveReadingMilestone(0);
        assert.equal(r0.phase, "unread");
        assert.equal(r0.label, "未读");
        assert.equal(r0.isCompleted, false);

        // 15% -> browsing
        const r1 = deriveReadingMilestone(15);
        assert.equal(r1.phase, "browsing");
        assert.equal(r1.label, "导读起步");
        assert.equal(r1.progressPercentage, 15);

        // 50% -> indepth
        const r2 = deriveReadingMilestone(50);
        assert.equal(r2.phase, "indepth");
        assert.equal(r2.label, "深入研读");

        // 85% -> concluding
        const r3 = deriveReadingMilestone(85);
        assert.equal(r3.phase, "concluding");
        assert.equal(r3.label, "即将读完");

        // 100% -> completed
        const r4 = deriveReadingMilestone(100);
        assert.equal(r4.phase, "completed");
        assert.equal(r4.label, "已读完");
        assert.equal(r4.isCompleted, true);

        // 负数与非法值防御
        assert.equal(deriveReadingMilestone(-10).phase, "unread");
        assert.equal(deriveReadingMilestone(150).phase, "completed");
        assert.equal(deriveReadingMilestone(null).phase, "unread");
    });

    await t.test("4. formatReadPointResumeNotice 接续提示生成", () => {
        const pos: ReadingPosition = {
            version: 1,
            blockId: "20261108100000-aaaaaaa",
            offset: 120,
            at: "2026-11-08T09:20:00.000Z",
        };

        const noticeWithRatio = formatReadPointResumeNotice(pos, 45);
        assert.equal(noticeWithRatio, "已为您自动接续至上次阅读位置（已读 45%）");

        const noticeWithoutRatio = formatReadPointResumeNotice(pos, null);
        assert.equal(noticeWithoutRatio, "已为您自动接续至上次阅读位置");

        assert.equal(formatReadPointResumeNotice(null), "");
    });
});
