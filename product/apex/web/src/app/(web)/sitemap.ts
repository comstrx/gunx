import type { MetadataRoute } from "next";
import { host } from "@/specs/index.ts";

export const dynamic = "force-static";

export default function sitemap (): MetadataRoute.Sitemap {

    const { app } = host;
    const open = app.indexing();

    if ( !open.indexable || !open.url ) return [];

    const root = open.url.replace(/\/+$/, "");
    const { locale, locales } = app.compiled.surface;
    const placed = ( path: string, spoken: string ): string => `${root}${app.href(path, spoken) === "/" ? "" : app.href(path, spoken)}`;
    const shown = app.paths().filter(( path ) => !(app.compiled.screens.find(( screen ) => screen.path === path)?.auth ?? false));

    return shown.map(( path ) => ({
        url: placed(path, locale),
        changeFrequency: "weekly" as const,
        priority: path === app.home ? 1 : 0.7,
        ...(app.config.settings.localization ? { alternates: { languages: Object.fromEntries(locales.map(( spoken ) => [spoken, placed(path, spoken)])) } } : {}),
    }));

}
