import { describe, expect, test as it } from "bun:test";
import * as engine from "engine";
import * as fc from "fast-check";

describe("fuzz engine composition", () => {

    it("a loaded ranking passes through resource and storage without losing order or identity", async () => {

        await fc.assert(fc.asyncProperty(fc.array(fc.integer({ min: -1000, max: 1000 }), { maxLength: 100 }), fc.nat({ max: 20 }), async ( values, limit ) => {

            const box = engine.cache.open({ storage: engine.cache.memory() });
            const loaded = engine.state.resource({ load: async () => engine.list.best(values, ( a, b ) => a - b, limit) });
            const result = await loaded.ensure();
            const expected = values.toSorted(( a, b ) => a - b).slice(0, limit);

            expect(result).toEqual(expected);
            expect(await loaded.ensure()).toBe(result);
            await box.set("ranked", result);
            expect(await box.get("ranked")).toEqual(expected);
            loaded.reset();
            await box.remove("ranked");
            expect(loaded.getState().status).toBe("idle");
            expect(await box.get("ranked")).toBeUndefined();

        }), { numRuns: 1000 });

    });
});
