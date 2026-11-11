import { describe, expect, test as it, jest } from "bun:test";
import * as error from "engine/error";
import * as event from "engine/event";
import * as fc from "fast-check";

type Step =
    | { kind: "on"; name: string; handler: number; once: boolean }
    | { kind: "any"; handler: number }
    | { kind: "stop"; at: number }
    | { kind: "off"; name: string; handler: number | undefined }
    | { kind: "emit"; name: string }
    | { kind: "clear" };
type Deed =
    | { kind: "sub"; pattern: string; handler: number; replay: boolean | number }
    | { kind: "stop"; at: number }
    | { kind: "pub"; topic: string }
    | { kind: "forget"; pattern: string }
    | { kind: "clear" };
type Move = { kind: "set"; value: number } | { kind: "bump"; by: number } | { kind: "reset" } | { kind: "watch"; handler: number; replay: boolean } | { kind: "stop"; at: number };
type Act = { kind: "wait"; ms: number } | { kind: "parent"; at: number } | { kind: "hand" } | { kind: "release" };
type Kin = "none" | "open" | "dead";
type Part<S> = { script: S[]; throws: boolean };
type Plan<S> = { parts: Part<S>[]; steps: S[] };
type World<S> = { apply: ( step: S ) => unknown; look: () => unknown };
type Call = ( handler: number, label: string ) => void;
type Build<S> = ( call: Call, fail: event.Fail | undefined ) => World<S>;
type Row = { handler: number; live: boolean };
type Held = { handler: number; name: string; once: boolean; live: boolean };
type Line = { parts: string[]; handler: number; live: boolean };
type Kept = { id: number; topic: string };
type Caps = { replay: number; topics: number };
type Tally = { signal: AbortSignal; fire: ( reason?: unknown ) => void; held: () => number };

const runs = 4000;
const names = ["a", "b", "c"] as const;
const probes = ["a", "a.b", "", "b"] as const;
const letters = ["a", "b", "", "z"] as const;
const marks = ["a", "b", "", "*", "**"] as const;
const rare = fc.nat({ max: 4 }).map(( roll ) => roll === 0);
const handler = fc.nat({ max: 3 });
const name = fc.constantFrom(...names);
const plain = fc.constantFrom("a", "a", "b", "");
const starred = fc.constantFrom("a", "a", "b", "", "*", "*", "**", "**");
const odd = fc.constantFrom("a", "b", "", "*", "**", "**", "a*", "***");
const topic = fc.array(plain, { minLength: 1, maxLength: 3 }).map(( parts ) => parts.join("."));
const pattern = fc.array(starred, { minLength: 1, maxLength: 3 }).map(( parts ) => parts.join("."));
const junk = fc.oneof(
    fc.string({ maxLength: 12 }),
    fc.string({ unit: "binary", maxLength: 8 }),
    fc.array(fc.constantFrom("a", "b", "", "*", "**", ".", "..", "__proto__", "constructor", "prototype", "toString", "a*"), { maxLength: 6 }).map(( parts ) => parts.join(".")),
);
const step: fc.Arbitrary<Step> = fc.oneof(
    { weight: 4, arbitrary: fc.record({ kind: fc.constant("on" as const), name, handler, once: fc.boolean() }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("any" as const), handler }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("stop" as const), at: fc.nat({ max: 12 }) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("off" as const), name, handler: fc.option(handler, { nil: undefined }) }) },
    { weight: 5, arbitrary: fc.record({ kind: fc.constant("emit" as const), name }) },
    { weight: 1, arbitrary: fc.constant<Step>({ kind: "clear" }) },
);
const deed: fc.Arbitrary<Deed> = fc.oneof(
    { weight: 4, arbitrary: fc.record({ kind: fc.constant("sub" as const), pattern, handler, replay: fc.constantFrom<boolean | number>(false, false, true, 0, 1, 2, 5) }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("stop" as const), at: fc.nat({ max: 12 }) }) },
    { weight: 6, arbitrary: fc.record({ kind: fc.constant("pub" as const), topic }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("forget" as const), pattern }) },
    { weight: 1, arbitrary: fc.constant<Deed>({ kind: "clear" }) },
);
const move: fc.Arbitrary<Move> = fc.oneof(
    { weight: 4, arbitrary: fc.record({ kind: fc.constant("set" as const), value: fc.nat({ max: 4 }) }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant("bump" as const), by: fc.integer({ min: 1, max: 4 }) }) },
    { weight: 1, arbitrary: fc.constant<Move>({ kind: "reset" }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("watch" as const), handler, replay: fc.boolean() }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("stop" as const), at: fc.nat({ max: 6 }) }) },
);
const kin = fc.constantFrom<Kin>("open", "open", "open", "none", "dead");
const term = fc.oneof({ weight: 5, arbitrary: fc.integer({ min: -3, max: 40 }) }, { weight: 1, arbitrary: fc.constant(Number.POSITIVE_INFINITY) });
const near = fc.array(odd, { minLength: 1, maxLength: 5 }).chain(( wanted ) =>
    fc.tuple(
        fc.constant(wanted.join(".")),
        fc.tuple(...wanted.map(( part ) => (part === "**" ? fc.array(plain, { maxLength: 3 }) : part === "*" ? fc.array(plain, { minLength: 1, maxLength: 1 }) : fc.constant([part])))).map(( rows ) => rows.flat().join(".")),
    ),
);
const act: fc.Arbitrary<Act> = fc.oneof(
    { weight: 4, arbitrary: fc.record({ kind: fc.constant("wait" as const), ms: fc.integer({ min: 1, max: 30 }) }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("parent" as const), at: fc.nat({ max: 2 }) }) },
    { weight: 1, arbitrary: fc.constant<Act>({ kind: "hand" }) },
    { weight: 1, arbitrary: fc.constant<Act>({ kind: "release" }) },
);

