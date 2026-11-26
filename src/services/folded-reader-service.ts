import type { Plugin } from "siyuan";
import { listChildBlocks, exportMdContent } from "../api/client.ts";
import {
    parseBlocksToFoldNodes,
    createFoldNode,
    isVerbatimSubstring,
    type FoldLevel,
    type FoldNode,
} from "../domain/folded-reader.ts";
import type { GleanSettings } from "./settings.ts";
import { callLLM } from "./enrich-service.ts";

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

/**
 * 借助 AI 大模型对五阶分层阅读节点进行深度语义提炼：
 * 消除机械标点切分的混乱碎片，提炼出真正高价值的：
 * - Level 3: 核心论据与支撑论点（Key Arguments）
 * - Level 4: 单行精炼要旨（Executive Gist）
 * - Level 5: 核心概念与思维模型标签（Concept Tags）
 */
export async function enrichFoldNodesWithAi(
    plugin: Plugin,
    settings: GleanSettings,
    nodes: FoldNode[],
    maxNodes = 12,
    options: { signal?: AbortSignal } = {},
): Promise<{ ok: boolean; nodes: FoldNode[]; count: number; error?: string; aborted?: boolean }> {
    if (options.signal?.aborted) {
        return { ok: false, nodes, count: 0, aborted: true };
    }
    if (!nodes || nodes.length === 0) {
        return { ok: false, nodes, count: 0, error: "暂无段落节点" };
    }

    // 挑选出最具信息量的段落
    const candidateNodes = nodes.filter(n => n.fullText.length >= 25).slice(0, maxNodes);
    if (candidateNodes.length === 0) {
        return { ok: false, nodes, count: 0, error: "未发现足够长正文段落" };
    }

    const payload = candidateNodes.map((n, idx) => ({
        idx: idx + 1,
        id: n.id,
        text: n.fullText.slice(0, 320)
    }));

    const prompt = `你是一位高阶渐进式阅读（Progressive Reading）与知识提炼专家。
请对以下文章段落进行深层语义解构，提炼“五阶思维分层”的核心要素，拒绝机械切词，必须输出高质量逻辑：
1. brief: 从原文中原样摘取的 1 句最核心作者原话（Verbatim quote，必须字字出自原文，不加修饰）；
2. points: 该段落展开论证的核心论据或分论点（1~3 条，每条不超过 35 字）；
3. gist: 该段落的精髓要旨（一句话讲清该段的底层洞察或行动推论，不超过 45 字）；
4. concept: 该段涉及的核心概念、专业术语或思维模型（1~2 个词，如“飞轮效应”、“流动性风险”）。

待处理段落列表：
${JSON.stringify(payload, null, 2)}

请仅输出严格合规的 JSON 数组（无其他说明，无 markdown 标记外包裹），结构为：
[
  { "id": "节点ID", "brief": "逐字原句", "points": ["论据1", "论据2"], "gist": "单行要旨", "concept": "核心概念" }
]`;

    try {
        const outcome = await callLLM(plugin, settings, prompt, {
            priority: "high",
            ...(options.signal ? { signal: options.signal } : {}),
        });
        if (outcome.aborted || options.signal?.aborted) {
            return { ok: false, nodes, count: 0, aborted: true };
        }
        if (!outcome.ok || !outcome.text) {
            return { ok: false, nodes, count: 0, error: outcome.failure || "AI 未返回有效内容" };
        }

        const rawJson = outcome.text.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
        const jsonMatch = rawJson.match(/\[\s*\{[\s\S]*\}\s*\]/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawJson);

        if (!Array.isArray(parsed)) {
            return { ok: false, nodes, count: 0, error: "AI 输出格式不符合预期" };
        }

        const enrichedMap = new Map<string, { brief?: string; points?: string[]; gist?: string; concept?: string }>();
        for (const item of parsed) {
            if (item && item.id) {
                enrichedMap.set(String(item.id), {
                    brief: typeof item.brief === "string" ? item.brief.trim() : undefined,
                    points: Array.isArray(item.points) ? item.points.map(String).filter(Boolean) : undefined,
                    gist: typeof item.gist === "string" ? item.gist.trim() : undefined,
                    concept: typeof item.concept === "string" ? item.concept.trim() : undefined,
                });
            }
        }

        let updatedCount = 0;
        const nextNodes = nodes.map(n => {
            const aiData = enrichedMap.get(n.id);
            if (!aiData) return n;
            updatedCount++;
            return {
                ...n,
                points: aiData.points && aiData.points.length > 0 ? aiData.points : n.points,
                gist: aiData.gist || n.gist,
                concept: aiData.concept || n.concept,
                brief: aiData.brief && isVerbatimSubstring(aiData.brief, n.fullText) ? aiData.brief : n.brief,
                aiEnriched: true,
            };
        });

        return { ok: true, nodes: nextNodes, count: updatedCount };
    } catch (err) {
        return { ok: false, nodes, count: 0, error: err instanceof Error ? err.message : String(err) };
    }
}
