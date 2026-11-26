import { readingViewport } from "./reading-position.ts";

const BLOCK_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/;

export interface ReadPointObserverOptions {
    host: HTMLElement | null;
    docId: string;
    onReadPointChange: (blockId: string) => void;
    /** 驻留记录防抖时间，默认 1000ms（Issue #17 标准） */
    dwellMs?: number;
    /** 返回 true 时冻结断点写入（如正在恢复历史断点） */
    isWriteFrozen?: () => boolean;
}

export interface ReadPointObserverHandle {
    disconnect: () => void;
    /** 手动强制捕获当前视口中心的块 ID */
    captureCurrentPoint: () => string | null;
}

function getBlockId(el: Element): string {
    return el.getAttribute("data-node-id") || el.getAttribute("id") || "";
}

function isHiddenNode(el: Element): boolean {
    return typeof el.closest === "function" && Boolean(el.closest(".fn__none"));
}

function isValidReadingBlock(el: Element, docId: string): boolean {
    if (el.getAttribute("data-type") === "NodeDocument") return false;
    if (isHiddenNode(el)) return false;
    const id = getBlockId(el);
    return BLOCK_ID_PATTERN.test(id) && id !== docId;
}

function collectCandidateBlocks(root: HTMLElement, docId: string): HTMLElement[] {
    const found = new Set<HTMLElement>();
    for (const node of Array.from(root.querySelectorAll<HTMLElement>("[data-node-id]"))) {
        if (isValidReadingBlock(node, docId)) found.add(node);
    }
    if (typeof root.matches === "function" && root.matches(".b3-typography")) {
        for (const node of Array.from(root.querySelectorAll<HTMLElement>("[id]"))) {
            if (isValidReadingBlock(node, docId)) found.add(node);
        }
    } else {
        for (const node of Array.from(root.querySelectorAll<HTMLElement>(".protyle-preview:not(.fn__none) .b3-typography [id]"))) {
            if (isValidReadingBlock(node, docId)) found.add(node);
        }
    }
    return Array.from(found);
}

/**
 * 视口相交高精度断点续读引擎（Read-Point Engine）
 * 遵循 Issue #17 统领指令与小驴生态跨插件联邦标准。
 */
