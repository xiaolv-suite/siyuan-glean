/**
 * Ghostreader 行内伴读 AI 追问与通俗化领域模型
 * 
 * 对标 Readwise Reader Ghostreader 核心能力：
 * 1. ✨ 用人话解释：消除专业术语阻碍，结合生动比喻通俗化解析
 * 2. 🔍 提炼核心论据：深度剖析段落立论、论据与逻辑链条
 * 3. ⚡ 批判性思考：揭示潜在假设、逻辑漏洞与对立反例
 * 4. 💬 自由追问：针对选中文本与上下文展开深度问答
 */

export type GhostreaderAction = "explain" | "arguments" | "critique" | "custom";

export interface GhostreaderActionMeta {
    id: GhostreaderAction;
    label: string;
    icon: string;
    description: string;
}

export const GHOSTREADER_ACTIONS: readonly GhostreaderActionMeta[] = [
    {
        id: "explain",
        label: "用人话解释",
        icon: "✨",
        description: "用通俗生动的比喻深入浅出解释高深术语与复杂概念",
    },
    {
        id: "arguments",
        label: "提炼核心论据",
        icon: "🔍",
        description: "剖析段落立论点、关键证据支撑与逻辑推理链条",
    },
    {
        id: "critique",
        label: "批判性思考",
        icon: "⚡",
        description: "审视背后隐含预设、逻辑漏洞与潜在对立反例",
    },
    {
        id: "custom",
        label: "自由追问",
        icon: "💬",
        description: "针对所选段落自由提出任何思考与延展问题",
    },
] as const;

export interface GhostreaderResult {
    action: GhostreaderAction;
    actionLabel: string;
    sourceText: string;
    sourceBlockId?: string;
    answer: string;
    timestamp: string;
    status: "streaming" | "ready" | "failed";
    error?: string;
}

/**
 * 构造 Ghostreader 结构化提示词
 */
export function buildGhostreaderPrompt(
    action: GhostreaderAction,
    sourceText: string,
    articleTitle?: string,
    customQuery?: string
): { systemPrompt: string; prompt: string } {
    const cleanText = (sourceText || "").trim();
    const titleContext = articleTitle ? `当前正在阅读文章：《${articleTitle.trim()}》\n` : "";

    let systemPrompt = "你是一位博学且通俗的顶级阅读导师（Ghostreader），专为深度阅读者提供行内伴读启发。";
    let prompt = "";

    switch (action) {
        case "explain":
            systemPrompt += " 你的任务是将所给专业术语或复杂逻辑用最接地气、通俗易懂的语言深入浅出解释，必须包含1个生动贴切的生活化比喻，帮助读者毫无认知阻碍地瞬间理解。避免枯燥说教。";
            prompt = `${titleContext}请用最通俗易懂的人话与生活比喻，解释以下选中文本：\n\n【选中文本】：\n${cleanText}`;
            break;

        case "arguments":
            systemPrompt += " 你的任务是严谨剖析文本的逻辑框架。请条理分明地提炼出：1. 作者的核心立论点；2. 关键支撑论据与事实链条；3. 逻辑推理方式。回答需简明扼要、直击骨架。";
            prompt = `${titleContext}请深度剖析以下选中文本的立论与论据支撑：\n\n【选中文本】：\n${cleanText}`;
            break;

        case "critique":
            systemPrompt += " 你的任务是扮演思维敏锐的批判性审辨导师。请尖锐而理性地指出：1. 该观点背后的隐含预设（Implicit Assumptions）；2. 可能存在的幸存者偏差、以偏概全或逻辑跳跃；3. 现实中有哪些潜在的反例或对立视角。";
            prompt = `${titleContext}请对以下选中文本展开批判性质疑与反思：\n\n【选中文本】：\n${cleanText}`;
            break;

        case "custom":
            systemPrompt += " 用户在阅读时划选了以下文本并提出追问，请针对该选中文本做出深入、准确、有启发性的回答。";
            const q = (customQuery || "").trim() || "请深入剖析这段内容的核心精髓";
            prompt = `${titleContext}【选中文本】：\n${cleanText}\n\n【读者追问】：\n${q}`;
            break;
    }

    return { systemPrompt, prompt };
}

/**
 * 将 Ghostreader 生成结果格式化为思源原生 Callout 块 Markdown，
 * 附带原文双链与徽标，便于一键插回思源笔记沉淀为知识资产。
 */
export function formatGhostreaderCalloutMarkdown(
    result: GhostreaderResult,
    _docTitle?: string
): string {
    const actionMeta = GHOSTREADER_ACTIONS.find((a) => a.id === result.action) || GHOSTREADER_ACTIONS[0];
    const sourceQuote = result.sourceText.split(/\r?\n/).map((l) => `> 📌 ${l}`).join("\n");
    const backlink = result.sourceBlockId && /^\d{14}-[0-9a-z]{7}$/.test(result.sourceBlockId)
        ? `\n> (( ${result.sourceBlockId} '📍 定位文章原句' ))`
        : "";

    const lines = [
        `> [!NOTE] 🤖 Ghostreader 伴读 · ${actionMeta.label}`,
        sourceQuote,
        backlink ? backlink.trim() : "",
        "> ---",
        ...result.answer.split(/\r?\n/).map((l) => `> ${l}`),
    ].filter(Boolean);

    return lines.join("\n") + "\n";
}
