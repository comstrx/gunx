import type { MetadataRoute } from "next";
import { host } from "@/specs/app.ts";

export const dynamic = "force-static";

export default function sitemap (): MetadataRoute.Sitemap {

    const open = host.app.indexing();

    if ( !open.indexable || !open.url ) return [];

    const root = open.url.replace(/\/+$/, "");

    return host.app.paths().filter(( path ) => !(host.app.compiled.screens.find(( screen ) => screen.path === path)?.auth ?? false)).map(( path ) => ({ url: `${root}${path === "/" ? "" : path}`, changeFrequency: "weekly", priority: path === "/" ? 1 : 0.7 }));

}
