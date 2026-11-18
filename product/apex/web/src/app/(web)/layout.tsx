import * as translate from "engine/translate";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { host } from "@/specs/app.ts";
import "@/styles/globals.css";

const name = host.app.content("name", host.app.compiled.surface.locale);
const locale = host.app.compiled.surface.locale;
const open = host.app.indexing();
const icon = host.app.content("icon", locale);
const surfaces = JSON.stringify(host.index);

export const metadata: Metadata = {
    title: { default: name, template: `%s · ${name}` },
    description: host.app.content("tagline", locale),
    icons: icon === "" ? undefined : { icon },
    robots: open.indexable ? { index: true, follow: true } : { index: false, follow: false },
    metadataBase: open.url ? new URL(open.url) : null,
};
export const viewport: Viewport = { colorScheme: "light dark", width: "device-width", initialScale: 1 };

export default function Layout ({ children }: { children: ReactNode } ) {

    return (
        <html lang={locale} dir={translate.direction(locale)} suppressHydrationWarning>
            <head>
                <script src="/appearance.js" data-surface={host.entry} data-surfaces={surfaces} data-address={host.app.config.settings.localization ? "path" : undefined} />
                {["readex-pro-arabic", "figtree-latin"].map(( file ) => <link key={file} rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href={`/fonts/${file}.woff2`} />)}
            </head>
            <body>
                {children}
            </body>
        </html>
    );

}
