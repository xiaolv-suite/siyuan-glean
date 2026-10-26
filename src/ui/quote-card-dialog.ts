import { svelteDialog } from "../libs/dialog";
import { t } from "../libs/i18n";
import type { GleanFacade } from "../types";
import QuoteCardDialog from "./QuoteCardDialog.svelte";
import type { QuoteCardSource } from "../domain/quote-card";

export function openQuoteCardDialog(facade: GleanFacade, source: QuoteCardSource): void {
    if (!source.quote.trim()) return;
    svelteDialog({
        title: t(facade.i18n, "quoteCard.title"),
        closeLabel: t(facade.i18n, "action.close"),
        component: QuoteCardDialog,
        props: { facade, source },
        width: "min(680px, 94vw)",
        height: "min(720px, 88vh)",
    });
}
