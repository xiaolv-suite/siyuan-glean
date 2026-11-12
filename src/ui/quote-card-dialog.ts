import { svelteDialog } from "../libs/dialog";
import { createDialogSingleton } from "../libs/dialog-singleton";
import { t } from "../libs/i18n";
import type { GleanFacade } from "../types";
import QuoteCardDialog from "./QuoteCardDialog.svelte";
import type { QuoteCardSource } from "../domain/quote-card";

const openQuoteCardSingleton = createDialogSingleton(
    (args: { facade: GleanFacade; source: QuoteCardSource }, onClose: () => void) => svelteDialog({
        title: t(args.facade.i18n, "quoteCard.title"),
        closeLabel: t(args.facade.i18n, "action.close"),
        component: QuoteCardDialog,
        props: { facade: args.facade, source: args.source },
        width: "min(680px, 94vw)",
        height: "min(720px, 88vh)",
        callback: onClose,
    }),
);

export function openQuoteCardDialog(facade: GleanFacade, source: QuoteCardSource): void {
    if (!source.quote.trim()) return;
    openQuoteCardSingleton({ facade, source });
}
