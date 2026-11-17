import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as exception from "engine/exception";

describe("exception", () => {

    it("a fault carries the closed code set with its status and message", () => {

        const plain = new exception.Fault("not_found");

        expect(plain.status).toBe(404);
        expect(plain.message).toBe("The resource was not found");
        expect(plain.is("not_found") && !plain.is("conflict")).toBe(true);
        expect(error.codes.validation).toBe(422);
        expect(Object.keys(error.codes)).toHaveLength(18);

        const invalid = exception.fault("validation", "signup.email", { errors: { email: ["taken", "short"] }, requestId: "req-1" });

        expect(invalid.reason).toBe("signup.email");
        expect(invalid.field("email")).toBe("taken");
        expect(invalid.field("name")).toBeUndefined();
        expect(invalid.with({ status: 400 }).status).toBe(400);
        expect(invalid.with({ status: 400 }).reason).toBe("signup.email");
        expect(exception.isFault(invalid) && !exception.isFault(new Error("x"))).toBe(true);
        expect(plain.is("conflict", "not_found") && !plain.is()).toBe(true);
        expect(invalid.field("constructor")).toBeUndefined();
        expect(invalid.field("toString")).toBeUndefined();

    });
    it("codes are told apart from every other text and a fault from every other throw", () => {

        expect(error.isCode("locked") && error.isCode("ok")).toBe(true);
        expect(["toString", "constructor", "__proto__", "nope", "", 404, undefined].some(error.isCode)).toBe(false);
        expect(exception.is(exception.fault("gone")) && exception.is(exception.fault("gone"), "locked", "gone")).toBe(true);
        expect(exception.is(exception.fault("gone"), "locked") || exception.is(new Error("gone")) || exception.is({ code: "gone" }, "gone")).toBe(false);
        expect(() => exception.raise("forbidden", "role.missing", { requestId: "r1" })).toThrow(exception.Fault);
        expect(exception.attemptSync(() => exception.raise("locked", "seat.held")).ok).toBe(false);

        const caught = exception.attemptSync(() => exception.raise("locked", "seat.held", { retryAfter: 2 }));

        expect(caught.ok === false && caught.fault.code === "locked" && caught.fault.reason === "seat.held" && caught.fault.retryAfter === 2).toBe(true);

    });
    it("a fault prints, persists and returns as its wire form", () => {

        const invalid = exception.fault("validation", "signup", { errors: { email: ["taken"] }, requestId: "abc", retryAfter: 3, cause: new Error("db") });
        const wire = { code: "validation", status: 422, message: "The given data is invalid", reason: "signup", errors: { email: ["taken"] }, retry_after: 3, request_id: "abc" };

        expect(invalid.toJSON()).toEqual(wire);
        expect(JSON.parse(JSON.stringify({ failure: invalid }))).toEqual({ failure: wire });

        const back = exception.fromJson(JSON.parse(JSON.stringify(invalid)));

        expect(back).toBeInstanceOf(exception.Fault);
        expect(back && exception.toJson(back)).toEqual(wire);
        expect(exception.fromJson(exception.toJson(exception.fault("unavailable").with({ status: 502 })))?.status).toBe(502);
        expect(exception.fromJson({ code: "network" })?.status).toBe(0);
        expect([{ code: "toString" }, { code: 500 }, { message: "m" }, "validation", null, undefined, []].map(exception.fromJson).every(( found ) => found === undefined)).toBe(true);

    });
    it("of, wrap and fromStatus translate unknowns", () => {

        expect(exception.of("boom").message).toBe("boom");
        expect(exception.of(new Error(""), "conflict").message).toBe("The request conflicts with the current state");
        expect(exception.of({ message: "m" }).message).toBe("m");

        const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });

        expect(exception.of(aborted).code).toBe("timeout");
        expect(exception.of(new TypeError("fetch failed")).code).toBe("network");
        expect(exception.of(new exception.Fault("gone"))).toBeInstanceOf(exception.Fault);
        expect(exception.wrap(new Error("x"), "unavailable", { reason: "db" }).reason).toBe("db");
        expect(exception.wrap(new exception.Fault("locked"), "internal", { reason: "r" }).code).toBe("locked");
        expect(exception.fromStatus(429).code).toBe("too_many_requests");
        expect(exception.fromStatus(418).code).toBe("bad_request");
        expect(exception.fromStatus(599).code).toBe("internal");
        expect(exception.fromStatus(599).status).toBe(599);
        expect(exception.messageOf(undefined, "fb")).toBe("fb");
        expect(exception.messageOf("  ", "fb")).toBe("fb");
        expect(exception.messageOf({ message: "  " }, "fb")).toBe("fb");
        expect(exception.messageOf(new Error(" "), "fb")).toBe("fb");
        expect(exception.messageOf({ message: 5 }, "fb")).toBe("fb");

    });
    it("of senses a timeout and a lost network by name, system code and message", () => {

        const named = ( name: string, message = "x" ): Error => Object.assign(new Error(message), { name });
        const coded = ( code: string ): Error => Object.assign(new Error(`${code}: failed`), { code });

        expect(exception.of(named("TimeoutError", "The operation timed out.")).code).toBe("timeout");
        expect(exception.of(named("AbortError", "")).message).toBe("The request timed out");
        expect(exception.of(AbortSignal.abort().reason).code).toBe("timeout");
        expect(["ETIMEDOUT", "ESOCKETTIMEDOUT"].map(( code ) => exception.of(coded(code)).code)).toEqual(["timeout", "timeout"]);
        expect(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "EPIPE"].every(( code ) => exception.of(coded(code)).code === "network")).toBe(true);
        expect(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "Network request failed", "Unable to connect"].every(( message ) => exception.of(new TypeError(message)).code === "network")).toBe(true);
        expect(exception.of(new TypeError("x is not a function")).code).toBe("internal");
        expect(exception.of(new Error("fetch failed")).code).toBe("internal");
        expect(exception.of(coded("EACCES"), "forbidden").code).toBe("forbidden");
        expect(exception.of({ code: "ECONNREFUSED", name: "AbortError" }).code).toBe("internal");
        expect(exception.of(coded("ECONNRESET")).cause).toBeInstanceOf(Error);
        expect(exception.of(new TypeError("")).message).toBe("Something went wrong");

    });
    it("a status maps onto the closed set and keeps itself", () => {

        const told = ( status: number ): [string, number] => [exception.fromStatus(status).code, exception.fromStatus(status).status];

        expect([408, 412, 502, 504, 503].map(told)).toEqual([["timeout", 408], ["conflict", 412], ["unavailable", 502], ["timeout", 504], ["unavailable", 503]]);
        expect([0, 401, 451, 501].map(told)).toEqual([["network", 0], ["unauthorized", 401], ["bad_request", 451], ["internal", 501]]);
        expect(exception.fromStatus(503, { reason: "db", retryAfter: 4 }).retryAfter).toBe(4);
        expect(exception.retryable(exception.fromStatus(502)) && exception.retryable(exception.fromStatus(408)) && !exception.retryable(exception.fromStatus(412))).toBe(true);

    });
    it("the envelope matches the python engine wire", () => {

        const invalid = exception.fault("validation", "r", { errors: { a: ["x"] }, requestId: "abc", retryAfter: 3 });
        const envelope = exception.toEnvelope(invalid);

        expect(envelope).toEqual({ data: null, message: "The given data is invalid", errors: { a: ["x"] }, code: "validation", reason: "r", meta: { request_id: "abc" } });
        expect(exception.toJson(invalid)).toEqual({ code: "validation", status: 422, message: "The given data is invalid", reason: "r", errors: { a: ["x"] }, retry_after: 3, request_id: "abc" });

        const back = exception.fromEnvelope(envelope, 422);

        expect(back.code).toBe("validation");
        expect(back.reason).toBe("r");
        expect(back.requestId).toBe("abc");
        expect(back.errors).toEqual({ a: ["x"] });
        expect(exception.fromEnvelope({ code: "nope", message: "m" }, 503).code).toBe("unavailable");
        expect(exception.fromEnvelope({ errors: { a: "one" } }, 422).field("a")).toBe("one");
        expect(exception.fromEnvelope("text", 500).code).toBe("internal");

    });
    it("an envelope from a hostile or broken server never names a code outside the set", () => {

        expect(["toString", "constructor", "__proto__", "valueOf", "hasOwnProperty"].map(( code ) => exception.fromEnvelope({ code }, 500).code)).toEqual(["internal", "internal", "internal", "internal", "internal"]);
        expect(exception.fromEnvelope({ code: "toString" }, 500).message).toBe("Something went wrong");
        expect(["ok", "created", "accepted"].map(( code ) => exception.fromEnvelope({ code, message: "m" }, 500).code)).toEqual(["internal", "internal", "internal"]);
        expect(exception.fromEnvelope({ code: "ok" }, 404).code).toBe("not_found");
        expect(exception.fromEnvelope({ code: "network" }, 503).code).toBe("network");
        expect(exception.fromEnvelope({ code: "conflict" }, 400).status).toBe(400);
        expect([-1, Number.NaN, Number.POSITIVE_INFINITY, "3", null].map(( retry_after ) => exception.fromEnvelope({ retry_after }, 429).retryAfter)).toEqual([undefined, undefined, undefined, undefined, undefined]);
        expect([0, 1.5].map(( retry_after ) => exception.fromEnvelope({ retry_after }, 429).retryAfter)).toEqual([0, 1.5]);
        expect(exception.fromEnvelope({ request_id: "top" }, 500).requestId).toBe("top");
        expect(exception.fromEnvelope({ request_id: "top", meta: { request_id: "meta" } }, 500).requestId).toBe("meta");
        expect(exception.fromEnvelope({ message: 5, reason: {}, errors: [], meta: "x" }, 422).message).toBe("The given data is invalid");

    });
    it("field errors are read own-only from any server shape", () => {

        const body = JSON.parse('{"errors":{"__proto__":["polluted"],"constructor":["c"],"a":["x",5,null,{"message":"m"},{"rule":"r"}],"b":{"message":"one"},"c":7,"d":[]}}') as unknown;
        const read = exception.fromEnvelope(body, 422);

        expect(read.errors).toEqual({ constructor: ["c"], a: ["x", "m"], b: ["one"], d: [] });
        expect(Object.getPrototypeOf(read.errors)).toBe(Object.prototype);
        expect(Object.keys(read.errors)).toEqual(["constructor", "a", "b", "d"]);
        expect(read.field("constructor")).toBe("c");
        expect(read.field("__proto__")).toBeUndefined();
        expect(read.field("d")).toBeUndefined();
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    });
    it("flow guards classify and capture", async () => {

        expect(exception.transient(new exception.Fault("too_many_requests")) && exception.unreachable(new exception.Fault("network"))).toBe(true);
        expect(exception.settled(new exception.Fault("forbidden")) && !exception.retryable(new exception.Fault("forbidden"))).toBe(true);
        expect(exception.retryable(new exception.Fault("unavailable"))).toBe(true);
        expect(() => exception.assert(false, "forbidden", "r")).toThrow(exception.Fault);
        expect(() => exception.assert(1)).not.toThrow();

        const okay = await exception.attempt(async () => 1);
        const failed = await exception.attempt(async () => { throw new Error("x"); }, "unavailable");

        expect(okay).toEqual({ ok: true, value: 1 });
        expect(failed.ok === false && failed.fault.code === "unavailable" && failed.fault.message === "x").toBe(true);
        expect(exception.attemptSync(() => { throw new exception.Fault("gone"); }).ok).toBe(false);

        const deep = new Error("top", { cause: new exception.Fault("timeout", { cause: "root" }) });

        expect(exception.chainOf(deep)).toHaveLength(3);
        expect(exception.rootOf(deep)).toBe("root");
        expect(exception.describe(deep)).toEqual({ name: "Error", message: "top", cause: { name: "Fault", message: "The request timed out", code: "timeout", status: 504, cause: { message: "root" } } });
        expect(exception.reference(new exception.Fault("internal", { requestId: "ab-cd-ef-gh-ij" }))).toBe("REQ-ABCDEFGH");
        expect(exception.reference(new Error("x"))).toBeUndefined();
        expect(exception.formErrors(new exception.Fault("validation", { errors: { a: ["x"] } }), "fb")).toEqual({ a: "x" });
        expect(exception.formErrors(new exception.Fault("validation", { message: "m" }), "fb")).toEqual({ _form: "m" });
        expect(exception.formErrors("x", "fb")).toEqual({ _form: "fb" });
        expect(exception.formErrors(new exception.Fault("validation", { errors: { _: ["whole"], a: [] } }), "fb")).toEqual({ _form: "whole", a: "fb" });
        expect(exception.formErrors(new exception.Fault("validation", { message: "" }), "fb")).toEqual({ _form: "fb" });

        const hostile = exception.formErrors(new exception.Fault("validation", { errors: JSON.parse('{"__proto__":["p"],"constructor":["c"]}') as error.Errors }), "fb");

        expect(Object.keys(hostile)).toEqual(["constructor"]);
        expect(Object.getPrototypeOf(hostile)).toBe(Object.prototype);

    });
    it("a result unwraps, a fault matches its arm, and a chain never loops", () => {

        expect(exception.unwrap(exception.attemptSync(() => 7))).toBe(7);
        expect(() => exception.unwrap(exception.attemptSync(() => exception.raise("gone", "post.deleted")))).toThrow("The resource is gone");

        const result: exception.Result<number> = { ok: false, fault: exception.fault("locked") };

        expect(() => exception.unwrap(result)).toThrow(exception.Fault);

        const arms: exception.Arms<string> = { not_found: () => "missing", validation: ( fault ) => `invalid:${fault.field("a") ?? ""}`, else: ( fault ) => `other:${fault.code}` };

        expect(exception.match(exception.fault("not_found"), arms)).toBe("missing");
        expect(exception.match(exception.fault("validation", "f", { errors: { a: ["x"] } }), arms)).toBe("invalid:x");
        expect(exception.match(new TypeError("Failed to fetch"), arms)).toBe("other:network");
        expect(exception.match("boom", arms)).toBe("other:internal");
        expect(exception.match(exception.fault("gone"), { ...arms, gone: undefined } as unknown as exception.Arms<string>)).toBe("other:gone");

        const first = new Error("first");
        const second = new Error("second", { cause: first });

        first.cause = second;

        expect(exception.chainOf(first)).toEqual([first, second]);
        expect(exception.rootOf(first)).toBe(second);
        expect(exception.chainOf(new Error("a", { cause: new Error("b", { cause: new Error("c") }) }), 2)).toHaveLength(2);
        expect(exception.chainOf(undefined)).toEqual([]);
        expect(exception.describe(first)).toEqual({ name: "Error", message: "first", cause: { name: "Error", message: "second", cause: { name: "Error", message: "first", cause: { name: "Error", message: "second" } } } });

    });
    it("describe carries what a log needs and never throws", () => {

        const ring: Record<string, unknown> = { a: 1 };

        ring.self = ring;

        expect(exception.describe({ status: 500, body: "x" })).toEqual({ message: '{"status":500,"body":"x"}' });
        expect(exception.describe([1, "two"])).toEqual({ message: '[1,"two"]' });
        expect(exception.describe(ring)).toEqual({ message: '{"a":1,"self":"[Circular]"}' });
        expect([undefined, null, 5, "text", 10n].map(( value ) => exception.describe(value).message)).toEqual(["undefined", "null", "5", "text", "10"]);
        expect(exception.describe(Object.assign(new Error("ECONNREFUSED: failed"), { code: "ECONNREFUSED" }))).toEqual({ name: "Error", message: "ECONNREFUSED: failed", code: "ECONNREFUSED" });
        expect(exception.describe(Object.assign(new Error("x"), { code: 23 })).code).toBe(23);
        expect(exception.describe(Object.assign(new Error("x"), { code: { deep: true } })).code).toBeUndefined();
        expect(exception.describe(exception.fault("validation", "signup", { errors: { a: ["x"] }, retryAfter: 2, requestId: "r1" }))).toEqual({
            name: "Fault", message: "The given data is invalid", code: "validation", status: 422, reason: "signup", errors: { a: ["x"] }, retryAfter: 2, requestId: "r1",
        });

    });
    it("statuses, merged field errors and an added field rule", () => {

        expect(exception.statusOf(exception.fault("not_found"))).toBe(404);
        expect(exception.statusOf(new Error("x"))).toBe(500);
        expect(exception.merge({ a: ["required"] }, undefined, { a: ["email", "required"], b: ["min:1"] })).toEqual({ a: ["required", "email"], b: ["min:1"] });
        expect(exception.merge({ constructor: ["a"], toString: ["b"] }, { constructor: ["c"] })).toEqual({ constructor: ["a", "c"], toString: ["b"] });
        expect(Object.keys(exception.merge(JSON.parse('{"__proto__":["p"],"a":["x"]}') as error.Errors))).toEqual(["a"]);
        expect(exception.merge()).toEqual({});
        expect(exception.statusOf(new TypeError("Load failed"))).toBe(0);
        expect(exception.statusOf(exception.fromStatus(599))).toBe(599);

        const made = exception.withField(exception.fault("validation", "form", { errors: { a: ["required"] } }), "b", "email");

        expect(made.code).toBe("validation");
        expect(made.errors).toEqual({ a: ["required"], b: ["email"] });
        expect(exception.withField(new Error("plain"), "x", "bad").errors).toEqual({ x: ["bad"] });

    });
    it("a probe answers what was read and nothing when the read throws, now or later", async () => {

        expect([exception.probe(() => 7), exception.probe(() => { throw new Error("no"); }), exception.probe(() => undefined)]).toEqual([7, undefined, undefined]);
        expect([await exception.probeAsync(() => 7), await exception.probeAsync(async () => 8), await exception.probeAsync(() => Promise.reject(new Error("no"))), await exception.probeAsync(() => { throw new Error("no"); })]).toEqual([7, 8, undefined, undefined]);

    });
    it("a slot holds what was bound last, falls back to its default, and raises a named fault when it holds nothing", () => {

        const bare = exception.slot<number>("unit.bare");
        const empty = exception.attemptSync(() => bare.get());
        const seen: number[] = [];
        const stop = bare.watch(() => { seen.push(bare.peek() ?? -1); });

        expect([empty.ok ? undefined : [empty.fault.code, empty.fault.reason], bare.name, bare.peek(), bare.has(), bare.bound()]).toEqual([["unavailable", "unit.bare.unbound"], "unit.bare", undefined, false, false]);

        const first = bare.use(1);
        const second = bare.use(2);

        expect([bare.get(), bare.has(), bare.bound()]).toEqual([2, true, true]);
        first();
        first();
        expect(bare.get()).toBe(2);
        second();
        expect([bare.peek(), seen]).toEqual([undefined, [1, 2, 2, -1]]);
        bare.use(3);
        bare.reset();
        stop();
        bare.use(4);
        expect([bare.get(), seen.length]).toEqual([4, 6]);

        let calls = 0;
        let given: number | undefined;
        const spare = exception.slot<number>("unit.spare", { fallback: () => { calls += 1; return given; }, check: ( value ) => value >= 0 });

        expect([spare.has(), spare.bound(), spare.peek(), calls]).toEqual([true, false, undefined, 1]);
        given = 5;
        expect([spare.get(), spare.get(), calls]).toEqual([5, 5, 2]);
        expect(spare.with(9, () => spare.get())).toBe(9);
        expect(spare.get()).toBe(5);
        given = -1;
        spare.reset();

        const rejected = exception.attemptSync(() => spare.get());
        const refused = exception.attemptSync(() => spare.use(-2));

        expect([rejected.ok ? undefined : rejected.fault.reason, refused.ok ? undefined : refused.fault.reason, spare.bound()]).toEqual(["unit.spare.rejected", "unit.spare.rejected", false]);

    });
    it("a scoped restore runs once the work ends: at once, on a throw, or when its promise settles", async () => {

        const order: string[] = [];
        const restore = (): void => { order.push("restored"); };

        expect(exception.scoped(restore, () => { order.push("ran"); return 1; })).toBe(1);
        expect(() => exception.scoped(restore, () => { throw new Error("broke"); })).toThrow("broke");

        const later = exception.scoped(restore, async () => { order.push("began"); await Promise.resolve(); order.push("ended"); return 2; });

        expect(order).toEqual(["ran", "restored", "restored", "began"]);
        expect([await later, order.slice(4)]).toEqual([2, ["ended", "restored"]]);

    });
    it("a misuse is a fault that blames the call and is never retried; an error is told from every other thrown value", () => {

        const refused = exception.misuse("not a price");
        const named = exception.misuse("not a rate", "money.rate");

        expect([refused.code, refused.status, refused.reason, refused.message, named.reason]).toEqual(["bad_request", 400, "misuse", "not a price", "money.rate"]);
        expect([exception.retryable(refused), exception.transient(refused), exception.isFault(refused)]).toEqual([false, false, true]);
        expect([exception.isError(refused), exception.isError(new TypeError("x")), exception.isError({ message: "x" }), exception.isError("x"), exception.isError(undefined)]).toEqual([true, true, false, false, false]);

    });
    it("a rescue hands back what the work made, or what mends the failure, whether the work answers now or later", async () => {

        const seen: unknown[] = [];
        const mend = ( caught: unknown ): string => { seen.push(exception.messageOf(caught)); return "mended"; };

        expect([exception.rescue(() => 7, mend), exception.rescue(() => { throw new Error("now"); }, mend)]).toEqual([7, "mended"]);
        expect([await exception.rescueAsync(async () => 8, mend), await exception.rescueAsync(() => Promise.reject(new Error("later")), mend), await exception.rescueAsync(() => { throw new Error("inside"); }, async ( caught ) => mend(caught)), await exception.rescueAsync(() => 9, mend)]).toEqual([8, "mended", "mended", 9]);
        expect(seen).toEqual(["now", "later", "inside"]);
        expect(() => exception.rescue(() => { throw new Error("first"); }, ( caught ) => { throw exception.wrap(caught, "conflict", { reason: "unit.rescue" }); })).toThrow("The request conflicts");
        await expect(exception.rescueAsync(() => Promise.reject(new Error("first")), () => { throw exception.misuse("second"); })).rejects.toThrow("second");

    });
    it("a run hands back what the call made or what it threw, without a closure; a promise in hand is mended or left quiet", async () => {

        const add = ( first: number, second: number ): number => first + second;
        const bad = ( text: string ): never => { throw new Error(text); };
        const clean = exception.run(add, 2, 3);
        const broken = exception.run(bad, "boom");
        const bare = exception.run(() => 9);

        expect([clean, bare, exception.threw(clean), exception.threw(broken), broken instanceof exception.Thrown]).toEqual([5, 9, false, true, true]);
        expect(exception.threw(broken) ? exception.messageOf(broken.caught) : "").toBe("boom");
        expect([exception.threw(undefined), exception.threw({ caught: 1 }), new exception.Thrown(7).caught]).toEqual([false, false, 7]);
        expect([await exception.mend(Promise.resolve(1), () => 2), await exception.mend(Promise.reject(new Error("no")), () => 2), await exception.mend(3, () => 4)]).toEqual([1, 2, 3]);
        await expect(exception.mend(Promise.reject(new Error("first")), ( caught ) => { throw exception.wrap(caught, "conflict"); })).rejects.toThrow("The request conflicts");
        expect(exception.quiet(Promise.reject(new Error("unheard")))).toBeUndefined();
        await Promise.resolve();

    });
});
