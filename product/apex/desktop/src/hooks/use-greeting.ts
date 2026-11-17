import type * as spec from "engine/spec";
import { useId } from "react";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { host } from "@/specs/app.ts";
import type { Direction, Locale } from "@/types/index.ts";

export type GreetingView = { locale: Locale; direction: Direction; labelId: string; text: spec.Labels; toggleLocale: () => void };

export function useGreeting (): GreetingView {

    const { locale, direction, toggleLocale } = usePreferences();
    const labelId = useId();

    return { locale, direction, labelId, text: host.app.labels(locale, "hello"), toggleLocale };

}
