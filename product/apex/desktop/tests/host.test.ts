import { describe, expect, test as it } from "bun:test";
import { readFileSync } from "node:fs";
import * as exception from "engine/exception";
import * as spec from "engine/spec";
import { csp, render } from "engine/tool";
import type { Bridge, Info } from "../host/src/contract.ts";
import { specs } from "../specs/index.ts";
import { createHost, host } from "../src/host/bridge.ts";
import { hosted } from "../src/host/host.ts";
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
    it("the page document carries a strict policy, the role's language and appearance, and the host learns the role's identity", () => {

        expect(csp("http://localhost:8100/api")).toBe(
            "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: http://localhost:8100; media-src 'self' blob: http://localhost:8100; connect-src 'self' http://localhost:8100 ws://localhost:8100; object-src 'none'; base-uri 'none'; form-action 'none'",
        );

        expect(csp("https://api.example.test/v1")).toContain("connect-src 'self' https://api.example.test wss://api.example.test;");
        expect(csp("https://api.example.test:8443/v1")).toContain("wss://api.example.test:8443;");
        expect(() => csp("file:///private")).toThrow("the API uses http or https");

        const template = readFileSync(new URL("../src/app/index.html", import.meta.url), "utf8");
        const reached = [{ name: "acme.admin", id: "acme.admin", indexable: false, settings: { locales: ["ar", "en"], locale: "ar", scheme: "system", world: [] } }];
        const html = render(template, { locale: "ar", dir: "rtl", csp: csp("http://localhost:8100"), name: "acme.admin", index: reached });

        expect(html).toContain('<html lang="ar" dir="rtl">');
        expect(html).not.toContain("<title>");
        expect(html).toContain("base-uri &#x27;none&#x27;");
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('<script type="module" src="./app.js"></script>');
        expect(html).toContain('<link rel="stylesheet" href="./theme.css">');
        expect(html).toContain(`<script src="./appearance.js" data-surface="acme.admin" data-surfaces="${Bun.escapeHTML(JSON.stringify(reached))}"></script>`);
        expect(hosted({ name: "acme.admin", settings: spec.build(specs, part).surface("acme.admin").config.settings })).toEqual({
            identity: "acme.admin",
            name: "Acme Admin",
            identifier: "com.acme.admin",
            version: "0.1.0",
            window: { width: 1280, height: 800, minWidth: 960, minHeight: 640 },
        });

    });

});
