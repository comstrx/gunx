import { describe, expect, test as it } from "bun:test";
import * as fake from "engine/fake";
import * as validate from "engine/validate";
import * as fc from "fast-check";

type Leaf = { kind: "string"; min?: number | undefined; max?: number | undefined; pattern?: string | undefined } | { kind: "int"; min?: number | undefined; max?: number | undefined } | { kind: "number"; min?: number | undefined; max?: number | undefined; step?: number | undefined } | { kind: "boolean" } | { kind: "enum"; values: string[] } | { kind: "date" };
type Node = Leaf | { kind: "array"; item: Node; min?: number | undefined; max?: number | undefined } | { kind: "object"; fields: [string, Node][] } | { kind: "optional"; inner: Node } | { kind: "nullable"; inner: Node } | { kind: "union"; variants: Node[] } | { kind: "tuple"; parts: Node[] } | { kind: "record"; item: Node };

const names = ["name", "email", "age", "price", "qty", "created_at", "city", "slug", "note", "lat", "x", "status"] as const;
const leaf: fc.Arbitrary<Leaf> = fc.oneof(
    fc.record({ kind: fc.constant("string" as const), min: fc.option(fc.integer({ min: 0, max: 12 }), { nil: undefined }), max: fc.option(fc.integer({ min: 1, max: 40 }), { nil: undefined }), pattern: fc.option(fc.constantFrom("^[a-z]{3,6}$", "^[A-Z]\\d{2}$", "^(?:ab|cd)+$", "^x?y*$"), { nil: undefined }) }, { requiredKeys: ["kind"] }).map(( given ) => (given.pattern !== undefined ? { kind: given.kind, pattern: given.pattern } : given.min !== undefined && given.max !== undefined && given.max < given.min ? { ...given, max: given.min } : given)),
    fc.record({ kind: fc.constant("int" as const), min: fc.option(fc.integer({ min: -50, max: 50 }), { nil: undefined }), max: fc.option(fc.integer({ min: -50, max: 200 }), { nil: undefined }) }, { requiredKeys: ["kind"] }).map(( given ) => (given.min !== undefined && given.max !== undefined && given.max < given.min ? { ...given, max: given.min } : given)),
    fc.record({ kind: fc.constant("number" as const), min: fc.option(fc.integer({ min: -50, max: 50 }), { nil: undefined }), max: fc.option(fc.integer({ min: -50, max: 200 }), { nil: undefined }), step: fc.option(fc.constantFrom(0.5, 0.25, 2, 0.1), { nil: undefined }) }, { requiredKeys: ["kind"] }).map(( given ) => {

        const step = given.step ?? 1;
        const min = given.min === undefined ? undefined : Math.ceil(given.min / step) * step;
        const max = given.max === undefined ? undefined : Math.max(min ?? Number.NEGATIVE_INFINITY, Math.floor(given.max / step) * step);

        return { ...given, min, max };

    }),
    fc.constant<Leaf>({ kind: "boolean" }),
    fc.record({ kind: fc.constant("enum" as const), values: fc.array(fc.constantFrom("a", "b", "c"), { minLength: 1, maxLength: 3 }).map(( values ) => [...new Set(values)]) }),
    fc.constant<Leaf>({ kind: "date" }),
);
const node: fc.Arbitrary<Node> = fc.letrec<{ node: Node }>(( tie ) => ({
    node: fc.oneof({ depthSize: "small", maxDepth: 3 },
        { weight: 6, arbitrary: leaf },
        { weight: 2, arbitrary: fc.record({ kind: fc.constant("array" as const), item: tie("node"), min: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined }), max: fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }) }, { requiredKeys: ["kind", "item"] }).map(( given ) => (given.min !== undefined && given.max !== undefined && given.max < given.min ? { ...given, max: given.min } : given)) },
        { weight: 2, arbitrary: fc.record({ kind: fc.constant("object" as const), fields: fc.uniqueArray(fc.tuple(fc.constantFrom(...names), tie("node")), { maxLength: 4, selector: ( pair ) => pair[0] }) }) },
        { weight: 1, arbitrary: fc.record({ kind: fc.constant("optional" as const), inner: tie("node") }) },
        { weight: 1, arbitrary: fc.record({ kind: fc.constant("nullable" as const), inner: tie("node") }) },
        { weight: 1, arbitrary: fc.record({ kind: fc.constant("union" as const), variants: fc.array(tie("node"), { minLength: 1, maxLength: 3 }) }) },
        { weight: 1, arbitrary: fc.record({ kind: fc.constant("tuple" as const), parts: fc.array(tie("node"), { minLength: 1, maxLength: 3 }) }) },
        { weight: 1, arbitrary: fc.record({ kind: fc.constant("record" as const), item: tie("node") }) },
    ),
})).node;

