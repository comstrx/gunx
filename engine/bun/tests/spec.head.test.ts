import { describe, expect, test as it } from "bun:test";
import type * as seo from "engine/seo";
import * as spec from "engine/spec";

type Node = { tag: string; held: Record<string, string>; hasAttribute: ( name: string ) => boolean; getAttribute: ( name: string ) => string | null; setAttribute: ( name: string, value: string ) => void; remove: () => void };
type Page = { nodes: Node[]; observed: number; stopped: number; changed: () => void };

const meta: spec.Meta = { title: "Orders · Shop", description: "Every order", robots: "index, follow", canonical: undefined, alternates: [], openGraph: {} };

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

        const found = /^(\w+)\[(\w+)="([^"]+)"\]$/.exec(selector);

        return found === null ? [] : page.nodes.filter(( one ) => one.tag === found[1] && one.held[found[2] ?? ""] === found[3]);

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

            spec.publish({ ...meta, canonical: "https://shop.example.test/" })();

            expect(told(page).filter(( line ) => line.includes("example"))).toEqual(["link canonical=https://shop.example.test/ own", "meta og:url=https://shop.example.test/ own"]);

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

        spec.publish({ ...meta, canonical: "https://shop.example.test/a" })();
        restore();

        expect([seen[0]?.length, seen[0]?.at(-1), released, spec.head.bound()]).toEqual([8, { rel: "canonical", href: "https://shop.example.test/a" }, 1, false]);

    });

});
