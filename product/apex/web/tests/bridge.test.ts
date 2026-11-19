import { describe, expect, test as it } from "bun:test";
import { readFileSync } from "node:fs";
import * as exception from "engine/exception";
import * as spec from "engine/spec";
import { specs } from "../specs/index.ts";
import { createHost, host } from "../src/render/bridge/host.ts";
import { hosted } from "../src/render/bridge/identity.ts";
import type { Bridge, Info } from "../src/render/host/contract.ts";
import { part } from "../src/specs/part.ts";

const info: Info = { platform: "linux", arch: "x64", runtime: "1.4.4", name: "Acme Admin", identity: "admin", version: "0.1.0" };

function fake (): { bridge: Bridge; asked: { name: string; params: unknown }[]; told: { name: string; payload: unknown }[] } {

    const asked: { name: string; params: unknown }[] = [];
    const told: { name: string; payload: unknown }[] = [];
    const answers: Record<string, unknown> = { info, title: undefined, open: true };
    const bridge: Bridge = {
        ask: async ( name, params ) => {

            asked.push({ name, params });

            return answers[name] as never;

        },
        tell: ( name, payload ) => {

            told.push({ name, payload });

        },
    };

    return { bridge, asked, told };

}

describe("host", () => {

    it("every verb sends its exact request over the bridge", async () => {

        const { bridge, asked, told } = fake();
        const desk = createHost(async () => bridge);

        expect(await desk.opened()).toBe(true);
        expect(desk.ready()).toBe(true);
        expect(await desk.info()).toEqual(info);
        await desk.title("Acme Admin");
        expect(await desk.open("https://acme.test/docs")).toBe(true);
        desk.mark();
        expect(asked).toEqual([
            { name: "info", params: undefined },
            { name: "title", params: { title: "Acme Admin" } },
            { name: "open", params: { url: "https://acme.test/docs" } },
        ]);
        expect(told).toHaveLength(1);
        expect(told[0]?.name).toBe("ready");

    });
    it("outside a window the host is honest: not ready, no info, every verb refuses", async () => {

        const absent = createHost(async () => null);

        expect(await absent.opened()).toBe(false);
        expect(absent.ready()).toBe(false);
        expect(await absent.info()).toBeNull();
        await expect(absent.title("x")).rejects.toMatchObject({ code: "unavailable", reason: "host.absent" });
        await expect(absent.open("https://x.test")).rejects.toBeInstanceOf(exception.Fault);
        expect(() => absent.mark()).not.toThrow();

        const broken = createHost(async () => { throw new Error("no sdk"); });

        expect(await broken.opened()).toBe(false);
        expect(await host.opened()).toBe(false);

    });
    it("the page document names its policy, the role's language and appearance, and the host learns the role's identity", () => {

        const template = readFileSync(new URL("../src/app/(desk)/index.html", import.meta.url), "utf8");

        expect(template).toContain('<html lang="{{locale}}" dir="{{dir}}">');
        expect(template).toContain('<meta http-equiv="Content-Security-Policy" content="{{csp}}">');
        expect(template).not.toContain("<title>");
        expect(template).toContain('<div id="root"></div>');
        expect(template).toContain('<script type="module" src="./app.js"></script>');
        expect(template).toContain('<link rel="stylesheet" href="./theme.css">');
        expect(template).toContain('<script src="{{places.paint}}" data-surface="{{name}}" data-surfaces="{{index}}"></script>');
        expect(() => hosted({ name: "acme.nameless", settings: { app: { name: "", identifier: "", version: "0.0.0" }, window: { width: 1280, height: 800, minWidth: 960, minHeight: 640 } } })).toThrow("acme.nameless: a desktop build needs settings.app with a name and an identifier");
        expect(hosted({ name: "acme.admin", settings: spec.build(specs, part).surface("acme.admin").config.settings })).toEqual({
            identity: "acme.admin",
            name: "Acme Admin",
            identifier: "com.acme.admin",
            version: "0.1.0",
            window: { width: 1280, height: 800, minWidth: 960, minHeight: 640 },
        });

    });

});
