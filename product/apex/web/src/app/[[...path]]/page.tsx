import type { Metadata } from "next";
import { Nav } from "@/app/nav.tsx";
import { Screen } from "@/app/screen.tsx";
import { compiled, metadataOf, pathsOf, screenAt } from "@/specs/runtime.ts";

type Params = { path?: string[] | undefined };

const locale = compiled.surface.locale === "ar" ? "ar" : "en";

function pathOf ( params: Params ): string {

    return `/${(params.path ?? []).join("/")}`;

}
export function generateStaticParams (): Params[] {

    return pathsOf().map(( path ) => ({ path: path.split("/").filter(Boolean) }));

}
export async function generateMetadata ({ params }: { params: Promise<Params> } ): Promise<Metadata> {

    const matched = screenAt(pathOf(await params));

    if ( !matched ) return {};

    const meta = metadataOf(matched.screen, locale);

    return {
        title: null,
        description: meta.description,
        robots: meta.robots,
        alternates: meta.canonical ? { canonical: meta.canonical, languages: Object.fromEntries(meta.alternates.map(( alternate ) => [alternate.locale, alternate.href])) } : undefined,
        openGraph: meta.canonical ? { title: meta.title, description: meta.description, url: meta.canonical, siteName: compiled.role.config.contents.name[locale], locale } : undefined,
    };

}
export default async function Page ({ params }: { params: Promise<Params> } ) {

    const path = pathOf(await params);

    return (
        <>
            <Nav path={path} />
            <main>
                <Screen path={path} />
            </main>
        </>
    );

}
