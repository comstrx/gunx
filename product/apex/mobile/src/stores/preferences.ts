import type * as error from "engine/error";
import * as event from "engine/event";
import * as state from "engine/state";
import { compiled } from "@/specs/runtime.ts";
import { bind } from "@/stores/bind.ts";
import type { Locale, Preferences } from "@/types/index.ts";
import { box } from "./box.ts";

type Actions = { setLocale: ( locale: Locale ) => void; toggleLocale: () => void };

export const faults: event.Signal<error.Fault | undefined> = event.signal<error.Fault | undefined>(undefined);
export const preferences = state.define<Preferences, Actions>({
    name: "preferences",
    initial: { locale: compiled.surface.locale as Locale },
    persist: { box, keys: ["locale"], accept: ( saved ) => typeof saved.locale === "string" && compiled.surface.locales.includes(saved.locale) ? { locale: saved.locale } : undefined, fail: ( fault ) => faults.set(fault) },
    actions: ( set, get ) => ({
        setLocale: ( locale ) => {

            if ( !compiled.surface.locales.includes(locale) ) throw new RangeError("locale is not selected by the role");

            set({ locale });

        },
        toggleLocale: () => set({ locale: (compiled.surface.locales[(compiled.surface.locales.indexOf(get().locale) + 1) % compiled.surface.locales.length] ?? compiled.surface.locale) as Locale }),
    }),
});

export const instance = preferences.create();
export const bound = bind(instance);
