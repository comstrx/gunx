import { basename } from "node:path";
import * as error from "engine-error";
import * as json from "engine-json";
import type { Catalog, Directives, Values } from "./arch.ts";

const files: Readonly<Record<string, Catalog>> = { "countries.json": "countries", "currencies.json": "currencies", "languages.json": "languages", "emojis.json": "emoji" };
const placeholder = /{{\s*([\w-]+(?:\.[\w-]+)*)\s*}}/g;

function scalar ( value: unknown ): boolean {

    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";

}

export function csp ( api: string, directives: Directives = {} ): string {

    const endpoint = URL.canParse(api) ? new URL(api) : undefined;

    if ( endpoint === undefined || (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") ) throw error.fault("validation", "tool.csp", { message: "the API uses http or https" });

    const origin = endpoint.origin;

    endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";

    const base: Directives = {
        "default-src": "'self'",
        "script-src": "'self'",
        "style-src": "'self'",
        "font-src": "'self'",
        "img-src": "'self' data:",
        "connect-src": `'self' ${origin} ${endpoint.origin}`,
        "object-src": "'none'",
        "base-uri": "'none'",
        "form-action": "'none'",
    };

    return Object.entries({ ...base, ...directives }).map(([name, value]) => `${name} ${value}`).join("; ");

}
export function render ( template: string, values: Values ): string {

    return template.replace(placeholder, ( _, key: string ) => {

        const value = key.split(".").reduce<unknown>(( held, part ) => (json.isRecord(held) && Object.hasOwn(held, part) ? held[part] : undefined), values);
        const text: unknown = typeof value === "string" ? value : Array.isArray(value) && value.every(scalar) ? value.join(" ") : JSON.stringify(value);

        if ( typeof text !== "string" ) throw error.fault("validation", "tool.render", { message: `the template names {{${key}}}, which was not given as text or json` });

        return Bun.escapeHTML(text);

    });

}
export function catalogs ( kept: readonly Catalog[] ): Bun.BunPlugin {

    const wanted = new Set<Catalog>(kept);

    return {
        name: "engine-world-catalogs",
        setup ( build ) {

            build.onLoad({ filter: /[\\/]world[\\/]data[\\/](?:countries|currencies|languages|emojis)\.json$/ }, ( args ) => {

                const catalog = files[basename(args.path)];

                return catalog === undefined || wanted.has(catalog) ? undefined : { contents: "{\"unavailable\":true}", loader: "json" };

            });

        },
    };

}
