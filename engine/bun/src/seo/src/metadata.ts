import * as date from "engine-date";
import * as string from "engine-string";

export type Site = {
    name: string;
    url: string;
    locale: string;
    locales?: readonly string[] | undefined;
    default?: string | undefined;
    hide?: boolean | undefined;
    description?: string | undefined;
    image?: string | undefined;
    twitter?: string | undefined;
    separator?: string | undefined;
};
export type Directives = {
    index?: boolean | undefined;
    follow?: boolean | undefined;
    archive?: boolean | undefined;
    translate?: boolean | undefined;
    snippet?: boolean | number | undefined;
    imagePreview?: "none" | "standard" | "large" | undefined;
    videoPreview?: number | undefined;
    until?: date.Input;
};
export type Page = {
    title?: string | undefined;
    description?: string | undefined;
    path?: string | undefined;
    image?: string | undefined;
    alt?: string | undefined;
    type?: "website" | "article" | "product" | "profile" | undefined;
    noindex?: boolean | undefined;
    robots?: Directives | undefined;
    published?: date.Input;
    modified?: date.Input;
    author?: string | undefined;
    section?: string | undefined;
    keywords?: readonly string[] | undefined;
};
export type Alternate = { locale: string; href: string };
export type Tag = { name: string; content: string } | { property: string; content: string } | { rel: string; href: string; hreflang?: string | undefined };
export type Metadata = {
    title: string;
    description: string | undefined;
    canonical: string;
    robots: string;
    keywords: string[];
    alternates: Alternate[];
    openGraph: Record<string, string>;
    twitter: Record<string, string>;
};
export type Shape = {
    name: string;
    url: string;
    locale: string;
    locales: readonly string[] | undefined;
    chosen: string | undefined;
    hide: boolean | undefined;
    root: string;
    lead: string;
    fallback: string;
    spoken: string;
    tongues: { name: string; lead: string }[];
};

