import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as validate from "engine/validate";
import * as fc from "fast-check";

type Told = { value: unknown } | { errors: error.Errors };
type Built = { schema: validate.Schema } | { refused: string };
type Span = readonly [number, number];
type Row = Record<string, unknown>;

const runs = 5000;
const secret = "s3cr3t";
const sizes = ["min", "max", "size", "between", "gt", "gte", "lt", "lte"];
const lengths = Array.from({ length: 40 }, ( _, at ) => at);
const samples = [...Array.from({ length: 9 }, ( _, at ) => "1".repeat(at + 1)), ...Array.from({ length: 9 }, ( _, at ) => `1.${"1".repeat(at + 1)}`)];
const fields = ["email", "slug", "key", "currency", "locale", "hex_color", "phone", "integer", "numeric", "boolean", "timezone", "ip", "ipv4", "ipv6", "string", "date", "url", "uuid"];
const words = [
    "email", "url", "phone", "slug", "key", "otp", "currency", "locale", "timezone", "hex_color", "uuid", "ulid", "ipv4", "ipv6", "mac", "ip", "date", "integer", "numeric", "number", "multiple_of", "boolean", "accepted", "declined", "array", "list",
    "object", "map", "string", "required", "nullable", "filled", "prohibited", "digits", "digits_between", "min_digits", "max_digits", "decimal", "bail", "sometimes", "present", "missing", "exclude", "date_format", "in", "enum", "not_in",
    "starts_with", "ends_with", "doesnt_start_with", "doesnt_end_with", "contains", "doesnt_contain", "alpha", "alpha_num", "alpha_dash", "ascii", "lowercase", "uppercase", "regex", "not_regex", "distinct", "json", "required_array_keys",
    "in_array_keys", "min", "max", "size", "between", "gt", "gte", "lt", "lte", "after", "after_or_equal", "before", "before_or_equal", "date_equals", "confirmed", "same", "different", "in_array", "prohibits", "required_if", "required_unless",
    "required_with", "required_with_all", "required_without", "required_without_all", "required_if_accepted", "required_if_declined", "prohibited_if", "prohibited_unless", "prohibited_if_accepted", "prohibited_if_declined", "accepted_if",
    "declined_if", "", " ", "nope", "__proto__", "constructor", "toString", "hasOwnProperty", "REQUIRED", "min max",
];
const notes = [
    "0", "1", "2", "3", "12", "-1", "1.5", ".5", "+2", " 2 ", "1e3", "0x10", "NaN", "Infinity", "a", "b", "a,b", "a,b,c", "1,2", "2,1", "0,0", "3,3", "other", "other,x", "other,x,y", "a.*", "now", "today", "tomorrow", "2026-01-01", "/^a/",
    "/a/gi", "/(/", "/a/z", "ascii", "strict", "ignore_case", "", ",", "a,", "__proto__",
];
const apt = [
    "required", "nullable", "filled", "prohibited", "string", "email", "url", "url:https", "phone", "slug", "key", "otp", "otp:4", "currency", "locale", "timezone", "hex_color", "uuid", "ulid", "ipv4", "ipv6", "mac", "ip", "date", "integer",
    "numeric", "boolean", "accepted", "declined", "array", "array:a,b", "list", "object", "min:2", "max:8", "size:3", "between:1,5", "gt:1", "gte:1", "lt:9", "lte:9", "gt:other", "multiple_of:2", "digits:3", "digits_between:1,4",
    "min_digits:1", "max_digits:5", "decimal:0,2", "in:a,b,1", "enum:a,b", "not_in:a,b", "starts_with:a", "ends_with:b", "doesnt_start_with:a", "doesnt_end_with:b", "contains:a", "doesnt_contain:a", "alpha", "alpha:ascii", "alpha_num",
    "alpha_dash", "ascii", "lowercase", "uppercase", "regex:/^a/", "not_regex:/b$/i", "distinct", "distinct:strict", "distinct:ignore_case", "json", "required_array_keys:a", "in_array_keys:a,b", "after:2026-01-01", "after_or_equal:today",
    "before:tomorrow", "before_or_equal:now", "date_equals:2026-01-01", "after:other", "confirmed", "same:other", "different:other", "in_array:other.*", "prohibits:other", "required_if:other,x", "required_with:other", "accepted_if:other,x",
    "bail", "sometimes", "present", "date_format:Y-m-d",
];
const book = validate.rulebook({
    a: "nullable|string",
    list: "nullable|array",
    with: "nullable|string|required_with:a",
    without: "nullable|string|required_without:a",
    same: "nullable|string|same:a",
    other: "nullable|string|different:a",
    bars: "nullable|string|prohibits:a",
    when: "nullable|string|required_if:a,x",
    unless: "nullable|string|prohibited_unless:a,x,y",
    longer: "nullable|string|gt:a",
    member: "nullable|string|in_array:list",
    pass: "nullable|string|confirmed",
});
const guards: validate.Schema[] = [
    book,
    validate.strictObject({ email: validate.email(), tags: validate.array(validate.string()).check(validate.maxLength(2)), a: validate.object({ b: validate.int() }) }),
    validate.record(validate.string(), validate.int()),
    validate.array(validate.object({ a: validate.int(), b: validate.optional(validate.enum(["x", "y"])) })),
    validate.rulebook({ email: "required|email", a: "nullable|in:x,y", b: "array|distinct", tags: "nullable|array|max:2", pass: "required|min:8|confirmed" }),
    validate.rules("required|string|min:3|alpha"),
    validate.union([validate.int(), validate.object({ a: validate.string() })]),
];

