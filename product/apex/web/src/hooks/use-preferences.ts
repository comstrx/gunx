import * as translate from "engine/translate";
import { createContext, useCallback, useContext, useEffect } from "react";
import { speak, useSpoken } from "@/hooks/use-path.ts";
import { host } from "@/specs/index.ts";
import { bound, instance } from "@/stores/preferences.ts";

export type Preferred = { locale: string; direction: translate.Direction; ready: boolean; toggleLocale: () => void; setLocale: ( locale: string ) => void };

export const Spoken = createContext<string | undefined>(undefined);

export function directionOf ( locale: string ): translate.Direction {

    return translate.direction(locale);

}
export function usePreferences (): Preferred {

    const held = instance();
    const told = useSpoken(useContext(Spoken));
    const kept = bound().useSelect(( state ) => state.locale);
    const ready = bound().useSelect(( state ) => state.ready);
    const locale = told ?? kept;
    const setLocale = useCallback(( next: string ): void => {

        held.getState().setLocale(next);
        speak(next);

    }, [held]);
    const toggleLocale = useCallback((): void => {

        const { locales } = host.app.compiled.surface;

        setLocale(locales[(locales.indexOf(locale) + 1) % locales.length] ?? locale);

    }, [locale, setLocale]);

    useEffect(() => {

        if ( !held.getState().ready ) void held.hydrate();

    }, [held]);
    useEffect(() => {

        if ( told !== undefined && ready && held.getState().locale !== told ) held.setState({ locale: told });

    }, [held, told, ready]);

    return { locale, direction: directionOf(locale), ready, toggleLocale, setLocale };

}
