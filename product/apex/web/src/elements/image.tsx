import * as world from "engine/world";
import type { ImageProps } from "@/elements/contract.ts";

const framed = "border border-line bg-surface-sunken object-cover";
const look = world.variants({
    base: "block",
    axes: { ratio: { wide: `${framed} aspect-[2/1] w-full rounded-[var(--radius-md)]`, square: `${framed} aspect-square w-full rounded-[var(--radius-md)]`, avatar: `${framed} size-14 shrink-0 rounded-full`, mark: "h-8 w-auto shrink-0 object-contain" } },
    defaults: { ratio: "wide" },
});

export function Image ({ src, alt, ratio = "wide" }: ImageProps ) {

    return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" data-ui="image" {...world.states({ ratio })} className={look({ ratio })} />;

}
