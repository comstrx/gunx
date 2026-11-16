import * as cache from "engine/cache";
import * as state from "engine/state";
import * as translate from "engine/translate";
import * as world from "engine/world";

try {

    const root = document.documentElement;
    const told: DOMStringMap = document.currentScript?.dataset ?? {};
    const locales = told.locales?.split(" ") ?? [];
    const saved = state.inspect<{ locale: string }>(cache.peek(localStorage.getItem(`app.${state.keyOf("preferences")}`)));
    const locale = saved?.locale;

    if ( typeof locale === "string" && locales.includes(locale) ) {

        root.lang = locale;
        root.dir = translate.direction(locale);

    }

    const savedScheme = cache.peek(localStorage.getItem("app.scheme"));
    const preference = world.isPreference(savedScheme) ? savedScheme : world.isPreference(told.scheme) ? told.scheme : "system";

    if ( preference !== "system" ) root.dataset.theme = preference;
    else delete root.dataset.theme;

    root.style.colorScheme = preference === "system" ? "light dark" : preference;

} catch {

    document.documentElement.dataset.appearance = "unavailable";

}
