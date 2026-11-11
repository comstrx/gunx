import { describe, expect, test as it, jest } from "bun:test";
import * as log from "engine/log";
import * as fc from "fast-check";

type Kind = "list" | "record" | "set" | "map";
type Outcome = "done" | "later" | "throws" | "rejects";

const runs = 5_000;
const origin = 1_700_000_000_000;
const ranks = ["debug", "info", "warn", "error"] as const;
const secretKey = fc.constantFrom("password", "token", "authorization", "apiKey", "api_key", "secret", "cookie", "credential", "signature", "passphrase", "privateKey", "sessionId", "cardNumber", "securityCode");
const alone = fc.constantFrom("pass", "pwd", "pin", "otp", "cvv", "cvc", "ssn", "jwt", "csrf", "xsrf", "bearer");
const owner = fc.constantFrom("user", "db", "client", "my", "x", "old");
const style = fc.constantFrom("camel", "snake", "kebab", "upper", "dotted", "spaced");
const kinds = fc.array(fc.constantFrom<Kind>("list", "record", "set", "map"), { maxLength: 8 });
const level = fc.constantFrom(...ranks);
const floor = fc.constantFrom<log.Level>("debug", "info", "warn", "error", "silent");
const raw = fc.array(fc.oneof(fc.constantFrom(0x0, 0x7, 0x9, 0xa, 0xd, 0x1b, 0x22, 0x5c, 0x7f, 0x80, 0x85, 0x9f, 0x2028, 0x2029), fc.integer({ min: 0x20, max: 0x7e }), fc.integer({ min: 0xa0, max: 0xffff })), { maxLength: 40 }).map(( codes ) => String.fromCharCode(...codes));
const anything = fc.anything({ withBigInt: true, withBoxedValues: true, withDate: true, withMap: true, withNullPrototype: true, withObjectString: true, withSet: true, withSparseArray: true, withTypedArray: true, maxDepth: 4 });
const shapes: (( secret: string ) => string)[] = [
    ( secret ) => `Authorization: Bearer ${secret}`,
    ( secret ) => `basic ${secret}`,
    ( secret ) => `postgres://user:${secret}@db.internal:5432/app`,
    ( secret ) => `redis://:${secret}@cache:6379/0`,
    ( secret ) => `GET /cb?code=1&access_token=${secret}&state=x`,
    ( secret ) => `/hook?a=1&sig=${secret}#top`,
    ( secret ) => `jwt eyJ${secret}.${secret}.${secret} end`,
];
const plain = fc.string({ unit: "grapheme", maxLength: 80 }).filter(( text ) => !/[:?&]|bearer|basic|eyJ/i.test(text));

function row ( message: string, at = 0, kind: log.Entry["level"] = "info" ): log.Entry {

    return { at, level: kind, name: "n", message, facts: {} };

}
function said ( entries: readonly log.Entry[] ): string[] {

    return entries.map(( entry ) => entry.message);

}
function bare ( text: string ): boolean {

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code < 32 || (code > 126 && code < 160) || code === 0x2028 || code === 0x2029 ) return false;

    }

    return true;

}
function styled ( words: readonly string[], how: string ): string {

    if ( how === "camel" ) return words.map(( word, at ) => (at === 0 ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)).join("");
    if ( how === "upper" ) return words.join("_").toUpperCase();

    return words.join(how === "snake" ? "_" : how === "kebab" ? "-" : how === "dotted" ? "." : " ");

}
function wrapped ( inner: unknown, kind: Kind ): unknown {

    if ( kind === "list" ) return [1, inner];
    if ( kind === "set" ) return new Set([inner]);
    if ( kind === "map" ) return new Map<unknown, unknown>([["held", inner]]);

    return { held: inner };

}
async function settle (): Promise<void> {

    for ( let round = 0; round < 20; round += 1 ) await Promise.resolve();

}
async function faked ( work: () => void | Promise<void> ): Promise<void> {

    jest.useFakeTimers();
    jest.setSystemTime(origin);

    try {

        await work();

    } finally {

        jest.clearAllTimers();
        jest.useRealTimers();

    }

}

