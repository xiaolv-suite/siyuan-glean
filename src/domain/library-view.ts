/**
 * 读库时间线的筛选、排序和分面纯函数（S3 / T-1715）。
 *
 * Dock、工作台和看板都把索引映射成这里的轻量条目，再调用同一个函数。
 * 该层不读写属性，也不依赖 Svelte、思源 API 或服务层；筛选只是视图投影，
 * 不会改变文章状态。
 */
import type { ClipContentType, ClipSource, ClipStatus, ClipTimeSource } from "./schema.ts";
import { applySessionOrder } from "./session-order.ts";
import { isWechatUrl } from "./wechat.ts";

export type LibraryItemKind = "clip" | "candidate";
/** "session"（T-1903，D-0034）：按 ui-prefs 的会话顺序展示；direction 不适用（忽略）。 */
export type LibrarySortKey = "time" | "updated" | "words" | "priority" | "rating" | "title" | "session";
export type LibrarySortDirection = "asc" | "desc";

/** 预计阅读时长分档：短文 (≤5m)、中篇 (6-15m)、长篇 (>15m) */
export type ReadingTimeTier = "all" | "short" | "medium" | "long";

/**
 * 判定文章预计阅读时长是否符合指定分档（T-3391）：
 * 短文 ≤ 5 分钟、中篇 6-15 分钟、长篇 > 15 分钟。
 * 缺失分钟数的条目在指定具体分档时不匹配。
 */
export function matchReadingTimeTier(tier: ReadingTimeTier | undefined, minutes: number | undefined): boolean {
    if (!tier || tier === "all") return true;
    const mins = Number.isFinite(minutes) && (minutes as number) > 0 ? (minutes as number) : 0;
    if (mins <= 0) return false;
    if (tier === "short") return mins <= 5;
    if (tier === "medium") return mins > 5 && mins <= 15;
    if (tier === "long") return mins > 15;
    return true;
}

/**
 * 解析条目预计阅读时长的所属分档类型（短文、中篇、长篇、未知）。
 */
export function resolveReadingTimeTier(minutes: number | undefined): "short" | "medium" | "long" | "unknown" {
    const mins = Number.isFinite(minutes) && (minutes as number) > 0 ? (minutes as number) : 0;
    if (mins <= 0) return "unknown";
    if (mins <= 5) return "short";
    if (mins <= 15) return "medium";
    return "long";
}

export interface LibraryItem {
    kind: LibraryItemKind;
    id: string;
    title: string;
    hpath: string;
    updated: string;
    status?: ClipStatus;
    url?: string;
    site?: string;
    author?: string;
    tags?: string[];
    aiTags?: string[];
    src?: ClipSource | string;
    contentType?: ClipContentType | string;
    timeSource?: ClipTimeSource | string;
    time?: string;
    words?: number;
    minutes?: number;
    priority?: number;
    rating?: number;
    summary?: string;
    /** 用户显式收藏标记（T-1755 投影）；候选无此字段 */
    favorite?: boolean;
}

export interface LibraryFilter {
    /** `all` is used by the kanban, whose columns apply status afterwards. */
    status?: ClipStatus | "all";
    site?: string;
    author?: string;
    tag?: string;
    /** AI 标签分面（T-1729）：与用户 tag 分开筛选，UI 需带 AI 来源标记。 */
    aiTag?: string;
    src?: string;
    timeSource?: string;
    contentType?: string;
    keyword?: string;
    /** 仅看收藏（T-1755）；true 时只保留 favorite 条目 */
    favoriteOnly?: boolean;
    /** 预计阅读时间分档（T-3391） */
    readingTimeTier?: ReadingTimeTier;
    sortBy?: LibrarySortKey;
    direction?: LibrarySortDirection;
    /** Candidates are only shown when the inbox view explicitly opts in. */
    includeCandidates?: boolean;
    /** 会话顺序（T-1903）：sortBy="session" 时按此 docId 序展示；domain 不读 prefs，由调用方传入 */
    sessionOrder?: string[];
}

export interface LibraryFacet {
    value: string;
    count: number;
}

