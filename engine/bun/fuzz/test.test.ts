import { describe, expect, test as it } from "bun:test";
import { sep } from "node:path";
import * as error from "engine/error";
import * as stage from "engine/test";
import * as fc from "fast-check";

type Pushed<T> = { undo: () => void; values: Record<string, T> };

const envKeys = ["ENGINE_FUZZ_A", "ENGINE_FUZZ_B", "ENGINE_FUZZ_C"] as const;
const globalKeys = ["engineFuzzA", "engineFuzzB", "engineFuzzC"] as const;
const shared = globalThis as Record<string, unknown>;

function seen<T> ( active: readonly Pushed<T>[], key: string ): T | undefined {

    for ( let at = active.length - 1; at >= 0; at -= 1 ) {

        const values = (active[at] as Pushed<T>).values;

        if ( Object.hasOwn(values, key) ) return values[key];

    }

    return undefined;

}
function steps<T> ( keys: readonly string[], value: fc.Arbitrary<T> ): fc.Arbitrary<({ push: Record<string, T> } | { pop: number })[]> {

    return fc.array(fc.oneof(fc.record({ push: fc.dictionary(fc.constantFrom(...keys), value, { minKeys: 1 }) }), fc.record({ pop: fc.nat() })), { maxLength: 24 });

}

describe("fuzz test", () => {

    it("environment patches restored in any order always show the newest live layer and end on the original", () => {

        fc.assert(fc.property(steps(envKeys, fc.option(fc.stringMatching(/^[a-z]{0,4}$/), { nil: undefined })), fc.array(fc.nat(), { maxLength: 24 }), ( plan, order ) => {

            const active: Pushed<string | undefined>[] = [];

            for ( const step of plan ) {

                if ( "push" in step ) {

                    const made = stage.env(step.push);

                    active.push({ undo: made.restore, values: step.push });

                } else if ( active.length > 0 ) {

                    const at = step.pop % active.length;

                    (active[at] as Pushed<string | undefined>).undo();
                    active.splice(at, 1);

                }

                for ( const key of envKeys ) expect(process.env[key]).toBe(seen(active, key));

            }

            for ( const pick of [...order, ...active.map(( _, at ) => at)] ) {

                if ( active.length === 0 ) break;

                const at = pick % active.length;

                (active[at] as Pushed<string | undefined>).undo();
                active.splice(at, 1);

                for ( const key of envKeys ) expect(process.env[key]).toBe(seen(active, key));

            }

            for ( const key of envKeys ) expect(process.env[key]).toBeUndefined();

        }), { numRuns: 1500 });

    });
    it("global patches restored in any order always show the newest live layer and end with the globals gone", () => {

        fc.assert(fc.property(steps(globalKeys, fc.option(fc.integer({ min: 0, max: 9 }), { nil: undefined })), fc.array(fc.nat(), { maxLength: 24 }), ( plan, order ) => {

            const active: Pushed<number | undefined>[] = [];

            for ( const step of plan ) {

                if ( "push" in step ) active.push({ undo: stage.globals(step.push), values: step.push });
                else if ( active.length > 0 ) {

                    const at = step.pop % active.length;

                    (active[at] as Pushed<number | undefined>).undo();
                    active.splice(at, 1);

                }

                for ( const key of globalKeys ) expect([shared[key], key in globalThis && shared[key] !== undefined]).toEqual([seen(active, key), seen(active, key) !== undefined]);

            }

            for ( const pick of [...order, ...active.map(( _, at ) => at)] ) {

                if ( active.length === 0 ) break;

                const at = pick % active.length;

                (active[at] as Pushed<number | undefined>).undo();
                active.splice(at, 1);

            }

            for ( const key of globalKeys ) expect(key in globalThis).toBe(false);

        }), { numRuns: 1500 });

    });
    it("a temp file name either resolves strictly inside the folder or is refused", () => {

        const temp = stage.tmp("engine-fuzz-");
        const piece = fc.oneof(fc.constantFrom("..", ".", "", "/", "a", "b.txt", "\u0000", `${sep}etc`), fc.string({ maxLength: 6 }));

        try {

            fc.assert(fc.property(fc.array(piece, { maxLength: 6 }), ( parts ) => {

                const name = parts.join("/");
                const made = error.attemptSync(() => temp.file(name));

                if ( made.ok ) expect(made.value.startsWith(`${temp.path}${sep}`) && !made.value.includes("\u0000")).toBe(true);
                else expect(made.fault.reason).toBe("test.path");

            }), { numRuns: 5000 });

        } finally {

            temp.remove();

        }

    });

});
