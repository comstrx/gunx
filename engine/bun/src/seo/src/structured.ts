import type * as date from "engine-date";
import * as json from "engine-json";
import { cleaned, located, type Site, shaped, stamped } from "./metadata.ts";

export type Thing = json.Dictionary & { "@type": string };
export type Crumb = { name: string; path: string };
export type Rating = { value: number; count: number; best?: number | undefined };
export type Address = { street?: string | undefined; city?: string | undefined; region?: string | undefined; postal?: string | undefined; country?: string | undefined };
export type Asked = { question: string; answer: string };
export type Known = { logo?: string | undefined; description?: string | undefined; sameAs?: readonly string[] | undefined; email?: string | undefined; phone?: string | undefined };
export type Viewed = { title: string; path?: string | undefined; description?: string | undefined; modified?: date.Input };
export type Sold = {
    name: string;
    path: string;
    description?: string | undefined;
    image?: string | readonly string[] | undefined;
    sku?: string | undefined;
    brand?: string | undefined;
    price: string | number;
    currency: string;
    available?: boolean | undefined;
    rating?: Rating | undefined;
};
export type Written = {
    title: string;
    path: string;
    description?: string | undefined;
    image?: string | undefined;
    published?: date.Input;
    modified?: date.Input;
    author?: string | undefined;
    section?: string | undefined;
};
export type Placed = {
    type?: string | undefined;
    path?: string | undefined;
    image?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
    priceRange?: string | undefined;
    address?: Address | undefined;
    point?: { lat: number; lng: number } | undefined;
    hours?: readonly string[] | undefined;
};

