import * as validate from "engine/validate";
import { bench, do_not_optimize, run } from "mitata";

const signup = validate.strictObject({ email: validate.email(), name: validate.string().check(validate.minLength(2), validate.maxLength(64)), age: validate.int().check(validate.gte(18)) });
const book = validate.rulebook({ email: "required|email", name: "required|max:64", age: "required|integer|between:18,99" });
const row = validate.object({
    id: validate.int().check(validate.gt(0)),
    name: validate.string().check(validate.minLength(2), validate.maxLength(80)),
    price: validate.string().check(validate.regex(/^-?\d+(?:\.\d{1,6})?$/)),
    tags: validate.array(validate.string()).check(validate.maxLength(10)),
    address: validate.optional(validate.object({ city: validate.string(), zip: validate.optional(validate.string()) })),
});
const fast = validate.compile(row);
const quick = validate.compile(signup);
const payload = { email: "a@b.co", name: "Ann", age: 30 };
const bad = { email: "x", name: "A", age: 3 };
const item = { id: 7, name: "Item 7", price: "12.50", tags: ["a", "b"], address: { city: "Cairo" } };
const worse = { id: -1, name: "x", price: "no", tags: [], extra: true };
const trip = validate.rulebook({
    a: "nullable|string",
    with: "required_with:a",
    same: "nullable|same:a",
    other: "nullable|different:a",
    pass: "required|min:8|confirmed",
    start: "nullable|date",
    end: "nullable|date|after:start",
    low: "nullable|integer",
    high: "nullable|integer|gt:low",
    list: "nullable|array",
    member: "nullable|in_array:list",
});
const swift = validate.compile(trip);
const calm = { a: "x", with: "y", same: "x", other: "z", pass: "longenough1", pass_confirmation: "longenough1", start: "2026-01-02", end: "2026-02-03", low: 1, high: 2, list: ["m", "n"], member: "m" };
const torn = { a: "x", same: "y", other: "x", pass: "longenough1", pass_confirmation: "nope", start: "2026-02-03", end: "2026-01-02", low: 2, high: 1, list: ["m"], member: "q" };
const families: Record<string, validate.Rules> = {
    presence: "required|nullable|filled|string",
    sizes: "required|string|min:3|max:64|between:3,64",
    numbers: "required|integer|gte:0|lt:100|multiple_of:5",
    digits: "required|digits_between:4,8",
    decimals: "required|numeric|decimal:0,2",
    words: "required|in:draft,live,paused,gone|starts_with:d,l,p,g",
    letters: "required|alpha_dash|lowercase|ascii",
    pattern: "required|regex:/^[a-z]{2,8}-\\d{2}$/",
    dates: "required|date|after:2020-01-01|before:2030-01-01",
    lists: "required|array|min:1|max:5|distinct",
};
const answers: Record<string, unknown> = { presence: "x", sizes: "abcdef", numbers: 35, digits: "123456", decimals: "12.50", words: "draft", letters: "abc-def_1", pattern: "abc-12", dates: "2026-01-02", lists: ["a", "b", "c"] };
const built = Object.fromEntries(Object.entries(families).map(([name, text]) => [name, validate.rules(text)]));
const makers: Record<string, readonly [validate.Schema, unknown, unknown]> = {
    text: [validate.text(), "hello", 7],
    email: [validate.email(), " Ann@Example.com ", "ann"],
    url: [validate.url(), "https://example.com/a?b=1", "example"],
    phone: [validate.phone(), "+201000000000", "12"],
    slug: [validate.slug(), "a-good-slug", "a bad slug"],
    key: [validate.key(), "a_key", "A.key"],
    password: [validate.password(), "longenough1", "short"],
    otp: [validate.otp(), "123456", "12345"],
    currency: [validate.currency(), "usd", "dollars"],
    locale: [validate.locale(), "ar-eg", "??"],
    timezone: [validate.timezone(), "Africa/Cairo", "Nowhere/Never"],
    hexColor: [validate.hexColor(), "#a1b2c3", "a1b2c3"],
    plainDate: [validate.plainDate(), "2026-01-02", "2026-13-40"],
    numeric: [validate.numeric(), "12.50", "twelve"],
    integer: [validate.integer(), "12", "1.5"],
    flag: [validate.flag(), "yes", "maybe"],
    money: [validate.money(), { amount: "12.50", currency: "usd" }, { amount: "x", currency: "usd" }],
    ip: [validate.ip(), "192.0.2.7", "999.0.2.7"],
    file: [validate.file({ maxBytes: 1024, types: ["image/*"], extensions: ["png"] }), { size: 10, type: "image/png", name: "a.png" }, { size: 4096, type: "image/png", name: "a.png" }],
};
const issues = signup.safeParse(bad).error?.issues ?? [];
const deep = row.safeParse(worse).error?.issues ?? [];
const thrown = ( work: () => unknown ) => () => {

    try {

        return do_not_optimize(work());

    } catch ( failure ) {

        return do_not_optimize(failure);

    }

};
const hundred = ( work: () => unknown ) => () => {

    let last: unknown;

    for ( let index = 0; index < 100; index += 1 ) last = work();

    return do_not_optimize(last);

};

