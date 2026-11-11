import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as fc from "fast-check";

const runs = 5_000;
const names = Object.keys(error.codes) as error.Code[];
const text = fc.string({ minLength: 1, maxLength: 24 }).filter(( value ) => value.trim() !== "");
const field = fc.stringMatching(/^[a-z][a-z0-9_]{0,8}$/);
const reason = fc.stringMatching(/^[a-z]{1,6}\.[a-z]{1,6}$/);
const trace = fc.stringMatching(/^[a-z0-9]{1,16}$/);
const made = fc.record({
    code: fc.constantFrom(...names),
    message: fc.option(text, { nil: undefined }),
    reason: fc.option(reason, { nil: undefined }),
    errors: fc.option(fc.dictionary(field, fc.array(text, { maxLength: 3 }), { maxKeys: 4 }), { nil: undefined }),
    retryAfter: fc.option(fc.integer({ min: 0, max: 86_400 }), { nil: undefined }),
    requestId: fc.option(trace, { nil: undefined }),
    status: fc.option(fc.integer({ min: 400, max: 599 }), { nil: undefined }),
}).map(( given ) => error.fault(given.code, given.reason, { message: given.message, errors: given.errors, retryAfter: given.retryAfter, requestId: given.requestId, status: error.codes[given.code] >= 400 ? given.status : undefined }));

function shape ( fault: error.Fault ): unknown[] {

    return [fault.code, fault.status, fault.message, fault.reason, fault.errors, fault.retryAfter, fault.requestId];

}

describe("fuzz error", () => {

    it("a fault survives toJson and fromJson, directly and through the wire", () => {

        fc.assert(fc.property(made, ( fault ) => {

            expect(shape(error.fromJson(error.toJson(fault)) as error.Fault)).toEqual(shape(fault));
            expect(shape(error.fromJson(JSON.parse(JSON.stringify(error.toJson(fault)))) as error.Fault)).toEqual(shape(fault));

        }), { numRuns: runs });

    });
    it("a fault survives the house envelope with its status; the wait rides the Retry-After header, not the body, as on the python wire", () => {

        fc.assert(fc.property(made, ( fault ) => {

            const wired = JSON.parse(JSON.stringify(error.toEnvelope(fault))) as unknown;

            expect(shape(error.fromEnvelope(wired, fault.status))).toEqual([fault.code, fault.status, fault.message, fault.reason, fault.errors, undefined, fault.requestId]);

        }), { numRuns: runs });

    });
    it("of, messageOf and describe take anything, cycles included, and describe is always plain json", () => {

        const cyclic = (): Error => {

            const made = new Error("loop");

            (made as { cause?: unknown }).cause = made;

            return made;

        };

        fc.assert(fc.property(fc.oneof(fc.anything({ maxDepth: 3 }), fc.constant(cyclic()), text.map(( message ) => new TypeError(message)), fc.constant(Object.create(null) as unknown)), ( value ) => {

            const fault = error.of(value);

            expect(fault).toBeInstanceOf(error.Fault);
            expect(typeof fault.message).toBe("string");
            expect(typeof error.messageOf(value)).toBe("string");
            expect(() => JSON.stringify(error.describe(value))).not.toThrow();

        }), { numRuns: runs });

    });
    it("fromStatus keeps the status, names the code that owns it, and never calls a failure a success", () => {

        for ( const code of names ) expect(error.fromStatus(error.codes[code]).code).toBe(code);

        fc.assert(fc.property(fc.integer({ min: 0, max: 999 }), ( status ) => {

            const fault = error.fromStatus(status);

            expect(fault.status).toBe(status);
            expect(names).toContain(fault.code);

            if ( status >= 400 ) expect(error.codes[fault.code] >= 400).toBe(true);
            if ( status > 0 && status < 400 ) expect(error.codes[fault.code] < 400 && error.codes[fault.code] > 0).toBe(true);

        }), { numRuns: 3000 });

    });

});
