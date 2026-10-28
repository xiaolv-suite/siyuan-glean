import { svelteDialog } from "../libs/dialog.ts";
import { t } from "../libs/i18n.ts";
import type { GleanFacade } from "../types.ts";
import RoamingDrawerDialog from "./RoamingDrawerDialog.svelte";
import type { RoamingPick } from "../domain/roaming.ts";

export function openRoamingDialog(
    facade: GleanFacade,
    pick: RoamingPick,
    onOpenArticle: (id: string, readPoint?: string) => void,
): void {
    svelteDialog({
        title: t(facade.i18n, "roaming.dialogTitle"),
        closeLabel: t(facade.i18n, "action.close"),
        component: RoamingDrawerDialog,
        props: { facade, initialPick: pick, onOpenArticle },
        width: "min(540px, 92vw)",
        height: "auto",
    });
}