function told ( schema: validate.Schema, payload: unknown ): Told {

    const result = validate.check(schema, payload);

    return result.ok ? { value: result.value } : { errors: result.fault.errors };

}
function claimed ( schema: validate.Schema, payload: unknown ): Told {

    try {

        return { value: validate.assert(schema, payload) };

    } catch ( failure ) {

        if ( !(failure instanceof error.Fault) ) throw failure;

        return { errors: failure.errors };

    }

}
function built ( given: validate.Rules ): Built {

    try {

        return { schema: validate.rules(given) };

    } catch ( failure ) {

        if ( !(failure instanceof error.Fault) ) throw failure;

        return { refused: `${failure.code}/${failure.reason}/${failure.message}` };

    }

}
function sound ( errors: error.Errors ): boolean {

    const found = Object.values(errors);

    return found.length > 0 && found.every(( list ) => Array.isArray(list) && list.length > 0 && new Set(list).size === list.length && list.every(( code ) => typeof code === "string" && code !== ""));

}
function bare ( given: unknown ): boolean {

    return given === undefined || given === null || (typeof given === "string" && given.trim() === "");

}
function hollow ( given: unknown ): boolean {

    if ( bare(given) ) return true;
    if ( Array.isArray(given) ) return given.length === 0;

    return typeof given === "object" && given !== null && Object.keys(given).length === 0;

}
function tidy ( given: unknown ): unknown {

    if ( bare(given) ) return given === null ? null : undefined;

    return typeof given === "string" ? given.trim() : given;

}
function fits ( name: string, [low, high]: Span, size: number ): boolean {

    switch ( name ) {
        case "min":
        case "gte": return size >= low;
        case "max":
        case "lte": return size <= low;
        case "size": return size === low;
        case "between": return size >= low && size <= high;
        case "gt": return size > low;
        default: return size < low;
    }

}
function counts ( name: string, [low, high]: Span, word: string ): boolean {

    const [whole = "", places, ...rest] = word.replace(/^[+-]/, "").split(".");
    const digits = /^[0-9]+$/.test(word);

    switch ( name ) {
        case "digits": return digits && word.length === low;
        case "digits_between": return digits && word.length >= low && word.length <= high;
        case "min_digits": return digits && word.length >= low;
        case "max_digits": return digits && word.length <= low;
        default: return rest.length === 0 && /^[0-9]+$/.test(whole) && (places === undefined ? low === 0 : /^[0-9]+$/.test(places) && places.length >= low && places.length <= high);
    }

}
function presence ( picked: readonly string[], given: unknown ): Told {

    const has = ( name: string ): boolean => picked.includes(name);

    if ( has("prohibited") ) return hollow(given) ? { value: undefined } : { errors: { _: ["prohibited"] } };
    if ( has("required") && hollow(given) ) return { errors: { _: ["required"] } };
    if ( has("filled") && given !== undefined && hollow(given) ) return { errors: { _: ["filled"] } };
    if ( bare(given) ) return { value: given === null && has("nullable") ? null : undefined };

    return typeof given === "string" ? { value: given.trim() } : { errors: { _: ["type:string"] } };

}
function crossings ( row: Row ): Told {

    const kept: Row = Object.fromEntries(Object.entries(row).map(([name, given]) => [name, name === "pass_confirmation" ? given : tidy(given)]));
    const { a, list } = kept;
    const twin = typeof row.pass_confirmation === "string" ? row.pass_confirmation.trim() : row.pass_confirmation;
    const word = a === undefined || a === null ? "null" : String(a);
    const idle = ( name: string ): boolean => kept[name] === undefined || kept[name] === null;
    const broken: [string, string, boolean][] = [
        ["with", "required", !hollow(a) && hollow(kept.with)],
        ["without", "required", hollow(a) && hollow(kept.without)],
        ["same", "same", !idle("same") && kept.same !== a],
        ["other", "different", !idle("other") && kept.other === a],
        ["bars", "prohibits", !hollow(kept.bars) && !hollow(a)],
        ["when", "required", word === "x" && hollow(kept.when)],
        ["unless", "prohibited", word !== "x" && word !== "y" && !hollow(kept.unless)],
        ["longer", "gt", !idle("longer") && !(typeof a === "string" && String(kept.longer).length > a.length)],
        ["member", "in_array", !idle("member") && !(Array.isArray(list) && list.some(( item ) => String(item) === kept.member))],
        ["pass", "confirmed", !idle("pass") && kept.pass !== twin],
    ];
    const errors = Object.fromEntries(broken.filter(([, , bad]) => bad).map(([name, code]) => [name, [code]]));

    return Object.keys(errors).length ? { errors } : { value: kept };

}

