import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { formatTaskHorizonItem, ECOSYSTEM_EVENTS } from "../src/libs/ecosystem-bridge-kit.ts";

test("formatTaskHorizonItem：生成标准带原文块引用反链的 GTD 行动项待办", () => {
    const task = formatTaskHorizonItem(
        "需要把大模型的 KV Cache 压缩算法应用到当前网关中",
        "20261027120000-doc0001",
        "大模型工程优化实录",
        "20261027120000-blk0005"
    );
    assert.match(task, /^- \[ \] 落地阅读行动项：需要把大模型的 KV Cache 压缩算法应用到当前网关中/);
    assert.match(task, /来源：\(\( 20261027120000-blk0005 '大模型工程优化实录' \)\)/);
    assert.match(task, /\{: custom-status="todo" custom-priority="medium" \}/);
});

test("formatTaskHorizonItem：段落块 ID 缺失时自动回退到文章根块 ID", () => {
    const task = formatTaskHorizonItem(
        "快速行动",
        "20261027120000-doc0002",
        "精益创业"
    );
    assert.match(task, /来源：\(\( 20261027120000-doc0002 '精益创业' \)\)/);
});

test("ECOSYSTEM_EVENTS：包含 Task Horizon 标准事件声明", () => {
    assert.equal(ECOSYSTEM_EVENTS.HORIZON_ACTION_CREATED, "horizon:action-created");
});

test("ReaderTab 契约守门：接入 extractToHorizonTask 与 Alt+T 快捷键", () => {
    const source = fs.readFileSync(new URL("../src/ui/ReaderTab.svelte", import.meta.url), "utf8");
    assert.match(source, /extractToHorizonTask/);
    assert.match(source, /formatTaskHorizonItem/);
    assert.match(source, /event\.altKey && \(event\.key === "t" \|\| event\.key === "T"\)/);
    assert.match(source, /horizon:action-created/);
    assert.match(source, /siyuan-horizon:new-task/);
});
