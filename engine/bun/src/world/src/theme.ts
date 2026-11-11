import * as adapter from "engine-adapter";
import type * as cache from "engine-cache";
import * as event from "engine-event";
import { named, css as sheetOf, type Tokens, valued } from "./tokens.ts";

export type Scheme = "light" | "dark";
export type Preference = Scheme | "system";
export type Appearance = { scheme: () => Scheme; watch: ( listener: () => void ) => () => void };
export type Schemes<T extends Tokens> = { light: T; dark: T };
export type ThemeState<T extends Tokens> = { preference: Preference; system: Scheme; scheme: Scheme; palette: T; ready: boolean };
export type Readable<T> = { getState: () => T; subscribe: ( listener: ( state: T, previous: T ) => void ) => () => void };
export type Root = { lang?: string; dir?: string; dataset?: Record<string, string | undefined>; style?: { colorScheme?: string } };
export type ThemeOptions<T extends Tokens> = {
    tokens: Schemes<T>;
    preference?: Preference | undefined;
    system?: (() => Scheme) | undefined;
    watch?: (( listener: () => void ) => () => void) | undefined;
    box?: cache.Box | undefined;
    key?: string | undefined;
    prefix?: string | undefined;
    selector?: string | undefined;
    sync?: boolean | undefined;
    fail?: (( cause: unknown ) => void) | undefined;
};
export type Theme<T extends Tokens> = Readable<ThemeState<T>> & {
    preference: () => Preference;
    scheme: () => Scheme;
    palette: () => T;
    set: ( preference: Preference ) => void;
    toggle: () => void;
    cycle: () => void;
    css: () => string;
    variables: ( scheme?: Scheme ) => Readonly<Record<string, string>>;
    apply: ( root: Root | undefined, speak?: { lang: string; dir: string } | undefined ) => void;
    hydrate: () => Promise<void>;
    destroy: () => void;
};

const marked = 16;

export const preferences: readonly Preference[] = ["system", "light", "dark"];
export const appearance: adapter.Port<Appearance> = adapter.port<Appearance>("appearance", {
    fallback: () => ({
        scheme: () => (sensed()?.matches ? "dark" : "light"),
        watch: ( listener ) => {

            const list = sensed();

            list?.addEventListener?.("change", listener);

            return () => list?.removeEventListener?.("change", listener);

        },
    }),
});

function sensed (): adapter.MediaList | undefined {

    return adapter.probe(() => adapter.host().matchMedia?.("(prefers-color-scheme: dark)"));

}
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

export function isPreference ( value: unknown ): value is Preference {

    return value === "system" || value === "light" || value === "dark";

}
export function theme<T extends Tokens> ( options: ThemeOptions<T> ): Theme<T> {

    const { tokens, box, key = "theme", prefix = "", selector = ":root", sync = true, fail } = options;
    const first = options.preference ?? "system";

    if ( !isPreference(first) ) throw new RangeError("not a preference");
    if ( !palette(tokens) || !palette(tokens.light) || !palette(tokens.dark) ) throw new RangeError("not a palette");

    const sense = options.system ?? (() => appearance.get().scheme());
    const watch = options.watch ?? followed;
    const echoes: Preference[] = [];
    const sheets: { light?: Readonly<Record<string, string>>; dark?: Readonly<Record<string, string>> } = {};
    let sheet: string | undefined;
    let hydrating: Promise<void> | undefined;
    let unwatch: (() => void) | undefined;
    let chosen = false;
    let dead = false;
    const system = (): Scheme => (adapter.probe(sense) === "dark" ? "dark" : "light");
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

        if ( !isPreference(preference) ) throw new RangeError("not a preference");

        chosen = true;
        state.set(( current ) => make(preference, current.system, current.ready));

        if ( !box ) return;

        if ( sync ) {

            echoes.push(preference);

            if ( echoes.length > marked ) echoes.shift();

        }

        void box.set(key, preference).then(undefined, ( cause: unknown ) => {

            const at = echoes.indexOf(preference);

            if ( at >= 0 ) echoes.splice(at, 1);

            told(cause);

        });

    };
    const hydrate = (): Promise<void> => {

        if ( hydrating ) return hydrating;
        if ( !box ) return Promise.resolve();

        hydrating = Promise.resolve().then(() => box.get(key)).then(undefined, ( cause: unknown ) => {

            told(cause);

            return undefined;

        }).then(( saved ) => {

            if ( dead ) return;

            state.set(( current ) => make(!chosen && isPreference(saved) ? saved : current.preference, current.system, true));

            if ( !sync ) return;

            try {

                unwatch = box.watch(key, heard);

            } catch ( cause ) {

                told(cause);

            }

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

            if ( scheme !== "light" && scheme !== "dark" ) throw new RangeError("not a scheme");

            const known = sheets[scheme];

            if ( known ) return known;

            const made = Object.freeze(Object.fromEntries(Object.entries(tokens[scheme]).map(([name, value]) => [named(name, prefix), valued(value)])));

            sheets[scheme] = made;

            return made;

        },
        apply: ( root, speak ) => {

            if ( !root ) return;

            const { preference, scheme } = state.get();
            const tone = preference === "system" ? "light dark" : scheme;

            if ( speak ) {

                if ( root.lang !== speak.lang ) root.lang = speak.lang;
                if ( root.dir !== speak.dir ) root.dir = speak.dir;

            }

            if ( root.dataset ) {

                if ( preference === "system" ) delete root.dataset.theme;
                else if ( root.dataset.theme !== preference ) root.dataset.theme = preference;

            }

            if ( root.style && root.style.colorScheme !== tone ) root.style.colorScheme = tone;

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
