import * as device from "engine-device";
import * as exception from "engine-exception";
import type * as seo from "engine-seo";
import type { Head, HeadNode, HeadPage, HeadTag, Meta } from "./arch.ts";

const owned = "data-surface-head";
const idle = (): void => undefined;

function placed ( tag: seo.Tag ): HeadTag {

    if ( "rel" in tag ) return { selector: `link[rel="${tag.rel}"]`, tag: "link", key: "rel", name: tag.rel, attribute: "href", value: tag.href };
    if ( "property" in tag ) return { selector: `meta[property="${tag.property}"]`, tag: "meta", key: "property", name: tag.property, attribute: "content", value: tag.content };

    return { selector: `meta[name="${tag.name}"]`, tag: "meta", key: "name", name: tag.name, attribute: "content", value: tag.content };

}
function wanted ( meta: Meta, here: string | undefined ): seo.Tag[] {

    const address = meta.canonical ?? here;
    const told: seo.Tag[] = [
        { name: "description", content: meta.description },
        { name: "robots", content: meta.robots },
        { name: "twitter:title", content: meta.title },
        { name: "twitter:description", content: meta.description },
        { property: "og:title", content: meta.title },
        { property: "og:description", content: meta.description },
    ];

    return address === undefined ? told : [...told, { property: "og:url", content: address }, { rel: "canonical", href: address }];

}
function paged ( tags: seo.Tag[] ): () => void {

    const page = device.host<HeadPage>();
    const sheet = page.document;
    const top = sheet?.head;

    if ( !sheet || !top ) return idle;

    const told = tags.map(placed);
    const sync = (): void => {

        for ( const one of told ) {

            const found = [...top.querySelectorAll(one.selector)];
            const foreign = found.filter(( node ) => !node.hasAttribute(owned));
            const mine = found.filter(( node ) => node.hasAttribute(owned));

            for ( const node of foreign ) if ( node.getAttribute(one.attribute) !== one.value ) node.setAttribute(one.attribute, one.value);
            for ( const node of foreign.length > 0 ? mine : mine.slice(1) ) node.remove();

            if ( foreign.length > 0 ) continue;

            const made: HeadNode = mine[0] ?? sheet.createElement(one.tag);

            if ( mine[0] === undefined ) top.appendChild(made);

            made.setAttribute(owned, "");
            made.setAttribute(one.key, one.name);

            if ( made.getAttribute(one.attribute) !== one.value ) made.setAttribute(one.attribute, one.value);

        }

    };

    sync();

    if ( !page.MutationObserver ) return idle;

    const watcher = new page.MutationObserver(sync);

    watcher.observe(top, { childList: true });

    return () => watcher.disconnect();

}

export const head: exception.Slot<Head> = exception.slot<Head>("spec.head", { fallback: () => paged });

export function publish ( meta: Meta | undefined ): () => void {

    return meta === undefined ? idle : head.get()(wanted(meta, device.host<HeadPage>().document?.location?.href));

}
