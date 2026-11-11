import { describe, expect, test as it, jest } from "bun:test";
import * as error from "engine/error";
import * as log from "engine/log";

const origin = 1_700_000_000_000;
const marks = [0x85, 0x2028, 0x2029, 0x7f];
const breaks = marks.map(( code ) => String.fromCharCode(code)).join("");
const escaped = marks.map(( code ) => `\\u${code.toString(16).padStart(4, "0")}`).join("");

function row ( message: string, extra: Partial<log.Entry> = {} ): log.Entry {

    return { at: 0, level: "info", name: "n", message, facts: {}, ...extra };

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

describe("log", () => {

    it("levels gate, children inherit and secrets are masked", async () => {

        const memory = log.memorySink(3);
        const count = log.counting();
        const logger = log.create({ name: "api", level: "info", sinks: [memory, count], facts: { app: "x" } });

        logger.debug("hidden");
        logger.info("hello", { password: "supersecret", nested: { token: "abcdef", keep: 1 } });
        logger.warn("careful");
        logger.error("boom", error.fault("conflict", "r"), { requestId: "1" });
        logger.error("again");

        expect(memory.entries).toHaveLength(3);
        expect(count.count).toEqual({ debug: 0, info: 1, warn: 1, error: 2 });
        expect(memory.entries[0]?.message).toBe("careful");
        expect(memory.entries[1]?.facts.failure).toMatchObject({ code: "conflict", reason: "r" });
        expect(memory.entries[1]?.facts.app).toBe("x");
        expect(logger.enabled("warn") && !logger.enabled("debug") && !logger.enabled("silent")).toBe(true);

        memory.clear();

        const child = logger.child("users", { module: "u" });

        child.info("made", { password: "supersecret", nested: { token: "abcdef", keep: 1 } });
        expect(child.name).toBe("api.users");
        expect(memory.entries[0]?.facts).toEqual({ app: "x", module: "u", password: "***", nested: { token: "***", keep: 1 } });
        expect(log.redact({ apiKey: 5, Authorization: "Bearer x" })).toEqual({ apiKey: "***", Authorization: "***" });

        const quiet = log.create({ level: "silent", sinks: [count] });

        count.reset();
        quiet.error("x");
        expect(count.count.error).toBe(0);

        const timed = log.create({ level: "debug", sinks: [memory] });
        const stop = timed.time("work");

        memory.clear();
        expect(stop()).toBeGreaterThanOrEqual(0);
        expect(memory.entries[0]?.message).toBe("work");
        expect(await timed.measure("job", async () => 7)).toBe(7);
        expect(memory.entries[1]?.facts.ok).toBe(true);
        await expect(timed.measure("job", async () => { throw new Error("no"); })).rejects.toThrow("no");
        expect(memory.entries[2]?.level).toBe("error");
        expect(log.lastOf(memory.entries, "error")?.message).toBe("job");
        expect(log.lastOf(memory.entries)?.level).toBe("error");
        expect(log.lastOf([], "info")).toBeUndefined();
        expect(log.levels.warn).toBe(30);

    });
    it("sinks compose: line, json, filter, tee, once, throttled, console", () => {

        const lines: string[] = [];
        const entry: log.Entry = { at: 0, level: "info", name: "n", message: "m", facts: { a: 1 } };

        log.lineSink(( line ) => lines.push(line))(entry);
        expect(lines[0]).toBe('1970-01-01T00:00:00.000Z INFO  n: m {"a":1}');
        log.jsonSink(( line ) => lines.push(line))(entry);
        expect(lines[1]).toBe('{"time":"1970-01-01T00:00:00.000Z","level":"info","name":"n","message":"m","a":1}');

        const seen: log.Entry[] = [];
        const keep = ( found: log.Entry ): void => { seen.push(found); };

        log.filterSink(keep, ( found ) => found.level === "error")(entry);
        expect(seen).toHaveLength(0);
        log.tee(keep, keep)(entry);
        expect(seen).toHaveLength(2);

        const single = log.once(keep);

        single(entry);
        single(entry);
        expect(seen).toHaveLength(3);

        const slow = log.throttled(keep, 1000);

        slow(entry);
        slow({ ...entry, at: 500 });
        slow({ ...entry, at: 1500 });
        expect(seen).toHaveLength(5);

        const original = { error: console.error, warn: console.warn, info: console.info, debug: console.debug };
        const calls: string[] = [];

        console.error = ( ...args: unknown[] ) => calls.push(`error:${String(args[0])}`);
        console.warn = ( ...args: unknown[] ) => calls.push(`warn:${String(args[0])}`);
        console.info = ( ...args: unknown[] ) => calls.push(`info:${String(args[0])}`);
        console.debug = ( ...args: unknown[] ) => calls.push(`debug:${String(args[0])}`);

        try {

            const sink = log.consoleSink();

            sink(entry);
            sink({ ...entry, level: "error", facts: {} });
            sink({ ...entry, level: "warn" });
            sink({ ...entry, level: "debug" });

        } finally {

            Object.assign(console, original);

        }

        expect(calls).toEqual(["info:n: m", "error:n: m", "warn:n: m", "debug:n: m"]);

    });
    it("a muted logger says nothing and still runs the measured work", async () => {

        const memory = log.memorySink();
        const quiet = log.mute(log.create({ name: "loud", sinks: [memory] }));

        quiet.info("x");
        quiet.error("y", new Error("z"));
        quiet.child("c").warn("w");
        expect(await quiet.measure("m", async () => 7)).toBe(7);
        expect(quiet.time("t")()).toBe(0);
        expect(quiet.enabled("error")).toBe(false);
        expect(quiet.level).toBe("silent");
        expect(memory.entries).toHaveLength(0);

    });
    it("redaction walks lists, sets and maps and stops at its depth and width", () => {

        const shared = { token: "t", keep: 1 };
        const loop: log.Facts = { name: "x" };
        const inner: log.Facts = { id: 1 };
        const when = new Date(0);
        const wide = Object.fromEntries(Array.from({ length: 120 }, ( _, at ) => [`k${at}`, at]));
        const many = new Map<unknown, unknown>(Array.from({ length: 130 }, ( _, at ) => [at, at]));
        const sour = Object.defineProperty({ ok: 1 } as log.Facts, "bad", { enumerable: true, get: () => { throw new Error("getter"); } });

        loop.self = loop;
        inner.me = inner;
        expect(log.redact({ list: [{ token: "a" }, "x", [{ pin: 1 }]], set: new Set([{ otp: 1, id: 2 }]), map: new Map<unknown, unknown>([["cvv", 1], ["keep", 2], [7, "n"], [{}, "o"]]) })).toEqual({
            list: [{ token: "***" }, "x", [{ pin: "***" }]],
            set: [{ otp: "***", id: 2 }],
            map: { cvv: "***", keep: 2, 7: "n", "[object Object]": "o" },
        });
        expect(log.redact({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).toEqual({ a: { b: { c: { d: { e: { f: "[deep]" } } } } } });
        expect(log.redact({ a: [[[[[[1]]]]]] })).toEqual({ a: [[[[["[deep]"]]]]] });

        const bounded = log.redact({ list: Array.from({ length: 150 }, ( _, at ) => at), set: new Set(Array.from({ length: 101 }, ( _, at ) => at)), wide, many });
        const list = bounded.list as unknown[];
        const set = bounded.set as unknown[];
        const record = bounded.wide as log.Facts;
        const map = bounded.many as log.Facts;

        expect([list.length, list[99], list[100], set.length, set[100]]).toEqual([101, 99, "[+50]", 101, "[+1]"]);
        expect([Object.keys(record).length, record["[more]"], record.k99, record.k100]).toEqual([101, 20, 99, undefined]);
        expect([Object.keys(map).length, map["[more]"], map["99"], map["100"]]).toEqual([101, 30, 99, undefined]);
        expect([Object.keys(log.redact(wide)).length, log.redact(wide)["[more]"]]).toEqual([101, 20]);
        expect(log.redact(loop)).toEqual({ name: "x", self: "[circular]" });
        expect(log.redact({ a: inner, b: [inner] })).toEqual({ a: { id: 1, me: "[circular]" }, b: [{ id: 1, me: "[circular]" }] });
        expect(log.redact({ a: shared, b: shared })).toEqual({ a: { token: "***", keep: 1 }, b: { token: "***", keep: 1 } });
        expect(shared).toEqual({ token: "t", keep: 1 });

        const kept = log.redact({ big: 12n, when, bytes: new Uint8Array(4), buffer: new ArrayBuffer(8), view: new DataView(new ArrayBuffer(2)), nil: null, none: undefined, yes: true, zero: 0, text: "", failure: new TypeError("bad", { cause: error.fault("conflict", "r") }) });

        expect(kept).toMatchObject({ big: "12", bytes: "[bytes 4]", buffer: "[bytes 8]", view: "[bytes 2]", nil: null, yes: true, zero: 0, text: "", failure: { name: "TypeError", message: "bad", cause: { name: "Fault", code: "conflict", status: 409, reason: "r" } } });
        expect([kept.when === when, "none" in kept, kept.none]).toEqual([true, true, undefined]);
        expect(log.redact({ text: Object("postgres://u:hunter2@h/db"), count: Object(5), flag: Object(false), list: [Object("Bearer abcDEF123456.xyz")] })).toEqual({ text: "postgres://***@h/db", count: 5, flag: false, list: ["Bearer ***"] });
        expect(log.redact(sour)).toEqual({ ok: 1, "[unreadable]": true });
        expect(log.redact({ inner: sour, after: 2 })).toEqual({ inner: "[unreadable]", after: 2 });
        expect(log.redact(new Proxy({}, { ownKeys: () => { throw new Error("keys"); } }))).toEqual({ "[unreadable]": true });

        const hostile = log.redact(JSON.parse('{"__proto__":{"polluted":true},"constructor":1,"prototype":2,"a":{"__proto__":{"polluted":true},"b":1}}'));

        expect(hostile).toEqual({ a: { b: 1 } });
        expect([Object.getPrototypeOf(hostile) === Object.prototype, Object.getPrototypeOf(hostile.a) === Object.prototype, "polluted" in hostile, ({} as log.Facts).polluted]).toEqual([true, true, false, undefined]);

    });
    it("a key is secret by its words, never by a lookalike", () => {

        const secret = ["password", "Password", "user_password", "userPassword", "passwd", "passphrase", "secret", "clientSecret", "token", "accessToken", "refresh_token", "tokens", "Authorization", "cookie", "set-cookie", "credentials", "privateKey", "signature", "apiKey", "api_key", "API-KEY", "x-api-key", "accessKey", "authKey", "sessionId", "session_id", "cardNumber", "card number", "securityCode", "pass", "pwd", "pin", "PIN", "otp", "cvv", "cvc", "ssn", "jwt", "csrf", "xsrf", "bearer", "userPwd", "user_pass", "dbPass", "userpass", "otpCode", "pin_code", "userPIN", "csrf-token", "bypassPwd"];
        const plain = ["passenger", "passed", "bypass", "compass", "encompass", "overpass", "surpass", "trespass", "underpass", "pinned", "spin", "opinion", "author", "privacy", "design", "sessions", "key", "keep", "id", "name", "email", "page", "total", "card", "note"];
        const memory = log.memorySink();
        const custom = log.create({ sinks: [memory], redact: ["iban", "Tax Number"], facts: { iban: "EG1", token: "t", app: "x" } });
        const open = log.create({ sinks: [memory], redact: false });

        expect(Object.entries(log.redact(Object.fromEntries(secret.map(( key ) => [key, "v"])))).filter(( [, value] ) => value !== "***")).toEqual([]);
        expect(Object.entries(log.redact(Object.fromEntries(plain.map(( key ) => [key, "v"])))).filter(( [, value] ) => value !== "v")).toEqual([]);
        expect(log.redact({ password: null, token: undefined, pin: 1234, secret: { deep: true }, otp: ["1"] })).toEqual({ password: "***", token: "***", pin: "***", secret: "***", otp: "***" });
        expect(log.redact({ nationalId: "1", national_id: "2", "National-ID": "3", other: 4, nested: [{ NATIONALID: 5 }] }, ["national_id"])).toEqual({ nationalId: "***", national_id: "***", "National-ID": "***", other: 4, nested: [{ NATIONALID: "***" }] });
        expect(log.redact({ nationalId: "1" })).toEqual({ nationalId: "1" });
        expect(Object.values(log.redact(Object.fromEntries(Array.from({ length: 1500 }, ( _, at ) => [`field${at}Token`, at])))).every(( value ) => value === "***" || typeof value === "number")).toBe(true);
        expect(log.redact({ password: "p", field7: 1 })).toEqual({ password: "***", field7: 1 });
        custom.info("m", { IBAN: "EG2", taxNumber: "9", password: "p", city: "Cairo" });
        custom.child("c", { tax_number: "8" }).info("m");
        open.info("Bearer abcDEF123456.xyz", { password: "p", big: 1n, url: "postgres://u:p@h/db" });
        expect(memory.entries.map(( entry ) => [entry.message, entry.facts])).toEqual([
            ["m", { iban: "***", token: "***", app: "x", IBAN: "***", taxNumber: "***", password: "***", city: "Cairo" }],
            ["m", { iban: "***", token: "***", app: "x", tax_number: "***" }],
            ["Bearer abcDEF123456.xyz", { password: "p", big: "1", url: "postgres://u:p@h/db" }],
        ]);

    });
    it("secrets are masked by shape inside messages and values", () => {

        const memory = log.memorySink();
        const logger = log.create({ sinks: [memory] });
        const table: [string, string][] = [
            ["Authorization: Bearer abcDEF123456.xyz", "Authorization: Bearer ***"],
            ["basic dXNlcjpwYXNzd29yZA==", "basic ***"],
            ["Bearer short1", "Bearer short1"],
            ["Bearer of good news tonight", "Bearer of good news tonight"],
            ["postgres://user:hunter2@db.internal:5432/app", "postgres://***@db.internal:5432/app"],
            ["redis://:hunter2@cache:6379/0", "redis://***@cache:6379/0"],
            ["https://user@example.com/x", "https://user@example.com/x"],
            ["http://host:8080/a@b", "http://host:8080/a@b"],
            ["GET /cb?code=1&access_token=abc123&state=x#frag", "GET /cb?code=1&access_token=***&state=x#frag"],
            ["/reset?token=abc#top", "/reset?token=***#top"],
            ["/hook?a=1&sig=zz&api_key=k1&client_secret=s", "/hook?a=1&sig=***&api_key=***&client_secret=***"],
            ["/find?tokenizer=bpe&passwords=2", "/find?tokenizer=bpe&passwords=2"],
            ["jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.c2lnbmF0dXJl end", "jwt *** end"],
            ["eyJhbGciOiJIUzI1NiJ9 alone", "eyJhbGciOiJIUzI1NiJ9 alone"],
            ["a=b", "a=b"],
            ["plain words stay as they are", "plain words stay as they are"],
        ];

        for ( const [text] of table ) logger.info(text, { text, list: [text], map: new Map([["k", text]]) });

        expect(memory.entries.map(( entry ) => [entry.message, entry.facts.text, (entry.facts.list as string[])[0], (entry.facts.map as log.Facts).k])).toEqual(table.map(( [, masked] ) => [masked, masked, masked, masked]));
        logger.info(42 as unknown as string);
        logger.info(undefined as unknown as string, { n: 1 });
        expect(said(memory.entries.slice(-2))).toEqual(["42", "undefined"]);

    });
    it("a level may move, an unknown level reads as info and a child follows its parent", () => {

        const memory = log.memorySink();
        const state: { now: log.Level } = { now: "warn" };
        const moving = log.create({ name: "root", level: () => state.now, sinks: [memory] });
        const child = moving.child("a").child("b", { part: "b" });
        const odd = log.create({ level: "loud" as log.Level, sinks: [memory] });

        moving.info("hidden");
        child.info("hidden");
        expect([moving.level, child.level, moving.enabled("warn"), moving.enabled("info"), child.name]).toEqual(["warn", "warn", true, false, "root.a.b"]);
        state.now = "debug";
        moving.debug("one");
        child.debug("two");
        expect([moving.level, moving.enabled("debug"), said(memory.entries), memory.entries[1]?.name, memory.entries[1]?.facts]).toEqual(["debug", true, ["one", "two"], "root.a.b", { part: "b" }]);
        state.now = "silent";
        moving.error("gone", new Error("x"));
        expect([memory.entries.length, moving.enabled("error"), moving.enabled("silent")]).toEqual([2, false, false]);
        state.now = "loud" as log.Level;
        moving.debug("low");
        moving.info("three");
        expect([moving.level, said(memory.entries)]).toEqual(["info", ["one", "two", "three"]]);
        memory.clear();
        odd.debug("low");
        odd.info("kept");
        expect([odd.level, odd.name, said(memory.entries), log.levels]).toEqual(["info", "app", ["kept"], { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }]);

        const matrix = (["debug", "info", "warn", "error", "silent"] as const).map(( level ) => {

            const count = log.counting();
            const logger = log.create({ level, sinks: [count] });

            logger.debug("d");
            logger.info("i");
            logger.warn("w");
            logger.error("e");

            return Object.values(count.count).join("");

        });

        expect(matrix).toEqual(["1111", "0111", "0011", "0001", "0000"]);

    });
    it("an entry carries the clock, the base facts and the failure it was given", async () => {

        const memory = log.memorySink();
        const logger = log.create({ name: "svc", level: "debug", sinks: [memory], facts: { app: "x", password: "base" } });
        const given = { password: "p", list: [{ token: "t" }] };
        const base = { app: "x", password: "***" };
        const ring = new Error("ring");
        const left = new Error("left");
        const right = new Error("right", { cause: left });

        ring.cause = ring;
        left.cause = right;
        await faked(() => {

            logger.info("first", { app: "y", n: 1 });
            jest.setSystemTime(origin + 1500);
            logger.error("plain");
            logger.error("with", new RangeError("too far"), { id: 7 });
            logger.error("text", "just text");
            logger.error("nil", null);
            logger.error("object", { code: 7, password: "p", nested: { token: "t" }, url: "redis://:hunter2@cache:6379/0" });
            logger.error("fault", error.fault("conflict", "r", { retryAfter: 3 }));
            logger.error("facts only", undefined, { id: 8 });
            logger.error("zero", 0);
            logger.error("caused", new Error("outer", { cause: { password: "p", note: "postgres://u:hunter2@h/db" } }));
            logger.error("chained", new Error("a", { cause: new TypeError("b", { cause: "Bearer abcDEF123456.xyz" }) }));
            logger.error("ring", ring);
            logger.error("pair", left);

        });
        expect(memory.entries.map(( entry ) => [entry.at - origin, entry.level, entry.name, entry.message, entry.facts])).toEqual([
            [0, "info", "svc", "first", { app: "y", password: "***", n: 1 }],
            [1500, "error", "svc", "plain", base],
            [1500, "error", "svc", "with", { ...base, id: 7, failure: { name: "RangeError", message: "too far" } }],
            [1500, "error", "svc", "text", { ...base, failure: { message: "just text" } }],
            [1500, "error", "svc", "nil", { ...base, failure: { message: "null" } }],
            [1500, "error", "svc", "object", { ...base, failure: { code: 7, password: "***", nested: { token: "***" }, url: "redis://***@cache:6379/0" } }],
            [1500, "error", "svc", "fault", { ...base, failure: { name: "Fault", message: "The request conflicts with the current state", code: "conflict", status: 409, reason: "r", retryAfter: 3 } }],
            [1500, "error", "svc", "facts only", { ...base, id: 8 }],
            [1500, "error", "svc", "zero", { ...base, failure: { message: "0" } }],
            [1500, "error", "svc", "caused", { ...base, failure: { name: "Error", message: "outer", cause: { password: "***", note: "postgres://***@h/db" } } }],
            [1500, "error", "svc", "chained", { ...base, failure: { name: "Error", message: "a", cause: { name: "TypeError", message: "b", cause: { message: "Bearer ***" } } } }],
            [1500, "error", "svc", "ring", { ...base, failure: { name: "Error", message: "ring", cause: "[circular]" } }],
            [1500, "error", "svc", "pair", { ...base, failure: { name: "Error", message: "left", cause: { name: "Error", message: "right", cause: "[circular]" } } }],
        ]);
        memory.clear();
        logger.info("mine", given);

        const first = memory.entries[0];

        if ( first ) first.facts.app = "changed";

        logger.info("next");
        expect([given, memory.entries[1]?.facts, first?.facts.list]).toEqual([{ password: "p", list: [{ token: "t" }] }, base, [{ token: "***" }]]);

    });
    it("time and measure report the lap and never swallow the failure", async () => {

        const memory = log.memorySink();
        const logger = log.create({ level: "debug", sinks: [memory] });
        const loud = log.create({ level: "warn", sinks: [memory] });
        const off = log.create({ level: "silent", sinks: [memory] });
        const thrown = { code: 9, token: "t" };
        const ms = logger.time("lap")();
        const lap = memory.entries[0];

        expect([typeof ms, ms >= 0, lap?.level, lap?.message, lap?.facts]).toEqual(["number", true, "debug", "lap", { ms }]);
        memory.clear();
        expect(await logger.measure("sync", () => 5, { id: 1 })).toBe(5);
        expect(await logger.measure("async", async () => "v")).toBe("v");
        await expect(logger.measure("fails", () => {

            throw new TypeError("bad");

        }, { id: 2 })).rejects.toThrow("bad");
        await expect(logger.measure("rejects", () => Promise.reject(thrown), { password: "p" })).rejects.toBe(thrown);
        await expect(logger.measure("text", () => Promise.reject("plain"))).rejects.toBe("plain");
        expect<unknown>(memory.entries.map(( entry ) => [entry.level, entry.message, typeof entry.facts.ms, { ...entry.facts, ms: 0 }])).toEqual([
            ["info", "sync", "number", { id: 1, ms: 0, ok: true }],
            ["info", "async", "number", { ms: 0, ok: true }],
            ["error", "fails", "number", { id: 2, ms: 0, ok: false, failure: { name: "TypeError", message: "bad" } }],
            ["error", "rejects", "number", { password: "***", ms: 0, ok: false, failure: { code: 9, token: "***" } }],
            ["error", "text", "number", { ms: 0, ok: false, failure: { message: "plain" } }],
        ]);
        expect(thrown).toEqual({ code: 9, token: "t" });
        memory.clear();
        expect(await loud.measure("quiet", () => 1)).toBe(1);
        expect(loud.time("quiet")()).toBeGreaterThanOrEqual(0);
        await expect(loud.measure("heard", () => Promise.reject(new Error("x")))).rejects.toThrow("x");
        expect(await off.measure("off", () => 2)).toBe(2);
        await expect(off.measure("off", () => Promise.reject(new Error("y")))).rejects.toThrow("y");
        expect(said(memory.entries)).toEqual(["heard"]);

    });
    it("a failing sink never breaks the caller or its siblings", () => {

        const memory = log.memorySink();
        const failures: string[] = [];
        const order: string[] = [];
        const sour: log.Sink = () => {

            throw new Error("sink down");

        };
        const logger = log.create({ sinks: [sour, memory], onFail: ( failure, entry ) => failures.push(`${(failure as Error).message}|${entry.message}`) });
        const fragile = log.create({ sinks: [sour, memory], onFail: () => {

            throw new Error("handler down");

        } });
        const silent = log.create({ sinks: [sour, memory] });
        const both = log.tee(
            ( entry ) => {

                order.push(`a:${entry.message}`);

                throw new Error("first");

            },
            ( entry ) => {

                order.push(`b:${entry.message}`);

                throw new Error("second");

            },
            ( entry ) => order.push(`c:${entry.message}`),
        );
        const teed = log.create({ sinks: [both, memory], onFail: ( failure, entry ) => failures.push(`${(failure as Error).message}|${entry.message}`) });

        logger.info("one");
        fragile.info("two");
        silent.info("three");
        expect([said(memory.entries), failures]).toEqual([["one", "two", "three"], ["sink down|one"]]);
        expect(() => both(row("m"))).toThrow("first");
        expect(order).toEqual(["a:m", "b:m", "c:m"]);
        expect(() => log.tee()(row("m"))).not.toThrow();
        teed.warn("four");
        expect([said(memory.entries), failures, order.slice(3)]).toEqual([["one", "two", "three", "four"], ["sink down|one", "first|four"], ["a:four", "b:four", "c:four"]]);

    });
    it("line and json sinks write one line that no value can forge", () => {

        const lines: string[] = [];
        const line = log.lineSink(( text ) => lines.push(text));
        const jsonl = log.jsonSink(( text ) => lines.push(text));
        const forged = `a\nb\r\tc\u001b[31m${breaks}`;
        const shown = `a\\nb\\r\\tc\\u001b[31m${escaped}`;

        line(row(forged, { level: "warn", name: `n\n${breaks}`, facts: { note: forged } }));
        line(row("مرحبا 🚀", { level: "debug", facts: { ar: "مرحبا 🚀" } }));
        line(row("m", { level: "error", at: origin }));
        line(row("m"));
        expect(lines).toEqual([
            `1970-01-01T00:00:00.000Z WARN  n\\n${escaped}: ${shown} {"note":"${shown}"}`,
            '1970-01-01T00:00:00.000Z DEBUG n: مرحبا 🚀 {"ar":"مرحبا 🚀"}',
            "2023-11-14T22:13:20.000Z ERROR n: m",
            "1970-01-01T00:00:00.000Z INFO  n: m",
        ]);
        lines.length = 0;
        jsonl(row(forged, { at: origin, level: "error", name: `svc${breaks}`, facts: { time: "t", level: "l", name: "n", message: "m", facts: "f", id: 1, note: forged, [`k${breaks}`]: 2 } }));
        jsonl(row("m", { facts: JSON.parse('{"__proto__":{"x":1},"constructor":2,"a":3}') }));
        jsonl(row("m"));
        expect(lines.map(( text ) => JSON.parse(text))).toEqual([
            { time: "2023-11-14T22:13:20.000Z", level: "error", name: `svc${breaks}`, message: forged, id: 1, note: forged, [`k${breaks}`]: 2, facts: { time: "t", level: "l", name: "n", message: "m", facts: "f" } },
            { time: "1970-01-01T00:00:00.000Z", level: "info", name: "n", message: "m", a: 3 },
            { time: "1970-01-01T00:00:00.000Z", level: "info", name: "n", message: "m" },
        ]);
        expect([lines.every(bare), lines[0]?.includes(escaped), lines[2]]).toEqual([true, true, '{"time":"1970-01-01T00:00:00.000Z","level":"info","name":"n","message":"m"}']);

    });
    it("memory, level, filter, once and throttle sinks keep what they promise", () => {

        const kept = [Number.NaN, 0, -5, 2.9, 3, undefined].map(( keep ) => {

            const memory = log.memorySink(keep);

            for ( let at = 0; at < 600; at += 1 ) memory(row(`m${at}`));

            return [memory.entries.length, memory.entries[0]?.message];

        });
        const memory = log.memorySink(2);
        const same = memory.entries;
        const matrix = (["debug", "info", "warn", "error", "silent", "loud"] as log.Level[]).map(( level ) => {

            const count = log.counting();
            const sink = log.leveled(count, level);

            for ( const kind of ["debug", "info", "warn", "error"] as const ) sink(row("m", { level: kind }));

            return Object.values(count.count).join("");

        });
        const even = log.memorySink();
        const filtered = log.filterSink(even, ( entry ) => Number(entry.message) % 2 === 0);
        const first = log.memorySink();
        const two = log.once(first, 2);
        const single = log.memorySink();
        const one = log.once(single, 0);
        const paced = log.memorySink();
        const pace = log.throttled(paced, 1000);
        const small = log.memorySink();
        const tight = log.throttled(small, 1000, 1);

        expect(kept).toEqual([[500, "m100"], [0, undefined], [0, undefined], [2, "m598"], [3, "m597"], [500, "m100"]]);
        memory(row("a"));
        memory(row("b"));
        memory(row("c"));
        expect([said(memory.entries), memory.entries === same]).toEqual([["b", "c"], true]);
        memory.clear();
        memory(row("d"));
        expect([said(memory.entries), memory.entries === same, said(same)]).toEqual([["d"], true, ["d"]]);
        expect(matrix).toEqual(["1111", "0111", "0011", "0001", "0000", "0111"]);

        for ( let at = 0; at < 6; at += 1 ) filtered(row(String(at)));

        expect(said(even.entries)).toEqual(["0", "2", "4"]);

        for ( const message of ["a", "b", "a", "c", "a", "b"] ) two(row(message));

        two(row("b", { level: "warn" }));
        two(row("b", { name: "other" }));
        two(row("b", { name: "other", at: 9, facts: { n: 1 } }));
        expect(first.entries.map(( entry ) => `${entry.level}|${entry.name}|${entry.message}`)).toEqual(["info|n|a", "info|n|b", "info|n|c", "info|n|a", "info|n|b", "warn|n|b", "info|other|b"]);

        for ( const message of ["a", "a", "b", "a", "a"] ) one(row(message));

        expect(said(single.entries)).toEqual(["a", "b", "a"]);

        for ( const at of [0, 1, 999, 1000, 1500, 400, 2400, 2401] ) pace(row("m", { at, facts: { id: at } }));

        pace(row("other", { at: 2401 }));
        pace(row("m", { at: 2401, level: "warn" }));
        expect(paced.entries.map(( entry ) => [entry.message, entry.level, entry.at, entry.facts])).toEqual([
            ["m", "info", 0, { id: 0 }],
            ["m", "info", 1000, { id: 1000, suppressed: 2 }],
            ["m", "info", 400, { id: 400, suppressed: 1 }],
            ["m", "info", 2400, { id: 2400 }],
            ["other", "info", 2401, {}],
            ["m", "warn", 2401, {}],
        ]);

        for ( const [at, message] of [[0, "a"], [1, "b"], [2, "a"], [3, "a"], [4, "b"]] as const ) tight(row(message, { at }));

        expect(small.entries.map(( entry ) => [entry.message, entry.at])).toEqual([["a", 0], ["b", 1], ["a", 2], ["b", 4]]);

        const paces = [Number.NaN, 0, -5, Number.POSITIVE_INFINITY].map(( every ) => {

            const count = log.counting();
            const sink = log.throttled(count, every);

            for ( const at of [0, 0, 5, 10 ** 12] ) sink(row("m", { at }));

            return count.count.info;

        });

        expect(paces).toEqual([4, 4, 4, 1]);

    });
    it("counting and lastOf read what was said", () => {

        const count = log.counting();
        const before = count.count;
        const entries = [row("a", { level: "debug" }), row("b", { level: "error" }), row("c", { level: "warn" }), row("d")];

        for ( const entry of entries ) count(entry);

        count(row("e", { level: "error" }));
        expect(count.count).toEqual({ debug: 1, info: 1, warn: 1, error: 2 });
        count.reset();
        expect([count.count, before.error, count.count === before]).toEqual([{ debug: 0, info: 0, warn: 0, error: 0 }, 2, false]);
        expect([log.lastOf(entries)?.message, log.lastOf(entries, "debug")?.message, log.lastOf(entries, "info")?.message, log.lastOf(entries, "warn")?.message, log.lastOf(entries, "error")?.message]).toEqual(["d", "d", "d", "c", "b"]);
        expect([log.lastOf(entries, "silent"), log.lastOf([]), log.lastOf([], "error"), log.lastOf(entries.slice(0, 1), "warn")]).toEqual([undefined, undefined, undefined, undefined]);

    });
    it("a batch sink ships by size, by wait and on flush", async () => {

        await faked(async () => {

            const sent: string[][] = [];
            const batch = log.batchSink(( entries ) => {

                sent.push(said(entries));

            }, { size: 3, wait: 100 });
            const loose = log.batchSink(( entries ) => {

                sent.push(said(entries));

            }, { size: Number.NaN, wait: Number.NaN });
            const eager = log.batchSink(( entries ) => {

                sent.push(said(entries));

            }, { size: 0 });
            const slow = log.batchSink(( entries ) => {

                sent.push(said(entries));

            }, { size: 5, wait: 10 ** 9 });

            batch(row("a"));
            batch(row("b"));
            expect([sent, batch.size()]).toEqual([[], 2]);
            batch(row("c"));
            expect([sent, batch.size()]).toEqual([[["a", "b", "c"]], 0]);
            await settle();
            jest.advanceTimersByTime(5000);
            await settle();
            expect(sent).toHaveLength(1);
            batch(row("d"));
            jest.advanceTimersByTime(99);
            await settle();
            expect(sent).toHaveLength(1);
            jest.advanceTimersByTime(1);
            await settle();
            expect([sent[1], batch.size()]).toEqual([["d"], 0]);
            batch(row("e"));
            await batch.flush();
            await batch.flush();
            jest.advanceTimersByTime(5000);
            await settle();
            expect(sent.slice(2)).toEqual([["e"]]);
            sent.length = 0;

            for ( let at = 0; at < 19; at += 1 ) loose(row(`l${at}`));

            expect([sent.length, loose.size()]).toEqual([0, 19]);
            loose(row("l19"));
            expect([sent.length, sent[0]?.length, loose.size()]).toEqual([1, 20, 0]);
            await settle();
            loose(row("late"));
            jest.advanceTimersByTime(1999);
            await settle();
            expect(sent).toHaveLength(1);
            jest.advanceTimersByTime(1);
            await settle();
            expect(sent[1]).toEqual(["late"]);
            sent.length = 0;
            eager(row("x"));
            expect(sent).toEqual([["x"]]);
            eager(row("y"));
            expect([sent.length, eager.size()]).toEqual([1, 1]);
            await settle();
            expect([sent, eager.size()]).toEqual([[["x"], ["y"]], 0]);
            await settle();
            slow(row("s"));
            jest.advanceTimersByTime(59_999);
            await settle();
            expect(sent).toHaveLength(2);
            jest.advanceTimersByTime(1);
            await settle();
            expect(sent[2]).toEqual(["s"]);

        });

    });
    it("a batch sink backs off a failing sender and loses nothing it can keep", async () => {

        await faked(async () => {

            const outcomes = [false, false, true];
            const tries: number[] = [];
            const delivered: string[][] = [];
            const lost: [string, string[]][] = [];
            const flaky = log.batchSink(async ( entries ) => {

                tries.push(Date.now() - origin);

                if ( !(outcomes.shift() ?? true) ) throw new Error("down");

                delivered.push(said(entries));

            }, { size: 2, wait: 100, onFail: ( failure, entries ) => lost.push([(failure as Error).message, said(entries)]) });
            const gaps: number[] = [];
            const dead = log.batchSink(() => {

                gaps.push(Date.now() - origin);

                throw new Error("sync down");

            }, { size: 1, wait: 100, onFail: () => {

                throw new Error("handler down");

            } });

            flaky(row("a"));
            flaky(row("b"));
            await settle();
            flaky(row("c"));
            expect([tries, flaky.size(), delivered]).toEqual([[0], 3, []]);
            jest.advanceTimersByTime(499);
            await settle();
            expect(tries).toEqual([0]);
            jest.advanceTimersByTime(1);
            await settle();
            expect([tries, flaky.size()]).toEqual([[0, 500], 3]);
            jest.advanceTimersByTime(999);
            await settle();
            expect(tries).toEqual([0, 500]);
            jest.advanceTimersByTime(1);
            await settle();
            expect([tries, flaky.size(), delivered, lost]).toEqual([[0, 500, 1500], 0, [["a", "b", "c"]], [["down", ["a", "b"]], ["down", ["a", "b", "c"]]]]);
            flaky(row("d"));
            jest.advanceTimersByTime(100);
            await settle();
            expect([tries, delivered[1]]).toEqual([[0, 500, 1500, 1600], ["d"]]);
            expect(() => dead(row("z"))).not.toThrow();

            for ( let step = 0; step < 800; step += 1 ) {

                await settle();
                jest.advanceTimersByTime(250);

            }

            await settle();
            expect([gaps.map(( at, index ) => at - (gaps[index - 1] ?? at)), dead.size()]).toEqual([[0, 500, 1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000], 1]);

        });

    });
    it("a batch sink bounds what it holds and joins its flushes", async () => {

        await faked(async () => {

            const gates: { open: () => void; fail: ( failure: unknown ) => void }[] = [];
            const sent: string[][] = [];
            const lost: string[][] = [];
            const batch = log.batchSink(( entries ) => {

                sent.push(said(entries));

                return new Promise<void>(( open, fail ) => {

                    gates.push({ open, fail });

                });

            }, { size: 2, wait: 100, keep: 3, onFail: ( _, entries ) => lost.push(said(entries)) });

            batch(row("a"));
            batch(row("b"));

            for ( const message of ["c", "d", "e", "f"] ) batch(row(message));

            expect([sent, batch.size()]).toEqual([[["a", "b"]], 3]);

            const both = Promise.all([batch.flush(), batch.flush()]);

            gates[0]?.open();
            await settle();
            expect([sent, batch.size()]).toEqual([[["a", "b"], ["d", "e", "f"]], 0]);
            batch(row("g"));
            batch(row("h"));
            gates[1]?.fail(new Error("down"));
            await both;
            await settle();
            expect([sent.length, batch.size(), lost]).toEqual([2, 3, [["d", "e", "f"]]]);
            jest.advanceTimersByTime(500);
            await settle();
            expect(sent[2]).toEqual(["f", "g", "h"]);
            gates[2]?.open();
            await batch.flush();
            expect([sent.length, batch.size()]).toEqual([3, 0]);

        });

    });
    it("a muted logger is itself all the way down", async () => {

        const memory = log.memorySink();
        const quiet = log.mute(log.create({ name: "loud", level: "debug", sinks: [memory] }));

        expect([quiet.child("c") === quiet, quiet.child("c", { a: 1 }).child("d").name, quiet.name, quiet.enabled("silent"), quiet.enabled("debug")]).toEqual([true, "loud", "loud", false, false]);
        quiet.debug("d", { a: 1 });
        await expect(quiet.measure("m", () => Promise.reject(new Error("z")))).rejects.toThrow("z");
        expect(await quiet.measure("m", () => 3)).toBe(3);
        expect(memory.entries).toHaveLength(0);

    });
});
