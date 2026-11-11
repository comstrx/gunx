import * as world from "engine/world";
import type { SkeletonProps } from "@/elements/contract.ts";

const look = world.variants({
    base: "animate-pulse rounded-[var(--radius-md)] bg-surface-sunken motion-reduce:animate-none",
    axes: {
        size: { text: "h-4", title: "h-7", display: "h-11" },
        width: { third: "w-1/3", half: "w-1/2", most: "w-2/3", full: "w-full" },
    },
    defaults: { size: "text", width: "full" },
});

export function Skeleton ({ size = "text", width = "full" }: SkeletonProps ) {

    return <div aria-hidden="true" data-ui="skeleton" {...world.states({ size, width })} className={look({ size, width })} />;

}
