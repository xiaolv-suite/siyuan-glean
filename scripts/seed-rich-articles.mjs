/**
 * 小驴拾遗 · 为独立实机靶场注入多篇知名微信公众号精读文章
 * 覆盖全部 5 态（inbox/later/reading/done/archived）、7 个知名公众号、
 * 4 色高亮金句、个人思考 Memo 气泡、顶部导读档案卡与 Daily Note 日记联动。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMetaCalloutMarkdown } from "../src/domain/meta-callout.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ARTICLES = [
    {
        title: "大模型长上下文与高效注意力机制演进：从 FlashAttention 到 RingAttention",
        url: "https://mp.weixin.qq.com/s/ai-long-context-mechanisms-2026",
        author: "机器之心",
        status: "reading",
        priority: 1,
        rating: 5,
        words: 4800,
        minutes: 12,
        readMinutes: 8,
        tags: ["AI", "大模型", "架构"],
        aiTags: ["注意力机制", "显存优化", "KV-Cache"],
        summary: "深度复盘了大模型长上下文处理的技术瓶颈，重点解析了分块计算显存优化、稀疏注意力以及分布式上下文环形通信的工程落地范式。",
        quotes: [
            {
                text: "注意力机制的最大瓶颈从来不是算力上限，而是显存带宽与二次方序列复杂度的双重夹击。",
                color: "red",
                annotationTag: "pinned",
            },
            {
                text: "真正的工程优雅在于将显存换入换出重叠在算子流水线中，避免 GPU 闲置等待。",
                memo: "这一点和操作系统的虚拟内存换页机制如出一辙，计算机底层哲学的共通性再次体现！",
                color: "green",
                isSiyuanComment: true,
                annotationTag: "important",
            },
        ],
        body: `在过去两年中，大语言模型的上下文窗口从最初的 4K、8K 飙升到了 1M 甚至更高。然而，上下文窗口的数字狂飙并不意味着模型能够毫无代价地处理无限长文本。

### 第一节：二次方复杂度的幽灵
标准 Self-Attention 计算需要维护完整的 $N \\times N$ 注意力得分矩阵。当输入序列长度 $N$ 达到数万甚至数十万时，显存消耗呈指数级爆炸。即使是最新一代的 GPU，也难以承受海量上下文带来的物理显存压力。

> 注意力机制的最大瓶颈从来不是算力上限，而是显存带宽与二次方序列复杂度的双重夹击。

### 第二节：IO 瓶颈与分块平铺
FlashAttention 敏锐地洞察到：计算慢的根源在于 SRAM 与 HBM 之间繁复的数据来回搬运。通过在线归一化与分块平铺（Tiling），我们在局部高速片上显存内完成 Softmax 增量更新，大幅降低了对慢速主显存的访问频率。

> 真正的工程优雅在于将显存换入换出重叠在算子流水线中，避免 GPU 闲置等待。
`,
    },
    {
        title: "对话硅谷硬科技投资人：AI 终局竞争不是模型参数，而是产业重构的飞轮",
        url: "https://mp.weixin.qq.com/s/latepost-silicon-valley-ai-interview",
        author: "晚点LatePost",
        status: "later",
        priority: 2,
        rating: 0,
        words: 6200,
        minutes: 15,
        readMinutes: 0,
        tags: ["商业", "创投", "专访"],
        aiTags: ["产业重构", "商业模式", "硅谷趋势"],
        summary: "详尽记录了对三位硅谷一线硬科技投资人的闭门访谈，揭示了大模型应用层创业从概念炒作走向产业工作流落地的深层逻辑。",
        quotes: [
            {
                text: "商业世界里最残酷的现实是：技术突破往往由先驱完成，而商业收益往往由整合者收割。",
                memo: "重看微软 Office 与 Copilot 的结合，渠道和工作流嵌入才是深壁高垒。",
                color: "yellow",
            },
        ],
        body: `过去一年，我们见证了百模大战的喧嚣，也目睹了应用层创业者在基模型快速演进之下的集体焦虑。为此，我们与三位在硅谷深耕硬科技的资深合伙人进行了一场深入交流。

### 第一节：基模型调用不是护城河
单纯套壳的大模型产品正以令人震惊的速度死亡。原因很简单：当下一代基础模型发布时，所有建立在上一代模型缺陷上的工程胶水代码都会瞬间变得毫无价值。

> 商业世界里最残酷的现实是：技术突破往往由先驱完成，而商业收益往往由整合者收割。

### 第二节：产业重构的四步飞轮
真正能够存活的企业，无一例外都在构建自己的专属数据与工作流闭环。从高频痛点切入，接管核心决策节点，让客户的业务逻辑牢牢生长在系统内部。
`,
    },
    {
        title: "降本增效的终极奥义：为什么很多系统重构最后都成了打补丁",
        url: "https://mp.weixin.qq.com/s/banfo-system-refactor-truth",
        author: "半佛仙人",
        status: "inbox",
        priority: 3,
        rating: 0,
        words: 3600,
        minutes: 9,
        readMinutes: 0,
        tags: ["职场", "思考", "幽默"],
        aiTags: ["系统重构", "组织博弈", "技术债"],
        summary: "以诙谐辛辣的语言揭示了技术债务累积背后的组织沟通成本，分析了彻底重写为何经常沦为另一座屎山。",
        quotes: [
            {
                text: "能跑的代码千万别乱动，这不是技术原则，这是祖传生存智慧。",
                color: "yellow",
            },
        ],
        body: `很多年轻工程师一进公司，看着祖传代码库就皱眉头：这写的都是啥玩意儿，命名混乱、函数嵌套八层、没有任何单元测试。我要给它全部重写一遍！

### 第一节：重写的陷阱
年轻人，你看到的那些乱七八糟的特判和丑陋的分支，每一条背后都躺着一个当年的紧急故障或者特定业务方的特殊妥协。

> 能跑的代码千万别乱动，这不是技术原则，这是祖传生存智慧。

### 第二节：技术债与管理熵增
系统重写到最后，往往就是把老系统的已知 Bug，变成了新系统的未知 Bug。
`,
    },
    {
        title: "重塑工作流：如何用卡片笔记与双向链接构建长青知识库",
        url: "https://mp.weixin.qq.com/s/sspai-evergreen-notes-workflow",
        author: "少数派",
        status: "done",
        priority: 1,
        rating: 5,
        words: 4200,
        minutes: 10,
        readMinutes: 14,
        tags: ["知识管理", "效率", "写作"],
        aiTags: ["卡片笔记", "卢曼方法", "渐进总结"],
        summary: "系统梳理了卡片笔记写作法的核心精髓，指导读者如何摆脱死记硬背的笔记本，建立生生不息的概念连接网络。",
        quotes: [
            {
                text: "笔记的目的从来不是记录别人的思考，而是成为自己未来创作的灵感跳板。",
                memo: "知识内化的关键在于“用自己的话重述”，这也是为什么拾遗要强调用块引用和批注反向连接。",
                color: "blue",
            },
        ],
        body: `我们买了很多书，剪藏了无数篇文章，但遇到实际问题时依然脑中空空。收藏并不等于掌握，记录也并非等于思考。

### 第一节：卢曼卡片笔记的本质
卢曼一生写了超过 70 本专著和数百篇学术论文，他的秘密并不是超人的记忆力，而是他的 Zettelkasten 盒子。每一张卡片都是一个独立的原子概念，卡片与卡片之间通过编号建立网状连接。

> 笔记的目的从来不是记录别人的思考，而是成为自己未来创作的灵感跳板。

### 第二节：在思源笔记中践行渐进总结
从原文高亮，到提炼要旨，再到建立原生双向块引用。让每一篇读过的长文都成为自己第二大脑中的一个节点，随着时间沉淀而复利生长。
`,
    },
    {
        title: "我们为什么失去了漫长的阅读？数字时代的专注力困境",
        url: "https://mp.weixin.qq.com/s/lifeweek-reading-focus-dilemma",
        author: "三联生活周刊",
        status: "later",
        priority: 2,
        rating: 0,
        words: 5400,
        minutes: 13,
        readMinutes: 0,
        tags: ["文化", "深度阅读", "心理"],
        aiTags: ["深度阅读", "专注力", "认知碎片化"],
        summary: "从心理学、神经科学与社会学多维度探讨了数字媒介对人类长程阅读能力的重塑，反思快餐式信息消费的心理代偿。",
        quotes: [
            {
                text: "真正的阅读是一种与作者灵魂的深层对峙，它需要沉浸的时空与允许困惑的耐心。",
                color: "yellow",
            },
        ],
        body: `很多人都会感叹：上一次完整读完一本大部头书，或者一字不漏读完一篇万字特稿，是在什么时候了？

### 第一节：多巴胺循环与滚动信息流
短视频与信息流算法的设计目标，就是不断提供未知的即时奖赏。我们的大脑在短刺激中被反复训练，逐渐对长篇论述中必需的铺垫和论证失去了耐受度。

> 真正的阅读是一种与作者灵魂的深层对峙，它需要沉浸的时空与允许困惑的耐心。

### 第二节：重建心智的避难所
我们需要主动建立仪式感，远离算法投喂，把注意力重新夺回自己手中。
`,
    },
    {
        title: "从零设计高可靠分布式任务调度器：时间轮、分片与幂等执行",
        url: "https://mp.weixin.qq.com/s/infoq-distributed-scheduler-architecture",
        author: "InfoQ",
        status: "archived",
        priority: 3,
        rating: 4,
        words: 7100,
        minutes: 18,
        readMinutes: 16,
        tags: ["架构", "后端", "分布式"],
        aiTags: ["任务调度", "分布式事务", "高可用"],
        summary: "全面讲解了工业级分布式调度器在海量并发定时场景下的核心架构选型、时钟漂移应对以及故障转移方案。",
        quotes: [
            {
                text: "分布式系统没有银弹，所有的设计都是在一致性、可用性与分区容错之间的权衡艺术。",
                color: "blue",
            },
        ],
        body: `在现代微服务体系中，定时对账、异步重试、订单超时取消都依赖高可靠的定时任务调度组件。

### 第一节：时间轮与分层调度
对于海量秒级或毫秒级定时任务，传统的最小堆或者数据库轮询方案面临巨大的锁争用和扫描性能瓶颈。分层时间轮（TimingWheel）通过类似钟表时分秒的圆环结构，将添加和触发操作的时间复杂度降低至 O(1)。

> 分布式系统没有银弹，所有的设计都是在一致性、可用性与分区容错之间的权衡艺术。
`,
    },
    {
        title: "商业进化的底层逻辑：所有生意的本质，都是对交易成本的缩减",
        url: "https://mp.weixin.qq.com/s/liurun-business-logic-transaction-costs",
        author: "刘润",
        status: "reading",
        priority: 2,
        rating: 4,
        words: 3100,
        minutes: 8,
        readMinutes: 5,
        tags: ["商业", "认知", "思维模型"],
        aiTags: ["交易成本", "商业常识", "价值链"],
        summary: "从科斯的交易成本理论出发，深入剖析了电商、外卖、去中心化服务等商业模式更迭的核心驱动力。",
        quotes: [
            {
                text: "当你看不懂一个新商业模式时，先问问它到底帮谁省了时间、降低了什么信息差。",
                memo: "极简洞察，所有的颠覆最终都要回归到效率的本质提升。",
                color: "green",
            },
        ],
        body: `为什么有公司？为什么有市场？诺贝尔经济学奖得主罗纳德·科斯在几十年前给出了一个极其深刻的答案：交易成本。

### 第一节：什么是交易成本？
搜寻成本、比较成本、测试成本、协商成本、付款成本、售后成本……买卖双方为了达成一次交易，所付出的一切额外代价，都是交易成本。

> 当你看不懂一个新商业模式时，先问问它到底帮谁省了时间、降低了什么信息差。

### 第二节：每一次商业重构，都是刀刃向内
谁能用新技术把链条上的某一项交易成本削减一半，谁就能重构整个产业链的利润分配格局。
`,
    },
];

export async function seedRichArticles({ base, token, notebookId: targetNbId, workspaceDir, verbose = true }) {
    async function api(route, body = {}) {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            try {
                const res = await fetch(`${base}${route}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Token ${token}`,
                    },
                    body: JSON.stringify(body),
                });
                const json = await res.json();
                if (json.code !== 0) {
                    if (attempt < 3 && String(json.msg || "").includes("Access is denied")) {
                        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
                        continue;
                    }
                    throw new Error(`${route} 失败: code=${json.code} msg=${json.msg}`);
                }
                return json.data;
            } catch (err) {
                if (attempt < 3 && String(err.message || "").includes("Access is denied")) {
                    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
                    continue;
                }
                throw err;
            }
        }
    }

    let notebookId = targetNbId;
    if (!notebookId) {
        const ls = await api("/api/notebook/lsNotebooks");
        notebookId = ls?.notebooks?.[0]?.id;
        if (!notebookId) {
            const createNb = await api("/api/notebook/createNotebook", { name: "📖 拾遗测试工坊" });
            notebookId = createNb?.notebook?.id;
        }
    }
    if (verbose) console.log(`[seed] 目标笔记本: ${notebookId}`);

    const clipsIndex = {};

    for (const art of ARTICLES) {
        if (verbose) console.log(`[seed] 正在创建文章: 《${art.title}》 (${art.author} / ${art.status})...`);
        const targetPath = `/${art.title.replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 80)}`;
        
        let docId = "";
        try {
            const docRes = await api("/api/filetree/createDocWithMd", {
                notebook: notebookId,
                path: targetPath,
                markdown: `# ${art.title}\n\n${art.body}`,
            });
            docId = docRes;
        } catch (e) {
            if (verbose) console.debug(`[seed] 创建文档降级重试:`, e.message);
        }

        if (!docId) continue;

        // 写入 custom-clip-* 属性
        const attrs = {
            "custom-clip-status": art.status,
            "custom-clip-url": art.url,
            "custom-clip-site": "mp.weixin.qq.com",
            "custom-clip-author": art.author,
            "custom-clip-priority": String(art.priority),
            "custom-clip-rating": String(art.rating),
            "custom-clip-words": String(art.words),
            "custom-clip-minutes": String(art.minutes),
            "custom-clip-read-minutes": String(art.readMinutes),
            "custom-clip-summary": art.summary,
            "custom-clip-ai-tags": art.aiTags.join(","),
            "custom-clip-content-type": "fulltext",
            "custom-clip-time": "20261031120000",
            ...(art.status === "done" ? { "custom-clip-done-time": "20261031160000" } : {}),
        };
        await api("/api/attr/setBlockAttrs", { id: docId, attrs });

        // 使用纯函数层 buildMetaCalloutMarkdown 构建标准导读档案卡
        const calloutMd = buildMetaCalloutMarkdown({
            id: docId,
            title: art.title,
            url: art.url,
            site: "mp.weixin.qq.com",
            author: art.author,
            status: art.status,
            priority: art.priority,
            rating: art.rating,
            words: art.words,
            minutes: art.minutes,
            readMinutes: art.readMinutes,
            tags: art.tags,
            aiTags: art.aiTags,
            summary: art.summary,
        });

        await api("/api/block/prependBlock", {
            dataType: "markdown",
            parentID: docId,
            data: calloutMd,
        });

        // 查找正文中的引述块并设置颜色标记 / 批注（带内核 SQLite 索引异步轮询守门）
        try {
            let qBlocks = [];
            for (let attempt = 0; attempt < 25; attempt += 1) {
                qBlocks = await api("/api/query/sql", {
                    stmt: `SELECT id, content FROM blocks WHERE root_id = '${docId}' AND type = 'b' AND ial NOT LIKE '%meta-callout%'`,
                });
                if (Array.isArray(qBlocks) && qBlocks.length >= art.quotes.length) break;
                await new Promise((r) => setTimeout(r, 150));
            }
            if (Array.isArray(qBlocks)) {
                for (let i = 0; i < Math.min(qBlocks.length, art.quotes.length); i += 1) {
                    const blockId = qBlocks[i].id;
                    const qData = art.quotes[i];
                    const patch = {
                        "custom-clip-highlight": "true",
                        "custom-clip-hl-color": qData.color || "yellow",
                    };
                    if (qData.memo) {
                        patch["memo"] = qData.memo;
                    }
                    if (qData.annotationTag) {
                        patch["custom-comment-tag"] = qData.annotationTag;
                    }
                    if (qData.isSiyuanComment) {
                        patch["custom-siyuan-comment"] = "true";
                        patch["custom-comment-text"] = qData.text;
                        patch["custom-comment-source"] = qBlocks[0]?.id || blockId;
                        patch["custom-comment-tag"] = qData.annotationTag || "important";
                        patch["custom-comment-highlight-custom-color"] = qData.color || "green";
                    }
                    await api("/api/attr/setBlockAttrs", { id: blockId, attrs: patch });
                }
            }
        } catch (e) {
            if (verbose) console.debug("[seed] 设置引述块属性降级:", e.message);
        }

        // 收集至索引
        clipsIndex[docId] = {
            id: docId,
            title: art.title,
            hpath: targetPath,
            box: notebookId,
            status: art.status,
            url: art.url,
            site: "mp.weixin.qq.com",
            author: art.author,
            time: "20261031120000",
            words: art.words,
            minutes: art.minutes,
            priority: art.priority,
            rating: art.rating,
            summary: art.summary,
            contentType: "fulltext",
            timeSource: "document",
            updated: "20261031120000",
            tags: art.tags,
            aiTags: art.aiTags,
            ...(art.status === "done" ? { doneTime: "20261031160000" } : {}),
        };
    }

    if (workspaceDir) {
        const petalStorage = path.join(workspaceDir, "data", "storage", "petal", "siyuan-glean");
        fs.mkdirSync(petalStorage, { recursive: true });
        
        const settingsPath = path.join(petalStorage, "settings.json");
        let settings = {};
        try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch {}
        settings.anchorNotebooks = [notebookId];
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        const indexPath = path.join(petalStorage, "glean-index.json");
        let indexData = { version: 1, updatedAt: new Date().toISOString(), clips: {}, candidates: {} };
        try { indexData = JSON.parse(fs.readFileSync(indexPath, "utf8")); } catch {}
        indexData.clips = { ...indexData.clips, ...clipsIndex };
        fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
    }

    return { clipsIndex, notebookId };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const WORKSPACE = "D:\\SiYuan-Glean-Stage";
    const SESSION_FILE = path.join(WORKSPACE, "stage-session.json");
    if (!fs.existsSync(SESSION_FILE)) {
        console.error("[seed] 未找到靶场会话文件:", SESSION_FILE);
        process.exit(1);
    }
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    const { base, token } = session;
    console.log(`[seed] 连接独立靶场: ${base}`);
    seedRichArticles({ base, token, workspaceDir: WORKSPACE, verbose: true }).then(() => {
        console.log(`\n======================================================`);
        console.log(`🎉 成功为独立靶场注入 ${ARTICLES.length} 篇精读微信公众号文章！`);
        console.log(`======================================================`);
        console.log(`👉 请在浏览器中直接按 F5 刷新网页即可体验：`);
        console.log(`   ${session.appUrl}`);
        console.log(`======================================================\n`);
    }).catch((err) => {
        console.error("[seed] 注入文章失败:", err);
        process.exit(1);
    });
}
