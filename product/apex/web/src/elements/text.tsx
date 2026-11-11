import * as world from "engine/world";
import type { TextProps } from "@/elements/contract.ts";

const look = world.variants({
    base: "m-0 text-pretty",
    axes: {
        tone: { default: "text-ink", muted: "text-ink-muted", danger: "text-danger", success: "text-success" },
        size: { sm: "text-sm leading-6", md: "text-base leading-7", lg: "text-lg leading-7" },
        weight: { regular: "font-normal", medium: "font-medium", bold: "font-semibold" },
    },
    defaults: { tone: "default", size: "md", weight: "regular" },
});

export function Text ({ children, tone = "default", size = "md", weight = "regular", live }: TextProps ) {

    return (
        <p aria-live={live} data-ui="text" {...world.states({ tone, size, weight })} className={look({ tone, size, weight })}>
            {children}
        </p>
    );

}
