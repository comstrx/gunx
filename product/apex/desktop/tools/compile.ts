import { copyFileSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as spec from "engine/spec";
import * as tool from "engine/tool";
import * as world from "engine/world";
import { current, type RoleName, roles } from "../specs/index.ts";
import { compileRole } from "../src/specs/surface.ts";
import { motion, palettes, radius } from "../src/styles/tokens.ts";
import { platform } from "../src/types/platform.ts";

const root = resolve(import.meta.dirname, "..");
const cache = resolve(root, ".cache");
const assets = tool.assets(resolve(realpathSync(resolve(root, "node_modules/engine")), "../.."));
const fonts = resolve(assets, "font");
const published = platform === "web" ? resolve(root, "public/fonts") : resolve(cache, "fonts");
let failed = false;

export function themeOf ( brand: string ): string {

    const tones = palettes(brand);
    const colors = ( palette: typeof tones.light ): Record<string, string> => Object.fromEntries(Object.entries(palette).filter(([key]) => key !== "shadow").map(([key, value]) => [`color-${key}`, value]));
    const base = {
        ...colors(tones.light),
        "shadow-raised": tones.light.shadow,
        "radius-md": `${radius.md / 16}rem`,
        "radius-lg": `${radius.lg / 16}rem`,
        "font-sans": '"Readex Pro", "Figtree", ui-sans-serif, system-ui, sans-serif',
        "ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
    };

    return [
        world.css({ base, selector: "@theme" }),
        world.css({ base: { "motion-fast": `${motion.fast}ms` }, dark: { ...colors(tones.dark), "shadow-raised": tones.dark.shadow } }),
        world.block("@media (prefers-reduced-motion: reduce)", [world.block(":root", ["--motion-fast: 0ms;"], "        ").replace(/\n\}$/, "\n    }")]),
        "",
    ].join("\n");

}

for ( const name of Object.keys(roles) as RoleName[] ) {

    const compiled = compileRole(name);
    const settings = compiled.role.config.settings as { app?: unknown };
    const serialized = settings.app === undefined ? spec.serialize(compiled) : { ...spec.serialize(compiled), app: settings.app };

    for ( const issue of compiled.issues ) {

        failed = true;
        console.error(`${name}: ${issue.path}: ${issue.rule}: ${issue.message}${issue.near ? ` (near: ${issue.near})` : ""}${issue.fix ? ` → ${issue.fix}` : ""}`);

    }

    tool.writeJson(resolve(cache, "spec", `${name}.json`), serialized);
    if ( name === current ) tool.writeJson(resolve(cache, "spec", "current.json"), serialized);
    console.log(`${name}: ${compiled.screens.length} screens, ${compiled.features.length} features, ${compiled.topics.emitted.length} topics`);

}

if ( platform !== "mobile" ) {

    mkdirSync(published, { recursive: true });

    for ( const file of readdirSync(fonts).filter(( entry ) => entry.endsWith(".woff2")) ) copyFileSync(resolve(fonts, file), resolve(published, file));

    const styles = resolve(cache, "styles");

    mkdirSync(dirname(resolve(styles, "fonts.css")), { recursive: true });
    writeFileSync(resolve(styles, "fonts.css"), `${world.fontFaces("/fonts")}\n`);
    writeFileSync(resolve(styles, "theme.css"), themeOf(roles[current].config.themes.brand));

}

if ( failed ) process.exit(1);
