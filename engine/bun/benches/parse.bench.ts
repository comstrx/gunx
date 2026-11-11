import * as parse from "engine/parse";
import { bench, do_not_optimize, run } from "mitata";

bench("parse.duration", () => do_not_optimize(parse.duration("1h30m15s")));
bench("parse.bytes", () => do_not_optimize(parse.bytes("1.5 MB")));
bench("parse.query", () => do_not_optimize(parse.query("a=1&b=x%20y&c[]=1&c[]=2&d=z")));
bench("parse.queryString", () => do_not_optimize(parse.queryString({ b: "x y", a: 1, c: [1, 2] })));
bench("parse.match", () => do_not_optimize(parse.match("/users/{id}/posts/{post}", "/users/42/posts/7")));
bench("parse.interpolate", () => do_not_optimize(parse.interpolate("Hi {user.name}, order {order.id}", { user: { name: "Ann" }, order: { id: 7 } })));
bench("parse.semver", () => do_not_optimize(parse.semver("v1.2.3-beta.1+build.5")));

await run();
