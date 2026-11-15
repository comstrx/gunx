import { describe, expect, test as it } from "bun:test";
import * as auth from "engine/auth";
import * as cache from "engine/cache";

describe("session operation ownership", () => {

    it("a new session invalidates an old renewal even when the refresh token is reused", async () => {

        const started = Promise.withResolvers<void>();
        const answer = Promise.withResolvers<auth.Tokens>();
        let signal: AbortSignal | undefined;
        const made = auth.session<string>({
            name: "identity",
            box: cache.open({ storage: cache.memory() }),
            now: () => 1000,
            skew: 0,
            renew: ( _, given ) => { signal = given; started.resolve(); return answer.promise; },
        });

        made.begin({ access: "first", refresh: "same", expires: 0 }, "first");
        await made.flush();

        const pending = made.token();

        try {

            await started.promise;
            made.begin({ access: "second", refresh: "same", expires: 5000 }, "second");
            answer.resolve({ access: "stale", refresh: "rotated", expires: 5000 });

            expect(await pending).toBe("second");
            expect(signal?.aborted).toBe(true);
            expect(made.user()).toBe("second");
            expect(await made.token()).toBe("second");

        } finally {

            answer.resolve({ access: "unused" });
            made.end();

        }

    }, 2000);
    it("begin owns its token copy so caller mutation cannot silently change credentials", async () => {

        const made = auth.session<string>({ name: "copy", box: cache.open({ storage: cache.memory() }), now: () => 1000, skew: 0 });
        const tokens = { access: "original", refresh: "original-refresh", expires: 5000 };

        made.begin(tokens, "user");
        tokens.access = "changed";
        tokens.refresh = "changed-refresh";

        expect(await made.token()).toBe("original");
        expect(made.state.getState().tokens?.refresh).toBe("original-refresh");
        made.end();

    });
    it("a renewal queued behind storage cannot borrow a replacement session with the same refresh token", async () => {

        const base = cache.memory();
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const storage: cache.Storage = {
            ...base,
            lock: async ( key, work ) => {

                if ( key.endsWith(".renew") ) {

                    entered.resolve();
                    await release.promise;

                }

                return base.lock ? base.lock(key, work) : work();

            },
        };
        let calls = 0;
        const made = auth.session<string>({
            name: "queued",
            box: cache.open({ storage }),
            now: () => 1000,
            skew: 0,
            renew: async () => { calls += 1; return { access: "wrong-owner", expires: 5000 }; },
        });

        made.begin({ access: "first", refresh: "shared", expires: 0 }, "first");
        await made.flush();

        const pending = made.token();

        try {

            await entered.promise;
            made.begin({ access: "second", refresh: "shared", expires: 5000 }, "second");
            release.resolve();

            expect(await pending).toBe("second");
            expect(calls).toBe(0);
            expect(made.user()).toBe("second");

        } finally {

            release.resolve();
            made.end();
            await made.flush();

        }

    }, 2000);

});