describe("fuzz validate", () => {

    it("any rule text compiles or is refused as a rule, and what compiles answers any payload the same way twice", () => {

        const part = fc.oneof(
            { weight: 12, arbitrary: fc.constantFrom(...apt) },
            { weight: 2, arbitrary: fc.tuple(fc.constantFrom(...words), fc.option(fc.constantFrom(...notes), { nil: undefined })).map(([name, note]) => (note === undefined ? name : `${name}:${note}`)) },
            { weight: 1, arbitrary: fc.string({ maxLength: 12 }) },
        );
        const seen = { made: 0, refused: 0, passed: 0, failed: 0 };
        const given = fc.oneof(fc.anything(), fc.constantFrom<unknown>("a", "ab", "abc", "1", "12", 1, 12, 1.5, true, null, "2026-01-01", ["a", "a"], ["a", "b"], { a: 1 }, { other: "x" }));

        fc.assert(
            fc.property(fc.array(part, { minLength: 1, maxLength: 4 }), fc.boolean(), given, ( parts, joined, payload ) => {

                const text: validate.Rules = joined ? parts.join("|") : parts;
                const first = built(text);
                const again = built(text);

                if ( "refused" in first ) {

                    seen.refused += 1;
                    expect(first.refused.startsWith("internal/validate.rule/not a rule: ")).toBe(true);
                    expect(again).toEqual(first);

                } else {

                    const result = validate.check(first.schema, payload);

                    seen.made += 1;
                    seen[result.ok ? "passed" : "failed"] += 1;
                    expect("schema" in again && told(again.schema, payload)).toEqual(told(first.schema, payload));
                    expect(told(first.schema, payload)).toEqual(told(first.schema, payload));
                    expect(typeof validate.field(first.schema).kind).toBe("string");

                    if ( !result.ok ) expect([result.fault.code, result.fault.status, result.fault.reason, sound(result.fault.errors)]).toEqual(["validation", 422, "validation", true]);

                }

            }),
            { numRuns: runs },
        );
        expect([seen.made > runs / 4, seen.refused > runs / 10, seen.passed > runs / 50, seen.failed > runs / 10]).toEqual([true, true, true, true]);

    });
    it("a size rule answers as a plain length model over text, lists and rows, and a size nothing can meet is refused", () => {

        const half = fc.integer({ min: -6, max: 24 }).map(( at ) => at / 2);
        const given = fc.oneof(
            fc.tuple(fc.constant("string"), fc.string({ maxLength: 14 })),
            fc.tuple(fc.constant("array"), fc.array(fc.integer(), { maxLength: 14 })),
            fc.tuple(fc.constant("object"), fc.dictionary(fc.string({ minLength: 1, maxLength: 3 }), fc.integer(), { maxKeys: 14 })),
        );

        fc.assert(
            fc.property(fc.constantFrom(...sizes), half, half, given, ( name, low, high, [kind, payload] ) => {

                const rule = `${name}:${name === "between" ? `${low},${high}` : low}`;
                const met = lengths.filter(( size ) => fits(name, [low, high], size));
                const made = built(`${kind}|${rule}`);
                const size = typeof payload === "string" ? payload.trim().length : Array.isArray(payload) ? payload.length : Object.keys(payload).length;
                const [least = 0] = met;
                const most = met.at(-1) ?? 0;

                if ( "refused" in made ) expect([met.length, made.refused]).toEqual([0, `internal/validate.rule/not a rule: ${rule}`]);
                else if ( met.length === 0 ) expect(rule).toBe("refused");
                else if ( typeof payload === "string" && size === 0 ) expect(told(made.schema, payload)).toEqual({ value: undefined });
                else if ( met.includes(size) ) expect(told(made.schema, payload)).toEqual({ value: typeof payload === "string" ? payload.trim() : payload });
                else expect(told(made.schema, payload)).toEqual({ errors: { _: [size < least ? `min_length:${least}` : `max_length:${most}`] } });

            }),
            { numRuns: runs },
        );

    });
    it("a size rule over a number answers as plain arithmetic", () => {

        const half = fc.integer({ min: -12, max: 24 }).map(( at ) => at / 2);

        fc.assert(
            fc.property(fc.constantFrom(...sizes, "multiple_of"), half, half, half, ( name, low, high, payload ) => {

                const rule = `${name}:${name === "between" ? `${low},${high}` : low}`;
                const made = built(`numeric|${rule}`);
                const unmet = name === "between" ? low > high : name === "multiple_of" && low <= 0;
                const passed = name === "multiple_of" ? Number.isInteger(payload / low) : fits(name, [low, high], payload);
                const under = ["min", "gte", "gt"].includes(name) || (["size", "between"].includes(name) && payload < low);
                const code = name === "multiple_of" ? `step:${low}` : name === "gt" || name === "lt" ? `${name}:${low}` : under ? `min:${low}` : `max:${name === "between" ? high : low}`;

                if ( "refused" in made ) expect([unmet, made.refused]).toEqual([true, `internal/validate.rule/not a rule: ${rule}`]);
                else if ( unmet ) expect(rule).toBe("refused");
                else expect(told(made.schema, payload)).toEqual(passed ? { value: payload } : { errors: { _: [code] } });

            }),
            { numRuns: runs },
        );

    });
    it("presence rules answer as a blank model whatever their order", () => {

        const given = fc.oneof(fc.constantFrom<unknown>(undefined, null, "", "  ", "x", " x ", 0, false, true), fc.constant([]), fc.constant({}), fc.constant(["a"]), fc.constant({ a: 1 }), fc.string());

        fc.assert(
            fc.property(fc.shuffledSubarray(["required", "nullable", "filled", "prohibited"]), fc.boolean(), given, ( picked, lead, payload ) => {

                const text = (lead ? ["string", ...picked] : [...picked, "string"]).join("|");

                expect(told(validate.rules(text), payload)).toEqual(presence(picked, payload));

            }),
            { numRuns: runs },
        );

    });
    it("digit and decimal rules answer as a text model, and a count nothing can meet is refused", () => {

        const count = fc.integer({ min: 0, max: 7 });
        const given = fc.oneof(fc.stringMatching(/^ ?[+-]?[0-9]{0,6}(\.[0-9]{0,4})? ?$/), fc.string({ maxLength: 8 }), fc.constantFrom("١٢٣", "１２３", "1.2.3", "+", "."));

        fc.assert(
            fc.property(fc.constantFrom("digits", "digits_between", "min_digits", "max_digits", "decimal"), count, count, fc.boolean(), given, ( name, low, wide, paired, payload ) => {

                const pair = name === "digits_between" || (name === "decimal" && paired);
                const high = pair ? wide : low;
                const rule = `${name}:${pair ? `${low},${high}` : low}`;
                const made = built(rule);
                const met = samples.some(( word ) => counts(name, [low, high], word));
                const word = payload.trim();

                if ( "refused" in made ) expect([met, made.refused]).toEqual([false, `internal/validate.rule/not a rule: ${rule}`]);
                else if ( !met ) expect(rule).toBe("refused");
                else if ( word === "" ) expect(told(made.schema, payload)).toEqual({ value: undefined });
                else expect(told(made.schema, payload)).toEqual(counts(name, [low, high], word) ? { value: word } : { errors: { _: [name] } });

            }),
            { numRuns: runs },
        );

    });
    it("list and word rules answer as a membership model", () => {

        const word = fc.stringMatching(/^[abc]{1,4}$/);

        fc.assert(
            fc.property(fc.constantFrom("in", "enum", "not_in", "starts_with", "ends_with", "doesnt_start_with", "doesnt_end_with"), fc.array(word, { minLength: 1, maxLength: 4 }), word, ( name, list, payload ) => {

                const hit = name.includes("start") ? list.some(( head ) => payload.startsWith(head)) : name.includes("end") ? list.some(( tail ) => payload.endsWith(tail)) : list.includes(payload);
                const wanted = name !== "not_in" && !name.startsWith("doesnt");

                expect(told(validate.rules(`${name}:${list.join(",")}`), payload)).toEqual(hit === wanted ? { value: payload } : { errors: { _: [name === "enum" ? "in" : name] } });

            }),
            { numRuns: runs },
        );

    });
    it("a rulebook's cross rules answer as a row model, compiled or not", () => {

        const text = fc.constantFrom(null, "", " ", "x", "y", " x ", "xy", "1");
        const row = fc.record(
            {
                a: text,
                list: fc.oneof(fc.constant(null), fc.array(fc.constantFrom<unknown>("x", "y", "xy", 1), { maxLength: 3 })),
                with: text,
                without: text,
                same: text,
                other: text,
                bars: text,
                when: text,
                unless: text,
                longer: text,
                member: text,
                pass: text,
                pass_confirmation: fc.oneof(text, fc.constantFrom<unknown>(1, true, ["x"])),
            },
            { requiredKeys: [] },
        );
        const calm = fc.record(
            {
                a: fc.constantFrom("x", " x "),
                list: fc.constant(["x", 1]),
                with: fc.constant("w"),
                same: fc.constantFrom(null, "x"),
                other: fc.constantFrom(null, "y"),
                when: fc.constant("z"),
                longer: fc.constantFrom(null, "xy"),
                member: fc.constantFrom(null, "x", "1"),
                pass: fc.constantFrom(null, "x"),
                pass_confirmation: fc.constantFrom<unknown>("x", " x "),
            },
            { requiredKeys: ["a", "list", "with", "when", "pass_confirmation"] },
        );
        const fast = validate.compile(book);

        expect(fast).not.toBe(book);
        expect(fc.sample(calm, 200).filter(( given ) => "value" in told(book, given)).length).toBe(200);
        fc.assert(
            fc.property(fc.oneof(row, calm), ( given ) => {

                expect(told(book, given)).toEqual(crossings(given));
                expect(told(fast, given)).toEqual(crossings(given));

            }),
            { numRuns: runs },
        );

    });
    it("a refusal never carries what was typed, never touches a shared prototype, and assert tells what check tells", () => {

        const leaf = fc.oneof(fc.string().map(( text ) => `${secret}${text}`), fc.integer(), fc.boolean(), fc.constant(null));
        const key = fc.constantFrom("a", "b", "email", "tags", "list", "pass", "pass_confirmation", "0", "__proto__", "constructor", "prototype", "toString");
        const given = fc.oneof(fc.anything({ values: [leaf], key, maxDepth: 3, withNullPrototype: true }), fc.dictionary(key, leaf), leaf);
        const seen = { passed: 0, failed: 0 };

        fc.assert(
            fc.property(fc.nat({ max: guards.length - 1 }), given, ( at, payload ) => {

                const schema = guards[at] ?? book;
                const result = validate.check(schema, payload);
                const canary: Row = {};

                seen[result.ok ? "passed" : "failed"] += 1;
                expect(claimed(schema, payload)).toEqual(told(schema, payload));
                expect([canary.a, canary.b, canary.email, canary.tags, Object.keys(Object.prototype).length]).toEqual([undefined, undefined, undefined, undefined, 0]);

                if ( !result.ok ) {

                    expect([result.fault.code, result.fault.status, sound(result.fault.errors)]).toEqual(["validation", 422, true]);
                    expect(JSON.stringify(error.toJson(result.fault)).includes(secret)).toBe(false);
                    expect(String(result.fault).includes(secret)).toBe(false);

                }

            }),
            { numRuns: runs },
        );
        expect([seen.passed > runs / 100, seen.failed > runs / 2]).toEqual([true, true]);

    });
    it("a field's answer is a fixed point: what it accepted, it accepts again unchanged", () => {

        const dressed = ( given: fc.Arbitrary<unknown> ): fc.Arbitrary<unknown> => fc.tuple(given, fc.boolean(), fc.boolean()).map(([found, padded, raised]) => {

            const word = typeof found === "string" && raised ? found.toUpperCase() : found;

            return typeof word === "string" && padded ? ` ${word} ` : word;

        });
        const likely: Record<string, fc.Arbitrary<unknown>> = {
            email: fc.stringMatching(/^[a-z0-9]+([._+-][a-z0-9]+){0,2}@[a-z0-9]+(-[a-z0-9]+)?\.(com|org|co|net)$/),
            slug: fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+){0,3}$/),
            key: fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/),
            currency: fc.constantFrom("usd", "egp", "sar", "eur", "jpy", "kwd"),
            locale: fc.constantFrom("en", "en-us", "ar", "ar-eg", "zh-hans-cn", "pt_br", "fr-ca"),
            hex_color: fc.stringMatching(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/),
            phone: fc.constantFrom("+201000000000", "+20 100 000 0000", "+1 (202) 555-0100", "+442079460000", "0020 100 000 0000"),
            integer: fc.oneof(fc.integer(), fc.integer().map(String), fc.constantFrom("-0", "007", "+5", "1e3", "12.0")),
            numeric: fc.oneof(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.double({ noNaN: true, noDefaultInfinity: true }).map(String), fc.constantFrom("-0", "12.50", ".5", "5.", "1e3")),
            boolean: fc.constantFrom<unknown>(true, false, 1, 0, "true", "false", "1", "0", "yes", "no", "on", "off"),
            timezone: fc.constantFrom("Africa/Cairo", "utc", "Europe/London", "america/new_york", "Asia/Riyadh", "+02:00", "gmt"),
            ip: fc.oneof(fc.ipV4(), fc.ipV6()),
            ipv4: fc.ipV4(),
            ipv6: fc.ipV6(),
            string: fc.string(),
            date: fc.oneof(fc.date({ noInvalidDate: true, min: new Date("1971-01-01T00:00:00Z"), max: new Date("2200-01-01T00:00:00Z") }).map(( at ) => at.toISOString()), fc.constantFrom("2026-01-02", "2026-01-02T03:04:05+02:00")),
            url: fc.webUrl({ withQueryParameters: true, withFragments: true }),
            uuid: fc.uuid(),
        };
        const given = fc.constantFrom(...fields).chain(( name ) => fc.tuple(fc.constant(name), fc.oneof({ weight: 5, arbitrary: dressed(likely[name] ?? fc.string()) }, { weight: 1, arbitrary: fc.anything() })));
        const seen = new Map<string, number>();

        fc.assert(
            fc.property(given, ([name, payload]) => {

                const schema = validate.rules(name);
                const first = validate.check(schema, payload);

                if ( first.ok && first.value !== undefined ) {

                    seen.set(name, (seen.get(name) ?? 0) + 1);
                    expect(told(schema, first.value)).toEqual({ value: first.value });

                }

            }),
            { numRuns: runs },
        );
        expect(fields.filter(( name ) => (seen.get(name) ?? 0) < runs / 500)).toEqual([]);

    });
    it("check never throws on any payload against a strict object, and a key it never named answers unknown", () => {

        const shape = validate.strictObject({ email: validate.email(), age: validate.int().check(validate.gte(0)), tags: validate.array(validate.string()).check(validate.maxLength(3)) });
        const known = { email: "a@b.co", age: 1, tags: ["x"] };
        const extras = fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/).filter(( name ) => !Object.hasOwn(known, name)), { maxLength: 3 });

        fc.assert(fc.property(fc.anything(), ( payload ) => { expect(typeof validate.check(shape, payload).ok).toBe("boolean"); }), { numRuns: runs });
        fc.assert(
            fc.property(extras, fc.anything(), ( names, junk ) => {

                const row = { ...known, ...Object.fromEntries(names.map(( name ) => [name, junk])) };

                expect(told(shape, row)).toEqual(names.length === 0 ? { value: known } : { errors: Object.fromEntries(names.map(( name ) => [name, ["unknown"]])) });

            }),
            { numRuns: runs / 5 },
        );

    });
    it("a compiled schema answers exactly as its source on any payload", () => {

        const row = validate.strictObject({
            id: validate.int().check(validate.gt(0)),
            email: validate.optional(validate.email()),
            name: validate.string().check(validate.trim(), validate.minLength(2), validate.maxLength(12)),
            tags: validate.array(validate.string()).check(validate.maxLength(3)),
            address: validate.optional(validate.object({ city: validate.string(), zip: validate.nullish(validate.string()) })),
            kind: validate._default(validate.enum(["a", "b"]), "a"),
            price: validate.optional(validate.union([validate.number(), validate.money()])),
        });
        const fast = validate.compile(row);
        const valid = fc.record(
            {
                id: fc.integer({ min: 1 }),
                email: fc.constantFrom("a@b.co", "A@B.CO"),
                name: fc.stringMatching(/^[a-z]{2,12}$/),
                tags: fc.array(fc.string(), { maxLength: 3 }),
                address: fc.record({ city: fc.string(), zip: fc.option(fc.string()) }, { requiredKeys: ["city"] }),
                kind: fc.constantFrom("a", "b"),
                price: fc.oneof(fc.integer(), fc.record({ amount: fc.constantFrom("12.50", "7", 3), currency: fc.constantFrom("usd", "EGP") })),
            },
            { requiredKeys: ["id", "name", "tags"] },
        );
        const spoiled = fc.tuple(valid, fc.constantFrom("id", "email", "name", "tags", "address", "kind", "price", "extra"), fc.anything()).map(([given, key, value]) => ({ ...given, [key]: value }));
        const accepted = fc.sample(valid, 200).filter(( payload ) => validate.check(row, payload).ok).length;

        expect(fast).not.toBe(row);
        expect(accepted).toBe(200);
        fc.assert(fc.property(fc.oneof(valid, spoiled, fc.anything()), ( payload ) => { expect(told(fast, payload)).toEqual(told(row, payload)); }), { numRuns: runs });

    });

});
