import test from "node:test";
import assert from "node:assert/strict";
import {
    DAILY_NOTE_SLOT_KEY,
    DEFAULT_DAILY_NOTE_LABELS,
    escapeDailyNoteText,
    formatDailyNoteReadingMarkdown,
    type DailyNoteReadingEntry,
} from "../src/domain/daily-note.ts";

test("escapeDailyNoteText：去除控制字符并转义 Markdown 符号", () => {
    assert.equal(escapeDailyNoteText("普通文本"), "普通文本");
    assert.equal(escapeDailyNoteText("测试 [标题] (链接)"), "测试 \\[标题\\] \\(链接\\)");
    assert.equal(escapeDailyNoteText("换行1\n换行2"), "换行1 换行2");
});

test("formatDailyNoteReadingMarkdown：构造已读文章的标准日记条目", () => {
    const entry: DailyNoteReadingEntry = {
        docId: "20261028120000-doc0001",
        title: "大模型推理实战",
        author: "张工",
        status: "done",
        rating: 5,
        readMinutes: 15,
        summary: "深入讲解显存分配机制与算子加速优化",
    };

    const md = formatDailyNoteReadingMarkdown(entry);
    // 包含已读标记
    assert.ok(md.includes("✅ 已读完"));
    // 包含原生块引用反链
    assert.ok(md.includes("(( 20261028120000-doc0001 '《大模型推理实战》' ))"));
    // 包含作者与评分
    assert.ok(md.includes("✍️ 张工"));
    assert.ok(md.includes("⭐ ⭐⭐⭐⭐⭐"));
    // 包含耗时
    assert.ok(md.includes("⏱️ 耗时 15 分钟"));
    // 包含一句话收获
    assert.ok(md.includes("> 💡 深入讲解显存分配机制与算子加速优化"));
    // 包含 IAL 幂等锚点
    assert.ok(md.includes(`{: ${DAILY_NOTE_SLOT_KEY}="20261028120000-doc0001" }`));
});

test("formatDailyNoteReadingMarkdown：正在读且无摘要文章的轻量渲染", () => {
    const entry: DailyNoteReadingEntry = {
        docId: "20261028120000-doc0002",
        title: "短文随笔",
        status: "reading",
    };

    const md = formatDailyNoteReadingMarkdown(entry);
    assert.ok(md.includes("📖 正在读"));
    assert.ok(md.includes("(( 20261028120000-doc0002 '《短文随笔》' ))"));
    assert.ok(!md.includes("💡"));
    assert.ok(!md.includes("⭐"));
    assert.ok(md.includes(`{: ${DAILY_NOTE_SLOT_KEY}="20261028120000-doc0002" }`));
});
