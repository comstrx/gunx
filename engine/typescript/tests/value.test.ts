import { describe, expect, test as it } from "bun:test";
import * as rand from "engine/rand";
import * as value from "engine/value";

describe("value", () => {

    it("integer reads whole text in any digits and never guesses", () => {

        expect(value.integer("42")).toBe(42);
        expect(value.integer(" ١٢ ")).toBe(12);
        expect(value.integer("۱۲")).toBe(12);
        expect(value.integer("-7")).toBe(-7);
        expect(value.integer("+7")).toBe(7);
        expect(value.integer("1,000")).toBe(1000);
        expect(value.integer("12,34,567")).toBe(1_234_567);
        expect(value.integer("1 000 000")).toBe(1_000_000);
        expect(value.integer("1_000")).toBe(1000);
        expect(value.integer("١٬٠٠٠")).toBe(1000);
        expect(value.integer(7n)).toBe(7);
        expect(value.integer(4.7)).toBe(4);
        expect(value.integer(-4.7)).toBe(-4);
        expect(value.integer(-0.4)).toBe(0);
        expect(value.integer("-0")).toBe(0);
        expect(value.integer("\u061c-\u0661\u066c\u0660\u0660\u0660")).toBe(-1000);
        expect(value.integer("\u22127")).toBe(-7);
        expect(value.integer((-1_234_567).toLocaleString("ar-EG"))).toBe(-1_234_567);
        expect(value.integer("x", 9)).toBe(9);
        expect(value.integer(null, 0)).toBe(0);

        for ( const given of ["4.7", "1,00", "12,5", ",5", "1,,000", "1,2345", "", " ", "abc", "1e3", "0x10", "99999999999999999999", "1".repeat(300), true, null, undefined, {}, [], Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53] ) expect(value.integer(given)).toBeUndefined();

    });
    it("number reads decimals, exponents and both decimal marks", () => {

        expect(value.number("1.5e3")).toBe(1500);
        expect(value.number("١٢٫٥")).toBe(12.5);
        expect(value.number("1,234.5")).toBe(1234.5);
        expect(value.number("-.5")).toBe(-0.5);
        expect(value.number("-0")).toBe(0);
        expect(value.number(-0)).toBe(0);
        expect(value.number("\u200f\u22121\u202f234.5")).toBe(-1234.5);
        expect(value.number("5.")).toBe(5);
        expect(value.number("2E-2")).toBe(0.02);
        expect(value.number(0.1)).toBe(0.1);
        expect(value.number(3n)).toBe(3);
        expect(value.number(Number.NaN, 1)).toBe(1);
        expect(value.number("abc", 0)).toBe(0);

        for ( const given of ["abc", "12,5", "1.5,000", "1.2.3", "Infinity", "NaN", "0x10", "--1", ".", "e5", "", "1e999", Number.POSITIVE_INFINITY, false, null, {}] ) expect(value.number(given)).toBeUndefined();

    });
    it("boolean, text, date and record answer or stay absent", () => {

        expect(value.boolean("yes") && value.boolean("نعم") && value.boolean(1) && value.boolean(" TRUE ") && value.boolean("On") && value.boolean("١")).toBe(true);
        expect(value.boolean("off") || value.boolean("لا") || value.boolean(0) || value.boolean("N") || value.boolean(false)).toBe(false);
        expect(value.boolean("maybe")).toBeUndefined();
        expect(value.boolean(2)).toBeUndefined();
        expect(value.boolean("", false)).toBe(false);
        expect(value.text("  a  ")).toBe("a");
        expect(value.text("   ")).toBeUndefined();
        expect(value.text("", "none")).toBe("none");
        expect(value.text(12)).toBe("12");
        expect(value.text(12n)).toBe("12");
        expect(value.text(false)).toBe("false");
        expect(value.text(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
        expect(value.text(Number.NaN)).toBeUndefined();
        expect(value.text({})).toBeUndefined();
        expect(value.text(null)).toBeUndefined();
        expect(value.date("2026-03-15")?.toISOString()).toBe("2026-03-15T00:00:00.000Z");
        expect(value.date("٢٠٢٦-٠٣-١٥")?.toISOString()).toBe("2026-03-15T00:00:00.000Z");
        expect(value.date("42")?.getTime()).toBe(42);
        expect(value.date(0)?.getTime()).toBe(0);
        expect(value.date("2026-02-30")).toBeUndefined();
        expect(value.date("nope")).toBeUndefined();
        expect(value.date(null)).toBeUndefined();
        expect(value.date(Number.NaN, new Date(5)).getTime()).toBe(5);
        expect(value.date(8.64e15)?.getTime()).toBe(8.64e15);
        expect(value.date(8.64e15 + 1)).toBeUndefined();
        expect(value.date(1e300)).toBeUndefined();
        expect(value.record({ a: 1 })).toEqual({ a: 1 });
        expect(value.record(' {"a":{"b":[1]}} ')).toEqual({ a: { b: [1] } });
        expect(value.record('{"__proto__":{"x":1},"a":1}')).toEqual({ a: 1 });
        expect(value.record("[1]")).toBeUndefined();
        expect(value.record("{broken")).toBeUndefined();
        expect(value.record(new Map())).toBeUndefined();
        expect(value.record(null, {})).toEqual({});

    });
    it("list reads sequences, sets, json arrays and separated text; listOf keeps what its item reads", () => {

        expect(value.list("a, b,,c\nd")).toEqual(["a", "b", "c", "d"]);
        expect(value.list("أ، ب")).toEqual(["أ", "ب"]);
        expect(value.list(["x", " y ", 3, null, "", false, Number.NaN, {}])).toEqual(["x", "y", "3", "false"]);
        expect(value.list(' ["a", 1, null, " b "] ')).toEqual(["a", "1", "b"]);
        expect(value.list("[broken, text")).toEqual(["[broken", "text"]);
        expect(value.list(new Set(["a", "b"]))).toEqual(["a", "b"]);
        expect(value.list("a|b|", "|")).toEqual(["a", "b"]);
        expect(value.list("a1b22c", /\d+/)).toEqual(["a", "b", "c"]);
        expect(value.list(5)).toEqual(["5"]);
        expect(value.list(null)).toEqual([]);
        expect(value.list("")).toEqual([]);
        expect(value.listOf("1, x, ٣, 4.5", ( word ) => value.integer(word))).toEqual([1, 3]);
        expect(value.listOf(["EGP", "nope", "usd"], value.currency)).toEqual(["EGP", "USD"] as value.CurrencyCode[]);
        expect(value.listOf("a;b", ( word ) => word.toUpperCase(), ";")).toEqual(["A", "B"]);

    });
    it("oneOf, scalar, kind and cast classify without coercing what is not canonical", () => {

        const sizes = ["small", "Large"] as const;

        expect(value.oneOf("small", sizes)).toBe("small");
        expect(value.oneOf(" LARGE ", sizes)).toBe("Large");
        expect(value.oneOf("huge", sizes)).toBeUndefined();
        expect(value.oneOf("huge", sizes, "small")).toBe("small");
        expect(value.oneOf(undefined, sizes)).toBeUndefined();
        expect(value.scalar("42")).toBe(42);
        expect(value.scalar("-1.5")).toBe(-1.5);
        expect(value.scalar("4.50")).toBe("4.50");
        expect(value.scalar("007")).toBe("007");
        expect(value.scalar("1e3")).toBe("1e3");
        expect(value.scalar("true")).toBe(true);
        expect(value.scalar("TRUE")).toBe("TRUE");
        expect(value.scalar(false)).toBe(false);
        expect(value.scalar(" word ")).toBe("word");

        for ( const given of ["null", "", "  ", null, undefined, Number.NaN, {}, []] ) expect(value.scalar(given)).toBeNull();

        expect(value.kind([])).toBe("list");
        expect(value.kind(new Set())).toBe("list");
        expect(value.kind({})).toBe("record");
        expect(value.kind(null)).toBe("null");
        expect(value.kind("")).toBe("null");
        expect(value.kind("false")).toBe("boolean");
        expect(value.kind("12")).toBe("integer");
        expect(value.kind(1.5)).toBe("number");
        expect(value.kind("2026-03-15")).toBe("date");
        expect(value.kind("2026-03-15T10:00:00Z")).toBe("date");
        expect(value.kind(new Date(0))).toBe("date");
        expect(value.kind("2026-13-45")).toBe("text");
        expect(value.kind("hello")).toBe("text");
        expect(value.cast("integer", "12")).toBe(12);
        expect(value.cast("number", "1.5")).toBe(1.5);
        expect(value.cast("boolean", "on")).toBe(true);
        expect(value.cast("text", 5)).toBe("5");
        expect(value.cast("date", "2026-03-15")?.getTime()).toBe(Date.UTC(2026, 2, 15));
        expect(value.cast("list", "a,b")).toEqual(["a", "b"]);
        expect(value.cast("record", '{"a":1}')).toEqual({ a: 1 });
        expect(value.cast("null", "")).toBeNull();
        expect(value.cast("null", "x")).toBeUndefined();
        expect(value.cast("integer", "x")).toBeUndefined();

        const samples: { [K in value.Kind]: unknown } = { null: "", boolean: "true", integer: "7", number: "7.5", date: "2026-03-15", text: "seven", list: ["7"], record: { seven: 7 } };
        const plain: value.Scalar[] = ["7", 7, true, null];

        for ( const [wanted, sample] of Object.entries(samples) as [value.Kind, unknown][] ) {

            expect(value.kind(sample), wanted).toBe(wanted);
            expect(value.cast(wanted, sample), wanted).toBeDefined();

        }

        expect(plain.map(( one ) => value.scalar(one))).toEqual([7, 7, true, null]);

    });
    it("email, url, slug and key come back canonical or not at all", () => {

        expect(value.email(" Ada@Example.COM ")).toBe("ada@example.com" as value.Email);
        expect(value.email("first.last+tag@sub.example.co")).toBe("first.last+tag@sub.example.co" as value.Email);

        for ( const given of ["a@b", "a..b@x.com", ".a@x.com", "a.@x.com", "a@x.com.", "a@-x.com", "a b@x.com", "a@x.c", "@x.com", `${"x".repeat(250)}@a.io`, 5, null, ""] ) expect(value.email(given)).toBeUndefined();

        expect(value.url(" https://Example.com/a b?q=1 ")).toBe("https://example.com/a%20b?q=1" as value.Url);
        expect(value.url("ftp://files.example")).toBeUndefined();
        expect(value.url("ftp://files.example", ["ftp"])).toBe("ftp://files.example/" as value.Url);

        for ( const given of ["javascript:alert(1)", "nope", "//example.com", "", `https://a.io/${"x".repeat(2048)}`, `https://a.io/${"\u00e9".repeat(400)}`, 7, null] ) expect(value.url(given)).toBeUndefined();

        expect(value.slug(" Hello-World-2 ")).toBe("hello-world-2" as value.Slug);
        expect(value.slug("abcdef", 3)).toBeUndefined();

        for ( const given of ["a--b", "a b", "-a", "a-", "", "a_b", null] ) expect(value.slug(given)).toBeUndefined();

        expect(value.key(" user_id ")).toBe("user_id" as value.Key);

        for ( const given of ["User", "1a", "a-b", "", "_a", "a".repeat(65), null] ) expect(value.key(given)).toBeUndefined();

        const typed: value.Typed<string, "email"> | undefined = value.email("a@b.co");

        expect(typed).toBe("a@b.co" as value.Email);

    });
    it("phone, otp, currency, locale and plainDate normalize what people type", () => {

        const canonical = "+201000000000" as value.Phone;

        expect(value.phone("0100 000 0000", "+20")).toBe(canonical);
        expect(value.phone("٠١٠٠٠٠٠٠٠٠٠", "20")).toBe(canonical);
        expect(value.phone("(010) 000-00000", "0020")).toBe(canonical);
        expect(value.phone("0020 100 000 0000", "+966")).toBe(canonical);
        expect(value.phone("+20 100 000 0000", "+966")).toBe(canonical);
        expect(value.phone("+20 100 000 0000")).toBe(canonical);
        expect(value.phone(201_000_000_000)).toBe(canonical);
        expect(value.patterns.phone.test(canonical)).toBe(true);

        for ( const given of ["100", "+0100000000", "0100 000 0000 0000 0000", "phone", "", null, "9".repeat(41)] ) expect(value.phone(given)).toBeUndefined();

        expect(value.phone("", "+20")).toBeUndefined();
        expect(value.otp("123 456")).toBe("123456" as value.Otp);
        expect(value.otp("١٢٣٤٥٦")).toBe("123456" as value.Otp);
        expect(value.otp("12-34", 4)).toBe("1234" as value.Otp);
        expect(value.otp(123_456)).toBe("123456" as value.Otp);

        for ( const given of ["12345", "1234567", "12345a", "", null] ) expect(value.otp(given)).toBeUndefined();

        expect(value.currency(" egp ")).toBe("EGP" as value.CurrencyCode);

        for ( const given of ["EG", "EGPX", "12A", "E P", "", null] ) expect(value.currency(given)).toBeUndefined();

        expect(value.locale("ar_eg")).toBe("ar-EG" as value.LocaleTag);
        expect(value.locale("EN")).toBe("en" as value.LocaleTag);
        expect(value.locale("zh-hant-tw")).toBe("zh-Hant-TW" as value.LocaleTag);
        expect(value.locale("es-419")).toBe("es-419" as value.LocaleTag);
        expect(value.locale("sr-LATN")).toBe("sr-Latn" as value.LocaleTag);

        for ( const given of ["ar-EG-u-nu-arab", "english", "e", "ar-E", "ar--EG", "", null] ) expect(value.locale(given)).toBeUndefined();

        expect(value.plainDate("2026-02-28")).toBe("2026-02-28" as value.PlainDate);
        expect(value.plainDate(" ٢٠٢٦-٠٣-١٥ ")).toBe("2026-03-15" as value.PlainDate);
        expect(value.plainDate(new Date(Date.UTC(2026, 2, 15, 23, 59)))).toBe("2026-03-15" as value.PlainDate);
        expect(value.plainDate("2028-02-29")).toBe("2028-02-29" as value.PlainDate);

        for ( const given of ["2026-02-30", "2026-02-29", "2026-3-5", "2026-03-15T00:00:00Z", "20260315", "", null, new Date(Number.NaN)] ) expect(value.plainDate(given)).toBeUndefined();

    });
    it("uuid and ulid accept what rand makes and refuse the near misses", () => {

        expect(value.uuid("550E8400-E29B-41D4-A716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000" as value.Uuid);
        expect(value.uuid("00000000-0000-0000-0000-000000000000")).toBe("00000000-0000-0000-0000-000000000000" as value.Uuid);
        expect(value.uuid("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff" as value.Uuid);

        for ( const given of ["550e8400-e29b-91d4-a716-446655440000", "550e8400-e29b-41d4-c716-446655440000", "550e8400e29b41d4a716446655440000", "550e8400-e29b-41d4-a716-44665544000g", "", null] ) expect(value.uuid(given)).toBeUndefined();

        expect(value.ulid("01arz3ndektsv4rrffq69g5fav")).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV" as value.Ulid);

        for ( const given of ["81ARZ3NDEKTSV4RRFFQ69G5FAV", "01ARZ3NDEKTSV4RRFFQ69G5FAU", "01ARZ3NDEKTSV4RRFFQ69G5FA", "01ARZ3NDEKTSV4RRFFQ69G5FAVV", "", null] ) expect(value.ulid(given)).toBeUndefined();

        for ( let round = 0; round < 50; round += 1 ) {

            const four = rand.uuid();
            const seven = rand.uuid7();
            const sortable = rand.ulid();

            expect(value.uuid(four)).toBe(four as value.Uuid);
            expect(value.uuid(seven.toUpperCase())).toBe(seven as value.Uuid);
            expect(value.ulid(sortable.toLowerCase())).toBe(sortable as value.Ulid);

        }

    });
    it("a letter that only folds into ascii is refused, never read as its fold", () => {

        expect(value.email("\u212a@example.com")).toBeUndefined();
        expect(value.slug("\u212aey")).toBeUndefined();
        expect(value.ulid(`0${"\u017f".repeat(25)}`)).toBeUndefined();
        expect(value.ulid(`0${"\ufb00".repeat(12)}7`)).toBeUndefined();
        expect(value.currency("a\u00df")).toBeUndefined();
        expect(value.currency("\u0131qd")).toBeUndefined();
        expect(value.currency("u\u017fd")).toBeUndefined();
        expect(value.locale("en-\u00df")).toBeUndefined();
        expect(value.locale("en-u\u017f")).toBeUndefined();
        expect(value.currency("iqd")).toBe("IQD" as value.CurrencyCode);
        expect(value.locale("EN-us")).toBe("en-US" as value.LocaleTag);

    });
    it("every pattern is anchored and reads only its own canonical form", () => {

        const canonical: Record<keyof typeof value.patterns, [string, string]> = {
            email: ["a@b.co", "a@b.co\n"],
            phone: ["+201000000000", " +201000000000"],
            slug: ["a-b", "a-b "],
            key: ["a_b", "A_b"],
            uuid: ["550e8400-e29b-41d4-a716-446655440000", "550E8400-E29B-41D4-A716-446655440000"],
            ulid: ["01ARZ3NDEKTSV4RRFFQ69G5FAV", "01arz3ndektsv4rrffq69g5fav"],
            currency: ["EGP", "egp"],
            locale: ["ar-EG", "ar_EG"],
            plainDate: ["2026-03-15", "2026-03-15T"],
        };

        for ( const [name, [good, bad]] of Object.entries(canonical) as [keyof typeof value.patterns, [string, string]][] ) {

            expect(value.patterns[name].test(good), name).toBe(true);
            expect(value.patterns[name].test(bad), name).toBe(false);
            expect(value.patterns[name].flags, name).toBe("");

        }

    });

});
