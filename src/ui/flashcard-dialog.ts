import { svelteDialog } from "../libs/dialog";
import { createDialogSingleton } from "../libs/dialog-singleton";
import { t } from "../libs/i18n";
import type { FlashcardSource } from "../domain/flashcard";
import type { GleanFacade } from "../types";
import FlashcardDialog from "./FlashcardDialog.svelte";

const openFlashcardSingleton = createDialogSingleton(
    (args: { facade: GleanFacade; source: FlashcardSource }, onClose: () => void) => svelteDialog({
        title: t(args.facade.i18n, "flashcard.previewTitle"),
        closeLabel: t(args.facade.i18n, "action.close"),
        component: FlashcardDialog,
        props: { facade: args.facade, source: args.source },
        width: "min(820px, 94vw)",
        height: "min(820px, 88vh)",
        callback: onClose,
    }),
);

export function makeQuoteCardPreview(facade: GleanFacade, source: FlashcardSource): void {
    if (!source.quote.trim()) return;
    openFlashcardSingleton({ facade, source });
}
