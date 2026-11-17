import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * 剪贴板失败路径覆盖率契约（R28）：
 * 源码中每一处 navigator.clipboard.writeText 调用，必须满足以下之一：
 * 1) 语句链携带 .catch(...)；
 * 2) .then(okFn, failFn) 双参拒绝回调；
 * 3) 被显式 try { ... } catch ( ...) 包裹。
 * 防止剪贴板写入权限被拒绝时出现未捕获异常导致 UI 静默失败。
 */
const root = resolve(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            if (["node_modules", "dist", "build", "release"].includes(e.name)) continue;
            walk(p, out);
        } else if (/\.(ts|svelte)$/.test(e.name)) out.push(p);
    }
    return out;
}

function balancedParens(src: string, openIdx: number, max = 600): number {
    let depth = 0;
    for (let i = openIdx; i < Math.min(src.length, openIdx + max); i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") { depth--; if (depth === 0) return i; }
    }
    return -1;
}

function hasTwoArgThen(src: string, from: number): boolean {
    const thenIdx = src.indexOf(".then(", from);
    if (thenIdx < 0 || thenIdx > from + 500) return false;
    const close = balancedParens(src, thenIdx + 5);
    if (close < 0) return false;
    let depth = 0;
    for (let i = thenIdx + 6; i < close; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
        else if (src[i] === "," && depth === 0) return true;
    }
    return false;
}

function uncoveredSites(src: string): number[] {
    const out: number[] = [];
    for (const m of src.matchAll(/clipboard\.writeText\s*\(/g)) {
        const pos = m.index;
        const window = src.slice(pos, pos + 500);
        if (/\.catch\s*\(/.test(window) || hasTwoArgThen(src, pos)) continue;
        const before = src.slice(Math.max(0, pos - 2500), pos);
        const after = src.slice(pos, pos + 3000);
        const tryIdx = before.lastIndexOf("try {") >= 0 || before.lastIndexOf("try{") >= 0;
        if (tryIdx && /\bcatch\b/.test(after)) continue;
        const line = src.slice(0, pos).split("\n").length;
        out.push(line);
    }
    return out;
}

test("拾遗 · 所有 clipboard.writeText 调用均有失败处理 (catch/try-catch) (R28)", () => {
    const offenders: string[] = [];
    for (const file of walk(join(root, "src"))) {
        const src = readFileSync(file, "utf8");
        if (!/clipboard\.writeText\s*\(/.test(src)) continue;
        for (const line of uncoveredSites(src)) {
            offenders.push(`${relative(root, file)}:${line}`);
        }
    }
    assert.deepEqual(offenders, [], `clipboard.writeText 存在未处理拒绝的调用：${offenders.join("; ")}`);
});
