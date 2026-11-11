import * as world from "engine/world";

export type Space = "none" | "xs" | "sm" | "md" | "lg" | "xl";
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
        brand: "", brandStrong: "", brandSoft: "", brandSoftStrong: "", onBrand: "",
        ink: "#1c1917", inkMuted: "#57534e", surface: "#fcfbfa", surfaceRaised: "#ffffff", surfaceSunken: "#f2efec", line: "#e7e3df",
        danger: "#b91c1c", dangerStrong: "#991b1b", dangerSoft: "#fef2f2", success: "#15803d", successSoft: "#f0fdf4", warning: "#a16207", warningSoft: "#fefce8",
        scrim: "rgba(28, 25, 23, 0.45)", shade: "rgba(28, 25, 23, 0.22)",
        shadow: "0 1px 2px rgb(28 25 23 / 0.05), 0 12px 32px -16px rgb(28 25 23 / 0.22)",
    },
    dark: {
        brand: "", brandStrong: "", brandSoft: "", brandSoftStrong: "", onBrand: "",
        ink: "#f5f3f1", inkMuted: "#a8a29e", surface: "#0f0d0c", surfaceRaised: "#1a1715", surfaceSunken: "#262220", line: "#2e2926",
        danger: "#f87171", dangerStrong: "#fca5a5", dangerSoft: "#2a1212", success: "#4ade80", successSoft: "#0f2416", warning: "#facc15", warningSoft: "#2a2208",
        scrim: "rgba(0, 0, 0, 0.62)", shade: "rgba(0, 0, 0, 0.8)",
        shadow: "inset 0 1px 0 rgb(255 255 255 / 0.04), 0 16px 40px -20px rgb(0 0 0 / 0.8)",
    },
};

export const gaps: Readonly<Record<Space, number>> = { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };
export const paddings: Readonly<Record<Space, number>> = { none: 0, xs: 8, sm: 12, md: 20, lg: 32, xl: 48 };
export const radius = { md: 10, lg: 18 } as const;
export const reading = 672;
export const motion = { fast: 140 } as const;

export function palettes ( brand: string ): Palettes {

    const steps = world.shades(world.color(brand) ?? world.rgb(255, 69, 0));
    const hex = ( step: world.Shade ): string => world.toHex(steps[step]);

    return {
        light: { ...neutral.light, brand: hex(600), brandStrong: hex(700), brandSoft: hex(50), brandSoftStrong: hex(100), onBrand: world.toHex(world.onColor(steps[600])) },
        dark: { ...neutral.dark, brand: hex(400), brandStrong: hex(300), brandSoft: hex(950), brandSoftStrong: hex(900), onBrand: world.toHex(world.onColor(steps[400])) },
    };

}
