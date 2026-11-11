import { describe, expect, test as it, jest } from "bun:test";
import * as cache from "engine/cache";
import * as fc from "fast-check";

type Held = { value: number; until: number; tags: readonly string[] };
type Ledger = {
    held: Map<string, Held>;
    find: ( key: string, now: number ) => Held | undefined;
    put: ( key: string, value: number, ttl: number | undefined, tags: readonly string[], now: number ) => void;
};
type Window = { used: number; start: number };
type Act = { run: string; key: string; value: unknown; by: number };

const runs = 5_000;
const origin = 1_700_000_000_000;
const secret = "s".repeat(32);
const marker = "MARKER-7f3a9c";
const unsafe = new Set<string>(["__proto__", "constructor", "prototype"]);
const attribute = /^(?:Max-Age=\d+|Expires=[A-Za-z]{3}, \d{2} [A-Za-z]{3} -?\d{4,6} \d{2}:\d{2}:\d{2} GMT|Path=\/[\x20-\x3a\x3c-\x7e]*|Domain=\.?[A-Za-z0-9.-]+|Secure|HttpOnly|SameSite=(?:Strict|Lax|None)|Partitioned)$/;
const token = fc.string({ unit: fc.constantFrom(..."!#$%&'*+.^_`|~0123456789ABCXYZabcxyz-"), minLength: 1, maxLength: 12 });
const bare = fc.string({ unit: fc.constantFrom(..."!#$&'()*+-./0123456789:<=>?@ABCZ[]^_`abcz{|}~"), maxLength: 16 });
const wide = fc.array(fc.oneof(fc.integer({ min: 0x20, max: 0x7e }), fc.integer({ min: 0, max: 0xffff }), fc.constantFrom(0xd800, 0xdfff, 0x3b, 0x25, 0x22, 0x20, 0x3d, 0x0a, 0x0d)), { maxLength: 24 }).map(( codes ) => String.fromCharCode(...codes));
const letter = fc.constantFrom("a", "b", "c", "d", "e");
const life = fc.option(fc.oneof(fc.integer({ min: -5, max: 50 }), fc.constantFrom(Number.NaN, 0, Number.POSITIVE_INFINITY)), { nil: undefined });
const cost = fc.option(fc.oneof(fc.integer({ min: 0, max: 7 }), fc.constantFrom(0.5, -1, Number.NaN, Number.POSITIVE_INFINITY)), { nil: undefined });
const leaf = fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), wide);
const value = fc.oneof(leaf, fc.array(leaf, { maxLength: 4 }), fc.dictionary(fc.constantFrom("a", "b", "c"), leaf, { maxKeys: 3 }));
const slot = fc.constantFrom("a", "b", "a.b", "", "0", "__proto__", "constructor");
const choices = fc.record({
    maxAge: fc.oneof(fc.double(), fc.integer({ min: -10, max: 10 ** 9 })),
    expires: fc.date(),
    path: fc.oneof(fc.constantFrom("/", "/app", "/a b,c"), wide),
    domain: fc.oneof(fc.constantFrom("", "example.test", ".example.test"), wide),
    sameSite: fc.constantFrom("strict", "lax", "none", "bogus"),
    secure: fc.boolean(),
    httpOnly: fc.boolean(),
    partitioned: fc.boolean(),
}, { requiredKeys: [] });

