import { describe, expect, test as it, jest } from "bun:test";
import * as error from "engine/error";
import * as validate from "engine/validate";

function errorsOf ( schema: validate.Schema, given: unknown, reason?: string ): error.Errors | undefined {

    const result = validate.check(schema, given, reason);

    return result.ok ? undefined : result.fault.errors;

}
function codes ( rule: validate.Rules, given: unknown ): string[] {

    return Object.values(errorsOf(validate.rules(rule), given) ?? {}).flat();

}
function read ( schema: validate.Schema, given: unknown ): unknown {

    const result = validate.check(schema, given);

    return result.ok ? result.value : result.fault.errors;

}
function refusal ( make: () => unknown ): unknown[] | undefined {

    try {

        make();

    } catch ( failure ) {

        return failure instanceof error.Fault ? [failure.code, failure.reason, failure.message, failure.errors] : ["thrown", String(failure)];

    }

    return undefined;

}

describe("validate", () => {

    it("fields accept the engine's shapes and refuse the rest", () => {

        expect(validate.email().parse(" Ann@Example.COM ".trim())).toBe("ann@example.com");
        expect(validate.email().safeParse("nope").success).toBe(false);
        expect(validate.url().safeParse("https://x.io/a?b=1").success && !validate.url().safeParse("ftp://x.io").success).toBe(true);
        expect(validate.phone().parse("+20 (100) 000-0000")).toBe("+201000000000");
        expect(validate.phone().parse("00201000000000")).toBe("+201000000000");
        expect(validate.phone().safeParse("12").success).toBe(false);
        expect(validate.slug().parse(" My-Slug ")).toBe("my-slug");
        expect(validate.slug().safeParse("bad slug").success).toBe(false);
        expect(validate.key().safeParse("user_id").success && !validate.key().safeParse("1x").success).toBe(true);
        expect(validate.password().safeParse("abcdefg1").success && !validate.password().safeParse("abcdefgh").success && !validate.password().safeParse("a1").success).toBe(true);
        expect(validate.otp().parse("١٢٣٤٥٦")).toBe("123456");
        expect(validate.otp(4).safeParse("12345").success).toBe(false);
        expect(validate.currency().parse(" egp ")).toBe("EGP");
        expect(validate.locale().safeParse("ar-EG").success && !validate.locale().safeParse("arabic").success).toBe(true);
        expect(validate.plainDate().safeParse("2026-02-28").success && !validate.plainDate().safeParse("2026-02-30").success).toBe(true);
        expect(validate.money().parse({ amount: "12.50", currency: "usd" })).toEqual({ minor: 1250, currency: "USD" });
        expect(validate.money().safeParse({ amount: "x", currency: "USD" }).success).toBe(false);
        expect(validate.text(3).safeParse("abcd").success).toBe(false);
        expect(validate.optional(validate.text()).parse(undefined)).toBeUndefined();
        expect(validate.uuid().safeParse("123e4567-e89b-42d3-a456-426614174000").success).toBe(true);
        expect(validate.ulid().safeParse("01ARZ3NDEKTSV4RRFFQ69G5FAV").success).toBe(true);

    });
    it("check maps zod issues to translatable rule codes", () => {

        const signup = validate.strictObject({
            email: validate.email(),
            name: validate.string().check(validate.minLength(2), validate.maxLength(10)),
            age: validate.int().check(validate.gte(18)),
            role: validate.enum(["admin", "user"]),
            tags: validate.optional(validate.array(validate.string()).check(validate.maxLength(2))),
        });
        const okay = validate.check(signup, { email: "a@b.co", name: "Ann", age: 30, role: "user" });

        expect(okay.ok && okay.value.email === "a@b.co").toBe(true);

        const failed = validate.check(signup, { email: "x", name: "A", age: 17.5, role: "boss", tags: ["a", "b", "c"], extra: 1 }, "signup");

        const fault = failed.ok ? undefined : failed.fault;

        expect(fault?.code).toBe("validation");
        expect(fault?.reason).toBe("signup");
        expect(fault?.errors).toEqual({
            email: ["email"],
            name: ["min_length:2"],
            age: ["type:int"],
            role: ["in"],
            tags: ["max_length:2"],
            extra: ["unknown"],
        });

        const missing = validate.check(signup, {});

        expect(!missing.ok && missing.fault.errors.email).toEqual(["required"]);
        expect(() => validate.assert(signup, {})).toThrow(error.Fault);
        expect(validate.assert(validate.number(), 1)).toBe(1);
        expect(validate.issuesOf([])).toEqual({});

    });
    it("rule strings build schemas like Laravel", () => {

        expect(validate.rules("required|email").safeParse("a@b.co").success).toBe(true);
        expect(validate.rules("required|email").safeParse("").success).toBe(false);
        expect(validate.rules("email").safeParse(undefined).success).toBe(true);
        expect(validate.rules("required|string|min:3|max:5").safeParse("abcd").success && !validate.rules("required|string|min:3|max:5").safeParse("ab").success).toBe(true);
        expect(validate.rules("required|integer|between:1,9").parse("5")).toBe(5);
        expect(validate.rules("required|integer|between:1,9").safeParse("10").success).toBe(false);
        expect(validate.rules("numeric|gt:0").safeParse("0").success).toBe(false);
        expect(["", "  ", undefined, null].map(( blank ) => validate.issuesOf(validate.rulebook({ age: "required|integer|min:0" }).safeParse({ age: blank }).error?.issues ?? []))).toEqual(Array(4).fill({ age: ["required"] }));
        expect(["", " ", undefined, null].map(( blank ) => validate.rules("integer|min:1").parse(blank))).toEqual([undefined, undefined, undefined, undefined]);
        expect([{}, { age: "" }, { age: "7" }].map(( row ) => validate.rulebook({ age: "integer|min:1" }).parse(row))).toEqual([{}, {}, { age: 7 }]);
        expect([validate.rules("nullable|numeric").parse(null), validate.rules("required|numeric").parse("0"), validate.rules("required|integer").safeParse("x").success]).toEqual([null, 0, false]);
        expect(validate.fields(validate.rulebook({ age: "required|integer|between:18,99", score: "numeric|max:5" }))).toEqual([{ name: "age", kind: "number", required: true, format: "safeint", min: 18, max: 99 }, { name: "score", kind: "number", required: false, optional: true, max: 5 }]);
        expect(validate.rules("required|boolean").parse("1")).toBe(true);
        expect(validate.rules("required|boolean").parse(false)).toBe(false);
        expect(validate.rules("required|in:a,b").safeParse("c").success).toBe(false);
        expect(validate.rules("required|not_in:a,b").safeParse("c").success).toBe(true);
        expect(validate.rules("required|regex:/^[a-z]+$/").safeParse("abc").success && !validate.rules("required|regex:/^[a-z]+$/").safeParse("ABC").success).toBe(true);
        expect(validate.rules("required|array|min:1|max:2").safeParse([1, 2, 3]).success).toBe(false);
        expect(validate.rules("required|date|after:2026-01-01").safeParse("2026-02-01").success).toBe(true);
        expect(validate.rules("required|date|before:2026-01-01").safeParse("2026-02-01").success).toBe(false);
        expect(validate.rules("nullable|string").parse(null)).toBeNull();
        expect(validate.rules("required|alpha").safeParse("مرحبا").success && !validate.rules("required|alpha_num").safeParse("a b").success).toBe(true);
        expect(validate.rules("required|alpha_dash").safeParse("a_b-1").success).toBe(true);
        expect(validate.rules("required|starts_with:ab,cd").safeParse("cdx").success && !validate.rules("required|ends_with:x").safeParse("ab").success).toBe(true);
        expect(validate.rules("required|phone").parse("0100 123 4567".replace("0100", "+20100"))).toBe("+201001234567");
        expect(validate.rules("required|size:3").safeParse("abc").success && !validate.rules("required|size:3").safeParse("ab").success).toBe(true);

        const book = validate.rulebook(
            { email: "required|email", password: "required|min:8", password_confirmation: "required", plan: "required|in:free,pro", company: "string" },
            { password: "confirmed", company: "required_if:plan,pro" },
        );
        const good = validate.check(book, { email: "a@b.co", password: "secret123", password_confirmation: "secret123", plan: "free" });

        expect(good.ok).toBe(true);

        const bad = validate.check(book, { email: "a@b.co", password: "secret123", password_confirmation: "other", plan: "pro" });

        expect(!bad.ok && bad.fault.errors).toEqual({ password: ["confirmed"], company: ["required"] });

    });
    it("fields describe a schema for forms", () => {

        const shape = validate.object({
            email: validate.email(),
            name: validate.string().check(validate.minLength(2), validate.maxLength(10)),
            age: validate.optional(validate.int().check(validate.gte(18), validate.lte(99))),
            role: validate.enum(["admin", "user"]),
            note: validate.nullable(validate.string()),
            tags: validate.array(validate.string()).check(validate.maxLength(3)),
        });
        const described = validate.fields(shape);

        expect(described.map(( field ) => field.name)).toEqual(["email", "name", "age", "role", "note", "tags"]);
        expect(described[0]).toEqual({ name: "email", kind: "string", required: true, max: 254, format: "email" });
        expect(described[1]).toEqual({ name: "name", kind: "string", required: true, min: 2, max: 10 });
        expect(described[2]).toEqual({ name: "age", kind: "number", required: false, optional: true, format: "safeint", min: 18, max: 99 });
        expect(described[3]).toEqual({ name: "role", kind: "enum", required: true, options: ["admin", "user"], values: ["admin", "user"] });
        expect(described[4]?.required).toBe(false);
        expect(described[5]).toEqual({ name: "tags", kind: "array", required: true, max: 3, item: { name: "tags", kind: "string", required: true } });
        expect(validate.fields(validate.string())).toEqual([]);

    });
    it("the zod doors still open: coerce, instanceof, literal, looseObject and tuple", () => {

        expect(validate.coerce.number().parse("12")).toBe(12);
        expect(validate.instanceof(Date).safeParse(new Date()).success).toBe(true);
        expect(validate.literal("a").safeParse("b").success).toBe(false);
        expect(validate.looseObject({ a: validate.number() }).parse({ a: 1, extra: true })).toEqual({ a: 1, extra: true });
        expect(validate.tuple([validate.string(), validate.number()]).parse(["x", 1])).toEqual(["x", 1]);
        expect(validate.NEVER).toBeDefined();
        expect(validate.toJSONSchema(validate.object({ a: validate.optional(validate.string()) }), { io: "input" })).toMatchObject({ type: "object", properties: { a: { type: "string" } } });
        expect(validate.money().safeParse({ amount: "x", currency: "EGP" }).success).toBe(false);

    });
    it("zod mini's own vocabulary composes every verb through the one door", async () => {

        const tags = validate.array(validate.string().check(validate.trim(), validate.toLowerCase(), validate.minLength(1), validate.maxLength(5), validate.regex(/^[a-z]+$/), validate.startsWith("a"), validate.endsWith("z"), validate.includes("b"))).check(validate.minLength(1), validate.maxLength(3));

        expect(tags.parse([" ABZ "])).toEqual(["abz"]);
        expect(tags.safeParse(["abz", "abz", "abz", "abz"]).success || tags.safeParse([]).success || tags.safeParse(["abx"]).success).toBe(false);
        expect(validate.string().check(validate.length(3)).safeParse("abcd").success).toBe(false);
        expect(validate.string().check(validate.toUpperCase()).parse("ab")).toBe("AB");

        const age = validate.int().check(validate.gte(18), validate.lte(99));

        expect(age.parse(40)).toBe(40);
        expect(age.safeParse(17).success || age.safeParse(2.5).success || age.safeParse(100).success).toBe(false);
        expect(validate.number().check(validate.gt(1), validate.gte(2), validate.lt(9), validate.lte(8)).parse(5)).toBe(5);
        expect(validate.number().check(validate.gt(1)).safeParse(1).success || validate.number().check(validate.lt(9)).safeParse(9).success).toBe(false);
        expect(validate.pipe(validate.coerce.number(), validate.int()).parse("7")).toBe(7);
        expect(validate.coerce.string().parse(7)).toBe("7");
        expect(validate.coerce.boolean().parse("x")).toBe(true);
        expect(validate.coerce.date().parse("2026-01-02").getUTCFullYear()).toBe(2026);
        expect(validate.coerce.bigint().parse("7")).toBe(7n);
        expect(validate.date().safeParse("nope").success).toBe(false);
        expect(validate.boolean().parse(true) && validate.any().parse(1) === 1 && validate.unknown().parse("u") === "u").toBe(true);

        const shape = validate.object({ id: validate.number(), name: validate.optional(validate.string()), tag: validate.nullable(validate.string()), note: validate.nullish(validate.string()), mode: validate._default(validate.string(), "auto"), count: validate.catch(validate.number(), 0) });

        expect(Object.keys(shape.shape)).toEqual(["id", "name", "tag", "note", "mode", "count"]);
        expect(shape.parse({ id: 1, tag: null, count: "x" })).toEqual({ id: 1, tag: null, mode: "auto", count: 0 });
        expect(validate.partial(validate.object({ a: validate.number(), b: validate.string() })).parse({ a: 1 })).toEqual({ a: 1 });
        expect(validate.strictObject({ a: validate.number() }).safeParse({ a: 1, b: 2 }).success).toBe(false);
        expect(validate.optional(validate.string()).parse(undefined)).toBeUndefined();
        expect(validate.nullable(validate.string()).parse(null)).toBeNull();
        expect(validate.literal("x").parse("x")).toBe("x");
        expect(validate.enum(["a", "b"]).safeParse("c").success).toBe(false);
        expect(validate.union([validate.string(), validate.number()]).parse(2)).toBe(2);
        expect(validate.record(validate.string(), validate.number()).parse({ a: 1 })).toEqual({ a: 1 });
        expect(validate.tuple([validate.string(), validate.number()]).safeParse(["a"]).success).toBe(false);

        type Tree = { leaf: string; kids?: Tree[] | undefined };

        const tree: validate.Schema<Tree> = validate.lazy(() => validate.object({ leaf: validate.string(), kids: validate.optional(validate.array(tree)) }));

        expect(tree.parse({ leaf: "a", kids: [{ leaf: "b" }] })).toEqual({ leaf: "a", kids: [{ leaf: "b" }] });
        expect(validate.instanceof(Date).safeParse("x").success).toBe(false);
        expect(validate.custom<string>(( value ) => typeof value === "string" && value.length > 1).safeParse("a").success).toBe(false);

        const grown = validate.pipe(validate.pipe(validate.string(), validate.transform(( value: string ) => value.length)), validate.number().check(validate.gte(2)));

        expect(grown.parse("abc")).toBe(3);
        expect(grown.safeParse("a").success).toBe(false);
        expect(await validate.string().parseAsync("ok")).toBe("ok");
        expect((await validate.string().safeParseAsync(1)).success).toBe(false);
        expect(validate.string().check(validate.refine(( value ) => value !== "no", "refused")).safeParse("no").success).toBe(false);

    });
    it("ip addresses and files have their own fields", () => {

        expect(validate.ip().safeParse("192.168.1.1").success && validate.ip().safeParse("::1").success && !validate.ip().safeParse("999.1.1.1").success).toBe(true);
        expect(validate.file({ maxBytes: 100, types: ["image/*", "application/pdf"] }).safeParse({ size: 50, type: "image/png" }).success).toBe(true);
        expect(validate.file({ maxBytes: 100 }).safeParse({ size: 500, type: "image/png" }).success).toBe(false);
        expect(validate.file({ types: ["image/*"] }).safeParse({ size: 5, type: "text/plain" }).success).toBe(false);
        expect(validate.file().safeParse("nope").success).toBe(false);

    });
    it("compile answers exactly as its source, leaves it alone, and hands back what it cannot model", () => {

        const told = ( schema: validate.Schema, payload: unknown ): unknown => {

            const result = validate.check(schema, structuredClone(payload));

            return result.ok ? { value: result.value } : { errors: result.fault.errors };

        };
        const row = validate.object({
            id: validate.int().check(validate.gt(0)),
            name: validate.string().check(validate.minLength(2), validate.maxLength(80)),
            phone: validate.optional(validate.phone()),
            price: validate.optional(validate.money()),
            tags: validate.array(validate.string()).check(validate.maxLength(3)),
            address: validate.optional(validate.strictObject({ city: validate.text(40), zip: validate.optional(validate.string()) })),
            mode: validate._default(validate.enum(["auto", "manual"]), "auto"),
        });
        const book = validate.rulebook({ email: "required|email", age: "required|integer|between:18,99", pass: "required|min:8" }, { pass: "confirmed" });
        const rows = [
            { id: 1, name: "Ann", phone: "00201000000000", price: { amount: "12.50", currency: "usd" }, tags: ["a"], address: { city: " Cairo " } },
            { id: 0, name: "A", phone: "12", price: { amount: "x", currency: "USD" }, tags: ["a", "b", "c", 4], address: { city: "", extra: 1 }, mode: "off" },
            { id: 1, name: "Ann", tags: [], extra: true },
            null,
            "row",
        ];
        const forms = [{ email: "A@b.co", age: "30", pass: "abcdefgh", pass_confirmation: "abcdefgh" }, { email: "x", age: "9", pass: "abcdefgh", pass_confirmation: "other", extra: 1 }, {}];
        const fast = validate.compile(row);
        const quick = validate.compile(book);

        expect(fast === row || quick === book).toBe(false);
        expect(told(fast, rows[0])).toEqual({ value: { id: 1, name: "Ann", phone: "+201000000000", price: { minor: 1250, currency: "USD" }, tags: ["a"], address: { city: "Cairo" }, mode: "auto" } });
        expect(told(fast, rows[1])).toEqual({ errors: { id: ["gt:0"], name: ["min_length:2"], phone: ["format"], price: ["money"], tags: ["max_length:3"], "address.city": ["min_length:1"], "address.extra": ["unknown"], mode: ["in"] } });

        for ( const payload of rows ) expect([told(fast, payload), told(validate.compile(fast), payload)]).toEqual([told(row, payload), told(row, payload)]);
        for ( const payload of forms ) expect(told(quick, payload)).toEqual(told(book, payload));

        type Tree = { leaf: string; kids?: Tree[] | undefined };

        const tree: validate.Schema<Tree> = validate.lazy(() => validate.object({ leaf: validate.string(), kids: validate.optional(validate.array(tree)) }));
        const coerced = validate.coerce.number();

        expect([validate.compile(tree), validate.compile(coerced)]).toEqual([tree, coerced]);
        expect(validate.compile(tree) === tree && validate.compile(coerced) === coerced).toBe(true);
        expect(() => validate.compile(coerced, { strict: true })).toThrow("coercion");

        const host = globalThis as { Function: unknown };
        const kept = host.Function;

        host.Function = () => { throw new EvalError("refused"); };

        try {

            expect(validate.compile(row)).toBe(row);
            expect(() => validate.compile(row, { strict: true })).toThrow("failed to evaluate");

        } finally {

            host.Function = kept;

        }

        expect(told(row, rows[0])).toEqual(told(fast, rows[0]));

    });
    it("a rule string refuses what it cannot read instead of passing it", () => {

        const unread = [
            "required|nope", "min:abc", "between:1", "digits:", "digits:1.5", "in:", "in:a,,b", "min:1,2", "regex:", "regex:/a/x", "regex:/(/", "required:1", "nullable:x", "ascii:1", "accepted:1", "json:1", "date:Y", "uuid:4", "integer:strict", "alpha:latin",
            "distinct:nope", "decimal:1,2,3", "url:ftp", "url:http,http", "otp:0", "otp:13", "multiple_of:0", ":x", "after:", "after:a,b", "same:", "confirmed:a,b", "required_if:a", "boolean|min:1", "email|multiple_of:2",
        ];

        for ( const rule of unread ) expect(refusal(() => validate.rules(rule))).toEqual(["internal", "validate.rule", `not a rule: ${rule.split("|").at(-1)}`, { rule: [rule.split("|").at(-1)] }]);

        expect(refusal(() => validate.rules(5 as never))?.[2]).toBe("not a rule: 5");
        expect(refusal(() => validate.rules(["required", 5 as never]))?.[2]).toBe("not a rule: 5");
        expect(refusal(() => validate.rules(`in:${Array.from({ length: 65 }, ( _, at ) => `v${at}`).join(",")}`))?.[1]).toBe("validate.rule");
        expect(refusal(() => validate.rules(`in:${Array.from({ length: 64 }, ( _, at ) => `v${at}`).join(",")}`))).toBeUndefined();
        expect([codes(["required", "min:2"], "a"), codes(" required | min : 2 ", "ab"), codes("|required||", ""), codes("bail|sometimes|required|date_format:Y-m-d", "a"), codes("email:rfc,dns", "a@b.co")]).toEqual([["min_length:2"], [], ["required"], [], []]);

    });
    it("raw text rules read digits and decimal places before the field's own reader", () => {

        expect(["abcdef", "123456", " 123456 ", "12345", "١٢٣٤٥٦"].map(( given ) => codes("digits:6", given))).toEqual([["digits"], [], [], ["digits"], ["digits"]]);
        expect([true, [1], {}].map(( given ) => codes("digits:1", given))).toEqual(Array(3).fill(["digits"]));
        expect(validate.rules("integer|digits:6").parse(123456)).toBe(123456);
        expect(["1", "12", "1234", "12345"].map(( given ) => codes("digits_between:2,4", given))).toEqual([["digits_between"], [], [], ["digits_between"]]);
        expect(["1", "12", "123", "1234"].map(( given ) => codes("min_digits:2|max_digits:3", given))).toEqual([["min_digits"], [], [], ["max_digits"]]);
        expect(["1.50", "1.5", "1", "abc", "1.500"].map(( given ) => codes("decimal:2", given))).toEqual([[], ["decimal"], ["decimal"], ["decimal"], ["decimal"]]);
        expect(["1.5", "1.555", "1.5555", "1"].map(( given ) => codes("decimal:1,3", given))).toEqual([[], [], ["decimal"], ["decimal"]]);
        expect([validate.rules("numeric|decimal:2").parse("1.50"), codes("numeric|decimal:2", "1.5")]).toEqual([1.5, ["decimal"]]);

    });
    it("presence rules decide what blank means before any other rule runs", () => {

        expect(["", " ", null, undefined, [], {}].map(( given ) => codes("required", given))).toEqual(Array(6).fill(["required"]));
        expect([0, false, [0]].map(( given ) => codes("required", given))).toEqual(Array(3).fill(["type:string"]));
        expect(["", undefined, null, "a", []].map(( given ) => codes("filled", given))).toEqual([["filled"], [], ["filled"], [], ["filled"]]);
        expect(["x", "", undefined, null, [], 0].map(( given ) => codes("prohibited", given))).toEqual([["prohibited"], [], [], [], [], ["prohibited"]]);
        expect([null, undefined, "", "a"].map(( given ) => validate.rules("nullable").parse(given))).toEqual([null, undefined, undefined, "a"]);
        expect([null, undefined, ""].map(( given ) => codes("required|nullable", given))).toEqual(Array(3).fill(["required"]));
        expect([true, "yes", "on", 1, "1", "true"].map(( given ) => validate.rules("accepted").parse(given))).toEqual(Array(6).fill(true));
        expect([false, "no", undefined, "", "maybe"].map(( given ) => codes("accepted", given))).toEqual([["accepted"], ["accepted"], ["accepted"], ["accepted"], ["type:boolean"]]);
        expect([false, "no", "off", 0, "0", "false"].map(( given ) => validate.rules("declined").parse(given))).toEqual(Array(6).fill(false));
        expect([true, undefined, "maybe"].map(( given ) => codes("declined", given))).toEqual([["declined"], ["declined"], ["type:boolean"]]);
        expect([[], {}, "a"].map(( given ) => codes("required|array", given))).toEqual([["required"], ["required"], ["type:array"]]);
        expect([false, 0, "0", "off"].map(( given ) => validate.rules("required|boolean").parse(given))).toEqual(Array(4).fill(false));
        expect([codes("required|boolean", "x"), codes("required|boolean", "")]).toEqual([["type:boolean"], ["required"]]);
        expect([validate.rules("min:2").parse("  ab  "), codes("min:2", "  a  ")]).toEqual(["ab", ["min_length:2"]]);

    });
    it("an open bound answers gt or lt and is told as open, or as the next whole number", () => {

        const open = validate.number().check(validate.gt(0), validate.lt(10));
        const mixed = validate.number().check(validate.gte(1), validate.gt(0.5), validate.lte(9), validate.lt(9.5));
        const late = validate.number().check(validate.gt(1.5), validate.lt(4.5), validate.int());
        const twice = validate.int().check(validate.gte(5), validate.gt(0), validate.lte(7), validate.lt(20));
        const dated = validate.date().check(validate.gt(new Date(1000)), validate.lt(new Date(5000)));

        expect(validate.field(open, "rate")).toEqual({ name: "rate", kind: "number", required: true, above: 0, below: 10 });
        expect(validate.field(mixed)).toEqual({ name: "", kind: "number", required: true, min: 1, max: 9, above: 0.5, below: 9.5 });
        expect(validate.field(validate.int().check(validate.gt(0), validate.lt(3)))).toEqual({ name: "", kind: "number", required: true, format: "safeint", min: 1, max: 2 });
        expect(validate.field(late)).toEqual({ name: "", kind: "number", required: true, format: "safeint", min: 2, max: 4 });
        expect(validate.field(twice)).toEqual({ name: "", kind: "number", required: true, format: "safeint", min: 5, max: 7 });
        expect(validate.field(dated)).toEqual({ name: "", kind: "date", required: true, min: 1001, max: 4999 });
        expect(validate.field(validate.rules("required|numeric|gt:0|lt:1"), "rate")).toEqual({ name: "rate", kind: "number", required: true, above: 0, below: 1 });
        expect(validate.field(validate.rules("required|integer|gt:5|lt:9"))).toEqual({ name: "", kind: "number", required: true, format: "safeint", min: 6, max: 8 });
        expect(validate.field(validate.number().check(validate.stamp({ above: 0, below: 1 })))).toEqual({ name: "", kind: "number", required: true, above: 0, below: 1 });
        expect([0, 0.5, 10, 9.99].map(( given ) => errorsOf(open, given)?._ ?? [])).toEqual([["gt:0"], [], ["lt:10"], []]);
        expect([1, 1.5, 9, 9.5, 0.5].map(( given ) => errorsOf(mixed, given)?._ ?? [])).toEqual([[], [], [], ["max:9", "lt:9.5"], ["min:1", "gt:0.5"]]);
        expect([5, 6, 9].map(( given ) => codes("integer|gt:5|lt:9", given))).toEqual([["gt:5"], [], ["lt:9"]]);
        expect([errorsOf(dated, new Date(1000))?._, errorsOf(dated, new Date(5000))?._, errorsOf(dated, new Date(1001))]).toEqual([["gt:1000"], ["lt:5000"], undefined]);
        expect(validate.toJSONSchema(open)).toMatchObject({ type: "number", exclusiveMinimum: 0, exclusiveMaximum: 10 });

    });
    it("sizes follow the field's kind and a size nothing can meet is refused", () => {

        expect(["ab", "abc", "abcd", "abcde"].map(( given ) => codes("string|gt:2|lte:4", given))).toEqual([["min_length:3"], [], [], ["max_length:4"]]);
        expect([2, 2.5, 4, 4.5, "3"].map(( given ) => codes("numeric|gt:2|lte:4", given))).toEqual([["gt:2"], [], [], ["max:4"], []]);
        expect([[], [1], [1, 2], [1, 2, 3]].map(( given ) => codes("array|between:1,2", given))).toEqual([["min_length:1"], [], [], ["max_length:2"]]);
        expect([{}, { a: 1 }, { a: 1, b: 2, c: 3 }].map(( given ) => codes("object|min:1|max:2", given))).toEqual([["min_length:1"], [], ["max_length:2"]]);
        expect([{}, { a: 1 }, { a: 1, b: 2 }].map(( given ) => codes("object|size:1", given))).toEqual([["min_length:1"], [], ["max_length:1"]]);
        expect([10, "15", 7, "x"].map(( given ) => codes("multiple_of:5", given))).toEqual([[], [], ["step:5"], ["type:number"]]);
        expect([4, 3, 2.5].map(( given ) => codes("integer|multiple_of:2", given))).toEqual([[], ["step:2"], ["type:int"]]);

        for ( const rule of ["size:-1", "size:1.5", "max:-1", "array|lt:0", "between:5,2", "numeric|between:5,2", "object|between:1.2,1.8"] ) expect(refusal(() => validate.rules(rule))?.[2]).toBe(`not a rule: ${rule.split("|").at(-1)}`);
        for ( const rule of ["numeric|between:-5,-2", "numeric|size:-1", "max:0", "lt:1", "min:-1", "array|size:0", "between:2,2"] ) expect(refusal(() => validate.rules(rule))).toBeUndefined();
        for ( const rule of ["digits:0", "max_digits:0", "digits_between:0,0", "digits_between:5,2", "decimal:3,1"] ) expect(refusal(() => validate.rules(rule))?.[2]).toBe(`not a rule: ${rule}`);
        for ( const rule of ["min_digits:0", "decimal:0", "decimal:0,0", "digits_between:0,1", "digits_between:2,2", "decimal:1,1"] ) expect(refusal(() => validate.rules(rule))).toBeUndefined();

        expect([codes("max:0", "a"), codes("numeric|between:-5,-2", -3), codes("numeric|size:-1", -1), codes("array|size:0", []), codes("between:2,2", "ab")]).toEqual([["max_length:0"], [], [], [], []]);

    });
    it("value rules read lists, words, letters, patterns, repeats, json and keys", () => {

        const sticky = validate.rules("regex:/a/g");

        expect([codes("in:a,b", "a"), codes("in:a,b", "c"), codes("enum:a,b", "c"), codes("not_in:a,b", "a"), codes("not_in:a,b", "c")]).toEqual([[], ["in"], ["in"], ["not_in"], []]);
        expect([codes("in:a,b", ["a"]), codes("date", 5)]).toEqual([["type:string"], ["type:string"]]);
        expect([["a", "b"], ["a", "c"], []].map(( given ) => codes("array|in:a,b", given))).toEqual([[], ["in"], []]);
        expect([1, "2", 3].map(( given ) => codes("integer|in:1,2", given))).toEqual([[], [], ["in"]]);
        expect(["abc", "abz", "xbc"].map(( given ) => codes("starts_with:ab|doesnt_end_with:z", given))).toEqual([[], ["doesnt_end_with"], ["starts_with"]]);
        expect(["abc", "xbc"].map(( given ) => codes("doesnt_start_with:ab", given))).toEqual([["doesnt_start_with"], []]);
        expect([codes("contains:a,b", "ab"), codes("contains:a,b", "a"), codes("array|contains:a,b", ["a", "b", "c"]), codes("array|contains:a,b", ["a"])]).toEqual([[], ["contains"], [], ["contains"]]);
        expect([codes("doesnt_contain:a,b", "xyz"), codes("doesnt_contain:a,b", "xa"), codes("array|doesnt_contain:a", ["c"]), codes("array|doesnt_contain:a", ["a"])]).toEqual([[], ["doesnt_contain"], [], ["doesnt_contain"]]);
        expect(["abc", "مرحبا", "ab1", "a b"].map(( given ) => codes("alpha", given))).toEqual([[], [], ["alpha"], ["alpha"]]);
        expect([codes("alpha:ascii", "مرحبا"), codes("alpha_num", "a_b"), codes("alpha_num", "١٢"), codes("alpha_dash:ascii", "a_b-1"), codes("alpha_dash:ascii", "é"), codes("ascii", "abc"), codes("ascii", "é")]).toEqual([["alpha"], ["alpha_num"], [], [], ["alpha_dash"], [], ["ascii"]]);
        expect([codes("lowercase", "abc"), codes("lowercase", "Abc"), codes("lowercase", "123"), codes("uppercase", "ABC"), codes("uppercase", "Abc")]).toEqual([[], ["lowercase"], [], [], ["uppercase"]]);
        expect([codes("regex:/^[a-z]+$/i", "ABC"), codes("regex:/^[a-z]+$/i", "ab1"), codes(["regex:/^(a|b)$/"], "a"), codes(["regex:/^(a|b)$/"], "c"), codes("regex:^a,b$", "a,b"), codes("not_regex:/^a/", "abc"), codes("not_regex:/^a/", "bcd")]).toEqual([[], ["format"], [], ["format"], [], ["not_regex"], []]);
        expect([1, 2, 3].map(() => sticky.safeParse("a").success)).toEqual([true, true, true]);
        expect([[1, 2], [1, "1"], ["a", "A"], [{}, {}]].map(( given ) => codes("array|distinct", given))).toEqual([[], ["distinct"], [], []]);
        expect([codes("array|distinct:strict", [1, "1"]), codes("array|distinct:strict", [1, 1]), codes("array|distinct:ignore_case", ["a", "A"]), codes("array|distinct:strict,ignore_case", ["a", "A"])]).toEqual([[], ["distinct"], ["distinct"], ["distinct"]]);
        expect(["{}", "[1]", "1", "nope"].map(( given ) => codes("json", given))).toEqual([[], [], [], ["json"]]);
        expect([codes("array:a,b", { a: 1 }), codes("array:a,b", { a: 1, c: 2 }), codes("array:a,b", [1]), codes("array:a,b,c|required_array_keys:a,b", { a: 1 }), codes("object|in_array_keys:a,b", { c: 1 }), codes("object|in_array_keys:a,b", { b: 1 })]).toEqual([[], ["array"], ["type:record"], ["required_array_keys"], ["in_array_keys"], []]);
        expect([codes("object|required_array_keys:toString", {}), codes("object|required_array_keys:toString", { toString: 1 })]).toEqual([["required_array_keys"], []]);

    });
    it("date rules compare against fixed days and against days read at each parse", () => {

        const later = validate.rules("date|after:now");
        const today = validate.rules("date|after_or_equal:today|before:tomorrow");
        const past = validate.rules("date|before:today|after_or_equal:yesterday");

        expect(["2026-01-01", "2026-01-02", "2026-12-31", "2027-01-01"].map(( given ) => codes("date|after:2026-01-01|before_or_equal:2026-12-31", given))).toEqual([["after"], [], [], ["before_or_equal"]]);
        expect(["2026-01-01", "2026-01-01T00:00:00Z", "2026-01-02"].map(( given ) => codes("date|date_equals:2026-01-01", given))).toEqual([[], [], ["date_equals"]]);
        expect(["2026-02-28", "Tue, 10 Nov 2026 10:00:00 GMT", "2026-02-30", "10/11/2026"].map(( given ) => codes("date", given))).toEqual([[], [], ["date"], ["date"]]);
        expect([codes("date|after:2026-01-01", "nope"), codes("date|before:2026-01-01|after_or_equal:2025-01-01", "2025-01-01"), codes("date|before:2026-01-01", "2026-01-01")]).toEqual([["date", "after"], [], ["before"]]);

        jest.useFakeTimers();

        try {

            jest.setSystemTime(new Date("2026-03-10T12:00:00Z"));

            expect([later.safeParse("2026-06-01").success, today.safeParse("2026-03-10T12:00:00Z").success, today.safeParse("2026-03-11T12:00:00Z").success, past.safeParse("2026-03-09T12:00:00Z").success, past.safeParse("2026-03-10T12:00:00Z").success]).toEqual([true, true, false, true, false]);

            jest.setSystemTime(new Date("2027-03-10T12:00:00Z"));

            expect([later.safeParse("2026-06-01").success, today.safeParse("2026-03-10T12:00:00Z").success, today.safeParse("2027-03-10T12:00:00Z").success]).toEqual([false, false, true]);

        } finally {

            jest.useRealTimers();

        }

    });
    it("a maker rule names the reader the field is read through", () => {

        const read = ( rule: validate.Rules, given: unknown ): unknown => validate.rules(rule).parse(given);

        expect([codes("uuid", "nope"), codes("ulid", "nope"), codes("ipv4", "::1"), codes("ipv6", "::1"), codes("mac", "nope"), codes("ip", "x"), codes("timezone", "Mars/One"), codes("hex_color", "red"), codes("url:https", "http://x.io")]).toEqual([["uuid"], ["ulid"], ["ipv4"], [], ["mac"], ["ip"], ["timezone"], ["hex_color"], ["url"]]);
        expect([codes("list", {}), codes("map", []), codes("otp", "1234"), codes("integer", "5.5"), codes("integer", "abc"), codes("number", "x")]).toEqual([["type:array"], ["type:record"], ["format"], ["type:int"], ["type:number"], ["type:number"]]);
        expect([read("mac", "00:1A:2B:3C:4D:5E"), read("timezone", "Africa/Cairo"), read("hex_color", "#FFF"), read("slug", "A-b"), read("key", "a_b"), read("currency", "egp"), read("locale", "ar_eg"), read("otp:4", "1234")]).toEqual(["00:1A:2B:3C:4D:5E", "Africa/Cairo", "#fff", "a-b", "a_b", "EGP", "ar-EG", "1234"]);
        expect([read("url:https", "https://x.io"), read("url:http,https", "http://x.io"), read("number", "1e3"), read("integer", " 7 "), read("required|email", " Ann@Example.COM "), read("required|ip", " ::1 ")]).toEqual(["https://x.io", "http://x.io", 1000, 7, "ann@example.com", "::1"]);

    });
    it("a rulebook reads a row, its cross rules and nothing it was not told about", () => {

        const said = ( book: validate.Schema, row: unknown ): unknown => errorsOf(book, row) ?? "ok";
        const each = ( book: validate.Book, rows: unknown[], extra?: validate.Book ): unknown[] => rows.map(( row ) => said(validate.rulebook(book, extra), row));
        const refused = ( book: validate.Book, extra?: validate.Book ): unknown[] => refusal(() => validate.rulebook(book, extra))?.slice(1) ?? [];
        const signup = validate.rulebook({ pass: "required|min:3|confirmed" });
        const loose = validate.rulebook({ a: "string" });
        const pair = { a: "integer", b: "integer|same:a" };
        const proto = errorsOf(loose, JSON.parse('{"a":"x","__proto__":1}')) ?? {};

        expect([{ pass: "abc", pass_confirmation: "abc" }, { pass: "abc", pass_confirmation: " abc " }, { pass: "abc", pass_confirmation: "abd" }, { pass: "abc" }].map(( row ) => said(signup, row))).toEqual(["ok", "ok", { pass: ["confirmed"] }, { pass: ["confirmed"] }]);
        expect(validate.fields(signup)).toEqual([{ name: "pass", kind: "string", required: true, min: 3 }, { name: "pass_confirmation", kind: "unknown", required: false, optional: true }]);
        expect(each({ pass: "required|confirmed:again", again: "string" }, [{ pass: "a", again: "a" }, { pass: "a", again: "b" }, { pass: "a" }])).toEqual(["ok", { pass: ["confirmed"] }, { pass: ["confirmed"] }]);
        expect(each(pair, [{ a: "1", b: 1 }, { a: 1, b: 2 }, { a: 1 }, {}])).toEqual(["ok", { b: ["same"] }, "ok", "ok"]);
        expect(each({ a: "string", b: "different:a" }, [{ a: "x", b: "x" }, { a: "x", b: "y" }, { a: "x" }])).toEqual([{ b: ["different"] }, "ok", "ok"]);
        expect(each({ list: "array", pick: "in_array:list.*" }, [{ list: ["a", "b"], pick: "a" }, { list: ["a", "b"], pick: "c" }, { pick: "a" }, { list: [1], pick: "1" }])).toEqual(["ok", { pick: ["in_array"] }, { pick: ["in_array"] }, "ok"]);
        expect(each({ a: "prohibits:b,c", b: "string", c: "string" }, [{ a: "x" }, { a: "x", b: "y" }, { a: "x", c: "y" }, { b: "y", c: "z" }])).toEqual(["ok", { a: ["prohibits"] }, { a: ["prohibits"] }, "ok"]);
        expect(each({ plan: "string", company: "required_if:plan,pro,team" }, [{ plan: "pro" }, { plan: "team" }, { plan: "free" }, { plan: "pro", company: "x" }, {}])).toEqual([{ company: ["required"] }, { company: ["required"] }, "ok", "ok", "ok"]);
        expect(each({ plan: "nullable|string", note: "required_if:plan,null" }, [{}, { plan: null }, { plan: "x" }, { note: "n" }])).toEqual([{ note: ["required"] }, { note: ["required"] }, "ok", "ok"]);
        expect(each({ plan: "string", card: "required_unless:plan,free" }, [{ plan: "free" }, { plan: "pro" }, {}, { plan: "pro", card: "c" }])).toEqual(["ok", { card: ["required"] }, { card: ["required"] }, "ok"]);
        expect(each({ a: "string", b: "string", c: "required_with:a,b" }, [{ a: "x" }, { b: "y" }, {}, { a: "x", c: "z" }])).toEqual([{ c: ["required"] }, { c: ["required"] }, "ok", "ok"]);
        expect(each({ a: "string", b: "string", c: "required_with_all:a,b" }, [{ a: "x" }, { a: "x", b: "y" }, {}])).toEqual(["ok", { c: ["required"] }, "ok"]);
        expect(each({ a: "string", b: "string", c: "required_without:a,b" }, [{ a: "x", b: "y" }, { a: "x" }, {}])).toEqual(["ok", { c: ["required"] }, { c: ["required"] }]);
        expect(each({ a: "string", b: "string", c: "required_without_all:a,b" }, [{ a: "x" }, {}, { c: "z" }])).toEqual(["ok", { c: ["required"] }, "ok"]);
        expect(each({ terms: "boolean", sign: "required_if_accepted:terms", why: "required_if_declined:terms" }, [{ terms: true }, { terms: "no" }, {}, { terms: "yes", sign: "s" }])).toEqual([{ sign: ["required"] }, { why: ["required"] }, "ok", "ok"]);
        expect(each({ kind: "string", fee: "prohibited_if:kind,free", tip: "prohibited_unless:kind,paid" }, [{ kind: "free", fee: "1" }, { kind: "paid", fee: "1", tip: "1" }, { kind: "free", tip: "1" }, { kind: "free" }])).toEqual([{ fee: ["prohibited"] }, "ok", { tip: ["prohibited"] }, "ok"]);
        expect(each({ terms: "boolean", fee: "prohibited_if_accepted:terms", tip: "prohibited_if_declined:terms" }, [{ terms: true, fee: "1" }, { terms: true, tip: "1" }, { terms: false, tip: "1" }, { terms: false, fee: "1" }])).toEqual([{ fee: ["prohibited"] }, "ok", { tip: ["prohibited"] }, "ok"]);
        expect(each({ kind: "string", terms: "boolean|accepted_if:kind,paid", opt: "boolean|declined_if:kind,paid" }, [{ kind: "paid", terms: true, opt: false }, { kind: "paid", terms: false, opt: true }, { kind: "paid" }, { kind: "free", terms: false, opt: true }])).toEqual(["ok", { terms: ["accepted"], opt: ["declined"] }, { terms: ["accepted"], opt: ["declined"] }, "ok"]);
        expect(each({ low: "integer", high: "integer|gt:low" }, [{ low: 1, high: 2 }, { low: 2, high: 2 }, { high: 2 }, { low: 2 }])).toEqual(["ok", { high: ["gt"] }, { high: ["gt"] }, "ok"]);
        expect(each({ low: "integer", high: "integer|gte:low|lte:top", top: "integer" }, [{ low: 2, high: 2, top: 2 }, { low: 3, high: 2, top: 1 }])).toEqual(["ok", { high: ["gte", "lte"] }]);
        expect(each({ a: "string", b: "string|lt:a", n: "integer|gte:a" }, [{ a: "abc", b: "ab" }, { a: "ab", b: "ab" }, { a: "ab", n: 5 }])).toEqual(["ok", { b: ["lt"] }, { n: ["gte"] }]);
        expect(each({ start: "date", end: "date|after:start" }, [{ start: "2026-01-01", end: "2026-01-02" }, { start: "2026-01-02", end: "2026-01-01" }, { end: "2026-01-02" }, { start: "2026-01-01" }])).toEqual(["ok", { end: ["after"] }, { end: ["after"] }, "ok"]);
        expect(each({ start: "date", end: "date|before_or_equal:start", same: "date|date_equals:start", early: "date|before:start" }, [{ start: "2026-01-02", end: "2026-01-02", same: "2026-01-02T00:00:00Z", early: "2026-01-01" }, { start: "2026-01-02", end: "2026-01-03", same: "2026-01-03", early: "2026-01-02" }])).toEqual(["ok", { end: ["before_or_equal"], same: ["date_equals"], early: ["before"] }]);
        expect([{ a: "x", z: 1 }, null, undefined, "row", []].map(( row ) => said(loose, row))).toEqual([{ z: ["unknown"] }, { _: ["required"] }, { _: ["required"] }, { _: ["type:object"] }, { _: ["type:object"] }]);
        expect([Object.keys(proto), Object.getPrototypeOf(proto) === Object.prototype, Object.getOwnPropertyDescriptor(proto, "__proto__")?.value]).toEqual([["__proto__"], true, ["unknown"]]);
        expect(each(pair, [{ a: "x", b: 1 }, { a: 1, b: 2, z: 1 }, new (class { a = 1; b = 2; })()])).toEqual([{ a: ["type:number"] }, { z: ["unknown"], b: ["same"] }, { b: ["same"] }]);
        expect(each({ a: "string", b: "string" }, [{ a: "x" }, { a: "x", b: "y" }, { a: "x", b: "x" }, {}], { b: ["same:a", "required_with:a"] })).toEqual([{ b: ["required"] }, { b: ["same"] }, "ok", "ok"]);
        expect([refused({ "": "string" }), refused(JSON.parse('{"__proto__":"string"}')), refused({ constructor: "string" }), refused({ prototype: "string" })]).toEqual(["", "__proto__", "constructor", "prototype"].map(( name ) => ["validate.rule", `not a field: ${name}`, { field: [name] }]));
        expect([refused({ a: "same:b" }), refused({ a: "gt:b" }), refused({ a: "date|after:b" }), refused({ a: "confirmed:again" }), refused({ list: "array", a: "in_array:other.*" }), refused({ a: "string" }, { b: "confirmed" })].map(( told ) => told[1])).toEqual(["not a field: b", "not a field: b", "not a field: b", "not a field: again", "not a field: other", "not a field: b"]);
        expect([refused({ a: "string" }, { a: "min:2" }), refused({ a: "string" }, { a: "required" }), refused({ a: "nope" })]).toEqual([["validate.rule", "not a rule: min:2", { rule: ["min:2"] }], ["validate.rule", "not a rule: required", { rule: ["required"] }], ["validate.rule", "not a rule: nope", { rule: ["nope"] }]]);
        expect([codes("same:a", "x"), codes("required_if:a,b", undefined), codes("gt:other", "x")]).toEqual([[], [], []]);

    });
    it("the engine's fields trim, fold and bound what people type", () => {

        const image = validate.file({ maxBytes: 100, types: ["image/*", "application/pdf"] });
        const named = validate.file({ extensions: [".PNG", "jpg"] });
        const filed = ( schema: validate.Schema, given: unknown ): unknown => errorsOf(schema, given)?._ ?? "ok";

        expect([" Ann@Example.COM ", `a@${Array(5).fill("b".repeat(50)).join(".")}.co`, "", null, 5].map(( given ) => read(validate.email(), given))).toEqual(["ann@example.com", { _: ["max_length:254"] }, { _: ["email"] }, { _: ["required"] }, { _: ["type:string"] }]);
        expect([" https://x.io/a?b=1 ", "ftp://x.io", "javascript:alert(1)", "//x.io", "http://", `https://x.io/${"a".repeat(2048)}`].map(( given ) => read(validate.url(), given))).toEqual(["https://x.io/a?b=1", { _: ["url"] }, { _: ["url"] }, { _: ["url"] }, { _: ["url"] }, { _: ["max_length:2048"] }]);
        expect(["+20 (100) 000-0000", "00201000000000", "01000000000", "12", 5].map(( given ) => read(validate.phone(), given))).toEqual(["+201000000000", "+201000000000", { _: ["format"] }, { _: ["format"] }, { _: ["type:string"] }]);
        expect([read(validate.phone("20"), "01000000000"), validate.field(validate.phone()).format]).toEqual(["+201000000000", "phone"]);
        expect([" My-Slug ", "bad slug", "", "a".repeat(121)].map(( given ) => read(validate.slug(), given))).toEqual(["my-slug", { _: ["format"] }, { _: ["min_length:1", "format"] }, { _: ["max_length:120"] }]);
        expect([" user_id ", "1x", "", "a".repeat(65)].map(( given ) => read(validate.key(), given))).toEqual(["user_id", { _: ["format"] }, { _: ["min_length:1", "format"] }, { _: ["max_length:64"] }]);
        expect([read(validate.slug(3), "abcd"), read(validate.key(3), "abcd")]).toEqual([{ _: ["max_length:3"] }, { _: ["max_length:3"] }]);
        expect(["abcdefg1", "abcdefgh", "12345678", "a1", `a1${"x".repeat(127)}`, " abcdef1 ", "كلمةسرية1"].map(( given ) => read(validate.password(), given))).toEqual(["abcdefg1", { _: ["letters_and_digits"] }, { _: ["letters_and_digits"] }, { _: ["min_length:8"] }, { _: ["max_length:128"] }, " abcdef1 ", "كلمةسرية1"]);
        expect(["ab1", "abc1", "abcdef1"].map(( given ) => read(validate.password(4, 6), given))).toEqual([{ _: ["min_length:4"] }, "abc1", { _: ["max_length:6"] }]);
        expect(["١٢٣٤٥٦", " 12 34 56 ", "12345", "abcdef"].map(( given ) => read(validate.otp(), given))).toEqual(["123456", "123456", { _: ["format"] }, { _: ["format"] }]);
        expect([0, 13, 1.5, Number.NaN].map(( length ) => refusal(() => validate.otp(length)))).toEqual(Array(4).fill(["thrown", "RangeError: not an otp length"]));
        expect([read(validate.otp(4), "1234"), validate.field(validate.otp(4))]).toEqual(["1234", { name: "", kind: "string", required: true, format: "otp", min: 4, max: 4 }]);
        expect([" egp ", "XXX", "eg", "EGPP"].map(( given ) => read(validate.currency(), given))).toEqual(["EGP", "XXX", { _: ["format"] }, { _: ["format"] }]);
        expect(["ar_eg", "en-us", " EN ", "arabic"].map(( given ) => read(validate.locale(), given))).toEqual(["ar-EG", "en-US", "en", { _: ["format"] }]);
        expect([" #FFF ", "#ffff", "#A1B2C3", "#a1b2c3d4", "#ff", "red", "fff"].map(( given ) => read(validate.hexColor(), given))).toEqual(["#fff", "#ffff", "#a1b2c3", "#a1b2c3d4", { _: ["hex_color"] }, { _: ["hex_color"] }, { _: ["hex_color"] }]);
        expect([" 2026-02-28 ", "2026-02-30", "2026-2-28", "28/02/2026"].map(( given ) => read(validate.plainDate(), given))).toEqual(["2026-02-28", { _: ["date"] }, { _: ["date"] }, { _: ["date"] }]);
        expect(["Africa/Cairo", " UTC ", "Mars/One", ""].map(( given ) => read(validate.timezone(), given))).toEqual(["Africa/Cairo", "UTC", { _: ["timezone"] }, { _: ["timezone"] }]);
        expect(["1,000", "١٢", 1n, " 7.5 ", "", null, "x", true].map(( given ) => read(validate.numeric(), given))).toEqual([1000, 12, 1, 7.5, { _: ["type:number"] }, { _: ["required"] }, { _: ["type:number"] }, { _: ["type:number"] }]);
        expect(["7", "7.5", 2 ** 53, "x"].map(( given ) => read(validate.integer(), given))).toEqual([7, { _: ["type:int"] }, { _: ["max:9007199254740991"] }, { _: ["type:number"] }]);
        expect(["yes", "off", 1, "maybe", null].map(( given ) => read(validate.flag(), given))).toEqual([true, false, true, { _: ["type:boolean"] }, { _: ["required"] }]);
        expect([{ amount: "12.50", currency: "usd" }, { amount: "1.005", currency: "USD" }, { amount: "1.5", currency: "JPY" }, { amount: 7, currency: "EGP" }].map(( given ) => read(validate.money(), given))).toEqual([{ minor: 1250, currency: "USD" }, { minor: 100, currency: "USD" }, { minor: 2, currency: "JPY" }, { minor: 700, currency: "EGP" }]);
        expect([{ amount: "x", currency: "USD" }, { amount: "1", currency: "dollars" }, { amount: "1" }, "12 USD"].map(( given ) => read(validate.money(), given))).toEqual([{ _: ["money"] }, { currency: ["format"] }, { currency: ["required"] }, { _: ["type:object"] }]);
        expect([{ size: 50, type: "image/png" }, { size: 50, type: "IMAGE/PNG; charset=x" }, { size: 100, type: "application/pdf" }, { size: 101, type: "image/png" }, { size: -1, type: "image/png" }, { size: Number.NaN, type: "image/png" }, { size: 5, type: "text/plain" }, { size: 5 }, "nope", null].map(( given ) => filed(image, given))).toEqual(["ok", "ok", "ok", ...Array(7).fill(["file"])]);
        expect([{ size: 1, type: "x/y", name: "a.png" }, { size: 1, type: "x/y", name: "b.a.JPG" }, { size: 1, type: "x/y", name: "a.gif" }, { size: 1, type: "x/y", name: "png" }, { size: 1, type: "x/y" }].map(( given ) => filed(named, given))).toEqual(["ok", "ok", ["file"], ["file"], ["file"]]);
        expect([filed(validate.file({ types: ["*/*"] }), { size: 1, type: "any/thing" }), filed(validate.file(), { size: 10 * 1024 * 1024, type: "a/b" }), filed(validate.file(), { size: 10 * 1024 * 1024 + 1, type: "a/b" }), filed(validate.file(), { size: 1, type: "a/b", name: 5 }), validate.field(validate.file()).format]).toEqual(["ok", "ok", ["file"], ["file"], "file"]);
        expect([read(validate.text(3), " abc "), read(validate.text(3), "abcd"), read(validate.text(), "  "), read(validate.text(), "a".repeat(256))]).toEqual(["abc", { _: ["max_length:3"] }, { _: ["min_length:1"] }, { _: ["max_length:255"] }]);
        expect(["192.168.1.1", "::1", " 1.1.1.1 ", "::ffff:1.2.3.4", "999.1.1.1", "x", "1.1.1.1/24", "[::1]", 5, null].map(( given ) => read(validate.ip(), given))).toEqual(["192.168.1.1", "::1", "1.1.1.1", "::ffff:1.2.3.4", { _: ["ip"] }, { _: ["ip"] }, { _: ["ip"] }, { _: ["ip"] }, { _: ["type:string"] }, { _: ["required"] }]);
        expect(validate.field(validate.ip(), "ip")).toEqual({ name: "ip", kind: "string", required: true, format: "ip" });

    });
    it("check turns issues into codes and paths inside a fault that never carries the input", async () => {

        const nested = validate.object({ a: validate.array(validate.object({ b: validate.string() })) });
        const taken = validate.string().check(validate.refine(async ( word ) => word !== "ann", "taken"));
        const failed = validate.check(validate.strictObject({ secret: validate.int() }), { secret: "hunter2-value", other: "leak-me" }, "login");
        const free = await validate.checkAsync(taken, "bob");
        const held = await validate.checkAsync(taken, "ann", "signup");
        const fault = failed.ok ? undefined : failed.fault;
        const wire = JSON.stringify([fault, fault && error.toJson(fault), fault?.message, String(fault)]);

        expect(errorsOf(nested, { a: [{ b: "x" }, { b: 1 }] })).toEqual({ "a.1.b": ["type:string"] });
        expect([errorsOf(validate.string().check(validate.refine(() => false)), "x"), errorsOf(validate.string().check(validate.refine(() => false, "")), "x"), errorsOf(validate.custom(() => false), "x"), errorsOf(validate.string().check(validate.minLength(2), validate.minLength(2)), "x")]).toEqual([{ _: ["invalid"] }, { _: ["invalid"] }, { _: ["invalid"] }, { _: ["min_length:2"] }]);
        expect(validate.issuesOf([{ code: "custom", message: "", path: [] }, { code: "custom", message: "", path: [] }, { code: "custom", message: "taken", path: ["a", 0, "b"] }, { code: "custom", message: "odd", path: ["a", { key: "k" }] }] as never)).toEqual({ _: ["invalid"], "a.0.b": ["taken"], "a.*": ["odd"] });
        expect([errorsOf(validate.number().check(validate.multipleOf(3)), 4), errorsOf(validate.union([validate.string(), validate.number()]), true), errorsOf(validate.record(validate.string().check(validate.minLength(2)), validate.number()), { b: 1 })]).toEqual([{ _: ["step:3"] }, { _: ["invalid"] }, { b: ["invalid_key"] }]);
        expect([errorsOf(validate.date().check(validate.gte(new Date(10))), new Date(5)), errorsOf(validate.int(), "x"), errorsOf(validate.int(), 1.5), errorsOf(validate.int(), undefined)]).toEqual([{ _: ["min:10"] }, { _: ["type:number"] }, { _: ["type:int"] }, { _: ["required"] }]);
        expect([fault?.code, fault?.status, fault?.reason, fault?.message, fault?.errors]).toEqual(["validation", 422, "login", "The given data is invalid", { secret: ["type:number"], other: ["unknown"] }]);
        expect([wire.includes("hunter2"), wire.includes("leak-me")]).toEqual([false, false]);
        expect([free.ok && free.value, !held.ok && [held.fault.code, held.fault.reason, held.fault.errors]]).toEqual(["bob", ["validation", "signup", { _: ["taken"] }]]);
        expect(await validate.assertAsync(taken, "bob")).toBe("bob");
        expect(await validate.assertAsync(taken, "ann", "signup").then(() => undefined, ( failure: unknown ) => refusal(() => { throw failure; }))).toEqual(["validation", "signup", "The given data is invalid", { _: ["taken"] }]);
        expect(() => validate.check(taken, "bob")).toThrow("Encountered Promise during synchronous parse");
        expect(refusal(() => validate.assert(validate.int(), "x", "age"))).toEqual(["validation", "age", "The given data is invalid", { _: ["type:number"] }]);
        const phone = validate.format("phone");
        const otp = validate.format("otp", 4);

        expect([phone === validate.format("phone"), otp === validate.format("otp", 4), otp === validate.format("otp", 6), refusal(() => validate.format(""))]).toEqual([true, true, false, ["thrown", "RangeError: not a format"]]);

    });
    it("the door's number, text and collection checks answer by the same codes", () => {

        const shape = validate.discriminatedUnion("kind", [validate.object({ kind: validate.literal("a"), n: validate.number() }), validate.object({ kind: validate.literal("b"), s: validate.string() })]);
        const few = validate.set(validate.number()).check(validate.minSize(1), validate.maxSize(3));
        const two = validate.map(validate.string(), validate.number()).check(validate.size(2));
        const signed = ( check: Parameters<ReturnType<typeof validate.number>["check"]>[0], given: number ): unknown => errorsOf(validate.number().check(check), given)?._ ?? "ok";

        expect([signed(validate.positive(), 1), signed(validate.positive(), 0), signed(validate.nonnegative(), 0), signed(validate.nonnegative(), -1), signed(validate.negative(), -1), signed(validate.negative(), 0), signed(validate.nonpositive(), 0), signed(validate.nonpositive(), 1)]).toEqual(["ok", ["gt:0"], "ok", ["min:0"], "ok", ["lt:0"], "ok", ["max:0"]]);
        expect([signed(validate.multipleOf(5), 10), signed(validate.multipleOf(5), 7), signed(validate.multipleOf(0.5), 1.5)]).toEqual(["ok", ["step:5"], "ok"]);
        expect(["yes", "0", "maybe", true].map(( given ) => read(validate.stringbool(), given))).toEqual([true, false, { _: ["in"] }, { _: ["type:string"] }]);
        expect([errorsOf(shape, { kind: "a", n: 1 }), errorsOf(shape, { kind: "b", s: 1 }), errorsOf(shape, { kind: "c" }), errorsOf(shape, {})]).toEqual([undefined, { s: ["type:string"] }, { kind: ["invalid"] }, { kind: ["invalid"] }]);
        expect(["00:1A:2B:3C:4D:5E", "00-1A-2B-3C-4D-5E", "001A2B3C4D5E"].map(( given ) => read(validate.mac(), given))).toEqual(["00:1A:2B:3C:4D:5E", { _: ["mac"] }, { _: ["mac"] }]);
        expect([new Set(), new Set([1]), new Set([1, 2, 3]), new Set([1, 2, 3, 4])].map(( given ) => errorsOf(few, given)?._ ?? "ok")).toEqual([["min_length:1"], "ok", "ok", ["max_length:3"]]);
        expect([new Map(), new Map([["a", 1]]), new Map([["a", 1], ["b", 2]]), new Map([["a", 1], ["b", 2], ["c", 3]])].map(( given ) => errorsOf(two, given)?._ ?? "ok")).toEqual([["min_length:2"], ["min_length:2"], "ok", ["max_length:2"]]);
        expect([validate.field(few), validate.field(two)].map(( found ) => [found.kind, found.min, found.max])).toEqual([["set", 1, 3], ["map", 2, 2]]);

    });
    it("field describes nested shapes, wrappers and the facts a stamp carries", () => {

        const stamped = validate.field(validate.string().check(validate.stamp({ min: 1, max: 2, step: 3, values: ["a"], pattern: /a/ })), "code");
        const book = validate.rulebook({ kind: "required|in:a,b", code: "regex:/^[a-z]+$/", pin: "otp:4", on: "date", n: "integer|multiple_of:5|gt:0|lt:10" });

        expect(validate.field(validate.object({ a: validate.string(), b: validate.optional(validate.array(validate.int())) }), "row")).toEqual({ name: "row", kind: "object", required: true, fields: [{ name: "a", kind: "string", required: true }, { name: "b", kind: "array", required: false, optional: true, item: { name: "b", kind: "number", required: true, format: "safeint" } }] });
        expect(validate.field(validate.tuple([validate.string(), validate.number()]), "pair")).toEqual({ name: "pair", kind: "tuple", required: true, fields: [{ name: "0", kind: "string", required: true }, { name: "1", kind: "number", required: true }] });
        expect(validate.field(validate.union([validate.string(), validate.number()]), "either")).toEqual({ name: "either", kind: "union", required: true, variants: [{ name: "either", kind: "string", required: true }, { name: "either", kind: "number", required: true }] });
        expect(validate.field(validate.record(validate.string(), validate.boolean()), "flags")).toEqual({ name: "flags", kind: "record", required: true, item: { name: "flags", kind: "boolean", required: true } });
        expect(validate.field(validate.nullable(validate.string().check(validate.regex(/^a+$/))), "note")).toEqual({ name: "note", kind: "string", required: false, nullable: true, pattern: /^a+$/ });
        expect([validate.field(validate._default(validate.string(), "x"), "mode"), validate.field(validate.catch(validate.number(), 0), "count")]).toEqual([{ name: "mode", kind: "string", required: false, optional: true }, { name: "count", kind: "number", required: false, optional: true }]);
        expect([validate.field(validate.literal("on"), "lit"), validate.field(validate.enum(["a", "b"]), "pick")]).toEqual([{ name: "lit", kind: "literal", required: true, values: ["on"], options: ["on"] }, { name: "pick", kind: "enum", required: true, values: ["a", "b"], options: ["a", "b"] }]);
        expect(stamped).toEqual({ name: "code", kind: "string", required: true, min: 1, max: 2, step: 3, values: ["a"], options: ["a"], pattern: /a/ });
        expect(validate.string().check(validate.stamp({ min: 5 })).safeParse("a").success).toBe(true);
        expect(validate.fields(book)).toEqual([
            { name: "kind", kind: "string", required: true, values: ["a", "b"], options: ["a", "b"] },
            { name: "code", kind: "string", required: false, optional: true, pattern: /^[a-z]+$/ },
            { name: "pin", kind: "string", required: false, optional: true, format: "otp", min: 4, max: 4 },
            { name: "on", kind: "string", required: false, optional: true, format: "date" },
            { name: "n", kind: "number", required: false, optional: true, format: "safeint", step: 5, min: 1, max: 9 },
        ]);

    });
});
