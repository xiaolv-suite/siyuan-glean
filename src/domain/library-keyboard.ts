/**
 * 读库全键盘操作流的键位仲裁与光标移动（T-3392）。
 *
 * Readwise Reader 风格的 J/K 分拣需要同时满足三件事：
 * 1. 不抢宿主与浏览器已有的按键（输入框、按钮、弹层里的 Enter/Escape）；
 * 2. 输入法组合期间一律不响应，避免中文候选词被当成命令；
 * 3. 破坏性动作（归档、改稍后读）忽略长按重复，防止一次按键误伤整列。
 *
 * 本层只做纯函数判定，不读 DOM、不依赖 Svelte；焦点与渲染由 DockPanel 负责。
 */

export type LibraryKeyboardAction =
    | { type: "move"; delta: 1 | -1 }
    | { type: "moveCol"; delta: 1 | -1 }
    | { type: "activate" }
    | { type: "openDocument" }
    | { type: "startReading" }
    | { type: "markDone" }
    | { type: "later" }
    | { type: "archive" }
    | { type: "toggleSelect" }
    | { type: "selectDisplayed" }
    | { type: "keepFiltered" }
    | { type: "clearSelection" }
    | { type: "clearCursor" }
    | { type: "cyclePriority" }
    | { type: "setPriority"; value: number }
    | { type: "cycleRating" }
    | { type: "togglePin" }
    | { type: "copyBlockRef" }
    | { type: "roaming" }
    | { type: "toggleFavorite" }
    | { type: "copyCitation" }
    | { type: "copyBibTeX" }
    | { type: "focusSearch" };

export interface LibraryKeyboardEventLike {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    isComposing?: boolean;
    keyCode?: number;
    repeat?: boolean;
}

export interface LibraryKeyboardContext {
    /** 焦点在文本输入类控件（input/textarea/select/contenteditable）中。 */
    textEntry?: boolean;
    /** 焦点在按钮、链接等自带 Enter 语义的元素上。 */
    nativeAction?: boolean;
    /** 插件内或宿主已有弹层/菜单打开。 */
    overlay?: boolean;
    /** 键盘光标是否已经落在某一行；未激活时只允许 J/K 起步。 */
    cursorActive?: boolean;
    /** 当前是否有勾选集合；决定 S/F/C 选择类键位是否可用。 */
    hasSelection?: boolean;
}

/** 长按重复时不重复执行的破坏性动作。 */
const REPEAT_SENSITIVE = new Set<LibraryKeyboardAction["type"]>([
    "activate", "openDocument", "startReading", "markDone", "later", "archive", "toggleSelect",
    "selectDisplayed", "keepFiltered", "clearSelection",
    "cyclePriority", "setPriority", "cycleRating", "togglePin", "copyBlockRef", "roaming",
    "toggleFavorite", "copyCitation", "copyBibTeX", "focusSearch",
]);

/**
 * 把一次按键解析成读库动作；返回 null 表示应完全交还原生处理。
 *
 * 键位：J / ↓ 下一行，K / ↑ 上一行，Enter 查看，O 打开原文，
 * R 开始阅读，A 稍后读，E 归档，X 切换选择，Esc 退出键盘光标；
 * S 选择已显示（需光标），F 仅保留当前筛选、C 清空选择（需已有勾选）。
 */
export function resolveLibraryShortcut(
    event: LibraryKeyboardEventLike,
    context: LibraryKeyboardContext = {},
): LibraryKeyboardAction | null {
    if (event.isComposing || event.keyCode === 229) return null;
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    if (context.overlay || context.textEntry) return null;
    // 大写字母通常是 Shift+字母，不作为命令；避免 Shift+E 被当成归档。
    // 特例：Shift+C 在激活光标且无勾选时触发 copyBibTeX 导出（与 C 复制 GB/T 著录对应）
    if (event.shiftKey) {
        if (context.cursorActive && !context.hasSelection && (event.key === "C" || event.key === "c")) {
            return repeatOrNull(event, { type: "copyBibTeX" });
        }
        return null;
    }

    const key = event.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (key === "Escape") return context.cursorActive ? { type: "clearCursor" } : null;

    const cursorActive = context.cursorActive === true;
    if (lower === "j" || (key === "ArrowDown" && cursorActive)) {
        return repeatOrNull(event, { type: "move", delta: 1 });
    }
    if (lower === "k" || (key === "ArrowUp" && cursorActive)) {
        return repeatOrNull(event, { type: "move", delta: -1 });
    }
    if ((lower === "h" || key === "ArrowLeft") && cursorActive) {
        return repeatOrNull(event, { type: "moveCol", delta: -1 });
    }
    if (key === "ArrowRight" && cursorActive) {
        return repeatOrNull(event, { type: "moveCol", delta: 1 });
    }
    // Enter 在按钮/链接上保留原生点击语义；只有焦点在行容器时才接管。
    if (key === "Enter" && !context.nativeAction && cursorActive) {
        return repeatOrNull(event, { type: "activate" });
    }

    // 选择类动作：F/C 只要存在勾选即可用，便于关掉光标后仍能整批收尾。
    if (lower === "f" && context.hasSelection) return repeatOrNull(event, { type: "keepFiltered" });
    if (lower === "c" && context.hasSelection) return repeatOrNull(event, { type: "clearSelection" });
    // 漫游盲盒：B 键全局快速呼出，无需前置选中光标
    if (lower === "b") return repeatOrNull(event, { type: "roaming" });
    // 检索：/ 键全局聚焦检索输入框，无需前置选中光标
    if (key === "/") return repeatOrNull(event, { type: "focusSearch" });
    if (!cursorActive) return null;

    if (lower === "s") return repeatOrNull(event, { type: "selectDisplayed" });
    if (lower === "o") return repeatOrNull(event, { type: "openDocument" });
    if (lower === "r") return repeatOrNull(event, { type: "startReading" });
    if (lower === "d") return repeatOrNull(event, { type: "markDone" });
    if (lower === "a" || lower === "l") return repeatOrNull(event, { type: "later" });
    if (lower === "e") return repeatOrNull(event, { type: "archive" });
    if (lower === "x") return repeatOrNull(event, { type: "toggleSelect" });
    if (lower === "p") return repeatOrNull(event, { type: "cyclePriority" });
    if (lower === "t") return repeatOrNull(event, { type: "togglePin" });
    if (lower === "y") return repeatOrNull(event, { type: "copyBlockRef" });
    if (key >= "1" && key <= "5") return repeatOrNull(event, { type: "setPriority", value: Number(key) });
    if (lower === "m") return repeatOrNull(event, { type: "cycleRating" });
    if (lower === "f") return repeatOrNull(event, { type: "toggleFavorite" });
    if (lower === "c") return repeatOrNull(event, { type: "copyCitation" });
    return null;
}

