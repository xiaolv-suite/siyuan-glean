import { listChildBlocks, exportMdContent } from "../api/client.ts";
import {
    parseBlocksToFoldNodes,
    createFoldNode,
    type FoldLevel,
    type FoldNode,
} from "../domain/folded-reader.ts";

/**
 * 清洗思源块内容中的 HTML/Markdown 冗余标记，保留纯文本
 */
export function cleanBlockContent(raw: string): string {
    return (raw || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\(\([0-9a-z-]+\s+['"]?([^'"]*)['"]?\)\)/g, "$1") // ((id 'title')) -> title
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [title](url) -> title
        .replace(/!\[[^\]]*\]\([^)]+\)/g, "") // remove images
        .replace(/[*_~`#]/g, "") // remove formatting symbols
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * 从思源内核拉取指定文档的子块并组装为 5 阶折叠节点序列
 */
export async function loadDocumentFoldNodes(
    docId: string,
    initialLevel: FoldLevel = 2,
): Promise<FoldNode[]> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(docId)) {
        return [];
    }

    try {
        const rows = await listChildBlocks(docId);
        // 优先筛选正文段落块 (NodeParagraph) 与引用块 (NodeBlockquote) 与标题块 (NodeHeading)
        const contentRows = rows.filter((r) => {
            if (!r.content || r.content.trim().length < 3) return false;
            // 排除表格或代码块内部片段，保留核心行文段落
            if (r.type === "NodeCodeBlock" || r.type === "NodeTable") return false;
            return true;
        });

        if (contentRows.length > 0) {
            const mapped = contentRows.map((r) => ({
                id: r.id,
                content: cleanBlockContent(r.content || ""),
                type: r.type,
                subType: r.subType,
            }));
            return parseBlocksToFoldNodes(mapped, initialLevel);
        }
    } catch (err) {
        console.warn("[glean] listChildBlocks 获取折叠段落失败，尝试降级读取 Markdown:", err);
    }

    // 优雅降级：通过 exportMdContent 读取全文并拆分为逻辑段落
    try {
        const mdRes = await exportMdContent(docId);
        if (!mdRes || !mdRes.content) return [];

        const rawParagraphs = mdRes.content
            .split(/\r?\n\r?\n+/)
            .map((p) => cleanBlockContent(p))
            .filter((p) => p.length >= 10);

        return rawParagraphs.map((p, idx) => {
            const syntheticId = `${docId}-para${idx + 1}`;
            return createFoldNode(syntheticId, p, {
                level: initialLevel,
                expanded: false,
            });
        });
    } catch (fallbackErr) {
        console.warn("[glean] exportMdContent 降级失败:", fallbackErr);
        return [];
    }
}
