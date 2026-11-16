import * as world from "engine/world";
import { motion, type Palette, palettes, radius } from "./tokens.ts";

export type Themed = { themes: { brand: string; fonts: readonly string[]; ease: string } };

export function sheet ( { themes }: Themed ): string {

    const tones = palettes(themes.brand);
    const colors = ( palette: Palette ): Record<string, string> => Object.fromEntries(Object.entries(palette).filter(([key]) => key !== "shadow").map(([key, value]) => [`color-${key}`, value]));
    const base = {
        ...colors(tones.light),
        "shadow-raised": tones.light.shadow,
        "radius-md": `${radius.md / 16}rem`,
        "radius-lg": `${radius.lg / 16}rem`,
        "font-sans": `${themes.fonts.map(( font ) => JSON.stringify(font)).join(", ")}, ui-sans-serif, system-ui, sans-serif`,
        "ease-standard": themes.ease,
    };

    return [
        world.css({ base, selector: "@theme" }),
        world.css({ base: { "motion-fast": `${motion.fast}ms` }, dark: { ...colors(tones.dark), "shadow-raised": tones.dark.shadow } }),
        world.block("@media (prefers-reduced-motion: reduce)", [world.block(":root", ["--motion-fast: 0ms;"], "        ").replace(/\n\}$/, "\n    }")]),
        "",
    ].join("\n");

}
