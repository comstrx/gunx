import { beforeEach, describe, expect, test as it } from "bun:test";
import { marks, requests } from "../src/contract.ts";
import { handlersOf, platformOf, safeUrl } from "../src/host.ts";
import { calls, windows } from "./setup.ts";

const info = { platform: "linux" as const, arch: "x64", runtime: "1.4.4", name: "Acme Admin", identity: "admin", version: "0.1.0" };

function opened () {

    const { BrowserWindow } = require("electrobun/main") as { BrowserWindow: new ( options: { title: string } ) => { title: string; shown: boolean; setTitle: ( title: string ) => void; show: () => void } };
    const window = new BrowserWindow({ title: "Acme" });

    return { window, handlers: handlersOf(() => window, info) };

}

beforeEach(() => {

    calls.length = 0;
    windows.length = 0;

});

describe("host", () => {

    it("the handlers are a complete map over the contract", () => {

        const { handlers } = opened();

        expect(Object.keys(handlers).sort()).toEqual([...requests].sort());
        expect(new Set(requests).size).toBe(requests.length);
        expect(marks).toEqual(["ready"]);

    });
    it("every handler maps one request to one runtime call and validates what the page sends", async () => {

        const { handlers, window } = opened();

        expect(await handlers.info(undefined)).toEqual(info);
        await handlers.title({ title: `Acme\u0007 ${"x".repeat(300)}` });
        expect(window.title).toBe(`Acme ${"x".repeat(195)}`);
        expect(await handlers.open({ url: "https://acme.test/docs" })).toBe(true);
        expect(await handlers.open({ url: "file:///etc/passwd" })).toBe(false);
        expect(await handlers.open({ url: "javascript:alert(1)" })).toBe(false);
        expect(await handlers.open({ url: "https://user:pass@acme.test" })).toBe(false);
        expect(calls).toEqual([{ name: "openExternal", args: ["https://acme.test/docs"] }]);

    });
    it("platform names and safe urls", () => {

        expect(platformOf("linux")).toBe("linux");
        expect(platformOf("darwin")).toBe("macos");
        expect(platformOf("win32")).toBe("windows");
        expect(platformOf("freebsd")).toBe("unknown");
        expect(safeUrl("http://localhost:8100") && safeUrl("https://a.test") && !safeUrl("ftp://a.test") && !safeUrl("nope")).toBe(true);

    });

});
