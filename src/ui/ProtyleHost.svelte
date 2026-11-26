<script module lang="ts">
    let protyleStatusCounter = 0;
</script>

<script lang="ts">
    import { Protyle } from "siyuan";
    import type { App } from "siyuan";
    import { tick, untrack } from "svelte";
    import { t } from "../libs/i18n";
    import { createProtyleController, type ProtyleController, type ProtyleMode } from "../libs/protyle-controller";
    import { refreshWhaleDecorationsInProtyle, waitForWysiwygReady } from "../services/siyuan-comment-bridge";

    interface Props {
        app: App;
        docId: string;
        mode: ProtyleMode;
        i18n: Record<string, string>;
        host?: HTMLDivElement | null;
        controller?: ProtyleController | null;
        protyleInstance?: unknown;
        stage?: "loading" | "ready" | "failed";
        className?: string;
        onOpenDocument: () => void;
    }

    let { app, docId, mode, i18n, host = $bindable(null), controller = $bindable(null), protyleInstance = $bindable(null), stage = $bindable<"loading" | "ready" | "failed">("loading"), className = "", onOpenDocument }: Props = $props();
    let attempt = $state(0);
    let retryButton = $state<HTMLButtonElement | null>(null);
    let hostHadFocus = false;
    let hostFocusOrigin: Element | null = null;
    const statusLabelId = `glean-protyle-status-label-${++protyleStatusCounter}`;

    function patchWechatImages(root: HTMLElement): void {
        try {
            const images = root.querySelectorAll<HTMLImageElement>("img[src*='qpic.cn']");
            for (const img of images) {
                if (img.referrerPolicy !== "no-referrer") {
                    img.referrerPolicy = "no-referrer";
                }
            }
        } catch {
            // ignore
        }
    }

    $effect(() => {
        const element = host;
        void docId;
        if (!element) return;
        hostHadFocus = false;
        hostFocusOrigin = null;
        const owner = element.ownerDocument;
        const onFocusIn = () => { hostHadFocus = true; hostFocusOrigin = owner.activeElement; };
        const onDocumentFocus = (event: FocusEvent) => {
            if (event.target instanceof Node && element.contains(event.target)) return;
            hostHadFocus = false;
            hostFocusOrigin = null;
        };
        element.addEventListener("focusin", onFocusIn);
        owner.addEventListener("focusin", onDocumentFocus);
        return () => {
            element.removeEventListener("focusin", onFocusIn);
            owner.removeEventListener("focusin", onDocumentFocus);
        };
    });

    $effect(() => {
        if (stage !== "failed" || !retryButton || !hostHadFocus) return;
        const element = host;
        const origin = hostFocusOrigin;
        const target = retryButton;
        let active = true;
        void tick().then(() => {
            if (!active || host !== element || retryButton !== target || !target.isConnected) return;
            const owner = element?.ownerDocument;
            const focused = owner?.activeElement;
            const retainedFocus = origin && (focused === origin || (!origin.isConnected && (!focused || focused === owner?.body || !focused.isConnected)));
            if (stage === "failed" && hostHadFocus && retainedFocus) target.focus();
        });
        return () => { active = false; };
    });

    function hasRenderedBodyContent(element: HTMLElement, currentMode: ProtyleMode): boolean {
        if (currentMode === "wysiwyg") {
            return Boolean(element.querySelector(".protyle-wysiwyg:not(.fn__none) [data-node-id]"));
        }
        const preview = element.querySelector<HTMLElement>(".protyle-preview:not(.fn__none)");
        if (!preview) return false;
        return Boolean(
            preview.querySelector('.b3-typography [id], .b3-typography > *, [data-node-id]:not([data-type="NodeDocument"])')
        );
    }

    $effect(() => {
        const element = host;
        const id = docId;
        void attempt;
        if (!element || !id) return;
        let active = true;
        let readyFallbackTimer: number | null = null;
        stage = "loading";
        const timeout = window.setTimeout(() => {
            if (active && stage === "loading") {
                stage = "failed";
                window.clearInterval(readyCheckTimer);
            }
        }, 15000);
        const markReady = () => {
            if (!active) return;
            window.clearTimeout(timeout);
            window.clearInterval(readyCheckTimer);
            if (readyFallbackTimer !== null) {
                window.clearTimeout(readyFallbackTimer);
                readyFallbackTimer = null;
            }
            stage = "ready";
            try {
                patchWechatImages(element);
            } catch {}
        };
        // 关键自愈守卫：仅在对应视图的实际正文节点（preview 内容节点或 wysiwyg 块）挂载后才置为 ready
        const readyCheckTimer = window.setInterval(() => {
            if (!active) {
                window.clearInterval(readyCheckTimer);
                return;
            }
            if (stage === "loading" && hasRenderedBodyContent(element, untrack(() => mode))) {
                markReady();
            }
        }, 100);
        const current = createProtyleController({
            host: element,
            mode: untrack(() => mode),
            create: (mount, after) => new Protyle(app, mount, {
                blockId: id, rootId: id, mode: untrack(() => mode),
                render: { breadcrumb: false, background: false, title: false },
                after,
            }),
            observe: (target, resize) => {
                if (typeof ResizeObserver === "undefined") return () => {};
                const observer = new ResizeObserver(resize);
                observer.observe(target);
                return () => observer.disconnect();
            },
            onReady: (inst) => {
                if (active) {
                    protyleInstance = inst ?? current.getInstance?.() ?? null;
                    refreshWhaleDecorationsInProtyle(app, id);
                    if (hasRenderedBodyContent(element, untrack(() => mode))) {
                        markReady();
                    } else if (readyFallbackTimer === null) {
                        // 空文档保底：若 after 触发后 1.2s 内仍无内容节点（如空文），允许进入 ready
                        readyFallbackTimer = window.setTimeout(() => {
                            if (active && stage === "loading") {
                                markReady();
                            }
                        }, 1200);
                    }
                }
            },
            onError: (error) => {
                console.debug("[glean] Protyle lifecycle failed:", error);
                if (active) {
                    window.clearTimeout(timeout);
                    window.clearInterval(readyCheckTimer);
                    if (readyFallbackTimer !== null) {
                        window.clearTimeout(readyFallbackTimer);
                        readyFallbackTimer = null;
                    }
                    stage = "failed";
                }
            },
        });
        controller = current;
        protyleInstance = current.getInstance?.() ?? null;
        return () => {
            active = false;
            window.clearTimeout(timeout);
            window.clearInterval(readyCheckTimer);
            if (readyFallbackTimer !== null) {
                window.clearTimeout(readyFallbackTimer);
                readyFallbackTimer = null;
            }
            current.destroy();
            try { element?.replaceChildren?.(); } catch {}
            if (controller === current) controller = null;
            protyleInstance = null;
        };
    });

    $effect(() => {
        controller?.setMode(mode);
        if (mode === "wysiwyg" && docId) {
            let active = true;
            void waitForWysiwygReady(host, 1800).then((el) => {
                if (active && el) refreshWhaleDecorationsInProtyle(app, docId);
            });
            return () => { active = false; };
        }
    });
</script>

<div class="glean-protyle-shell glean-protyle-shell--{stage} {className}" aria-busy={stage === "loading"}>
    {#if stage !== "ready"}
        <div class="glean-protyle-status glean-protyle-status--{stage}" role="status" aria-live={stage === "failed" ? "assertive" : "polite"} aria-labelledby={statusLabelId}>
            {#if stage === "loading"}<span class="glean-protyle-status__dot" aria-hidden="true"></span>{/if}
            <span id={statusLabelId} class="glean-protyle-status__label">{t(i18n, stage === "loading" ? "panel.loading" : "preview.failed")}</span>
            {#if stage === "failed"}
                <button class="glean-btn" bind:this={retryButton} onclick={() => attempt += 1}>{t(i18n, "action.retry")}</button>
                <button class="glean-btn glean-btn--ghost" onclick={onOpenDocument}>{t(i18n, "preview.openDocument")}</button>
            {/if}
        </div>
    {/if}
    <div class="glean-protyle-host" bind:this={host}></div>
</div>