describe("fuzz log", () => {

    it("redaction never keeps a secret value and never throws on any facts", () => {

        fc.assert(
            fc.property(secretKey, fc.string({ minLength: 4, maxLength: 40 }), fc.dictionary(fc.string({ maxLength: 8 }), fc.jsonValue(), { maxKeys: 4 }), ( key, secret, facts ) => {

                const out = log.redact({ ...facts, [key]: secret, nested: { [key]: secret, keep: 1 } });

                expect(out[key]).toBe("***");
                expect((out.nested as Record<string, unknown>)[key]).toBe("***");
                expect((out.nested as Record<string, unknown>).keep).toBe(1);

            }),
            { numRuns: runs },
        );

    });
    it("a secret word hides its key in every spelling", () => {

        fc.assert(
            fc.property(fc.oneof(secretKey, alone), owner, fc.constantFrom("", "value", "old"), style, ( word, before, after, how ) => {

                const parts = word.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase().split(" ");
                const spelled = styled([before, ...parts, ...(after === "" ? [] : [after])], how);
                const bareKey = styled(parts, how);

                expect(log.redact({ [spelled]: "v", [bareKey]: "v", list: [{ [spelled]: 1 }] })).toEqual({ [spelled]: "***", [bareKey]: "***", list: [{ [spelled]: "***" }] });

            }),
            { numRuns: runs },
        );

    });
    it("redaction answers any value with facts that serialise", () => {

        fc.assert(
            fc.property(anything, fc.string({ maxLength: 8 }), ( value, key ) => {

                const out = log.redact({ [key]: value, value });
                const direct = log.redact(value as log.Facts);

                expect(() => JSON.stringify(out)).not.toThrow();
                expect(() => JSON.stringify(direct)).not.toThrow();
                expect([typeof out, typeof direct, Object.getPrototypeOf(out) === Object.prototype]).toEqual(["object", "object", true]);

            }),
            { numRuns: runs },
        );

    });
    it("a secret never leaves under any nesting, by key or by shape", () => {

        fc.assert(
            fc.property(fc.uuid(), secretKey, fc.nat({ max: shapes.length - 1 }), kinds, fc.constantFrom("", "x ", "said: "), fc.constantFrom("", " end", "\nnext"), ( secret, key, shape, path, before, after ) => {

                const memory = log.memorySink();
                const logger = log.create({ sinks: [memory], level: "debug" });
                const text = `${before}${(shapes[shape] ?? String)(secret)}${after}`;
                const keyed = log.redact({ root: path.reduce(wrapped, { [key]: secret, keep: 1 }) });
                const shaped = log.redact({ root: path.reduce(wrapped, text), text });

                logger.info(text, { root: path.reduce(wrapped, { [key]: secret, note: text }) });
                logger.error(text, { [key]: secret, note: text });
                logger.error(text, new Error(text, { cause: { [key]: secret, note: text } }));
                expect([JSON.stringify(keyed).includes(secret), JSON.stringify(shaped).includes(secret), JSON.stringify(memory.entries).includes(secret)]).toEqual([false, false, false]);

            }),
            { numRuns: runs },
        );

    });
    it("masking leaves plain text alone and a masked secret stays as it is", () => {

        fc.assert(
            fc.property(plain, fc.uuid(), fc.nat({ max: shapes.length - 1 }), fc.constantFrom("", "x ", "said: "), fc.constantFrom("", " end", "\nnext"), ( text, secret, shape, before, after ) => {

                const once = log.redact({ text: `${before}${(shapes[shape] ?? String)(secret)}${after}` }).text;

                expect([log.redact({ text }).text, log.redact({ text: once }).text]).toEqual([text, once]);

            }),
            { numRuns: runs },
        );

    });
    it("the json sink writes one parseable line per entry for any message", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 64 }), fc.dictionary(fc.string({ maxLength: 8 }), fc.jsonValue(), { maxKeys: 3 }), ( message, facts ) => {

                const lines: string[] = [];
                const logger = log.create({ name: "fuzz", sinks: [log.jsonSink(( line ) => lines.push(line))] });

                logger.info(message, facts);
                expect(lines.length).toBe(1);
                expect(JSON.parse(lines[0] ?? "")).toMatchObject({ message, name: "fuzz" });

            }),
            { numRuns: runs },
        );

    });
    it("line and json sinks never write a raw control character and json reads back", () => {

        fc.assert(
            fc.property(raw, raw, raw, level, ( name, message, note, kind ) => {

                const lines: string[] = [];
                const entry: log.Entry = { at: 0, level: kind, name, message, facts: { note, [`k${note}`]: 1, list: [note] } };

                log.lineSink(( line ) => lines.push(line))(entry);
                log.jsonSink(( line ) => lines.push(line))(entry);
                expect([lines.length, lines.every(bare), lines[0]?.startsWith(`1970-01-01T00:00:00.000Z ${kind.toUpperCase().padEnd(5)} `)]).toEqual([2, true, true]);
                expect(JSON.parse(lines[1] ?? "")).toEqual({ time: "1970-01-01T00:00:00.000Z", level: kind, name, message, note, [`k${note}`]: 1, list: [note] });

            }),
            { numRuns: runs },
        );

    });
    it("a memory sink keeps the last entries and a level sink its floor", () => {

        fc.assert(
            fc.property(fc.integer({ min: 0, max: 50 }), fc.array(level, { maxLength: 200 }), floor, ( keep, levels, least ) => {

                const memory = log.memorySink(keep);
                const count = log.counting();
                const sink = log.leveled(log.tee(memory, count), least);
                const entries = levels.map(( kind, at ) => row(String(at), at, kind));
                const passed = entries.filter(( entry ) => log.levels[entry.level] >= log.levels[least]);

                for ( const entry of entries ) sink(entry);

                expect(memory.entries).toEqual(keep === 0 ? [] : passed.slice(-keep));
                expect(count.count).toEqual({ debug: passed.filter(( entry ) => entry.level === "debug").length, info: passed.filter(( entry ) => entry.level === "info").length, warn: passed.filter(( entry ) => entry.level === "warn").length, error: passed.filter(( entry ) => entry.level === "error").length });
                expect(log.lastOf(entries, least)).toBe(passed[passed.length - 1]);

            }),
            { numRuns: runs },
        );

    });
    it("once passes each entry at its first appearance within what it remembers", () => {

        fc.assert(
            fc.property(fc.integer({ min: 0, max: 6 }), fc.array(fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h"), { maxLength: 80 }), ( keep, messages ) => {

                const short = log.memorySink(1000);
                const long = log.memorySink(1000);
                const narrow = log.once(short, keep);
                const wide = log.once(long);
                const most = Math.max(1, keep);
                const seen: string[] = [];
                const wanted: string[] = [];

                for ( const message of messages ) {

                    narrow(row(message));
                    wide(row(message));

                    if ( seen.includes(message) ) continue;

                    seen.push(message);
                    wanted.push(message);

                    if ( seen.length > most ) seen.shift();

                }

                expect([said(short.entries), said(long.entries)]).toEqual([wanted, [...new Set(messages)]]);

            }),
            { numRuns: runs },
        );

    });
    it("a throttle spaces each entry and counts what it held back", () => {

        fc.assert(
            fc.property(fc.integer({ min: 1, max: 200 }), fc.array(fc.tuple(fc.constantFrom("a", "b", "c"), fc.integer({ min: 0, max: 120 })), { maxLength: 60 }), ( every, steps ) => {

                const out = log.memorySink(1000);
                const sink = log.throttled(out, every);
                const total = new Map<string, number>();
                const passed = new Map<string, number[]>();
                let at = 0;

                for ( const [message, gap] of steps ) {

                    at += gap;
                    sink(row(message, at));
                    total.set(message, (total.get(message) ?? 0) + 1);

                }

                for ( const entry of out.entries ) passed.set(entry.message, [...(passed.get(entry.message) ?? []), entry.at]);

                for ( const [message, count] of total ) {

                    const times = passed.get(message) ?? [];
                    const last = times[times.length - 1] ?? 0;
                    const held = out.entries.filter(( entry ) => entry.message === message).reduce(( sum, entry ) => sum + Number(entry.facts.suppressed ?? 0), 0);
                    const tail = steps.reduce<{ at: number; late: number }>(( state, [name, gap] ) => ({ at: state.at + gap, late: state.late + (name === message && state.at + gap >= last ? 1 : 0) }), { at: 0, late: 0 }).late;
                    const first = steps.reduce<{ at: number; found: number | undefined }>(( state, [name, gap] ) => ({ at: state.at + gap, found: state.found ?? (name === message ? state.at + gap : undefined) }), { at: 0, found: undefined }).found;

                    expect(times.every(( time, index ) => index === 0 || time - (times[index - 1] ?? 0) >= every)).toBe(true);
                    expect([times[0], times.length + held <= count, times.length + held + tail > count]).toEqual([first, true, true]);

                }

            }),
            { numRuns: runs },
        );

    });
    it("a batch sink delivers every entry once and in order whatever the sender does", async () => {

        await faked(() => fc.assert(
            fc.asyncProperty(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 80 }), fc.array(fc.constantFrom<Outcome>("done", "later", "throws", "rejects"), { maxLength: 12 }), fc.array(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 700 })), { maxLength: 16 }), async ( size, wait, outcomes, steps ) => {

                const delivered: string[] = [];
                const sizes: number[] = [];
                const plan = [...outcomes];
                let failed = 0;
                let lost = 0;
                let next = 0;
                const batch = log.batchSink(( entries ) => {

                    const outcome = plan.shift() ?? "done";

                    sizes.push(entries.length);

                    if ( outcome === "throws" || outcome === "rejects" ) failed += 1;

                    if ( outcome === "throws" ) throw new Error("down");
                    if ( outcome === "rejects" ) return Promise.reject(new Error("down"));

                    delivered.push(...said(entries));

                    return outcome === "later" ? Promise.resolve() : undefined;

                }, { size, wait, onFail: () => {

                    lost += 1;

                } });

                for ( const [count, gap] of steps ) {

                    for ( let index = 0; index < count; index += 1 ) {

                        batch(row(String(next)));
                        next += 1;

                    }

                    await settle();

                    if ( gap > 0 ) jest.advanceTimersByTime(gap);

                    await settle();

                }

                plan.length = 0;

                for ( let round = 0; round < 8 && batch.size() > 0; round += 1 ) await batch.flush();

                await settle();
                expect([delivered, batch.size(), lost, sizes.every(( held ) => held > 0)]).toEqual([Array.from({ length: next }, ( _, at ) => String(at)), 0, failed, true]);
                jest.clearAllTimers();

            }),
            { numRuns: 400 },
        ));

    });

});
