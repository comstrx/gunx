import * as world from "engine/world";
import { type MouseEvent, useCallback } from "react";
import type { LinkProps } from "@/elements/contract.ts";

const look = world.variants({
    base: "inline-flex items-center rounded-[var(--radius-md)] font-medium no-underline transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    axes: {
        look: { text: "text-brand-strong underline-offset-4 hover:underline", button: "h-11 px-4 text-sm text-brand-strong hover:bg-brand-soft", solid: "h-11 px-4 text-sm bg-brand text-on-brand hover:bg-brand-strong" },
        current: { yes: "bg-brand-soft text-brand-strong", no: "" },
    },
    defaults: { look: "text", current: "no" },
});

export function Link ({ children, href, external = false, look: chosen = "text", current = false, onNavigate }: LinkProps ) {

    const click = useCallback(( event: MouseEvent<HTMLAnchorElement> ) => {

        if ( !onNavigate || external || event.metaKey || event.ctrlKey || event.button !== 0 ) return;

        event.preventDefault();
        onNavigate(href);

    }, [onNavigate, external, href]);

    return (
        <a href={href} onClick={click} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} aria-current={current ? "page" : undefined} data-ui="link" {...world.states({ look: chosen, external, current })} className={look({ look: chosen, current: current ? "yes" : "no" })}>
            {children}
        </a>
    );

}
