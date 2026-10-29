import type { Plugin } from "siyuan";
import { exportMdContent } from "../api/client";
import { extractWechatAuthor, isWechatUrl, extractWechatDescription, extractWechatSeries, cleanWechatNoise, repairWechatContent } from "../domain/wechat";
import { countWords, estimateMinutes } from "../domain/schema";
import { readClip, writeClip } from "./clip-store";

/**
 * 自动识别并强行回填单个文档的微信公众号作者（强需求，无需用户同意）
 *
 * 识别流程：
 * 1. 验证目标文档是否为微信公众号文章（URL 或 Site）；
 * 2. 若已有明确作者，直接返回；
 * 3. 若传入了已有 markdown/文本片段则优先使用，否则通过 exportMdContent 导出正文；
 * 4. 调用 extractWechatAuthor 纯函数精准提取公众号名称；
 * 5. 一旦提取成功，直接调用 writeClip(..., { author }, { force: true }) 强行写入属性并同步索引。
 */
export async function scanAndFillWechatAuthor(
    plugin: Plugin,
    docId: string,
    options: {
        url?: string;
        site?: string;
        markdown?: string;
        domText?: string;
    } = {},
): Promise<string | null> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(docId)) return null;

    let targetUrl = options.url;
    let targetSite = options.site;
    let existingSummary = "";
    let existingAiTags: string[] = [];

    try {
        const clip = await readClip(docId);
        if (clip.author?.trim()) return clip.author.trim();
        targetUrl = targetUrl || clip.url;
        targetSite = targetSite || clip.site;
        existingSummary = clip.summary || "";
        existingAiTags = clip.aiTags || [];
    } catch {
        return null;
    }

    const isWechat = isWechatUrl(targetUrl) || isWechatUrl(targetSite);
    if (!isWechat) return null;

    let contentToScan = options.markdown || options.domText || "";

    if (!contentToScan.trim()) {
        try {
            const exported = await exportMdContent(docId, { yfm: false, addTitle: false, refMode: 2 });
            contentToScan = exported?.content || "";
        } catch {
            return null;
        }
    }

    if (!contentToScan.trim()) return null;

    // 截取前 3500 字符进行高密度模式提取
    const snippet = contentToScan.slice(0, 3500);
    const detected = extractWechatAuthor(snippet);
    const desc = extractWechatDescription(snippet);
    const series = extractWechatSeries(snippet);

    const patch: { author?: string; summary?: string; aiTags?: string[] } = {};
    if (detected && detected.trim()) {
        patch.author = detected.trim();
    }
    if (desc && desc.trim() && !existingSummary) {
        patch.summary = desc.trim();
    }
    if (series && series.trim()) {
        const cleanSeries = series.trim();
        if (!existingAiTags.includes(cleanSeries)) {
            patch.aiTags = [...existingAiTags, cleanSeries];
        }
    }

    if (Object.keys(patch).length > 0) {
        try {
            await writeClip(plugin, docId, patch, { force: true });
            return patch.author ?? null;
        } catch (error) {
            console.warn("[LvGlean] 微信公众号回填写入失败:", docId, error);
            return null;
        }
    }

    return null;
}

/**
 * 批量自动识别微信公众号作者（强需求，无需用户同意，后台全自动批处理）
 *
 * 每批并发 4-6 篇，避免瞬间占满内核导出连接；
 * 进度实时回调，自动跳过已有作者或非微信文章。
 */
export async function batchRecognizeWechatAuthors(
    plugin: Plugin,
    entries: Array<{ id: string; url?: string; site?: string; author?: string }>,
    onProgress?: (processed: number, total: number, detectedCount: number) => void,
): Promise<{ processed: number; detectedCount: number; updatedIds: string[] }> {
    // 仅筛选微信文章且作者为空的待处理目标
    const targets = entries.filter((entry) => {
        const isWechat = isWechatUrl(entry.url) || isWechatUrl(entry.site);
        return isWechat && (!entry.author || !entry.author.trim());
    });

    const total = targets.length;
    if (total === 0) return { processed: 0, detectedCount: 0, updatedIds: [] };

    let processed = 0;
    let detectedCount = 0;
    const updatedIds: string[] = [];
    const batchSize = 5;

    for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        await Promise.all(
            batch.map(async (target) => {
                try {
                    const detected = await scanAndFillWechatAuthor(plugin, target.id, {
                        url: target.url,
                        site: target.site,
                    });
                    if (detected) {
                        detectedCount += 1;
                        updatedIds.push(target.id);
                    }
                } catch {
                    // 单篇失败不阻断整体批量
                } finally {
                    processed += 1;
                    onProgress?.(processed, total, detectedCount);
                }
            })
        );
    }

    return { processed, detectedCount, updatedIds };
}

export interface PurifyWechatResult {
    ok: boolean;
    modified: boolean;
    words?: number;
    minutes?: number;
    author?: string;
    summary?: string;
    series?: string;
}

/**
 * 微信公众号文章深度提纯与字数时长校准
 * 串联执行：图片懒加载还原、CSS背景插图抢救、LaTeX公式逆向、代码块提纯、
 * 语音组件转引述、SVG长图与动画容器提纯、名片卡片转换、模板噪点清除。
 */
export async function purifyWechatArticle(
    plugin: Plugin,
    docId: string,
): Promise<PurifyWechatResult> {
    if (!/^\d{14}-[0-9a-z]{7}$/.test(docId)) return { ok: false, modified: false };

    try {
        const clip = await readClip(docId);
        const isWechat = isWechatUrl(clip.url) || isWechatUrl(clip.site);
        if (!isWechat) return { ok: false, modified: false };

        const exported = await exportMdContent(docId, { yfm: false, addTitle: false, refMode: 2 });
        const rawContent = exported?.content || "";
        if (!rawContent.trim()) return { ok: false, modified: false };

        // 深度提纯正文与清洗噪点
        const repaired = repairWechatContent(rawContent);
        const cleaned = cleanWechatNoise(repaired);
        const modified = cleaned !== rawContent;

        // 提取元数据补丁
        const snippet = cleaned.slice(0, 3500);
        const detectedAuthor = extractWechatAuthor(snippet);
        const detectedDesc = extractWechatDescription(snippet);
        const detectedSeries = extractWechatSeries(snippet);

        const patch: Record<string, unknown> = {};

        if (detectedAuthor && (!clip.author || !clip.author.trim())) {
            patch.author = detectedAuthor;
        }
        if (detectedDesc && (!clip.summary || !clip.summary.trim())) {
            patch.summary = detectedDesc;
        }
        if (detectedSeries && !(clip.aiTags || []).includes(detectedSeries)) {
            patch.aiTags = [...(clip.aiTags || []), detectedSeries];
        }

        // 重新核算纯净字数与预估时间（使用标准领域函数）
        const words = countWords(cleaned);
        const minutes = estimateMinutes(words);
        patch.words = words;
        patch.minutes = minutes;

        await writeClip(plugin, docId, patch, { force: true });

        return {
            ok: true,
            modified,
            words,
            minutes,
            author: (patch.author as string) || clip.author,
            summary: (patch.summary as string) || clip.summary,
            series: detectedSeries || undefined,
        };
    } catch (error) {
        console.warn("[glean] 微信文章深度提纯失败:", docId, error);
        return { ok: false, modified: false };
    }
}
