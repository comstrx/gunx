import * as date from "engine-date";
import * as json from "engine-json";
import * as string from "engine-string";
import { cleaned, encoded, located, type Shape, type Site, shaped, stripped } from "./metadata.ts";

export type Frequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
export type Entry = { path: string; modified?: date.Input; frequency?: Frequency | undefined; priority?: number | undefined; localized?: boolean | undefined; images?: readonly string[] | undefined };
export type Listed = { path: string; modified?: date.Input };
export type Rule = { allow?: readonly string[] | undefined; disallow?: readonly string[] | undefined; delay?: number | undefined };
export type Robots = Rule & { sitemaps?: readonly string[] | undefined; agents?: Readonly<Record<string, Rule>> | undefined };
export type Icon = { src: string; sizes: string; type?: string | undefined; purpose?: string | undefined };
export type Shortcut = { name: string; url: string; shortName?: string | undefined; description?: string | undefined; icons?: readonly Icon[] | undefined };
export type Screenshot = { src: string; sizes: string; type?: string | undefined; form?: "wide" | "narrow" | undefined; label?: string | undefined };
export type Manifest = {
    name: string;
    shortName?: string | undefined;
    description?: string | undefined;
    id?: string | undefined;
    start?: string | undefined;
    scope?: string | undefined;
    theme: string;
    background: string;
    display?: "standalone" | "minimal-ui" | "browser" | "fullscreen" | undefined;
    orientation?: "any" | "natural" | "portrait" | "landscape" | undefined;
    icons: readonly Icon[];
    lang?: string | undefined;
    dir?: "ltr" | "rtl" | "auto" | undefined;
    categories?: readonly string[] | undefined;
    shortcuts?: readonly Shortcut[] | undefined;
    screenshots?: readonly Screenshot[] | undefined;
};

