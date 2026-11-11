import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";

describe("error", () => {

    it("a fault carries the closed code set with its status and message", () => {

        const plain = new error.Fault("not_found");

        expect(plain.status).toBe(404);
        expect(plain.message).toBe("The resource was not found");
        expect(plain.is("not_found") && !plain.is("conflict")).toBe(true);
        expect(error.codes.validation).toBe(422);
        expect(Object.keys(error.codes)).toHaveLength(18);

        const invalid = error.fault("validation", "signup.email", { errors: { email: ["taken", "short"] }, requestId: "req-1" });

        expect(invalid.reason).toBe("signup.email");
        expect(invalid.field("email")).toBe("taken");
        expect(invalid.field("name")).toBeUndefined();
        expect(invalid.with({ status: 400 }).status).toBe(400);
        expect(invalid.with({ status: 400 }).reason).toBe("signup.email");
        expect(error.isFault(invalid) && !error.isFault(new Error("x"))).toBe(true);
        expect(plain.is("conflict", "not_found") && !plain.is()).toBe(true);
        expect(invalid.field("constructor")).toBeUndefined();
        expect(invalid.field("toString")).toBeUndefined();

    });
    it("codes are told apart from every other text and a fault from every other throw", () => {

        expect(error.isCode("locked") && error.isCode("ok")).toBe(true);
        expect(["toString", "constructor", "__proto__", "nope", "", 404, undefined].some(error.isCode)).toBe(false);
        expect(error.is(error.fault("gone")) && error.is(error.fault("gone"), "locked", "gone")).toBe(true);
        expect(error.is(error.fault("gone"), "locked") || error.is(new Error("gone")) || error.is({ code: "gone" }, "gone")).toBe(false);
        expect(() => error.raise("forbidden", "role.missing", { requestId: "r1" })).toThrow(error.Fault);
        expect(error.attemptSync(() => error.raise("locked", "seat.held")).ok).toBe(false);

        const caught = error.attemptSync(() => error.raise("locked", "seat.held", { retryAfter: 2 }));

        expect(caught.ok === false && caught.fault.code === "locked" && caught.fault.reason === "seat.held" && caught.fault.retryAfter === 2).toBe(true);

    });
    it("a fault prints, persists and returns as its wire form", () => {

        const invalid = error.fault("validation", "signup", { errors: { email: ["taken"] }, requestId: "abc", retryAfter: 3, cause: new Error("db") });
        const wire = { code: "validation", status: 422, message: "The given data is invalid", reason: "signup", errors: { email: ["taken"] }, retry_after: 3, request_id: "abc" };

        expect(invalid.toJSON()).toEqual(wire);
        expect(JSON.parse(JSON.stringify({ failure: invalid }))).toEqual({ failure: wire });

        const back = error.fromJson(JSON.parse(JSON.stringify(invalid)));

        expect(back).toBeInstanceOf(error.Fault);
        expect(back && error.toJson(back)).toEqual(wire);
        expect(error.fromJson(error.toJson(error.fault("unavailable").with({ status: 502 })))?.status).toBe(502);
        expect(error.fromJson({ code: "network" })?.status).toBe(0);
        expect([{ code: "toString" }, { code: 500 }, { message: "m" }, "validation", null, undefined, []].map(error.fromJson).every(( found ) => found === undefined)).toBe(true);

    });
    it("of, wrap and fromStatus translate unknowns", () => {

        expect(error.of("boom").message).toBe("boom");
        expect(error.of(new Error(""), "conflict").message).toBe("The request conflicts with the current state");
        expect(error.of({ message: "m" }).message).toBe("m");

        const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });

        expect(error.of(aborted).code).toBe("timeout");
        expect(error.of(new TypeError("fetch failed")).code).toBe("network");
        expect(error.of(new error.Fault("gone"))).toBeInstanceOf(error.Fault);
        expect(error.wrap(new Error("x"), "unavailable", { reason: "db" }).reason).toBe("db");
        expect(error.wrap(new error.Fault("locked"), "internal", { reason: "r" }).code).toBe("locked");
        expect(error.fromStatus(429).code).toBe("too_many_requests");
        expect(error.fromStatus(418).code).toBe("bad_request");
        expect(error.fromStatus(599).code).toBe("internal");
        expect(error.fromStatus(599).status).toBe(599);
        expect(error.messageOf(undefined, "fb")).toBe("fb");
        expect(error.messageOf("  ", "fb")).toBe("fb");
        expect(error.messageOf({ message: "  " }, "fb")).toBe("fb");
        expect(error.messageOf(new Error(" "), "fb")).toBe("fb");
        expect(error.messageOf({ message: 5 }, "fb")).toBe("fb");

    });
    it("of senses a timeout and a lost network by name, system code and message", () => {

        const named = ( name: string, message = "x" ): Error => Object.assign(new Error(message), { name });
        const coded = ( code: string ): Error => Object.assign(new Error(`${code}: failed`), { code });

        expect(error.of(named("TimeoutError", "The operation timed out.")).code).toBe("timeout");
        expect(error.of(named("AbortError", "")).message).toBe("The request timed out");
        expect(error.of(AbortSignal.abort().reason).code).toBe("timeout");
        expect(["ETIMEDOUT", "ESOCKETTIMEDOUT"].map(( code ) => error.of(coded(code)).code)).toEqual(["timeout", "timeout"]);
        expect(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "EPIPE"].every(( code ) => error.of(coded(code)).code === "network")).toBe(true);
        expect(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "Network request failed", "Unable to connect"].every(( message ) => error.of(new TypeError(message)).code === "network")).toBe(true);
        expect(error.of(new TypeError("x is not a function")).code).toBe("internal");
        expect(error.of(new Error("fetch failed")).code).toBe("internal");
        expect(error.of(coded("EACCES"), "forbidden").code).toBe("forbidden");
        expect(error.of({ code: "ECONNREFUSED", name: "AbortError" }).code).toBe("internal");
        expect(error.of(coded("ECONNRESET")).cause).toBeInstanceOf(Error);
        expect(error.of(new TypeError("")).message).toBe("Something went wrong");

    });
    it("a status maps onto the closed set and keeps itself", () => {

        const told = ( status: number ): [string, number] => [error.fromStatus(status).code, error.fromStatus(status).status];

        expect([408, 412, 502, 504, 503].map(told)).toEqual([["timeout", 408], ["conflict", 412], ["unavailable", 502], ["timeout", 504], ["unavailable", 503]]);
        expect([0, 401, 451, 501].map(told)).toEqual([["network", 0], ["unauthorized", 401], ["bad_request", 451], ["internal", 501]]);
        expect(error.fromStatus(503, { reason: "db", retryAfter: 4 }).retryAfter).toBe(4);
        expect(error.retryable(error.fromStatus(502)) && error.retryable(error.fromStatus(408)) && !error.retryable(error.fromStatus(412))).toBe(true);

    });
    it("the envelope matches the python engine wire", () => {

        const invalid = error.fault("validation", "r", { errors: { a: ["x"] }, requestId: "abc", retryAfter: 3 });
        const envelope = error.toEnvelope(invalid);

        expect(envelope).toEqual({ data: null, message: "The given data is invalid", errors: { a: ["x"] }, code: "validation", reason: "r", meta: { request_id: "abc" } });
        expect(error.toJson(invalid)).toEqual({ code: "validation", status: 422, message: "The given data is invalid", reason: "r", errors: { a: ["x"] }, retry_after: 3, request_id: "abc" });

        const back = error.fromEnvelope(envelope, 422);

        expect(back.code).toBe("validation");
        expect(back.reason).toBe("r");
        expect(back.requestId).toBe("abc");
        expect(back.errors).toEqual({ a: ["x"] });
        expect(error.fromEnvelope({ code: "nope", message: "m" }, 503).code).toBe("unavailable");
        expect(error.fromEnvelope({ errors: { a: "one" } }, 422).field("a")).toBe("one");
        expect(error.fromEnvelope("text", 500).code).toBe("internal");

    });
    it("an envelope from a hostile or broken server never names a code outside the set", () => {

        expect(["toString", "constructor", "__proto__", "valueOf", "hasOwnProperty"].map(( code ) => error.fromEnvelope({ code }, 500).code)).toEqual(["internal", "internal", "internal", "internal", "internal"]);
        expect(error.fromEnvelope({ code: "toString" }, 500).message).toBe("Something went wrong");
        expect(["ok", "created", "accepted"].map(( code ) => error.fromEnvelope({ code, message: "m" }, 500).code)).toEqual(["internal", "internal", "internal"]);
        expect(error.fromEnvelope({ code: "ok" }, 404).code).toBe("not_found");
        expect(error.fromEnvelope({ code: "network" }, 503).code).toBe("network");
        expect(error.fromEnvelope({ code: "conflict" }, 400).status).toBe(400);
        expect([-1, Number.NaN, Number.POSITIVE_INFINITY, "3", null].map(( retry_after ) => error.fromEnvelope({ retry_after }, 429).retryAfter)).toEqual([undefined, undefined, undefined, undefined, undefined]);
        expect([0, 1.5].map(( retry_after ) => error.fromEnvelope({ retry_after }, 429).retryAfter)).toEqual([0, 1.5]);
        expect(error.fromEnvelope({ request_id: "top" }, 500).requestId).toBe("top");
        expect(error.fromEnvelope({ request_id: "top", meta: { request_id: "meta" } }, 500).requestId).toBe("meta");
        expect(error.fromEnvelope({ message: 5, reason: {}, errors: [], meta: "x" }, 422).message).toBe("The given data is invalid");

    });
    it("field errors are read own-only from any server shape", () => {

        const body = JSON.parse('{"errors":{"__proto__":["polluted"],"constructor":["c"],"a":["x",5,null,{"message":"m"},{"rule":"r"}],"b":{"message":"one"},"c":7,"d":[]}}') as unknown;
        const read = error.fromEnvelope(body, 422);

        expect(read.errors).toEqual({ constructor: ["c"], a: ["x", "m"], b: ["one"], d: [] });
        expect(Object.getPrototypeOf(read.errors)).toBe(Object.prototype);
        expect(Object.keys(read.errors)).toEqual(["constructor", "a", "b", "d"]);
        expect(read.field("constructor")).toBe("c");
        expect(read.field("__proto__")).toBeUndefined();
        expect(read.field("d")).toBeUndefined();
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    });
    it("flow guards classify and capture", async () => {

        expect(error.transient(new error.Fault("too_many_requests")) && error.unreachable(new error.Fault("network"))).toBe(true);
        expect(error.settled(new error.Fault("forbidden")) && !error.retryable(new error.Fault("forbidden"))).toBe(true);
        expect(error.retryable(new error.Fault("unavailable"))).toBe(true);
        expect(() => error.assert(false, "forbidden", "r")).toThrow(error.Fault);
        expect(() => error.assert(1)).not.toThrow();

        const okay = await error.attempt(async () => 1);
        const failed = await error.attempt(async () => { throw new Error("x"); }, "unavailable");

        expect(okay).toEqual({ ok: true, value: 1 });
        expect(failed.ok === false && failed.fault.code === "unavailable" && failed.fault.message === "x").toBe(true);
        expect(error.attemptSync(() => { throw new error.Fault("gone"); }).ok).toBe(false);

        const deep = new Error("top", { cause: new error.Fault("timeout", { cause: "root" }) });

        expect(error.chainOf(deep)).toHaveLength(3);
        expect(error.rootOf(deep)).toBe("root");
        expect(error.describe(deep)).toEqual({ name: "Error", message: "top", cause: { name: "Fault", message: "The request timed out", code: "timeout", status: 504, cause: { message: "root" } } });
        expect(error.reference(new error.Fault("internal", { requestId: "ab-cd-ef-gh-ij" }))).toBe("REQ-ABCDEFGH");
        expect(error.reference(new Error("x"))).toBeUndefined();
        expect(error.formErrors(new error.Fault("validation", { errors: { a: ["x"] } }), "fb")).toEqual({ a: "x" });
        expect(error.formErrors(new error.Fault("validation", { message: "m" }), "fb")).toEqual({ _form: "m" });
        expect(error.formErrors("x", "fb")).toEqual({ _form: "fb" });
        expect(error.formErrors(new error.Fault("validation", { errors: { _: ["whole"], a: [] } }), "fb")).toEqual({ _form: "whole", a: "fb" });
        expect(error.formErrors(new error.Fault("validation", { message: "" }), "fb")).toEqual({ _form: "fb" });

        const hostile = error.formErrors(new error.Fault("validation", { errors: JSON.parse('{"__proto__":["p"],"constructor":["c"]}') as error.Errors }), "fb");

        expect(Object.keys(hostile)).toEqual(["constructor"]);
        expect(Object.getPrototypeOf(hostile)).toBe(Object.prototype);

    });
    it("a result unwraps, a fault matches its arm, and a chain never loops", () => {

        expect(error.unwrap(error.attemptSync(() => 7))).toBe(7);
        expect(() => error.unwrap(error.attemptSync(() => error.raise("gone", "post.deleted")))).toThrow("The resource is gone");

        const result: error.Result<number> = { ok: false, fault: error.fault("locked") };

        expect(() => error.unwrap(result)).toThrow(error.Fault);

        const arms: error.Arms<string> = { not_found: () => "missing", validation: ( fault ) => `invalid:${fault.field("a") ?? ""}`, else: ( fault ) => `other:${fault.code}` };

        expect(error.match(error.fault("not_found"), arms)).toBe("missing");
        expect(error.match(error.fault("validation", "f", { errors: { a: ["x"] } }), arms)).toBe("invalid:x");
        expect(error.match(new TypeError("Failed to fetch"), arms)).toBe("other:network");
        expect(error.match("boom", arms)).toBe("other:internal");
        expect(error.match(error.fault("gone"), { ...arms, gone: undefined } as unknown as error.Arms<string>)).toBe("other:gone");

        const first = new Error("first");
        const second = new Error("second", { cause: first });

        first.cause = second;

        expect(error.chainOf(first)).toEqual([first, second]);
        expect(error.rootOf(first)).toBe(second);
        expect(error.chainOf(new Error("a", { cause: new Error("b", { cause: new Error("c") }) }), 2)).toHaveLength(2);
        expect(error.chainOf(undefined)).toEqual([]);
        expect(error.describe(first)).toEqual({ name: "Error", message: "first", cause: { name: "Error", message: "second", cause: { name: "Error", message: "first", cause: { name: "Error", message: "second" } } } });

    });
    it("describe carries what a log needs and never throws", () => {

        const ring: Record<string, unknown> = { a: 1 };

        ring.self = ring;

        expect(error.describe({ status: 500, body: "x" })).toEqual({ message: '{"status":500,"body":"x"}' });
        expect(error.describe([1, "two"])).toEqual({ message: '[1,"two"]' });
        expect(error.describe(ring)).toEqual({ message: '{"a":1,"self":"[Circular]"}' });
        expect([undefined, null, 5, "text", 10n].map(( value ) => error.describe(value).message)).toEqual(["undefined", "null", "5", "text", "10"]);
        expect(error.describe(Object.assign(new Error("ECONNREFUSED: failed"), { code: "ECONNREFUSED" }))).toEqual({ name: "Error", message: "ECONNREFUSED: failed", code: "ECONNREFUSED" });
        expect(error.describe(Object.assign(new Error("x"), { code: 23 })).code).toBe(23);
        expect(error.describe(Object.assign(new Error("x"), { code: { deep: true } })).code).toBeUndefined();
        expect(error.describe(error.fault("validation", "signup", { errors: { a: ["x"] }, retryAfter: 2, requestId: "r1" }))).toEqual({
            name: "Fault", message: "The given data is invalid", code: "validation", status: 422, reason: "signup", errors: { a: ["x"] }, retryAfter: 2, requestId: "r1",
        });

    });
    it("statuses, merged field errors and an added field rule", () => {

        expect(error.statusOf(error.fault("not_found"))).toBe(404);
        expect(error.statusOf(new Error("x"))).toBe(500);
        expect(error.merge({ a: ["required"] }, undefined, { a: ["email", "required"], b: ["min:1"] })).toEqual({ a: ["required", "email"], b: ["min:1"] });
        expect(error.merge({ constructor: ["a"], toString: ["b"] }, { constructor: ["c"] })).toEqual({ constructor: ["a", "c"], toString: ["b"] });
        expect(Object.keys(error.merge(JSON.parse('{"__proto__":["p"],"a":["x"]}') as error.Errors))).toEqual(["a"]);
        expect(error.merge()).toEqual({});
        expect(error.statusOf(new TypeError("Load failed"))).toBe(0);
        expect(error.statusOf(error.fromStatus(599))).toBe(599);

        const made = error.withField(error.fault("validation", "form", { errors: { a: ["required"] } }), "b", "email");

        expect(made.code).toBe("validation");
        expect(made.errors).toEqual({ a: ["required"], b: ["email"] });
        expect(error.withField(new Error("plain"), "x", "bad").errors).toEqual({ x: ["bad"] });

    });
});
