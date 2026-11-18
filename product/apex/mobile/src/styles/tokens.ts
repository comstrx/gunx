import * as spec from "engine/spec";

export type Palette = {
    brand: string;
    brandStrong: string;
    brandSoft: string;
    brandSoftStrong: string;
    onBrand: string;
    ink: string;
    inkMuted: string;
    surface: string;
    surfaceRaised: string;
    surfaceSunken: string;
    line: string;
    danger: string;
    dangerStrong: string;
    dangerSoft: string;
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    scrim: string;
    shade: string;
    shadow: string;
};
export type Palettes = { light: Palette; dark: Palette };

const neutral: Palettes = {
    light: {
        brand: "#2c46b6", brandStrong: "#1e3393", brandSoft: "#f1f5ff", brandSoftStrong: "#dae5ff", onBrand: "#ffffff",
        ink: "#1c1917", inkMuted: "#57534e", surface: "#fcfbfa", surfaceRaised: "#ffffff", surfaceSunken: "#f2efec", line: "#e7e3df",
        danger: "#b91c1c", dangerStrong: "#991b1b", dangerSoft: "#fef2f2", success: "#15803d", successSoft: "#f0fdf4", warning: "#a16207", warningSoft: "#fefce8",
        scrim: "rgba(28, 25, 23, 0.45)", shade: "rgba(28, 25, 23, 0.22)",
        shadow: "0 1px 2px rgb(28 25 23 / 0.05), 0 12px 32px -16px rgb(28 25 23 / 0.22)",
    },
    dark: {
        brand: "#5c7fec", brandStrong: "#80a1fd", brandSoft: "#040441", brandSoftStrong: "#070c50", onBrand: "#000000",
        ink: "#f5f3f1", inkMuted: "#a8a29e", surface: "#0f0d0c", surfaceRaised: "#1a1715", surfaceSunken: "#262220", line: "#2e2926",
        danger: "#f87171", dangerStrong: "#fca5a5", dangerSoft: "#2a1212", success: "#4ade80", successSoft: "#0f2416", warning: "#facc15", warningSoft: "#2a2208",
        scrim: "rgba(0, 0, 0, 0.62)", shade: "rgba(0, 0, 0, 0.8)",
        shadow: "inset 0 1px 0 rgb(255 255 255 / 0.04), 0 16px 40px -20px rgb(0 0 0 / 0.8)",
    },
};

export type Shape = { md: number; lg: number };
export type Pace = { fast: number; base: number };

function sized ( given: number | string | undefined, fallback: number ): number {

    return typeof given === "number" ? given : fallback;

}

export function shaped ( themes: unknown ): Shape {

    const { radius } = spec.theme(themes);

    return { md: sized(radius.md, 10), lg: sized(radius.lg, 18) };

}
export function paced ( themes: unknown ): Pace {

    const { motion } = spec.theme(themes);

    return { fast: sized(motion.fast, 140), base: sized(motion.base, 220) };

}

export const gaps = { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };
export const paddings = { none: 0, xs: 8, sm: 12, md: 20, lg: 32, xl: 48 };
export const reading = 672;

export function palettes ( themes: unknown ): Palettes {

    const own = spec.theme(themes).color;

    return { light: { ...neutral.light, ...own.light }, dark: { ...neutral.dark, ...own.dark } };

}
