import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { compiled, publicOf } from "@/specs/runtime.ts";
import "./globals.css";

const name = compiled.role.config.contents.name;
const locale = compiled.surface.locale === "ar" ? "ar" : "en";
const open = publicOf();

export const metadata: Metadata = {
    title: { default: name[locale], template: `%s · ${name[locale]}` },
    description: compiled.role.config.contents.tagline[locale],
    robots: open.indexable ? { index: true, follow: true } : { index: false, follow: false },
    metadataBase: open.url ? new URL(open.url) : null,
};
export const viewport: Viewport = { colorScheme: "light dark", width: "device-width", initialScale: 1 };

export default function Layout ({ children }: { children: ReactNode } ) {

    return (
        <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
            <head>
                {["readex-pro-arabic", "figtree-latin"].map(( file ) => <link key={file} rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href={`/fonts/${file}.woff2`} />)}
            </head>
            <body>{children}</body>
        </html>
    );

}