export interface LibraryFacets {
    sites: LibraryFacet[];
    tags: LibraryFacet[];
    /** AI 标签分面（T-1729）：独立于用户 tags，UI 显示 AI 来源标记。 */
    aiTags: LibraryFacet[];
    /** 来源作者分面（T-1812）。 */
    authors: LibraryFacet[];
    sources: LibraryFacet[];
    timeSources: LibraryFacet[];
    contentTypes: LibraryFacet[];
}

/** 稳定、跨设备的字典序；不依赖浏览器/系统的中文 locale。 */
function compareText(left: string, right: string): number {
    const a = left.toLocaleLowerCase();
    const b = right.toLocaleLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
}

function clean(value: string | undefined): string {
    return String(value ?? "").trim();
}

function key(value: string | undefined): string {
    return clean(value).toLocaleLowerCase();
}

function numberOrZero(value: number | undefined): number {
    return Number.isFinite(value) ? Number(value) : 0;
}

function matchesExact(actual: string | undefined, expected: string | undefined): boolean {
    if (!expected) return true;
    return key(actual) === key(expected);
}

function matchesSite(item: LibraryItem, expectedSite: string | undefined): boolean {
    if (!expectedSite) return true;
    if (matchesExact(item.site, expectedSite)) return true;
    // 微信公众号自适应融合：当按“微信”、“微信公众号”或“mp.weixin.qq.com”筛选时，
    // 无论是记录为站点名、域名或 URL 为微信的文章，均自适应命中，彻底消灭筛选盲区。
    if (isWechatUrl(expectedSite)) {
        return isWechatUrl(item.site) || isWechatUrl(item.url);
    }
    return false;
}

function hasTag(item: LibraryItem, expected: string): boolean {
    const wanted = key(expected);
    if (!wanted) return true;
    return (item.tags ?? []).some((tag) => key(tag) === wanted);
}

/** AI 标签精确匹配（T-1729）；关键词搜索仍同时匹配 AI 标签（searchableText 不变）。 */
function hasAiTag(item: LibraryItem, expected: string): boolean {
    const wanted = key(expected);
    if (!wanted) return true;
    return (item.aiTags ?? []).some((tag) => key(tag) === wanted);
}

/**
 * 条目可搜索文本缓存（T-3506）：关键词过滤是高频击键热路径，同一批投影条目
 * 在多次过滤间保持稳定对象身份，WeakMap 按对象缓存已归一化的可搜索文本，
 * 避免每次击键对全库重建数组再小写化。条目投影按不可变快照使用，字段变化时
 * 调用方生成新对象，旧缓存随旧对象一并被回收，无手动失效面。
 */
const searchTextCache = new WeakMap<LibraryItem, string>();

function searchableText(item: LibraryItem): string {
    const cached = searchTextCache.get(item);
    if (cached !== undefined) return cached;
    const text = [
        item.title,
        item.summary,
        item.hpath,
        item.site,
        item.author,
        item.url,
        ...(item.tags ?? []),
        ...(item.aiTags ?? []),
    ]
        .map(clean)
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
    searchTextCache.set(item, text);
    return text;
}

/** 将检索关键词拆分为多词 Token（支持按空白字符 AND 逻辑与检索，BL-28） */
export function tokenizeKeyword(keyword: string | undefined): string[] {
    const raw = key(keyword);
    if (!raw) return [];
    return raw.split(/\s+/).filter(Boolean);
}

/** 是否满足当前视图的所有筛选项。 */
export function matchesLibraryFilter(item: LibraryItem, filter: LibraryFilter = {}): boolean {
    if (item.kind === "candidate" && !filter.includeCandidates) return false;
    if (filter.status && filter.status !== "all") {
        // 候选没有五态。Inbox 明确允许候选进入“待确认”混合视图。
        if (item.kind === "candidate") {
            if (filter.status !== "inbox") return false;
        } else if (item.status !== filter.status) {
            return false;
        }
    }
    if (!matchesSite(item, filter.site)) return false;
    if (!matchesExact(item.author, filter.author)) return false;
    if (filter.tag && !hasTag(item, filter.tag)) return false;
    if (filter.aiTag && !hasAiTag(item, filter.aiTag)) return false;
    if (!matchesExact(item.src, filter.src)) return false;
    if (!matchesExact(item.timeSource, filter.timeSource)) return false;
    if (!matchesExact(item.contentType, filter.contentType)) return false;
    if (filter.readingTimeTier && !matchReadingTimeTier(filter.readingTimeTier, item.minutes)) return false;
    // T-1755：仅看收藏（候选不参与收藏）
    if (filter.favoriteOnly && !(item.kind === "clip" && item.favorite === true)) return false;
    const tokens = tokenizeKeyword(filter.keyword);
    if (tokens.length > 0) {
        const text = searchableText(item);
        if (!tokens.every((token) => text.includes(token))) return false;
    }
    return true;
}