const most = 50_000;
const longest = 86_400;
const shots = 1000;
const marks = /[&<>"']/;
const often = new Set<string>(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
const head = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';
const list = '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

function xml ( text: string ): string {

    return marks.test(text) ? string.escapeHtml(text) : text;

}
function flat ( value: unknown ): string {

    return typeof value === "string" ? stripped(value).trim() : "";

}
function iconOf ( icon: Icon ): Partial<Icon> {

    return json.compact({ src: icon.src, sizes: icon.sizes, type: icon.type, purpose: icon.purpose });

}
function rows ( shape: Shape, entry: Entry, out: string[] ): void {

    const rest = cleaned(entry.path);
    const modified = date.from(entry.modified);
    const images = entry.images ?? [];
    let tail = "";
    let links = "";
    let seen = 0;

    if ( modified ) tail += `<lastmod>${date.plain(modified)}</lastmod>`;
    if ( entry.frequency !== undefined && often.has(entry.frequency) ) tail += `<changefreq>${entry.frequency}</changefreq>`;
    if ( typeof entry.priority === "number" && !Number.isNaN(entry.priority) ) tail += `<priority>${Math.min(1, Math.max(0, entry.priority)).toFixed(1)}</priority>`;

    for ( const image of images ) {

        const found = seen < shots ? located(shape.root, image) : undefined;

        if ( found === undefined ) continue;

        links += `<image:image><image:loc>${xml(found)}</image:loc></image:image>`;
        seen += 1;

    }

    if ( entry.localized === false ) {

        out.push(`<url><loc>${xml(`${shape.root}${rest}`)}</loc>${tail}${links}</url>`);

        return;

    }

    const hrefs = shape.tongues.map(( tongue ) => xml(`${shape.root}${tongue.lead}${rest}`));
    let others = "";

    if ( hrefs.length > 1 ) {

        for ( let at = 0; at < hrefs.length; at += 1 ) others += `<xhtml:link rel="alternate" hreflang="${shape.tongues[at]?.name ?? ""}" href="${hrefs[at] ?? ""}"/>`;

        others += `<xhtml:link rel="alternate" hreflang="x-default" href="${xml(`${shape.root}${shape.fallback}${rest}`)}"/>`;

    }

    for ( const href of hrefs ) out.push(`<url><loc>${href}</loc>${tail}${others}${links}</url>`);

}
function ruled ( lines: string[], agent: string, rule: Rule, open: boolean ): void {

    lines.push(`User-agent: ${agent}`);

    for ( const path of rule.allow ?? (open ? ["/"] : []) ) if ( flat(path) !== "" ) lines.push(`Allow: ${encoded(flat(path))}`);
    for ( const path of rule.disallow ?? [] ) if ( flat(path) !== "" ) lines.push(`Disallow: ${encoded(flat(path))}`);

    if ( typeof rule.delay === "number" && Number.isFinite(rule.delay) && rule.delay > 0 ) lines.push(`Crawl-delay: ${Math.min(longest, Math.ceil(rule.delay))}`);

}

export function sitemap ( site: Site, entries: readonly Entry[] ): string {

    const shape = shaped(site);
    const urls: string[] = [];

    for ( const entry of entries ) rows(shape, entry, urls);

    if ( urls.length > most ) throw new RangeError("not a sitemap");

    return `${head}${urls.join("")}</urlset>`;

}
export function sitemaps ( site: Site, entries: readonly Entry[], size = most ): string[] {

    const shape = shaped(site);
    const room = Number.isFinite(size) ? Math.max(1, Math.min(most, Math.trunc(size))) : most;
    const out: string[] = [];
    let urls: string[] = [];

    for ( const entry of entries ) {

        const made: string[] = [];

        rows(shape, entry, made);

        if ( urls.length > 0 && urls.length + made.length > room ) {

            out.push(`${head}${urls.join("")}</urlset>`);
            urls = [];

        }

        for ( const url of made ) urls.push(url);

    }

    if ( urls.length > 0 || out.length === 0 ) out.push(`${head}${urls.join("")}</urlset>`);

    return out;

}
export function sitemapIndex ( site: Site, files: readonly (string | Listed)[] ): string {

    const shape = shaped(site);
    let out = list;

    for ( const file of files ) {

        const found = located(shape.root, typeof file === "string" ? file : file.path);
        const modified = typeof file === "string" ? undefined : date.from(file.modified);

        if ( found !== undefined ) out += `<sitemap><loc>${xml(found)}</loc>${modified ? `<lastmod>${date.plain(modified)}</lastmod>` : ""}</sitemap>`;

    }

    return `${out}</sitemapindex>`;

}
export function robots ( site: Site, rules: Robots = {} ): string {

    const shape = shaped(site);
    const lines: string[] = [];
    const maps: string[] = [];

    ruled(lines, "*", rules, true);

    for ( const [agent, rule] of Object.entries(rules.agents ?? {}) ) {

        const name = flat(agent);

        if ( name === "" ) continue;

        lines.push("");
        ruled(lines, name, rule, false);

    }

    for ( const path of rules.sitemaps ?? ["/sitemap.xml"] ) {

        const found = located(shape.root, flat(path));

        if ( found !== undefined ) maps.push(`Sitemap: ${found}`);

    }

    if ( maps.length > 0 ) lines.push("", ...maps);

    return `${lines.join("\n")}\n`;

}
export function manifest ( given: Manifest ): string {

    return json.stringify(json.compact({
        name: given.name,
        short_name: given.shortName ?? given.name,
        description: given.description,
        id: given.id,
        start_url: given.start ?? "/",
        scope: given.scope,
        display: given.display ?? "standalone",
        orientation: given.orientation,
        theme_color: given.theme,
        background_color: given.background,
        lang: given.lang,
        dir: given.dir,
        categories: given.categories && given.categories.length > 0 ? [...given.categories] : undefined,
        icons: given.icons.map(iconOf),
        shortcuts: given.shortcuts?.map(( item ) => json.compact({ name: item.name, short_name: item.shortName, description: item.description, url: item.url, icons: item.icons?.map(iconOf) })),
        screenshots: given.screenshots?.map(( item ) => json.compact({ src: item.src, sizes: item.sizes, type: item.type, form_factor: item.form, label: item.label })),
    }), { pretty: true });

}
