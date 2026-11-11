import { useEffect } from "react";
import { bound, instance } from "@/stores/preferences.ts";
import type { Direction, Locale } from "@/types/index.ts";

export type Preferred = { locale: Locale; direction: Direction; ready: boolean; toggleLocale: () => void; setLocale: ( locale: Locale ) => void };

export function directionOf ( locale: Locale ): Direction {

    return locale === "ar" ? "rtl" : "ltr";

}
export function usePreferences (): Preferred {

    const locale = bound.useSelect(( state ) => state.locale);
    const ready = bound.useSelect(( state ) => state.ready);

    useEffect(() => {

        if ( !instance.getState().ready ) void instance.hydrate();

    }, []);

    return { locale, direction: directionOf(locale), ready, toggleLocale: instance.getState().toggleLocale, setLocale: instance.getState().setLocale };

}
