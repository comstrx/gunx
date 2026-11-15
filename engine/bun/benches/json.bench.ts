import * as json from "engine/json";
import { bench, do_not_optimize, run } from "mitata";

const body = { user: { id: 1, name: "Ann", tags: ["a", "b"], address: { city: "Cairo", zip: "11511" } }, items: [{ sku: "x", qty: 2 }] };
const text = json.stringify(body);
const cycle: { body: typeof body; self?: unknown } = { body };

cycle.self = cycle;

bench("json.parse", () => do_not_optimize(json.parse(text)));
bench("json.parse plain text", () => do_not_optimize(json.parse("event received")));
bench("json.parse whitespace primitive", () => do_not_optimize(json.parse("\t\r\n 42")));
bench("json.parse malformed candidate", () => do_not_optimize(json.parse("{bad")));
bench("json.stringify", () => do_not_optimize(json.stringify(body)));
bench("json.stringify.pretty", () => do_not_optimize(json.stringify(body, { pretty: true })));
bench("json.stringify.pretty cyclic", () => do_not_optimize(json.stringify(cycle, { pretty: true })));
bench("json.stringify.stable", () => do_not_optimize(json.stringify(body, { stable: true })));
bench("json.equal", () => do_not_optimize(json.equal(body, json.clone(body))));
bench("json.flatten", () => do_not_optimize(json.flatten(body)));
bench("json.camelKeys", () => do_not_optimize(json.camelKeys({ first_name: "a", last_name: { inner_key: 1 } })));
bench("json.pathGet", () => do_not_optimize(json.pathGet(body, "user.address.city")));

await run();
