import { describe, expect, test as it } from "bun:test";
import * as fake from "engine/fake";
import * as validate from "engine/validate";
import * as world from "engine/world";
import * as zod from "zod/mini";

describe("fake", () => {

    it("seeded fakers repeat and speak both languages", () => {

        const a = fake.create("seed", "en");
        const b = fake.create("seed", "en");
        const ar = fake.seeded("seed", "ar");

        expect(a.fullName()).toBe(b.fullName());
        expect(a.email()).toMatch(/^[a-z.]+\d+@[a-z.]+$/);
        expect(a.email("Omar Hassan")).toMatch(/^omar\.hassan\d+@/);
        expect(a.phone()).toMatch(/^\+20(10|11|12|15)\d{8}$/);
        expect(a.password()).toHaveLength(12);
        expect(a.address()).toMatch(/^\d+ \w+ St, /);
        expect(ar.address()).toContain("شارع");
        expect(ar.fullName().split(" ")).toHaveLength(2);
        expect(a.sentence(4).endsWith(".")).toBe(true);
        const spoken = a.sentence(4);

        expect(spoken[0]).toBe(spoken[0]?.toUpperCase());
        expect(a.paragraph(2).split(". ").length).toBeGreaterThanOrEqual(2);
        expect(a.title().split(" ")).toHaveLength(2);
        expect(a.slug()).toMatch(/^[a-z]+-[a-z]+$/);
        expect(a.url()).toMatch(/^https:\/\/[a-z.]+\/[a-z-]+$/);
        expect(a.image(100, 50)).toMatch(/\/100\/50$/);
        expect(a.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(a.id()).toHaveLength(10);
        expect(a.integer(1, 3) >= 1 && a.integer(1, 3) <= 3).toBe(true);
        expect(String(a.float(0, 1, 2)).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
        expect(typeof a.boolean()).toBe("boolean");
        expect(a.percent() <= 100).toBe(true);
        expect(a.price(10, 20) >= 10).toBe(true);
        expect(a.money("JPY").minor % 1).toBe(0);
        expect(a.money().currency).toBe("EGP");
        expect(a.date().getUTCFullYear() >= 2020).toBe(true);
        expect(a.past().getTime() < Date.now() && a.future().getTime() > Date.now()).toBe(true);
        expect(a.many(3, ( index ) => index)).toEqual([0, 1, 2]);
        expect(a.maybe(() => 1, 100)).toBe(1);
        expect(a.maybe(() => 1, 0)).toBeUndefined();
        expect(["pending", "active", "paused", "done", "failed"]).toContain(a.status());
        expect(a.color()).toMatch(/^#[0-9a-f]{6}$/);
        expect(a.records(2, ( index, faker ) => ({ index, name: faker.firstName() }))).toHaveLength(2);
        expect(a.pick(["x"])).toBe("x");
        expect(a.locale).toBe("en");

    });
    it("from builds a record that satisfies the schema", () => {

        const signup = validate.strictObject({
            email: validate.email(),
            name: validate.string().check(validate.minLength(2), validate.maxLength(20)),
            age: validate.int().check(validate.gte(18), validate.lte(60)),
            role: validate.enum(["admin", "user"]),
            tags: validate.array(validate.string()).check(validate.maxLength(2)),
            active: validate.boolean(),
            joined_at: validate.string(),
            website: validate.optional(validate.url()),
        });
        const faker = fake.create("schema");

        for ( let round = 0; round < 20; round += 1 ) {

            const made = faker.from(signup);

            expect(validate.check(signup, made).ok).toBe(true);
            expect(made.age >= 18 && made.age <= 60).toBe(true);
            expect(["admin", "user"]).toContain(made.role);

        }

    });
    it("from keeps a number inside an open bound, a whole one on the next whole number", () => {

        const shape = validate.strictObject({
            unit: validate.number().check(validate.gt(0), validate.lt(1)),
            narrow: validate.number().check(validate.gt(1), validate.lt(3), validate.multipleOf(0.5)),
            count: validate.int().check(validate.gt(5), validate.lt(9)),
            mixed: validate.number().check(validate.gte(2), validate.lt(2.5)),
            share: validate.number().check(validate.gte(0.2), validate.lte(0.8)),
            tight: validate.number().check(validate.gt(2), validate.lt(2.01)),
            lean_rate: validate.number().check(validate.gte(2), validate.lt(2.005)),
            pinned: validate.number().check(validate.gte(0.07), validate.lte(0.07), validate.multipleOf(0.01)),
        });
        const ruled = validate.rulebook({ stock: "required|integer|gt:0|lt:4", ratio: "required|numeric|gt:0|lte:1" });
        const faker = fake.create("open");

        for ( let round = 0; round < 60; round += 1 ) {

            const made = faker.from(shape);
            const row = faker.from(ruled);

            expect(validate.check(shape, made).ok).toBe(true);
            expect(validate.check(ruled, row).ok).toBe(true);
            expect(made.unit > 0 && made.unit < 1).toBe(true);
            expect([1.5, 2, 2.5]).toContain(made.narrow);
            expect([6, 7, 8]).toContain(made.count);
            expect(made.mixed >= 2 && made.mixed < 2.5).toBe(true);
            expect(made.share >= 0.2 && made.share <= 0.8).toBe(true);
            expect(made.tight > 2 && made.tight < 2.01).toBe(true);
            expect(made.lean_rate >= 2 && made.lean_rate < 2.005).toBe(true);
            expect(made.pinned).toBe(0.07);

        }

    });
    it("pools draw from the world when it is loaded and from a small list before", async () => {

        const faker = fake.create("pools");

        expect(faker.country()).toMatch(/^[A-Z]{2}$/);
        expect(faker.currency()).toMatch(/^[A-Z]{3}$/);
        expect(faker.language()).toMatch(/^[a-z]{2}$/);
        expect(faker.emoji().length).toBeGreaterThan(0);

        const next = faker.sequence("INV-", 7);

        expect([next(), next(), next()]).toEqual(["INV-7", "INV-8", "INV-9"]);
        await world.load("countries");
        expect(world.everyCountry().some(( country ) => country.code === fake.create("pools").country())).toBe(true);

    });
    it("doors refuse bad counts, durations, ages, sizes, locales, countries, choices and patterns", () => {

        const faker = fake.create("doors");
        const told = ( run: () => unknown ): string => {

            try {

                run();

                return "ok";

            } catch ( failure ) {

                return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

            }

        };

        expect([told(() => fake.create("x", "fr" as fake.Locale)), told(() => fake.create("x", { country: "US" as fake.Country })), told(() => fake.create("x", { now: Number.NaN })), told(() => faker.phone("US" as fake.Country))]).toEqual(["RangeError: not a locale", "RangeError: not a country", "RangeError: not a date", "RangeError: not a country"]);
        expect([told(() => faker.many(-1, () => 1)), told(() => faker.many(2.5, () => 1)), told(() => faker.many(1e9, () => 1)), told(() => faker.many(Number.NaN, () => 1)), told(() => faker.digits(0)), told(() => faker.words(0)), told(() => faker.pickMany([1], 2.5)), told(() => faker.unique(-1, () => 1))]).toEqual(["RangeError: not a count", "RangeError: not a count", "RangeError: not a count", "RangeError: not a count", "ok", "ok", "RangeError: not a count", "RangeError: not a count"]);
        expect([told(() => faker.past(-1)), told(() => faker.past(0)), told(() => faker.past(Number.NaN)), told(() => faker.future(40_000)), told(() => faker.birthdate(-1)), told(() => faker.birthdate(30, 20)), told(() => faker.birthdate(0, 131)), told(() => faker.image(0)), told(() => faker.image(100, 20_000)), told(() => faker.image(1.5))]).toEqual(["RangeError: not a duration", "RangeError: not a duration", "RangeError: not a duration", "RangeError: not a duration", "RangeError: not an age", "RangeError: not an age", "RangeError: not an age", "RangeError: not a size", "RangeError: not a size", "RangeError: not a size"]);
        expect([told(() => faker.pick([])), told(() => faker.weighted([{ item: 1, weight: 0 }])), told(() => faker.weighted([])), told(() => faker.file("exe")), told(() => faker.coordinates({ lat: 91, lng: 0 })), told(() => faker.coordinates(undefined, -1)), told(() => faker.coordinates(undefined, 1001)), told(() => faker.matching("(?=a)")), told(() => faker.matching("\\1")), told(() => faker.matching("(a{9999}){9999}")), told(() => faker.unique(5, () => 1))]).toEqual(["RangeError: not a choice", "RangeError: not a choice", "RangeError: not a choice", "RangeError: not a file", "RangeError: not a point", "RangeError: not a point", "RangeError: not a point", "RangeError: not a pattern", "RangeError: not a pattern", "RangeError: not a pattern", "RangeError: not unique"]);
        expect(faker.weighted([{ item: "a", weight: 0 }, { item: "b", weight: 1 }])).toBe("b");

    });
    it("one seed and one clock give one world: forks diverge by name, options carry through, and every value stays inside its promise", () => {

        const now = Date.UTC(2026, 10, 11, 12);
        const a = fake.create("world", { now, country: "SA" });
        const b = fake.create("world", { now, country: "SA" });
        const take = ( faker: fake.Faker ): unknown[] => [faker.person(), faker.email(), faker.phone(), faker.money("SAR"), faker.iso(), faker.plainDate(), faker.past(10).getTime(), faker.birthdate(), faker.coordinates(), faker.uuid(), faker.text(20, 40), faker.ip(6), faker.barcode(), faker.file("pdf"), faker.pickMany([1, 2, 3, 4], 2), faker.shuffle([1, 2, 3]), faker.matching("[a-c]{3}-\\d{2}")];

        expect(take(a)).toEqual(take(b));
        expect(take(a.fork("x"))).toEqual(take(b.fork("x")));
        expect(take(fake.create("world", { now, country: "SA" }).fork("x"))).not.toEqual(take(fake.create("world", { now, country: "SA" }).fork("y")));
        expect([a.now, a.home, a.locale, a.fork("z").now, a.fork("z").home]).toEqual([now, "SA", "en", now, "SA"]);
        expect(a.phone()).toMatch(/^\+966(50|53|54|55|56|58|59)\d{7}$/);
        expect([a.phone("EG"), a.phone("KW"), a.phone("QA"), a.phone("JO"), a.phone("AE")].map(( number ) => number.slice(0, 4))).toEqual(["+201", "+965", "+974", "+962", "+971"]);
        expect(a.email("Mona Zaki")).toMatch(/^mona\.zaki\d{1,2}@(example\.(com|net|org)|mail\.test|shop\.test)$/);
        expect(a.email("")).toMatch(/^[a-z]+\.[a-z]+\d{1,2}@/);
        expect(a.email("!!!")).toMatch(/^[a-z]+\.[a-z]+\d{1,2}@/);
        expect(fake.create("ar", "ar").email("منى زكي")).toMatch(/^[a-z]+\.[a-z]+\d{1,2}@/);
        expect(a.username()).toMatch(/^[a-z]+_[a-z]+\d{1,3}$/);
        expect(a.ip()).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/);
        expect(a.ip(6)).toMatch(/^2001:db8(:[0-9a-f]{4}){6}$/);
        expect(a.mac()).toMatch(/^02(:[0-9a-f]{2}){5}$/);
        expect(a.barcode()).toMatch(/^\d{13}$/);

        const code = a.barcode();
        const sum = [...code.slice(0, 12)].reduce(( total, digit, at ) => total + Number(digit) * (at % 2 === 0 ? 1 : 3), 0);

        expect(Number(code[12])).toBe((10 - (sum % 10)) % 10);
        expect(a.sku()).toMatch(/^[A-Z]{3}-\d{5}$/);
        expect(a.postcode()).toMatch(/^\d{5}$/);
        expect(a.digits(4)).toMatch(/^\d{4}$/);
        expect([a.rating() >= 1 && a.rating() <= 5, a.rating(10) <= 10, a.rating(0)]).toEqual([true, true, 1]);
        expect(a.timezone()).toMatch(/^[A-Za-z_]+(\/[A-Za-z_]+)?$/);

        const text = a.text(10, 12);

        expect([text.length >= 10 && text.length <= 12, text.endsWith(" "), a.text(5, 5).length, a.text(200).length <= 248]).toEqual([true, false, 5, true]);
        expect(a.past(1).getTime() <= now - 60_000 && a.past(1).getTime() >= now - 86_400_000).toBe(true);
        expect(a.future(1).getTime() >= now + 60_000 && a.future(1).getTime() <= now + 86_400_000).toBe(true);

        const born = Number(a.birthdate(18, 19).slice(0, 4));

        expect(born === 2007 || born === 2008).toBe(true);
        expect(a.iso(now - 1000, now)).toMatch(/^2026-11-11T1[12]:/);
        expect(a.plainDate(now, now)).toBe("2026-11-11");
        expect([a.date(now, now).getTime(), a.date().getTime() >= Date.UTC(2020, 0, 1) && a.date().getTime() <= now]).toEqual([now, true]);

        const point = a.coordinates({ lat: 24.7, lng: 46.7 }, 5);
        const edge = a.coordinates({ lat: 89.9, lng: 179.9 }, 500);

        expect([Math.abs(point.lat - 24.7) < 0.06, Math.abs(point.lng - 46.7) < 0.06, edge.lat <= 90, edge.lng >= -180 && edge.lng <= 180]).toEqual([true, true, true, true]);
        expect(a.file()).toMatchObject({ name: expect.stringMatching(/^[a-z]+-[a-z]+\.(jpg|png|webp|pdf|csv|txt)$/), type: expect.stringMatching(/\//), size: expect.any(Number) });
        expect(a.file(".PNG")).toMatchObject({ type: "image/png" });
        expect(a.unique(2, () => a.integer(0, 1), ( item ) => item % 2)).toHaveLength(2);
        expect(a.unique(30, () => a.integer(0, 100)).length).toBe(30);
        expect(new Set(a.unique(30, () => a.integer(0, 100))).size).toBe(30);
        expect(a.pickMany([1, 2, 3], 5).length).toBe(3);
        expect([...a.shuffle([1, 2, 3, 4])].sort()).toEqual([1, 2, 3, 4]);
        expect(a.maybe(() => 1, 50) === 1 || a.maybe(() => 1, 50) === undefined).toBe(true);

        const custom = fake.create("world", { now, images: ( seed, width, height ) => `/img/${seed}/${width}x${height}`, formats: { email: () => "forced@example.com" } });

        expect(custom.image(10, 20)).toMatch(/^\/img\/[0-9a-f]{6}\/10x20$/);
        expect(a.image()).toMatch(/^https:\/\/picsum\.photos\/seed\/[0-9a-f]{6}\/640\/480$/);
        expect(custom.from(validate.object({ email: validate.email() })).email).toBe("forced@example.com");

    });
    it("from shapes every schema kind, honours overrides by path and star, and refuses a broken override", () => {

        const faker = fake.create("kinds", { now: Date.UTC(2026, 0, 1) });
        const wide = validate.object({
            id: validate.uuid(),
            handle: validate.string().check(validate.regex(/^@[a-z]{3,8}$/)),
            tags: validate.array(validate.string().check(validate.minLength(2))).check(validate.minLength(1), validate.maxLength(3)),
            pair: validate.tuple([validate.string(), validate.int()]),
            meta: validate.record(validate.string(), validate.number()),
            kind: validate.union([validate.literal("a"), validate.literal("b"), validate.null()]),
            choice: validate.enum(["x", "y"]),
            maybe: validate.optional(validate.boolean()),
            none: validate.nullable(validate.string()),
            when: validate.date(),
            flags: validate.set(validate.string()),
            table: validate.map(validate.string(), validate.number()),
            price: validate.number().check(validate.gte(1), validate.lte(9), validate.multipleOf(0.5)),
            lat: validate.number(),
            lng: validate.number(),
            age: validate.int(),
            year: validate.int(),
            email: validate.string(),
            created_at: validate.string(),
            nested: validate.object({ items: validate.array(validate.object({ sku: validate.string(), qty: validate.int().check(validate.gte(1)) })).check(validate.minLength(2), validate.maxLength(2)) }),
        });

        for ( let round = 0; round < 30; round += 1 ) {

            const made = faker.from(wide);

            expect(validate.check(wide, made).ok).toBe(true);
            expect(made.handle).toMatch(/^@[a-z]{3,8}$/);
            expect(made.tags.length >= 1 && made.tags.length <= 3).toBe(true);
            expect([typeof made.pair[0], Number.isInteger(made.pair[1]), made.when instanceof Date, made.flags instanceof Set, made.table instanceof Map]).toEqual(["string", true, true, true, true]);
            expect(["a", "b", null]).toContain(made.kind);
            expect([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 1, 1.5]).toContain(made.price);
            expect(Math.abs(made.lat) <= 90 && Math.abs(made.lng) <= 180).toBe(true);
            expect(made.age >= 18 && made.age <= 70 && made.year >= 2000 && made.year <= 2030).toBe(true);
            expect(made.email).toMatch(/@/);
            expect(made.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(made.nested.items).toHaveLength(2);

        }

        const forced = faker.from(wide, { "nested.items.*.sku": "FIXED", "pair.0": "first", choice: () => "y", "tags.1": "second" });

        expect([forced.nested.items.map(( item ) => item.sku), forced.pair[0], forced.choice]).toEqual([["FIXED", "FIXED"], "first", "y"]);
        expect(forced.tags[1] === "second" || forced.tags.length < 2).toBe(true);
        expect(() => faker.from(wide, { age: "old" })).toThrow();
        expect(faker.payload(validate.object({ when: validate.date() }))).toMatchObject({ when: expect.any(Date) });

        const strings = validate.object({ short: validate.string().check(validate.maxLength(3)), long: validate.string().check(validate.minLength(40)), exact: validate.string().check(validate.minLength(7), validate.maxLength(7)), slug: validate.slug().check(validate.maxLength(6)), key: validate.string().check(validate.regex(/^[a-z]{2}$/), validate.minLength(2)) });

        for ( let round = 0; round < 30; round += 1 ) expect(validate.check(strings, faker.from(strings)).ok).toBe(true);

        const nullable = validate.object({ a: validate.nullable(validate.string()), b: validate.optional(validate.string()) });
        const seen = { nulls: 0, missing: 0 };

        for ( let round = 0; round < 200; round += 1 ) {

            const made = faker.from(nullable);

            if ( made.a === null ) seen.nulls += 1;
            if ( made.b === undefined ) seen.missing += 1;

        }

        expect([seen.nulls > 5 && seen.nulls < 60, seen.missing > 20 && seen.missing < 90]).toEqual([true, true]);
        expect([faker.from(validate.string().check(validate.regex(/^[A-Z]{2}\d{3}$/))), faker.from(validate.array(validate.int()).check(validate.length(3))).length, faker.from(validate.literal(7)), faker.from(validate.null())]).toEqual([expect.stringMatching(/^[A-Z]{2}\d{3}$/), 3, 7, null]);

    });
    it("matching draws strings the pattern accepts across the supported grammar", () => {

        const faker = fake.create("patterns");
        const patterns = [/^[a-z]{3}$/, /^\d{2,4}$/, /^(?:ab|cd)+$/, /^x?y*z+$/, /^[^0-9]{5}$/, /^\w{1,3}\s\W$/, /^A\x42[C-E]$/, /^(?<name>[a-c])-(?:\1|z)?$/, /^a.c$/, /^[a-f0-9]{8}-[a-f0-9]{4}$/, /^\+20(10|11|12|15)\d{8}$/, /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/, /^[-_.a-z]{2,}$/, /^\]\[$/, /^\.\*\+\?$/, /^a{3}$/, /^a{2,}$/, /^$/];

        for ( const pattern of patterns ) {

            if ( pattern.source.includes("\\1") ) {

                expect(() => faker.matching(pattern)).toThrow(new RangeError("not a pattern"));

                continue;

            }

            for ( let round = 0; round < 25; round += 1 ) {

                const drawn = faker.matching(pattern);

                expect([pattern.source, drawn, pattern.test(drawn)]).toEqual([pattern.source, drawn, true]);

            }

        }

        expect(faker.matching("a{40}").length).toBe(40);
        expect(faker.matching("a{3,}").length >= 3 && faker.matching("a{3,}").length <= 6).toBe(true);
        expect(fake.create("same").matching("[a-z]{5}")).toBe(fake.create("same").matching("[a-z]{5}"));

    });
    it("survivors: minute floors, wrapped and clamped coordinates, letter-led handles, exact text, pattern spreads and refusals, union picks, whole bounds, pattern retries", () => {

        const now = Date.UTC(2026, 10, 11, 12);
        const a = fake.create("survivors", { now });
        const told = ( run: () => unknown ): string => {

            try {

                run();

                return "ok";

            } catch ( failure ) {

                return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

            }

        };

        expect(a.past(0.0001).getTime()).toBe(now - 60_000);
        expect(a.future(0.0001).getTime()).toBe(now + 60_000);

        for ( let turn = 0; turn < 50; turn += 1 ) {

            const edge = a.coordinates({ lat: 89.9, lng: 179.9 }, 1000);

            expect([edge.lat <= 90 && edge.lat >= -90, edge.lng >= -180 && edge.lng <= 180]).toEqual([true, true]);

        }

        expect(a.email("123")).toMatch(/^[a-z]+\.[a-z]+\d{1,2}@/);
        expect(a.email("a--b")).toMatch(/^[a-z]+\.[a-z]+\d{1,2}@/);

        for ( let size = 1; size <= 60; size += 1 ) {

            const text = a.text(size, size);

            expect([size, text.length, text.endsWith(" ")]).toEqual([size, size, false]);

        }

        expect(Math.max(...Array.from({ length: 50 }, () => a.matching("a{2,100}").length))).toBeLessThanOrEqual(34);
        expect([told(() => a.matching("[a-\\uffff]")), told(() => a.matching("[]")), told(() => a.matching("a{5,2}")), told(() => a.matching("a)")), told(() => a.matching("[z-a]"))]).toEqual(Array.from({ length: 5 }, () => "RangeError: not a pattern"));
        expect(new Set(Array.from({ length: 40 }, () => a.matching("a|b"))).size).toBe(2);

        const either = validate.union([validate.null(), validate.string()]);

        for ( let turn = 0; turn < 20; turn += 1 ) expect(typeof a.from(either)).toBe("string");

        const narrow = validate.object({ n: validate.int().check(validate.gte(1.5), validate.lte(2.5)) });

        for ( let turn = 0; turn < 10; turn += 1 ) expect(a.from(narrow).n).toBe(2);

        const long = validate.string().check(validate.regex(/^a+$/), validate.minLength(3));

        for ( let turn = 0; turn < 30; turn += 1 ) expect(a.from(long).length >= 3).toBe(true);

    });
    it("every string format is faked as a payload its schema accepts, and from is that payload parsed", () => {

        const faker = fake.create("formats", { now: Date.UTC(2026, 0, 1) });
        const formats: [string, validate.Schema][] = [
            ["email", validate.email()], ["url", validate.url()], ["uuid", validate.uuid()], ["ulid", validate.ulid()], ["mac", validate.mac()], ["ip", validate.ip()], ["phone", validate.phone()], ["slug", validate.slug()], ["key", validate.key()],
            ["password", validate.password()], ["otp", validate.otp()], ["currency", validate.currency()], ["locale", validate.locale()], ["timezone", validate.timezone()], ["hex_color", validate.hexColor()], ["date", validate.plainDate()], ["money", validate.money()],
            ["guid", zod.guid()], ["nanoid", zod.nanoid()], ["cuid", zod.cuid()], ["cuid2", zod.cuid2()], ["xid", zod.xid()], ["ksuid", zod.ksuid()], ["base64", zod.base64()], ["base64url", zod.base64url()], ["ipv4", zod.ipv4()], ["ipv6", zod.ipv6()],
            ["cidrv4", zod.cidrv4()], ["cidrv6", zod.cidrv6()], ["e164", zod.e164()], ["hostname", zod.hostname()], ["emoji", zod.emoji()], ["datetime", zod.iso.datetime()], ["time", zod.iso.time()], ["duration", zod.iso.duration()],
        ];

        for ( const [name, schema] of formats ) {

            const sent = faker.payload(schema);
            const checked = validate.check(schema, sent);

            expect([name, validate.field(schema).format, checked.ok]).toEqual([name, name, true]);
            expect(fake.create(name, { now: Date.UTC(2026, 0, 1) }).payload(schema)).toEqual(fake.create(name, { now: Date.UTC(2026, 0, 1) }).payload(schema));
            expect(validate.check(schema, faker.from(schema)).ok || name === "money").toBe(true);

        }

        expect(faker.from(validate.money())).toEqual({ minor: expect.any(Number), currency: expect.any(String) });
        expect(validate.check(validate.file(), faker.payload(validate.file())).ok).toBe(true);

    });
    it("field names steer plain strings toward their meaning, within the declared bounds counted in code points like the validator", () => {

        const glyph = String.fromCodePoint(0x1f4a1);
        const tight = validate.object({ emoji: validate.string().check(validate.minLength(2), validate.maxLength(3)) });

        for ( const seed of ["a", "b", "c", "d", "e"] ) {

            const made = fake.create(seed).payload(tight) as { emoji: string };

            expect([validate.check(tight, made).ok, Array.from(made.emoji).length >= 2, made.emoji.isWellFormed()]).toEqual([true, true, true]);

        }

        expect(validate.check(validate.string().check(validate.minLength(2)), glyph).ok).toBe(false);

        const faker = fake.create("names", { now: Date.UTC(2026, 0, 1) });
        const names = ["email", "phone", "avatar", "website", "guid", "id", "first_name", "last_name", "username", "secret", "pin", "sku", "barcode", "company", "product", "city", "country", "currency", "street", "address", "zip", "timezone", "language", "colour", "slug", "hostname", "ip_address", "status", "emoji", "birthday", "created_at", "summary", "tag", "headline", "name", "zzz"];
        const shape = validate.object(Object.fromEntries(names.map(( name ) => [name, validate.string().check(validate.minLength(2), validate.maxLength(120))])));
        const made = faker.from(shape) as Record<string, string>;

        for ( const name of names ) expect([name, typeof made[name], (made[name] ?? "").length >= 2 && (made[name] ?? "").length <= 120]).toEqual([name, "string", true]);

        expect([made.email?.includes("@"), made.website?.startsWith("http"), /^\+?\d[\d\s-]*$/.test(made.phone ?? ""), /^\d{6}$/.test(made.pin ?? ""), /^\d{4}-\d{2}-\d{2}$/.test(made.birthday ?? ""), Number.isFinite(Date.parse(made.created_at ?? "")), /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(made.slug ?? "")]).toEqual([true, true, true, true, true, true, true]);
        expect(fake.create("names", { now: Date.UTC(2026, 0, 1) }).from(shape)).toEqual(made);

    });
});
