import * as adapter from "engine/adapter";
import * as state from "engine/state";
import * as world from "engine/world";
import { useEffect } from "react";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { compiled } from "@/specs/runtime.ts";
import { box } from "@/stores/box.ts";
import { type Palette, palettes } from "@/styles/tokens.ts";
import type { Direction, Locale } from "@/types/index.ts";

export type Theme = world.ThemeState<Palette> & { locale: Locale; direction: Direction; set: ( preference: world.Preference ) => void; toggle: () => void; cycle: () => void };

export const scheme: world.Theme<Palette> = world.theme({ tokens: palettes(compiled.role.config.themes.brand), box, key: "scheme" });

const bound = state.bind(scheme);

export function useTheme (): Theme {

    const { locale, direction } = usePreferences();
    const current = bound.useState();

    useEffect(() => {

        if ( !scheme.getState().ready ) void scheme.hydrate();

    }, []);
    useEffect(() => {

        const root = adapter.host().document?.documentElement;
        const speak = { lang: locale, dir: direction };

        scheme.apply(root, speak);

        return scheme.subscribe(() => scheme.apply(root, speak));

    }, [locale, direction]);

    return { ...current, locale, direction, set: scheme.set, toggle: scheme.toggle, cycle: scheme.cycle };

}
