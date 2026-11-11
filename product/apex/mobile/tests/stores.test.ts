import { beforeEach, describe, expect, test as it } from "bun:test";
import * as cache from "engine/cache";
import * as state from "engine/state";
import { faults, preferences } from "../src/stores/preferences.ts";

const box = cache.open({ kind: "local", prefix: "app" });
const key = state.keyOf("preferences");

beforeEach(async () => {

    await box.remove(key);
    faults.set(undefined);

});

describe("stores", () => {

    it("preferences survive a reload through the local storage box", async () => {

        const first = preferences.create();

        await first.hydrate();
        first.getState().setLocale("en");
        await first.flush();
        expect(await box.get(key)).toEqual({ version: 1, state: { locale: "en" } });

        const reloaded = preferences.create();

        await reloaded.hydrate();
        expect([reloaded.getState().locale, reloaded.getState().kept]).toEqual(["en", true]);
        reloaded.getState().toggleLocale();
        await reloaded.flush();
        expect([reloaded.getState().locale, await box.get(key), faults.get()]).toEqual(["ar", { version: 1, state: { locale: "ar" } }, undefined]);

    });
    it("a newer saved version freezes the preferences: the page keeps working, nothing is written over it, and the fault is raised once", async () => {

        await box.set(key, { version: 9, state: { locale: "en" } });

        const held = preferences.create();

        await held.hydrate();
        held.getState().setLocale("en");
        held.getState().toggleLocale();
        await held.flush();
        expect([held.getState().locale, held.getState().kept, await box.get(key)]).toEqual(["ar", false, { version: 9, state: { locale: "en" } }]);
        expect([faults.get()?.code, faults.get()?.reason]).toEqual(["conflict", "state.newer"]);
        faults.set(undefined);

    });

});
