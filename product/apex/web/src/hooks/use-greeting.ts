import type * as translate from "engine/translate";
import { useId } from "react";
import { usePreferences } from "@/hooks/use-preferences.ts";
import type * as spec from "@/specs/index.ts";
import { host } from "@/specs/index.ts";

export type GreetingView = { locale: string; direction: translate.Direction; labelId: string; text: spec.Labels; toggleLocale: () => void };

export function useGreeting (): GreetingView {

    const { locale, direction, toggleLocale } = usePreferences();
    const labelId = useId();

    return { locale, direction, labelId, text: host.app.labels(locale, "hello"), toggleLocale };

}
