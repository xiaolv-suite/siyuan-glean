import type { Plugin } from "siyuan";
import { createDocWithMd, querySql } from "../api/client.ts";
import { writeClip } from "./clip-store.ts";
import { syncMetaCalloutToDocument } from "./meta-callout-service.ts";

export interface StarterArticlesResult {
    ok: boolean;
    createdCount: number;
    docIds: string[];
    skipped?: boolean;
}

/**
 * 为刚完成新手引导的笔记本自动生成示范精读文章
 * 包含完整的导读档案卡、五态状态、金句引述与原生反链结构
 * 幂等防重：若笔记本内已有同名文章或已有剪藏文章，则优雅跳过
 */
export async function createStarterArticles(
    plugin: Plugin,
    notebookId: string,
): Promise<StarterArticlesResult> {
    if (!notebookId || !notebookId.trim()) {
        return { ok: false, createdCount: 0, docIds: [] };
    }

    try {
        // 检查笔记本是否已有文章
        const existing = await querySql<{ id: string }>(
            `SELECT id FROM blocks WHERE box = '${notebookId.replace(/'/g, "''")}' AND (content LIKE '%快速入门指南%' OR ial LIKE '%custom-clip-%') LIMIT 1`
        );
        if (existing && existing.length > 0) {
            return { ok: true, createdCount: 0, docIds: [], skipped: true };
        }

        const docIds: string[] = [];

        // 篇目 1：新手快速入门指南
        const guideTitle = "小驴拾遗 · 新手快速入门指南";
        const guideMd = `# ${guideTitle}

> 🌐 来源：[https://github.com/frostime/siyuan-glean](https://github.com/frostime/siyuan-glean)
> ✍️ 作者：小驴团队

欢迎使用**小驴拾遗**！这是一个专为思源笔记打造的深度阅读、长文剪藏与知识内化流转系统。

---

### 🌟 核心理念：四步闭环

- 📥 **第一步：收录入库**
  使用思源官方浏览器剪藏插件或点击文档右键菜单「加入读库」，文章自动进入待读队列。
- 📖 **第二步：沉浸阅读**
  点击「开始阅读」，享受 5 阶语义折叠（按数字键 \`1\`~\`5\` 自由缩放粒度）与高精度视口断点续读。
- 💡 **第三步：划词摘录与思考**
  选中正文段落，点击「摘录」或「批注」，直接在段落下插入原生引述块或写下个人思考。
- 🔗 **第四步：原生知识回流**
  所有导出的读书笔记、闪卡、长文切片与每日日记，均通过思源原生 \`((块引用))\` 反链网络双向贯通！

---

### ⌨️ 常用极速快捷键

- \`J\` / \`K\`：上下移动光标文章
- \`E\`：一键标记已读并归档 (Inbox Zero)
- \`L\` 或 \`A\`：快速移入稍后读队列
- \`?\`：展开/折叠完整 22 键快捷键全景图

> 💡 知识不是收藏夹里堆砌的灰尘，而是经过思考沉淀、融入自身体系的复利资产。
`;

        const doc1Id = await createDocWithMd(notebookId, `/${guideTitle}`, guideMd);
        if (doc1Id) {
            docIds.push(doc1Id);
            await writeClip(
                plugin,
                doc1Id,
                {
                    status: "reading",
                    author: "小驴团队",
                    site: "github.com",
                    url: "https://github.com/frostime/siyuan-glean",
                    priority: 5,
                    rating: 5,
                    words: 1600,
                    minutes: 4,
                    summary: "欢迎使用小驴拾遗！这份指南帮助你快速掌握长文剪藏、沉浸阅读、5阶语义折叠与双向反链内化的完整工作流。",
                    contentType: "fulltext",
                    src: "manual",
                },
                { force: true, forceStatus: true }
            );
            await syncMetaCalloutToDocument(plugin, doc1Id);
        }

        // 篇目 2：深度工作心流示范长文
        const sampleTitle = "深度工作：如何在碎片化时代建立心流";
        const sampleMd = `# ${sampleTitle}

> 🌐 来源：[https://example.com/deep-work](https://example.com/deep-work)
> ✍️ 作者：卡尔·纽波特

在信息高度碎片化的今天，深度工作的能力正变得像工业革命时代的流水线一样稀缺。

---

### 为什么我们需要深度工作？
当你从一项任务快速切换到另一项任务时，你的注意力并不会瞬间完整转移。总有一部分认知带宽滞留在上一项工作中，这就是注意力残留。

> 💡 碎片化沟通不仅分散了我们的时间，更破坏了大脑深层整合复杂知识的神经连接。

### 如何建立专注仪式？
真正的专注并不依靠脆弱的意志力，而是依靠结构化的仪式：
1. **固定时段**：每天预留不受打扰的高能时段；
2. **物理隔离**：关闭不必要的即时通信窗口；
3. **知识回流**：每读完一篇长文，用一两句话记录核心顿悟并沉淀为反向链接。
`;

        const doc2Id = await createDocWithMd(notebookId, `/${sampleTitle}`, sampleMd);
        if (doc2Id) {
            docIds.push(doc2Id);
            await writeClip(
                plugin,
                doc2Id,
                {
                    status: "later",
                    author: "卡尔·纽波特",
                    site: "example.com",
                    url: "https://example.com/deep-work",
                    priority: 4,
                    words: 2400,
                    minutes: 6,
                    summary: "阐述注意力残留对深度脑力工作的破坏机制，并介绍建立仪式化专注的具体法则。",
                    contentType: "fulltext",
                    src: "manual",
                },
                { force: true, forceStatus: true }
            );
            await syncMetaCalloutToDocument(plugin, doc2Id);
        }

        return { ok: true, createdCount: docIds.length, docIds };
    } catch (e) {
        console.warn("[glean] 创建示范文章异常:", e);
        return { ok: false, createdCount: 0, docIds: [] };
    }
}
