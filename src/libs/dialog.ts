/*
 * Svelte 弹窗工具（模板 siyuan-note/plugin-sample-vite-svelte 移植, MIT, frostime）
 */
import { Dialog, getFrontend } from "siyuan";
import { mount, unmount } from "svelte";
import type { Component } from "svelte";
import { installMobileViewportVars } from "./mobile-viewport";
import { installModalFocus } from "./modal-focus";
import { isActivationKey } from "../domain/keyboard";
import pluginManifest from "../../plugin.json";
import { lvSurfaceStack } from "./notice";

function isMobileFrontend(): boolean {
    const frontend = getFrontend();
    return frontend === "mobile" || frontend === "browser-mobile";
}

/**
 * 统领规范：为思源原生 Dialog 标题栏装配统一的品牌标题栏规范（.lv-dialog-title-wrap）。
 * 包含 22×22 青绿底白麦穗标 + 标题 + 版本胶囊，保持幂等。
 */
export function mountPlatformDialogTitleWrap(
    dialogElement: HTMLElement | null | undefined,
    titleText: string,
    badgeText = `v${pluginManifest.version}`,
    iconName = "iconGleanWheat",
): HTMLElement | null {
    if (!dialogElement || typeof dialogElement.querySelector !== "function") return null;
    const header = dialogElement.querySelector(".b3-dialog__header");
    const titleEl = header?.querySelector(".b3-dialog__title");
    if (!header || !titleEl) return null;
    const existing = header.querySelector(".lv-dialog-title-wrap") as HTMLElement | null;
    if (existing) return existing;

    const wrap = document.createElement("div");
    wrap.className = "lv-dialog-title-wrap";
    const iconSpan = document.createElement("span");
    iconSpan.className = "lv-dialog-title-icon";
    iconSpan.innerHTML = `<svg><use xlink:href="#${iconName || "iconGleanWheat"}"></use></svg>`;
    const titleSpan = document.createElement("span");
    titleSpan.className = "lv-dialog-title-text";
    titleSpan.textContent = titleText || "";
    wrap.append(iconSpan, titleSpan);
    if (badgeText) {
        const badgeSpan = document.createElement("span");
        badgeSpan.className = "lv-dialog-title-pill";
        badgeSpan.textContent = badgeText;
        wrap.appendChild(badgeSpan);
    }
    titleEl.textContent = "";
    titleEl.appendChild(wrap);
    return wrap;
}

