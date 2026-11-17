import test from "node:test";
import assert from "node:assert/strict";
import {
    EXTENDED_LIBRARY_FIELDS,
    LIBRARY_FIELDS,
} from "../src/domain/library-db.ts";

test("LIBRARY_FIELDS 与 EXTENDED_LIBRARY_FIELDS 契约对齐", () => {
    // 基础 4 核心字段
    assert.deepEqual(
        LIBRARY_FIELDS.map((f) => [f.key, f.name, f.type]),
        [
            ["status", "状态", "select"],
            ["words", "字数", "number"],
            ["minutes", "时长", "number"],
            ["url", "来源", "url"],
        ]
    );

    // 扩展 9 字段完整覆盖思源原生多维表（AV）
    const extendedKeys = EXTENDED_LIBRARY_FIELDS.map((f) => f.key);
    assert.ok(extendedKeys.includes("author"));
    assert.ok(extendedKeys.includes("priority"));
    assert.ok(extendedKeys.includes("rating"));
    assert.ok(extendedKeys.includes("readMinutes"));
    assert.ok(extendedKeys.includes("summary"));
    assert.equal(EXTENDED_LIBRARY_FIELDS.length, 9);

    const authorField = EXTENDED_LIBRARY_FIELDS.find((f) => f.key === "author");
    assert.equal(authorField?.type, "text");
    assert.equal(authorField?.name, "作者");

    const priorityField = EXTENDED_LIBRARY_FIELDS.find((f) => f.key === "priority");
    assert.equal(priorityField?.type, "number");
    assert.equal(priorityField?.name, "优先级");

    const ratingField = EXTENDED_LIBRARY_FIELDS.find((f) => f.key === "rating");
    assert.equal(ratingField?.type, "number");
    assert.equal(ratingField?.name, "评分");

    const summaryField = EXTENDED_LIBRARY_FIELDS.find((f) => f.key === "summary");
    assert.equal(summaryField?.type, "text");
    assert.equal(summaryField?.name, "AI摘要");
});
