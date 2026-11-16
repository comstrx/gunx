import * as translate from "engine/translate";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { compiled, contentOf, publicOf } from "@/specs/runtime.ts";
import "./globals.css";

const name = contentOf("name", compiled.surface.locale);
const locale = compiled.surface.locale;
const open = publicOf();

export const metadata: Metadata = {
    title: { default: name, template: `%s · ${name}` },
    description: contentOf("tagline", locale),
    robots: open.indexable ? { index: true, follow: true } : { index: false, follow: false },
    metadataBase: open.url ? new URL(open.url) : null,
};
export const viewport: Viewport = { colorScheme: "light dark", width: "device-width", initialScale: 1 };

export default function Layout ({ children }: { children: ReactNode } ) {

    return (
        <html lang={locale} dir={translate.direction(locale)} suppressHydrationWarning>
            <head>
                <script src="/appearance.js" data-locales={compiled.surface.locales.join(" ")} data-scheme={compiled.role.config.settings.scheme} />
                {["readex-pro-arabic", "figtree-latin"].map(( file ) => <link key={file} rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href={`/fonts/${file}.woff2`} />)}
            </head>
            <body>{children}</body>
        </html>
    );

}
