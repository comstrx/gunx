import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwind from "@tailwindcss/postcss";
import * as tool from "engine/tool";
import postcss from "postcss";
import type { Spoken } from "../native/src/contract.ts";
import { nativePlugin } from "../native/src/plugin.ts";
import { type RoleName, roles } from "../specs/index.ts";
import { compileRole } from "../src/specs/surface.ts";

export type Page = { lang: string; dir: string; csp: string };

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

export function csp ( api: string ): string {

    const origin = new URL(api).origin;

    return ["default-src 'self'", "script-src 'self'", "style-src 'self'", "font-src 'self'", "img-src 'self' data:", `connect-src 'self' ${origin}`, "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join("; ");

}
export function page ( given: Page ): string {

    const template = readFileSync(resolve(root, "src/app/index.html"), "utf8");

    return template.replace(/{{(lang|dir|csp)}}/g, ( _, key: keyof Page ) => given[key].replace(/[&<>"]/g, ( char ) => `&#${char.charCodeAt(0)};`));

}
export function spoken ( name: RoleName ): Spoken {

    const settings = roles[name].config.settings;

    return { identity: name, name: settings.app.name, identifier: settings.app.identifier, version: settings.app.version, window: settings.window };

}
export async function build ( name: RoleName ): Promise<string> {

    const compiled = compileRole(name);

    if ( compiled.issues.length ) throw new Error(compiled.issues.map(( issue ) => `${issue.path}: ${issue.rule}: ${issue.message}`).join("\n"));

    const out = resolve(dist, name);
    const locale = compiled.surface.locale === "ar" ? "ar" : "en";

    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });

    const bundled = await Bun.build({
        entrypoints: [resolve(root, "src/app/index.tsx")],
        outdir: out,
        target: "browser",
        minify: true,
        naming: "app.[ext]",
        plugins: [nativePlugin()],
        define: {
            "process.env.NODE_ENV": JSON.stringify("production"),
            "process.env.API_URL": JSON.stringify(process.env.API_URL ?? ""),
            "process.env.ENGINE_ENV": JSON.stringify(process.env.ENGINE_ENV ?? ""),
            "process.env.EXPO_PUBLIC_API_URL": JSON.stringify(""),
            "process.env.EXPO_PUBLIC_ENGINE_ENV": JSON.stringify(""),
        },
    });

    if ( !bundled.success ) throw new AggregateError(bundled.logs, "the page did not bundle");

    const source = resolve(root, "src/app/globals.css");
    const sheet = await postcss([tailwind()]).process(readFileSync(source, "utf8"), { from: source, to: resolve(out, "theme.css") });

    writeFileSync(resolve(out, "theme.css"), sheet.css);
    rmSync(resolve(out, "app.css"), { force: true });
    cpSync(resolve(root, ".cache/fonts"), resolve(out, "fonts"), { recursive: true });
    writeFileSync(resolve(out, "index.html"), page({ lang: locale, dir: locale === "ar" ? "rtl" : "ltr", csp: csp(compiled.address) }));
    tool.writeJson(resolve(out, "client.json"), { surface: compiled.surface, screens: compiled.screens.map(( screen ) => ({ ...screen, features: screen.features.map(( feature ) => ({ ...feature, manifest: undefined })) })), features: compiled.features });
    tool.writeJson(resolve(out, "host.json"), spoken(name));
    rmSync(resolve(dist, "current"), { recursive: true, force: true });
    cpSync(out, resolve(dist, "current"), { recursive: true });

    return out;

}

if ( import.meta.main ) {

    await Bun.$`bun ${resolve(root, "tools/compile.ts")}`;

    const wanted = process.argv.includes("--all") ? (Object.keys(roles) as RoleName[]) : [(process.argv[2] as RoleName | undefined) ?? "admin"];

    for ( const name of wanted ) {

        const out = await build(name);
        const shipped = statSync(resolve(out, "app.js")).size;
        const budget = roles[name].config.settings.budget.js;

        console.log(`${name}: ${out} (${shipped} bytes of js, budget ${budget})`);

        if ( shipped > budget ) {

            console.error(`${name}: app.js exceeds its budget by ${shipped - budget} bytes`);
            process.exit(1);

        }

    }

}
