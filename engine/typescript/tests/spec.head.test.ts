import { describe, expect, test as it } from "bun:test";
import type * as seo from "engine/seo";
import * as spec from "engine/spec";

type Node = { tag: string; held: Record<string, string>; hasAttribute: ( name: string ) => boolean; getAttribute: ( name: string ) => string | null; setAttribute: ( name: string, value: string ) => void; remove: () => void };
type Page = { nodes: Node[]; observed: number; stopped: number; changed: () => void };

const tags: seo.Tag[] = [{ name: "description", content: "Every order" }, { name: "robots", content: "index, follow" }, { name: "twitter:title", content: "Orders · Shop" }, { name: "twitter:description", content: "Every order" }, { property: "og:title", content: "Orders · Shop" }, { property: "og:description", content: "Every order" }];
const meta: spec.Meta = { title: "Orders · Shop", description: "Every order", robots: "index, follow", canonical: undefined, alternates: [], openGraph: {}, twitter: {}, keywords: [], tags };
const placed = ( address: string ): spec.Meta => ({ ...meta, canonical: address, tags: [...tags, { property: "og:url", content: address }, { rel: "alternate", hreflang: "ar", href: `${address}?ar` }, { rel: "canonical", href: address }] });

function staged<T> ( work: ( page: Page ) => T, given: { watcher?: boolean; head?: boolean } = {} ): T {

    const target = globalThis as Record<string, unknown>;
    const names = ["document", "MutationObserver"];
    const before = names.map(( name ) => Object.getOwnPropertyDescriptor(target, name));
    const page: Page = { nodes: [], observed: 0, stopped: 0, changed: () => undefined };
    const node = ( tag: string, held: Record<string, string> = {} ): Node => {

        const made: Node = {
            tag,
            held,
            hasAttribute: ( name ) => Object.hasOwn(made.held, name),
            getAttribute: ( name ) => made.held[name] ?? null,
            setAttribute: ( name, value ) => {

                made.held[name] = value;

            },
            remove: () => {

                page.nodes.splice(page.nodes.indexOf(made), 1);

            },
        };

        return made;

    };
    const matched = ( selector: string ): Node[] => {

        const found = /^(\w+)\[(\w+)="([^"]+)"\](?::not\(\[(\w+)\]\)|\[(\w+)="([^"]+)"\])?$/.exec(selector);

        if ( found === null ) return [];

        return page.nodes.filter(( one ) => one.tag === found[1] && one.held[found[2] ?? ""] === found[3] && (found[4] === undefined || !Object.hasOwn(one.held, found[4])) && (found[5] === undefined || one.held[found[5]] === found[6]));

    };
    const put = ( name: string, value: unknown ): void => void Object.defineProperty(target, name, { value, configurable: true, writable: true });

    page.nodes.push(node("meta", { name: "description", content: "stale" }), node("meta", { name: "robots", content: "old", "data-surface-head": "" }), node("meta", { name: "robots", content: "older", "data-surface-head": "" }));
    put("document", { head: given.head === false ? undefined : { querySelectorAll: matched, appendChild: ( made: Node ) => page.nodes.push(made) }, createElement: node, location: { href: "https://shop.example.test/orders" } });
    put("MutationObserver", given.watcher === false ? undefined : class {

        constructor ( work: () => void ) { page.changed = work; }

        observe (): void { page.observed += 1; }

        disconnect (): void { page.stopped += 1; }

    });

    try {

        return work(page);

    } finally {

        names.forEach(( name, index ) => {

            const was = before[index];

            if ( was ) Object.defineProperty(target, name, was);
            else delete target[name];

        });

    }

}
function told ( page: Page ): string[] {

    return page.nodes.map(( one ) => `${one.tag} ${one.held.name ?? one.held.property ?? one.held.rel}=${one.held.content ?? one.held.href}${Object.hasOwn(one.held, "data-surface-head") ? " own" : ""}`).sort();

}

describe("head", () => {

    it("publishes a screen's meta into the page head: a foreign tag is corrected, its own tags are kept single, the rest are made", () => {

        staged(( page ) => {

            const release = spec.publish(meta);
            const first = told(page);

            expect(first).toEqual([
                "link canonical=https://shop.example.test/orders own",
                "meta description=Every order",
                "meta og:description=Every order own",
                "meta og:title=Orders · Shop own",
                "meta og:url=https://shop.example.test/orders own",
                "meta robots=index, follow own",
                "meta twitter:description=Every order own",
                "meta twitter:title=Orders · Shop own",
            ]);

            page.nodes.splice(0, 1);
            page.changed();

            expect(told(page)).toEqual([...first.filter(( line ) => line !== "meta description=Every order"), "meta description=Every order own"].sort());
            expect([page.observed, page.stopped]).toEqual([1, 0]);

            release();

            expect(page.stopped).toBe(1);

        });

    });
    it("a canonical address wins over the page's own; no meta, no head or no watcher is quiet", () => {

        staged(( page ) => {

            spec.publish(placed("https://shop.example.test/"))();

            expect(told(page).filter(( line ) => line.includes("example"))).toEqual(["link alternate=https://shop.example.test/?ar own", "link canonical=https://shop.example.test/ own", "meta og:url=https://shop.example.test/ own"]);
            expect(page.nodes.find(( one ) => one.held.rel === "alternate")?.held.hreflang).toBe("ar");

        });
        staged(( page ) => {

            spec.publish(undefined)();
            spec.publish(meta)();

            expect([page.nodes.length, page.observed]).toEqual([8, 0]);

        }, { watcher: false });
        staged(( page ) => {

            spec.publish(meta)();

            expect(page.nodes.length).toBe(3);

        }, { head: false });

        expect(() => spec.publish(meta)()).not.toThrow();

    });
    it("a bound head receives the tags instead of the page", () => {

        const seen: seo.Tag[][] = [];
        let released = 0;
        const restore = spec.head.use(( tags ) => {

            seen.push(tags);

            return () => {

                released += 1;

            };

        });

        spec.publish(placed("https://shop.example.test/a"))();
        restore();

        expect([seen[0]?.length, seen[0]?.at(-1), released, spec.head.bound()]).toEqual([9, { rel: "canonical", href: "https://shop.example.test/a" }, 1, false]);

    });

});
