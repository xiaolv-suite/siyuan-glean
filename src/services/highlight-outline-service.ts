/**
 * 结构化高亮大纲服务层 (Highlight Outline Service)
 * 
 * 核心功能：
 * 1. 深度聚合文档标题大纲与散落的高亮划线，输出章节化思维大纲
 * 2. 一键将结构化大纲生成为思源原生独立笔记，每条高亮自带双向原文反链
 */

import type { Plugin } from "siyuan";
import { querySql, createDocWithMd, listHighlightDocuments, newNodeId } from "../api/client";
import { fetchDocOutline } from "./outline";
import { listDocHighlights } from "./highlights";
import { writeClip } from "./clip-store";
import {
    buildHighlightOutlineTree,
    renderStructuredOutlineMarkdown,
    type HighlightOutlineTree,
} from "../domain/highlight-outline";

/**
 * 实时生成指定文章的高亮结构化大纲树
 */
export async function generateDocHighlightOutline(
    docId: string,
    docTitle?: string
): Promise<HighlightOutlineTree> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(docId)) {
        return {
            docId,
            docTitle: docTitle || "",
            totalHighlights: 0,
            sections: [],
        };
    }

    const [headings, highlights, blockRows, docMetas] = await Promise.all([
        fetchDocOutline(docId).catch(() => []),
        listDocHighlights(docId).catch(() => []),
        querySql<{ id: string }>(
            `SELECT id FROM blocks WHERE root_id = '${docId}' ORDER BY sort ASC, id ASC LIMIT 2000`
        ).catch(() => []),
        listHighlightDocuments([docId]).catch(() => []),
    ]);

    const title = docTitle || docMetas[0]?.content || "未命名文档";
    const orderedBlockIds = blockRows.map((b) => b.id);

    return buildHighlightOutlineTree(
        docId,
        title,
        headings,
        highlights,
        orderedBlockIds
    );
}

/**
 * 一键将高亮结构化大纲持久化导出为思源原生独立读书笔记
 */
export async function exportHighlightOutlineAsDoc(
    plugin: Plugin,
    tree: HighlightOutlineTree,
    targetNotebookId?: string
): Promise<{ ok: boolean; docId?: string; error?: string }> {
    if (!tree.totalHighlights || !tree.docId) {
        return { ok: false, error: "暂无可导出的划线重点" };
    }

    try {
        const docs = await listHighlightDocuments([tree.docId]);
        const originalDoc = docs[0];
        const box = targetNotebookId || originalDoc?.box;
        if (!box) return { ok: false, error: "未找到目标笔记本" };

        const hpath = originalDoc?.hpath || "";
        const lastSlash = hpath.lastIndexOf("/");
        const parent = lastSlash > 0 ? hpath.slice(0, lastSlash) : "";
        const safeTitle = (tree.docTitle || "阅读大纲").replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 80);
        const targetHpath = `${parent}/[划线大纲] ${safeTitle} ${newNodeId()}`;

        const markdown = renderStructuredOutlineMarkdown(tree);
        const createdDocId = await createDocWithMd(box, targetHpath, markdown);

        if (!/^\d{14}-[0-9a-z]{7}$/.test(createdDocId)) {
            return { ok: false, error: "创建笔记文档失败" };
        }

        // 标记为内部笔记，防止被重复剪藏索引检索
        await writeClip(plugin, createdDocId, { internal: true });
        return { ok: true, docId: createdDocId };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : "导出失败",
        };
    }
}
