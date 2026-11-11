import * as world from "engine/world";
import type { HeadingProps } from "@/elements/contract.ts";

const look = world.variants({
    base: "m-0 text-balance",
    axes: {
        look: {
            display: "text-4xl font-semibold leading-tight tracking-tight text-ink",
            title: "text-2xl font-semibold leading-snug text-ink",
            section: "text-lg font-semibold leading-normal text-ink",
            eyebrow: "text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted",
        },
    },
    defaults: { look: "title" },
});

export function Heading ({ children, level = 2, look: given, id }: HeadingProps ) {

    const Tag = `h${level}` as const;
    const chosen = given ?? (level === 1 ? "display" : level === 2 ? "title" : "section");

    return (
        <Tag id={id} data-ui="heading" {...world.states({ look: chosen })} className={look({ look: chosen })}>
            {children}
        </Tag>
    );

}
