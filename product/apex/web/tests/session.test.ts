import { describe, expect, test as it } from "bun:test";
import { specs } from "../specs/index.ts";
import { host } from "../src/specs/app.ts";
import { carried, session } from "../src/stores/session.ts";

const user = { id: "u-1", email: "admin@lab.test", name: "Admin", roles: ["admin"], tenant: "t-1" };
const tokens = { access: "a.b.c", refresh: "r-1", expires: Date.now() + 60_000 };

describe("session", () => {

    it("a session is handed over only when a transfer asks for it by name, lives in memory, and a surface adopts what it is handed each time it becomes the active one", async () => {

        const { current } = specs;

        try {

            expect([session().signed(), carried(["session"]), carried([])]).toEqual([false, {}, {}]);

            session().begin(tokens, user);

            expect([session().signed(), await session().token(), carried([]), carried(["session"]), host.app.live.get("user.email"), host.app.live.get("user.abilities")]).toEqual([true, "a.b.c", {}, { session: { tokens, user } }, "admin@lab.test", ["admin"]]);

            await host.resume("acme.client");

            expect([host.active.getState(), session().signed()]).toEqual(["acme.client", false]);

            await host.resume(current);
            await host.resume("acme.client", { locale: "en", ...carried(["session"]) });

            expect([session().signed(), session().user()?.email, host.app.live.get("user.name")]).toEqual([true, "admin@lab.test", "Admin"]);

            session().end();

            expect([session().signed(), host.app.live.get("user")]).toEqual([false, null]);

        } finally {

            await host.resume(current);
            session().end();

        }

        expect([host.active.getState(), session().signed()]).toEqual([current, false]);

    });

});
