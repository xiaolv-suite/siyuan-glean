/**
 * 原生阅读上下文协调器（S7 切片）：
 * 将原生思源编辑器的阅读上下文挂载、编辑器事件监听与弱引用自愈清理逻辑统一收拢。
 * 支持传入 DisposerRegistry 统一级联卸载，杜绝多窗口事件冲突与 DOM 悬挂。
 */
import { getAllEditor, type IProtyle } from "siyuan";
import { mount, unmount } from "svelte";
import type { GleanFacade } from "../types.ts";
import type { IDisposerRegistry } from "../core/disposer.ts";
import ReadingContext from "../ui/ReadingContext.svelte";

export interface MountedContext {
    docId: string;
    target: HTMLElement;
    instance: ReturnType<typeof mount>;
}

export interface ReadingContextCoordinatorOptions {
    facade: GleanFacade;
    disposer?: IDisposerRegistry;
}

export class ReadingContextCoordinator {
    private readonly facade: GleanFacade;
    private readonly mounted = new Map<HTMLElement, MountedContext>();
    private activeElement: HTMLElement | null = null;
    private activeDocId = "";
    private isDisposed = false;

    private readonly onLoaded = (event: CustomEvent<{ protyle: IProtyle }>) => {
        if (!this.isDisposed && event?.detail?.protyle) this.attach(event.detail.protyle);
    };

    private readonly onSwitched = (event: CustomEvent<{ protyle: IProtyle }>) => {
        if (this.isDisposed) return;
        const protyle = event?.detail?.protyle;
        if (!protyle) return;
        const element = protyle?.element;
        const previous = element instanceof HTMLElement ? this.mounted.get(element) : undefined;
        this.attach(protyle);
        if (!(element instanceof HTMLElement)) return;
        const current = this.mounted.get(element);
        if (!current) {
            this.activeElement = null;
            this.activeDocId = "";
            return;
        }
        const changed = this.activeElement !== element || this.activeDocId !== current.docId;
        this.activeElement = element;
        this.activeDocId = current.docId;
        if (changed && previous === current) {
            document.dispatchEvent(new CustomEvent("glean:reading-context-refresh", { detail: { id: current.docId } }));
        }
    };

    private readonly onDestroyed = (event: CustomEvent<{ protyle: IProtyle }>) => {
        const element = event.detail?.protyle?.element;
        if (element instanceof HTMLElement) this.detach(element);
    };

    private readonly onDataChanged = () => {
        if (this.isDisposed) return;
        for (const editor of getAllEditor()) {
            if (editor?.protyle) this.attach(editor.protyle);
        }
    };

    constructor(options: ReadingContextCoordinatorOptions) {
        this.facade = options.facade;
        this.install();

        if (options.disposer) {
            options.disposer.add(() => this.dispose());
        }
    }

    private install(): void {
        const bus = this.facade.pluginInstance.eventBus;
        bus.on("loaded-protyle-static", this.onLoaded);
        bus.on("loaded-protyle-dynamic", this.onLoaded);
        bus.on("switch-protyle", this.onSwitched);
        bus.on("destroy-protyle", this.onDestroyed);

        if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
            document.addEventListener("glean:data-changed", this.onDataChanged);
        }

        for (const editor of getAllEditor()) {
            if (editor?.protyle) this.attach(editor.protyle);
        }
    }

    detach(element: HTMLElement): void {
        if (!element) return;
        if (this.activeElement === element) {
            this.activeElement = null;
            this.activeDocId = "";
        }
        element.classList?.remove?.("glean-protyle--reader-context", "glean-protyle--has-context");
        const previous = this.mounted.get(element);
        if (!previous) return;
        this.mounted.delete(element);
        void unmount(previous.instance);
        previous.target?.remove?.();
    }

    attach(protyle: IProtyle): void {
        if (this.isDisposed) return;
        const element = protyle?.element;
        if (!(element instanceof HTMLElement)) return;
        if (element.closest(".glean-protyle-host")) {
            this.detach(element);
            return;
        }
        const docId = protyle.block?.rootID ?? "";
        const previous = this.mounted.get(element);
        if (previous?.docId === docId && previous.target.isConnected) {
            if (typeof this.facade.hasClipDocId === "function" && !this.facade.hasClipDocId(docId)) {
                this.detach(element);
                return;
            }
            return;
        }
        this.detach(element);
        if (!docId) return;

        if (typeof this.facade.hasClipDocId === "function" && !this.facade.hasClipDocId(docId)) {
            return;
        }

        element.classList?.add?.("glean-protyle--reader-context", "glean-protyle--has-context");
        const target = document.createElement("div");
        target.className = "glean-reading-context-host";
        element.prepend(target);
        const instance = mount(ReadingContext, { target, props: { facade: this.facade, docId } });
        this.mounted.set(element, { docId, target, instance });
    }

    dispose(): void {
        if (this.isDisposed) return;
        this.isDisposed = true;

        if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
            document.removeEventListener("glean:data-changed", this.onDataChanged);
        }
        const bus = this.facade.pluginInstance.eventBus;
        bus.off("loaded-protyle-static", this.onLoaded);
        bus.off("loaded-protyle-dynamic", this.onLoaded);
        bus.off("switch-protyle", this.onSwitched);
        bus.off("destroy-protyle", this.onDestroyed);

        for (const element of Array.from(this.mounted.keys())) {
            this.detach(element);
        }
        this.mounted.clear();
    }
}
