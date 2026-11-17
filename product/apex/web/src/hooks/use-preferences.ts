import * as translate from "engine/translate";
import { useEffect } from "react";
import { bound, instance } from "@/stores/preferences.ts";
import type { Direction, Locale } from "@/types/index.ts";

export type Preferred = { locale: Locale; direction: Direction; ready: boolean; toggleLocale: () => void; setLocale: ( locale: Locale ) => void };

export function directionOf ( locale: Locale ): Direction {

    return translate.direction(locale);

}
export function usePreferences (): Preferred {

    const held = instance();
    const locale = bound().useSelect(( state ) => state.locale);
    const ready = bound().useSelect(( state ) => state.ready);

    useEffect(() => {

        if ( !held.getState().ready ) void held.hydrate();

    }, [held]);

    return { locale, direction: directionOf(locale), ready, toggleLocale: held.getState().toggleLocale, setLocale: held.getState().setLocale };

}
