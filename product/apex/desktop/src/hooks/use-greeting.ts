import { useId } from "react";
import { usePreferences } from "@/hooks/use-preferences.ts";
import { type Labels, labels } from "@/specs/runtime.ts";
import type { Direction, Locale } from "@/types/index.ts";

export type GreetingView = { locale: Locale; direction: Direction; labelId: string; text: Labels; toggleLocale: () => void };

export function useGreeting (): GreetingView {

    const { locale, direction, toggleLocale } = usePreferences();
    const labelId = useId();

    return { locale, direction, labelId, text: labels(locale, "hello"), toggleLocale };

}
