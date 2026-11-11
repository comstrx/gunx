import * as auth from "engine/auth";
import * as cache from "engine/cache";
import * as crypto from "engine/crypto";
import { bench, do_not_optimize, run } from "mitata";

type User = { id: string; abilities: string[]; roles: string[] };

const user: User = { id: "u1", abilities: ["orders.*", "users.read", "catalog.read", "reports.export"], roles: ["staff", "editor"] };
const abilities = user.abilities;
const known = ["orders.read", "orders.write", "users.read", "users.write", "catalog.read", "catalog.write", "reports.export", "billing.pay"];
const at = 1_000_000;
const signed = auth.session<User>({ name: "bench", box: cache.open({ storage: cache.memory() }), now: () => at });
const renewing = auth.session<User>({ name: "renewing", box: cache.open({ storage: cache.memory() }), now: () => at, renew: async () => ({ access: "next", refresh: "r", expires: at + 1 }) });
const token = await crypto.signToken({ sub: "u1" }, "secret", { expiresIn: 3600, now: 1_000_000 });

signed.begin({ access: "token" }, user);
renewing.begin({ access: "a", refresh: "r", expires: at }, user);

bench("auth.token fresh", async () => do_not_optimize(await signed.token()));
bench("auth.token renewing (one call per expiry)", async () => do_not_optimize(await renewing.token()));
bench("auth.renew forced", async () => do_not_optimize(await renewing.renew()));
bench("auth.begin + end", () => {

    signed.begin({ access: "token" }, user);
    signed.end();

});
bench("auth.update", () => signed.update(user));
bench("auth.expiresIn", () => do_not_optimize(signed.expiresIn()));
bench("auth.signed + user", () => do_not_optimize([signed.signed(), signed.user()]));
bench("auth.watch + stop", () => signed.watch(() => undefined)());
bench("auth.expiryOf jwt", () => do_not_optimize(auth.expiryOf(token)));
bench("auth.withExpiry", () => do_not_optimize(auth.withExpiry({ access: token })));
bench("auth.granted wildcard", () => do_not_optimize(auth.granted(abilities, ["orders.write", "reports.export"])));
bench("auth.granted any", () => do_not_optimize(auth.granted(abilities, ["billing.pay", "orders.write"], "any")));
bench("auth.missing", () => do_not_optimize(auth.missing(abilities, ["orders.write", "users.write"])));
bench("auth.can", () => do_not_optimize(auth.can(user, "orders.write")));
bench("auth.authorize ok", () => auth.authorize(user, ["orders.write", "users.read"]));
bench("auth.authorize denied", () => {

    try {

        auth.authorize(user, "billing.pay");

    } catch {

        do_not_optimize(1);

    }

});
bench("auth.hasRole", () => do_not_optimize(auth.hasRole(user, ["admin", "editor"])));
bench("auth.expand", () => do_not_optimize(auth.expand(abilities, known)));
bench("auth.session define", () => do_not_optimize(auth.session<User>({ name: "made", box: cache.open({ storage: cache.memory() }) })));

await run();