const schemed = /^https?:\/\/[^\s/?#\\@<>"]+(?:\/[^\s?#\\<>"]*)?$/i;
const absolute = /^https?:\/\//i;
const schemey = /^[a-z][a-z0-9+.-]*:/i;
const easy = /^(?:\/[\w\-~!$&'()*+,;=:@.]+)*$/;
const needy = /[^\w\-.~!$&'()*+,;=:@/?#[\]%]|%(?![0-9A-Fa-f]{2})/;
const unsafe = /[^\w\-.~!$&'()*+,;=:@/?#[\]%]+/g;
const lone = /[\uD800-\uDFFF]/gu;
const loose = /%(?![0-9A-Fa-f]{2})/g;
const back = /\\/g;
const tagged = /^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*$/;
const regional = /^(?:[A-Za-z]{2}|\d{3})$/;
const day = /^\d{4}-\d{2}-\d{2}$/;
const handle = /^\w{1,15}$/;
const ending = /[\s,;:.!?\u060C\u061B\-\u2013\u2014]+$/;
const previews: readonly string[] = ["none", "standard", "large"];
const kinds: readonly string[] = ["website", "article", "product", "profile"];
const widest = 2_147_483_647;
const remembered = 64;
const shapes = new Map<string, Shape>();
let asked = "";
let answered = "";

function same ( a: readonly string[] | undefined, b: readonly string[] | undefined ): boolean {

    if ( a === b ) return true;
    if ( !a || !b || a.length !== b.length ) return false;

    for ( let at = 0; at < a.length; at += 1 ) if ( a[at] !== b[at] ) return false;

    return true;

}
function hyphened ( locale: string ): string {

    return locale.includes("_") ? locale.replace(/_/g, "-") : locale;

}
function named ( locale: string ): string {

    if ( typeof locale !== "string" || !tagged.test(locale) ) throw new RangeError("not a locale");

    return locale;

}
function spoken ( locale: string ): string {

    const [language = "", ...rest] = hyphened(locale).split("-");
    const region = rest.find(( part ) => regional.test(part));

    return region === undefined ? language.toLowerCase() : `${language.toLowerCase()}_${region.toUpperCase()}`;

}
function rooted ( base: string ): string {

    if ( base === asked && asked !== "" ) return answered;

    const text = typeof base === "string" ? base.trim() : "";
    let end = text.length;

    if ( !sound(text) || !schemed.test(text) ) throw new RangeError("not a site url");

    while ( text.charCodeAt(end - 1) === 47 ) end -= 1;

    const cut = text.indexOf("/", text.indexOf("//") + 2);

    asked = base;
    answered = cut === -1 || cut >= end ? text.slice(0, end) : `${text.slice(0, cut)}${encoded(text.slice(cut, end))}`;

    return answered;

}
function plain ( text: unknown ): string {

    return typeof text === "string" ? string.collapse(stripped(text)) : "";

}
function said ( text: string | undefined ): string | undefined {

    const out = plain(text);

    return out === "" ? undefined : out;

}
function counted ( value: unknown ): value is number {

    return typeof value === "number" && Number.isFinite(value) && value >= -1;

}
function handled ( name: string | undefined ): string | undefined {

    const text = typeof name === "string" ? name.trim().replace(/^@+/, "") : "";

    return handle.test(text) ? `@${text}` : undefined;

}
function unmarked ( text: string ): string {

    let out = "";
    let at = 0;

    while ( at < text.length ) {

        const open = text.indexOf("<", at);
        const close = open === -1 ? -1 : text.indexOf(">", open);

        if ( close === -1 ) break;

        out += `${text.slice(at, open)} `;
        at = close + 1;

    }

    return out + text.slice(at);

}
function linked ( shape: Shape, rest: string ): Alternate[] {

    const out: Alternate[] = [];

    for ( const tongue of shape.tongues ) out.push({ locale: tongue.name, href: `${shape.root}${tongue.lead}${rest}` });

    out.push({ locale: "x-default", href: `${shape.root}${shape.fallback}${rest}` });

    return out;

}

export function sound ( text: string ): boolean {

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code < 32 || code === 127 ) return false;

    }

    return true;

}
export function stripped ( text: string ): string {

    let out = "";

    if ( sound(text) ) return text;

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code >= 32 && code !== 127 ) out += text[at];

    }

    return out;

}
export function encoded ( text: string ): string {

    if ( !needy.test(text) ) return text;

    return text.replace(lone, "\uFFFD").replace(unsafe, ( run ) => encodeURIComponent(run)).replace(loose, "%25");

}
export function cleaned ( path: string | undefined ): string {

    const text = typeof path === "string" ? path : "";

    if ( easy.test(text) && !text.includes("/.") ) return text;

    const hash = text.indexOf("#");
    const whole = (hash === -1 ? text : text.slice(0, hash)).trim();
    const mark = whole.indexOf("?");
    const body = stripped(mark === -1 ? whole : whole.slice(0, mark)).replace(back, "/");
    const query = mark === -1 ? "" : stripped(whole.slice(mark));
    const segments: string[] = [];

    for ( const segment of body.split("/") ) {

        if ( segment === ".." ) segments.pop();
        else if ( segment !== "" && segment !== "." ) segments.push(segment);

    }

    return encoded(`${segments.length > 0 ? `/${segments.join("/")}` : ""}${query === "?" ? "" : query}`);

}
export function located ( root: string, target: string | undefined ): string | undefined {

    const text = typeof target === "string" ? target.trim() : "";

    if ( text === "" ) return undefined;
    if ( absolute.test(text) ) return encoded(stripped(text).replace(back, "/"));
    if ( text.startsWith("//") && text.charCodeAt(2) !== 47 ) return encoded(`https:${stripped(text).replace(back, "/")}`);
    if ( schemey.test(text) ) return undefined;

    return `${root}${cleaned(text)}`;

}
export function stamped ( value: date.Input ): string | undefined {

    const found = date.from(value);

    if ( !found ) return undefined;

    return typeof value === "string" && day.test(value) ? value : date.iso(found);

}
export function shaped ( site: Site ): Shape {

    const key = `${site.url} ${site.locale}`;
    const known = shapes.get(key);
    const name = plain(site.name);

    if ( known && known.name === name && known.url === site.url && known.locale === site.locale && known.chosen === site.default && known.hide === site.hide && same(known.locales, site.locales) ) return known;
    if ( name === "" ) throw new RangeError("not a site name");

    const main = hyphened(named(site.default ?? site.locale)).toLowerCase();
    const lead = ( locale: string ): string => (site.hide === true && hyphened(locale).toLowerCase() === main ? "" : `/${locale}`);
    const seen = new Set<string>();
    const tongues: Shape["tongues"] = [];

    for ( const locale of site.locales ?? [site.locale] ) {

        const name = hyphened(named(locale));
        const key = name.toLowerCase();

        if ( seen.has(key) ) continue;

        seen.add(key);
        tongues.push({ name, lead: lead(locale) });

    }

    const made: Shape = {
        name,
        url: site.url,
        locale: site.locale,
        locales: site.locales && [...site.locales],
        chosen: site.default,
        hide: site.hide,
        root: rooted(site.url),
        lead: lead(named(site.locale)),
        fallback: lead(site.default ?? site.locale),
        spoken: spoken(site.locale),
        tongues,
    };

    if ( shapes.size >= remembered ) shapes.clear();

    shapes.set(key, made);

    return made;

}
export function titleOf ( parts: readonly (string | undefined)[], separator = " · " ): string {

    const out: string[] = [];

    for ( const part of parts ) {

        const text = plain(part);

        if ( text !== "" && !out.includes(text) ) out.push(text);

    }

    return out.join(separator);

}
export function summary ( text: string, limit = 160 ): string {

    const size = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 160;
    const plain = typeof text === "string" ? string.collapse(string.unescapeHtml(unmarked(text))) : "";

    if ( plain.length <= size ) return plain;

    const space = plain.lastIndexOf(" ", size - 1);

    return space > size / 2 ? `${plain.slice(0, space).replace(ending, "")}…` : string.truncate(plain, size);

}
export function canonical ( base: string, path = "/", locale?: string ): string {

    return `${rooted(base)}${locale ? `/${named(locale)}` : ""}${cleaned(path)}`;

}
export function languageLinks ( site: Site, path = "/" ): Alternate[] {

    return linked(shaped(site), cleaned(path));

}
export function directives ( given: Directives = {} ): string {

    const listed = given.index !== false;
    const until = date.from(given.until);
    const out = [listed ? "index" : "noindex", given.follow === false ? "nofollow" : "follow"];

    if ( given.archive === false ) out.push("noarchive");
    if ( given.translate === false ) out.push("notranslate");
    if ( given.snippet === false ) out.push("nosnippet");
    if ( listed && counted(given.snippet) ) out.push(`max-snippet:${Math.min(widest, Math.trunc(given.snippet))}`);
    if ( listed && given.imagePreview !== undefined && previews.includes(given.imagePreview) ) out.push(`max-image-preview:${given.imagePreview}`);
    if ( listed && counted(given.videoPreview) ) out.push(`max-video-preview:${Math.min(widest, Math.trunc(given.videoPreview))}`);
    if ( until ) out.push(`unavailable_after: ${date.iso(until)}`);

    return out.join(", ");

}
export function metadata ( site: Site, page: Page = {} ): Metadata {

    const shape = shaped(site);
    const rest = cleaned(page.path);
    const title = titleOf([page.title, shape.name], site.separator);
    const description = said(page.description) ?? said(site.description);
    const image = located(shape.root, page.image) ?? located(shape.root, site.image);
    const alt = said(page.alt);
    const url = `${shape.root}${shape.lead}${rest}`;
    const owner = handled(site.twitter);
    const published = stamped(page.published);
    const modified = stamped(page.modified);
    const author = said(page.author);
    const section = said(page.section);
    const keywords: string[] = [];
    const openGraph: Record<string, string> = { "og:type": kinds.includes(page.type as string) ? (page.type as string) : "website", "og:title": title, "og:url": url, "og:site_name": shape.name, "og:locale": shape.spoken };
    const twitter: Record<string, string> = { "twitter:card": image ? "summary_large_image" : "summary", "twitter:title": title };

    for ( const keyword of page.keywords ?? [] ) {

        const text = said(keyword);

        if ( text !== undefined && !keywords.includes(text) ) keywords.push(text);

    }

    if ( description !== undefined ) {

        openGraph["og:description"] = description;
        twitter["twitter:description"] = description;

    }

    if ( image !== undefined ) {

        openGraph["og:image"] = image;
        twitter["twitter:image"] = image;

    }

    if ( image !== undefined && alt !== undefined ) {

        openGraph["og:image:alt"] = alt;
        twitter["twitter:image:alt"] = alt;

    }

    if ( owner !== undefined ) twitter["twitter:site"] = owner;
    if ( published !== undefined ) openGraph["article:published_time"] = published;
    if ( modified !== undefined ) openGraph["article:modified_time"] = modified;
    if ( author !== undefined ) openGraph["article:author"] = author;
    if ( section !== undefined ) openGraph["article:section"] = section;

    return {
        title,
        description,
        canonical: url,
        robots: directives(page.noindex ? { follow: false, ...page.robots, index: false } : { imagePreview: "large", ...page.robots }),
        keywords,
        alternates: linked(shape, rest),
        openGraph,
        twitter,
    };

}
export function tags ( made: Metadata ): Tag[] {

    const out: Tag[] = [];
    const own = made.openGraph["og:locale"];
    const others = new Set<string>();

    if ( made.description !== undefined ) out.push({ name: "description", content: made.description });
    if ( made.keywords.length > 0 ) out.push({ name: "keywords", content: made.keywords.join(", ") });

    out.push({ name: "robots", content: made.robots }, { rel: "canonical", href: made.canonical });

    for ( const link of made.alternates ) {

        out.push({ rel: "alternate", hreflang: link.locale, href: link.href });

        if ( link.locale !== "x-default" ) others.add(spoken(link.locale));

    }

    for ( const [property, content] of Object.entries(made.openGraph) ) out.push({ property, content });
    for ( const locale of others ) if ( locale !== own ) out.push({ property: "og:locale:alternate", content: locale });

    if ( made.openGraph["og:type"] === "article" ) for ( const keyword of made.keywords ) out.push({ property: "article:tag", content: keyword });

    for ( const [name, content] of Object.entries(made.twitter) ) out.push({ name, content });

    return out;

}
