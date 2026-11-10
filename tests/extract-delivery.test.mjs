import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const file = new URL("../src/ui/ReaderTab.svelte", import.meta.url);
const source = process.env.GLEAN_DELIVERY_BASELINE === "1"
    ? execFileSync("git", ["show", "HEAD:src/ui/ReaderTab.svelte"], { cwd: new URL("..", import.meta.url), encoding: "utf8" })
    : readFileSync(file, "utf8");
const script = source.slice(source.indexOf(">") + 1, source.indexOf("</script>"));
const ast = ts.createSourceFile("reader.ts", script, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ["incrementalExtractToCards", "pushHighlightToCards"].includes(node.name?.text)).map(node => node.getText(ast)).join("\n");
function fixture(result) {
    const messages = [], marks = new Set(), calls = [], events = [];
    const globals = { excerpt: { text: "quote", blockId: "block" }, context: { id: "doc", title: "Article", tags: [] }, docId: "doc",
        hasCardsInstalled: true, flashcardPipelineBusy: false, enrolledFlashcardKeys: marks,
        sendExtractToCardsSafely: async (input) => { calls.push(input); return result; },
        extractDeliveryKey: (doc, block, text) => `${doc}:${block}:${text}`,
        window: { dispatchEvent: e => events.push(e) }, CustomEvent: class { constructor(type) { this.type = type; } },
        showMessage: m => messages.push(m), t: (_i, key) => key, i18n: {}, cardFromHighlight: () => { throw new Error("No fallback write allowed"); } };
    const context = vm.createContext(globals);
    vm.runInContext(ts.transpileModule(functions + "\n globalThis.run = incrementalExtractToCards;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    return { run: context.run, messages, marks, calls, events };
}
test("failed or unknown extract receipts preserve selection without success or a second write transport", async () => {
    for (const state of ["rejected", "unknown"]) {
        const f = fixture({ ok: false, state });
        await f.run();
        assert.equal(f.marks.size, 0);
        assert.equal(f.messages.includes("reader.extractedToCards"), false);
        assert.equal(f.events.length, 0);
    }
});
test("confirmed receipt alone marks the full selection identity and sends one stable request", async () => {
    const f = fixture({ ok: true, state: "applied", createdBlockID: "new-doc" });
    await f.run();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].requestId, "doc:block:quote");
    assert.equal(f.events.length, 0);
    assert.equal(f.messages.includes("reader.extractedToCards"), true);
});