export const simpleDialog = (args: {
    title: string, ele: HTMLElement | DocumentFragment,
    closeLabel?: string,
    canClose?: () => boolean,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    let disposeViewport = () => {};
    let disposeFocus = () => {};
    const previousFocus = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    let closed = false;
    let closing = false;
    const surfaceId = `dialog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const popSurface = lvSurfaceStack.push({
        id: surfaceId,
        type: "dialog",
        dismiss: () => {
            if (closed || closing) return false;
            if (args.canClose?.() === false) return false;
            requestClose();
            return true;
        },
    });

    const dialog = new Dialog({
        title: args.title,
        content: `<div class="dialog-content" style="display: flex; flex-direction: column; align-items: stretch; width: 100%; height: 100%; min-width: 0; min-height: 0; box-sizing: border-box;"></div>`,
        width: args.width,
        height: args.height,
        destroyCallback: () => {
            if (closed) return;
            closed = true;
            popSurface();
            disposeFocus();
            disposeViewport();
            args.callback?.();
        }
    });
    const isFullscreen = args.width === "100vw" || args.height === "100dvh" || (isMobileFrontend() && (args.width === "100%" || !args.width));
    const modalRoot = dialog.element.querySelector<HTMLElement>(".b3-dialog__container") ?? dialog.element;
    if (isFullscreen) {
        modalRoot.style.maxWidth = "100vw";
        modalRoot.style.maxHeight = "100dvh";
        modalRoot.style.width = "100vw";
        modalRoot.style.height = "100dvh";
        modalRoot.style.borderRadius = "0";
        modalRoot.style.margin = "0";
    } else {
        modalRoot.style.maxWidth = "94vw";
        modalRoot.style.maxHeight = "88vh";
    }
    modalRoot.setAttribute("role", "dialog");
    modalRoot.setAttribute("aria-modal", "true");
    if (!modalRoot.hasAttribute("aria-labelledby")) modalRoot.setAttribute("aria-label", args.title);
    const requestClose = () => {
        if (closed || closing || args.canClose?.() === false) return;
        closing = true;
        dialog.destroy();
    };
    const closeIcon = dialog.element.querySelector<SVGElement>(".b3-dialog__close");
    if (closeIcon) {
        closeIcon.setAttribute("role", "button");
        closeIcon.setAttribute("aria-label", args.closeLabel ?? args.title);
        closeIcon.setAttribute("tabindex", "0");
        closeIcon.addEventListener("click", (event) => {
            if (args.canClose?.() !== false) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
        closeIcon.addEventListener("keydown", (event) => {
            if (!(event instanceof KeyboardEvent) || event.isComposing || !isActivationKey(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            requestClose();
        });
    } else if (isMobileFrontend() || isFullscreen) {
        // 真机审计修复：手机端原生 Dialog 无关闭按钮，主动补齐可见 ✕ 关闭按钮
        const header = dialog.element.querySelector<HTMLElement>(".b3-dialog__header");
        if (header) {
            const mobileCloseBtn = document.createElement("button");
            mobileCloseBtn.type = "button";
            mobileCloseBtn.className = "b3-dialog__close glean-mobile-dialog-close";
            mobileCloseBtn.setAttribute("role", "button");
            mobileCloseBtn.setAttribute("aria-label", args.closeLabel ?? args.title);
            mobileCloseBtn.setAttribute("tabindex", "0");
            mobileCloseBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width: 20px; height: 20px;" aria-hidden="true"><use xlink:href="#iconGleanClose"></use></svg>`;
            mobileCloseBtn.style.minWidth = "44px";
            mobileCloseBtn.style.minHeight = "44px";
            mobileCloseBtn.style.display = "inline-flex";
            mobileCloseBtn.style.alignItems = "center";
            mobileCloseBtn.style.justifyContent = "center";
            mobileCloseBtn.style.background = "transparent";
            mobileCloseBtn.style.border = "none";
            mobileCloseBtn.style.color = "var(--b3-theme-on-surface)";
            mobileCloseBtn.style.cursor = "pointer";
            mobileCloseBtn.addEventListener("click", () => requestClose());
            header.appendChild(mobileCloseBtn);
        }
    }

    // 移动端/全屏弹层顶部下拉手势关闭
    if ((isMobileFrontend() || isFullscreen) && typeof dialog.element?.addEventListener === "function") {
        let touchStartY = 0;
        let touchStartX = 0;
        dialog.element.addEventListener("touchstart", (e: TouchEvent) => {
            const touch = e.touches[0];
            if (touch) {
                touchStartY = touch.clientY;
                touchStartX = touch.clientX;
            }
        }, { passive: true });
        dialog.element.addEventListener("touchend", (e: TouchEvent) => {
            const touch = e.changedTouches[0];
            if (touch) {
                const diffY = touch.clientY - touchStartY;
                const diffX = Math.abs(touch.clientX - touchStartX);
                if (diffY > 70 && diffY > diffX * 1.5 && touchStartY < 120) {
                    requestClose();
                }
            }
        }, { passive: true });
    }

    disposeViewport = installMobileViewportVars(dialog.element, isMobileFrontend());
    mountPlatformDialogTitleWrap(dialog.element, args.title);
    dialog.element.querySelector(".dialog-content")?.appendChild(args.ele);
    disposeFocus = installModalFocus(modalRoot, { onClose: requestClose, returnFocus: previousFocus });
    return {
        dialog,
        close: requestClose
    };
};

export const svelteDialog = (args: {
    title: string,
    closeLabel?: string,
    component: Component<any>, // Svelte 5 component constructor
    props?: Record<string, any>,
    width?: string,
    height?: string,
    /** 附加到挂载容器的类（如工作台宽画布 glean-tab-root） */
    containerClass?: string,
    callback?: () => void;
}) => {
    let container = document.createElement("div");
    container.className = ["glean-dialog-root", args.containerClass ?? ""].filter(Boolean).join(" ");
    container.style.display = "contents";

    let closeDialog: (() => void) | undefined;
    let closeGuard: (() => boolean) | undefined;
    let componentInstance = mount(args.component, {
        target: container,
        props: {
            ...args.props,
            onClose: () => closeDialog?.(),
            registerCloseGuard: (guard: () => boolean) => {
                closeGuard = guard;
                return () => {
                    if (closeGuard === guard) closeGuard = undefined;
                };
            },
        }
    });

    const { dialog, close } = simpleDialog({
        ...args,
        canClose: () => closeGuard?.() ?? true,
        ele: container,
        callback: () => {
            unmount(componentInstance);
            if (args.callback) args.callback();
        }
    });

    closeDialog = close;

    return {
        component: componentInstance,
        dialog,
        close
    };
};