function planned<S> ( one: fc.Arbitrary<S>, longest: number ): fc.Arbitrary<Plan<S>> {

    return fc.record({
        parts: fc.array(fc.record({ script: fc.array(one, { maxLength: 3 }), throws: rare }), { minLength: 4, maxLength: 4 }),
        steps: fc.array(one, { maxLength: longest }),
    });

}
function refused ( run: () => unknown ): unknown {

    try {

        run();

    } catch ( failure ) {

        return failure;

    }

    return undefined;

}
function said ( cause: unknown ): string {

    return cause instanceof Error ? cause.message : String(cause);

}
function read ( reason: unknown ): unknown {

    return reason instanceof error.Fault ? `${reason.code}/${reason.reason}` : reason;

}
function missed ( fail: event.Fail | undefined, cause: unknown, failures: unknown[] ): void {

    if ( fail ) fail(cause);
    else failures.push(cause);

}
async function settled (): Promise<void> {

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

}
function parent ( bare: boolean ): Tally {

    if ( bare ) return tally();

    const made = new AbortController();

    return { signal: made.signal, fire: ( reason ) => made.abort(reason), held: () => 0 };

}
function faked ( work: () => void ): void {

    jest.useFakeTimers();

    try {

        work();

    } finally {

        jest.clearAllTimers();
        jest.useRealTimers();

    }

}
function tally (): Tally {

    const heard = new Set<() => void>();
    const state: { aborted: boolean; reason: unknown } = { aborted: false, reason: undefined };
    const signal = {
        get aborted (): boolean {

            return state.aborted;

        },
        get reason (): unknown {

            return state.reason;

        },
        addEventListener: ( _: string, listener: () => void ): void => { heard.add(listener); },
        removeEventListener: ( _: string, listener: () => void ): void => { heard.delete(listener); },
    };

    return {
        signal: signal as unknown as AbortSignal,
        fire: ( reason ) => {

            state.aborted = true;
            state.reason = reason;

            for ( const listener of [...heard] ) {

                heard.delete(listener);
                listener();

            }

        },
        held: () => heard.size,
    };

}
function wordsOf ( alphabet: readonly string[], longest: number ): string[][] {

    const found: string[][] = [];
    let level: string[][] = [[]];

    for ( let size = 1; size <= longest; size += 1 ) {

        level = level.flatMap(( row ) => alphabet.map(( letter ) => [...row, letter]));

        for ( const row of level ) found.push(row);

    }

    return found;

}
function accepts ( wanted: readonly string[], own: readonly string[], at = 0, spot = 0 ): boolean {

    if ( at === wanted.length ) return spot === own.length;

    const part = wanted[at];

    if ( part === "**" ) {

        for ( let next = spot + 1; next <= own.length; next += 1 ) if ( accepts(wanted, own, at + 1, next) ) return true;

        return false;

    }

    if ( spot === own.length ) return false;
    if ( part === "*" ? own[spot] === "" : part !== own[spot] ) return false;

    return accepts(wanted, own, at + 1, spot + 1);

}
function drive<S> ( plan: Plan<S>, build: Build<S>, sunk: boolean ): unknown[] {

    const log: unknown[] = [];
    const state = { budget: 0, serial: 0 };
    const sink = ( cause: unknown ): void => {

        log.push(["sink", said(cause)]);

    };
    const world: World<S> = build(( index, label ) => {

        const part = plan.parts[index];

        log.push(`${index}:${label}`);

        if ( !part ) return;

        if ( state.budget > 0 ) {

            state.budget -= 1;

            for ( const one of part.script ) world.apply(one);

        }

        if ( !part.throws ) return;

        state.serial += 1;

        throw new Error(`${index}#${state.serial}`);

    }, sunk ? sink : undefined);

    for ( const one of plan.steps ) {

        state.budget = 12;

        try {

            log.push(["ok", world.apply(one)]);

        } catch ( cause ) {

            log.push(["threw", said(cause)]);

        }

        log.push(world.look());

    }

    return log;

}
function emitting ( call: Call, fail: event.Fail | undefined ): World<Step> {

    const made = event.emitter<Record<string, number>>({ fail });
    const stops: (() => void)[] = [];
    const pool = new Map<string, () => void>();
    const named = ( index: number, own: string ): (() => void) => {

        const key = `${index}|${own}`;
        const found = pool.get(key) ?? ((): void => call(index, own));

        pool.set(key, found);

        return found;

    };

    return {
        apply: ( one ) => {

            if ( one.kind === "emit" ) return made.emit(one.name, 0);

            if ( one.kind === "on" ) stops.push(made.on(one.name, named(one.handler, one.name), { once: one.once }));
            else if ( one.kind === "any" ) stops.push(made.any(( _, own ) => call(one.handler, `any:${own}`)));
            else if ( one.kind === "stop" ) stops[one.at % Math.max(1, stops.length)]?.();
            else if ( one.kind === "off" ) made.off(one.name, one.handler === undefined ? undefined : named(one.handler, one.name));
            else made.clear();

            return null;

        },
        look: () => [made.count(), made.names(), names.map(( own ) => [made.count(own), made.has(own)])],
    };

}
function emitted ( call: Call, fail: event.Fail | undefined ): World<Step> {

    const rows: Held[] = [];
    const wide: Held[] = [];
    const stops: Held[] = [];

    return {
        apply: ( one ) => {

            if ( one.kind === "emit" ) {

                const told = [...rows.filter(( held ) => held.live && held.name === one.name), ...wide.filter(( held ) => held.live)];
                const failures: unknown[] = [];
                let delivered = 0;

                for ( const held of told ) {

                    if ( !held.live ) continue;
                    if ( held.once ) held.live = false;

                    delivered += 1;

                    try {

                        call(held.handler, held.name === "" ? `any:${one.name}` : one.name);

                    } catch ( cause ) {

                        missed(fail, cause, failures);

                    }

                }

                if ( failures.length ) throw failures[0];

                return delivered;

            }

            if ( one.kind === "on" || one.kind === "any" ) {

                const held: Held = { handler: one.handler, name: one.kind === "on" ? one.name : "", once: one.kind === "on" && one.once, live: true };

                (one.kind === "on" ? rows : wide).push(held);
                stops.push(held);

            } else if ( one.kind === "stop" ) {

                const held = stops[one.at % Math.max(1, stops.length)];

                if ( held ) held.live = false;

            } else if ( one.kind === "off" ) {

                for ( const held of rows ) if ( held.name === one.name && (one.handler === undefined || held.handler === one.handler) ) held.live = false;

            } else {

                for ( const held of [...rows, ...wide] ) held.live = false;

            }

            return null;

        },
        look: () => {

            const live = rows.filter(( held ) => held.live);

            return [
                live.length + wide.filter(( held ) => held.live).length,
                [...new Set(live.map(( held ) => held.name))].sort(),
                names.map(( own ) => [live.filter(( held ) => held.name === own).length, live.some(( held ) => held.name === own)]),
            ];

        },
    };

}
function routing ( caps: Caps ): Build<Deed> {

    return ( call, fail ) => {

        const made = event.bus({ ...caps, fail, now: () => 0 });
        const stops: (() => void)[] = [];

        return {
            apply: ( one ) => {

                if ( one.kind === "pub" ) return made.publish(one.topic, 0);
                if ( one.kind === "forget" ) return made.forget(one.pattern);

                if ( one.kind === "sub" ) stops.push(made.subscribe(one.pattern, ( _, message ) => call(one.handler, `${message.id}:${message.topic}`), { replay: one.replay }));
                else if ( one.kind === "stop" ) stops[one.at % Math.max(1, stops.length)]?.();
                else made.clear();

                return null;

            },
            look: () => [
                made.count(),
                made.topics(),
                made.history().map(( message ) => message.id),
                made.history("a.**").map(( message ) => message.id),
                probes.map(( own ) => made.last(own)?.id ?? 0),
            ],
        };

    };

}
function routed ( caps: Caps ): Build<Deed> {

    return ( call, fail ) => {

        const lines: Line[] = [];
        const stops: Line[] = [];
        let kept: Kept[] = [];
        let recent: string[] = [];
        let sequence = 0;
        const past = ( wanted: string ): Kept[] => kept.filter(( message ) => accepts(wanted.split("."), message.topic.split(".")));
        const keep = ( message: Kept ): void => {

            if ( caps.replay === 0 || caps.topics === 0 ) return;

            const own = kept.filter(( other ) => other.topic === message.topic);
            const stale = own.length >= caps.replay ? own[0] : undefined;

            kept = [...kept.filter(( other ) => other !== stale), message];
            recent = [...recent.filter(( other ) => other !== message.topic), message.topic];

            if ( recent.length <= caps.topics ) return;

            const oldest = recent[0];

            recent = recent.slice(1);
            kept = kept.filter(( other ) => other.topic !== oldest);

        };
        const tell = ( line: Line, messages: readonly Kept[], failures: unknown[] ): number => {

            let delivered = 0;

            for ( const message of messages ) {

                if ( !line.live ) continue;

                delivered += 1;

                try {

                    call(line.handler, `${message.id}:${message.topic}`);

                } catch ( cause ) {

                    missed(fail, cause, failures);

                }

            }

            return delivered;

        };

        return {
            apply: ( one ) => {

                const failures: unknown[] = [];

                if ( one.kind === "pub" ) {

                    sequence += 1;

                    const message: Kept = { id: sequence, topic: one.topic };
                    let delivered = 0;

                    keep(message);

                    for ( const line of lines.filter(( other ) => other.live && accepts(other.parts, one.topic.split("."))) ) delivered += tell(line, [message], failures);

                    if ( failures.length ) throw failures[0];

                    return delivered;

                }

                if ( one.kind === "forget" ) {

                    const gone = past(one.pattern);

                    kept = kept.filter(( message ) => !gone.includes(message));
                    recent = recent.filter(( own ) => kept.some(( message ) => message.topic === own));

                    return gone.length;

                }

                if ( one.kind === "sub" ) {

                    const line: Line = { parts: one.pattern.split("."), handler: one.handler, live: true };
                    const found = one.replay === false || one.replay === 0 ? [] : past(one.pattern);

                    lines.push(line);
                    tell(line, one.replay === true ? found : found.slice(Math.max(0, found.length - Number(one.replay))), failures);

                    if ( failures.length ) {

                        line.live = false;

                        throw failures[0];

                    }

                    stops.push(line);

                } else if ( one.kind === "stop" ) {

                    const line = stops[one.at % Math.max(1, stops.length)];

                    if ( line ) line.live = false;

                } else {

                    for ( const line of lines ) line.live = false;

                    kept = [];
                    recent = [];

                }

                return null;

            },
            look: () => [
                lines.filter(( line ) => line.live).length,
                [...new Set(kept.map(( message ) => message.topic))].sort(),
                kept.map(( message ) => message.id),
                past("a.**").map(( message ) => message.id),
                probes.map(( own ) => kept.findLast(( message ) => message.topic === own)?.id ?? 0),
            ],
        };

    };

}
function telling ( call: Call, fail: event.Fail | undefined ): World<Move> {

    const made = event.signal(0, { fail });
    const stops: (() => void)[] = [];

    return {
        apply: ( one ) => {

            if ( one.kind === "set" ) made.set(one.value);
            else if ( one.kind === "bump" ) made.set(( current ) => current + one.by);
            else if ( one.kind === "reset" ) made.reset();
            else if ( one.kind === "watch" ) stops.push(made.watch(( value, previous ) => call(one.handler, `${previous}>${value}`), { replay: one.replay }));
            else stops[one.at % Math.max(1, stops.length)]?.();

            return null;

        },
        look: () => [made.get(), made.read.get(), made.count()],
    };

}
function told ( call: Call, fail: event.Fail | undefined ): World<Move> {

    const rows: Row[] = [];
    const stops: Row[] = [];
    const state: { current: number; turns: [number, number][] | undefined } = { current: 0, turns: undefined };
    const set = ( next: number ): void => {

        if ( next === state.current ) return;

        const turn: [number, number] = [state.current, next];

        state.current = next;

        if ( state.turns ) {

            state.turns.push(turn);

            return;

        }

        const queue = [turn];
        const failures: unknown[] = [];

        state.turns = queue;

        for ( let at = 0; at < queue.length; at += 1 ) {

            const label = `${queue[at]?.[0]}>${queue[at]?.[1]}`;

            for ( const row of rows.filter(( other ) => other.live) ) {

                if ( !row.live ) continue;

                try {

                    call(row.handler, label);

                } catch ( cause ) {

                    missed(fail, cause, failures);

                }

            }

        }

        state.turns = undefined;

        if ( failures.length ) throw failures[0];

    };

    return {
        apply: ( one ) => {

            if ( one.kind === "set" ) set(one.value);
            else if ( one.kind === "bump" ) set(state.current + one.by);
            else if ( one.kind === "reset" ) set(0);
            else if ( one.kind === "watch" ) {

                const row: Row = { handler: one.handler, live: true };
                const failures: unknown[] = [];

                rows.push(row);

                if ( one.replay ) {

                    try {

                        call(one.handler, `${state.current}>${state.current}`);

                    } catch ( cause ) {

                        missed(fail, cause, failures);

                    }

                }

                if ( failures.length ) {

                    row.live = false;

                    throw failures[0];

                }

                stops.push(row);

            } else {

                const row = stops[one.at % Math.max(1, stops.length)];

                if ( row ) row.live = false;

            }

            return null;

        },
        look: () => [state.current, state.current, rows.filter(( row ) => row.live).length],
    };

}