export function createReadPointObserver(options: ReadPointObserverOptions): ReadPointObserverHandle {
    const { host, docId, onReadPointChange, dwellMs = 1000, isWriteFrozen } = options;
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

    const resolveViewport = (): HTMLElement => {
        return readingViewport(host)
            ?? host.querySelector<HTMLElement>(".protyle-content:not(.fn__none), .protyle-preview:not(.fn__none) .b3-typography, .protyle-preview:not(.fn__none)")
            ?? host;
    };

    let viewport: HTMLElement = resolveViewport();

    function findCenterBlock(): HTMLElement | null {
        if (!viewport || !viewport.isConnected) return null;
        const rect = viewport.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const blocks = collectCandidateBlocks(viewport, docId);
        if (blocks.length === 0) return null;

        let spanMatch: HTMLElement | null = null;
        let nearestVisible: HTMLElement | null = null;
        let nearestDist = Infinity;
        let lastVisible: HTMLElement | null = null;

        for (const block of blocks) {
            const bRect = block.getBoundingClientRect();
            if (bRect.height <= 0 || bRect.width <= 0) continue;
            if (bRect.top <= centerY && bRect.bottom >= centerY) {
                spanMatch = block;
            }
            if (bRect.bottom > rect.top && bRect.top < rect.bottom) {
                lastVisible = block;
                const dist = bRect.bottom < centerY ? centerY - bRect.bottom : bRect.top > centerY ? bRect.top - centerY : 0;
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestVisible = block;
                }
            }
        }

        if (spanMatch) return spanMatch;
        const atBottomOrShort = viewport.scrollHeight <= viewport.clientHeight + 24
            || (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 24);
        if (atBottomOrShort && lastVisible) {
            return nearestVisible ?? lastVisible;
        }
        return nearestVisible;
    }

    function onTargetBlockCandidate(blockId: string) {
        if (disposed || !blockId || blockId === activeBlockId) return;
        if (isWriteFrozen?.()) return;
        if (blockId === pendingBlockId && dwellTimer !== null) return;

        clearDwell();
        pendingBlockId = blockId;
        dwellTimer = setTimeout(() => {
            if (disposed) return;
            if (isWriteFrozen?.()) {
                dwellTimer = null;
                pendingBlockId = null;
                return;
            }
            activeBlockId = pendingBlockId;
            if (activeBlockId) {
                onReadPointChange(activeBlockId);
            }
            dwellTimer = null;
        }, dwellMs);
    }

    let observer: IntersectionObserver | null = null;
    let lastObserverShort: boolean | null = null;
    const observedNodes = new WeakSet<Element>();
    let scrollRaf: number | null = null;
    const scrollHandler = () => {
        if (disposed || scrollRaf !== null) return;
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = null;
            if (disposed) return;
            const center = findCenterBlock();
            if (center) {
                const id = getBlockId(center);
                if (id && BLOCK_ID_PATTERN.test(id) && id !== docId) {
                    onTargetBlockCandidate(id);
                }
            }
        });
    };

    const bindViewportAndObserve = () => {
        if (disposed) return;
        const nextViewport = resolveViewport();
        if (nextViewport !== viewport) {
            viewport.removeEventListener("scroll", scrollHandler);
            viewport = nextViewport;
            viewport.addEventListener("scroll", scrollHandler, { passive: true });
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            lastObserverShort = null;
        }

        const isShortViewport = viewport.scrollHeight <= viewport.clientHeight + 1;
        if (lastObserverShort !== null && lastObserverShort !== isShortViewport && observer) {
            observer.disconnect();
            observer = null;
        }

        if (typeof IntersectionObserver !== "undefined") {
            try {
                if (!observer) {
                    lastObserverShort = isShortViewport;
                    observer = new IntersectionObserver(
                        (entries) => {
                            if (disposed) return;
                            const intersecting = entries.filter((e) => e.isIntersecting && e.target instanceof HTMLElement);
                            if (intersecting.length > 0) {
                                const targetEl = intersecting[0].target as HTMLElement;
                                const id = getBlockId(targetEl);
                                if (id && BLOCK_ID_PATTERN.test(id) && id !== docId) {
                                    onTargetBlockCandidate(id);
                                }
                            }
                        },
                        {
                            root: viewport === host ? null : viewport,
                            rootMargin: isShortViewport ? "0px" : "-45% 0px -45% 0px",
                            threshold: 0,
                        }
                    );
                }
                for (const node of collectCandidateBlocks(viewport, docId)) {
                    if (!observedNodes.has(node)) {
                        observedNodes.add(node);
                        observer.observe(node);
                    }
                }
            } catch (e) {
                console.debug("[glean] IntersectionObserver 初始化回退:", e);
            }
        }
    };

    viewport.addEventListener("scroll", scrollHandler, { passive: true });
    bindViewportAndObserve();

    let mutationObserver: MutationObserver | null = null;
    let rebindScheduled = false;
    if (typeof MutationObserver !== "undefined" && typeof Node !== "undefined" && host instanceof Node) {
        try {
            mutationObserver = new MutationObserver(() => {
                if (disposed || rebindScheduled) return;
                rebindScheduled = true;
                queueMicrotask(() => {
                    rebindScheduled = false;
                    bindViewportAndObserve();
                });
            });
            mutationObserver.observe(host, { childList: true, subtree: true });
        } catch {
            mutationObserver = null;
        }
    }

    return {
        disconnect() {
            disposed = true;
            clearDwell();
            if (scrollRaf !== null) {
                cancelAnimationFrame(scrollRaf);
                scrollRaf = null;
            }
            if (mutationObserver) {
                mutationObserver.disconnect();
                mutationObserver = null;
            }
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            viewport.removeEventListener("scroll", scrollHandler);
        },
        captureCurrentPoint() {
            const center = findCenterBlock();
            return center ? getBlockId(center) || null : null;
        },
    };
}

/**
 * 平滑滚动至视口断点并施加呼吸聚焦动效
 */
export function scrollAndPulseReadPoint(host: HTMLElement | null, blockId: string | null | undefined): boolean {
    if (!host || !blockId || !BLOCK_ID_PATTERN.test(blockId)) return false;
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(blockId) : blockId;
    const previewVisibleMatch = host.querySelector<HTMLElement>(`.protyle-preview:not(.fn__none) .b3-typography [id="${escaped}"]`);
    const wysiwygVisibleMatch = host.querySelector<HTMLElement>(`.protyle-wysiwyg:not(.fn__none) [data-node-id="${escaped}"]`);
    const previewFallbackMatch = host.querySelector<HTMLElement>(`.protyle-preview .b3-typography [id="${escaped}"]`);
    const previewAttrFallbackMatch = host.querySelector<HTMLElement>(`.protyle-preview:not(.fn__none) [id="${escaped}"]`);
    const fallbackMatch = host.querySelector<HTMLElement>(`[data-node-id="${escaped}"]`);
    const isVisibleMatch = (el: HTMLElement | null): el is HTMLElement => {
        if (!el || isHiddenNode(el)) return false;
        if (typeof el.getClientRects === "function") return el.getClientRects().length > 0;
        return true;
    };
    const target = [previewVisibleMatch, wysiwygVisibleMatch, previewFallbackMatch, previewAttrFallbackMatch, fallbackMatch].find(isVisibleMatch);
    if (!target) return false;

    target.scrollIntoView({ block: "center", behavior: (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" });
    target.classList.add("glean-pulse-highlight");
    setTimeout(() => {
        target.classList.remove("glean-pulse-highlight");
    }, 1500);
    return true;
}
