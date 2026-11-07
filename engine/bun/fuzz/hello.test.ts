import { describe, expect, test } from "bun:test";
import * as hello from "engine/hello";
import * as fc from "fast-check";

const runs = 20_000;

describe("fuzz hello", () => {

    test("world is the same for every input", () => {

        fc.assert(
            fc.property(fc.uint8Array({ maxLength: 4096 }), (data) => {

                expect(hello.world()).toBe("hello world");
                expect(data.length === 11 || new TextDecoder().decode(data) !== hello.world()).toBe(true);

            }),
            { numRuns: runs },
        );

    });

});
