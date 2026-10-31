import { svelteDialog } from "../libs/dialog.ts";
import { createDialogSingleton } from "../libs/dialog-singleton.ts";
import { t } from "../libs/i18n.ts";
import type { GleanFacade } from "../types.ts";
import DocSlicingDialog from "./DocSlicingDialog.svelte";
import type { OutlineItem } from "../domain/outline.ts";
import type { ReadingClipContext } from "../services/clip-store.ts";

const openDocSlicingSingleton = createDialogSingleton(
    (
        args: { facade: GleanFacade; context: ReadingClipContext; outline: readonly OutlineItem[]; onJumpToBlock?: (blockId: string) => void },
        onClose: () => void,
    ) => svelteDialog({
        title: t(args.facade.i18n, "docSlicing.title"),
        closeLabel: t(args.facade.i18n, "action.close"),
        component: DocSlicingDialog,
        props: { facade: args.facade, context: args.context, outline: args.outline, onJumpToBlock: args.onJumpToBlock },
        width: "min(720px, 94vw)",
        height: "min(680px, 86vh)",
        callback: onClose,
    }),
);

export function openDocSlicingDialog(
    facade: GleanFacade,
    context: ReadingClipContext,
    outline: readonly OutlineItem[],
    onJumpToBlock?: (blockId: string) => void,
): void {
    openDocSlicingSingleton({ facade, context, outline, onJumpToBlock });
}
