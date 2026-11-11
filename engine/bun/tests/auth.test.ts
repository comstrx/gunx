import { describe, expect, test as it } from "bun:test";
import * as auth from "engine/auth";
import * as cache from "engine/cache";
import * as crypto from "engine/crypto";
import * as error from "engine/error";
import * as state from "engine/state";

type User = { id: string; abilities: string[]; roles: string[] };

const user: User = { id: "u1", abilities: ["orders.*"], roles: ["staff"] };

function clock ( start: number ): { now: () => number; move: ( ms: number ) => void } {

    let at = start;

    return { now: () => at, move: ( ms ) => { at += ms; } };

}
function tick ( ms = 0 ): Promise<void> {

    return new Promise(( done ) => setTimeout(done, ms));

}
function told ( run: () => unknown ): string {

    try {

        run();

        return "ok";

    } catch ( failure ) {

        if ( error.is(failure) ) return `${failure.code}/${failure.reason}`;

        return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

    }

}

describe("auth", () => {

    it("a session renews once for every concurrent caller and keeps the old refresh token", async () => {

        const time = clock(1_000_000);
        let renewals = 0;
        const signed = auth.session<User>({
            name: "s1",
            box: cache.open({ storage: cache.memory() }),
            now: time.now,
            renew: async ( refresh ) => {

                renewals += 1;
                expect(refresh).toBe("r1");

                return { access: "a2", expires: time.now() + 600_000 };

            },
        });

        signed.begin({ access: "a1", refresh: "r1", expires: time.now() + 60_000 }, user);
        expect(await signed.token()).toBe("a1");
        expect(signed.expiresIn()).toBe(60_000);
        time.move(45_000);

        const answers = await Promise.all([signed.token(), signed.token(), signed.token()]);

        expect(answers).toEqual(["a2", "a2", "a2"]);
        expect(renewals).toBe(1);
        expect(signed.state.getState().tokens?.refresh).toBe("r1");
        expect(signed.signed() && signed.user()?.id === "u1").toBe(true);
        signed.update({ ...user, roles: ["admin"] });
        expect(signed.user()?.roles).toEqual(["admin"]);
        expect(signed.state.getState().since).toBe(1_000_000);

    });
    it("a refused renewal ends the session; a transient one keeps it; no refresh path ends it", async () => {

        const time = clock(0);
        let answer: error.Fault = error.fault("unavailable", "gateway.upstream");
        const signed = auth.session<User>({ name: "s2", box: cache.open({ storage: cache.memory() }), now: time.now, renew: async () => { throw answer; } });

        signed.begin({ access: "a1", refresh: "r1", expires: 10 }, user);
        await expect(signed.token()).rejects.toMatchObject({ code: "unavailable" });
        expect(signed.signed()).toBe(true);
        answer = error.fault("unauthorized", "session.expired");
        await expect(signed.token()).rejects.toMatchObject({ code: "unauthorized" });
        expect(signed.signed()).toBe(false);
        expect(await signed.token()).toBeNull();
        expect(signed.expiresIn()).toBeUndefined();

        const stale = auth.session<User>({ name: "s3", box: cache.open({ storage: cache.memory() }), now: () => 100 });

        stale.begin({ access: "a1", expires: 50 }, user);
        expect(await stale.token()).toBeNull();
        expect(stale.signed()).toBe(false);

    });
    it("a session persists, hydrates and reads the expiry out of a jwt", async () => {

        const box = cache.open({ storage: cache.memory(), prefix: "auth" });
        const token = await crypto.signToken({ sub: "u1" }, "secret", { expiresIn: 3600, now: 1_000_000_000 });

        expect(auth.expiryOf(token)).toBe(1_000_000_000 + 3_600_000);
        expect(auth.expiryOf("nope")).toBeUndefined();
        expect(auth.withExpiry({ access: token }).expires).toBe(1_000_000_000 + 3_600_000);
        expect(auth.withExpiry({ access: token, expires: 5 }).expires).toBe(5);

        const first = auth.session<User>({ name: "s4", box, now: () => 1_000_000_000 });

        await first.hydrate();
        first.begin({ access: token }, user);
        await new Promise(( resolve ) => setTimeout(resolve, 0));

        const second = auth.session<User>({ name: "s4", box, now: () => 1_000_000_000 });

        expect(second.signed()).toBe(false);
        await second.hydrate();
        expect(second.signed()).toBe(true);
        expect(await second.token()).toBe(token);
        second.end();

    });
    it("abilities cover wildcards and scopes, roles match, missing ones are named", () => {

        expect(auth.granted(["orders.*"], ["orders.read", "orders.items.write"])).toBe(true);
        expect(auth.granted(["*"], ["anything"])).toBe(true);
        expect(auth.granted(["orders.read"], ["orders.write"])).toBe(false);
        expect(auth.granted(["orders.read"], ["orders.write", "orders.read"], "any")).toBe(true);
        expect(auth.missing(["orders.read"], ["orders.read", "users.read"])).toEqual(["users.read"]);
        expect(auth.can(user, "orders.read") && auth.can(user, []) && !auth.can(null, "orders.read") && !auth.can(user, "users.read")).toBe(true);
        expect(auth.hasRole(user, "staff") && auth.hasRole(user, ["admin", "staff"]) && !auth.hasRole(user, ["admin", "staff"], "all")).toBe(true);
        expect(auth.expand(["orders.*", "users.read"], ["users.write", "orders.read", "orders.write", "users.read"])).toEqual(["orders.read", "orders.write", "users.read"]);

    });

    it("two sessions on one storage renew a rotating refresh token once and the second adopts the first's answer", async () => {

        const storage = cache.memory();
        const valid = new Set(["r1"]);
        const calls: string[] = [];
        const time = clock(1_000_000);
        const renew: auth.Renew = async ( refresh ) => {

            calls.push(refresh);
            await tick(2);

            if ( !valid.has(refresh) ) throw error.fault("unauthorized", "invalid_grant");

            valid.delete(refresh);

            const next = `r${calls.length + 1}`;

            valid.add(next);

            return { access: `a-${next}`, refresh: next, expires: time.now() + 600_000 };

        };
        const make = (): auth.Session<User> => auth.session<User>({ name: "pair", box: cache.open({ storage }), now: time.now, renew });
        const a = make();
        const b = make();

        await Promise.all([a.hydrate(), b.hydrate()]);
        a.begin({ access: "a1", refresh: "r1", expires: time.now() + 60_000 }, user);
        await a.flush();
        await tick();
        expect(b.state.getState().tokens?.access).toBe("a1");
        time.move(61_000);

        const [ta, tb] = await Promise.all([a.token(), b.token()]);

        expect([ta, tb, calls, a.state.getState().tokens?.refresh, b.state.getState().tokens?.refresh]).toEqual(["a-r2", "a-r2", ["r1"], "r2", "r2"]);
        time.move(700_000);
        expect(await b.renew()).toBe("a-r3");
        await tick();
        expect([calls, a.state.getState().tokens?.access]).toEqual([["r1", "r2"], "a-r3"]);
        a.end();
        await a.flush();
        await tick();
        expect([a.signed(), b.signed(), await b.token()]).toEqual([false, false, null]);
        a.state.stop();
        b.state.stop();

    });
    it("a sign-out or a new sign-in during a renewal wins over the late answer, and the renewal's signal is aborted", async () => {

        const time = clock(0);
        const seen: boolean[] = [];
        const release: (( tokens: auth.Tokens ) => void)[] = [];
        const signed = auth.session<User>({ name: "late", box: cache.open({ storage: cache.memory() }), now: time.now, renew: ( _, signal ) => new Promise(( resolve ) => {

            release.push(resolve);
            signal.addEventListener("abort", () => seen.push(true), { once: true });

        }) });

        signed.begin({ access: "a1", refresh: "r1", expires: 10 }, user);
        time.move(20);

        const first = signed.token();

        await tick();
        signed.end();
        release[0]?.({ access: "a2", refresh: "r2", expires: 1000 });
        expect([await first, signed.signed(), seen]).toEqual([null, false, [true]]);
        signed.begin({ access: "b1", refresh: "q1", expires: 30 }, user);

        const second = signed.token();

        await tick();
        signed.begin({ access: "fresh", refresh: "q2", expires: 500_000 }, user);
        release[1]?.({ access: "old2", refresh: "q9", expires: 1000 });
        expect([await second, signed.state.getState().tokens?.access, seen]).toEqual(["fresh", "fresh", [true, true]]);

        const renewed = signed.renew();

        await tick();
        release[2]?.({ access: "r-access" });
        expect([await renewed, signed.state.getState().tokens]).toEqual(["r-access", { access: "r-access", refresh: "q2" }]);

    });
    it("a renewal that is refused for good ends the session, a passing failure keeps it, junk tokens are faults", async () => {

        const time = clock(0);
        const seen: string[] = [];

        for ( const [code, ends] of [["bad_request", true], ["unauthorized", true], ["forbidden", true], ["not_found", true], ["gone", true], ["validation", true], ["unavailable", false], ["internal", false], ["timeout", false], ["conflict", false], ["too_many", false]] as const ) {

            const made = auth.session<User>({ name: "codes", box: cache.open({ storage: cache.memory() }), now: time.now, renew: async () => { throw error.fault(code as error.Code, "x"); } });

            made.begin({ access: "a1", refresh: "r1", expires: 10 }, user);
            time.move(20);
            await expect(made.token()).rejects.toMatchObject({ code });
            seen.push(`${code}:${made.signed()}`);
            expect(made.signed()).toBe(!ends);

        }

        expect(seen).toHaveLength(11);

        const raw = auth.session<User>({ name: "raw", box: cache.open({ storage: cache.memory() }), now: () => 100, renew: async () => { throw new TypeError("boom"); } });

        raw.begin({ access: "a1", refresh: "r1", expires: 10 }, user);
        await expect(raw.token()).rejects.toMatchObject({ code: "internal" });
        expect(raw.signed()).toBe(true);

        const junk = auth.session<User>({ name: "junk", box: cache.open({ storage: cache.memory() }), now: () => 100, renew: async () => ({ refresh: "r2" }) as unknown as auth.Tokens });

        junk.begin({ access: "a1", refresh: "r1", expires: 10 }, user);
        await expect(junk.token()).rejects.toMatchObject({ code: "internal", reason: "auth.tokens" });
        expect(junk.state.getState().tokens).toEqual({ access: "a1", refresh: "r1", expires: 10 });

        for ( const bad of [{ access: "" }, { access: 5 }, { access: "a", refresh: 1 }, { access: "a", expires: Number.NaN }, { access: "a", expires: "soon" }, null, "a"] ) expect(told(() => junk.begin(bad as unknown as auth.Tokens, user))).toBe("internal/auth.tokens");

        expect(junk.signed()).toBe(true);

        for ( const skew of [Number.NaN, -1, Number.POSITIVE_INFINITY] ) expect(told(() => auth.session<User>({ name: "skew", box: cache.open({ storage: cache.memory() }), skew }))).toBe("RangeError: not a duration");

        const soon = auth.session<User>({ name: "soon", box: cache.open({ storage: cache.memory() }), now: () => 100, skew: 0 });

        soon.begin({ access: "a", expires: 100 }, user);
        expect([soon.expiresIn(), await soon.token(), soon.signed()]).toEqual([0, null, false]);
        soon.begin({ access: "a", expires: 101 }, user);
        expect([soon.expiresIn(), await soon.token()]).toEqual([1, "a"]);
        expect([await soon.renew(), soon.signed()]).toEqual([null, false]);

    });
    it("saved sessions hydrate only when sound and current, siblings hear sign-in and sign-out, and watch reports each turn", async () => {

        const storage = cache.memory();
        const faults: string[] = [];
        const heard: (User | null)[] = [];
        const open = ( version?: number ): auth.Session<User> => auth.session<User>({ name: "saved", box: cache.open({ storage }), now: () => 1000, version, fail: ( fault ) => faults.push(told(() => { throw fault; })) });
        const first = open();

        await first.hydrate();

        const stopWatch = first.watch(( who ) => { heard.push(who); });

        first.begin({ access: "a1" }, user);
        first.update({ ...user, roles: ["admin"] });
        first.update({ ...user, roles: ["admin"] });
        await first.flush();

        const second = open();

        await second.hydrate();
        expect([second.signed(), second.user()?.roles, await second.token()]).toEqual([true, ["admin"], "a1"]);
        await tick();
        second.end();
        await second.flush();
        await tick();
        expect([first.signed(), heard.map(( who ) => who?.roles ?? null)]).toEqual([false, [["staff"], ["admin"], null]]);
        stopWatch();
        first.state.stop();
        second.state.stop();

        const box = cache.open({ storage });

        await box.set(state.keyOf("saved"), { version: 1, state: { tokens: { access: 5 }, user, since: 1 } });

        const junk = open();

        await junk.hydrate();
        expect([junk.signed(), junk.user(), faults]).toEqual([false, null, []]);
        await box.set(state.keyOf("saved"), { version: 1, state: { tokens: { access: "ok" }, user: null, since: "x" } });

        const partial = open();

        await partial.hydrate();
        expect([partial.signed(), partial.user(), partial.state.getState().since]).toEqual([true, null, null]);
        partial.state.stop();

        const bumped = open(2);

        await bumped.hydrate();
        expect([bumped.signed(), await box.get(state.keyOf("saved"))]).toEqual([false, { version: 1, state: { tokens: { access: "ok" }, user: null, since: "x" } }]);
        bumped.state.stop();

        const refusing = cache.open({ storage: cache.driver({ get: () => { throw new Error("locked"); }, set: () => undefined, delete: () => undefined, keys: () => [], lock: cache.serial() }) });
        const blind = auth.session<User>({ name: "blind", box: refusing, fail: ( fault ) => faults.push(told(() => { throw fault; })) });

        await blind.hydrate();
        expect([blind.signed(), faults]).toEqual([false, ["unavailable/state.refused"]]);

    });
    it("abilities: wildcards cover their scope, authorize names the missing ones, roles match in either mode", () => {

        expect([auth.granted(["orders.*"], ["orders.read", "orders.items.write"]), auth.granted(["orders.*"], ["orders"]), auth.granted(["orders.*"], ["ordersx.read"]), auth.granted(["*"], ["anything"]), auth.granted([], []), auth.granted([], ["x"], "any")]).toEqual([true, false, false, true, true, false]);
        expect([auth.granted(["a", "b"], ["a", "c"], "any"), auth.granted(["a", "b"], ["a", "c"]), auth.granted(["a.*"], ["a.*"]), auth.granted(["a.b"], ["a.*"])]).toEqual([true, false, true, false]);
        expect([auth.missing(["orders.read"], ["orders.read", "users.read"]), auth.missing(["*"], ["x", "y"]), auth.missing([], [])]).toEqual([["users.read"], [], []]);
        expect([auth.can(user, "orders.read"), auth.can(user, []), auth.can(null, "orders.read"), auth.can(null, []), auth.can(undefined, []), auth.can(user, "users.read"), auth.can({}, "x"), auth.can(user, ["orders.read", "users.read"], "any")]).toEqual([true, true, false, true, true, false, false, true]);
        expect(told(() => auth.authorize(null, "orders.read"))).toBe("unauthorized/auth.guest");
        expect(told(() => auth.authorize(undefined, []))).toBe("unauthorized/auth.guest");
        expect(told(() => auth.authorize(user, ["orders.read", "users.read", "billing.pay"]))).toBe("forbidden/auth.denied");
        expect(told(() => auth.authorize(user, ["orders.read", "users.read"], "any"))).toBe("ok");
        expect(told(() => auth.authorize({}, []))).toBe("ok");

        try {

            auth.authorize(user, ["orders.read", "users.read", "billing.pay"]);

        } catch ( fault ) {

            expect(error.is(fault) ? fault.errors : {}).toEqual({ abilities: ["users.read", "billing.pay"] });

        }

        expect([auth.hasRole(user, "staff"), auth.hasRole(user, ["admin", "staff"]), auth.hasRole(user, ["admin", "staff"], "all"), auth.hasRole(user, [], "all"), auth.hasRole(user, []), auth.hasRole(null, "staff"), auth.hasRole({}, "staff")]).toEqual([true, true, false, true, false, false, false]);
        expect(auth.expand(["orders.*", "users.read"], ["users.write", "orders.read", "orders.write", "users.read"])).toEqual(["orders.read", "orders.write", "users.read"]);
        expect(auth.expand([], ["a"])).toEqual([]);
        expect(auth.expand(["*"], ["b", "a"])).toEqual(["a", "b"]);

    });
});
