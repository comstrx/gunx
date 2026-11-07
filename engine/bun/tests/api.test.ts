import { describe, expect, test } from "bun:test";
import * as engine from "engine";
import * as hello from "engine/hello";
import surface from "./api.json";

describe("api", () => {

    test("every member exports exactly its recorded surface", () => {

        expect(Object.keys(hello).sort()).toEqual(surface.hello);

    });
    test("the facade names exactly the recorded members", () => {

        expect(Object.keys(engine).sort()).toEqual(Object.keys(surface).sort());

    });

});
