import { svelteDialog } from "../libs/dialog.ts";
import { t } from "../libs/i18n.ts";
import type { GleanFacade } from "../types.ts";
import DocSlicingDialog from "./DocSlicingDialog.svelte";
import type { OutlineItem } from "../domain/outline.ts";
import type { ReadingClipContext } from "../services/clip-store.ts";

export function openDocSlicingDialog(
    facade: GleanFacade,
    context: ReadingClipContext,
    outline: readonly OutlineItem[],
    onJumpToBlock?: (blockId: string) => void,
): void {
    svelteDialog({
        title: t(facade.i18n, "docSlicing.title"),
        closeLabel: t(facade.i18n, "action.close"),
        component: DocSlicingDialog,
        props: { facade, context, outline, onJumpToBlock },
        width: "min(720px, 94vw)",
        height: "min(680px, 86vh)",
    });
}
