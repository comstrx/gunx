import { expect, test as it } from "bun:test";
import * as history from "engine/history";

it("local URL cleanup cannot join lone surrogates across removed controls", () => {

    for ( const control of ["\t", "\r", "\n", "\r\n"] ) {

        const text = `/\ud800${control}\udfff`;
        const expected = new URL(text, "https://example.test").pathname;

        expect(history.parse(text).path).toBe(expected);
        expect(history.local(text)?.path).toBe(expected);
        expect(history.parse(`/\ud800\udfff${control}`).path).toBe(new URL("/\ud800\udfff", "https://example.test").pathname);

    }

});
