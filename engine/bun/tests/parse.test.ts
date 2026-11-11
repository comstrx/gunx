import { describe, expect, test as it } from "bun:test";
import * as parse from "engine/parse";

describe("parse", () => {

    it("durations, sizes, pairs, env files and ranges are bounded", () => {

        expect(parse.duration("1h30m")).toBe(5_400_000);
        expect(parse.duration("250ms")).toBe(250);
        expect(parse.duration("2.5s")).toBe(2500);
        expect(parse.duration("1w 1d")).toBe(691_200_000);
        expect(parse.duration("500")).toBe(500);
        expect(parse.duration("3x", 7)).toBe(7);
        expect(parse.duration(-1)).toBeUndefined();
        expect(parse.bytes("1.5MB")).toBe(1_572_864);
        expect(parse.bytes("2 KiB")).toBe(2048);
        expect(parse.bytes("512")).toBe(512);
        expect(parse.bytes("1g")).toBe(1024 ** 3);
        expect(parse.bytes("1 lightyear")).toBeUndefined();
        expect(parse.keyValue("a=1; b = two,__proto__=x")).toEqual({ a: "1", b: "two" });
        expect(parse.env('# c\nexport A=1\nB="two words"\nC=three # note\nD=\'x\\ny\'\nbad line')).toEqual({ A: "1", B: "two words", C: "three", D: "x\\ny" });
        expect(parse.range("1-5")).toEqual([1, 5]);
        expect(parse.range("9..3")).toEqual([3, 9]);
        expect(parse.range("7")).toEqual([7, 7]);
        expect(parse.range("a")).toBeUndefined();
        expect(parse.semver("v1.2.3-beta.1+build.5")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: "beta.1", build: "build.5" });
        expect(parse.semver("01.2.3")).toBeUndefined();
        expect(parse.semver("1.2")).toBeUndefined();

        const reference = new Date("2026-03-15T13:45:30Z");

        expect(parse.when("now", reference)?.getTime()).toBe(reference.getTime());
        expect(parse.when("today", reference)?.toISOString()).toBe("2026-03-15T00:00:00.000Z");
        expect(parse.when("غدا", reference)?.toISOString()).toBe("2026-03-16T00:00:00.000Z");
        expect(parse.when("yesterday", reference)?.toISOString()).toBe("2026-03-14T00:00:00.000Z");
        expect(parse.when("+2h", reference)?.toISOString()).toBe("2026-03-15T15:45:30.000Z");
        expect(parse.when("- 1d", reference)?.toISOString()).toBe("2026-03-14T13:45:30.000Z");
        expect(parse.when("2026-01-02", reference)?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
        expect(parse.when("garbage", reference)).toBeUndefined();

    });
    it("query strings read brackets and repeats and write sorted", () => {

        expect(parse.query("?a=1&b=x%20y&c[]=1&c[]=2&d=1&d=2&e&__proto__=x")).toEqual({ a: "1", b: "x y", c: ["1", "2"], d: ["1", "2"], e: "" });
        expect(parse.query("")).toEqual({});
        expect(parse.query("a=%E0%A4%A")).toEqual({ a: "%E0%A4%A" });
        expect(parse.queryString({ b: "x y", a: 1, c: [1, 2], d: null, e: undefined, f: "" })).toBe("a=1&b=x%20y&c[]=1&c[]=2&f");
        expect(parse.queryString({ c: [1, 2] }, "repeat")).toBe("c=1&c=2");
        expect(parse.isQuery({ a: "1", b: ["x"] }) && !parse.isQuery({ a: 1 }) && !parse.isQuery([])).toBe(true);

    });
    it("patterns fill, match and interpolate", () => {

        expect(parse.templateKeys("/users/{id}/posts/{post.id}/{id}")).toEqual(["id", "post.id"]);
        expect(parse.placeholders("hi {name}")).toEqual(["name"]);
        expect(parse.interpolate("Hi {user.name}, {missing}!", { user: { name: "Ann" } })).toBe("Hi Ann, !");
        expect(parse.interpolate("{a} {b}", { a: 1 }, "?")).toBe("1 ?");
        expect(parse.fill("/users/{id}/{slug}", { id: 5, slug: "a b" })).toBe("/users/5/a%20b");
        expect(parse.segments("/a//b/")).toEqual(["a", "b"]);
        expect(parse.match("/users/{id}", "/users/42")).toEqual({ id: "42" });
        expect(parse.match("/users/{id}", "/users/42?x=1")).toEqual({ id: "42" });
        expect(parse.match("/users/{id}", "/users/42/posts")).toBeUndefined();
        expect(parse.match("/files/{path*}", "/files/a/b/c.txt")).toEqual({ path: "a/b/c.txt" });
        expect(parse.match("/*/edit", "/anything/edit")).toEqual({});
        expect(parse.match("/x", "x/")).toEqual({});
        expect(parse.match("/u/{name}", "/u/%D9%85")).toEqual({ name: "م" });
        expect(parse.match("/a.b", "/aXb")).toBeUndefined();

    });
    it("untrusted keys never reach the prototype", () => {

        const found = parse.match("/u/{__proto__}/{id}", "/u/x/7");

        expect(parse.query("?toString=1&valueOf=2&hasOwnProperty=3")).toEqual({ toString: "1", valueOf: "2", hasOwnProperty: "3" });
        expect(parse.query("?constructor=1&prototype=2&a=1")).toEqual({ a: "1" });
        expect(found).toEqual({ id: "7" });
        expect(Object.getPrototypeOf(found)).toBe(Object.prototype);
        expect(parse.fill("/u/{toString}", {})).toBe("/u/");
        expect(parse.interpolate("{constructor.name}|{__proto__}|{toString}", {})).toBe("||");
        expect(parse.bytes("5constructor")).toBeUndefined();
        expect(parse.bytes("5 toString", 9)).toBe(9);
        expect(parse.duration("5constructor")).toBeUndefined();
        expect(parse.duration("5valueOf", 2)).toBe(2);
        expect(Object.hasOwn(parse.keyValue("constructor=x"), "constructor")).toBe(true);
        expect(parse.env("__proto__=1\nA=2")).toEqual({ A: "2" });
        expect(Object.getPrototypeOf(parse.env("__proto__=1"))).toBe(Object.prototype);

    });
    it("query strings stop at the fragment, cap their pairs and drop what cannot be sent", () => {

        const many = Array.from({ length: 300 }, ( _, index ) => `k${index}=1`).join("&");

        expect(parse.query("a=1#b=2")).toEqual({ a: "1" });
        expect(parse.query("?#a=1")).toEqual({});
        expect(parse.query("a=1&a=2&a=3")).toEqual({ a: ["1", "2", "3"] });
        expect(parse.query("a[]=1")).toEqual({ a: ["1"] });
        expect(parse.query("a=1&a[]=2")).toEqual({ a: ["1", "2"] });
        expect(parse.query("a=1+2&b=%2B&c=x=y")).toEqual({ a: "1 2", b: "+", c: "x=y" });
        expect(parse.query("&&a=1&&")).toEqual({ a: "1" });
        expect(Object.keys(parse.query(many))).toHaveLength(256);
        expect(parse.queryString({ a: Number.NaN, b: Number.POSITIVE_INFINITY, c: 1, d: [1, Number.NaN, 2], e: false })).toBe("c=1&d[]=1&d[]=2&e=false");
        expect(parse.queryString({ "a b": "c&d=e" })).toBe("a%20b=c%26d%3De");
        expect(parse.queryString({})).toBe("");
        expect(parse.query(parse.queryString({ tag: ["x y", "z"], q: "a&b" }))).toEqual({ q: "a&b", tag: ["x y", "z"] });
        expect(parse.queryString({ [String.fromCharCode(0xd800)]: String.fromCharCode(0xdfff), ok: [`a${String.fromCharCode(0xdc00)}`] }, "repeat")).toBe("ok=a%EF%BF%BD&%EF%BF%BD=%EF%BF%BD");
        expect(parse.queryString({ face: String.fromCodePoint(0x1f600) })).toBe("face=%F0%9F%98%80");
        expect(parse.queryString({ a: ["", "x", ""] })).toBe("a[]&a[]=x&a[]");
        expect(parse.queryString({ a: [""] }, "repeat")).toBe("a");
        expect(parse.query(parse.queryString({ a: ["", "x"] }, "repeat"))).toEqual({ a: ["", "x"] });
        expect(parse.isQuery({ a: [1] }) || parse.isQuery(null) || parse.isQuery("a=1")).toBe(false);

    });
    it("fill refuses dot segments and keeps a rest param's slashes", () => {

        expect(() => parse.fill("/files/{name}", { name: ".." })).toThrow(RangeError);
        expect(() => parse.fill("/files/{name}", { name: "." })).toThrow("not a path segment");
        expect(() => parse.fill("/files/{name}", { name: String.fromCharCode(0xd83d) })).toThrow(RangeError);
        expect(() => parse.fill("/files/{name}", { name: `a${String.fromCharCode(0xde00)}` })).toThrow("not a path segment");
        expect(() => parse.fill("/files/{path*}", { path: "a/../b" })).toThrow("not a path segment");
        expect(parse.fill("/files/{path*}", { path: "a/b c/d.txt" })).toBe("/files/a/b%20c/d.txt");
        expect(parse.fill("/u/{id}", { id: "a/b" })).toBe("/u/a%2Fb");
        expect(parse.fill("/u/{id}", { id: "..x" })).toBe("/u/..x");
        expect(parse.fill("/u/{id}/{id}", { id: 7 })).toBe("/u/7/7");
        expect(parse.fill("/u/{id}", {})).toBe("/u/");
        expect(parse.templateKeys("/files/{path*}/{id}")).toEqual(["path", "id"]);

    });
    it("match reads inline and rest params, ignores query and fragment, and is bounded", () => {

        const missing: parse.Fallback = ( key ) => `<${key}>`;

        expect(parse.match("/files/{name}.json", "/files/report.json")).toEqual({ name: "report" });
        expect(parse.match("/files/{name}.json", "/files/reportXjson")).toBeUndefined();
        expect(parse.match("/{lang}-{region}/home", "/ar-EG/home")).toEqual({ lang: "ar", region: "EG" });
        expect(parse.match("/users/{id}", "/users/42#top")).toEqual({ id: "42" });
        expect(parse.match("/users/{id}", "/users/42?next=/users/1/2")).toEqual({ id: "42" });
        expect(parse.match("/users/{id}", "/users/")).toBeUndefined();
        expect(parse.match("/users/{id}", `/users/${"a".repeat(5000)}`)).toBeUndefined();
        expect(parse.match("/a+b/(c)", "/a+b/(c)")).toEqual({});
        expect(parse.match("/a+b/(c)", "/aab/c")).toBeUndefined();
        expect(parse.match("/u/{name}", "/u/%E0%A4%A")).toEqual({ name: "%E0%A4%A" });
        expect(parse.matches("/users/{id}", "/users/42?x=1")).toBe(true);
        expect(parse.matches("/users/{id}", "/users")).toBe(false);
        expect(parse.matches("/files/{path*}", "/files/a/b")).toBe(true);
        expect(parse.matches("/users/{id}", `/users/${"a".repeat(5000)}`)).toBe(false);
        expect(parse.segments("/a/b?x=/c#/d")).toEqual(["a", "b"]);
        expect(parse.interpolate("{a} {b.c}", { a: 1 }, missing)).toBe("1 <b.c>");
        expect(parse.interpolate("{a}{b}", { a: 0, b: false })).toBe("0false");
        expect(parse.interpolate("{a}", { a: null }, "-")).toBe("-");

    });
    it("durations read words and ISO 8601, sizes stay safe integers", () => {

        expect(parse.duration("2 hours 30 minutes")).toBe(9_000_000);
        expect(parse.duration("1 day")).toBe(86_400_000);
        expect(parse.duration("90 secs")).toBe(90_000);
        expect(parse.duration("1hr 5min")).toBe(3_900_000);
        expect(parse.duration("2 weeks")).toBe(1_209_600_000);
        expect(parse.duration("PT1H30M")).toBe(5_400_000);
        expect(parse.duration("P1DT12H")).toBe(129_600_000);
        expect(parse.duration("P2W")).toBe(1_209_600_000);
        expect(parse.duration("PT0.5S")).toBe(500);
        expect(parse.duration("1.1s")).toBe(1100);
        expect(parse.duration("٥m")).toBe(300_000);
        expect(parse.duration(1500)).toBe(1500);

        for ( const bad of ["P1M", "P1Y", "P", "PT", "P1DT", "1.5.5s", "h", "1h30", "", "   "] ) expect(parse.duration(bad)).toBeUndefined();

        expect(parse.duration("x".repeat(300), 4)).toBe(4);
        expect(parse.duration(Number.NaN, 3)).toBe(3);
        expect(parse.duration(Number.POSITIVE_INFINITY)).toBeUndefined();
        expect(parse.duration(null, 1)).toBe(1);
        expect(parse.bytes("1 byte")).toBe(1);
        expect(parse.bytes("3 bytes")).toBe(3);
        expect(parse.bytes("1pb")).toBe(1024 ** 5);
        expect(parse.bytes("2 TiB")).toBe(2 * 1024 ** 4);
        expect(parse.bytes("0.5k")).toBe(512);
        expect(parse.bytes("9999999pb")).toBeUndefined();
        expect(parse.bytes(1.9)).toBe(1);
        expect(parse.bytes(-1, 5)).toBe(5);
        expect(parse.bytes(Number.NaN)).toBeUndefined();
        expect(parse.bytes(2 ** 60)).toBeUndefined();
        expect(parse.bytes("")).toBeUndefined();

    });
    it("env files read quotes, escapes, comments and line ends the way a shell does", () => {

        const file = ['A="x" # note', 'B="a \\"q\\" b"', 'C="one\\ntwo\\\\"', 'D="multi', 'line"', "E=`tick`", "F=#fff", "G= # empty", "H=a#b", "  I = spaced  ", 'export J="k"', "K='# kept'", "L=", "1M=x", "N-O=y", "=z"].join("\n");

        expect(parse.env(file)).toEqual({ A: "x", B: 'a "q" b', C: "one\ntwo\\", D: "multi\nline", E: "tick", F: "#fff", G: "", H: "a#b", I: "spaced", J: "k", K: "# kept", L: "" });
        expect(parse.env("﻿A=1")).toEqual({ A: "1" });
        expect(parse.env('A=1\r\nB="2"\r\nC=3 # c\r\n')).toEqual({ A: "1", B: "2", C: "3" });
        expect(parse.env('A="x" y\nB=2')).toEqual({ A: '"x" y', B: "2" });
        expect(parse.env('A="open\nB=2')).toEqual({ A: '"open', B: "2" });
        expect(parse.env(`A=${" ".repeat(50_000)}x${" ".repeat(50_000)}`)).toEqual({ A: "x" });
        expect(parse.env("")).toEqual({});
        expect(parse.keyValue("a:1|b:2", "|", ":")).toEqual({ a: "1", b: "2" });
        expect(parse.keyValue("a=1", ",", "")).toEqual({});
        expect(parse.keyValue("=x,a=b=c")).toEqual({ a: "b=c" });

    });
    it("ranges and versions follow their grammars", () => {

        const order = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.2.0", "2.0.0", "10.0.0"];
        const mixed = [...order].reverse().sort(( a, b ) => parse.compareSemver(a, b) ?? 0);

        expect(mixed).toEqual(order);
        expect(parse.compareSemver("1.0.0+a", "v1.0.0+b")).toBe(0);
        expect(parse.compareSemver("2.0.0", "10.0.0")).toBe(-1);
        expect(parse.compareSemver("1.0.0", "1.0.0-rc.1")).toBe(1);
        expect(parse.compareSemver("1.2.3", "bad")).toBeUndefined();
        expect(parse.compareSemver({ major: 1, minor: 0, patch: 0, prerelease: "", build: "" }, "1.0.0")).toBe(0);
        expect(parse.compareSemver({ major: -1, minor: 0, patch: 0, prerelease: "", build: "" }, "1.0.0")).toBeUndefined();
        expect(parse.semver("1.0.0+001")?.build).toBe("001");
        expect(parse.semver(" 1.2.3 ")?.patch).toBe(3);

        for ( const bad of ["1.2.3-01", "1.2.3-alpha..1", "99999999999999999999.0.0", "1.2.3.4", "1.2.x", "", "v", `1.2.3-${"a".repeat(300)}`] ) expect(parse.semver(bad)).toBeUndefined();

        expect(parse.range("1.5..2.5")).toEqual([1.5, 2.5]);
        expect(parse.range("3 to 7")).toEqual([3, 7]);
        expect(parse.range("5–9")).toEqual([5, 9]);
        expect(parse.range("1...4")).toEqual([1, 4]);
        expect(parse.range("1--5")).toEqual([-5, 1]);
        expect(parse.range("-5")).toEqual([-5, -5]);
        expect(parse.range("١-٥")).toEqual([1, 5]);
        expect(parse.range(4)).toEqual([4, 4]);
        expect(parse.range("1-")).toBeUndefined();
        expect(parse.range("1-2-3")).toBeUndefined();

    });
    it("when reads shifts, spans and everyday words against a reference", () => {

        const reference = new Date("2026-03-15T13:45:30Z");
        const at = ( text: unknown ): string | undefined => parse.when(text, reference)?.toISOString();

        expect(at("in 2 hours")).toBe("2026-03-15T15:45:30.000Z");
        expect(at("3 days ago")).toBe("2026-03-12T13:45:30.000Z");
        expect(at("in 1h30m")).toBe("2026-03-15T15:15:30.000Z");
        expect(at("+90m")).toBe("2026-03-15T15:15:30.000Z");
        expect(at("+500ms")).toBe("2026-03-15T13:45:30.500Z");
        expect(at("+1mo")).toBe("2026-04-15T13:45:30.000Z");
        expect(at("-1y")).toBe("2025-03-15T13:45:30.000Z");
        expect(at("+2w")).toBe("2026-03-29T13:45:30.000Z");
        expect(at("TODAY")).toBe("2026-03-15T00:00:00.000Z");
        expect(at("بكرة")).toBe("2026-03-16T00:00:00.000Z");
        expect(at("امبارح")).toBe("2026-03-14T00:00:00.000Z");
        expect(at("النهاردة")).toBe("2026-03-15T00:00:00.000Z");
        expect(at("دلوقتي")).toBe("2026-03-15T13:45:30.000Z");
        expect(parse.when("now", reference)).not.toBe(reference);

        for ( const bad of ["in", "ago", "in x", "soon ago", "+1q", "", null, undefined, {}, "x".repeat(300)] ) expect(at(bad)).toBeUndefined();

        expect(parse.when("now", new Date(Number.NaN))).toBeUndefined();
        expect(parse.when("+99999999999999y", reference)).toBeUndefined();

    });

});