const context = "https://schema.org";
const risky = /[<>&\u2028\u2029]/g;
const risked = /[<>&\u2028\u2029]/;
const tailed = /[?#]/;
const amount = /^\d{1,15}(?:\.\d{1,6})?$/;
const coin = /^[A-Za-z]{3}$/;

function priced ( value: string | number ): string {

    const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";

    if ( !amount.test(text) ) throw new RangeError("not a price");

    return text;

}
function coined ( code: string ): string {

    if ( typeof code !== "string" || !coin.test(code) ) throw new RangeError("not a currency");

    return code.toUpperCase();

}
function pictures ( root: string, image: string | readonly string[] | undefined ): string | string[] | undefined {

    if ( image === undefined || typeof image === "string" ) return located(root, image);

    const out: string[] = [];

    for ( const item of image ) {

        const found = located(root, item);

        if ( found !== undefined && !out.includes(found) ) out.push(found);

    }

    return out.length === 0 ? undefined : out;

}
function rated ( rating: Rating | undefined ): json.Dictionary | undefined {

    if ( !rating || !Number.isFinite(rating.value) || !Number.isInteger(rating.count) || rating.count < 1 ) return undefined;

    return json.compact({ "@type": "AggregateRating", ratingValue: rating.value, reviewCount: rating.count, bestRating: Number.isFinite(rating.best) ? rating.best : undefined });

}
function spotted ( point: Placed["point"] ): json.Dictionary | undefined {

    if ( !point || !(Math.abs(point.lat) <= 90) || !(Math.abs(point.lng) <= 180) ) return undefined;

    return { "@type": "GeoCoordinates", latitude: point.lat, longitude: point.lng };

}
function housed ( address: Address | undefined ): json.Dictionary | undefined {

    if ( !address ) return undefined;

    return json.compact({ "@type": "PostalAddress", streetAddress: address.street, addressLocality: address.city, addressRegion: address.region, postalCode: address.postal, addressCountry: address.country });

}

export function jsonLd ( ...things: readonly Thing[] ): string {

    const graph = things.map(( thing ) => {

        const out: json.Dictionary = { "@context": context, ...thing };

        out["@context"] = context;

        return out;

    });
    const text = json.stringify(graph.length === 1 ? graph[0] : graph);

    return risked.test(text) ? text.replace(risky, ( mark ) => `\\u${mark.charCodeAt(0).toString(16).padStart(4, "0")}`) : text;

}
export function organization ( site: Site, extra: Known = {} ): Thing {

    const shape = shaped(site);

    return json.compact({
        "@type": "Organization",
        name: shape.name,
        url: shape.root,
        logo: located(shape.root, extra.logo) ?? located(shape.root, site.image),
        description: extra.description,
        sameAs: extra.sameAs,
        email: extra.email,
        telephone: extra.phone,
    }) as Thing;

}
export function website ( site: Site, search?: string ): Thing {

    const shape = shaped(site);
    const thing: Thing = { "@type": "WebSite", name: shape.name, url: shape.root, inLanguage: site.locale };
    const target = search ? `${shape.root}${cleaned(search)}` : "";

    if ( target !== "" ) thing.potentialAction = { "@type": "SearchAction", target: `${target}${target.includes("?") ? "&" : "?"}q={search_term_string}`, "query-input": "required name=search_term_string" };

    return thing;

}
export function webPage ( site: Site, page: Viewed ): Thing {

    const shape = shaped(site);

    return json.compact({
        "@type": "WebPage",
        name: page.title,
        url: `${shape.root}${shape.lead}${cleaned(page.path)}`,
        description: page.description,
        dateModified: stamped(page.modified),
        inLanguage: site.locale,
        isPartOf: { "@type": "WebSite", url: shape.root },
    }) as Thing;

}
export function breadcrumbs ( site: Site, items: readonly Crumb[] ): Thing {

    const shape = shaped(site);

    return {
        "@type": "BreadcrumbList",
        itemListElement: items.map(( item, index ) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: `${shape.root}${shape.lead}${cleaned(item.path)}` })),
    };

}
export function itemList ( site: Site, items: readonly { path: string; name?: string | undefined }[] ): Thing {

    const shape = shaped(site);

    return {
        "@type": "ItemList",
        numberOfItems: items.length,
        itemListElement: items.map(( item, index ) => json.compact({ "@type": "ListItem", position: index + 1, name: item.name, url: `${shape.root}${shape.lead}${cleaned(item.path)}` })),
    };

}
export function product ( site: Site, given: Sold ): Thing {

    const shape = shaped(site);
    const url = `${shape.root}${shape.lead}${cleaned(given.path)}`;

    return json.compact({
        "@type": "Product",
        name: given.name,
        description: given.description,
        image: pictures(shape.root, given.image),
        sku: given.sku,
        brand: given.brand === undefined ? undefined : { "@type": "Brand", name: given.brand },
        url,
        aggregateRating: rated(given.rating),
        offers: { "@type": "Offer", price: priced(given.price), priceCurrency: coined(given.currency), availability: given.available === false ? `${context}/OutOfStock` : `${context}/InStock`, url },
    }) as Thing;

}
export function article ( site: Site, given: Written ): Thing {

    const shape = shaped(site);
    const url = `${shape.root}${shape.lead}${cleaned(given.path)}`;
    const published = stamped(given.published);

    return json.compact({
        "@type": "Article",
        headline: given.title,
        description: given.description,
        image: located(shape.root, given.image) ?? located(shape.root, site.image),
        datePublished: published,
        dateModified: stamped(given.modified) ?? published,
        articleSection: given.section,
        inLanguage: site.locale,
        author: given.author === undefined ? undefined : { "@type": "Person", name: given.author },
        publisher: json.compact({ "@type": "Organization", name: shape.name, logo: located(shape.root, site.image) }),
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        url,
    }) as Thing;

}
export function faq ( items: readonly Asked[] ): Thing {

    return { "@type": "FAQPage", mainEntity: items.map(( item ) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) };

}
export function business ( site: Site, given: Placed = {} ): Thing {

    const shape = shaped(site);

    return json.compact({
        "@type": typeof given.type === "string" && given.type.trim() !== "" ? given.type.trim() : "LocalBusiness",
        name: shape.name,
        url: `${shape.root}${shape.lead}${cleaned(given.path)}`,
        image: located(shape.root, given.image) ?? located(shape.root, site.image),
        telephone: given.phone,
        email: given.email,
        priceRange: given.priceRange,
        address: housed(given.address),
        geo: spotted(given.point),
        openingHours: given.hours && given.hours.length > 0 ? [...given.hours] : undefined,
    }) as Thing;

}
export function ancestors ( path: string ): string[] {

    const text = typeof path === "string" ? path : "";
    const cut = text.search(tailed);
    const out = ["/"];
    let at = "";

    for ( const segment of cleaned(cut === -1 ? text : text.slice(0, cut)).split("/") ) {

        if ( segment === "" ) continue;

        at += `/${segment}`;
        out.push(at);

    }

    return out;

}