function compareValue(item: LibraryItem, sortBy: LibrarySortKey): string | number {
    if (sortBy === "title") return clean(item.title);
    if (sortBy === "words") return numberOrZero(item.words);
    if (sortBy === "priority") return numberOrZero(item.priority) || 3;
    if (sortBy === "rating") return numberOrZero(item.rating);
    if (sortBy === "updated") return clean(item.updated) || clean(item.time);
    return clean(item.time) || clean(item.updated);
}

/**
 * 预计算排序键（T-3506 装饰-排序-还原）：主键（数字或已小写字符串）与 id 决胜键
 * 一次性算好，O(n) 次归一化替代 O(n log n) 比较对内的重复 clean/小写化。
 */
interface DecoratedSortKey {
    primary: number | string;
    id: string;
}

function decorateSortKey(item: LibraryItem, sortBy: LibrarySortKey): DecoratedSortKey {
    const value = compareValue(item, sortBy);
    return {
        primary: typeof value === "number" ? value : value.toLocaleLowerCase(),
        id: item.id.toLocaleLowerCase(),
    };
}

function compareDecoratedKeys(a: DecoratedSortKey, b: DecoratedSortKey): number {
    const left = a.primary;
    const right = b.primary;
    let result: number;
    if (typeof left === "number" && typeof right === "number") {
        result = left - right;
    } else {
        const l = String(left);
        const r = String(right);
        result = l < r ? -1 : l > r ? 1 : 0;
    }
    if (result === 0) result = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return result;
}

/** 装饰-排序-还原：返回新数组（稳定排序），方向语义与原 compareItems 一致。 */
function sortDecorated(list: LibraryItem[], sortBy: LibrarySortKey, direction: LibrarySortDirection): LibraryItem[] {
    const decorated = list.map((item) => ({ item, key: decorateSortKey(item, sortBy) }));
    const sign = direction === "asc" ? 1 : -1;
    decorated.sort((a, b) => compareDecoratedKeys(a.key, b.key) * sign);
    return decorated.map((d) => d.item);
}

/**
 * 应用统一筛选和排序。返回新数组，不改变传入索引或条目，也不写任何属性。
 * sortBy="session"（T-1903）：先按默认 time desc 建立基底序，再按 sessionOrder 投影
 * （order 内按相对次序在前，未入列追加尾部）；direction 对 session 无效。
 */
export function filterAndSortLibrary(items: readonly LibraryItem[], filter: LibraryFilter = {}): LibraryItem[] {
    const sortBy = filter.sortBy ?? "time";
    const direction = filter.direction ?? (sortBy === "title" ? "asc" : "desc");
    const filtered = items.filter((item) => matchesLibraryFilter(item, filter));
    if (sortBy === "session") {
        return applySessionOrder(sortDecorated(filtered, "time", "desc"), filter.sessionOrder ?? []);
    }
    return sortDecorated(filtered, sortBy, direction);
}

function addFacet(map: Map<string, LibraryFacet>, value: string | undefined): void {
    const display = clean(value);
    if (!display) return;
    const normalized = key(display);
    const current = map.get(normalized);
    if (current) current.count += 1;
    else map.set(normalized, { value: display, count: 1 });
}

function facetsFromMap(map: Map<string, LibraryFacet>): LibraryFacet[] {
    return [...map.values()].sort((a, b) => b.count - a.count || compareText(a.value, b.value));
}

