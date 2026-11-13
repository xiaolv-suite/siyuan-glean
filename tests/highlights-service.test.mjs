import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "siyuan") return { url: "glean-highlights:siyuan", shortCircuit: true };
        if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === "glean-highlights:siyuan") return { format: "module", source: "export const fetchSyncPost = (...args) => globalThis.__gleanHighlightsPost(...args); export const getFrontend = () => 'desktop';", shortCircuit: true };
        return nextLoad(url, context);
    },
});

const {
    addAnnotationReply, copyHighlights, deleteAnnotation, exportHighlightsCsv, highlightDocumentTitle, listDocHighlights, listLibraryHighlights,
    listLibraryQuotes, listQuoteRoots, getQuoteColor, setAnnotationTag, setQuoteColor,
    prepareHighlightExport, revalidateHighlights, saveHighlightDraft, updateHighlightMemo,
} = await import("../src/services/highlights.ts");
const { listHighlightBlocks, getHighlightBlocks, listHighlightDocuments } = await import("../src/api/client.ts");
const { DEFAULT_SETTINGS } = await import("../src/services/settings.ts");
const originalId = "20261004100000-0000001";
const draftId = "20261004130000-ddddddd";
const labels = { title: "摘录汇编", original: "返回原块", source: "来源网页" };

function rootId(offset) { return `20261004100000-${offset.toString(36).padStart(7, "0")}`; }
function quoteId(offset) { return `20261004120000-${offset.toString(36).padStart(7, "0")}`; }

