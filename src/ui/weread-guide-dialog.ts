import { svelteDialog } from "../libs/dialog.ts";
import { t } from "../libs/i18n.ts";
import type { GleanFacade } from "../types.ts";
import WeReadGuideDialog from "./WeReadGuideDialog.svelte";

export interface WeReadGuideArticleInfo {
    id?: string | null;
    title?: string;
    url?: string;
    author?: string;
}

export function openWeReadGuideDialog(
    facade: GleanFacade,
    article: WeReadGuideArticleInfo,
): void {
    svelteDialog({
        title: t(facade.i18n, "wechat.wereadGuideTitle"),
        closeLabel: t(facade.i18n, "action.close"),
        component: WeReadGuideDialog,
        props: { facade, article },
        width: "min(640px, 92vw)",
        height: "auto",
    });
}
