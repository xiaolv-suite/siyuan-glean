import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
const source = readFileSync(new URL("../src/ui/ReaderTab.svelte", import.meta.url), "utf8");
const script = source.slice(source.indexOf(">") + 1, source.indexOf("</script>"));
const ast = ts.createSourceFile("reader.ts", script, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "toggleFavorite");
test("late favorite failure for A cannot change B's projection", async () => {
    let reject;
    const pending = new Promise((_, no) => { reject = no; });
    const context = vm.createContext({ context: { id: "A", favorite: false }, docId: "A", sessionGeneration: 1, statusBusy: false,
        facade: { pluginInstance: {}, notifyDataChanged() {} }, writeClip: () => pending, showMessage() {}, t: () => "", i18n: {}, console: { warn() {} } });
    vm.runInContext(ts.transpileModule(fn.getText(ast) + "\nglobalThis.run = toggleFavorite;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    const task = context.run();
    context.context = { id: "B", favorite: true }; context.docId = "B"; context.sessionGeneration = 2;
    reject(new Error("A failed after navigation")); await task;
    assert.equal(context.context.favorite, true);
});
