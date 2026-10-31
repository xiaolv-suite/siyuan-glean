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

const EXCLUDED_BLOCK_TYPES = new Set(["c", "t", "m", "html", "tb", "NodeCodeBlock", "NodeTable"]);
const CONTAINER_BLOCK_TYPES = new Set(["b", "l", "i", "s", "callout"]);

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
        const collected: Array<{ id: string; content: string; type: string; subType?: string }> = [];
        const seen = new Set<string>([docId]);
        let requests = 0;

        async function collectBlocks(parentId: string, depth: number): Promise<void> {
            if (++requests > 80 || depth > 12) return;
            const rows = await listChildBlocks(parentId);
            for (const r of rows) {
                if (!r || !r.id || seen.has(r.id)) continue;
                seen.add(r.id);
                if (EXCLUDED_BLOCK_TYPES.has(r.type)) continue;
                const cleaned = cleanBlockContent(r.content || "");
                if (cleaned.length >= 3 && (r.type === "p" || r.type === "h" || r.type.startsWith("Node"))) {
                    collected.push({
                        id: r.id,
                        content: cleaned,
                        type: r.type,
                        subType: r.subType,
                    });
                } else if (CONTAINER_BLOCK_TYPES.has(r.type)) {
                    await collectBlocks(r.id, depth + 1);
                } else if (cleaned.length >= 3) {
                    collected.push({
                        id: r.id,
                        content: cleaned,
                        type: r.type,
                        subType: r.subType,
                    });
                }
            }
        }

        await collectBlocks(docId, 0);
        if (collected.length > 0) {
            return parseBlocksToFoldNodes(collected, initialLevel);
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
