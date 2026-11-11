import { describe, expect, test as it } from "bun:test";
import * as history from "engine/history";
import * as fc from "fast-check";

type Row = { href: string; state: unknown };
type Pop = ( event: { state: unknown } ) => void;
type Host = NonNullable<Parameters<typeof history.webAdapter>[0]>;
type Told = { href: string; index: number; action: history.Action; from: string };
type Scene = { size: number; home: number; tour: boolean; moves: number[]; late: { at: number; delta: number }[]; push: number | undefined };
type Act = { kind: "push" | "replace"; path: string; state: unknown } | { kind: "go"; delta: number } | { kind: "bar"; path: string; on: boolean };
type Deed = { kind: "push" | "replace"; state: number } | { kind: "go"; delta: number };

const runs = 10_000;
const origin = "https://app.example";
const base = `${origin}/zz/`;
const cap = 400;
const kept = /[A-Za-z0-9._~!$&'()*+,;=:@-]/;
const legal = /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]|%[0-9A-Fa-f]{2})*(?:\?(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|%[0-9A-Fa-f]{2})*)?(?:#(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|%[0-9A-Fa-f]{2})*)?$/;
const reserved = new Set<string>(["__proto__", "constructor", "prototype"]);
const rough = fc.array(fc.oneof(
    fc.constantFrom(..."//..%%??##&&==++\\ :@;,'\"<>[]{}|^`~!$*()-_abAB019"),
    fc.constantFrom("%2e", "%2E", "%2f", "%5c", "%00", "%25", "%zz", "%e0%a4", "\t", "\n", "\r", "\u0000", "\u001f", "\u007f", "é", "م", "☃", String.fromCodePoint(0x1f600), String.fromCharCode(0xd800), String.fromCharCode(0xdfff), "javascript:", "https://", "//evil.example", "\\\\evil.example"),
), { maxLength: 14 }).map(( parts ) => parts.join(""));
const dotted = fc.tuple(
    fc.array(fc.oneof(fc.constantFrom(".", "..", "%2e", "%2E%2e", ".%2E", "%2e.", "...", "", "a", "é", "a b"), fc.stringMatching(/^[ab.]{1,3}$/)), { maxLength: 6 }),
    fc.constantFrom("/", "/", "\\"),
    fc.constantFrom("", "/", "/..", "?a=1", "#top", "/?a=1#top", "/..?..#.."),
).map(( [parts, slash, end] ) => `/${parts.join(slash)}${end}`);
const wild = fc.oneof(rough, dotted, fc.string({ maxLength: 48 }), fc.string({ unit: "binary", maxLength: 24 }));
const word = fc.string({ unit: "binary", maxLength: 6 });
const segment = word.filter(( text ) => text !== "" && text !== "." && text !== ".." && !/[/\\?#%]/.test(text));
const key = word.filter(( text ) => text !== "" && !text.endsWith("[]") && !reserved.has(text));
const name = fc.stringMatching(/^[ab]{1,3}$/);
const tail = fc.constantFrom("", "/", "?a=1", "#top", "/?a=1#top");
const limit = fc.oneof(fc.integer({ min: 1, max: 5 }), fc.constantFrom(0, -3, 2.9, Number.NaN, Number.POSITIVE_INFINITY));
const deed: fc.Arbitrary<Deed> = fc.oneof(
    fc.record({ kind: fc.constantFrom("push" as const, "replace" as const), state: fc.nat({ max: 9 }) }),
    fc.record({ kind: fc.constant("go" as const), delta: fc.integer({ min: -4, max: 4 }) }),
);
const place = fc.constantFrom("/a", "/b", "/c", "/d");
const act: fc.Arbitrary<Act> = fc.oneof(
    fc.record({ kind: fc.constantFrom("push" as const, "replace" as const), path: place, state: fc.oneof(fc.constantFrom(null, 0, "s", true), fc.record({ n: fc.nat({ max: 9 }) })) }),
    fc.record({ kind: fc.constant("go" as const), delta: fc.integer({ min: -3, max: 3 }) }),
    fc.record({ kind: fc.constant("bar" as const), path: place, on: fc.boolean() }),
);
const target = fc.oneof(wild, fc.record({
    path: wild,
    query: fc.dictionary(fc.oneof(rough, fc.constantFrom("constructor", "a[]", "")), fc.oneof(rough, fc.array(rough, { maxLength: 3 })), { maxKeys: 3, noNullPrototype: true }),
    hash: wild,
}, { requiredKeys: [] }));
const foreign = fc.oneof(fc.jsonValue(), fc.record({
    other: fc.nat({ max: 9 }),
    engine: fc.oneof(fc.jsonValue(), fc.record({ at: fc.oneof(fc.integer({ min: -3, max: 9 }), fc.constantFrom(1.5, Number.NaN, "1", null, 2 ** 53)), state: fc.jsonValue() }, { requiredKeys: ["at"] })),
}, { requiredKeys: [] }));
const scene: fc.Arbitrary<Scene> = fc.record({
    size: fc.integer({ min: 1, max: 6 }),
    home: fc.nat({ max: 5 }),
    tour: fc.boolean(),
    moves: fc.array(fc.integer({ min: -6, max: 6 }), { minLength: 1, maxLength: 4 }),
    late: fc.array(fc.record({ at: fc.integer({ min: 1, max: 8 }), delta: fc.integer({ min: -6, max: 6 }) }), { maxLength: 3 }),
    push: fc.option(fc.nat({ max: 8 }), { nil: undefined }),
}).map(( made ) => ({ ...made, home: made.home % made.size }));

function record ( value: unknown ): value is Record<string, unknown> {

    return typeof value === "object" && value !== null && !Array.isArray(value);

}
function room ( given: number ): number {

    return Number.isFinite(given) ? Math.max(1, Math.trunc(given)) : 100;

}
function stripped ( text: string ): string {

    let from = 0;
    let to = text.length;

    while ( from < to && text.charCodeAt(from) <= 32 ) from += 1;
    while ( to > from && text.charCodeAt(to - 1) <= 32 ) to -= 1;

    return text.slice(from, to).replaceAll("\t", "").replaceAll("\n", "").replaceAll("\r", "");

}
function browser ( start: string ) {

    const rows: Row[] = [{ href: start, state: null }];
    const handlers = new Set<Pop>();
    const pending: number[] = [];
    let at = 0;
    const here = (): string => rows[at]?.href ?? "/";
    const host = {
        location: {
            get pathname () { return here().split(/[?#]/)[0] ?? "/"; },
            get search () { return here().split("#")[0]?.match(/\?.*$/)?.[0] ?? ""; },
            get hash () { return here().match(/#.*$/)?.[0] ?? ""; },
        },
        history: {
            get state () { return rows[at]?.state; },
            pushState ( state: unknown, _title: string, href: string ) {

                rows.splice(at + 1);
                rows.push({ href, state });
                at = rows.length - 1;

            },
            replaceState ( state: unknown, _title: string, href: string ) {

                rows[at] = { href, state };

            },
            go ( delta: number ) {

                pending.push(delta);

            },
        },
        addEventListener ( kind: string, handler: Pop ) {

            if ( kind === "popstate" ) handlers.add(handler);

        },
        removeEventListener ( _kind: string, handler: Pop ) {

            handlers.delete(handler);

        },
    };
    const found = history.webAdapter(host as unknown as Host);

    if ( !found ) throw new Error("no web adapter");

    return {
        adapter: found,
        where: here,
        at: () => at,
        owed: () => pending.length,
        user: ( delta: number ) => pending.push(delta),
        arrive: (): void => {

            const delta = pending.shift() ?? 0;
            const next = at + delta;

            if ( !delta || next < 0 || next >= rows.length ) return;

            at = next;

            for ( const handler of [...handlers] ) handler({ state: rows[at]?.state });

        },
    };

}
function play ( made: Scene, guard: history.Block ) {

    const web = browser("/p0");
    const nav = history.create(web.adapter);
    const told: Told[] = [];
    const glimpsed = new Set<string>();
    const hop = ( delta: number ): void => {

        if ( delta === 0 ) return;

        web.user(delta);
        web.arrive();

    };
    let steps = 0;
    let pushed = false;

    for ( let index = 1; index < made.size; index += 1 ) nav.push(`/p${index}`);

    if ( made.tour ) hop(-web.at());

    hop(made.home - web.at());
    nav.listen(( entry, action, previous ) => told.push({ href: entry.href, index: entry.index, action, from: previous.href }));
    nav.block(guard);

    for ( const delta of made.moves ) web.user(delta);

    if ( made.push === 0 ) {

        nav.push("/q");
        pushed = true;

    }

    while ( web.owed() > 0 && steps < cap ) {

        web.arrive();
        glimpsed.add(nav.current().href);
        steps += 1;

        for ( const item of made.late ) if ( item.at === steps ) web.user(item.delta);

        if ( made.push === steps ) {

            nav.push("/q");
            pushed = true;

        }

    }

    return { web, nav, told, pushed, glimpsed };

}

describe("fuzz history", () => {

    it("any text formats to a fixed point that the URL parser reads the same way", () => {

        fc.assert(
            fc.property(wild, ( text ) => {

                const once = history.parse(text);
                const href = history.format(once);
                const url = new URL(href, base);
                const wanted = new URLSearchParams();

                for ( const found of Object.keys(once.query).sort() ) for ( const item of [once.query[found] ?? []].flat() ) wanted.append(found, item);

                expect(history.format(history.parse(href))).toBe(href);
                expect(href).toMatch(legal);
                expect(url.origin).toBe(origin);
                expect(url.pathname).toBe(once.path);
                expect([...url.searchParams]).toEqual([...wanted]);
                expect(decodeURIComponent(url.hash.slice(1))).toBe(once.hash.toWellFormed());

            }),
            { numRuns: runs * 2 },
        );

    });
    it("local accepts exactly the references that stay on the origin", () => {

        fc.assert(
            fc.property(wild, ( text ) => {

                const found = history.local(text);
                let inside = false;

                try {

                    inside = stripped(text).startsWith("/") && new URL(text, base).origin === origin;

                } catch {

                    inside = false;

                }

                expect(found !== undefined).toBe(inside);

                if ( found ) {

                    expect(found).toEqual(history.parse(text));
                    expect(history.parse(new URL(text, base).pathname).path).toBe(found.path);

                }

            }),
            { numRuns: runs * 2 },
        );

    });
    it("a structured href survives format then parse", () => {

        fc.assert(
            fc.property(fc.array(segment, { maxLength: 4 }), fc.dictionary(key, fc.oneof(word, fc.array(word, { minLength: 2, maxLength: 3 })), { maxKeys: 4, noNullPrototype: true }), word, ( parts, query, hash ) => {

                const path = `/${parts.map(( part ) => Array.from(part, ( point ) => (kept.test(point) ? point : encodeURIComponent(point))).join("")).join("/")}`;
                const href = history.format({ path: `/${parts.join("/")}`, query, hash });

                expect(history.parse(href)).toEqual({ path, query, hash });
                expect(history.format(history.parse(href))).toBe(href);
                expect(history.local(href)).toEqual({ path, query, hash });

            }),
            { numRuns: runs },
        );

    });
    it("isCurrent is a whole-segment prefix test", () => {

        fc.assert(
            fc.property(fc.array(name, { maxLength: 3 }), fc.array(name, { maxLength: 1 }), fc.array(name, { maxLength: 2 }), tail, tail, fc.boolean(), ( shared, mine, theirs, left, right, exact ) => {

                const wanted = [...shared, ...mine];
                const now = [...shared, ...theirs];
                const starts = wanted.every(( part, index ) => now[index] === part);
                const expected = exact || wanted.length === 0 ? starts && wanted.length === now.length : starts;
                const path = `/${wanted.join("/")}${left}`;
                const current = `/${now.join("/")}${right}`;

                expect(history.isCurrent(path, current, exact)).toBe(expected);
                expect(history.create(history.memoryAdapter(current)).isCurrent(path, exact)).toBe(expected);

            }),
            { numRuns: runs },
        );

    });
    it("the memory adapter is a capped stack and a snapshot restores a window around its entry", () => {

        fc.assert(
            fc.property(limit, limit, fc.array(deed, { maxLength: 24 }), ( first, second, deeds ) => {

                const made = history.memoryAdapter("/n0", first);
                const heard: unknown[] = [];
                const told: unknown[] = [];
                let rows: Row[] = [{ href: "/n0", state: null }];
                let at = 0;
                let count = 0;

                made.listen(( state ) => heard.push(state));

                for ( const item of deeds ) {

                    if ( item.kind === "go" ) {

                        const next = at + item.delta;

                        made.go(item.delta);

                        if ( item.delta !== 0 && next >= 0 && next < rows.length ) {

                            at = next;
                            told.push(rows[at]?.state);

                        }

                    } else {

                        count += 1;

                        const row = { href: `/n${count}`, state: item.state };

                        made[item.kind](row.href, row.state);

                        if ( item.kind === "replace" ) rows[at] = row;
                        else {

                            rows = [...rows.slice(0, at + 1), row].slice(-room(first));
                            at = rows.length - 1;

                        }

                    }

                    expect(made.entries()).toEqual(rows.map(( row ) => row.href));
                    expect<unknown>(made.read()).toEqual(rows[at]);

                }

                const shot = made.snapshot();
                const back = history.memoryAdapter(shot, second);
                const window = back.entries();
                const start = rows.findIndex(( row ) => row.href === window[0]);

                expect(heard).toEqual(told);
                expect(shot).toEqual({ entries: rows, index: at });
                expect(back.read()).toEqual(made.read());
                expect(window.length).toBe(Math.min(rows.length, room(second)));
                expect(window).toEqual(rows.slice(start, start + window.length).map(( row ) => row.href));

            }),
            { numRuns: runs },
        );

    });
    it("navigation over memory follows a reference stack and asks the guard once per move", () => {

        fc.assert(
            fc.property(fc.array(act, { maxLength: 30 }), ( acts ) => {

                const memory = history.memoryAdapter("/a");
                const nav = history.create(memory);
                const barred = new Set<string>();
                const told: unknown[] = [];
                const wanted: unknown[] = [];
                const asked: string[] = [];
                const expected: string[] = [];
                const rows: Row[] = [{ href: "/a", state: null }];
                let at = 0;

                nav.listen(( entry, action, previous ) => told.push([entry.href, entry.index, action, previous.href]));
                nav.block(( next, previous, action ) => {

                    asked.push(`${action} ${previous.href} ${next.href}`);

                    return barred.has(next.path);

                });

                for ( const item of acts ) {

                    const from = rows[at]?.href ?? "";

                    if ( item.kind === "bar" ) {

                        if ( item.on ) barred.add(item.path);
                        else barred.delete(item.path);

                    } else if ( item.kind === "go" ) {

                        const next = at + item.delta;
                        const row = rows[next];

                        nav.go(item.delta);

                        if ( item.delta !== 0 && row ) {

                            expected.push(`pop ${from} ${row.href}`);

                            if ( !barred.has(row.href) ) {

                                at = next;
                                wanted.push([row.href, at, "pop", from]);

                            }

                        }

                    } else {

                        const made = nav[item.kind](item.path, item.state);

                        expected.push(`${item.kind} ${from} ${item.path}`);

                        if ( !barred.has(item.path) ) {

                            if ( item.kind === "push" ) {

                                rows.splice(at + 1);
                                rows.push({ href: item.path, state: item.state });
                                at = rows.length - 1;

                            } else rows[at] = { href: item.path, state: item.state };

                            wanted.push([item.path, at, item.kind, from]);

                        }

                        expect(made.href).toBe(rows[at]?.href ?? "");

                    }

                    const now = nav.current();

                    expect([now.href, now.index, now.state]).toEqual([rows[at]?.href, at, rows[at]?.state]);
                    expect(nav.current()).toBe(now);
                    expect(memory.entries()).toEqual(rows.map(( row ) => row.href));

                }

                expect(told).toEqual(wanted);
                expect(asked).toEqual(expected);

            }),
            { numRuns: runs },
        );

    });
    it("an untrusted target never throws and never leaves the origin", () => {

        fc.assert(
            fc.property(fc.array(fc.tuple(fc.constantFrom("push" as const, "replace" as const), target), { minLength: 1, maxLength: 4 }), ( moves ) => {

                const memory = history.memoryAdapter("/");
                const nav = history.create(memory);

                for ( const [action, to] of moves ) {

                    const made = nav[action](to);
                    const raw = memory.read().href;

                    expect(new URL(raw, base).origin).toBe(origin);
                    expect(history.local(raw)).toBeDefined();
                    expect(raw).toMatch(legal);
                    expect(raw).toBe(nav.href(to));
                    expect(made.path.startsWith("/") && !made.path.startsWith("//")).toBe(true);
                    expect(history.format(made)).toBe(made.href);
                    expect(nav.current()).toBe(made);
                    expect(Object.isFrozen(made) && Object.isFrozen(made.query)).toBe(true);

                }

            }),
            { numRuns: runs },
        );

    });
    it("a base is added on the way out and removed on the way in", () => {

        fc.assert(
            fc.property(fc.array(name, { minLength: 1, maxLength: 2 }), fc.constantFrom("", "/", "bare"), fc.array(fc.array(name, { maxLength: 3 }), { minLength: 1, maxLength: 4 }), fc.constantFrom("", "?a=1", "#top", "?a=1&b=2#top"), ( parts, shape, paths, end ) => {

                const prefix = `/${parts.join("/")}`;
                const given = shape === "bare" ? prefix.slice(1) : `${prefix}${shape}`;
                const memory = history.memoryAdapter(prefix);
                const nav = history.create(memory, given);

                expect(nav.current().path).toBe("/");

                for ( const path of paths ) {

                    const wanted = `/${path.join("/")}`;
                    const made = nav.push(`${wanted}${end}`);

                    expect([made.path, made.href]).toEqual([wanted, `${wanted}${end}`]);
                    expect(memory.read().href).toBe(`${prefix}${wanted}${end}`);
                    expect(nav.href(`${wanted}${end}`)).toBe(`${prefix}${wanted}${end}`);
                    expect(nav.isCurrent(wanted, true)).toBe(true);

                }

                expect(history.create(history.memoryAdapter(`${prefix}x/y`), given).current().path).toBe(`${prefix}x/y`);
                expect(history.create(history.memoryAdapter("/zz/out"), given).current().path).toBe("/zz/out");
                expect(history.create(history.memoryAdapter(`${prefix}/in?a=1`), given).current().href).toBe("/in?a=1");

            }),
            { numRuns: runs },
        );

    });
    it("state and index survive the envelope and a foreign state is read as none", () => {

        fc.assert(
            fc.property(foreign, fc.jsonValue(), fc.jsonValue(), fc.boolean(), ( given, second, third, swap ) => {

                const held = record(given) ? given.engine : undefined;
                const at = record(held) && typeof held.at === "number" && Number.isSafeInteger(held.at) && held.at >= 0 ? held.at : undefined;
                const index = at ?? 0;
                const memory = history.memoryAdapter({ entries: [{ href: "/x", state: given }], index: 0 });
                const nav = history.create(memory);
                const before = at === undefined || !record(held) ? null : held.state ?? null;
                const after = swap ? second : before;
                const around = record(given) ? given : {};

                expect([nav.current().index, nav.current().state]).toEqual([index, before]);

                if ( swap ) {

                    expect(nav.replace("/y", second).index).toBe(index);
                    expect(memory.read().state).toEqual({ ...around, engine: { at: index, state: second } });

                }

                expect(nav.push("/z", third).index).toBe(index + 1);
                expect(memory.read().state).toEqual({ engine: { at: index + 1, state: third } });
                expect(nav.current().state).toEqual(third);

                nav.back();

                expect([nav.current().href, nav.current().index]).toEqual([swap ? "/y" : "/x", index]);
                expect(nav.current().state).toEqual(after);
                expect(memory.read().state).toEqual(swap || at === undefined ? { ...around, engine: { at: index, state: after } } : given);

            }),
            { numRuns: runs },
        );

    });
    it("a guard that refuses every traversal always brings the host home", () => {

        fc.assert(
            fc.property(scene, ( made ) => {

                const { web, nav, told, pushed, glimpsed } = play(made, ( _next, _previous, action ) => action === "pop");
                const home = `/p${made.home}`;

                expect(web.owed()).toBe(0);
                expect([...glimpsed].filter(( href ) => href !== home && href !== "/q")).toEqual([]);
                expect(web.where()).toBe(pushed ? "/q" : home);
                expect([nav.current().href, nav.current().index]).toEqual([web.where(), pushed ? made.home + 1 : made.home]);
                expect(told).toEqual(pushed ? [{ href: "/q", index: made.home + 1, action: "push", from: home }] : []);
                expect(nav.push("/after").index).toBe(pushed ? made.home + 2 : made.home + 1);
                expect(web.where()).toBe("/after");

            }),
            { numRuns: runs },
        );

    });
    it("a guard that opens some entries is told only those and rests where the host is", () => {

        fc.assert(
            fc.property(scene, fc.uniqueArray(fc.nat({ max: 5 }), { maxLength: 4 }), ( made, picked ) => {

                const open = new Set<number>(picked);
                const { web, nav, told, glimpsed } = play({ ...made, push: undefined }, ( next, _previous, action ) => action === "pop" && !open.has(next.index));
                const rest = told.at(-1)?.index ?? made.home;

                expect(web.owed()).toBe(0);
                expect([...glimpsed].filter(( href ) => href !== `/p${made.home}` && !open.has(Number(href.slice(2))))).toEqual([]);
                expect(told.every(( item ) => item.action === "pop" && open.has(item.index))).toBe(true);
                expect(told.map(( item ) => item.from)).toEqual([`/p${made.home}`, ...told.slice(0, -1).map(( item ) => item.href)].slice(0, told.length));
                expect([nav.current().href, nav.current().index, web.at()]).toEqual([web.where(), rest, rest]);
                expect(nav.push("/after").index).toBe(rest + 1);
                expect(web.where()).toBe("/after");

            }),
            { numRuns: runs },
        );

    });

});
