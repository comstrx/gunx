import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";

describe("error", () => {

    it("the code set is closed: every code names one status and one message", () => {

        const names = Object.keys(error.codes) as error.Code[];

        expect(names).toHaveLength(18);
        expect([error.codes.ok, error.codes.validation, error.codes.unavailable, error.codes.network]).toEqual([200, 422, 503, 0]);
        expect(Object.keys(error.messages).sort()).toEqual([...names].sort());
        expect(names.every(( name ) => error.messages[name].trim() !== "")).toBe(true);
        expect([error.messages.not_found, error.messages.internal]).toEqual(["The resource was not found", "Something went wrong"]);

    });
    it("a code is told apart from every other text, and a status finds its code", () => {

        expect(error.isCode("locked") && error.isCode("ok")).toBe(true);
        expect(["toString", "constructor", "__proto__", "nope", "", 404, undefined].some(error.isCode)).toBe(false);
        expect([error.codeOf(404), error.codeOf(422), error.codeOf(0), error.codeOf(200)]).toEqual(["not_found", "validation", "network", "ok"]);
        expect([error.codeOf(408), error.codeOf(412), error.codeOf(502)]).toEqual(["timeout", "conflict", "unavailable"]);
        expect([error.codeOf(599), error.codeOf(418), error.codeOf(302), error.codeOf(Number.NaN)]).toEqual(["internal", "bad_request", "ok", "ok"]);

    });
    it("the shape of a failure is what a fault must carry", () => {

        const shaped: Pick<error.Failure, "code" | "status" | "errors"> = { code: "validation", status: error.codes.validation, errors: { email: ["taken"] } satisfies error.Errors };
        const detail: error.Detail = { reason: "signup", errors: shaped.errors };
        const wire: error.Envelope = { data: null, message: error.messages.validation, errors: shaped.errors, code: shaped.code, reason: detail.reason ?? null, meta: {} };

        expect([wire.code, wire.message, wire.errors]).toEqual(["validation", "The given data is invalid", { email: ["taken"] }]);

    });

});
