import { beforeEach, describe, expect, test as it } from "bun:test";
import { connect, inside } from "../src/view.ts";
import { calls } from "./setup.ts";

const target = globalThis as { __electrobunWebviewId?: number | undefined };

beforeEach(() => {

    delete target.__electrobunWebviewId;
    calls.length = 0;

});

describe("view", () => {

    it("no bridge opens outside a desktop window", async () => {

        expect(inside()).toBe(false);
        expect(await connect()).toBeNull();

    });
    it("inside a window the bridge asks and tells over the runtime's rpc", async () => {

        target.__electrobunWebviewId = 1;

        const bridge = await connect();

        expect(inside()).toBe(true);
        expect(await bridge?.ask("title", { title: "Acme" })).toEqual({ name: "title", params: { title: "Acme" } } as never);

        bridge?.tell("ready", { at: 1 });
        expect(calls).toEqual([{ name: "send:ready", args: [{ at: 1 }] }]);

    });

});