function repeatOrNull(event: LibraryKeyboardEventLike, action: LibraryKeyboardAction): LibraryKeyboardAction | null {
    if (event.repeat && REPEAT_SENSITIVE.has(action.type)) return null;
    return action;
}

/**
 * 计算键盘光标的下一个位置。
 *
 * - 当前光标不在列表里（首次进入或被筛选移除）：正向从第一项开始，反向从最后一项开始；
 * - 到达两端后保持不动，不回绕，避免长按 J 从「待分拣」直接跳到「已归档」。
 */
export function moveLibraryCursor(ids: readonly string[], currentId: string, delta: 1 | -1): string {
    if (ids.length === 0) return "";
    const index = currentId ? ids.indexOf(currentId) : -1;
    if (index < 0) return delta > 0 ? ids[0] : ids[ids.length - 1];
    const next = Math.min(ids.length - 1, Math.max(0, index + delta));
    return ids[next];
}

/**
 * 二维网格/看板列间光标移动（BL-30）：
 * 给定各列 ID 二维数组 columns: readonly (readonly string[])[]，
 * 从当前 currentId 跨列移动（delta: 1 为向右，-1 为向左）。
 * 移动到相邻非空列的相同或最接近的行索引。
 */
export function moveKanbanCursor2D(
    columns: readonly (readonly string[])[],
    currentId: string,
    delta: 1 | -1,
): string {
    if (columns.length === 0) return "";
    let currentCol = -1;
    let currentRow = -1;
    for (let c = 0; c < columns.length; c++) {
        const r = columns[c].indexOf(currentId);
        if (r >= 0) {
            currentCol = c;
            currentRow = r;
            break;
        }
    }
    if (currentCol < 0) {
        for (const col of columns) {
            if (col.length > 0) return col[0];
        }
        return "";
    }

    let targetCol = currentCol + delta;
    while (targetCol >= 0 && targetCol < columns.length) {
        if (columns[targetCol].length > 0) {
            const targetRow = Math.min(currentRow, columns[targetCol].length - 1);
            return columns[targetCol][targetRow];
        }
        targetCol += delta;
    }
    return currentId;
}

/**
 * 看板列内垂直移动光标（BL-30）：
 * 在当前卡片所在列中沿上下方向移动，不出列。
 */
export function moveKanbanCursorVertical(
    columns: readonly (readonly string[])[],
    currentId: string,
    delta: 1 | -1,
): string {
    if (columns.length === 0) return "";
    let currentCol = -1;
    let currentRow = -1;
    for (let c = 0; c < columns.length; c++) {
        const r = columns[c].indexOf(currentId);
        if (r >= 0) {
            currentCol = c;
            currentRow = r;
            break;
        }
    }
    if (currentCol < 0) {
        for (const col of columns) {
            if (col.length > 0) return delta > 0 ? col[0] : col[col.length - 1];
        }
        return "";
    }
    const col = columns[currentCol];
    const targetRow = Math.min(col.length - 1, Math.max(0, currentRow + delta));
    return col[targetRow];
}

/** 供 UI 决定是否显示「已用键盘选中」提示。 */
export function isLibraryCursorVisible(currentId: string, ids: readonly string[]): boolean {
    return Boolean(currentId) && ids.includes(currentId);
}

/**
 * 循环计算下一个优先级（1-5）。
 * 默认优先级为 3；循环顺序：3 -> 4 -> 5 -> 1 -> 2 -> 3。
 */
export function cyclePriorityValue(current?: number): number {
    const val = typeof current === "number" && current >= 1 && current <= 5 ? current : 3;
    return val >= 5 ? 1 : val + 1;
}

/**
 * 循环计算下一个评分（0-5 星）。
 * 默认评分为 0（无评分）；循环顺序：0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 0。
 */
export function cycleRatingValue(current?: number): number {
    const val = typeof current === "number" && current >= 0 && current <= 5 ? current : 0;
    return val >= 5 ? 0 : val + 1;
}
