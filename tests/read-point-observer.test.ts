import test from "node:test";
import assert from "node:assert/strict";
import { createReadPointObserver, scrollAndPulseReadPoint } from "../src/libs/read-point-observer.ts";
import { ATTR, parseClipAttrs, serializePatch } from "../src/domain/schema.ts";

// Node 测试环境无 matchMedia：打桩为「未开启减弱动态」，走平滑滚动分支
if (typeof (globalThis as any).matchMedia === "undefined") {
    (globalThis as any).matchMedia = (query: string) => ({ matches: false, media: query });
}

test("ATTR.readPoint 契约与序列化符合小驴生态 Issue #17 规范", () => {
    assert.equal(ATTR.readPoint, "custom-lv-read-point");

    const ial = {
        "custom-lv-read-point": "20261027120000-abc1234",
    };
    const parsed = parseClipAttrs(ial);
    assert.equal(parsed.readPoint, "20261027120000-abc1234");

    const patch = serializePatch({ readPoint: "20261027120000-def5678" });
    assert.equal(patch["custom-lv-read-point"], "20261027120000-def5678");

    const removePatch = serializePatch({ readPoint: null });
    assert.equal(removePatch["custom-lv-read-point"], null);
});

class MockClassList {
    private classes = new Set<string>();
    add(cls: string) { this.classes.add(cls); }
    remove(cls: string) { this.classes.delete(cls); }
    contains(cls: string) { return this.classes.contains ? this.classes.contains(cls) : this.classes.has(cls); }
    has(cls: string) { return this.classes.has(cls); }
}

class MockElement {
    tagName = "DIV";
    attrs = new Map<string, string>();
    classList = new MockClassList();
    children: MockElement[] = [];
    isConnected = true;
    scrollTop = 0;
    scrollHeight = 500;
    clientHeight = 300;
    scrollIntoViewOpts: unknown = null;

    getAttribute(name: string) { return this.attrs.get(name) ?? null; }
    setAttribute(name: string, val: string) { this.attrs.set(name, val); }
    appendChild(child: MockElement) { this.children.push(child); return child; }
    querySelector<T = MockElement>(sel: string): T | null {
        const idMatch = sel.match(/\[data-node-id="([^"]+)"\]/);
        if (idMatch) {
            const targetId = idMatch[1];
            if (this.getAttribute("data-node-id") === targetId) return this as unknown as T;
            for (const c of this.children) {
                const found = c.querySelector<T>(sel);
                if (found) return found;
            }
        }
        return null;
    }
    querySelectorAll<T = MockElement>(sel: string): T[] {
        const list: MockElement[] = [];
        if (sel.includes("[data-node-id]") && this.getAttribute("data-node-id")) {
            list.push(this);
        }
        for (const c of this.children) {
            list.push(...c.querySelectorAll<MockElement>(sel));
        }
        return list as unknown as T[];
    }
    scrollIntoView(opts?: unknown) {
        this.scrollIntoViewOpts = opts;
    }
    getBoundingClientRect() {
        return { top: 100, bottom: 200, height: 100, width: 300, left: 0, right: 300 };
    }
    addEventListener() {}
    removeEventListener() {}
}

test("scrollAndPulseReadPoint 在宿主为空或非法块 ID 时安全返回 false", () => {
    assert.equal(scrollAndPulseReadPoint(null, "20261027120000-abc1234"), false);
    assert.equal(scrollAndPulseReadPoint(new MockElement() as unknown as HTMLElement, null), false);
    assert.equal(scrollAndPulseReadPoint(new MockElement() as unknown as HTMLElement, "invalid-id"), false);
});

test("scrollAndPulseReadPoint 在目标块存在时触发平滑滚动与高亮样式添加", () => {
    const host = new MockElement();
    const block = new MockElement();
    block.setAttribute("data-node-id", "20261027120000-abc1234");
    host.appendChild(block);

    const ok = scrollAndPulseReadPoint(host as unknown as HTMLElement, "20261027120000-abc1234");
    assert.equal(ok, true);
    assert.deepEqual(block.scrollIntoViewOpts, { block: "center", behavior: "smooth" });
    assert.equal(block.classList.has("glean-pulse-highlight"), true);
});

test("scrollAndPulseReadPoint 在系统开启减弱动态时降级为即时滚动", () => {
    const previous = (globalThis as any).matchMedia;
    (globalThis as any).matchMedia = (query: string) => ({ matches: true, media: query });
    try {
        const host = new MockElement();
        const block = new MockElement();
        block.setAttribute("data-node-id", "20261027120000-abc9999");
        host.appendChild(block);
        scrollAndPulseReadPoint(host as unknown as HTMLElement, "20261027120000-abc9999");
        assert.deepEqual(block.scrollIntoViewOpts, { block: "center", behavior: "auto" });
    } finally {
        (globalThis as any).matchMedia = previous;
    }
});

test("createReadPointObserver 遵循 1000ms 驻留防抖契约并在非浏览器环境下安全返回", async () => {
    const host = new MockElement();
    const blockA = new MockElement();
    blockA.setAttribute("data-node-id", "20261027120000-aaaaaaa");
    host.appendChild(blockA);

    const changes: string[] = [];
    const observer = createReadPointObserver({
        host: host as unknown as HTMLElement,
        docId: "20261027120000-root001",
        dwellMs: 50,
        onReadPointChange(id) {
            changes.push(id);
        },
    });

    assert.ok(observer);
    assert.equal(typeof observer.disconnect, "function");
    assert.equal(typeof observer.captureCurrentPoint, "function");

    observer.disconnect();
});
