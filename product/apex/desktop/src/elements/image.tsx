import * as world from "engine/world";
import type { ImageProps } from "@/elements/contract.ts";

const look = world.variants({
    base: "block border border-line bg-surface-sunken object-cover",
    axes: { ratio: { wide: "aspect-[2/1] w-full rounded-[var(--radius-md)]", square: "aspect-square w-full rounded-[var(--radius-md)]", avatar: "size-14 shrink-0 rounded-full" } },
    defaults: { ratio: "wide" },
});

export function Image ({ src, alt, ratio = "wide" }: ImageProps ) {

    return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" data-ui="image" {...world.states({ ratio })} className={look({ ratio })} />;

}
