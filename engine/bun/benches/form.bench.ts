import * as form from "engine/form";
import * as validate from "engine/validate";
import { bench, do_not_optimize, run } from "mitata";

type Values = { name: string; qty: number; tags: string[]; address: { city: string } };

const schema = validate.strictObject({
    name: validate.string().check(validate.minLength(2)),
    qty: validate.int().check(validate.gte(1)),
    tags: validate.array(validate.string()).check(validate.maxLength(30)),
    address: validate.strictObject({ city: validate.string().check(validate.minLength(1)) }),
});
const initial: Values = { name: "Ann", qty: 1, tags: ["a", "b", "c"], address: { city: "Cairo" } };
const define = ( extra: Partial<form.Options<Values, validate.infer<typeof schema>, number>> = {} ): form.Form<Values, validate.infer<typeof schema>, number> => form.define<Values, validate.infer<typeof schema>, number>({ schema, initial, submit: async ( value ) => value.qty, ...extra });
const blur = define();
const change = define({ mode: "change" });
const watched = define({ watch: { "qty, address": () => undefined, "*": () => undefined } });
const verified = define({ verify: { name: () => undefined } });
const failing = define({ submit: async () => { throw new Error("down"); } });
const city = blur.field("address.city");
const typed = change.field("address.city");
const rows = blur.rows("tags");
const steps = form.stepper(define(), [["name"], ["qty"], ["address.city"]]);
let turn = 0;

change.touch("address.city");
verified.set("name", "Bob");

bench("form.field.set blur", () => {

    turn += 1;
    city.set(`c${turn & 1}`);

});
bench("form.field.set change (touched, validates)", () => {

    turn += 1;
    typed.set(`c${turn & 1}`);

});
bench("form.field.set same value", () => city.set(city.get()));
bench("form.field.set watched", () => {

    turn += 1;
    watched.set("qty", (turn & 7) + 1);

});
bench("form.patch two keys", () => {

    turn += 1;
    blur.patch({ qty: (turn & 7) + 1, name: turn & 1 ? "Ann" : "Bob" });

});
bench("form.touch", () => blur.touch("name"));
bench("form.check", () => do_not_optimize(blur.check()));
bench("form.check one path", () => do_not_optimize(blur.check("name")));
bench("form.valid", () => do_not_optimize(blur.valid()));
bench("form.dirty", () => do_not_optimize(blur.dirty()));
bench("form.dirty path", () => do_not_optimize(blur.dirty("address.city")));
bench("form.changes", () => do_not_optimize(blur.changes()));
bench("form.field handle", () => do_not_optimize(blur.field("address.city")));
bench("form.field.error", () => do_not_optimize(city.error()));
bench("form.rows.push + remove", () => {

    rows.push("x");
    rows.remove(rows.length() - 1);

});
bench("form.rows.move", () => {

    rows.move(0, 2);
    rows.move(2, 0);

});
bench("form.rows.swap", () => rows.swap(0, 1));
bench("form.fail + forgive", () => {

    blur.fail({ name: "taken" });
    blur.forgive("name");

});
bench("form.submit ok", async () => do_not_optimize(await blur.submit()));
bench("form.submit failing", async () => do_not_optimize(await failing.submit()));
bench("form.verify cached", async () => do_not_optimize(await verified.verify("name")));
bench("form.reset", () => blur.reset());
bench("form.rebase", () => blur.rebase());
bench("form.define", () => do_not_optimize(define()));
bench("form.stepper.next + back", () => {

    steps.next();
    steps.back();

});

await run();