describe("fuzz event", () => {

    it("matches reads a star as one filled segment and a double star as one or more of any shape", () => {

        fc.assert(
            fc.property(near, ( [wanted, own] ) => {

                expect(event.matches(wanted, own)).toBe(accepts(wanted.split("."), own.split(".")));

            }),
            { numRuns: runs },
        );
        fc.assert(
            fc.property(junk, junk, ( wanted, own ) => {

                expect(event.matches(wanted, own)).toBe(accepts(wanted.split("."), own.split(".")));
                expect(event.matches(own, own)).toBe(true);
                expect(event.matches("**", own)).toBe(true);

                if ( !wanted.includes("*") ) expect(event.matches(wanted, own)).toBe(wanted === own);

            }),
            { numRuns: runs },
        );

    });
    it("count answers the overlap of two patterns over every pair of three segments", () => {

        const topics = wordsOf(letters, 6);
        const wanted = wordsOf(marks, 3);
        const hits = wanted.map(( parts ) => topics.flatMap(( own, at ) => (accepts(parts, own) ? [at] : [])));
        const sets = hits.map(( found ) => new Set(found));
        const table = hits.map(( found ) => sets.map(( other ) => found.some(( at ) => other.has(at))));
        const all = event.bus();
        const wrong: string[] = [];

        wanted.forEach(( parts, at ) => {

            const made = event.bus();

            made.subscribe(parts.join("."), () => undefined);
            all.subscribe(parts.join("."), () => undefined);

            wanted.forEach(( asked, spot ) => {

                if ( (made.count(asked.join(".")) === 1) !== table[spot]?.[at] ) wrong.push(`${asked.join(".")} ~ ${parts.join(".")}`);

            });

        });

        expect(wanted).toHaveLength(155);
        expect(wrong).toEqual([]);
        expect(wanted.map(( asked ) => all.count(asked.join(".")))).toEqual(table.map(( row ) => row.filter(Boolean).length));
        expect(all.count()).toBe(wanted.length);

    });
    it("an emitter behaves as its model through nested deeds, throws and a sink", () => {

        fc.assert(
            fc.property(planned(step, 14), fc.boolean(), ( plan, sunk ) => {

                expect(drive(plan, emitting, sunk)).toEqual(drive(plan, emitted, sunk));

            }),
            { numRuns: runs },
        );

    });
    it("a bus behaves as its model through nested deeds, replays, eviction, throws and a sink", () => {

        fc.assert(
            fc.property(planned(deed, 14), fc.record({ replay: fc.nat({ max: 3 }), topics: fc.constantFrom(0, 1, 2, 3, 1024) }), fc.boolean(), ( plan, caps, sunk ) => {

                expect(drive(plan, routing(caps), sunk)).toEqual(drive(plan, routed(caps), sunk));

            }),
            { numRuns: runs },
        );

    });
    it("a signal behaves as its model through changes made while it tells, throws and a sink", () => {

        fc.assert(
            fc.property(planned(move, 14), fc.boolean(), ( plan, sunk ) => {

                expect(drive(plan, telling, sunk)).toEqual(drive(plan, told, sunk));

            }),
            { numRuns: runs },
        );

    });
    it("a derived value tells every change of its pick to whoever watches and nothing else", () => {

        fc.assert(
            fc.property(fc.array(move, { maxLength: 30 }), ( moves ) => {

                const source = event.signal(0);
                const made = event.derive(source, ( value ) => value % 3);
                const real: string[][] = [];
                const model: { heard: string[]; live: boolean }[] = [];
                const stops: (() => void)[] = [];
                const state = { value: 0 };
                const change = ( next: number ): void => {

                    const before = state.value % 3;

                    state.value = next;
                    source.set(next);

                    if ( before === next % 3 ) return;

                    for ( const row of model ) if ( row.live ) row.heard.push(`${before}>${next % 3}`);

                };

                for ( const one of moves ) {

                    if ( one.kind === "set" ) change(one.value);
                    else if ( one.kind === "bump" ) change(state.value + one.by);
                    else if ( one.kind === "reset" ) change(0);
                    else if ( one.kind === "watch" ) {

                        const heard: string[] = [];

                        real.push(heard);
                        model.push({ heard: one.replay ? [`${state.value % 3}>${state.value % 3}`] : [], live: true });
                        stops.push(made.watch(( next, previous ) => { heard.push(`${previous}>${next}`); }, { replay: one.replay }));

                    } else {

                        const at = one.at % Math.max(1, stops.length);
                        const row = model[at];

                        stops[at]?.();

                        if ( row ) row.live = false;

                    }

                    expect(real).toEqual(model.map(( row ) => row.heard));
                    expect(source.count()).toBe(model.some(( row ) => row.live) ? 1 : 0);

                    if ( one.kind === "set" ) expect(made.get()).toBe(state.value % 3);

                }

                expect(made.get()).toBe(state.value % 3);

            }),
            { numRuns: runs },
        );

    });
    it("wait, once and until settle with the first match and hold on without one", async () => {

        await fc.assert(
            fc.asyncProperty(pattern, fc.array(topic, { maxLength: 8 }), name, fc.array(name, { maxLength: 6 }), fc.nat({ max: 6 }), fc.array(fc.nat({ max: 6 }), { maxLength: 8 }), async ( wanted, topics, due, emits, floor, values ) => {

                const shop = event.bus();
                const made = event.emitter<Record<string, number>>();
                const cell = event.signal(0);
                const seen: unknown[] = [undefined, undefined, undefined];
                const failed: unknown[] = [];
                const miss = ( cause: unknown ): void => {

                    failed.push(cause);

                };
                const open = [
                    shop.once(wanted).then(( message ) => { seen[0] = message.id; }, miss),
                    made.wait(due).then(( payload ) => { seen[1] = payload; }, miss),
                    cell.until(( value ) => value >= floor).then(( value ) => { seen[2] = value; }, miss),
                ];

                for ( const own of topics ) shop.publish(own, 0);

                emits.forEach(( own, at ) => { made.emit(own, at + 1); });

                for ( const value of values ) cell.set(value);

                await settled();

                const hit = topics.findIndex(( own ) => accepts(wanted.split("."), own.split(".")));
                const heard = emits.indexOf(due);
                const held = floor === 0 ? 0 : values.find(( value ) => value >= floor);

                expect(open).toHaveLength(3);
                expect(failed).toEqual([]);
                expect(seen).toEqual([hit === -1 ? undefined : hit + 1, heard === -1 ? undefined : heard + 1, held]);
                expect([shop.count(), made.count(), cell.count()]).toEqual([hit === -1 ? 1 : 0, heard === -1 ? 1 : 0, held === undefined ? 1 : 0]);

            }),
            { numRuns: runs / 2 },
        );

    });
    it("a scope of a scope reads as one bus under the joined prefix and a pipe forwards what matches", () => {

        fc.assert(
            fc.property(fc.constantFrom("", "a", "a.", "b", "a.b"), fc.constantFrom("", "a", "b."), fc.array(deed, { maxLength: 14 }), ( outer, inner, deeds ) => {

                const head = [outer, inner].map(( own ) => (own === "" || own.endsWith(".") ? own : `${own}.`)).join("");
                const top = event.bus({ replay: 2 });
                const raw = event.bus({ replay: 2 });
                const made = event.scope(event.scope(top, outer), inner);
                const logs: [string[], string[]] = [[], []];
                const stops: [(() => void)[], (() => void)[]] = [[], []];
                const note = ( log: string[], index: number ) => ( _: unknown, message: event.Message ): void => {

                    log.push(`${index}:${message.id}:${message.topic}`);

                };

                for ( const one of deeds ) {

                    const at = one.kind === "stop" ? one.at % Math.max(1, stops[0].length) : 0;
                    const answers =
                        one.kind === "pub"
                            ? [made.publish(one.topic, 0), raw.publish(`${head}${one.topic}`, 0)]
                            : one.kind === "forget"
                              ? [made.forget(one.pattern), raw.forget(`${head}${one.pattern}`)]
                              : one.kind === "clear"
                                ? [top.publish("z.q", 0), raw.publish("z.q", 0)]
                                : [0, 0];

                    if ( one.kind === "sub" ) {

                        stops[0].push(made.subscribe(one.pattern, note(logs[0], one.handler), { replay: one.replay }));
                        stops[1].push(raw.subscribe(`${head}${one.pattern}`, note(logs[1], one.handler), { replay: one.replay }));

                    }

                    if ( one.kind === "stop" ) {

                        stops[0][at]?.();
                        stops[1][at]?.();

                    }

                    expect(answers[0]).toBe(answers[1] ?? -1);
                    expect(logs[0]).toEqual(logs[1]);
                    expect(logs[0].every(( line ) => line.split(":").slice(2).join(":").startsWith(head))).toBe(true);
                    expect(made.topics()).toEqual(raw.topics().filter(( own ) => own.startsWith(head)).map(( own ) => own.slice(head.length)));
                    expect(made.history().map(( message ) => message.id)).toEqual(raw.history(`${head}**`).map(( message ) => message.id));
                    expect([made.count(), made.count("a"), made.last("a")?.id]).toEqual([raw.count(`${head}**`), raw.count(`${head}a`), raw.last(`${head}a`)?.id]);
                    expect(top.topics()).toEqual(raw.topics());

                }

            }),
            { numRuns: runs / 2 },
        );
        fc.assert(
            fc.property(pattern, fc.array(topic, { maxLength: 12 }), fc.nat({ max: 12 }), ( wanted, topics, until ) => {

                const from = event.bus();
                const to = event.bus({ replay: 100 });
                const stop = event.pipe(from, to, wanted, ( own ) => `in.${own}`);
                const sent = topics.map(( own, at ) => {

                    if ( at === until ) stop();

                    return [from.publish(own, at), at < until && accepts(wanted.split("."), own.split(".")) ? own : undefined] as const;

                });

                expect(sent.map(( row ) => row[0])).toEqual(sent.map(( row ) => (row[1] === undefined ? 0 : 1)));
                expect(to.history().map(( message ) => message.topic)).toEqual(sent.flatMap(( row ) => (row[1] === undefined ? [] : [`in.${row[1]}`])));
                expect(to.history().map(( message ) => message.payload)).toEqual(sent.flatMap(( row, at ) => (row[1] === undefined ? [] : [at])));

            }),
            { numRuns: runs / 2 },
        );

    });
    it("a deadline ends by whichever comes first of its time, its parents and its own hand", () => {

        const any = Object.getOwnPropertyDescriptor(AbortSignal, "any");

        expect(typeof any?.value).toBe("function");

        if ( !any ) return;

        faked(() => {

            fc.assert(
                fc.property(term, fc.array(kin, { maxLength: 3 }), fc.array(act, { maxLength: 8 }), fc.boolean(), ( ms, kinds, acts, bare ) => {

                    if ( bare ) Object.defineProperty(AbortSignal, "any", { ...any, value: undefined });

                    try {

                        const due = Math.max(0, ms);
                        const lines = kinds.map(( kind ) => (kind === "none" ? undefined : parent(bare)));
                        const fired = new Set<number>();
                        const early = kinds.indexOf("dead");
                        const model: { aborted: boolean; reason: unknown; released: boolean; elapsed: number } = {
                            aborted: early !== -1,
                            reason: early === -1 ? undefined : `p${early}`,
                            released: false,
                            elapsed: 0,
                        };
                        const end = ( reason: unknown ): void => {

                            if ( model.aborted ) return;

                            model.aborted = true;
                            model.reason = reason;

                        };

                        kinds.forEach(( kind, at ) => {

                            if ( kind !== "dead" ) return;

                            fired.add(at);
                            lines[at]?.fire(`p${at}`);

                        });

                        const made = event.deadline(ms, ...lines.map(( line ) => line?.signal));
                        const check = (): void => {

                            expect([made.signal.aborted, read(made.signal.reason)]).toEqual([model.aborted, model.reason]);
                            expect(jest.getTimerCount()).toBe(model.aborted || model.released || due === Number.POSITIVE_INFINITY ? 0 : 1);

                            if ( bare ) expect(lines.map(( line ) => line?.held() ?? 0)).toEqual(kinds.map(( kind, at ) => (kind !== "open" || fired.has(at) || model.aborted || model.released ? 0 : 1)));

                        };

                        check();

                        for ( const one of acts ) {

                            const at = one.kind === "parent" ? one.at % Math.max(1, kinds.length) : 0;

                            if ( one.kind === "wait" ) {

                                jest.advanceTimersByTime(one.ms);
                                model.elapsed += one.ms;

                                if ( !model.released && model.elapsed >= due ) end("timeout/event.deadline");

                            } else if ( one.kind === "hand" ) {

                                made.abort("hand");
                                end("hand");

                            } else if ( one.kind === "release" ) {

                                made.release();
                                model.released = true;

                            } else if ( kinds[at] === "open" && !fired.has(at) ) {

                                fired.add(at);
                                lines[at]?.fire(`p${at}`);

                                if ( !bare || !model.released ) end(`p${at}`);

                            }

                            check();

                        }

                        made.release();

                    } finally {

                        Object.defineProperty(AbortSignal, "any", any);
                        jest.clearAllTimers();

                    }

                }),
                { numRuns: runs },
            );

        });

        expect(typeof AbortSignal.any).toBe("function");

    });
    it("a refused duration, a loop and a thrown test are named the same way everywhere", async () => {

        await fc.assert(
            fc.asyncProperty(fc.constantFrom(0, 1, 2), fc.integer({ min: 1, max: 40 }), async ( kind, extra ) => {

                const shop = event.bus();
                const made = event.emitter<{ a: number }>();
                const cell = event.signal(0);
                const waits = [shop.once("a", Number.NaN), made.wait("a", { timeout: Number.NaN }), cell.until(() => false, Number.NaN)];
                const caught = await Promise.all(waits.map(( work ) => work.then(() => undefined, ( cause: unknown ) => cause)));

                expect(caught.every(( cause ) => cause instanceof RangeError)).toBe(true);
                expect([shop.count(), made.count(), cell.count()]).toEqual([0, 0, 0]);
                expect(refused(() => event.deadline(Number.NaN))).toBeInstanceOf(RangeError);

                const seen = { calls: 0 };
                const loop = (): void => {

                    seen.calls += 1;

                    if ( kind === 0 ) shop.publish("a", 0);
                    else if ( kind === 1 ) made.emit("a", 0);
                    else cell.set(( current ) => current + 1);

                };

                shop.subscribe("a", loop);
                made.on("a", loop);
                cell.watch(loop);

                const fault = refused(() => (kind === 0 ? shop.publish("a", 0) : kind === 1 ? made.emit("a", 0) : cell.set(extra)));

                expect(read(fault)).toBe("internal/event.loop");
                expect(seen.calls).toBe(kind === 2 ? 1024 : 256);
                seen.calls = 0;
                shop.clear();
                made.clear();
                expect(refused(() => [shop.publish("a", 0), made.emit("a", 0)])).toBeUndefined();
                expect(seen.calls).toBe(0);

            }),
            { numRuns: 60 },
        );

    });
});
