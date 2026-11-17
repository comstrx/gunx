import { basename } from "node:path";
import * as exception from "engine-exception";
import * as json from "engine-json";
import * as net from "engine-net";
import type * as world from "engine-world";
import type { Directives, Values } from "./arch.ts";

const files: Readonly<Record<string, world.Catalog>> = { "countries.json": "countries", "currencies.json": "currencies", "languages.json": "languages", "emojis.json": "emoji" };
const placeholder = /{{\s*([\w-]+(?:\.[\w-]+)*)\s*}}/g;

function scalar ( value: unknown ): boolean {

    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";

}

function origins ( api: string ): string[] {

    const parts = net.parseUrl(api);

    if ( parts === undefined || (parts.protocol !== "http" && parts.protocol !== "https") ) throw exception.fault("validation", "tool.csp", { message: "the API uses http or https" });

    return [parts.origin, `${parts.protocol === "https" ? "wss" : "ws"}://${parts.host}`];

}

function sourced ( api: string | readonly string[], lead: string, more: readonly string[] = [] ): string {

    const served = (typeof api === "string" ? [api] : api).map(( one ) => origins(one)[0] ?? "");

    return ["'self'", lead, ...new Set([...served, ...more])].join(" ");

}

export function pictured ( api: string | readonly string[], media: readonly string[] = [] ): string {

    return sourced(api, "data:", media);

}
export function csp ( api: string | readonly string[], directives: Directives = {} ): string {

    const reached = [...new Set((typeof api === "string" ? [api] : api).flatMap(origins))];

    if ( reached.length === 0 ) throw exception.fault("validation", "tool.csp", { message: "the API uses http or https" });

    return net.contentSecurityPolicy({
        "default-src": "'self'",
        "script-src": "'self'",
        "style-src": "'self'",
        "font-src": "'self'",
        "img-src": pictured(api),
        "media-src": sourced(api, "blob:"),
        "connect-src": `'self' ${reached.join(" ")}`,
        "object-src": "'none'",
        "base-uri": "'none'",
        "form-action": "'none'",
        ...directives,
    });

}
export function render ( template: string, values: Values ): string {

    return template.replace(placeholder, ( _, key: string ) => {

        const value = key.split(".").reduce<unknown>(( held, part ) => (json.isRecord(held) && Object.hasOwn(held, part) ? held[part] : undefined), values);
        const text: unknown = typeof value === "string" ? value : Array.isArray(value) && value.every(scalar) ? value.join(" ") : JSON.stringify(value);

        if ( typeof text !== "string" ) throw exception.fault("validation", "tool.render", { message: `the template names {{${key}}}, which was not given as text or json` });

        return Bun.escapeHTML(text);

    });

}
export function catalogs ( kept: readonly world.Catalog[] ): Bun.BunPlugin {

    const wanted = new Set<world.Catalog>(kept);

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
