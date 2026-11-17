import type { Metadata } from "next";
import { Shell } from "@/app/shell.tsx";
import { host } from "@/specs/app.ts";

type Params = { path?: string[] | undefined };

const locale = host.app.compiled.surface.locale;

function pathOf ( params: Params ): string {

    return `/${(params.path ?? []).join("/")}`;

}
export async function generateStaticParams (): Promise<Params[]> {

    const reached = await Promise.all(host.names.map(( name ) => host.ready(name)));

    return [...new Set(reached.flatMap(( app ) => app.paths()))].map(( path ) => ({ path: path.split("/").filter(Boolean) }));

}
export async function generateMetadata ({ params }: { params: Promise<Params> } ): Promise<Metadata> {

    const matched = host.app.screenAt(pathOf(await params));

    if ( !matched ) return { title: null, robots: { index: false, follow: false } };

    const meta = host.app.meta(matched.screen, locale);

    return {
        title: null,
        description: meta.description,
        robots: meta.robots,
        alternates: meta.canonical ? { canonical: meta.canonical, languages: Object.fromEntries(meta.alternates.map(( alternate ) => [alternate.locale, alternate.href])) } : undefined,
        openGraph: meta.canonical ? { title: meta.title, description: meta.description, url: meta.canonical, siteName: host.app.content("name", locale), locale } : undefined,
    };

}
export default async function Page ({ params }: { params: Promise<Params> } ) {

    const path = pathOf(await params);

    return <Shell path={path} />;

}
