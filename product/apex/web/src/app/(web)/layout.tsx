import * as translate from "engine/translate";
import * as world from "engine/world";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import { host } from "@/specs/index.ts";
import "#styles.css";

const name = host.app.content("name", host.app.compiled.surface.locale);
const locale = host.app.compiled.surface.locale;
const open = host.app.indexing();
const icon = host.app.content("icon", locale);
const surfaces = JSON.stringify(host.index);
const fonts = world.fontLinks(host.app.place("fonts"), host.index.flatMap(( listed ) => listed.settings.locales), 1);

export const metadata: Metadata = {
    title: { default: name, template: `%s · ${name}` },
    description: host.app.content("tagline", locale),
    icons: icon === "" ? undefined : { icon },
    robots: open.indexable ? { index: true, follow: true } : { index: false, follow: false },
    metadataBase: open.url ? new URL(open.url) : null,
};
export const viewport: Viewport = { colorScheme: "light dark", width: "device-width", initialScale: 1 };

export default function Layout ({ children }: { children: ReactNode } ) {

    for ( const font of fonts ) preload(font.href, { as: font.as, type: font.type, crossOrigin: font.crossOrigin });

    return (
        <html lang={locale} dir={translate.direction(locale)} suppressHydrationWarning>
            <head>
                <script src={host.app.place("paint")} data-surface={host.entry} data-surfaces={surfaces} data-address={host.app.config.settings.localization ? "path" : undefined} />
            </head>
            <body>
                {children}
            </body>
        </html>
    );

}
