import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import type { Bridge, Info } from "../native/src/contract.ts";
import { createHost, host } from "../src/native/bridge.ts";
import { csp, page, spoken } from "../tools/build.ts";

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
        await expect(absent.open("https://x.test")).rejects.toBeInstanceOf(error.Fault);
        expect(() => absent.mark()).not.toThrow();

        const broken = createHost(async () => { throw new Error("no sdk"); });

        expect(await broken.opened()).toBe(false);
        expect(await host.opened()).toBe(false);

    });
    it("the page document carries a strict policy and the role's identity", () => {

        expect(csp("http://localhost:8100/api")).toBe(
            "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self' http://localhost:8100; object-src 'none'; base-uri 'none'; form-action 'none'",
        );

        const html = page({ lang: "ar", dir: "rtl", csp: csp("http://localhost:8100") });

        expect(html).toContain('<html lang="ar" dir="rtl">');
        expect(html).not.toContain("<title>");
        expect(html).toContain("base-uri 'none'");
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('<script type="module" src="./app.js"></script>');
        expect(html).toContain('<link rel="stylesheet" href="./theme.css">');
        expect(spoken("admin")).toEqual({
            identity: "admin",
            name: "Acme Admin",
            identifier: "com.acme.admin",
            version: "0.1.0",
            window: { width: 1280, height: 800, minWidth: 960, minHeight: 640 },
        });

    });

});
