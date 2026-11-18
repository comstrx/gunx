import * as device from "engine/device";
import { useMemo } from "react";
import { useActive } from "@/hooks/use-session.ts";

type Page = { document?: { documentElement?: unknown }; getComputedStyle?: ( node: unknown ) => { getPropertyValue: ( name: string ) => string } };

export type Motion = { fast: number; base: number };

function told ( name: string ): number {

    const page = device.host<Page>();
    const root = page.document?.documentElement;
    const text = root !== undefined && page.getComputedStyle ? page.getComputedStyle(root).getPropertyValue(name).trim() : "";
    const found = Number.parseFloat(text);

    return Number.isFinite(found) ? (text.endsWith("ms") ? found : found * 1000) : 0;

}

export function useMotion (): Motion {

    const active = useActive();

    return useMemo(() => (active === "" ? { fast: 0, base: 0 } : { fast: told("--motion-fast"), base: told("--motion-base") }), [active]);

}
