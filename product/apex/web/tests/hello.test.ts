import { describe, expect, test } from "bun:test";
import { world } from "../src/hello.ts";

describe("hello", () => {

    test("world is exactly the greeting", () => {

        expect(world()).toBe("hello world");

    });

});
