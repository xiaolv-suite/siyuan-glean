import type { Plugin } from "siyuan";
import { createDocWithMd } from "../api/client.ts";
import { formatSliceMarkdown, buildOutlineMindmapMarkdown, type DocSlicePlan } from "../domain/doc-slicing.ts";
import type { OutlineItem } from "../domain/outline.ts";
import { writeClip, type ReadingClipContext } from "./clip-store.ts";
import { loadIndex } from "./index-store.ts";
import { withDocLock } from "../libs/notice.ts";

export interface CreateSliceDocsResult {
    ok: boolean;
    createdCount: number;
    failedCount: number;
    createdDocIds: string[];
    errors: string[];
}

/**
 * 将长文渐进切片方案在思源中物化为子文档（实体切片）
 * 遵循 Issue #17 统领指令第 4 条与 D-0001 数据主权铁律。
 */
export async function createSliceSubDocuments(
    plugin: Plugin,
    context: ReadingClipContext,
    plan: DocSlicePlan,
): Promise<CreateSliceDocsResult> {
    return withDocLock(context.id, async () => {
        let box = context.location?.box;
        let parentHpath = context.location?.hpath;
        if ((!box || !parentHpath) && context.id && typeof plugin?.loadData === "function") {
            try {
                const idx = await loadIndex(plugin);
                const clip = idx.clips[context.id];
                if (clip) {
                    box = box || clip.box;
                    parentHpath = parentHpath || clip.hpath;
                }
            } catch {}
        }
        if (!box || !parentHpath) {
            return {
                ok: false,
                createdCount: 0,
                failedCount: plan.slices.length,
                createdDocIds: [],
                errors: ["无法获取原文档所在的笔记本或存储路径"],
            };
        }

        const createdDocIds: string[] = [];
        const errors: string[] = [];

        for (const slice of plan.slices) {
            // 清理标题中的特殊字符避免路径冲突
            const safeSliceTitle = slice.title.replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 100);
            const targetPath = `${parentHpath}/${safeSliceTitle}`;
            const markdown = formatSliceMarkdown(slice, context.title, context.id, context.url);

            try {
                const docId = await createDocWithMd(box, targetPath, markdown);
                if (!/^\d{14}-[0-9a-z]{7}$/.test(docId)) {
                    throw new Error("创建切片子文档返回的 ID 非法");
                }

                // 继承长文来源与作者信息，进入稍后读队列
                const sliceAiTags = ["渐进切片"];
                if (context.title) {
                    sliceAiTags.push(context.title.slice(0, 30));
                }

                await writeClip(
                    plugin,
                    docId,
                    {
                        status: "later",
                        author: context.author,
                        site: context.site,
                        url: context.url,
                        contentType: "fulltext",
                        words: slice.estimatedWords,
                        minutes: slice.estimatedMinutes,
                        aiTags: sliceAiTags,
                        src: "manual",
                    },
                    { forceStatus: true }
                );

                createdDocIds.push(docId);
            } catch (error) {
                console.warn("[glean] 创建切片子文档失败:", slice.title, error);
                errors.push(`${slice.title}: ${error instanceof Error ? error.message : "创建失败"}`);
            }
        }

        return {
            ok: createdDocIds.length > 0,
            createdCount: createdDocIds.length,
            failedCount: errors.length,
            createdDocIds,
            errors,
        };
    });
}

/**
 * 为文章创建思源原生思维导图文档（挂载 custom-sy-list-mindmap）
 */
export async function createOutlineMindmapDocument(
    plugin: Plugin,
    context: ReadingClipContext,
    outline: readonly OutlineItem[],
): Promise<{ ok: boolean; docId?: string; error?: string }> {
    return withDocLock(context.id, async () => {
        const box = context.location?.box;
        const parentHpath = context.location?.hpath;
        if (!box || !parentHpath) {
            return { ok: false, error: "无法获取原文档所在的笔记本或存储路径" };
        }

        const title = (context.title || "未命名长文").replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 80);
        const targetPath = `${parentHpath}/《${title}》· 思维导图`;
        const markdown = buildOutlineMindmapMarkdown(context.title, context.id, outline);

        try {
            const docId = await createDocWithMd(box, targetPath, markdown);
            if (!/^\d{14}-[0-9a-z]{7}$/.test(docId)) {
                throw new Error("创建脑图文档返回的 ID 非法");
            }
            await writeClip(plugin, docId, {
                internal: true,
                aiTags: ["思维导图", "大纲脑图"],
                summary: `从长文《${context.title}》提取的原生思维导图`,
            }, { force: true });
            return { ok: true, docId };
        } catch (error) {
            console.warn("[glean] 创建脑图文档失败:", error);
            return { ok: false, error: String(error) };
        }
    });
}
