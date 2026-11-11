import type { MetadataRoute } from "next";
import { compiled, pathsOf, publicOf } from "@/specs/runtime.ts";

export const dynamic = "force-static";

export default function sitemap (): MetadataRoute.Sitemap {

    const open = publicOf();

    if ( !open.indexable || !open.url ) return [];

    const root = open.url.replace(/\/+$/, "");

    return pathsOf().filter(( path ) => !(compiled.screens.find(( screen ) => screen.path === path)?.auth ?? false)).map(( path ) => ({ url: `${root}${path === "/" ? "" : path}`, changeFrequency: "weekly", priority: path === "/" ? 1 : 0.7 }));

}
