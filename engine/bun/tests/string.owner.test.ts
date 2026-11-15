import { expect, test as it } from "bun:test";
import * as string from "engine/string";

it("truncation removes only whole whitespace clusters", () => {

    expect(string.truncate("a\u0600 b", 2, "")).toBe("a\u0600 ");
    expect(string.truncate("a  b", 3, "")).toBe("a");

});

it("excerpt expands both boundaries to complete graphemes", () => {

    expect(string.excerpt("X a\u0301 Y", "a", 0, "")).toBe("a\u0301");
    expect(string.excerpt("X 👨‍👩‍👧 Y", "👩", 0, "")).toBe("👨‍👩‍👧");

});

it("text budgets normalize before empty and short input fast paths", () => {

    for ( const limit of [Number.NaN, -1, -Infinity, 0, 0.9] ) {

        expect(string.truncate("abc", limit)).toBe("");
        expect(string.truncate("", limit)).toBe("");
        expect(string.limitWords("a b", limit)).toBe("");

    }

    expect(string.truncate("abcdef", 2.9, "...")).toBe("..");
    expect(string.truncate("abc", Infinity)).toBe("abc");
    expect(string.limitWords("a b c", 1.9)).toBe("a…");

});

it("UTF-8 size matches the platform encoder including lone surrogates", () => {

    for ( const text of ["", "ascii", "مرحبا", "👨‍👩‍👧", "\ud800", "\udc00", "\ud800\ud800", "\ud800\udc00"] ) expect(string.byteLength(text)).toBe(new TextEncoder().encode(text).length);

});