/** 从同一条目集合生成筛选控件的真实分面计数。 */
export function libraryFacets(items: readonly LibraryItem[], includeCandidates = false): LibraryFacets {
    const sites = new Map<string, LibraryFacet>();
    const authors = new Map<string, LibraryFacet>();
    const tags = new Map<string, LibraryFacet>();
    const aiTags = new Map<string, LibraryFacet>();
    const sources = new Map<string, LibraryFacet>();
    const timeSources = new Map<string, LibraryFacet>();
    const contentTypes = new Map<string, LibraryFacet>();
    for (const item of items) {
        if (item.kind === "candidate") {
            if (includeCandidates) addFacet(sites, item.site);
            continue;
        }
        addFacet(sites, item.site);
        if (item.author && !/^https?:\/\//i.test(item.author.trim()) && !item.author.includes("weixin.qq.com") && !item.author.includes("/")) {
            addFacet(authors, item.author);
        }
        for (const tag of item.tags ?? []) addFacet(tags, tag);
        for (const tag of item.aiTags ?? []) addFacet(aiTags, tag);
        addFacet(sources, item.src);
        addFacet(timeSources, item.timeSource);
        addFacet(contentTypes, item.contentType);
    }
    return {
        sites: facetsFromMap(sites),
        authors: facetsFromMap(authors),
        tags: facetsFromMap(tags),
        aiTags: facetsFromMap(aiTags),
        sources: facetsFromMap(sources),
        timeSources: facetsFromMap(timeSources),
        contentTypes: facetsFromMap(contentTypes),
    };
}

export type LibraryMatchKind = "title" | "summary" | "tag" | "aiTag" | "author" | "site" | "url" | "hpath";

export interface LibraryMatchReason {
    kind: LibraryMatchKind;
    value?: string;
}

export interface LibraryMatchTarget {
    title?: string;
    summary?: string;
    tags?: string[];
    aiTags?: string[];
    author?: string;
    site?: string;
    url?: string;
    hpath?: string;
}

/**
 * 判定关键词命中的具体字段（按优先级：标题 → 摘要 → 用户标签 → AI标签 → 作者 → 站点 → URL → 路径）。
 * 关键词为空或未命中时返回 null。
 */
export function matchLibraryReason(item: LibraryMatchTarget, keyword: string | undefined): LibraryMatchReason | null {
    const tokens = tokenizeKeyword(keyword);
    if (tokens.length === 0) return null;
    for (const query of tokens) {
        if (key(item.title).includes(query)) return { kind: "title" };
        if (key(item.summary).includes(query)) return { kind: "summary" };
        const hitTag = (item.tags ?? []).find((t) => key(t).includes(query));
        if (hitTag) return { kind: "tag", value: hitTag };
        const hitAiTag = (item.aiTags ?? []).find((t) => key(t).includes(query));
        if (hitAiTag) return { kind: "aiTag", value: hitAiTag };
        if (key(item.author).includes(query)) return { kind: "author", value: item.author };
        if (key(item.site).includes(query)) return { kind: "site", value: item.site };
        if (key(item.url).includes(query)) return { kind: "url" };
        if (key(item.hpath).includes(query)) return { kind: "hpath" };
    }
    return null;
}

export interface CandidateSiteGroup {
    site: string;
    count: number;
    items: LibraryItem[];
}

/**
 * 将待分拣候选按来源站点聚类分组（T-1801 / T-3373）：
 * 纯视图投影，按数量降序排列，同数量按站点字典序。
 */
export function groupCandidatesBySite(items: readonly LibraryItem[]): CandidateSiteGroup[] {
    const groups = new Map<string, LibraryItem[]>();
    for (const item of items) {
        if (item.kind !== "candidate") continue;
        const siteKey = clean(item.site) || "unknown";
        const list = groups.get(siteKey) ?? [];
        list.push(item);
        groups.set(siteKey, list);
    }

    const result: CandidateSiteGroup[] = [];
    for (const [site, groupItems] of groups.entries()) {
        result.push({
            site: site === "unknown" ? "" : site,
            count: groupItems.length,
            items: groupItems,
        });
    }

    return result.sort((a, b) => b.count - a.count || compareText(a.site, b.site));
}
