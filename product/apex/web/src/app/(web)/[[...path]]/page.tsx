import type { Metadata } from "next";
import { Shell } from "@/app/shell.tsx";
import { host } from "@/specs/index.ts";

type Params = { path?: string[] | undefined };

function pathOf ( params: Params ): string {

    return `/${(params.path ?? []).join("/")}`;

}
export async function generateStaticParams (): Promise<Params[]> {

    const reached = await Promise.all(host.names.map(( name ) => host.ready(name)));

    return [...new Set(reached.flatMap(( app ) => app.routes()))].map(( path ) => ({ path: path.split("/").filter(Boolean) }));

}
export async function generateMetadata ({ params }: { params: Promise<Params> } ): Promise<Metadata> {

    const at = host.app.locate(pathOf(await params));
    const matched = host.app.screenAt(at.path);

    if ( !matched || at.moved ) return { title: null, robots: { index: false, follow: false } };

    const { locale } = at;
    const meta = host.app.meta(matched.screen, locale);

    return {
        title: null,
        description: meta.description,
        keywords: meta.keywords.length > 0 ? meta.keywords : undefined,
        robots: meta.robots,
        alternates: meta.canonical ? { canonical: meta.canonical, languages: Object.fromEntries(meta.alternates.map(( alternate ) => [alternate.locale, alternate.href])) } : undefined,
        openGraph: meta.canonical ? { title: meta.title, description: meta.description, url: meta.canonical, siteName: host.app.content("name", locale), locale, images: meta.openGraph["og:image"] ? [meta.openGraph["og:image"]] : undefined } : undefined,
        twitter: meta.twitter["twitter:card"] ? { card: meta.twitter["twitter:card"] === "summary_large_image" ? "summary_large_image" : "summary", site: meta.twitter["twitter:site"], images: meta.twitter["twitter:image"] ? [meta.twitter["twitter:image"]] : undefined } : undefined,
    };

}
export default async function Page ({ params }: { params: Promise<Params> } ) {

    const at = host.app.locate(pathOf(await params));

    const graph = host.app.graph(at.locale);

    return (
        <>
            {graph === undefined ? null : <script type="application/ld+json">{graph}</script>}
            <Shell path={at.path} locale={host.app.config.settings.localization ? at.locale : undefined} />
        </>
    );

}
