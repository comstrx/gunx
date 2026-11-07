import { describe, expect, test } from "bun:test";
import * as engine from "engine";
import * as hello from "engine/hello";

describe("hello", () => {

    test("world is exactly the greeting", () => {

        expect(hello.world()).toBe("hello world");
        expect(hello.world().length).toBe(11);

    });
    test("world is the same on every call and through the root", () => {

        expect(hello.world()).toBe(hello.world());
        expect(engine.hello.world()).toBe(hello.world());

    });

});
