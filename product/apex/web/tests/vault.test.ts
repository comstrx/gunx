import { describe, expect, test as it } from "bun:test";
import * as cache from "engine/cache";
import { host } from "../src/specs/app.ts";
import { bump, clear, count, expire, shelf } from "../src/stores/vault.ts";

describe("vault", () => {

    it("every storage kind keeps a count under the surface's own name, a kind that fell back to memory says so, and a count given seconds to live goes when they pass", async () => {

        const first = shelf("memory");

        await clear("memory");

        expect([await count("memory"), await bump("memory"), await bump("memory"), first.volatile, first === shelf("memory")]).toEqual([undefined, 1, 2, true, true]);
        expect(await cache.open({ kind: "memory", prefix: `${host.app.id}.vault` }).get("count")).toBe(2);
        expect([await expire("memory", 1), await count("memory")]).toEqual([true, 2]);

        await new Promise(( resolve ) => { setTimeout(resolve, 1100); });

        expect([await count("memory"), await expire("memory", 1)]).toEqual([undefined, false]);

        for ( const kind of ["local", "session", "cookie"] as const ) {

            await clear(kind);

            expect([kind, await bump(kind), await count(kind)]).toEqual([kind, 1, 1]);

            await clear(kind);

            expect(await count(kind)).toBeUndefined();

        }

    });

});
