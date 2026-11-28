/**
 * IGleanContext 窄契约接口（S2 切片）：
 * 抽象轻量上下文契约，解耦对 LvGleanPlugin 上帝类全量透传的强依赖，向视图与子系统暴露最小必需能力。
 */
import type { App } from "siyuan";
import type { GleanSettings } from "../services/settings";
import type { I18nBundle } from "../libs/i18n";
import type { IDisposerRegistry } from "./disposer";

export interface IGleanContext {
    readonly app: App | unknown;
    readonly i18n: I18nBundle;
    readonly isMobile: boolean;
    readonly settings: Readonly<GleanSettings>;
    readonly disposer?: IDisposerRegistry;
    hasClipDocId(docId: string): boolean;
    openReadingDocument(docId: string, focusBlockId?: string): void;
    openPanel(targetView?: string): void;
}

export interface GleanContextOptions {
    app?: unknown;
    i18n: I18nBundle;
    isMobile: boolean;
    settings: Readonly<GleanSettings>;
    disposer?: IDisposerRegistry;
    hasClipDocId: (docId: string) => boolean;
    openReadingDocument: (docId: string, focusBlockId?: string) => void;
    openPanel: (targetView?: string) => void;
}

/** 创建只读纯对象形态的 IGleanContext */
export function createGleanContext(options: GleanContextOptions): IGleanContext {
    return {
        app: options.app,
        i18n: options.i18n,
        isMobile: options.isMobile,
        get settings() {
            return options.settings;
        },
        disposer: options.disposer,
        hasClipDocId: (docId: string) => options.hasClipDocId(docId),
        openReadingDocument: (docId: string, focusBlockId?: string) => options.openReadingDocument(docId, focusBlockId),
        openPanel: (targetView?: string) => options.openPanel(targetView),
    };
}