function harness() {
    const database = new DatabaseSync(":memory:");
    database.exec("CREATE TABLE blocks (id TEXT PRIMARY KEY, content TEXT, markdown TEXT, type TEXT, root_id TEXT, box TEXT, hpath TEXT, updated TEXT, tag TEXT, ial TEXT, sort INTEGER)");
    const attributes = new Map();
    const files = new Map();
    const calls = [];
    const failure = { query: false, page: false, repeat: false, malformed: false, mark: false, index: false, create: false, invalidId: false, read: false };
    let heldCreate;
    let batchReadHook;
    let batchReads = 0;
    const plugin = {
        async loadData(name) { return structuredClone(files.get(name)); },
        async saveData(name, value) {
            if (failure.index && name === "glean-index.json") throw new Error("index failure");
            files.set(name, structuredClone(value));
        },
    };
    function setAttrs(id, attrs) {
        attributes.set(id, { ...attrs });
        const ial = `{: ${Object.entries(attrs).map(([key, value]) => `${key}="${String(value).replace(/"/g, "&quot;")}"`).join(" ")}}`;
        database.prepare("UPDATE blocks SET ial = ?, tag = ? WHERE id = ?").run(ial, attrs.tags ?? "", id);
    }
    function addDocument(id, attrs = { "custom-clip-status": "later" }, overrides = {}) {
        const row = { id, content: "文章标题", markdown: "文章正文", type: "d", root_id: id, box: "box-1", hpath: "/folder/文章标题", updated: "20261004120000", tag: "", ial: "", sort: 0, ...overrides };
        database.prepare("INSERT INTO blocks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.content, row.markdown, row.type, row.root_id, row.box, row.hpath, row.updated, row.tag, row.ial, row.sort);
        setAttrs(id, attrs);
    }
    function addBlock(id, parentId = originalId, overrides = {}) {
        const row = { id, content: "真实引述", markdown: "> **真实引述**", type: "b", root_id: parentId, box: "box-1", hpath: "/folder/文章标题", updated: "20261004120000", tag: "", ial: "", sort: 0, ...overrides };
        database.prepare("INSERT INTO blocks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.content, row.markdown, row.type, row.root_id, row.box, row.hpath, row.updated, row.tag, row.ial, row.sort);
    }
    function changeBlock(id, patch) {
        for (const [field, value] of Object.entries(patch)) {
            if (!["content", "markdown", "type", "root_id", "box", "hpath", "ial"].includes(field)) throw new Error("Invalid test field");
            database.prepare(`UPDATE blocks SET ${field} = ? WHERE id = ?`).run(value, id);
        }
    }
    const updateIdx = routes => calls.filter(c => routes.includes(c.route)).length;
    void updateIdx;
    globalThis.__gleanHighlightsPost = async (route, body) => {
        calls.push({ route, body: structuredClone(body) });
        switch (route) {
            case "/api/query/sql": {
                if (failure.query) return { code: 1, msg: "query permission failure" };
                if (failure.page && /AND id >/.test(body.stmt)) return { code: 1, msg: "later page failure" };
                if (failure.malformed && /root_id IN/.test(body.stmt)) return { code: 0, data: null };
                const stmt = failure.repeat ? body.stmt.replace(/AND id > '[^']+'/g, "") : body.stmt;
                return { code: 0, data: database.prepare(stmt).all() };
            }
            case "/api/attr/batchGetBlockAttrs": {
                if (failure.read) return { code: 1, msg: "attribute permission failure" };
                batchReads += 1;
                if (batchReadHook) batchReadHook(batchReads);
                return { code: 0, data: Object.fromEntries(body.ids.filter((id) => attributes.has(id)).map((id) => [id, { ...attributes.get(id) }])) };
            }
            case "/api/attr/getBlockAttrs":
                return failure.read ? { code: 1, msg: "attribute permission failure" } : { code: 0, data: { ...attributes.get(body.id) } };
            case "/api/attr/setBlockAttrs":
                if (failure.mark) return { code: 1, msg: "mark failed" };
                setAttrs(body.id, { ...attributes.get(body.id), ...body.attrs });
                return { code: 0, data: null };
            case "/api/block/updateBlock":
                database.prepare("UPDATE blocks SET markdown = ?, content = ? WHERE id = ?").run(body.data, body.data, body.id);
                return { code: 0, data: [] };
            case "/api/block/deleteBlock":
                database.prepare("DELETE FROM blocks WHERE id = ?").run(body.id);
                attributes.delete(body.id);
                return { code: 0, data: [] };
            case "/api/filetree/createDocWithMd":
                if (heldCreate) await heldCreate;
                addDocument(draftId, {}, { content: labels.title, hpath: body.path, box: body.notebook, markdown: body.markdown });
                if (failure.create) throw new Error("creation response lost");
                return { code: 0, data: failure.invalidId ? "" : draftId };
            case "/api/export/exportMdContent":
                return { code: 0, data: { content: database.prepare("SELECT markdown FROM blocks WHERE id = ?").get(body.id)?.markdown ?? "" } };
            default: throw new Error(`Unexpected endpoint ${route}`);
        }
    };
    addDocument(originalId, { "custom-clip-status": "later", "custom-clip-url": "https://example.test/article", "custom-clip-site": "example.test", "custom-clip-ai-tags": "model", "custom-clip-priority": "5", "custom-clip-rating": "4", tags: "user" });
    addBlock(quoteId(1));
    return {
        database, attributes, files, calls, failure, plugin, settings: structuredClone(DEFAULT_SETTINGS), addDocument, addBlock, changeBlock, setAttrs,
        holdCreate(value) { heldCreate = value; }, onBatchRead(callback) { batchReadHook = callback; },
        countCreates() { return calls.filter((call) => call.route === "/api/filetree/createDocWithMd").length; },
        deleteBlock(id) { database.prepare("DELETE FROM blocks WHERE id = ?").run(id); attributes.delete(id); },
        block(id) { return database.prepare("SELECT * FROM blocks WHERE id = ?").get(id); },
    };
}

async function preview(fixture, selectedIds = [quoteId(1)]) {
    return prepareHighlightExport(await listLibraryHighlights(fixture.plugin, fixture.settings), selectedIds, labels);
}

test("摘录墙读取标题与颜色标记经过统一服务入口", async () => {
    const fixture = harness();
    const rows = await listLibraryQuotes(10, 0);
    assert.deepEqual(rows, [{ id: quoteId(1), rootId: originalId, text: "真实引述", markdown: "> **真实引述**" }]);
    assert.deepEqual([...await listQuoteRoots([originalId, "bad-id"])], [[originalId, "文章标题"]]);
    assert.equal(await getQuoteColor(quoteId(1)), "");
    await setQuoteColor(quoteId(1), "yellow");
    assert.equal(await getQuoteColor(quoteId(1)), "yellow");
    await setQuoteColor(quoteId(1), "unsupported");
    assert.equal(await getQuoteColor(quoteId(1)), "");
    assert.ok(fixture.calls.some((call) => call.route === "/api/attr/setBlockAttrs"));
});

test("全库从完整新对账范围取已确认文章，排除候选、普通笔记、内部文档和缓存幽灵", async () => {
    const fixture = harness();
    fixture.addDocument(rootId(2), { "custom-clip-url": "https://candidate.test" });
    fixture.addDocument(rootId(3), {});
    fixture.addDocument(rootId(4), { "custom-clip-status": "done", "custom-clip-internal": "true" });
    fixture.addDocument(rootId(5), { "custom-clip-status": "invalid", "custom-clip-url": "https://invalid.test" });
    for (const offset of [2, 3, 4, 5]) fixture.addBlock(quoteId(offset), rootId(offset));
    fixture.files.set("glean-index.json", { version: 1, clips: { ghost: { id: rootId(99), status: "later" } }, candidates: {} });
    const items = await listLibraryHighlights(fixture.plugin, fixture.settings);
    assert.deepEqual(items.map((item) => item.id), [quoteId(1)]);
    assert.deepEqual(items[0].tags, ["user"]);
    assert.deepEqual(items[0].aiTags, ["model"]);
    assert.equal(items[0].site, "example.test");
    assert.equal(fixture.files.get("glean-index.json").clips.ghost, undefined);
    assert.deepEqual([...fixture.files.keys()], ["glean-index.json"]);
    assert.equal(fixture.calls.some((call) => call.route === "/api/attr/setBlockAttrs"), false);
});

test("资格在新对账后通过 clip-store 再读，刚改为 internal 的根文档不入墙", async () => {
    const fixture = harness();
    fixture.onBatchRead((count) => { if (count === 2) fixture.setAttrs(originalId, { ...fixture.attributes.get(originalId), "custom-clip-internal": "true" }); });
    assert.deepEqual(await listLibraryHighlights(fixture.plugin, fixture.settings), []);
    assert.ok(fixture.calls.filter((call) => call.route === "/api/attr/batchGetBlockAttrs").length >= 2);
});

test("真实 SQLite 消费普通引述和非空标记段落，避免未标记子段落和相似键重复", async () => {
    const fixture = harness();
    fixture.addBlock(quoteId(2), originalId, { type: "p", content: "已标记段落", markdown: "已标记段落", ial: '{: custom-clip-highlight="yellow"}' });
    fixture.addBlock(quoteId(3), originalId, { type: "p", ial: '{: custom-clip-highlight=""}' });
    fixture.addBlock(quoteId(4), originalId, { type: "p", ial: '{: custom-clip-highlight="   "}' });
    fixture.addBlock(quoteId(5), originalId, { type: "p", ial: '{: other-custom-clip-highlight="yellow"}' });
    fixture.addBlock(quoteId(6), originalId, { type: "p" });
    fixture.addBlock(quoteId(7), originalId, { content: "&nbsp;" });
    const items = await listDocHighlights(originalId);
    assert.deepEqual(items.map((item) => item.id), [quoteId(1), quoteId(2)]);
    assert.equal(items[1].source.highlight, "yellow");
    assert.equal(await highlightDocumentTitle(originalId), "文章标题");
});

test("超过 500 条摘录按块 ID 游标完整读取，不使用 OFFSET 或排序不稳定的更新时间", async () => {
    const fixture = harness();
    for (let offset = 2; offset <= 1002; offset += 1) fixture.addBlock(quoteId(offset), originalId, { sort: 1003 - offset });
    const items = await listLibraryHighlights(fixture.plugin, fixture.settings);
    assert.equal(items.length, 1002);
    assert.equal(new Set(items.map((item) => item.id)).size, 1002);
    const queries = fixture.calls.filter((call) => /root_id IN/.test(call.body.stmt ?? ""));
    assert.equal(queries.length, 3);
    assert.ok(queries.every((call) => /ORDER BY id ASC LIMIT 500/.test(call.body.stmt) && !/OFFSET/.test(call.body.stmt)));
    assert.ok(queries[1].body.stmt.includes(`AND id > '${quoteId(500)}'`));
    assert.ok(queries[2].body.stmt.includes(`AND id > '${quoteId(1000)}'`));
});

test("超过 200 根文档按小批查询，导出回读块也遵守 200 上限", async () => {
    const fixture = harness();
    for (let offset = 2; offset <= 201; offset += 1) { fixture.addDocument(rootId(offset)); fixture.addBlock(quoteId(offset), rootId(offset)); }
    const items = await listLibraryHighlights(fixture.plugin, fixture.settings);
    assert.equal(items.length, 201);
    const queries = fixture.calls.filter((call) => /root_id IN/.test(call.body.stmt ?? ""));
    assert.equal(queries.length, 2);
    assert.ok(queries.every((call) => (call.body.stmt.match(/root_id IN \(([^)]+)\)/)?.[1].match(/'[^']+'/g) ?? []).length <= 200));
    await revalidateHighlights(items);
    const blockReads = fixture.calls.filter((call) => /FROM blocks WHERE id IN/.test(call.body.stmt ?? ""));
    assert.equal(blockReads.length, 2);
    assert.ok(fixture.calls.filter((call) => call.route === "/api/attr/batchGetBlockAttrs").every((call) => call.body.ids.length <= 200));
});

test("查询分页失败、重复满页或非数组响应均拒绝，不返回成功的部分列表", async () => {
    for (const stage of ["page", "repeat", "malformed", "query", "read"]) {
        const fixture = harness();
        for (let offset = 2; offset <= 501; offset += 1) fixture.addBlock(quoteId(offset));
        fixture.failure[stage] = true;
        await assert.rejects(listLibraryHighlights(fixture.plugin, fixture.settings));
    }
});

test("API 校验根 ID、游标和批次上限，页大小最大 500", async () => {
    const fixture = harness();
    await assert.rejects(listHighlightBlocks(["bad'ID"]));
    await assert.rejects(listHighlightBlocks([originalId], "bad'cursor"));
    await assert.rejects(listHighlightBlocks(Array.from({ length: 201 }, (_, offset) => rootId(offset))));
    await assert.rejects(getHighlightBlocks(["bad'ID"]));
    await assert.rejects(listHighlightDocuments(["bad'ID"]));
    assert.equal(fixture.calls.length, 0);
    await listHighlightBlocks([originalId], "", 99999);
    assert.match(fixture.calls.at(-1).body.stmt, /LIMIT 500$/);
});

test("复制、CSV 和预览只导出显式选择，预览不建文档或写文章属性", async () => {
    const fixture = harness();
    fixture.addBlock(quoteId(2), originalId, { content: "不应导出" });
    const items = await listLibraryHighlights(fixture.plugin, fixture.settings);
    const session = await prepareHighlightExport(items, [quoteId(1)], labels);
    assert.ok(session.markdown.includes(`siyuan://blocks/${quoteId(1)}`));
    assert.ok(!session.markdown.includes("不应导出"));
    assert.equal(session.items.length, 1);
    const copied = [];
    await copyHighlights(items, [quoteId(1)], labels, async (text) => { copied.push(text); });
    assert.deepEqual(copied, [session.markdown]);
    assert.equal(await exportHighlightsCsv(items, [quoteId(1)]), session.csv);
    assert.equal(fixture.countCreates(), 0);
    assert.equal(fixture.calls.some((call) => call.route === "/api/attr/setBlockAttrs"), false);
    await assert.rejects(prepareHighlightExport(items, [], labels), { reason: "empty" });
    await assert.rejects(exportHighlightsCsv(items, [quoteId(99)]), { reason: "invalid" });
});

for (const field of ["content", "markdown", "root_id", "box", "type", "ial"]) {
    test(`块 ${field} 改变阻止旧预览、CSV 与剪贴板导出`, async () => {
        const fixture = harness();
        const items = await listLibraryHighlights(fixture.plugin, fixture.settings);
        const session = await prepareHighlightExport(items, [quoteId(1)], labels);
        const changes = { content: "changed", markdown: "> changed", root_id: rootId(2), box: "other-box", type: "p", ial: '{: custom-clip-highlight="new"}' };
        fixture.changeBlock(quoteId(1), { [field]: changes[field] });
        const copied = [];
        await assert.rejects(copyHighlights(items, [quoteId(1)], labels, async (text) => { copied.push(text); }), { reason: "changed" });
        await assert.rejects(exportHighlightsCsv(items, [quoteId(1)]), { reason: "changed" });
        assert.deepEqual(await saveHighlightDraft(fixture.plugin, session), { ok: false, reason: "changed" });
        assert.equal(copied.length, 0);
        assert.equal(fixture.countCreates(), 0);
    });
}

for (const change of ["unconfirmed", "internal", "deletedBlock", "deletedRoot", "title", "site", "userTag", "aiTag", "url", "rootPath"]) {
    test(`文章/块 ${change} 阻止旧摘录稿，来源失败不会创建副本`, async () => {
        const fixture = harness();
        const session = await preview(fixture);
        const attrs = { ...fixture.attributes.get(originalId) };
        if (change === "unconfirmed") { delete attrs["custom-clip-status"]; fixture.setAttrs(originalId, attrs); }
        if (change === "internal") fixture.setAttrs(originalId, { ...attrs, "custom-clip-internal": "true" });
        if (change === "deletedBlock") fixture.deleteBlock(quoteId(1));
        if (change === "deletedRoot") fixture.deleteBlock(originalId);
        if (change === "title") fixture.changeBlock(originalId, { content: "新标题" });
        if (change === "rootPath") fixture.changeBlock(originalId, { hpath: "/moved/文章标题" });
        const fields = { site: "custom-clip-site", userTag: "tags", aiTag: "custom-clip-ai-tags", url: "custom-clip-url" };
        if (fields[change]) fixture.setAttrs(originalId, { ...attrs, [fields[change]]: "changed" });
        const result = await saveHighlightDraft(fixture.plugin, session);
        assert.equal(result.ok, false);
        assert.ok(["changed", "readFailed"].includes(result.reason));
        assert.equal(fixture.countCreates(), 0);
    });
}

test("来源权限/连接错误保留预览，恢复后可确认；当前普通文档摘录可查看但不可导出", async () => {
    const fixture = harness();
    const session = await preview(fixture);
    fixture.failure.read = true;
    assert.deepEqual(await saveHighlightDraft(fixture.plugin, session), { ok: false, reason: "readFailed" });
    assert.equal(session.state, "ready");
    fixture.failure.read = false;
    assert.equal((await saveHighlightDraft(fixture.plugin, session)).ok, true);
    fixture.addDocument(rootId(2), {});
    fixture.attributes.delete(rootId(2));
    fixture.addBlock(quoteId(2), rootId(2));
    const ordinary = await listDocHighlights(rootId(2));
    assert.equal(ordinary.length, 1);
    await assert.rejects(prepareHighlightExport(ordinary, [quoteId(2)], labels), { reason: "readFailed" });
});

test("确认创建普通 internal 文档，仅新增标记，原文章正文和手填属性完全保留", async () => {
    const fixture = harness();
    const originalAttrs = structuredClone(fixture.attributes.get(originalId));
    const original = structuredClone(fixture.block(originalId));
    const session = await preview(fixture);
    assert.deepEqual(await saveHighlightDraft(fixture.plugin, session), { ok: true, docId: draftId });
    assert.deepEqual(fixture.attributes.get(draftId), { "custom-clip-internal": "true" });
    assert.deepEqual(fixture.attributes.get(originalId), originalAttrs);
    assert.deepEqual({ ...fixture.block(originalId) }, original);
    assert.equal(fixture.block(draftId).markdown, session.markdown);
    assert.equal(fixture.block(draftId).hpath, session.hpath);
    assert.equal(fixture.files.get("glean-index.json").clips[draftId], undefined);
    assert.equal(fixture.files.get("glean-index.json").candidates[draftId], undefined);
    assert.deepEqual(await saveHighlightDraft(fixture.plugin, session), { ok: true, docId: draftId });
    assert.equal(fixture.countCreates(), 1);
});

for (const stage of ["mark", "index"]) {
    test(`已创建后 ${stage} 失败保存 ID，后续只恢复标记/索引，绝不重复创建`, async () => {
        const fixture = harness();
        const session = await preview(fixture);
        fixture.failure[stage] = true;
        const first = await saveHighlightDraft(fixture.plugin, session);
        assert.deepEqual(first, stage === "index" ? { ok: true, docId: draftId } : { ok: false, reason: "markFailed", docId: draftId });
        assert.equal(session.state, stage === "index" ? "saved" : "created");
        assert.equal(session.createdDocId, draftId);
        fixture.changeBlock(quoteId(1), { content: "source changed after creation" });
        fixture.failure[stage] = false;
        const writesBefore = fixture.calls.filter((call) => call.route === "/api/attr/setBlockAttrs").length;
        const restored = await saveHighlightDraft(fixture.plugin, session);
        assert.deepEqual(restored, { ok: true, docId: draftId });
        assert.equal(fixture.countCreates(), 1);
        if (stage === "index") assert.equal(fixture.calls.filter((call) => call.route === "/api/attr/setBlockAttrs").length, writesBefore);
    });
}

for (const stage of ["create", "invalidId"]) {
    test(`创建 ${stage} 结果未知时禁止再建，实际已建文档仍可人工核对`, async () => {
        const fixture = harness();
        const session = await preview(fixture);
        fixture.failure[stage] = true;
        assert.deepEqual(await saveHighlightDraft(fixture.plugin, session), { ok: false, reason: "createUnknown" });
        assert.equal(session.state, "unknown");
        fixture.failure[stage] = false;
        assert.deepEqual(await saveHighlightDraft(fixture.plugin, session), { ok: false, reason: "createUnknown" });
        assert.equal(fixture.countCreates(), 1);
        assert.ok(fixture.block(draftId));
    });
}

for (const change of ["box", "hpath", "status", "url", "deleted"]) {
    test(`已建稿恢复前 ${change} 改变保留 ID 并停止标记，不重建也不影响用户文章`, async () => {
        const fixture = harness();
        const session = await preview(fixture);
        fixture.failure.mark = true;
        await saveHighlightDraft(fixture.plugin, session);
        fixture.failure.mark = false;
        if (change === "box") fixture.changeBlock(draftId, { box: "other-box" });
        if (change === "hpath") fixture.changeBlock(draftId, { hpath: "/moved/draft" });
        if (change === "status") fixture.setAttrs(draftId, { "custom-clip-status": "later" });
        if (change === "url") fixture.setAttrs(draftId, { "custom-clip-url": "https://user.test/" });
        if (change === "deleted") fixture.deleteBlock(draftId);
        assert.deepEqual(await saveHighlightDraft(fixture.plugin, session), { ok: false, reason: "markFailed", docId: draftId });
        assert.equal(session.createdDocId, draftId);
        assert.equal(fixture.countCreates(), 1);
        assert.equal(fixture.attributes.get(draftId)?.["custom-clip-internal"], undefined);
    });
}

test("同一预览并发确认立即拒绝第二次保存，成功响应只创建一份", async () => {
    const fixture = harness();
    const session = await preview(fixture);
    let release;
    fixture.holdCreate(new Promise((resolve) => { release = resolve; }));
    const pending = saveHighlightDraft(fixture.plugin, session);
    assert.equal(session.busy, true);
    assert.deepEqual(await saveHighlightDraft(fixture.plugin, session), { ok: false, reason: "busy" });
    release();
    assert.deepEqual(await pending, { ok: true, docId: draftId });
    assert.equal(session.busy, false);
    assert.equal(fixture.countCreates(), 1);
});

test("Svelte 编译通过，UI 保留制卡、受设置约束的相关旧文、可见重试和 44px 操作", () => {
    const source = readFileSync(new URL("../src/ui/HighlightView.svelte", import.meta.url), "utf8");
    const result = compile(source, { filename: "HighlightView.svelte", generate: "client" });
    assert.deepEqual(result.warnings, []);
    assert.ok(!/querySql|SELECT content|fetchTitle/.test(source));
    assert.match(source, /findRelatedOutcome\(docId, query, \[\], \{ plugin: facade\.pluginInstance, settings \}\)/);
    assert.match(source, /reader\.relatedFailed/);
    assert.match(source, /reader\.relatedRetry/);
    assert.match(source, /reader\.relatedNoHits/);
    assert.match(source, /makeQuoteCard/);
    assert.match(source, /role="alert"/);
    assert.match(source, /min-height: 44px/);
    assert.match(source, /scope === "current"/);
    assert.match(source, /saveHighlightDraft/);
});

test("跨文档鲸鱼批注（日记/目标文档/子文档）完整读取、去重分组与双向写回（想法/标记/追记/删除）", async () => {
    const fixture = harness();
    const dailyDocId = rootId(50);
    const sourceParaId = quoteId(10);
    const whaleInDailyId = quoteId(11);
    const whaleMemberHiddenId = quoteId(12);
    const whaleZoneId = quoteId(13);

    // 1. 源文章段落挂载 custom-comment-refs
    fixture.addDocument(dailyDocId, {});
    fixture.addBlock(sourceParaId, originalId, {
        type: "p",
        content: "原始文章段落",
        markdown: "原始文章段落",
        ial: `{: custom-comment-refs="${whaleInDailyId}"}`,
    });
    // 2. 批注块存储在今日日记 dailyDocId 中
    fixture.addBlock(whaleInDailyId, dailyDocId, {
        type: "p",
        content: "跨文档批注思考",
        markdown: "跨文档批注思考",
    });
    fixture.setAttrs(whaleInDailyId, {
        "custom-siyuan-comment": "true",
        "custom-comment-source": sourceParaId,
        "custom-comment-text": "跨行\"划线\"_esc_newline_第二句",
        "custom-comment-tag": "important",
        "custom-comment-highlight-style": "red",
        "custom-comment-replies": JSON.stringify([{ id: "r1", md: "初始追记" }]),
    });
    // 3. 组员隐藏块 & zone 容器块不得重复出现
    fixture.addBlock(whaleMemberHiddenId, dailyDocId, {
        type: "p",
        content: "组员隐藏",
        ial: `{: custom-siyuan-comment="true" custom-comment-source="${sourceParaId}" custom-comment-text="隐藏" custom-comment-block-hidden="true" custom-comment-group="g1" custom-comment-group-master="${whaleInDailyId}"}`,
    });
    fixture.addBlock(whaleZoneId, originalId, {
        type: "h",
        content: "批注",
        ial: `{: custom-siyuan-comment="true" custom-siyuan-comment-zone="true"}`,
    });

    const items = await listDocHighlights(originalId);
    const whaleItem = items.find((it) => it.id === whaleInDailyId);
    assert.ok(whaleItem, "必须读取到保存在日记里的跨文档鲸鱼批注");
    assert.equal(whaleItem.rootId, originalId);
    assert.equal(whaleItem.commentDocId, dailyDocId);
    assert.equal(whaleItem.commentBlockId, whaleInDailyId);
    assert.equal(whaleItem.sourceBlockId, sourceParaId);
    assert.equal(whaleItem.text, "跨行\"划线\"\n第二句");
    assert.equal(whaleItem.memo, "跨文档批注思考");
    assert.equal(whaleItem.annotationTag, "important");
    assert.equal(whaleItem.color, "red");
    assert.deepEqual(whaleItem.replies, [{ id: "r1", time: undefined, author: undefined, md: "初始追记" }]);
    assert.equal(items.some((it) => it.id === whaleMemberHiddenId || it.id === whaleZoneId), false);

    // 双向写回：修改标签、追加追记、修改想法、删除清理 refs
    await setAnnotationTag(whaleItem, "todo");
    assert.equal(fixture.attributes.get(whaleInDailyId)["custom-comment-tag"], "todo");

    const updatedReplies = await addAnnotationReply(whaleItem, "第二条追记");
    assert.equal(updatedReplies.length, 2);
    assert.equal(updatedReplies[1].md, "第二条追记");

    await updateHighlightMemo(whaleItem, "更新后的鲸鱼批注");
    assert.equal(fixture.block(whaleInDailyId).markdown, "更新后的鲸鱼批注");

    fixture.setAttrs(sourceParaId, { "custom-comment-refs": whaleInDailyId });
    await deleteAnnotation(whaleItem, "delete-block");
    assert.equal(fixture.block(whaleInDailyId), undefined);
    assert.equal(fixture.attributes.get(sourceParaId)["custom-comment-refs"], "");
});
