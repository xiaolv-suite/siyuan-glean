import { svelteDialog } from "../libs/dialog.ts";
import { createDialogSingleton } from "../libs/dialog-singleton.ts";
import { t } from "../libs/i18n.ts";
import type { GleanFacade } from "../types.ts";
import WeReadGuideDialog from "./WeReadGuideDialog.svelte";

export interface WeReadGuideArticleInfo {
    id?: string | null;
    title?: string;
    url?: string;
    author?: string;
}

const openWeReadGuideSingleton = createDialogSingleton(
    (args: { facade: GleanFacade; article: WeReadGuideArticleInfo }, onClose: () => void) => svelteDialog({
        title: t(args.facade.i18n, "wechat.wereadGuideTitle"),
        closeLabel: t(args.facade.i18n, "action.close"),
        component: WeReadGuideDialog,
        props: { facade: args.facade, article: args.article },
        width: "min(640px, 92vw)",
        height: "auto",
        callback: onClose,
    }),
);

export function openWeReadGuideDialog(
    facade: GleanFacade,
    article: WeReadGuideArticleInfo,
): void {
    openWeReadGuideSingleton({ facade, article });
}
