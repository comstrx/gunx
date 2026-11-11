import type * as error from "engine/error";
import * as event from "engine/event";
import * as state from "engine/state";
import type { Locale, Preferences } from "@/types/index.ts";
import { box } from "./box.ts";

type Actions = { setLocale: ( locale: Locale ) => void; toggleLocale: () => void };

export const faults: event.Signal<error.Fault | undefined> = event.signal<error.Fault | undefined>(undefined);
export const preferences = state.define<Preferences, Actions>({
    name: "preferences",
    initial: { locale: "ar" },
    persist: { box, keys: ["locale"], fail: ( fault ) => faults.set(fault) },
    actions: ( set, get ) => ({
        setLocale: ( locale ) => set({ locale }),
        toggleLocale: () => set({ locale: get().locale === "ar" ? "en" : "ar" }),
    }),
});

export const instance = preferences.create();
export const bound = state.bind(instance);
