import { isMobileKeyboardOpen, mobileKeyboardInset } from "../domain/mobile-viewport.ts";

const noop = () => {};

export function installMobileViewportVars(target: HTMLElement | null, enabled: boolean): () => void {
    if (!target || !enabled || typeof window === "undefined") return noop;

    const visualViewport = window.visualViewport;
    let lastWidth = window.innerWidth || 0;
    let baseHeight = Math.max(window.innerHeight || 0, visualViewport?.height ?? 0);
    let blurTimer: number | null = null;

    const isTextEntryFocused = (): boolean => {
        if (typeof document === "undefined") return false;
        const active = document.activeElement;
        if (!active || typeof target.contains !== "function" || !target.contains(active)) return false;
        if (active.tagName === "TEXTAREA") return true;
        if (active.tagName === "INPUT") {
            const type = ((active as HTMLInputElement).type || "text").toLowerCase();
            return !["checkbox", "radio", "range", "button", "submit", "reset", "file", "hidden"].includes(type);
        }
        return false;
    };

    const update = () => {
        const curWidth = window.innerWidth || 0;
        const curInnerHeight = window.innerHeight || 0;
        const viewportHeight = visualViewport?.height ?? curInnerHeight;
        const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
        if (Math.abs(curWidth - lastWidth) > 80) {
            lastWidth = curWidth;
            baseHeight = Math.max(curInnerHeight, viewportHeight);
        } else if (Math.max(curInnerHeight, viewportHeight) > baseHeight) {
            baseHeight = Math.max(curInnerHeight, viewportHeight);
        }
        const metrics = {
            innerHeight: curInnerHeight,
            viewportHeight,
            viewportOffsetTop,
        };
        const inset = mobileKeyboardInset(metrics);
        const shrunkVsBase = baseHeight > 540 && viewportHeight > 0 && viewportHeight < baseHeight * 0.78;
        const keyboardOpen = isMobileKeyboardOpen(metrics) || shrunkVsBase || isTextEntryFocused();
        target.style.setProperty("--glean-keyboard-inset", `${inset}px`);
        target.style.setProperty("--glean-visual-viewport-height", `${Math.round(viewportHeight)}px`);
        target.toggleAttribute("data-glean-keyboard-open", keyboardOpen);
    };

    const handleFocusOut = () => {
        if (blurTimer !== null) window.clearTimeout(blurTimer);
        blurTimer = window.setTimeout(() => {
            blurTimer = null;
            update();
        }, 30);
    };

    update();
    window.addEventListener("resize", update);
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    target.addEventListener?.("focusin", update);
    target.addEventListener?.("focusout", handleFocusOut);

    return () => {
        if (blurTimer !== null) {
            window.clearTimeout(blurTimer);
            blurTimer = null;
        }
        window.removeEventListener("resize", update);
        visualViewport?.removeEventListener("resize", update);
        visualViewport?.removeEventListener("scroll", update);
        target.removeEventListener?.("focusin", update);
        target.removeEventListener?.("focusout", handleFocusOut);
        target.style.removeProperty("--glean-keyboard-inset");
        target.style.removeProperty("--glean-visual-viewport-height");
        target.removeAttribute("data-glean-keyboard-open");
    };
}
