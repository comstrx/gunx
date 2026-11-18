import * as world from "engine/world";
import { type SyntheticEvent, useCallback, useEffect, useRef } from "react";
import type { DialogProps } from "@/elements/contract.ts";
import { useMotion } from "@/hooks/use-motion.ts";
import { usePresence } from "@/hooks/use-presence.ts";

const look = world.variants({
    base: [
        "m-auto rounded-[var(--radius-lg)] border border-line bg-surface-raised p-0 text-ink shadow-[var(--shadow-raised)] outline-none",
        "translate-y-2 opacity-0 transition-[opacity,translate,overlay,display] transition-discrete duration-[var(--motion-fast)] ease-[var(--ease-standard)] open:translate-y-0 open:opacity-100 starting:open:translate-y-2 starting:open:opacity-0",
        "backdrop:bg-scrim backdrop:opacity-0 backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-[var(--motion-fast)] open:backdrop:opacity-100 starting:open:backdrop:opacity-0",
    ].join(" "),
    axes: {
        size: {
            sm: "w-[min(28rem,calc(100vw-2rem))]",
            md: "w-[min(40rem,calc(100vw-2rem))]",
            lg: "w-[min(56rem,calc(100vw-2rem))]",
            full: "h-dvh max-h-none w-screen max-w-none rounded-none border-0",
        },
    },
    defaults: { size: "sm" },
});
const mark = "absolute end-3 top-3 inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] text-ink-muted outline-none transition-colors duration-[var(--motion-fast)] hover:bg-surface-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-brand";

export function Dialog ({ children, open, kind = "plain", size = "sm", label, labelledBy, closeLabel, onDismiss }: DialogProps ) {

    const node = useRef<HTMLDialogElement>(null);
    const motion = useMotion();
    const { mounted } = usePresence(open, motion.fast);
    const dismiss = useCallback(( event: SyntheticEvent ) => {

        event.preventDefault();
        onDismiss?.();

    }, [onDismiss]);

    useEffect(() => {

        const found = node.current;

        if ( !found || found.open === open ) return;
        if ( open ) found.showModal();
        else found.close();

    }, [open]);
    useEffect(() => {

        const found = node.current;

        if ( !found || kind !== "plain" || !onDismiss ) return undefined;

        const outside = ( event: MouseEvent ): void => {

            if ( event.target === found ) onDismiss();

        };

        found.addEventListener("click", outside);

        return () => found.removeEventListener("click", outside);

    }, [kind, onDismiss]);

    return (
        <dialog ref={node} role={kind === "alert" ? "alertdialog" : undefined} aria-label={label} aria-labelledby={labelledBy} onCancel={dismiss} data-ui="dialog" data-kind={kind} {...world.states({ size })} className={look({ size })}>
            {mounted && closeLabel ? <button type="button" aria-label={closeLabel} onClick={onDismiss} data-ui="dialog-close" className={mark}><span aria-hidden="true">×</span></button> : null}
            {mounted ? children : null}
        </dialog>
    );

}
