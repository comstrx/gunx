import * as device from "engine/device";
import { bench, do_not_optimize, run } from "mitata";

type Sink = Parameters<NonNullable<device.Host["addEventListener"]>>[1];

const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
const endless = `Mozilla/5.0 (${"x".repeat(8192)}) Chrome/126.0.0.0`;
const hints: device.Hints = { platform: "Android", mobile: true, touch: 5 };
const sinks = new Set<Sink>();
const host: device.Host = {
    navigator: {
        userAgent: chrome,
        language: "ar-EG",
        languages: ["ar-EG", "en"],
        onLine: true,
        maxTouchPoints: 0,
        setAppBadge: async () => undefined,
        clearAppBadge: async () => undefined,
        clipboard: { writeText: async () => undefined, readText: async () => "copied" },
    },
    document: { visibilityState: "visible", hasFocus: () => true },
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 2,
    open: () => undefined,
    addEventListener: ( _, handler ) => { sinks.add(handler); },
    removeEventListener: ( _, handler ) => { sinks.delete(handler); },
};
const made = device.webAdapter(host);

if ( !made ) throw new Error("no web adapter");

const quiet = device.create(device.unknown);
const unit = device.create(made);
const wide = device.create(made, { schemes: ["http", "https", "mailto", "tel", "myapp", "intent"] });
const pressed: device.Key = { key: "k", code: "KeyK", ctrl: true, meta: false, shift: false, alt: false, repeat: false };
const foreign: device.Key = { key: "л", code: "KeyK", ctrl: true, meta: false, shift: false, alt: false, repeat: false };
const asked: device.Key = { key: "?", code: "Slash", ctrl: false, meta: false, shift: true, alt: false, repeat: false };
const wanted = device.combo("mod+k");
const help = device.combo("?");
const chord = device.combo("ctrl+alt+shift+delete");
const table: Record<string, ( key: device.Key ) => void> = {};
const strike = { key: "p", code: "KeyP", ctrlKey: false, metaKey: true, shiftKey: false, altKey: false, repeat: false };
const stray = { key: "F9", code: "F9", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false };
const long = `https://app.example/${"a".repeat(8000)}`;
let hits = 0;

for ( const letter of "abcdefghijklmnop" ) table[`mod+${letter}`] = () => { hits += 1; };

unit.hotkeys(table);

function fire ( event: object ): number {

    for ( const sink of sinks ) sink(event as never);

    return hits;

}

bench("device.parseAgent", () => do_not_optimize(device.parseAgent(android)));
bench("device.parseAgent.desktop", () => do_not_optimize(device.parseAgent(chrome)));
bench("device.parseAgent.phone", () => do_not_optimize(device.parseAgent(phone)));
bench("device.parseAgent.edge", () => do_not_optimize(device.parseAgent(edge)));
bench("device.parseAgent.hints", () => do_not_optimize(device.parseAgent(chrome, hints)));
bench("device.parseAgent.empty", () => do_not_optimize(device.parseAgent("")));
bench("device.parseAgent.capped", () => do_not_optimize(device.parseAgent(endless)));
bench("device.orientationOf", () => do_not_optimize(device.orientationOf(1280, 800)));
bench("device.unknownInfo", () => do_not_optimize(device.unknownInfo()));
bench("device.combo", () => do_not_optimize(device.combo("mod+shift+k")));
bench("device.combo.single", () => do_not_optimize(device.combo("k")));
bench("device.combo.spaced", () => do_not_optimize(device.combo("  Ctrl + Shift + +  ")));
bench("device.combo.aliases", () => do_not_optimize(device.combo("cmd+option+esc", true)));
bench("device.combos", () => do_not_optimize(device.combos("mod+k, esc, ctrl+shift+p, /")));
bench("device.combos.one", () => do_not_optimize(device.combos("mod+k")));
bench("device.combos.plus", () => do_not_optimize(device.combos("ctrl++, +, ctrl+k")));
bench("device.describe", () => do_not_optimize(device.describe(chord)));
bench("device.describe.mac", () => do_not_optimize(device.describe(chord, true)));
bench("device.matches", () => do_not_optimize(device.matches(pressed, wanted)));
bench("device.matches.miss", () => do_not_optimize(device.matches(pressed, chord)));
bench("device.matches.layout", () => do_not_optimize(device.matches(foreign, wanted)));
bench("device.matches.symbol", () => do_not_optimize(device.matches(asked, help)));
bench("device.targetOf", () => do_not_optimize(device.targetOf("https://app.example/orders/7?tab=a#top")));
bench("device.targetOf.path", () => do_not_optimize(device.targetOf("/orders/7")));
bench("device.targetOf.mail", () => do_not_optimize(device.targetOf("mailto:a@a.example")));
bench("device.targetOf.refused", () => do_not_optimize(device.targetOf("javascript:alert(1)")));
bench("device.targetOf.long", () => do_not_optimize(device.targetOf(long)));
bench("device.targetOf.custom", () => do_not_optimize(device.targetOf("MyApp://open/7", ["http", "https", "myapp"])));
bench("device.create", () => do_not_optimize(device.create(device.unknown)));
bench("device.create.web", () => do_not_optimize(device.create(made)));
bench("device.webAdapter", () => do_not_optimize(device.webAdapter(host)));
bench("device.info", () => do_not_optimize(unit.info()));
bench("device.facts", () => do_not_optimize(unit.facts()));
bench("device.facts.unknown", () => do_not_optimize(quiet.facts()));
bench("device.is", () => do_not_optimize(unit.is("web")));
bench("device.can", () => do_not_optimize(unit.can("badge")));
bench("device.capabilities", () => do_not_optimize(unit.capabilities()));
bench("device.hotkeys.hit", () => do_not_optimize(fire(strike)));
bench("device.hotkeys.miss", () => do_not_optimize(fire(stray)));
bench("device.hotkey.bind", () => do_not_optimize(unit.hotkey("mod+k, esc", () => undefined)()));
bench("device.open", async () => do_not_optimize(await unit.open("https://app.example/orders/7")));
bench("device.open.refused", async () => do_not_optimize(await unit.open("javascript:alert(1)")));
bench("device.open.custom", async () => do_not_optimize(await wide.open("myapp://open/7")));
bench("device.badge", async () => do_not_optimize(await unit.badge(7)));
bench("device.badge.clear", async () => do_not_optimize(await unit.badge(0)));
bench("device.copy", async () => do_not_optimize(await unit.copy("copied")));
bench("device.paste", async () => do_not_optimize(await unit.paste()));
bench("device.state", async () => do_not_optimize(await unit.state("location")));
bench("device.absent", async () => do_not_optimize(await quiet.share({ title: "a" })));
bench("device.require.refused", async () => do_not_optimize(await quiet.require("camera").catch(( fault: unknown ) => fault)));

await run();
