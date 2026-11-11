import * as world from "engine/world";
import type { ButtonProps } from "@/elements/contract.ts";

const look = world.variants({
    base: "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50",
    axes: {
        look: {
            solid: "bg-brand text-on-brand hover:bg-brand-strong",
            soft: "bg-brand-soft text-brand-strong hover:bg-brand-soft-strong",
            ghost: "bg-transparent text-ink hover:bg-surface-sunken",
            danger: "bg-danger text-on-brand hover:bg-danger-strong",
        },
        size: { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-sm", lg: "h-12 px-6 text-base" },
        width: { auto: "", full: "w-full" },
    },
    defaults: { look: "solid", size: "md", width: "auto" },
});

export function Button ( props: ButtonProps ) {

    const { look: chosen = "solid", size = "md", width = "auto", pending = false, disabled = false } = props;
    const off = disabled || pending;

    return (
        <button
            type={props.type ?? "button"}
            aria-label={props.label}
            aria-busy={pending || undefined}
            disabled={off}
            onClick={props.onPress}
            data-ui="button"
            {...world.states({ look: chosen, size, width, pending })}
            className={look({ look: chosen, size, width })}
        >
            {pending ? <span aria-hidden="true" data-ui="spinner" className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
            {props.children !== undefined ? <span>{props.children}</span> : null}
        </button>
    );

}
