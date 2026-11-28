type DialogHandle = {
    dialog: { element: HTMLElement; destroy?: () => void };
    close?: () => void;
};

export interface DialogSingleton<Args, Handle extends DialogHandle> {
    (args: Args): Handle;
    close(): void;
    getActive(): Handle | null;
    isOpen(): boolean;
}

/** Keep one live dialog per opener and release it only when that exact dialog closes. */
export function createDialogSingleton<Args, Handle extends DialogHandle>(
    create: (args: Args, onClose: () => void) => Handle,
): DialogSingleton<Args, Handle> {
    let active: Handle | null = null;

    const fn = ((args: Args) => {
        if (active?.dialog.element.isConnected) {
            active.dialog.element.querySelector<HTMLElement>(".b3-dialog__container")?.focus({ preventScroll: true });
            return active;
        }

        active = null;
        let created!: Handle;
        let closedDuringCreation = false;
        created = create(args, () => {
            closedDuringCreation = true;
            if (active === created) active = null;
        });
        if (!closedDuringCreation) active = created;
        return created;
    }) as DialogSingleton<Args, Handle>;

    fn.close = () => {
        if (active?.dialog.element.isConnected) {
            try {
                if (typeof active.close === "function") {
                    active.close();
                } else if (typeof active.dialog.destroy === "function") {
                    active.dialog.destroy();
                }
            } catch {
                /* soft close */
            }
        }
        active = null;
    };

    fn.getActive = () => (active?.dialog.element.isConnected ? active : null);
    fn.isOpen = () => Boolean(active?.dialog.element.isConnected);

    return fn;
}