function thrown ( work: () => unknown ): unknown {

    try {

        return work();

    } catch ( failure ) {

        return failure;

    }

}
function sound ( text: string ): boolean {

    return typeof thrown(() => encodeURIComponent(text)) === "string";

}
function sorted<T> ( rows: Iterable<readonly [string, T]> ): (readonly [string, T])[] {

    return [...rows].sort(( left, right ) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));

}
function first ( line: string ): Record<string, string> {

    return cache.parseCookies(line.split(";")[0] ?? "");

}
function ledger ( span: number, cap: number ): Ledger {

    const held = new Map<string, Held>();

    return {
        held,
        find: ( key, now ) => {

            const found = held.get(key);

            if ( found !== undefined && found.until <= now ) held.delete(key);

            return held.get(key);

        },
        put: ( key, kept, ttl, tags, now ) => {

            held.delete(key);
            held.set(key, { value: kept, until: now + (ttl === undefined || Number.isNaN(ttl) ? span : Math.max(0, ttl)), tags });

            if ( held.size > cap ) held.delete([...held.keys()][0] ?? "");

        },
    };

}
function faked ( work: () => void ): void {

    jest.useFakeTimers();
    jest.setSystemTime(origin);

    try {

        work();

    } finally {

        jest.clearAllTimers();
        jest.useRealTimers();

    }

}
function shape ( failure: unknown ): unknown {

    return failure instanceof Error ? `${failure.name}: ${failure.message}` : failure;

}

