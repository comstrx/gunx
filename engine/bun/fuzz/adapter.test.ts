import { describe, expect, test as it } from "bun:test";
import * as adapter from "engine/adapter";
import * as fc from "fast-check";

function failure ( work: () => unknown ): string | undefined {

    try {

        work();

    } catch ( caught ) {

        return caught instanceof Error ? caught.message : String(caught);

    }

    return undefined;

}

describe("fuzz adapter", () => {

    it("bindings match a stack model through lazy values, stale restores, reset and failed scopes", () => {

        fc.assert(fc.property(fc.array(fc.record({ kind: fc.constantFrom("use", "lazy", "undo", "reset", "scope", "reject"), value: fc.nat({ max: 1000 }) }), { maxLength: 200 }), ( steps ) => {

            const made = adapter.port<number>("model", { fallback: () => 0, check: ( value ) => value >= 0 });
            const restores: (() => void)[] = [];
            let model: { id: number; value: number }[] = [];

            for ( const step of steps ) {

                const observed: unknown[] = [];
                const expected: unknown[] = [];

                if ( step.kind === "use" || step.kind === "lazy" ) {

                    const id = restores.length;

                    restores.push(step.kind === "use" ? made.use(step.value) : made.lazy(() => step.value));
                    model.push({ id, value: step.value });

                } else if ( step.kind === "undo" ) {

                    const id = step.value % Math.max(1, restores.length);

                    restores[id]?.();
                    model = model.filter(( row ) => row.id !== id);

                } else if ( step.kind === "reset" ) {

                    made.reset();
                    model = [];

                } else if ( step.kind === "scope" ) {

                    observed.push(made.with(step.value, () => made.get()), failure(() => made.with(step.value, () => { throw new Error("scope"); })));
                    expected.push(step.value, "scope");

                } else {

                    observed.push(failure(() => made.use(-1)));
                    expected.push("model: the given adapter does not pass the port's check");

                }

                expect(observed).toEqual(expected);
                expect(made.bound()).toBe(model.length > 0);
                expect(made.get()).toBe(model.at(-1)?.value ?? 0);

            }

            made.reset();

            for ( const restore of restores ) restore();

            expect(made.get()).toBe(0);
            expect(made.bound()).toBe(false);

        }), { numRuns: 4000 });

    });
});
