import { type SyntheticEvent, useCallback, useEffect, useRef } from "react";
import type { DialogProps } from "@/elements/contract.ts";

const look = [
    "m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-line bg-surface-raised p-0 text-ink shadow-[var(--shadow-raised)] outline-none",
    "open:transition-[opacity,translate] open:duration-[var(--motion-fast)] open:ease-[var(--ease-standard)] starting:open:translate-y-2 starting:open:opacity-0",
    "backdrop:bg-scrim open:backdrop:transition-opacity open:backdrop:duration-[var(--motion-fast)] starting:open:backdrop:opacity-0",
].join(" ");

export function Dialog ({ children, open, kind = "plain", label, labelledBy, onDismiss }: DialogProps ) {

    const node = useRef<HTMLDialogElement>(null);
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

    return (
        <dialog ref={node} role={kind === "alert" ? "alertdialog" : undefined} aria-label={label} aria-labelledby={labelledBy} onCancel={dismiss} data-ui="dialog" data-kind={kind} className={look}>
            {open ? children : null}
        </dialog>
    );

}
