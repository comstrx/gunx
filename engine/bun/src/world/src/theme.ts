import * as device from "engine-device";
import * as event from "engine-event";
import * as exception from "engine-exception";
import type { Appearance, Preference, Scheme, Theme, ThemeOptions, ThemeState, Tokens } from "./arch.ts";
import { isPreference, preferences, remember, stamp } from "./look.ts";
import { named, css as sheetOf, valued } from "./tokens.ts";

const marked = 16;

export const appearance: exception.Slot<Appearance> = exception.slot<Appearance>("appearance", {
    fallback: () => ({
        scheme: () => device.port.get().info().scheme,
        watch: ( listener ) => device.port.get().watch("scheme", () => listener()),
    }),
});

function followed ( listener: () => void ): () => void {

    let stop = appearance.get().watch(listener);
    const off = appearance.watch(() => {

        stop();
        stop = appearance.get().watch(listener);
        listener();

    });

    return () => {

        off();
        stop();

    };

}
function palette ( value: unknown ): boolean {

    return typeof value === "object" && value !== null;

}

export function theme<T extends Tokens> ( options: ThemeOptions<T> ): Theme<T> {

    const { tokens, box, key = "theme", prefix = "", selector = ":root", sync = true, fail } = options;
    const first = options.preference ?? "system";

    if ( !isPreference(first) ) throw exception.misuse("not a preference");
    if ( !palette(tokens) || !palette(tokens.light) || !palette(tokens.dark) ) throw exception.misuse("not a palette");

    const sense = options.system ?? (() => appearance.get().scheme());
    const watch = options.watch ?? followed;
    const echoes: Preference[] = [];
    const sheets: { light?: Readonly<Record<string, string>>; dark?: Readonly<Record<string, string>> } = {};
    let sheet: string | undefined;
    let hydrating: Promise<void> | undefined;
    let unwatch: (() => void) | undefined;
    let chosen = false;
    let dead = false;
    const system = (): Scheme => (exception.probe(sense) === "dark" ? "dark" : "light");
    const told = ( cause: unknown ): void => {

        if ( fail ) fail(cause);

    };
    const make = ( preference: Preference, found: Scheme, ready: boolean ): ThemeState<T> => {

        const scheme = preference === "system" ? found : preference;

        return { preference, system: found, scheme, palette: tokens[scheme], ready };

    };
    const state = event.signal<ThemeState<T>>(make(first, system(), box === undefined), ( a, b ) => a.preference === b.preference && a.system === b.system && a.ready === b.ready);
    const stop = watch(() => state.set(( current ) => make(current.preference, system(), current.ready)));
    const heard = ( value: unknown ): void => {

        if ( dead || !isPreference(value) ) return;

        const echo = echoes.indexOf(value);

        if ( echo >= 0 ) echoes.splice(0, echo + 1);
        else state.set(( current ) => make(value, current.system, current.ready));

    };
    const set = ( preference: Preference ): void => {

        if ( !isPreference(preference) ) throw exception.misuse("not a preference");

        chosen = true;
        state.set(( current ) => make(preference, current.system, current.ready));

        if ( !box ) return;

        if ( sync ) {

            echoes.push(preference);

            if ( echoes.length > marked ) echoes.shift();

        }

        void exception.mend(box.set(key, preference), ( cause ) => {

            const at = echoes.indexOf(preference);

            if ( at >= 0 ) echoes.splice(at, 1);

            told(cause);

        });

    };
    const hydrate = (): Promise<void> => {

        if ( hydrating ) return hydrating;
        if ( !box ) return Promise.resolve();

        hydrating = exception.mend(Promise.resolve().then(() => box.get(key)), ( cause ) => {

            told(cause);

            return undefined;

        }).then(( saved ) => {

            if ( dead ) return;

            state.set(( current ) => make(!chosen && isPreference(saved) ? saved : current.preference, current.system, true));

            if ( !sync ) return;

            exception.rescue(() => {

                unwatch = box.watch(key, heard);

            }, ( cause ) => {

                told(cause);

            });

        });

        return hydrating;

    };

    return {
        getState: state.get,
        subscribe: state.watch,
        preference: () => state.get().preference,
        scheme: () => state.get().scheme,
        palette: () => state.get().palette,
        set,
        toggle: () => set(state.get().scheme === "dark" ? "light" : "dark"),
        cycle: () => set(preferences[(preferences.indexOf(state.get().preference) + 1) % preferences.length] ?? "system"),
        css: () => {

            if ( sheet === undefined ) sheet = sheetOf({ base: tokens.light, dark: tokens.dark, selector, prefix });

            return sheet;

        },
        variables: ( scheme = state.get().scheme ) => {

            if ( scheme !== "light" && scheme !== "dark" ) throw exception.misuse("not a scheme");

            const known = sheets[scheme];

            if ( known ) return known;

            const made = Object.freeze(Object.fromEntries(Object.entries(tokens[scheme]).map(([name, value]) => [named(name, prefix), valued(value)])));

            sheets[scheme] = made;

            return made;

        },
        apply: ( root, speak ) => {

            if ( !root ) return;

            const look = { surface: speak?.surface, lang: speak?.lang, dir: speak?.dir, preference: state.get().preference };

            stamp(root, look);

            if ( look.surface !== undefined ) remember(look);

        },
        hydrate,
        destroy: () => {

            if ( dead ) return;

            dead = true;
            stop();
            unwatch?.();
            unwatch = undefined;

        },
    };

}
