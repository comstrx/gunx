import * as device from "engine/device";
import type * as translate from "engine/translate";
import type * as world from "engine/world";
import { useEffect } from "react";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { host } from "@/specs/app.ts";
import { schemed } from "@/stores/scheme.ts";
import type { Pace, Palette, Shape } from "@/styles/tokens.ts";

export type Theme = world.ThemeState<Palette> & { radius: Shape; motion: Pace; locale: string; direction: translate.Direction; set: ( preference: world.Preference ) => void; toggle: () => void; cycle: () => void };

export function useTheme (): Theme {

    const { locale, direction, ready } = usePreferences();
    const { scheme: held, bound, chose, radius, motion } = schemed();
    const current = bound.useState();
    const surface = host.app.id;

    useEffect(() => {

        if ( !held.getState().ready ) void held.hydrate();

    }, [held]);
    useEffect(() => {

        const root = device.host().document?.documentElement;
        const speak = { lang: locale, dir: direction, surface };

        const apply = (): void => {

            if ( !ready || !held.getState().ready ) return;
            held.apply(root, speak);

        };

        apply();

        return held.subscribe(apply);

    }, [held, locale, direction, ready, surface]);

    return {
        ...current,
        radius,
        motion,
        locale,
        direction,
        set: ( preference ) => {

            chose();
            held.set(preference);

        },
        toggle: () => {

            chose();
            held.toggle();

        },
        cycle: () => {

            chose();
            held.cycle();

        },
    };

}
