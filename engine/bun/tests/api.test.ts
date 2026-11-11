import { describe, expect, test as it } from "bun:test";
import * as engine from "engine";
import surface from "./api.json" with { type: "json" };
import { names } from "./record.ts";

const recorded = surface as Record<string, string[]>;

describe("api", () => {

    it("every member exports exactly its recorded surface, nested namespaces by their dotted names", async () => {

        for ( const [member, listed] of Object.entries(recorded) ) {

            const loaded: Record<string, unknown> = await import(`engine/${member}`);

            expect(names(loaded)).toEqual(listed);

        }

    });
    it("the facade names exactly the recorded members", () => {

        expect(Object.keys(engine).sort()).toEqual(Object.keys(recorded).sort());

    });

});
