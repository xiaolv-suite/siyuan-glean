import { svelteDialog } from "../libs/dialog";
import { createDialogSingleton } from "../libs/dialog-singleton";
import { t } from "../libs/i18n";
import type { GleanFacade } from "../types";
import FormattingDialog from "./FormattingDialog.svelte";

const openFormattingSingleton = createDialogSingleton(
    (args: { facade: GleanFacade; docId: string }, onClose: () => void) => svelteDialog({
        title: t(args.facade.i18n, "formatting.title"),
        closeLabel: t(args.facade.i18n, "action.close"),
        component: FormattingDialog,
        props: { facade: args.facade, docId: args.docId },
        width: "min(960px, 94vw)",
        height: "min(850px, 88vh)",
        callback: onClose,
    }),
);

export function openFormattingDialog(facade: GleanFacade, docId: string): void {
    if (!docId) return;
    openFormattingSingleton({ facade, docId });
}
