import type { Plugin } from "siyuan";
import { createDocWithMd } from "../api/client.ts";
import { formatSliceMarkdown, type DocSlicePlan } from "../domain/doc-slicing.ts";
import { writeClip, type ReadingClipContext } from "./clip-store.ts";

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
    const box = context.location?.box;
    const parentHpath = context.location?.hpath;
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
}
