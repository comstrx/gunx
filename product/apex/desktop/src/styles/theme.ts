import * as device from "engine/device";
import * as world from "engine/world";
import { useEffect } from "react";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { host } from "@/specs/app.ts";
import { bind } from "@/stores/bind.ts";
import { box } from "@/stores/box.ts";
import { type Palette, palettes } from "@/styles/tokens.ts";
import type { Direction, Locale } from "@/types/index.ts";

export type Theme = world.ThemeState<Palette> & { locale: Locale; direction: Direction; set: ( preference: world.Preference ) => void; toggle: () => void; cycle: () => void };

const own = "scheme.own";
const made = host.own(( app ) => {

    const handed = host.carried().scheme;
    const told = app.config.settings.scheme;
    const held = box();
    const scheme: world.Theme<Palette> = world.theme({ tokens: palettes(app.config.themes.brand), preference: world.isPreference(handed) ? handed : world.isPreference(told) ? told : "system", box: held, key: "scheme" });

    const adopt = (): void => {

        const given = host.carried().scheme;

        if ( world.isPreference(given) ) void held.get<boolean>(own).then(( chosen ) => (chosen === true ? undefined : scheme.hydrate().then(() => scheme.set(given)))).catch(( caught: unknown ) => app.report(caught, "scheme.inherit"));

    };

    adopt();
    host.active.subscribe(( name ) => {

        if ( name === app.name ) adopt();

    });

    return { scheme, bound: bind(scheme), chose: (): void => void held.set(own, true).catch(( caught: unknown ) => app.report(caught, "scheme.choose")) };

});

export function scheme (): world.Theme<Palette> {

    return made().scheme;

}
export function useTheme (): Theme {

    const { locale, direction, ready } = usePreferences();
    const { scheme: held, bound, chose } = made();
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
