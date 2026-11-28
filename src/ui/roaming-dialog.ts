import { svelteDialog } from "../libs/dialog.ts";
import { createDialogSingleton } from "../libs/dialog-singleton.ts";
import { t } from "../libs/i18n.ts";
import type { GleanFacade } from "../types.ts";
import RoamingDrawerDialog from "./RoamingDrawerDialog.svelte";
import type { RoamingPick } from "../domain/roaming.ts";

const openRoamingSingleton = createDialogSingleton(
    (
        args: { facade: GleanFacade; pick: RoamingPick; onOpenArticle: (id: string, readPoint?: string) => void },
        onClose: () => void,
    ) => svelteDialog({
        title: t(args.facade.i18n, "roaming.dialogTitle"),
        closeLabel: t(args.facade.i18n, "action.close"),
        component: RoamingDrawerDialog,
        props: { facade: args.facade, initialPick: args.pick, onOpenArticle: args.onOpenArticle },
        width: "min(540px, 92vw)",
        height: "auto",
        callback: onClose,
    }),
);

export function openRoamingDialog(
    facade: GleanFacade,
    pick: RoamingPick,
    onOpenArticle: (id: string, readPoint?: string) => void,
): void {
    openRoamingSingleton({ facade, pick, onOpenArticle });
}