function build ( given: Node ): validate.Schema {

    switch ( given.kind ) {
        case "string": {

            let made = validate.string();

            if ( given.pattern !== undefined ) made = made.check(validate.regex(new RegExp(given.pattern)));
            if ( given.min !== undefined ) made = made.check(validate.minLength(given.min));
            if ( given.max !== undefined ) made = made.check(validate.maxLength(given.max));

            return made;

        }
        case "int": {

            let made = validate.int();

            if ( given.min !== undefined ) made = made.check(validate.gte(given.min));
            if ( given.max !== undefined ) made = made.check(validate.lte(given.max));

            return made;

        }
        case "number": {

            let made = validate.number();

            if ( given.min !== undefined ) made = made.check(validate.gte(given.min));
            if ( given.max !== undefined ) made = made.check(validate.lte(given.max));
            if ( given.step !== undefined ) made = made.check(validate.multipleOf(given.step));

            return made;

        }
        case "boolean": return validate.boolean();
        case "enum": return validate.enum(given.values);
        case "date": return validate.date();
        case "array": {

            let made = validate.array(build(given.item));

            if ( given.min !== undefined ) made = made.check(validate.minLength(given.min));
            if ( given.max !== undefined ) made = made.check(validate.maxLength(given.max));

            return made;

        }
        case "object": return validate.object(Object.fromEntries(given.fields.map(([name, part]) => [name, build(part)])));
        case "optional": return validate.optional(build(given.inner));
        case "nullable": return validate.nullable(build(given.inner));
        case "union": return validate.union(given.variants.map(build));
        case "tuple": return validate.tuple(given.parts.map(build) as [validate.Schema, ...validate.Schema[]]);
        default: return validate.record(validate.string(), build(given.item));
    }

}

describe("fuzz fake", () => {

    it("from satisfies any schema it can read, and one seed replays it", () => {

        fc.assert(fc.property(node, fc.string({ minLength: 1, maxLength: 8 }), ( shape, seed ) => {

            const schema = build(shape);
            const made = fake.create(seed, { now: Date.UTC(2026, 0, 1) }).from(schema);
            const again = fake.create(seed, { now: Date.UTC(2026, 0, 1) }).from(schema);
            const found = validate.check(schema, made);

            expect([shape, found.ok ? "ok" : JSON.stringify(found.fault.errors)]).toEqual([shape, "ok"]);
            expect(JSON.stringify(made, ( _, value: unknown ) => (typeof value === "bigint" ? String(value) : value))).toBe(JSON.stringify(again, ( _, value: unknown ) => (typeof value === "bigint" ? String(value) : value)));

        }), { numRuns: 1500 });

    });
    it("matching draws only strings the pattern accepts, over a generated grammar", () => {

        const piece = fc.oneof(
            fc.constantFrom("a", "b", "\\d", "\\w", "[a-c]", "[^x-z0-9]", "(?:ab|c)", "(x|yz)", "\\.", "\\-", "[A-F0-9]", "é", "."),
            fc.tuple(fc.constantFrom("a", "[0-9]", "(?:ab)", "[a-c]"), fc.constantFrom("", "?", "*", "+", "{2}", "{1,3}", "{2,}")).map(([atom, count]) => `${atom}${count}`),
        );
        const pattern = fc.array(piece, { minLength: 1, maxLength: 6 }).map(( parts ) => `^${parts.join("")}$`);

        fc.assert(fc.property(pattern, fc.string({ minLength: 1, maxLength: 6 }), ( source, seed ) => {

            const faker = fake.create(seed);
            const made = faker.matching(source);

            expect([source, made, new RegExp(source).test(made)]).toEqual([source, made, true]);
            expect(fake.create(seed).matching(source)).toBe(made);

        }), { numRuns: 3000 });

    });
    it("numbers, dates, picks and unique rows stay inside their bounds, and lists keep their members", () => {

        fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 6 }), fc.integer({ min: -100, max: 100 }), fc.integer({ min: 0, max: 100 }), fc.integer({ min: 1, max: 30 }), fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 9 }), ( seed, low, span, count, items ) => {

            const faker = fake.create(seed, { now: Date.UTC(2026, 5, 1) });
            const high = low + span;
            const whole = faker.integer(low, high);
            const real = faker.float(low, high, 3);
            const price = faker.price(1, 9);

            expect([Number.isInteger(whole), whole >= low && whole <= high, real >= low && real <= high, Number((real.toString().split(".")[1] ?? "").length) <= 3, price >= 1 && price <= 9]).toEqual([true, true, true, true, true]);
            expect(faker.many(count, ( index ) => index)).toEqual(Array.from({ length: count }, ( _, at ) => at));
            expect([...faker.shuffle(items)].sort(( a, b ) => a - b)).toEqual([...items].sort(( a, b ) => a - b));

            const picked = faker.pickMany(items, count);

            expect(picked.length).toBe(Math.min(count, items.length));

            for ( const one of picked ) expect(items).toContain(one);

            const distinct = new Set(items).size;
            const unique = faker.unique(Math.min(count, distinct), () => faker.pick(items));

            expect(new Set(unique).size).toBe(Math.min(count, distinct));

            const days = 1 + (span % 30);
            const past = faker.past(days).getTime();
            const future = faker.future(days).getTime();

            expect([past <= faker.now - 60_000 && past >= faker.now - days * 86_400_000, future >= faker.now + 60_000 && future <= faker.now + days * 86_400_000]).toEqual([true, true]);

            const youngest = span % 60;
            const born = new Date(faker.birthdate(youngest, youngest + 10)).getTime();

            expect(born <= faker.now - youngest * 31_557_600_000 && born >= faker.now - (youngest + 10) * 31_557_600_000 - 86_400_000).toBe(true);

            const point = faker.coordinates({ lat: low / 2, lng: low }, span);

            expect(Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180).toBe(true);

            const text = faker.text(count, count + span);

            expect(text.length >= count && text.length <= Math.min(count + span, count + 48)).toBe(true);
            expect(faker.digits(count)).toMatch(new RegExp(`^\\d{${count}}$`));

        }), { numRuns: 2000 });

    });

});
