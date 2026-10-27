import { readingViewport } from "./reading-position.ts";

const BLOCK_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/;

export interface ReadPointObserverOptions {
    host: HTMLElement | null;
    docId: string;
    onReadPointChange: (blockId: string) => void;
    /** 驻留记录防抖时间，默认 1000ms（Issue #17 标准） */
    dwellMs?: number;
}

export interface ReadPointObserverHandle {
    disconnect: () => void;
    /** 手动强制捕获当前视口中心的块 ID */
    captureCurrentPoint: () => string | null;
}

/**
 * 视口相交高精度断点续读引擎（Read-Point Engine）
 * 遵循 Issue #17 统领指令与小驴生态跨插件联邦标准。
 */
export function createReadPointObserver(options: ReadPointObserverOptions): ReadPointObserverHandle {
    const { host, docId, onReadPointChange, dwellMs = 1000 } = options;
    if (!host || typeof window === "undefined") {
        return { disconnect: () => {}, captureCurrentPoint: () => null };
    }

    let activeBlockId: string | null = null;
    let pendingBlockId: string | null = null;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const clearDwell = () => {
        if (dwellTimer !== null) {
            clearTimeout(dwellTimer);
            dwellTimer = null;
        }
    };

    const viewport = readingViewport(host) ?? host.querySelector<HTMLElement>(".protyle-content") ?? host;

    function findCenterBlock(): HTMLElement | null {
        if (!viewport || !viewport.isConnected) return null;
        const rect = viewport.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const blocks = Array.from(viewport.querySelectorAll<HTMLElement>("[data-node-id]"))
            .filter((el) => {
                const id = el.getAttribute("data-node-id") || "";
                return BLOCK_ID_PATTERN.test(id) && id !== docId;
            });

        for (const block of blocks) {
            const bRect = block.getBoundingClientRect();
            if (bRect.top <= centerY && bRect.bottom >= centerY) {
                return block;
            }
        }
        return null;
    }

    function onTargetBlockCandidate(blockId: string) {
        if (disposed || !blockId || blockId === activeBlockId) return;
        if (blockId === pendingBlockId && dwellTimer !== null) return;

        clearDwell();
        pendingBlockId = blockId;
        dwellTimer = setTimeout(() => {
            if (disposed) return;
            activeBlockId = pendingBlockId;
            if (activeBlockId) {
                onReadPointChange(activeBlockId);
            }
            dwellTimer = null;
        }, dwellMs);
    }

    let observer: IntersectionObserver | null = null;

    if (typeof IntersectionObserver !== "undefined") {
        try {
            observer = new IntersectionObserver(
                (entries) => {
                    if (disposed) return;
                    // 找到最靠近视口中心的相交块
                    const intersecting = entries.filter((e) => e.isIntersecting && e.target instanceof HTMLElement);
                    if (intersecting.length > 0) {
                        const targetEl = intersecting[0].target as HTMLElement;
                        const id = targetEl.getAttribute("data-node-id");
                        if (id && BLOCK_ID_PATTERN.test(id) && id !== docId) {
                            onTargetBlockCandidate(id);
                        }
                    }
                },
                {
                    root: viewport === host ? null : viewport,
                    rootMargin: "-45% 0px -45% 0px", // 仅聚焦正中心 10% 视口范围
                    threshold: 0,
                }
            );

            // 观察视口内部的块
            const nodes = viewport.querySelectorAll<HTMLElement>("[data-node-id]");
            for (const node of Array.from(nodes)) {
                const id = node.getAttribute("data-node-id") || "";
                if (BLOCK_ID_PATTERN.test(id) && id !== docId) {
                    observer.observe(node);
                }
            }
        } catch (e) {
            // 环境不支持 rootMargin 时平滑降级
            console.debug("[glean] IntersectionObserver 初始化回退:", e);
        }
    }

    // 监听滚动进行补位防抖采样（双保险机制）
    const scrollHandler = () => {
        if (disposed) return;
        const center = findCenterBlock();
        if (center) {
            const id = center.getAttribute("data-node-id");
            if (id && BLOCK_ID_PATTERN.test(id) && id !== docId) {
                onTargetBlockCandidate(id);
            }
        }
    };

    viewport.addEventListener("scroll", scrollHandler, { passive: true });

    return {
        disconnect() {
            disposed = true;
            clearDwell();
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            viewport.removeEventListener("scroll", scrollHandler);
        },
        captureCurrentPoint() {
            const center = findCenterBlock();
            return center ? center.getAttribute("data-node-id") : null;
        },
    };
}

/**
 * 平滑滚动至视口断点并施加呼吸聚焦动效
 */
export function scrollAndPulseReadPoint(host: HTMLElement | null, blockId: string | null | undefined): boolean {
    if (!host || !blockId || !BLOCK_ID_PATTERN.test(blockId)) return false;
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(blockId) : blockId;
    const target = host.querySelector<HTMLElement>(`[data-node-id="${escaped}"]`);
    if (!target) return false;

    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("glean-pulse-highlight");
    setTimeout(() => {
        target.classList.remove("glean-pulse-highlight");
    }, 1500);
    return true;
}
