import * as world from "engine/world";
import { motion, type Palette, palettes, radius } from "@/styles/tokens.ts";

export type Themed = { id: string; themes: { brand: string; fonts: readonly string[]; ease: string }; reach: { surfaces: readonly { id: string; themes: { brand?: unknown } }[] } };

function colors ( palette: Palette ): Record<string, string> {

    return Object.fromEntries(Object.entries(palette).filter(([key]) => key !== "shadow").map(([key, value]) => [`color-${key}`, value]));

}

export function sheet ( { id, themes, reach }: Themed ): string {

    const tones = palettes(themes.brand);
    const base = {
        ...colors(tones.light),
        "shadow-raised": tones.light.shadow,
        "radius-md": `${radius.md / 16}rem`,
        "radius-lg": `${radius.lg / 16}rem`,
        "font-sans": `${themes.fonts.map(( font ) => JSON.stringify(font)).join(", ")}, ui-sans-serif, system-ui, sans-serif`,
        "ease-standard": themes.ease,
    };
    const others = reach.surfaces.filter(( surface ) => surface.id !== id && typeof surface.themes.brand === "string").map(( surface ) => {

        const found = palettes(String(surface.themes.brand));

        return world.css({ base: { ...colors(found.light), "shadow-raised": found.light.shadow }, dark: { ...colors(found.dark), "shadow-raised": found.dark.shadow }, selector: `:root[data-surface=${JSON.stringify(surface.id)}]` });

    });

    return [
        world.css({ base, selector: "@theme" }),
        world.css({ base: { "motion-fast": `${motion.fast}ms`, "motion-base": `${motion.base}ms` }, dark: { ...colors(tones.dark), "shadow-raised": tones.dark.shadow } }),
        ...others,
        world.block("@media (prefers-reduced-motion: reduce)", [world.block(":root", ["--motion-fast: 0ms;", "--motion-base: 0ms;"], "        ").replace(/\n\}$/, "\n    }")]),
        "",
    ].join("\n");

}
