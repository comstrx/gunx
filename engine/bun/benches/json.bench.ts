import * as json from "engine/json";
import { bench, do_not_optimize, run } from "mitata";

const body = { user: { id: 1, name: "Ann", tags: ["a", "b"], address: { city: "Cairo", zip: "11511" } }, items: [{ sku: "x", qty: 2 }] };
const text = json.stringify(body);

bench("json.parse", () => do_not_optimize(json.parse(text)));
bench("json.stringify.stable", () => do_not_optimize(json.stringify(body, { stable: true })));
bench("json.equal", () => do_not_optimize(json.equal(body, json.clone(body))));
bench("json.flatten", () => do_not_optimize(json.flatten(body)));
bench("json.camelKeys", () => do_not_optimize(json.camelKeys({ first_name: "a", last_name: { inner_key: 1 } })));
bench("json.pathGet", () => do_not_optimize(json.pathGet(body, "user.address.city")));

await run();
