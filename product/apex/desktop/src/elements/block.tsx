import * as world from "engine/world";
import type { BlockProps } from "@/elements/contract.ts";

const look = world.variants({
    base: "flex min-w-0",
    axes: {
        direction: { row: "flex-row", column: "flex-col" },
        gap: { none: "gap-0", xs: "gap-1", sm: "gap-2", md: "gap-4", lg: "gap-6", xl: "gap-10" },
        align: { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" },
        justify: { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" },
        padding: { none: "p-0", xs: "p-2", sm: "p-3", md: "p-5", lg: "p-8", xl: "p-12" },
        surface: { plain: "", raised: "rounded-[var(--radius-lg)] border border-line bg-surface-raised shadow-[var(--shadow-raised)]" },
        width: { auto: "", full: "w-full", reading: "w-full max-w-[42rem] self-center" },
        height: { auto: "", screen: "grow" },
        wrap: { yes: "flex-wrap", no: "flex-nowrap" },
    },
    defaults: { direction: "column", gap: "md", padding: "none", surface: "plain", width: "auto", height: "auto", wrap: "no" },
});

export function Block ( props: BlockProps ) {

    const Tag = props.as ?? "div";
    const { direction = "column", gap = "md", padding = "none", surface = "plain", width = "auto", height = "auto" } = props;

    return (
        <Tag
            id={props.id}
            aria-label={props.label}
            aria-labelledby={props.labelledBy}
            aria-live={props.live}
            aria-busy={props.busy || undefined}
            data-ui="block"
            {...world.states({ direction, gap, align: props.align, justify: props.justify, padding, surface, width, height, wrap: props.wrap })}
            className={look({ direction, gap, align: props.align, justify: props.justify, padding, surface, width, height, wrap: props.wrap ? "yes" : "no" })}
        >
            {props.children}
        </Tag>
    );

}
