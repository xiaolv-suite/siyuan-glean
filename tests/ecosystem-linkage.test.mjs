/** 小驴全生态跨插件联邦联动测试 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "siyuan") return { url: "glean-test:siyuan-ecosystem", shortCircuit: true };
        if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
            return nextResolve(`${specifier}.ts`, context);
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === "glean-test:siyuan-ecosystem") {
            return {
                format: "module",
                source: "export const showMessage = () => undefined; export const openTab = () => undefined;",
                shortCircuit: true,
            };
        }
        return nextLoad(url, context);
    },
});

const {
    sendExtractToCardsSafely,
    getCardsDueSummarySafely,
    searchPersonSafely,
    ensurePersonSafely,
    appendPersonFactSafely,
    captureQuoteToCommonSafely,
    getCheckinStreaksSafely,
} = await import("../src/libs/ecosystem-bridge-kit.ts");

test("小驴闪卡（siyuan-lv-cards）：未安装时静默降级，已安装时成功调用 receiveExtract 与 due 汇总", async () => {
    // 1. 未安装时
    globalThis.window = {};
    const fallbackRes = await sendExtractToCardsSafely({
        content: "这是一条测试金句摘录",
        sourceBlockId: "20261101120000-block01",
        sourceDocId: "20261101120000-doc0001",
        sourceTitle: "深度思考文章",
    });
    assert.equal(fallbackRes.ok, false);
    assert.equal(fallbackRes.message, "cards-not-available");

    const fallbackDue = await getCardsDueSummarySafely();
    assert.equal(fallbackDue.ok, false);
    assert.equal(fallbackDue.unreviewedCount, 0);

    // 2. 模拟小驴闪卡挂载
    let receivedExtractPayload = null;
    globalThis.window.xiaolvCards = {
        protocol: 1,
        capabilities: ["receiveExtract", "due", "openReview"],
        whenReady: async () => true,
        hasCapability: (name) => ["receiveExtract", "due", "openReview"].includes(name),
        receiveExtract: async (envelope) => {
            receivedExtractPayload = envelope;
            return { ok: true, data: { createdBlockID: "card-block-999", blockID: "card-block-999", kind: "extract", enrolled: false } };
        },
        getDueSummary: async () => ({
            ok: true,
            data: {
                unreviewedCount: 5,
                unreviewedNewCardCount: 3,
                unreviewedOldCardCount: 2,
                todayReviewedCount: 10,
                updatedAt: new Date().toISOString(),
            },
        }),
    };

    const successRes = await sendExtractToCardsSafely({
        content: "这是一条测试金句摘录",
        sourceBlockId: "20261101120000-block01",
        sourceDocId: "20261101120000-doc0001",
        sourceTitle: "深度思考文章",
        tags: ["思维", "认知"],
    });
    assert.equal(successRes.ok, true);
    assert.equal(receivedExtractPayload.content, "这是一条测试金句摘录");
    assert.equal(receivedExtractPayload.sourceBlockId, "20261101120000-block01");

    const successDue = await getCardsDueSummarySafely();
    assert.equal(successDue.ok, true);
    assert.equal(successDue.unreviewedCount, 5); // total already includes new=3 and old=2
    assert.equal(successDue.todayReviewedCount, 10);
});

test("小驴人脉（siyuan-contacts）：作者检索、一键沉淀（ensurePerson）与追加事实（appendFact）", async () => {
    // 1. 未安装时
    globalThis.window = {};
    assert.equal(await searchPersonSafely("未知作者"), null);
    const noContactEnsure = await ensurePersonSafely("新作者");
    assert.equal(noContactEnsure.ok, false);

    // 2. 模拟小驴人脉挂载 (protocol 2)
    const mockPeople = [
        { docId: "person-doc-001", itemId: "p1", name: "卡尔·纽波特", group: "学者", tags: ["深度工作"] },
    ];
    let appendedFact = null;

    globalThis.window.LvContacts = {
        protocol: 2,
        apiVersion: 2,
        version: "0.7.6",
        capabilities: ["searchPeople", "getPerson", "ensurePerson", "recordInteraction", "appendFact"],
        whenReady: async () => true,
        hasCapability: (name) => ["searchPeople", "getPerson", "ensurePerson", "recordInteraction", "appendFact"].includes(name),
        searchPeople: async (kw) => mockPeople.filter((p) => p.name.includes(kw || "")),
        ensurePerson: async (name, options) => {
            const found = mockPeople.find((p) => p.name === name);
            if (found) return { ...found, created: false };
            const created = { docId: `person-doc-${Date.now()}`, itemId: "p_new", name, group: "未分组", tags: [] };
            mockPeople.push(created);
            return { ...created, created: true };
        },
        appendFact: async (personDocId, input) => {
            appendedFact = { personDocId, input };
            return { id: "fact-1", ...input };
        },
    };

    // 查找已有作者
    const foundPerson = await searchPersonSafely("卡尔·纽波特");
    assert.ok(foundPerson);
    assert.equal(foundPerson.docId, "person-doc-001");

    // 查找不存在作者
    assert.equal(await searchPersonSafely("陌生人"), null);

    // 一键沉淀新作者
    const enrolled = await ensurePersonSafely("保罗·格雷厄姆", { docId: "article-doc-999" });
    assert.equal(enrolled.ok, true);
    assert.equal(enrolled.created, true);
    assert.equal(enrolled.person.name, "保罗·格雷厄姆");

    // 向人脉联系人追加阅读事实
    const factSuccess = await appendPersonFactSafely("person-doc-001", {
        text: "精读了文章《深度工作与注意力管理》",
        category: "other",
        sourceRef: "article-doc-999",
    });
    assert.equal(factSuccess, true);
    assert.equal(appendedFact.personDocId, "person-doc-001");
    assert.equal(appendedFact.input.text, "精读了文章《深度工作与注意力管理》");
});

test("小驴常用（xiaolv-common）：金句与批注一键存入常用片段库（captureQuote）", async () => {
    // 1. 未安装时
    globalThis.window = {};
    const fallbackRes = await captureQuoteToCommonSafely({ quote: "简单即是美" });
    assert.equal(fallbackRes.ok, false);

    // 2. 模拟小驴常用挂载
    let capturedInput = null;
    globalThis.window.xiaolvCommon = {
        protocol: 1,
        capabilities: ["captureQuote", "search", "get"],
        whenReady: async () => true,
        hasCapability: (name) => ["captureQuote", "search", "get"].includes(name),
        captureQuote: async (input) => {
            capturedInput = input;
            return { ok: true, data: { id: "common-snippet-888" } };
        },
    };

    const successRes = await captureQuoteToCommonSafely({
        quote: "深度工作是数字经济时代的超能力。",
        author: "卡尔·纽波特",
        sourceDocId: "doc-123",
        sourceBlockId: "block-456",
        sourceTitle: "深度工作",
    });
    assert.equal(successRes.ok, true);
    assert.equal(successRes.itemId, "common-snippet-888");
    assert.equal(capturedInput.quote, "深度工作是数字经济时代的超能力。");
    assert.equal(capturedInput.author, "卡尔·纽波特");
    assert.equal(capturedInput.category, "拾遗金句");
});

test("小驴打卡（siyuan-checkin）：读取连续打卡天数（getStreaks）", async () => {
    // 1. 未安装时
    globalThis.window = {};
    assert.equal(await getCheckinStreaksSafely("habit-1"), null);

    // 2. 模拟小驴打卡挂载
    globalThis.window.siyuanCheckin = {
        protocol: "siyuan-checkin",
        version: 5,
        capabilities: ["streaks.read", "events.record"],
        whenReady: async () => true,
        hasCapability: (name) => ["streaks.read", "events.record"].includes(name),
        getStreaks: (itemIds) => [
            { itemId: "habit-read", current: 7, longest: 21 },
        ],
    };

    const streaks = await getCheckinStreaksSafely("habit-read");
    assert.ok(streaks);
    assert.equal(streaks.current, 7);
    assert.equal(streaks.longest, 21);
});
