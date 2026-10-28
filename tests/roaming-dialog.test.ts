import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("RoamingDrawerDialog 契约守门：展示推荐理由、匹配得分、换盲盒与立即开读动作", () => {
    const dialogSource = fs.readFileSync(new URL("../src/ui/RoamingDrawerDialog.svelte", import.meta.url), "utf8");
    assert.match(dialogSource, /currentPick\.reason/);
    assert.match(dialogSource, /currentPick\.score/);
    assert.match(dialogSource, /roaming\.nextBlindBox/);
    assert.match(dialogSource, /roaming\.startReadNow/);
    assert.match(dialogSource, /pickRoamingArticle/);
    assert.match(dialogSource, /onOpenArticle\(currentPick\.item\.id\)/);
});

test("DockPanel 漫游盲盒与滑动窗口限流契约", () => {
    const dockSource = fs.readFileSync(new URL("../src/ui/DockPanel.svelte", import.meta.url), "utf8");
    assert.match(dockSource, /openRoamingDialog/);
    assert.match(dockSource, /triggerRoamingRead/);
    assert.match(dockSource, /const concurrency = 4;/);
    assert.match(dockSource, /wechatDocIds\.slice\(i, i \+ concurrency\)/);
});

test("双语 i18n 覆盖：漫游盲盒文案对齐", () => {
    const zh = JSON.parse(fs.readFileSync(new URL("../public/i18n/zh_CN.json", import.meta.url), "utf8"));
    const en = JSON.parse(fs.readFileSync(new URL("../public/i18n/en_US.json", import.meta.url), "utf8"));
    assert.ok(zh["roaming.dialogTitle"]);
    assert.ok(en["roaming.dialogTitle"]);
    assert.ok(zh["roaming.nextBlindBox"]);
    assert.ok(en["roaming.nextBlindBox"]);
    assert.ok(zh["roaming.startReadNow"]);
    assert.ok(en["roaming.startReadNow"]);
});