describe("fuzz cache", () => {

    it("a cookie header parses without a throw into safe names where the first wins", () => {

        fc.assert(fc.property(wide, ( header ) => {

            const names = Object.keys(cache.parseCookies(header));

            expect(names.filter(( name ) => unsafe.has(name) || name === "" || name !== name.trim())).toEqual([]);

        }), { numRuns: 20_000 });
        fc.assert(fc.property(fc.array(fc.tuple(fc.oneof(token, fc.constantFrom("__proto__", "constructor", "prototype", "toString", "hasOwnProperty")), bare), { maxLength: 8 }), ( pairs ) => {

            const model = new Map<string, string>();

            for ( const [name, text] of pairs ) {

                if ( !unsafe.has(name) && !model.has(name) ) model.set(name, text);

            }

            expect(sorted(Object.entries(cache.parseCookies(pairs.map(( [name, text] ) => `${name}=${text}`).join("; "))))).toEqual(sorted(model));

        }), { numRuns: runs });

    });

    it("a cookie line carries any text back or refuses it, and never a name it cannot read", () => {

        fc.assert(fc.property(fc.oneof(token, fc.constantFrom("__proto__", "constructor", "prototype")), wide, ( name, text ) => {

            const line = thrown(() => cache.serializeCookie(name, text));
            const refused = unsafe.has(name) || !sound(text);

            expect(typeof line === "string").toBe(!refused);

            if ( typeof line !== "string" ) expect(line).toBeInstanceOf(RangeError);
            else expect([line.endsWith("; Path=/; SameSite=Lax"), Object.hasOwn(first(line), name), first(line)[name]]).toEqual([true, true, text]);

        }), { numRuns: runs });
        fc.assert(fc.property(fc.oneof(wide, token), bare, ( name, text ) => {

            const line = thrown(() => cache.serializeCookie(name, text));

            if ( typeof line !== "string" ) expect(line).toBeInstanceOf(RangeError);
            else expect(Object.entries(first(line))).toEqual([[name, text]]);

        }), { numRuns: runs });

    });

    it("cookie options build known attributes only or are refused", () => {

        fc.assert(fc.property(fc.constantFrom("sid", "__Host-sid", "__Secure-sid"), choices, ( name, given ) => {

            const line = thrown(() => cache.serializeCookie(name, "v", given as cache.CookieOptions));

            if ( typeof line !== "string" ) {

                expect(line).toBeInstanceOf(RangeError);

                return;

            }

            const [pair, ...rest] = line.split("; ");
            const locked = given.secure === true || given.partitioned === true || given.sameSite === "none" || name.startsWith("__");

            expect(pair).toBe(`${name}=v`);
            expect(rest.filter(( part ) => !attribute.test(part))).toEqual([]);
            expect([rest.filter(( part ) => part.startsWith("Path=")).length, rest.filter(( part ) => part.startsWith("SameSite=")).length, rest.includes("Secure")]).toEqual([1, 1, locked]);

        }), { numRuns: runs });

    });

    it("an lru holds what a recency list holds", () => {

        fc.assert(fc.property(fc.integer({ min: 1, max: 5 }), fc.array(fc.record({ run: fc.constantFrom("get", "peek", "set", "has", "delete", "clear"), key: fc.integer({ min: 0, max: 7 }), value: fc.integer() }), { maxLength: 60 }), ( cap, steps ) => {

            const real = cache.lru<number, number>(cap);
            let model: (readonly [number, number])[] = [];

            for ( const step of steps ) {

                const found = model.find(( [key] ) => key === step.key);
                const rest = model.filter(( row ) => row !== found);

                if ( step.run === "get" ) {

                    expect(real.get(step.key)).toBe(found?.[1]);

                    if ( found ) model = [...rest, found];

                } else if ( step.run === "peek" ) {

                    expect(real.peek(step.key)).toBe(found?.[1]);

                } else if ( step.run === "set" ) {

                    real.set(step.key, step.value);
                    model = [...rest, [step.key, step.value] as const].slice(found || rest.length < cap ? 0 : 1);

                } else if ( step.run === "has" ) {

                    expect(real.has(step.key)).toBe(found !== undefined);

                } else if ( step.run === "delete" ) {

                    expect(real.delete(step.key)).toBe(found !== undefined);
                    model = rest;

                } else {

                    real.clear();
                    model = [];

                }

                expect([real.size, real.keys()]).toEqual([model.length, model.map(( [key] ) => key)]);

            }

        }), { numRuns: runs });

    });

    it("an expiring map holds what a clocked ledger holds", () => {

        faked(() => {

            fc.assert(fc.property(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 4 }), fc.array(fc.record({ run: fc.constantFrom("set", "set", "get", "has", "delete", "prune", "clear", "tick"), key: letter, value: fc.integer(), ttl: life, by: fc.integer({ min: 0, max: 30 }) }), { maxLength: 60 }), ( span, cap, steps ) => {

                const real = cache.expiring<number>(span, cap);
                const model = ledger(span, cap);
                let now = origin;

                jest.setSystemTime(now);

                for ( const step of steps ) {

                    if ( step.run === "set" ) {

                        real.set(step.key, step.value, step.ttl);
                        model.put(step.key, step.value, step.ttl, [], now);

                    } else if ( step.run === "get" ) {

                        expect(real.get(step.key)).toBe(model.find(step.key, now)?.value);

                    } else if ( step.run === "has" ) {

                        expect(real.has(step.key)).toBe(model.find(step.key, now) !== undefined);

                    } else if ( step.run === "delete" ) {

                        expect(real.delete(step.key)).toBe(model.held.delete(step.key));

                    } else if ( step.run === "prune" ) {

                        const stale = [...model.held].filter(( [, found] ) => found.until <= now).map(( [key] ) => key);

                        for ( const key of stale ) model.held.delete(key);

                        expect(real.prune()).toBe(stale.length);

                    } else if ( step.run === "clear" ) {

                        real.clear();
                        model.held.clear();

                    } else {

                        now += step.by;
                        jest.setSystemTime(now);

                    }

                    expect(real.size).toBe(model.held.size);

                }

            }), { numRuns: runs });

        });

    });

    it("a tagged map drops by tag what a clocked ledger drops", () => {

        faked(() => {

            fc.assert(fc.property(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 4 }), fc.array(fc.record({ run: fc.constantFrom("set", "set", "get", "has", "delete", "invalidate", "clear", "tick"), key: letter, value: fc.integer(), ttl: life, by: fc.integer({ min: 0, max: 30 }), tags: fc.array(fc.constantFrom("x", "y", "z"), { maxLength: 3 }), tag: fc.constantFrom("x", "y", "z") }), { maxLength: 60 }), ( span, cap, steps ) => {

                const real = cache.tagged<number>(span, cap);
                const model = ledger(span, cap);
                let now = origin;

                jest.setSystemTime(now);

                for ( const step of steps ) {

                    if ( step.run === "set" ) {

                        real.set(step.key, step.value, step.tags, step.ttl);
                        model.put(step.key, step.value, step.ttl, step.tags, now);

                    } else if ( step.run === "get" ) {

                        expect(real.get(step.key)).toBe(model.find(step.key, now)?.value);

                    } else if ( step.run === "has" ) {

                        expect(real.has(step.key)).toBe(model.find(step.key, now) !== undefined);

                    } else if ( step.run === "delete" ) {

                        real.delete(step.key);
                        model.held.delete(step.key);

                    } else if ( step.run === "invalidate" ) {

                        const marked = [...model.held].filter(( [, found] ) => found.tags.includes(step.tag)).map(( [key] ) => key);

                        for ( const key of marked ) model.held.delete(key);

                        expect(real.invalidate(step.tag)).toBe(marked.length);

                    } else if ( step.run === "clear" ) {

                        real.clear();
                        model.held.clear();

                    } else {

                        now += step.by;
                        jest.setSystemTime(now);

                    }

                }

                expect(["a", "b", "c", "d", "e"].map(( key ) => real.get(key))).toEqual(["a", "b", "c", "d", "e"].map(( key ) => model.find(key, now)?.value));

            }), { numRuns: runs });

        });

    });

    it("a limiter grants what a fixed window grants and never more than the limit", () => {

        faked(() => {

            fc.assert(fc.property(fc.integer({ min: 1, max: 5 }), fc.constantFrom(1, 1000, 2500), fc.array(fc.record({ run: fc.constantFrom("take", "take", "take", "peek", "reset", "clear", "tick"), key: letter, cost, by: fc.integer({ min: 0, max: 1500 }) }), { maxLength: 60 }), ( cap, span, steps ) => {

                const real = cache.limiter(cap, span);
                const model = new Map<string, Window>();
                let now = origin;

                jest.setSystemTime(now);

                for ( const step of steps ) {

                    const kept = model.get(step.key);
                    const found = kept !== undefined && now - kept.start < span ? kept : undefined;
                    const used = found?.used ?? 0;
                    const wait = Math.max(1, Math.ceil(((found?.start ?? now) + span - now) / 1000));

                    if ( step.run === "take" ) {

                        const weight = step.cost === undefined ? 1 : step.cost >= 0 ? step.cost : step.cost < 0 ? 0 : Number.POSITIVE_INFINITY;
                        const granted = used + weight <= cap;
                        const taken = real.take(step.key, step.cost);

                        if ( granted ) model.set(step.key, { used: used + weight, start: found?.start ?? now });

                        expect(taken).toEqual({ allowed: granted, limit: cap, remaining: Math.max(0, cap - (granted ? used + weight : used)), retryAfter: granted ? 0 : wait });
                        expect(taken.remaining >= 0 && taken.remaining <= cap && taken.retryAfter <= Math.max(1, Math.ceil(span / 1000))).toBe(true);

                    } else if ( step.run === "peek" ) {

                        expect(real.peek(step.key)).toEqual({ allowed: used < cap, limit: cap, remaining: Math.max(0, cap - used), retryAfter: used < cap ? 0 : wait });

                    } else if ( step.run === "reset" ) {

                        real.reset(step.key);
                        model.delete(step.key);

                    } else if ( step.run === "clear" ) {

                        real.clear();
                        model.clear();

                    } else {

                        now += step.by;
                        jest.setSystemTime(now);

                    }

                }

            }), { numRuns: runs });

        });

    });

    it("a namespace holds its own keys and no others", async () => {

        await fc.assert(fc.asyncProperty(wide.filter(( text ) => text !== ""), fc.array(fc.tuple(fc.oneof(wide, slot), bare), { maxLength: 8 }), async ( prefix, pairs ) => {

            const target = cache.memory();
            const inside = cache.namespaced(target, prefix);
            const model = new Map<string, string>(pairs);

            await target.set("outside", "1");

            for ( const [key, text] of pairs ) await inside.set(key, text);

            expect([...(await inside.keys())].sort()).toEqual([...model.keys()].sort());
            expect(await Promise.all([...model.keys()].map(( key ) => inside.get(key)))).toEqual([...model.values()]);
            expect((await target.keys()).filter(( key ) => key !== "outside" && !key.startsWith(`${prefix}.`))).toEqual([]);

            for ( const key of model.keys() ) await inside.delete(key);

            expect([await target.keys(), await inside.keys(), cache.namespaced(target, "") === target]).toEqual([["outside"], [], true]);

        }), { numRuns: 1_000 });

    });

    it("a header jar answers like a map over what came in and what was written", () => {

        fc.assert(fc.property(fc.array(fc.tuple(fc.constantFrom("a", "b", "c", "sid"), bare), { maxLength: 5 }), fc.array(fc.record({ run: fc.constantFrom("set", "remove", "get"), name: fc.constantFrom("a", "b", "c", "sid", "new"), text: fc.string({ unit: "grapheme", maxLength: 12 }) }), { maxLength: 30 }), ( pairs, steps ) => {

            const header = pairs.map(( [name, text] ) => `${name}=${text}`).join("; ");
            const jar = cache.headerCookies(header);
            const model = new Map<string, string>(Object.entries(cache.parseCookies(header)));
            let wrote = 0;

            for ( const step of steps ) {

                if ( step.run === "get" ) {

                    expect(jar.get(step.name)).toBe(model.get(step.name));

                    continue;

                }

                wrote += 1;

                if ( step.run === "set" ) {

                    jar.set(step.name, step.text);
                    model.set(step.name, step.text);

                } else {

                    jar.remove(step.name);
                    model.delete(step.name);

                }

            }

            expect([[...jar.names()].sort(), jar.outgoing().length, jar.outgoing().filter(( line ) => /[\r\n]/.test(line))]).toEqual([[...model.keys()].sort(), wrote, []]);

        }), { numRuns: runs });

    });

    it("a box answers like a map, in step order and under one burst", async () => {

        const foretold = ( model: Map<string, unknown>, step: Act ): unknown => {

            const had = model.has(step.key);
            const kept = model.get(step.key);

            if ( step.run === "set" ) model.set(step.key, step.value);
            if ( step.run === "drop" || step.run === "remove" || step.run === "pull" ) model.delete(step.key);
            if ( step.run === "get" || step.run === "pull" ) return kept;
            if ( step.run === "has" || step.run === "touch" ) return had;

            if ( step.run === "remember" ) {

                if ( !had ) model.set(step.key, step.value);

                return had ? kept : step.value;

            }

            if ( step.run === "update" ) {

                const next = typeof kept === "number" ? kept + 1 : had ? undefined : "made";

                if ( next === undefined ) model.delete(step.key);
                else model.set(step.key, next);

                return next;

            }

            if ( step.run === "more" || step.run === "less" ) {

                if ( had && typeof kept !== "number" ) return "RangeError: not a counter";

                const next = (typeof kept === "number" ? kept : 0) + (step.run === "more" ? step.by : -step.by);

                model.set(step.key, next);

                return next;

            }

            return undefined;

        };
        const acted = ( box: cache.Box, step: Act ): Promise<unknown> => {

            if ( step.run === "set" ) return box.set(step.key, step.value);
            if ( step.run === "drop" ) return box.set(step.key, undefined);
            if ( step.run === "remove" ) return box.remove(step.key);
            if ( step.run === "get" ) return box.get(step.key);
            if ( step.run === "pull" ) return box.pull(step.key);
            if ( step.run === "has" ) return box.has(step.key);
            if ( step.run === "touch" ) return box.touch(step.key);
            if ( step.run === "remember" ) return box.remember(step.key, () => step.value);
            if ( step.run === "update" ) return box.update<unknown>(step.key, ( current ) => (typeof current === "number" ? current + 1 : current === undefined ? "made" : undefined));

            return (step.run === "more" ? box.increment(step.key, step.by) : box.decrement(step.key, step.by)).catch(shape);

        };
        const held = async ( box: cache.Box ): Promise<unknown> => [[...(await box.keys())].sort(), sorted(Object.entries(await box.all()))];
        const expected = ( model: Map<string, unknown> ): unknown => [[...model.keys()].sort(), sorted([...model].filter(( [key] ) => !unsafe.has(key)))];
        const step = ( names: readonly string[] ): fc.Arbitrary<Act> => fc.record({ run: fc.constantFrom(...names), key: slot, value, by: fc.integer({ min: -5, max: 5 }) });
        const prefix = fc.constantFrom(undefined, "app", "a.b");

        await fc.assert(fc.asyncProperty(prefix, fc.array(step(["set", "set", "drop", "remove", "get", "pull", "has", "touch", "remember", "update", "more", "less"]), { maxLength: 40 }), async ( named, steps ) => {

            const box = cache.open({ storage: cache.memory(), prefix: named });
            const model = new Map<string, unknown>();

            for ( const one of steps ) expect(await acted(box, one)).toEqual(foretold(model, one));

            expect(await held(box)).toEqual(expected(model));

            await box.clear();

            expect(await held(box)).toEqual([[], []]);

        }), { numRuns: 1_000 });
        await fc.assert(fc.asyncProperty(prefix, fc.array(step(["set", "set", "drop", "remove", "get", "pull", "has", "touch", "update", "more", "less"]), { maxLength: 40 }), async ( named, steps ) => {

            const box = cache.open({ storage: cache.memory(), prefix: named });
            const model = new Map<string, unknown>();
            const answers = steps.map(( one ) => acted(box, one));

            expect(await Promise.all(answers)).toEqual(steps.map(( one ) => foretold(model, one)));
            expect(await held(box)).toEqual(expected(model));

        }), { numRuns: 1_000 });

    });

    it("a guarded box never shows its value, never moves and never reads a changed text", async () => {

        await fc.assert(fc.asyncProperty(fc.constantFrom("sealed", "signed", "both"), value, fc.nat(), fc.integer({ min: 0x21, max: 0x7e }), async ( guard, given, at, code ) => {

            const store = cache.memory();
            const box = cache.open({ storage: store, secret: guard === "signed" ? undefined : secret, sign: guard === "sealed" ? undefined : secret });
            const kept = { note: `${marker}`, given };

            await box.set("k", kept);

            const raw = (await store.get("k")) ?? "";
            const spot = at % Math.max(1, raw.length);
            const changed = `${raw.slice(0, spot)}${String.fromCharCode(code)}${raw.slice(spot + 1)}`;

            expect([raw === "", guard !== "signed" && raw.includes(marker), await box.get("k")]).toEqual([false, false, kept]);

            await store.set("moved", raw);
            await store.set("k", changed);

            const back = await box.get("k");

            expect(await box.get("moved")).toBeUndefined();
            expect<unknown[]>(changed === raw ? [kept] : [undefined, kept]).toContainEqual(back);

        }), { numRuns: 150 });

    });

    it("a signed cookie reads back whole inside its age and never under another secret", async () => {

        await fc.assert(fc.asyncProperty(fc.string({ unit: "grapheme", maxLength: 40 }), fc.integer({ min: 0, max: 10 ** 15 }), fc.integer({ min: -200_000, max: 200_000 }), fc.integer({ min: 0, max: 120 }), wide, async ( text, at, drift, age, junk ) => {

            const signed = await cache.signCookie(text, secret, at);

            expect([
                await cache.unsignCookie(signed, secret),
                await cache.unsignCookie(signed, `${secret}x`),
                await cache.unsignCookie(signed, secret, age, at + drift),
                await cache.unsignCookie(junk, secret),
                await cache.unsignCookie(`${signed}${junk === "" ? "x" : junk}`, secret),
                await cache.unsignCookie(undefined, secret),
            ]).toEqual([text, undefined, drift >= -60_000 && drift <= age * 1000 ? text : undefined, undefined, undefined, undefined]);

        }), { numRuns: 300 });

    });

});
