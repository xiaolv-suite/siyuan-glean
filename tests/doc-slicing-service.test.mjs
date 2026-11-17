import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "siyuan") return { url: "glean-doc-slicing:siyuan", shortCircuit: true };
        if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === "glean-doc-slicing:siyuan") {
            return {
                format: "module",
                source: "export const fetchSyncPost = (...args) => globalThis.__gleanDocSlicingPost(...args); export const getFrontend = () => 'desktop';",
                shortCircuit: true,
            };
        }
        return nextLoad(url, context);
    },
});

globalThis.__gleanDocSlicingPost = (endpoint, payload) => {
    if (endpoint === "/api/filetree/createDocWithMd") {
        return { code: 0, data: "20261027120000-slice01" };
    }
    if (endpoint === "/api/attr/setBlockAttrs" || endpoint === "/api/attr/getBlockAttrs") {
        return { code: 0, data: null };
    }
    return { code: 0, data: null };
};

const { createSliceSubDocuments } = await import("../src/services/doc-slicing-service.ts");

test("createSliceSubDocuments 在缺失笔记本或存储路径时安全拒止", async () => {
    const context = {
        id: "20261027120000-root001",
        title: "万字长文",
        status: "reading",
        contentType: "fulltext",
        url: "https://example.com/long-article",
        location: { box: "", hpath: "" },
        readMinutesRaw: null,
    };

    const plan = {
        totalSlices: 2,
        targetMinutes: 8,
        slices: [
            {
                index: 1,
                title: "第 1 片：引言",
                startBlockId: "20261027120000-blk0001",
                sectionIds: ["20261027120000-blk0001"],
                sectionTitles: ["引言"],
                estimatedWords: 1200,
                estimatedMinutes: 3,
            },
        ],
    };

    const result = await createSliceSubDocuments({}, context, plan);
    assert.equal(result.ok, false);
    assert.equal(result.createdCount, 0);
    assert.equal(result.failedCount, 1);
    assert.ok(result.errors[0].includes("无法获取"));
});
