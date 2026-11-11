import type { MetadataRoute } from "next";
import { publicOf } from "@/specs/runtime.ts";

export const dynamic = "force-static";

export default function robots (): MetadataRoute.Robots {

    const open = publicOf();

    if ( !open.indexable || !open.url ) return { rules: { userAgent: "*", disallow: "/" } };

    return { rules: { userAgent: "*", allow: "/" }, sitemap: `${open.url.replace(/\/+$/, "")}/sitemap.xml` };

}
