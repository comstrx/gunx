import { describe, expect, test as it } from "bun:test";
import * as rand from "engine/rand";
import * as world from "engine/world";
import { Appearance } from "react-native";
import { adapter } from "../src/native/device.ts";
import { source } from "../src/native/random.ts";
import { storage } from "../src/native/storage.ts";
import { scheme } from "../src/styles/theme.ts";

describe("native", () => {

    it("the theme follows the phone's appearance that boot bound, whatever was made first", () => {

        expect([world.appearance.bound(), scheme.getState().system]).toEqual([true, "light"]);
        Appearance.setColorScheme("dark");
        expect(scheme.getState().system).toBe("dark");
        Appearance.setColorScheme("light");
        expect(scheme.getState().system).toBe("light");

    });
    it("boot binds the phone's randomness, the facts the engine reads are whole, and the storage takes its writes in turn", async () => {

        const order: string[] = [];
        const slow = storage.lock?.("k", async () => {

            await new Promise(( resolve ) => setTimeout(resolve, 5));
            order.push("first");

        });
        const quick = storage.lock?.("k", async () => {

            order.push("second");

        });

        expect([rand.engine.bound(), rand.engine.get() === source, /^[0-9a-f-]{36}$/.test(rand.uuid()), rand.trace().length > 0]).toEqual([true, true, true, true]);
        expect([adapter.info().pointer, adapter.info().contrast, adapter.info().touch]).toEqual(["coarse", "normal", true]);
        await Promise.all([slow, quick]);
        expect(order).toEqual(["first", "second"]);

    });

});
