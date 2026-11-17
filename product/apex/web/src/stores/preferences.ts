import * as device from "engine/device";
import * as event from "engine/event";
import type * as exception from "engine/exception";
import type * as spec from "engine/spec";
import * as state from "engine/state";
import * as translate from "engine/translate";
import { host } from "@/specs/app.ts";
import type { Defaults } from "@/specs/part.ts";
import { bind } from "@/stores/bind.ts";
import type { Locale, Preferences } from "@/types/index.ts";
import { box } from "./box.ts";

type Actions = { setLocale: ( locale: Locale ) => void; toggleLocale: () => void };

function handed ( app: spec.App<Defaults> ): Locale | undefined {

    const given = host.carried().locale;

    return typeof given === "string" && app.compiled.surface.locales.includes(given) ? given : undefined;

}
function defined ( app: spec.App<Defaults>, inherited: Locale | undefined ) {

    const { locales, locale } = app.compiled.surface;

    return state.define<Preferences, Actions>({
        name: "preferences",
        initial: { locale: inherited ?? translate.negotiate(device.host().navigator?.languages, locales, locale), chosen: false },
        persist: { box: box(), keys: ["locale", "chosen"], seed: inherited === undefined ? undefined : { locale: inherited, chosen: false }, accept: ( saved ) => typeof saved.locale === "string" && locales.includes(saved.locale) ? { locale: saved.locale, chosen: saved.chosen === true } : undefined, fail: ( fault ) => faults.set(fault) },
        actions: ( set, get ) => ({
            setLocale: ( chosen ) => {

                if ( !locales.includes(chosen) ) throw new RangeError("locale is not selected by the role");

                set({ locale: chosen, chosen: true });

            },
            toggleLocale: () => set({ locale: (locales[(locales.indexOf(get().locale) + 1) % locales.length] ?? locale) as Locale, chosen: true }),
        }),
    });

}

const made = host.own(( app ) => {

    const inherited = handed(app);
    const preferences = defined(app, inherited);
    const instance = preferences.create();
    const adopt = (): void => {

        const given = handed(app);
        const held = instance.getState();

        if ( given !== undefined && held.ready && !held.chosen && held.locale !== given ) instance.setState({ locale: given });

    };
    let stop: () => void = () => undefined;

    if ( inherited !== undefined ) stop = instance.subscribe(( next ) => {

        if ( !next.ready ) return;

        stop();
        adopt();

    });

    host.active.subscribe(( name ) => {

        if ( name === app.name ) adopt();

    });

    return { preferences, instance, bound: bind(instance) };

});

export const faults: event.Signal<exception.Fault | undefined> = event.signal<exception.Fault | undefined>(undefined);

export function preferences () {

    return made().preferences;

}
export function instance () {

    return made().instance;

}
export function bound () {

    return made().bound;

}