bench("validate.check.ok", () => do_not_optimize(validate.check(signup, payload)));
bench("validate.check.fail", () => do_not_optimize(validate.check(signup, bad)));
bench("validate.rulebook.check", () => do_not_optimize(validate.check(book, { ...payload, age: "30" })));
bench("validate.rules.build", () => do_not_optimize(validate.rules("required|string|min:3|max:64|alpha_dash")));
bench("validate.check.ok x100", hundred(() => validate.check(signup, payload)));
bench("validate.check.ok.compiled x100", hundred(() => validate.check(quick, payload)));
bench("validate.check.row x100", hundred(() => validate.check(row, item)));
bench("validate.check.row.compiled x100", hundred(() => validate.check(fast, item)));
bench("validate.check.row.fail", () => do_not_optimize(validate.check(row, worse)));
bench("validate.check.row.fail.compiled", () => do_not_optimize(validate.check(fast, worse)));
bench("validate.compile", () => do_not_optimize(validate.compile(row)));
bench("validate.compile.rulebook", () => do_not_optimize(validate.compile(trip)));
bench("validate.rulebook.build", () => do_not_optimize(validate.rulebook({ email: "required|email", name: "required|max:64", age: "required|integer|between:18,99" })));
bench("validate.rulebook.cross.ok", () => do_not_optimize(validate.check(trip, calm)));
bench("validate.rulebook.cross.fail", () => do_not_optimize(validate.check(trip, torn)));
bench("validate.rulebook.cross.ok.compiled", () => do_not_optimize(validate.check(swift, calm)));
bench("validate.rulebook.cross.fail.compiled", () => do_not_optimize(validate.check(swift, torn)));
bench("validate.rules.refuse", thrown(() => validate.rules("required|string|size:-1")));
bench("validate.rules.refuse.name", thrown(() => validate.rules("required|no_such_rule:1")));

for ( const [name, text] of Object.entries(families) ) {

    const schema = built[name] ?? validate.rules(text);
    const answer = answers[name];

    bench(`validate.rules.build.${name}`, () => do_not_optimize(validate.rules(text)));
    bench(`validate.rules.check.${name}`, () => do_not_optimize(validate.check(schema, answer)));
    bench(`validate.rules.check.${name}.blank`, () => do_not_optimize(validate.check(schema, "")));

}

for ( const [name, [schema, good, poor]] of Object.entries(makers) ) {

    bench(`validate.field.${name}.ok`, () => do_not_optimize(validate.check(schema, good)));
    bench(`validate.field.${name}.fail`, () => do_not_optimize(validate.check(schema, poor)));

}

bench("validate.assert.ok", () => do_not_optimize(validate.assert(signup, payload)));
bench("validate.assert.fail", thrown(() => validate.assert(signup, bad)));
bench("validate.checkAsync.ok", async () => do_not_optimize(await validate.checkAsync(signup, payload)));
bench("validate.checkAsync.fail", async () => do_not_optimize(await validate.checkAsync(signup, bad)));
bench("validate.issuesOf", () => do_not_optimize(validate.issuesOf(issues)));
bench("validate.issuesOf.deep", () => do_not_optimize(validate.issuesOf(deep)));
bench("validate.field", () => do_not_optimize(validate.field(row, "row")));
bench("validate.field.rules", () => do_not_optimize(validate.field(built.sizes ?? signup, "name")));
bench("validate.fields", () => do_not_optimize(validate.fields(signup)));
bench("validate.fields.rulebook", () => do_not_optimize(validate.fields(trip)));
bench("validate.format", () => do_not_optimize(validate.format("otp", 6)));
bench("validate.stamp", () => do_not_optimize(validate.stamp({ format: "sku", min: 3, max: 12 })));
bench("validate.toJSONSchema", () => do_not_optimize(validate.toJSONSchema(row)));

await run();
