import { BrowserView, BrowserWindow, type RPCSchema, Utils } from "electrobun/main";
import { VIEWS_FOLDER } from "electrobun/main/paths";
import type { Info, Marks, Platform, Request, Requests, Spoken } from "./contract.ts";
import { page, spoken, timeout } from "./contract.ts";

export type Schema = {
    bun: RPCSchema<{ requests: Requests; messages: Marks }>;
    webview: RPCSchema<{ requests: Record<never, never>; messages: Record<never, never> }>;
};
export type Handlers = { [K in Request]: ( params: Requests[K]["params"] ) => Requests[K]["response"] | Promise<Requests[K]["response"]> };
export type Window = Pick<BrowserWindow<unknown>, "setTitle" | "show">;

const platforms: Readonly<Record<string, Platform>> = { linux: "linux", darwin: "macos", win32: "windows" };
const longest = 200;
const revealAfter = 2000;

export function platformOf ( name: string ): Platform {

    return platforms[name] ?? "unknown";

}
export function printable ( text: string ): string {

    return Array.from(text).filter(( char ) => {

        const code = char.codePointAt(0) ?? 0;

        return code >= 32 && code !== 127;

    }).join("");

}
export function safeUrl ( url: string ): boolean {

    try {

        const parsed = new URL(url);

        return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.username === "" && parsed.password === "";

    } catch {

        return false;

    }

}
export function handlersOf ( window: () => Window, info: Info ): Handlers {

    return {
        info: () => info,
        title: ({ title }) => {

            window().setTitle(printable(title).slice(0, longest));

        },
        open: ({ url }) => (safeUrl(url) ? Utils.openExternal(url) : false),
    };

}
export async function speech (): Promise<Spoken> {

    return (await Bun.file(`${VIEWS_FOLDER}/${page}/${spoken}`).json()) as Spoken;

}
export async function boot (): Promise<BrowserWindow<unknown>> {

    const told = await speech();
    const info: Info = { platform: platformOf(process.platform), arch: process.arch, runtime: Bun.version, name: told.name, identity: told.identity, version: told.version };
    let opened: BrowserWindow<unknown> | undefined;
    const window = (): BrowserWindow<unknown> => {

        if ( !opened ) throw new Error("The window is not open yet.");

        return opened;

    };
    const rpc = BrowserView.defineRPC<Schema>({
        maxRequestTime: timeout,
        handlers: {
            requests: handlersOf(window, info),
            messages: {
                ready: () => {

                    window().show();

                },
            },
        },
    });

    opened = new BrowserWindow({
        title: told.name,
        url: `views://${page}/index.html`,
        frame: { width: told.window.width, height: told.window.height },
        hidden: true,
        sandbox: true,
        rpc,
    });

    setTimeout(() => window().show(), revealAfter);

    return opened;

}
