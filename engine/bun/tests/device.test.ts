import { describe, expect, test as it } from "bun:test";
import * as device from "engine/device";

type Listener = ( event: never ) => void;
type Browser = NonNullable<device.Host["navigator"]>;
type Page = NonNullable<device.Host["document"]>;
type Input = ReturnType<NonNullable<Page["createElement"]>>;
type Fix = Parameters<Parameters<NonNullable<Browser["geolocation"]>["getCurrentPosition"]>[0]>[0];
type Wire = { addEventListener: ( name: string, handler: Listener ) => void; removeEventListener: ( name: string, handler: Listener ) => void };
type Rig = {
    host: device.Host;
    browser: Browser;
    page: Page;
    calls: string[];
    media: Record<string, boolean>;
    target: ( label: string ) => Wire;
    fire: ( label: string, name: string, event?: unknown ) => void;
    count: ( label: string, name: string ) => number;
};

function host (): device.Host & { fire: ( name: string, event?: unknown ) => void; created: { files: File[]; clicked: boolean } } {

    const listeners = new Map<string, Set<Listener>>();
    const created = { files: [] as File[], clicked: false };
    const on = ( name: string, handler: Listener ): void => { listeners.set(name, new Set([...(listeners.get(name) ?? []), handler])); };
    const off = ( name: string, handler: Listener ): void => { listeners.get(name)?.delete(handler); };
    let permission = "default";
    const made: device.Host & { fire: ( name: string, event?: unknown ) => void; created: typeof created } = {
        created,
        fire: ( name, event = {} ) => { for ( const handler of listeners.get(name) ?? [] ) handler(event as never); },
        navigator: {
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Chrome/120 Safari/537.36",
            language: "ar-EG",
            languages: ["ar-EG", "en"],
            onLine: true,
            maxTouchPoints: 0,
            connection: { type: "wifi", addEventListener: on, removeEventListener: off },
            permissions: { query: async ({ name }) => ({ state: name === "geolocation" ? "granted" : "prompt" }) },
            geolocation: {
                getCurrentPosition: ( ok ) => ok({ coords: { latitude: 30, longitude: 31, accuracy: 5, speed: 2, heading: null }, timestamp: 7 }),
                watchPosition: ( ok ) => { ok({ coords: { latitude: 30.1, longitude: 31.1, accuracy: 9 }, timestamp: 8 }); return 1; },
                clearWatch: () => undefined,
            },
            clipboard: { writeText: async () => undefined, readText: async () => "pasted" },
            share: async () => undefined,
            canShare: ( data ) => (data as { url?: string }).url !== "nope",
            vibrate: () => true,
            getBattery: async () => ({ level: 0.5, charging: true }),
        },
        Notification: class {
            static get permission () { return permission; }
            static requestPermission = async () => { permission = "granted"; return "granted"; };
            constructor ( public title: string ) { created.clicked = true; }
        } as unknown as NonNullable<device.Host["Notification"]>,
        matchMedia: ( query ) => ({ matches: query.includes("dark"), addEventListener: on as never, removeEventListener: off as never }),
        innerWidth: 1200,
        innerHeight: 800,
        devicePixelRatio: 2,
        document: {
            visibilityState: "visible",
            hasFocus: () => true,
            createElement: () => ({ type: "", accept: "", multiple: false, capture: "", onchange: null, oncancel: null, files: created.files, click: () => { created.clicked = true; (made.document as { last?: unknown }).last = undefined; } }),
            addEventListener: on,
            removeEventListener: off,
        },
        addEventListener: on,
        removeEventListener: off,
        open: () => ({}),
        getComputedStyle: () => ({ getPropertyValue: ( name ) => (name.endsWith("top") ? "44px" : "") }),
    };

    return made;

}
function rig (): Rig {

    const heard = new Map<string, Set<Listener>>();
    const calls: string[] = [];
    const media: Record<string, boolean> = {};
    const target = ( label: string ): Wire => ({
        addEventListener: ( name, handler ) => { heard.set(`${label}:${name}`, new Set([...(heard.get(`${label}:${name}`) ?? []), handler])); },
        removeEventListener: ( name, handler ) => { heard.get(`${label}:${name}`)?.delete(handler); },
    });
    const browser: Browser = {};
    const page: Page = { ...target("page") };
    const made: device.Host = {
        ...target("host"),
        navigator: browser,
        document: page,
        matchMedia: ( query ) => ({ get matches () { return media[query] === true; }, ...target(query) }),
    };

    return {
        host: made,
        browser,
        page,
        calls,
        media,
        target,
        fire: ( label, name, event = {} ) => { for ( const handler of [...(heard.get(`${label}:${name}`) ?? [])] ) handler(event as never); },
        count: ( label, name ) => heard.get(`${label}:${name}`)?.size ?? 0,
    };

}
function web ( given: device.Host, options?: device.Options ): device.Device {

    const made = device.webAdapter(given);

    if ( !made ) throw new Error("no web adapter");

    return device.create(made, options);

}
async function settle ( turns = 8 ): Promise<void> {

    for ( let turn = 0; turn < turns; turn += 1 ) await Promise.resolve();

}

describe("device", () => {

    it("agents parse, the unknown device is honest and the fallback device refuses nothing loudly", async () => {

        expect(device.parseAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Mobile/15E148 Safari/604.1")).toEqual({ os: "ios", version: "17.0", browser: "safari", mobile: true });
        expect(device.parseAgent("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari")).toEqual({ os: "android", version: "14", browser: "chrome", mobile: true });
        expect(device.parseAgent("Mozilla/5.0 (Windows NT 10.0) Edg/120 Chrome/120 Safari")).toEqual({ os: "windows", version: "10.0", browser: "edge", mobile: false });
        expect(device.parseAgent("Mozilla/5.0 (iPad) Safari")).toEqual({ os: "ios", version: "", browser: "safari", mobile: false });
        expect(device.parseAgent("curl/8")).toEqual({ os: "unknown", version: "", browser: "unknown", mobile: false });
        expect(device.unknownInfo().platform).toBe("server");
        expect(device.orientationOf(10, 20)).toBe("portrait");
        expect(device.webAdapter()).toBeUndefined();

        const server = device.create();

        expect(server.is("server") && !server.is("web")).toBe(true);
        expect(server.capabilities()).toEqual([]);
        expect(server.can("share")).toBe(false);
        expect(server.facts()).toMatchObject({ platform: "server", os: "unknown", viewport: "0x0", online: true });
        expect(server.watch("online", () => undefined)()).toBeUndefined();
        expect(await server.ask("camera")).toBe("unsupported");
        expect(await server.copy("x")).toBe(false);
        expect(await server.pick()).toEqual([]);
        expect(await server.position()).toBeUndefined();
        await expect(server.require("location")).rejects.toMatchObject({ code: "unavailable", reason: "device.location.unsupported", errors: { location: ["unsupported"] } });
        expect(() => server.hotkey("mod+k", () => undefined)()).not.toThrow();

    });
    it("key combos parse, match and describe per platform", () => {

        expect(device.combo("mod+shift+K", true)).toEqual({ key: "k", ctrl: false, meta: true, shift: true, alt: false });
        expect(device.combo("mod+k")).toEqual({ key: "k", ctrl: true, meta: false, shift: false, alt: false });
        expect(device.combo("Esc").key).toBe("escape");
        expect(device.combo("ctrl+alt+Up")).toEqual({ key: "arrowup", ctrl: true, meta: false, shift: false, alt: true });
        expect(device.matches({ key: "K", code: "KeyK", ctrl: true, meta: false, shift: false, alt: false, repeat: false }, device.combo("ctrl+k"))).toBe(true);
        expect(device.matches({ key: "k", code: "KeyK", ctrl: false, meta: false, shift: false, alt: false, repeat: false }, device.combo("ctrl+k"))).toBe(false);
        expect(device.describe(device.combo("mod+shift+k", true), true)).toBe("⇧⌘K");
        expect(device.describe(device.combo("mod+space"))).toBe("Ctrl+Space");
        expect(device.describe(device.combo("alt+left"))).toBe("Alt+Left");

    });
    it("a custom adapter drives the device and hotkeys follow its platform", () => {

        const keys: (( key: device.Key ) => void)[] = [];
        const info = { ...device.unknownInfo(), platform: "desktop" as const, os: "macos" };
        const unit = device.create({ info: () => info, watch: () => () => undefined, keys: ( listener ) => { keys.push(listener); return () => { keys.pop(); }; }, copy: async () => true });
        const hits: string[] = [];
        const stop = unit.hotkey("mod+k, esc", ( key ) => { hits.push(key.key); });

        keys[0]?.({ key: "k", code: "KeyK", ctrl: false, meta: true, shift: false, alt: false, repeat: false });
        keys[0]?.({ key: "k", code: "KeyK", ctrl: true, meta: false, shift: false, alt: false, repeat: false });
        keys[0]?.({ key: "Escape", code: "Escape", ctrl: false, meta: false, shift: false, alt: false, repeat: false });
        expect(hits).toEqual(["k", "Escape"]);
        expect(unit.capabilities()).toEqual(["copy", "keys"]);
        expect(unit.can("copy") && !unit.can("share")).toBe(true);
        stop();
        expect(keys).toHaveLength(0);

        const restore = device.port.use({ info: () => info, watch: () => () => undefined });

        expect(device.create().is("desktop")).toBe(true);
        restore();
        expect(device.create().is("server")).toBe(true);

    });
    it("the web adapter reads the host, watches it, asks permissions and reaches its capabilities", async () => {

        const fake = host();
        const made = device.webAdapter(fake);

        expect(made).toBeDefined();

        if ( !made ) return;

        const unit = device.create(made);
        const facts = unit.info();

        expect(facts).toMatchObject({ platform: "web", os: "macos", version: "14.5", browser: "chrome", mobile: false, language: "ar-EG", languages: ["ar-EG", "en"], online: true, network: "wifi", scheme: "dark", width: 1200, height: 800, pixelRatio: 2, orientation: "landscape", visible: true, focused: true });
        expect(facts.insets.top).toBe(44);
        expect(unit.facts().viewport).toBe("1200x800");

        const seen: string[] = [];
        const stops = [unit.watch("online", () => { seen.push("online"); }), unit.watch("scheme", () => { seen.push("scheme"); }), unit.watch("visibility", () => { seen.push("visibility"); }), unit.watch("network", () => { seen.push("network"); }), unit.watch("size", () => { seen.push("size"); })];

        fake.fire("offline");
        fake.fire("change");
        fake.fire("visibilitychange");
        fake.fire("resize");
        expect(seen.sort()).toEqual(["network", "online", "scheme", "size", "visibility"]);

        for ( const stop of stops ) stop();

        fake.fire("offline");
        expect(seen).toHaveLength(5);
        expect(await unit.state("location")).toBe("granted");
        expect(await unit.state("camera")).toBe("unsupported");
        expect(await unit.state("notifications")).toBe("prompt");
        expect(await unit.state("contacts")).toBe("unsupported");
        expect(await unit.ask("notifications")).toBe("granted");
        expect(await unit.ask("location")).toBe("granted");
        expect(await unit.ask("clipboard")).toBe("granted");
        expect(await unit.ask("camera")).toBe("unsupported");
        await unit.require("notifications");
        expect(await unit.notify({ title: "hi" })).toBe(true);
        expect(await unit.copy("x") && (await unit.paste()) === "pasted").toBe(true);
        expect(await unit.share({ url: "https://a.io" }) && !(await unit.share({ url: "nope" }))).toBe(true);
        expect(unit.vibrate(10)).toBe(true);
        expect(await unit.open("https://a.io") && !(await unit.open("settings"))).toBe(true);
        expect(await unit.battery()).toEqual({ level: 0.5, charging: true });
        expect(await unit.position()).toEqual({ lat: 30, lng: 31, accuracy: 5, speed: 2, at: 7 });

        const positions: device.Position[] = [];

        unit.follow({ accuracy: "high" }, ( position ) => { positions.push(position); })();
        expect(positions).toEqual([{ lat: 30.1, lng: 31.1, accuracy: 9, at: 8 }]);
        expect(await unit.media({ video: true })).toBeUndefined();

        const pressed: device.Key[] = [];
        const stopKeys = unit.keys(( key ) => { pressed.push(key); });

        fake.fire("keydown", { key: "k", code: "KeyK", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, repeat: false, target: { tagName: "DIV" } });
        fake.fire("keydown", { key: "a", code: "KeyA", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false, target: { tagName: "INPUT" } });
        expect(pressed.map(( key ) => [key.key, key.typing])).toEqual([["k", false], ["a", true]]);
        stopKeys();
        expect(unit.capabilities()).toContain("pick");
        expect(device.bindWeb(fake)).toBe(true);
        expect(device.create().is("web")).toBe(true);
        device.port.reset();
        expect(device.create().is("server")).toBe(true);

        await expect(device.create({ info: device.unknownInfo, watch: () => () => undefined, ask: async () => "denied" }).require("camera")).rejects.toMatchObject({ errors: { camera: ["denied"] } });

    });
    it("real user agents name their system, version, browser and form, and hints outrank the text", () => {

        const webkit = "AppleWebKit/605.1.15 (KHTML, like Gecko)";
        const blink = "AppleWebKit/537.36 (KHTML, like Gecko)";
        const mac = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${webkit} Version/17.5 Safari/605.1.15`;
        const phone = `Mozilla/5.0 (Linux; Android 14; Pixel 8) ${blink} Chrome/126.0.0.0 Mobile Safari/537.36`;
        const rows: [string, device.Hints | undefined, string][] = [
            [`Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ${webkit} Version/17.5 Mobile/15E148 Safari/604.1`, undefined, "ios|17.5|safari|true"],
            [`Mozilla/5.0 (iPod touch; CPU iPhone OS 15_8 like Mac OS X) ${webkit} Version/15.6 Mobile/15E148 Safari/604.1`, undefined, "ios|15.8|safari|true"],
            [`Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) ${webkit} Version/16.6 Mobile/15E148 Safari/604.1`, undefined, "ios|16.6|safari|false"],
            [`Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ${webkit} CriOS/126.0.0.0 Mobile/15E148 Safari/604.1`, undefined, "ios|17.5|chrome|true"],
            [`Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ${webkit} FxiOS/127.0 Mobile/15E148 Safari/605.1.15`, undefined, "ios|17.5|firefox|true"],
            [`Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ${webkit} Version/17.0 EdgiOS/126.0.0.0 Mobile/15E148 Safari/605.1.15`, undefined, "ios|17.5|edge|true"],
            [mac, undefined, "macos|10.15|safari|false"],
            [mac, { touch: 1 }, "macos|10.15|safari|false"],
            [mac, { touch: 5 }, "ios||safari|false"],
            [phone, undefined, "android|14|chrome|true"],
            [phone, { mobile: false }, "android|14|chrome|false"],
            [`Mozilla/5.0 (Linux; Android 13; SM-X710) ${blink} Chrome/126.0.0.0 Safari/537.36`, undefined, "android|13|chrome|false"],
            [`Mozilla/5.0 (Linux; Android 14; SM-S918B) ${blink} SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36`, undefined, "android|14|samsung|true"],
            [`Mozilla/5.0 (Linux; Android 10; K) ${blink} Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0`, undefined, "android|10|edge|true"],
            [`Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A; wv) ${blink} Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36`, undefined, "android|14|chrome|true"],
            [`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${blink} Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0`, undefined, "windows|10.0|edge|false"],
            [`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${blink} Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0`, undefined, "windows|10.0|opera|false"],
            [`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${blink} Chrome/126.0.0.0 Safari/537.36`, { platform: "Unknown", touch: 5 }, "windows|10.0|chrome|false"],
            ["Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0", undefined, "linux||firefox|false"],
            [`Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) ${blink} Chrome/126.0.0.0 Safari/537.36`, undefined, "chromeos|14541.0|chrome|false"],
            [`Mozilla/5.0 (X11; Linux x86_64) ${blink} Chrome/126.0.0.0 Safari/537.36`, { platform: " ANDROID ", mobile: true }, "android||chrome|true"],
            [`Mozilla/5.0 (X11; Linux x86_64) ${blink} Chrome/126.0.0.0 Safari/537.36`, { platform: "Chrome OS" }, "chromeos||chrome|false"],
            ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", undefined, "unknown||unknown|false"],
            ["", undefined, "unknown||unknown|false"],
            [`${"x".repeat(1018)}iPhone`, undefined, "ios||unknown|true"],
            [`${"x".repeat(1019)}iPhone`, undefined, "unknown||unknown|false"],
        ];

        for ( const [text, hints, wanted] of rows ) expect(Object.values(device.parseAgent(text, hints)).join("|")).toBe(wanted);

        const first = device.unknownInfo();

        first.insets.top = 9;
        first.languages.push("x");
        expect(device.unknownInfo()).toMatchObject({ insets: { top: 0 }, languages: ["en"], pointer: "fine", contrast: "normal", scheme: "light", timeZone: "UTC" });
        expect(device.unknown.info()).toEqual(device.unknownInfo());
        expect(device.unknown.watch("size", () => undefined)()).toBeUndefined();
        expect([device.orientationOf(10, 10), device.orientationOf(11, 10), device.orientationOf(Number.NaN, 5), device.orientationOf(5, Number.NaN)]).toEqual(["portrait", "landscape", "portrait", "portrait"]);

    });
    it("a combo reads modifiers, aliases and the plus and comma keys, alone or in a list", () => {

        const told = ( text: string, mac = false ): string[] => device.combos(text, mac).map(( one ) => device.describe(one, mac));
        const names: [string, string][] = [
            ["esc", "escape"], ["return", "enter"], ["space", " "], ["spacebar", " "], ["up", "arrowup"], ["down", "arrowdown"], ["left", "arrowleft"], ["right", "arrowright"],
            ["del", "delete"], ["ins", "insert"], ["pgup", "pageup"], ["pgdn", "pagedown"], ["plus", "+"], ["comma", ","], ["F5", "f5"], ["Tab", "tab"], ["-", "-"], ["/", "/"],
        ];

        for ( const [text, key] of names ) expect(device.combo(`ctrl+${text}`)).toEqual({ key, ctrl: true, meta: false, shift: false, alt: false });

        expect(device.combo(" CTRL + K ")).toEqual({ key: "k", ctrl: true, meta: false, shift: false, alt: false });
        expect(device.combo("control+command+option+shift+x")).toEqual({ key: "x", ctrl: true, meta: true, shift: true, alt: true });
        expect([device.combo("win+e").meta, device.combo("cmd+e").meta, device.combo("meta+e").meta, device.combo("alt+e").alt]).toEqual([true, true, true, true]);
        expect([device.combo("mod+k", true).meta, device.combo("mod+k", true).ctrl, device.combo("mod+k").ctrl, device.combo("mod+k").meta]).toEqual([true, false, true, false]);
        expect(device.combo("ctrl+k+j").key).toBe("j");
        expect([device.combo("+").key, device.combo("++").key, device.combo("ctrl++").key, device.combo("ctrl+shift").key, device.combo("").key, device.combo("ctrl+ ").key]).toEqual(["+", "+", "+", "", "", ""]);
        expect(device.combo("ctrl++")).toEqual({ key: "+", ctrl: true, meta: false, shift: false, alt: false });
        expect(told("ctrl++, ctrl+k")).toEqual(["Ctrl++", "Ctrl+K"]);
        expect(["ctrl + +", "ctrl+ +", "+ +", " + ", "ctrl + shift + +", "ctrl +\t+"].map(( text ) => device.describe(device.combo(text)))).toEqual(["Ctrl++", "Ctrl++", "+", "+", "Ctrl+Shift++", "Ctrl++"]);
        expect([told("ctrl + +, ctrl + k"), told("ctrl + + , k"), told("ctrl + , , k"), told("+ , +")]).toEqual([["Ctrl++", "Ctrl+K"], ["Ctrl++", "K"], ["Ctrl+,", "K"], ["+", "+"]]);
        expect([told("a, +, b"), told("a,+,b"), told("ctrl+k, +, ctrl+,"), told("ctrl+,,+,k")]).toEqual([["A", "+", "B"], ["A", "+", "B"], ["Ctrl+K", "+", "Ctrl+,"], ["Ctrl+,", "+", "K"]]);
        expect(told("ctrl+k, ctrl++")).toEqual(["Ctrl+K", "Ctrl++"]);
        expect(told("shift++,alt+plus")).toEqual(["Shift++", "Alt++"]);
        expect(told("+, k")).toEqual(["+", "K"]);
        expect(told("ctrl+, , ctrl+k")).toEqual(["Ctrl+,", "Ctrl+K"]);
        expect(told("ctrl + , ")).toEqual(["Ctrl+,"]);
        expect(told("ctrl+comma")).toEqual(["Ctrl+,"]);
        expect(told("k,,j, ,")).toEqual(["K", "J"]);
        expect(told("ctrl+shift, alt")).toEqual([]);
        expect(told("")).toEqual([]);
        expect(told("mod+k, mod+shift+p", true)).toEqual(["⌘K", "⇧⌘P"]);
        expect(device.describe(device.combo("ctrl+alt+shift+meta+x"))).toBe("Ctrl+Alt+Shift+Win+X");
        expect(device.describe(device.combo("ctrl+alt+shift+meta+x"), true)).toBe("⌃⌥⇧⌘X");
        expect(["esc", "pgup", "up", "space", "f5", "del", "enter"].map(( text ) => device.describe(device.combo(text)))).toEqual(["Escape", "Pageup", "Up", "Space", "F5", "Delete", "Enter"]);
        expect(device.describe(device.combo("mod+enter", true), true)).toBe("⌘Enter");

    });
    it("a press matches by the key it types, by the physical key on another layout, and never by a stray modifier", () => {

        const press = ( key: string, code: string, held = "" ): device.Key => ({ key, code, ctrl: held.includes("c"), meta: held.includes("m"), shift: held.includes("s"), alt: held.includes("a"), repeat: false });
        const rows: [device.Key, string, boolean][] = [
            [press("k", "KeyK", "c"), "ctrl+k", true],
            [press("K", "KeyK", "c"), "ctrl+k", true],
            [press("ن", "KeyK", "c"), "ctrl+k", true],
            [press("a", "KeyQ", "c"), "ctrl+a", true],
            [press("q", "KeyA", "c"), "ctrl+a", false],
            [press("k", "KeyK"), "k", true],
            [press("k", "KeyK"), "ctrl+k", false],
            [press("k", "KeyK", "cs"), "ctrl+k", false],
            [press("k", "KeyK", "ca"), "ctrl+k", false],
            [press("k", "KeyK", "cm"), "ctrl+k", false],
            [press("k", "KeyK", "m"), "ctrl+k", false],
            [press("?", "Slash", "s"), "?", true],
            [press("?", "Slash"), "?", true],
            [press("?", "Slash", "s"), "shift+?", true],
            [press("?", "Slash"), "shift+?", false],
            [press("!", "Digit1", "s"), "shift+1", true],
            [press("!", "Digit1", "s"), "1", false],
            [press("&", "Digit1"), "1", true],
            [press("1", "Digit1"), "1", true],
            [press("+", "Equal", "cs"), "ctrl++", true],
            [press("+", "NumpadAdd", "c"), "ctrl++", true],
            [press("=", "Equal", "c"), "ctrl++", false],
            [press("ك", "Semicolon", "c"), "ctrl+;", false],
            [press("Dead", "KeyE", "a"), "alt+e", true],
            [press("Unidentified", "", "c"), "ctrl+k", false],
            [press("Escape", "Escape"), "esc", true],
            [press("ArrowUp", "ArrowUp", "a"), "alt+up", true],
            [press(" ", "Space", "c"), "ctrl+space", true],
            [press("Enter", "NumpadEnter"), "return", true],
            [press("k", "KeyK", "c"), "ctrl", false],
            [press("", "", "c"), "ctrl", false],
        ];

        for ( const [pressed, text, wanted] of rows ) expect([text, pressed.key, device.matches(pressed, device.combo(text))]).toEqual([text, pressed.key, wanted]);

        expect(device.matches({ ...press("k", "KeyK", "c"), key: undefined as never }, device.combo("ctrl+k"))).toBe(false);
        expect(device.matches({ ...press("k", "KeyK", "c"), repeat: true }, device.combo("ctrl+k"))).toBe(true);

    });
    it("a link target is trimmed, bounded and held to its scheme allowlist", () => {

        const rows: [string, string | undefined][] = [
            ["https://a.io", "https://a.io"], [" HTTPS://A.io\n", "HTTPS://A.io"], ["/path?x=1", "/path?x=1"], ["//other.example/x", "//other.example/x"], ["settings", "settings"], ["a b:c", "a b:c"], ["1x:y", "1x:y"],
            ["mailto:a@b.example", "mailto:a@b.example"], ["tel:+201000000000", "tel:+201000000000"], ["sms:+201000000000", "sms:+201000000000"], ["geo:30,31", "geo:30,31"],
            ["javascript:alert(1)", undefined], [" JaVaScRiPt:x", undefined], ["java\tscript:x", undefined], [`${String.fromCharCode(1)}javascript:x`, undefined], [`${String.fromCharCode(0xfeff)}javascript:x`, undefined],
            ["data:text/html,x", undefined], ["vbscript:x", undefined], ["file:///etc/hosts", undefined], ["blob:https://a.io/1", undefined], ["intent://x#Intent;end", undefined], ["C:\\x", undefined],
            ["", undefined], ["   ", undefined], [`/a${String.fromCharCode(127)}`, undefined], [`/a${String.fromCharCode(0)}b`, undefined], ["/".padEnd(8193, "a"), undefined],
        ];

        for ( const [text, wanted] of rows ) expect([text, device.targetOf(text)]).toEqual([text, wanted]);

        expect(device.targetOf("/".padEnd(8192, "a"))).toHaveLength(8192);
        expect([device.targetOf("myapp://x"), device.targetOf("myapp://x", ["myapp"]), device.targetOf("MYAPP://x", ["myapp"]), device.targetOf("myapp://x", ["MyApp"])]).toEqual([undefined, "myapp://x", "MYAPP://x", "myapp://x"]);
        expect([device.targetOf("https://a.io", []), device.targetOf("/local", []), device.targetOf("https://a.io", ["http"])]).toEqual([undefined, "/local", undefined]);
        expect([device.targetOf(undefined as never), device.targetOf(null as never), device.targetOf(42 as never), device.targetOf({} as never)]).toEqual([undefined, undefined, undefined, undefined]);

    });
    it("the web adapter needs a navigator and a document, and reads a silent host as calm defaults", () => {

        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

        expect([device.webAdapter({}), device.webAdapter({ navigator: {} }), device.webAdapter({ document: {} })]).toEqual([undefined, undefined, undefined]);
        expect(device.bindWeb({})).toBe(false);
        expect(device.create().is("server")).toBe(true);

        const silent = web({ navigator: {}, document: {} });

        expect(silent.info()).toEqual({ ...device.unknownInfo(), platform: "web", timeZone: zone });
        expect(silent.capabilities()).toEqual(["ask", "state"]);
        expect(silent.facts()).toEqual({ platform: "web", os: "unknown", version: "", browser: "unknown", mobile: false, language: "en", timeZone: zone, scheme: "light", viewport: "0x0", online: true, network: "unknown" });
        expect(silent.watch("size", () => undefined)()).toBeUndefined();
        expect(silent.watch("scheme", () => undefined)()).toBeUndefined();
        expect(silent.watch("network", () => undefined)()).toBeUndefined();
        expect(silent.watch("nothing" as never, () => undefined)()).toBeUndefined();

    });
    it("every fact follows the host live: agent, languages, pointer, contrast, network, insets, focus and install", () => {

        const r = rig();
        const unit = web(r.host);
        const seen: unknown[] = [];
        const links: [NonNullable<Browser["connection"]>, device.Network][] = [
            [{ type: "wifi" }, "wifi"], [{ type: "cellular" }, "cellular"], [{ type: "ethernet" }, "ethernet"], [{ type: "none" }, "none"],
            [{ type: "bluetooth" }, "unknown"], [{ type: "bluetooth", effectiveType: "3g" }, "cellular"], [{ effectiveType: "" }, "unknown"], [{}, "unknown"],
        ];
        const looks: [string[], Partial<device.Info>][] = [
            [[], { pointer: "fine", contrast: "normal", scheme: "light", reducedMotion: false, standalone: false }],
            [["(pointer: coarse)"], { pointer: "coarse" }],
            [["(pointer: none)"], { pointer: "none" }],
            [["(pointer: coarse)", "(pointer: none)"], { pointer: "coarse" }],
            [["(prefers-contrast: more)"], { contrast: "more" }],
            [["(prefers-contrast: less)"], { contrast: "less" }],
            [["(prefers-contrast: more)", "(prefers-contrast: less)"], { contrast: "more" }],
            [["(prefers-color-scheme: dark)"], { scheme: "dark" }],
            [["(prefers-reduced-motion: reduce)"], { reducedMotion: true }],
            [["(display-mode: standalone)"], { standalone: true }],
        ];

        Object.assign(r.browser, { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36", language: "", languages: ["ar-EG", "en"], onLine: false, maxTouchPoints: 5, connection: { effectiveType: "4g" } });
        Object.assign(r.host, { innerWidth: 900, innerHeight: 400, devicePixelRatio: 3 });
        expect(unit.info()).toMatchObject({ os: "android", version: "14", browser: "chrome", mobile: true, touch: true, language: "ar-EG", languages: ["ar-EG", "en"], online: false, network: "cellular", width: 900, height: 400, pixelRatio: 3, orientation: "landscape" });
        unit.info().languages.push("x");
        expect(r.browser.languages).toEqual(["ar-EG", "en"]);
        expect(unit.facts()).toMatchObject({ os: "android", mobile: true, language: "ar-EG", viewport: "900x400", online: false, network: "cellular" });

        r.browser.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
        r.browser.language = "fr";
        r.browser.languages = [];
        r.browser.maxTouchPoints = 0;
        expect(unit.info()).toMatchObject({ os: "windows", version: "10.0", browser: "edge", mobile: false, touch: false, language: "fr", languages: ["fr"] });
        r.browser.maxTouchPoints = 1;
        expect(unit.info().touch).toBe(true);
        r.browser.maxTouchPoints = 0;

        r.browser.userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";
        expect(unit.info()).toMatchObject({ os: "macos", version: "10.15", touch: false });
        r.browser.maxTouchPoints = 5;
        expect(unit.info()).toMatchObject({ os: "macos", version: "10.15", touch: true });
        expect(web(r.host).info()).toMatchObject({ os: "ios", version: "", browser: "safari", mobile: false, touch: true });

        for ( const [link, wanted] of links ) {

            r.browser.connection = link;
            expect(unit.info().network).toBe(wanted);

        }

        for ( const [on, wanted] of looks ) {

            for ( const query of Object.keys(r.media) ) r.media[query] = false;
            for ( const query of on ) r.media[query] = true;

            expect(unit.info()).toMatchObject(wanted);

        }

        r.media["(display-mode: standalone)"] = false;
        r.browser.standalone = true;
        expect(unit.info().standalone).toBe(true);
        r.page.visibilityState = "hidden";
        r.page.hasFocus = () => false;
        expect(unit.info()).toMatchObject({ visible: false, focused: false });
        r.page.visibilityState = "prerender";
        r.page.hasFocus = () => { throw new Error("detached"); };
        expect(unit.info()).toMatchObject({ visible: true, focused: true });

        const root = { lang: "ar" };
        const sides: Record<string, string> = { top: "12.5px", right: " 7", bottom: "abc", left: "" };

        r.host.getComputedStyle = ( element ) => { seen.push(element); return { getPropertyValue: ( name ) => sides[name.replace("--safe-area-inset-", "")] ?? "" }; };
        expect(unit.info().insets).toEqual({ top: 12.5, right: 7, bottom: 0, left: 0 });
        r.page.documentElement = root;
        expect(unit.info().insets).toEqual({ top: 12.5, right: 7, bottom: 0, left: 0 });
        expect(seen).toEqual([r.page, root]);
        r.host.getComputedStyle = () => ({ getPropertyValue: () => { throw new Error("gone"); } });
        expect(unit.info().insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
        r.host.getComputedStyle = () => { throw new Error("gone"); };
        expect(unit.info().insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });

        const hinted = rig();

        Object.assign(hinted.browser, { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36", userAgentData: { platform: "Android", mobile: true } });
        hinted.host.matchMedia = () => { throw new Error("no media"); };
        expect(web(hinted.host).info()).toMatchObject({ os: "android", version: "", browser: "chrome", mobile: true, pointer: "fine", contrast: "normal", scheme: "light", reducedMotion: false, standalone: false });
        expect(web(hinted.host).watch("contrast", () => undefined)()).toBeUndefined();

    });
    it("every watched fact listens on its own target, hears fresh facts and stops cleanly", () => {

        const r = rig();

        r.browser.connection = { type: "wifi", ...r.target("link") };

        const unit = web(r.host);
        const wired: [device.Watched, [string, string][]][] = [
            ["online", [["host", "online"], ["host", "offline"]]],
            ["size", [["host", "resize"], ["host", "orientationchange"]]],
            ["focus", [["host", "focus"], ["host", "blur"]]],
            ["language", [["host", "languagechange"]]],
            ["visibility", [["page", "visibilitychange"]]],
            ["network", [["link", "change"]]],
            ["scheme", [["(prefers-color-scheme: dark)", "change"]]],
            ["motion", [["(prefers-reduced-motion: reduce)", "change"]]],
            ["contrast", [["(prefers-contrast: more)", "change"], ["(prefers-contrast: less)", "change"]]],
        ];

        for ( const [what, targets] of wired ) {

            const seen: device.Info[] = [];
            const other: device.Info[] = [];
            const stop = unit.watch(what, ( info ) => { seen.push(info); });
            const rest = unit.watch(what, ( info ) => { other.push(info); });

            expect([what, targets.map(([label, name]) => r.count(label, name))]).toEqual([what, targets.map(() => 2)]);

            for ( const [label, name] of targets ) {

                r.host.innerWidth = seen.length + 100;
                r.fire(label, name);
                expect([what, seen.at(-1)?.width, other.at(-1)?.width]).toEqual([what, seen.length + 99, seen.length + 99]);

            }

            expect([seen.length, other.length]).toEqual([targets.length, targets.length]);
            stop();
            stop();
            expect(targets.map(([label, name]) => r.count(label, name))).toEqual(targets.map(() => 1));

            for ( const [label, name] of targets ) r.fire(label, name);

            expect([seen.length, other.length]).toEqual([targets.length, targets.length * 2]);
            rest();
            expect(targets.map(([label, name]) => r.count(label, name))).toEqual(targets.map(() => 0));

        }

        const bare = web({ navigator: {}, document: {}, matchMedia: () => ({ matches: true }) });

        expect(bare.info()).toMatchObject({ pointer: "coarse", contrast: "more", scheme: "dark", reducedMotion: true, standalone: true });

        for ( const [what] of wired ) expect(bare.watch(what, () => undefined)()).toBeUndefined();

    });
    it("a location or notification grant is read from the host and asked only while the host would still prompt", async () => {

        const r = rig();
        const states: Record<string, string> = {};
        const took = (): string[] => r.calls.splice(0);
        let fix: number | "throw" | undefined;
        let known = "default";
        let answer: string | Error | undefined = "granted";

        r.browser.permissions = {
            query: async ({ name }) => {

                r.calls.push(`query:${name}`);

                if ( states[name] === "throw" ) throw new TypeError("not a permission");

                return { state: states[name] ?? "prompt" };

            },
        };
        r.browser.geolocation = {
            getCurrentPosition: ( ok, fail, wanted ) => {

                r.calls.push(`fix:${wanted?.maximumAge}:${wanted?.timeout}:${wanted?.enableHighAccuracy}`);

                if ( fix === "throw" ) throw new Error("insecure");
                if ( fix === undefined ) ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: 4 });
                else fail({ code: fix });

            },
            watchPosition: () => 1,
            clearWatch: () => undefined,
        };
        r.host.Notification = class {

            static get permission (): string { return known; }
            static requestPermission = async (): Promise<string> => {

                r.calls.push("request");

                if ( answer instanceof Error ) throw answer;

                known = answer ?? "granted";

                return answer as string;

            };

        } as unknown as NonNullable<device.Host["Notification"]>;

        const unit = web(r.host);

        for ( const [held, wanted] of [["granted", "granted"], ["denied", "denied"], ["prompt", "prompt"], ["weird", "prompt"], ["throw", "prompt"]] as const ) {

            states.geolocation = held;
            expect([held, await unit.state("location")]).toEqual([held, wanted]);
            expect(took()).toEqual(["query:geolocation"]);

        }

        states.geolocation = "granted";
        expect([await unit.ask("location"), took()]).toEqual(["granted", ["query:geolocation"]]);
        states.geolocation = "denied";
        expect([await unit.ask("location"), took()]).toEqual(["denied", ["query:geolocation"]]);
        states.geolocation = "prompt";

        for ( const [given, wanted] of [[undefined, "granted"], [1, "denied"], [2, "granted"], [3, "granted"], ["throw", "unsupported"]] as const ) {

            fix = given;
            expect([given, await unit.ask("location"), took()]).toEqual([given, wanted, ["query:geolocation", "fix:Infinity:10000:undefined"]]);

        }

        for ( const [held, wanted] of [["default", "prompt"], ["granted", "granted"], ["denied", "denied"], ["weird", "prompt"]] as const ) {

            known = held;
            expect([held, await unit.state("notifications"), await unit.state("push")]).toEqual([held, wanted, wanted]);

        }

        expect(took()).toEqual([]);
        known = "denied";
        expect([await unit.ask("notifications"), await unit.ask("push"), took()]).toEqual(["denied", "denied", []]);

        for ( const [given, wanted, after] of [["granted", "granted", "granted"], ["denied", "denied", "denied"], ["default", "prompt", "default"], [undefined, "granted", "granted"], [new Error("no gesture"), "prompt", "default"]] as const ) {

            known = "default";
            answer = given;
            expect([String(given), await unit.ask("notifications"), known, took()]).toEqual([String(given), wanted, after, ["request"]]);

        }

        known = "granted";
        expect([await unit.ask("push"), took()]).toEqual(["granted", []]);

        const plain = rig();

        plain.browser.geolocation = { getCurrentPosition: ( ok ) => { plain.calls.push("fix"); ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: 4 }); }, watchPosition: () => 1, clearWatch: () => undefined };
        expect([await web(plain.host).state("location"), await web(plain.host).ask("location"), plain.calls]).toEqual(["prompt", "granted", ["fix"]]);

        const silent = web({ navigator: {}, document: {} });

        for ( const permission of ["location", "camera", "microphone", "notifications", "clipboard", "contacts", "photos", "push"] as const ) expect([permission, await silent.state(permission), await silent.ask(permission)]).toEqual([permission, "unsupported", "unsupported"]);

        expect([await unit.state("contacts"), await unit.ask("contacts"), await unit.state("photos"), await unit.ask("photos"), took()]).toEqual(["unsupported", "unsupported", "unsupported", "unsupported", []]);

    });
    it("a camera, microphone or clipboard ask takes the real thing once, releases it and names why it failed", async () => {

        const r = rig();
        const states: Record<string, string> = {};
        const took = (): string[] => r.calls.splice(0);
        let stream = "ok";
        let stopped = 0;
        let clip = "ok";

        r.browser.permissions = { query: async ({ name }) => { r.calls.push(`query:${name}`); return { state: states[name] ?? "prompt" }; } };
        r.browser.mediaDevices = {
            getUserMedia: async ( wanted ) => {

                r.calls.push(`media:${JSON.stringify(wanted)}`);

                if ( stream === "none" ) return undefined as never;
                if ( stream === "text" ) throw "refused";
                if ( stream === "null" ) throw null;
                if ( stream !== "ok" ) throw Object.assign(new Error(stream), { name: stream });

                return { getTracks: () => [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }] };

            },
        };
        r.browser.clipboard = {
            writeText: async ( text ) => { r.calls.push(`write:${text}`); },
            readText: async () => {

                r.calls.push("read");

                if ( clip !== "ok" ) throw new Error(clip);

                return "pasted";

            },
        };

        const unit = web(r.host);

        expect([await unit.state("camera"), await unit.state("microphone"), await unit.state("clipboard"), took()]).toEqual(["prompt", "prompt", "prompt", ["query:camera", "query:microphone", "query:clipboard-read"]]);
        expect([await unit.ask("camera"), stopped, took()]).toEqual(["granted", 2, ["query:camera", "media:{\"video\":true}"]]);
        expect([await unit.ask("microphone"), stopped, took()]).toEqual(["granted", 4, ["query:microphone", "media:{\"audio\":true}"]]);

        for ( const [name, wanted] of [["NotAllowedError", "denied"], ["SecurityError", "denied"], ["AbortError", "denied"], ["text", "denied"], ["null", "denied"], ["NotFoundError", "unsupported"], ["DevicesNotFoundError", "unsupported"], ["NotReadableError", "unsupported"], ["TrackStartError", "unsupported"], ["OverconstrainedError", "unsupported"], ["none", "unsupported"]] as const ) {

            stream = name;
            expect([name, await unit.ask("camera")]).toEqual([name, wanted]);

        }

        took();
        expect(stopped).toBe(4);
        stream = "ok";
        states.camera = "granted";
        states.microphone = "denied";
        expect([await unit.ask("camera"), await unit.ask("microphone"), stopped, took()]).toEqual(["granted", "denied", 4, ["query:camera", "query:microphone"]]);
        expect([await unit.ask("clipboard"), took()]).toEqual(["granted", ["query:clipboard-read", "read"]]);
        clip = "NotAllowedError";
        expect([await unit.ask("clipboard"), took()]).toEqual(["denied", ["query:clipboard-read", "read"]]);
        states["clipboard-read"] = "denied";
        expect([await unit.ask("clipboard"), took()]).toEqual(["denied", ["query:clipboard-read"]]);
        states["clipboard-read"] = "granted";
        expect([await unit.ask("clipboard"), took()]).toEqual(["granted", ["query:clipboard-read"]]);

    });
    it("require passes on a grant, asks once when it must, and refuses with the grant it found", async () => {

        const r = rig();
        const states: Record<string, string> = {};
        const took = (): string[] => r.calls.splice(0);
        let fix: number | undefined;

        r.browser.permissions = { query: async ({ name }) => { r.calls.push(`query:${name}`); return { state: states[name] ?? "prompt" }; } };
        r.browser.geolocation = {
            getCurrentPosition: ( ok, fail ) => {

                r.calls.push("fix");

                if ( fix === undefined ) ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: 4 });
                else fail({ code: fix });

            },
            watchPosition: () => 1,
            clearWatch: () => undefined,
        };

        const unit = web(r.host);

        states.geolocation = "granted";
        expect([await unit.require("location"), took()]).toEqual([undefined, ["query:geolocation"]]);
        states.geolocation = "prompt";
        expect([await unit.require("location"), took()]).toEqual([undefined, ["query:geolocation", "query:geolocation", "fix"]]);
        fix = 1;
        await expect(unit.require("location")).rejects.toMatchObject({ code: "forbidden", reason: "device.location.denied", status: 403, message: "location: denied", errors: { location: ["denied"] } });
        expect(took()).toEqual(["query:geolocation", "query:geolocation", "fix"]);
        states.geolocation = "denied";
        await expect(unit.require("location")).rejects.toMatchObject({ code: "forbidden", reason: "device.location.denied" });
        expect(took()).toEqual(["query:geolocation", "query:geolocation"]);
        await expect(unit.require("contacts")).rejects.toMatchObject({ code: "unavailable", reason: "device.contacts.unsupported", status: 503, message: "contacts: unsupported", errors: { contacts: ["unsupported"] } });
        await expect(unit.require("camera")).rejects.toMatchObject({ code: "unavailable", reason: "device.camera.unsupported" });
        expect(took()).toEqual([]);

        const asked: string[] = [];
        const base = { info: device.unknownInfo, watch: () => () => undefined };
        const loose = device.create({ ...base, state: ( permission ) => (permission === "photos" ? "granted" : "prompt"), ask: async ( permission ) => { asked.push(permission); return permission === "camera" ? "granted" : "prompt"; } });
        const broken = device.create({ ...base, state: () => { throw new Error("state"); }, ask: async () => { throw new Error("ask"); } });

        expect([await loose.require("photos"), await loose.require("camera"), asked]).toEqual([undefined, undefined, ["camera"]]);
        await expect(loose.require("microphone")).rejects.toMatchObject({ code: "forbidden", reason: "device.microphone.prompt", errors: { microphone: ["prompt"] } });
        expect([await broken.state("camera"), await broken.ask("camera")]).toEqual(["unsupported", "unsupported"]);
        await expect(broken.require("camera")).rejects.toMatchObject({ code: "unavailable", reason: "device.camera.unsupported" });

    });
    it("a notice shows only on a grant, and a position keeps only what the host measured", async () => {

        const r = rig();
        const took = (): string[] => r.calls.splice(0);
        const seen: device.Position[] = [];
        let known = "default";
        let found: Fix | undefined;
        let push: ( fix: Fix ) => void = () => undefined;

        r.browser.geolocation = {
            getCurrentPosition: ( ok, fail, wanted ) => {

                r.calls.push(`fix:${JSON.stringify(wanted)}`);

                if ( found ) ok(found);
                else fail({ code: 2 });

            },
            watchPosition: ( ok, _fail, wanted ) => {

                r.calls.push(`watch:${JSON.stringify(wanted)}`);
                push = ok;

                return 41;

            },
            clearWatch: ( id ) => { r.calls.push(`clear:${id}`); },
        };
        r.host.Notification = class {

            static get permission (): string { return known; }
            static requestPermission = async (): Promise<string> => known;
            constructor ( title: string, options?: unknown ) {

                r.calls.push(`notice:${title}:${JSON.stringify(options)}`);

                if ( title === "boom" ) throw new TypeError("Illegal constructor");

            }

        } as unknown as NonNullable<device.Host["Notification"]>;

        const unit = web(r.host);

        expect(unit.capabilities()).toEqual(["ask", "follow", "keys", "notify", "position", "state"]);
        expect([await unit.notify({ title: "hi" }), took()]).toEqual([false, []]);
        known = "denied";
        expect([await unit.notify({ title: "hi" }), took()]).toEqual([false, []]);
        known = "granted";
        expect([await unit.notify({ title: "hi" }), took()]).toEqual([true, ["notice:hi:{}"]]);
        expect([await unit.notify({ title: "hi", body: "b", tag: "t", icon: "/i.png", data: { id: 1 }, silent: true }), took()]).toEqual([true, ["notice:hi:{\"body\":\"b\",\"tag\":\"t\",\"icon\":\"/i.png\",\"data\":{\"id\":1},\"silent\":true}"]]);
        expect([await unit.notify({ title: "boom" }), took()]).toEqual([false, ["notice:boom:{}"]]);

        expect([await unit.position(), took()]).toEqual([undefined, ["fix:{\"enableHighAccuracy\":false}"]]);
        found = { coords: { latitude: 30, longitude: 31, accuracy: 5, altitude: 12, speed: 0, heading: 90 }, timestamp: 7 };
        expect(await unit.position({ accuracy: "high", maxAge: 0, timeout: 5000 })).toEqual({ lat: 30, lng: 31, accuracy: 5, altitude: 12, speed: 0, heading: 90, at: 7 });
        expect(took()).toEqual(["fix:{\"enableHighAccuracy\":true,\"maximumAge\":0,\"timeout\":5000}"]);
        expect([await unit.position({ accuracy: "low", maxAge: -1, timeout: Number.NaN }), took()]).toEqual([{ lat: 30, lng: 31, accuracy: 5, altitude: 12, speed: 0, heading: 90, at: 7 }, ["fix:{\"enableHighAccuracy\":false}"]]);
        found = { coords: { latitude: -90, longitude: 180, accuracy: Number.NaN, altitude: null, speed: null, heading: Number.NaN }, timestamp: 8 };
        expect(Object.entries((await unit.position()) ?? {})).toEqual([["lat", -90], ["lng", 180], ["accuracy", 0], ["at", 8]]);

        for ( const coords of [{ latitude: Number.NaN, longitude: 1, accuracy: 1 }, { latitude: 1, longitude: Number.POSITIVE_INFINITY, accuracy: 1 }, { latitude: null as never, longitude: 1, accuracy: 1 }] ) {

            found = { coords, timestamp: 9 };
            expect(await unit.position()).toBeUndefined();

        }

        took();

        const stop = unit.follow({ accuracy: "balanced", maxAge: 1000 }, ( position ) => { seen.push(position); });

        expect(took()).toEqual(["watch:{\"enableHighAccuracy\":false,\"maximumAge\":1000}"]);
        push({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: 10 });
        push({ coords: { latitude: Number.NaN, longitude: 2, accuracy: 3 }, timestamp: 11 });
        push({ coords: { latitude: 4, longitude: 5, accuracy: 6, speed: 7 }, timestamp: 12 });
        expect(seen).toEqual([{ lat: 1, lng: 2, accuracy: 3, at: 10 }, { lat: 4, lng: 5, accuracy: 6, speed: 7, at: 12 }]);
        expect([stop(), took()]).toEqual([undefined, ["clear:41"]]);

        const broken = rig();

        broken.browser.geolocation = { getCurrentPosition: () => { throw new Error("insecure"); }, watchPosition: () => { throw new Error("insecure"); }, clearWatch: () => undefined };
        expect([await web(broken.host).position(), web(broken.host).follow({}, () => undefined)()]).toEqual([undefined, undefined]);

        const silent = web({ navigator: {}, document: {} });

        expect([await silent.notify({ title: "hi" }), await silent.position(), silent.follow({}, () => undefined)(), silent.can("notify"), silent.can("follow")]).toEqual([false, undefined, undefined, false, false]);

    });
    it("copy, paste, share, vibrate and haptic answer what the host did, never what it threw", async () => {

        const r = rig();
        const took = (): string[] => r.calls.splice(0);
        let clip = "ok";
        let shared = "ok";
        let buzz: boolean | "throw" = true;

        r.browser.clipboard = {
            writeText: async ( text ) => {

                r.calls.push(`write:${text}`);

                if ( clip !== "ok" ) throw new Error(clip);

            },
            readText: async () => {

                r.calls.push("read");

                if ( clip !== "ok" ) throw new Error(clip);

                return "pasted";

            },
        };
        r.browser.share = async ( data ) => {

            r.calls.push(`share:${JSON.stringify(data)}`);

            if ( shared !== "ok" ) throw Object.assign(new Error(shared), { name: shared });

        };
        r.browser.vibrate = ( pattern ) => {

            r.calls.push(`buzz:${JSON.stringify(pattern)}`);

            if ( buzz === "throw" ) throw new Error("blocked");

            return buzz;

        };

        const unit = web(r.host);

        expect(unit.capabilities()).toEqual(["ask", "copy", "haptic", "keys", "paste", "share", "state", "vibrate"]);
        expect([await unit.copy("x"), await unit.copy(""), await unit.paste(), took()]).toEqual([true, true, "pasted", ["write:x", "write:", "read"]]);
        clip = "NotAllowedError";
        expect([await unit.copy("x"), await unit.paste(), took()]).toEqual([false, undefined, ["write:x", "read"]]);
        expect([await unit.share({ title: "t", text: "x", url: "https://a.io" }), took()]).toEqual([true, ["share:{\"title\":\"t\",\"text\":\"x\",\"url\":\"https://a.io\"}"]]);
        r.browser.canShare = () => false;
        expect([await unit.share({ url: "https://a.io" }), took()]).toEqual([false, []]);
        r.browser.canShare = () => { throw new TypeError("not shareable"); };
        expect([await unit.share({ url: "https://a.io" }), took()]).toEqual([false, []]);
        r.browser.canShare = () => true;
        expect([await unit.share({ url: "https://a.io" }), took()]).toEqual([true, ["share:{\"url\":\"https://a.io\"}"]]);
        shared = "AbortError";
        expect([await unit.share({ url: "https://a.io" }), took()]).toEqual([false, ["share:{\"url\":\"https://a.io\"}"]]);
        expect([unit.vibrate(10), unit.vibrate([10, 20]), took()]).toEqual([true, true, ["buzz:10", "buzz:[10,20]"]]);

        for ( const [kind, pulse] of [["selection", "5"], ["light", "10"], ["medium", "20"], ["heavy", "40"], ["success", "[10,60,20]"], ["warning", "[20,80,20]"], ["error", "[30,60,30,60,30]"], ["unheard", "10"]] as const ) expect([kind, unit.haptic(kind as device.Haptic), took()]).toEqual([kind, true, [`buzz:${pulse}`]]);

        buzz = false;
        expect([unit.vibrate(10), unit.haptic("light")]).toEqual([false, false]);
        buzz = "throw";
        expect([unit.vibrate(10), unit.haptic("light")]).toEqual([false, false]);

        const silent = web({ navigator: {}, document: {} });

        expect([await silent.copy("x"), await silent.paste(), await silent.share({ url: "/" }), silent.vibrate(10), silent.haptic("light")]).toEqual([false, undefined, false, false, false]);

    });
    it("open sends web links to a new tab without an opener, app links to the same tab and never a refused scheme", async () => {

        const r = rig();
        const took = (): string[] => r.calls.splice(0);
        let blocked = false;

        r.host.open = ( url, target, features ) => {

            r.calls.push(`${url}|${target}|${features}`);

            if ( blocked ) throw new Error("blocked");

            return null;

        };

        const unit = web(r.host);
        const rows: [string, string | undefined][] = [
            ["https://a.io/x", "https://a.io/x|_blank|noopener,noreferrer"],
            [" HTTP://a.io ", "HTTP://a.io|_blank|noopener,noreferrer"],
            ["/local?x=1", "/local?x=1|_blank|noopener,noreferrer"],
            ["//other.example/x", "//other.example/x|_blank|noopener,noreferrer"],
            ["mailto:a@b.example", "mailto:a@b.example|_self|undefined"],
            ["tel:+201000000000", "tel:+201000000000|_self|undefined"],
            ["sms:+201000000000", "sms:+201000000000|_self|undefined"],
            ["geo:30,31", "geo:30,31|_self|undefined"],
            ["settings", undefined], ["javascript:alert(1)", undefined], [" JavaScript:alert(1)", undefined], ["data:text/html,x", undefined], ["file:///etc/hosts", undefined], ["myapp://x", undefined], ["", undefined],
        ];

        for ( const [text, wanted] of rows ) expect([text, await unit.open(text), took()]).toEqual([text, wanted !== undefined, wanted === undefined ? [] : [wanted]]);

        expect([await unit.open(undefined as never), await unit.open(7 as never), took()]).toEqual([false, false, []]);

        const narrow = web(r.host, { schemes: ["https", "MyApp"] });

        expect([await narrow.open("myapp://x"), await narrow.open("MYAPP://y"), await narrow.open("https://a.io"), took()]).toEqual([true, true, true, ["myapp://x|_self|undefined", "MYAPP://y|_self|undefined", "https://a.io|_blank|noopener,noreferrer"]]);
        expect([await narrow.open("http://a.io"), await narrow.open("mailto:a@b.example"), await narrow.open("/local"), took()]).toEqual([false, false, true, ["/local|_blank|noopener,noreferrer"]]);
        blocked = true;
        expect([await unit.open("https://a.io"), took()]).toEqual([false, ["https://a.io|_blank|noopener,noreferrer"]]);

        const silent = web({ navigator: {}, document: {} });

        expect([await silent.open("https://a.io"), silent.can("open")]).toEqual([false, false]);

    });
    it("pick shapes the file input, reads what was chosen and answers nothing on cancel, refusal or no gesture", async () => {

        const r = rig();
        const took = (): string[] => r.calls.splice(0);
        const made: Input[] = [];
        const chosen = [new File(["ab"], "a.png", { type: "image/png" }), new File(["abc"], "b.pdf", { type: "application/pdf" })];
        let files: File[] | null = chosen;
        let click = "change";
        let broken = false;

        r.page.createElement = ( tag ) => {

            const input: Input = {
                type: "", accept: "", multiple: false, capture: "", onchange: null, oncancel: null, files,
                click: () => {

                    r.calls.push("click");

                    if ( click === "throw" ) throw new Error("no gesture");
                    if ( click === "change" ) input.onchange?.();
                    if ( click === "cancel" ) input.oncancel?.();

                },
            };

            r.calls.push(`make:${tag}`);

            if ( broken ) throw new Error("detached");

            made.push(input);

            return input;

        };

        const unit = web(r.host);
        const shape = (): unknown[] => { const last = made.at(-1); return [last?.type, last?.accept, last?.multiple, last?.capture]; };

        expect(await unit.pick()).toEqual([{ name: "a.png", type: "image/png", size: 2, uri: "", blob: chosen[0] }, { name: "b.pdf", type: "application/pdf", size: 3, uri: "", blob: chosen[1] }]);
        expect([shape(), took()]).toEqual([["file", "image/*", false, ""], ["make:input", "click"]]);
        expect([(await unit.pick({ source: "files" })).length, shape()]).toEqual([2, ["file", "", false, ""]]);
        expect([(await unit.pick({ source: "library", multiple: true })).length, shape()]).toEqual([2, ["file", "image/*", true, ""]]);
        expect([(await unit.pick({ source: "camera" })).length, shape()]).toEqual([2, ["file", "image/*", false, "environment"]]);
        expect([(await unit.pick({ source: "files", accept: ["image/png", ".pdf"] })).length, shape()]).toEqual([2, ["file", "image/png,.pdf", false, ""]]);
        expect([(await unit.pick({ accept: [] })).length, shape()]).toEqual([2, ["file", "", false, ""]]);
        took();
        click = "cancel";
        expect([await unit.pick(), took()]).toEqual([[], ["make:input", "click"]]);
        click = "throw";
        expect([await unit.pick(), took()]).toEqual([[], ["make:input", "click"]]);
        click = "change";
        files = null;
        expect([await unit.pick(), took()]).toEqual([[], ["make:input", "click"]]);
        files = [];
        expect([await unit.pick(), took()]).toEqual([[], ["make:input", "click"]]);
        files = chosen;
        r.browser.userActivation = { isActive: false };
        expect([await unit.pick(), took()]).toEqual([[], []]);
        r.browser.userActivation = { isActive: true };
        expect([(await unit.pick()).length, took()]).toEqual([2, ["make:input", "click"]]);
        r.browser.userActivation = {};
        expect([(await unit.pick()).length, took()]).toEqual([2, ["make:input", "click"]]);
        broken = true;
        expect([await unit.pick(), took()]).toEqual([[], ["make:input"]]);
        expect([await web({ navigator: {}, document: {} }).pick(), web({ navigator: {}, document: {} }).can("pick"), unit.can("pick")]).toEqual([[], false, true]);

    });
    it("media opens exactly the tracks asked for, and a battery reading is clamped or absent", async () => {

        const r = rig();
        const took = (): string[] => r.calls.splice(0);
        let stopped = 0;
        let refused = false;
        let cell: { level: number; charging: boolean } | Error = { level: 0.5, charging: true };

        r.browser.mediaDevices = {
            getUserMedia: async ( wanted ) => {

                r.calls.push(`media:${JSON.stringify(wanted)}`);

                if ( refused ) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });

                return { getTracks: () => [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }] };

            },
        };
        r.browser.getBattery = async () => {

            if ( cell instanceof Error ) throw cell;

            return cell;

        };

        const unit = web(r.host);

        expect([await unit.media({}), await unit.media({ video: false, audio: false }), took()]).toEqual([undefined, undefined, []]);

        const live = await unit.media({ video: true });

        expect([typeof live?.stop, took(), stopped]).toEqual(["function", ["media:{\"video\":true,\"audio\":false}"], 0]);
        live?.stop();
        expect(stopped).toBe(2);
        expect([(await unit.media({ audio: true })) !== undefined, took()]).toEqual([true, ["media:{\"video\":false,\"audio\":true}"]]);
        expect([(await unit.media({ video: { facing: "user" }, audio: true })) !== undefined, took()]).toEqual([true, ["media:{\"video\":{\"facingMode\":\"user\"},\"audio\":true}"]]);
        expect([(await unit.media({ video: {} })) !== undefined, took()]).toEqual([true, ["media:{\"video\":{\"facingMode\":\"environment\"},\"audio\":false}"]]);
        refused = true;
        expect([await unit.media({ video: true }), took(), stopped]).toEqual([undefined, ["media:{\"video\":true,\"audio\":false}"], 2]);

        for ( const [given, wanted] of [[{ level: 0.5, charging: true }, { level: 0.5, charging: true }], [{ level: 1.7, charging: false }, { level: 1, charging: false }], [{ level: -0.2, charging: 1 as never }, { level: 0, charging: false }], [{ level: 0, charging: true }, { level: 0, charging: true }], [{ level: Number.NaN, charging: true }, undefined], [{ level: "1" as never, charging: true }, undefined], [new Error("no battery"), undefined]] as const ) {

            cell = given;
            expect(await unit.battery()).toEqual(wanted);

        }

        const silent = web({ navigator: {}, document: {} });

        expect([await silent.media({ video: true }), await silent.battery(), silent.can("media"), silent.can("battery")]).toEqual([undefined, undefined, false, false]);

    });
    it("web keys skip composition and mark typing by the focused field; hotkeys honour typing, repeat and order", () => {

        const r = rig();
        const unit = web(r.host);
        const pressed: device.Key[] = [];
        const hits: string[] = [];
        const down = ( key: string, code: string, extra: object = {} ): void => r.fire("host", "keydown", { key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false, ...extra });
        const took = (): string[] => hits.splice(0);
        const field = { tagName: "INPUT", type: "text" };
        const stop = unit.keys(( key ) => { pressed.push(key); });
        const fields: [object | null | undefined, boolean][] = [
            [{ tagName: "INPUT" }, true], [{ tagName: "input", type: "text" }, true], [{ tagName: "INPUT", type: "EMAIL" }, true], [{ tagName: "TEXTAREA" }, true], [{ tagName: "SELECT" }, true],
            [{ tagName: "INPUT", type: "checkbox" }, false], [{ tagName: "INPUT", type: "Button" }, false], [{ tagName: "INPUT", type: "radio" }, false], [{ tagName: "INPUT", type: "range" }, false], [{ tagName: "INPUT", type: "color" }, false],
            [{ tagName: "INPUT", type: "file" }, false], [{ tagName: "INPUT", type: "image" }, false], [{ tagName: "INPUT", type: "submit" }, false], [{ tagName: "INPUT", type: "reset" }, false],
            [{ tagName: "DIV" }, false], [{ tagName: "DIV", isContentEditable: true }, true], [{ tagName: "INPUT", type: "checkbox", isContentEditable: true }, true], [{}, false], [null, false], [undefined, false],
        ];

        expect(r.count("host", "keydown")).toBe(1);
        down("k", "KeyK", { ctrlKey: true, shiftKey: true });
        down("k", "KeyK", { metaKey: true, altKey: true, repeat: true });
        down("Process", "KeyK", { isComposing: true });
        down(undefined as never, "KeyK");
        r.fire("host", "keydown", { key: "x" });
        expect(pressed.splice(0)).toEqual([
            { key: "k", code: "KeyK", ctrl: true, meta: false, shift: true, alt: false, repeat: false, typing: false },
            { key: "k", code: "KeyK", ctrl: false, meta: true, shift: false, alt: true, repeat: true, typing: false },
            { key: "x", code: "", ctrl: false, meta: false, shift: false, alt: false, repeat: false, typing: false },
        ]);

        for ( const [target, wanted] of fields ) {

            down("a", "KeyA", { target });
            expect([target, pressed.splice(0).map(( key ) => key.typing)]).toEqual([target, [wanted]]);

        }

        stop();
        stop();
        down("a", "KeyA");
        expect([r.count("host", "keydown"), pressed]).toEqual([0, []]);

        const end = unit.hotkeys({
            "ctrl+k": () => { hits.push("palette"); },
            "mod+k": () => { hits.push("shadowed"); },
            "k, j": () => { hits.push("plain"); },
            esc: () => { hits.push("close"); },
            "alt+e": () => { hits.push("alt"); },
            "ctrl+shift": () => { hits.push("keyless"); },
        });

        expect(r.count("host", "keydown")).toBe(1);
        down("k", "KeyK", { ctrlKey: true });
        down("k", "KeyK");
        down("j", "KeyJ");
        down("Escape", "Escape");
        down("e", "KeyE", { altKey: true });
        down("Shift", "ShiftLeft", { ctrlKey: true, shiftKey: true });
        down("x", "KeyX");
        expect(took()).toEqual(["palette", "plain", "plain", "close", "alt"]);
        down("k", "KeyK", { ctrlKey: true, target: field });
        down("k", "KeyK", { target: field });
        down("Escape", "Escape", { target: field });
        down("e", "KeyE", { altKey: true, target: field });
        expect(took()).toEqual(["palette", "close"]);
        down("k", "KeyK", { ctrlKey: true, repeat: true });
        down("k", "KeyK", { repeat: true });
        down("k", "KeyK", { isComposing: true });
        expect(took()).toEqual([]);
        end();
        down("k", "KeyK", { ctrlKey: true });
        expect([took(), r.count("host", "keydown")]).toEqual([[], 0]);

        const ends = [
            unit.hotkey("k", () => { hits.push("typed"); }, { typing: true }),
            unit.hotkey("ctrl+j", () => { hits.push("guarded"); }, { typing: false }),
            unit.hotkey("down", () => { hits.push("held"); }, { repeat: true }),
        ];

        down("k", "KeyK", { target: field });
        down("j", "KeyJ", { ctrlKey: true, target: field });
        down("j", "KeyJ", { ctrlKey: true });
        down("ArrowDown", "ArrowDown", { repeat: true });
        down("ArrowDown", "ArrowDown");
        expect(took()).toEqual(["typed", "guarded", "held", "held"]);

        for ( const one of ends ) one();

        expect([unit.hotkeys({})(), r.count("host", "keydown")]).toEqual([undefined, 0]);

        for ( const agent of ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1"] ) {

            const apple = rig();

            apple.browser.userAgent = agent;
            web(apple.host).hotkey("mod+k", ( key ) => { hits.push(key.meta ? "meta" : "ctrl"); });
            apple.fire("host", "keydown", { key: "k", code: "KeyK", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, repeat: false });
            apple.fire("host", "keydown", { key: "k", code: "KeyK", ctrlKey: false, metaKey: true, shiftKey: false, altKey: false, repeat: false });
            expect(took()).toEqual(["meta"]);

        }

        const base = { info: device.unknownInfo, watch: () => () => undefined };

        expect(device.create({ ...base, keys: () => { throw new Error("no keyboard"); } }).hotkey("k", () => undefined)()).toBeUndefined();
        expect([web({ navigator: {}, document: {} }).can("keys"), web({ navigator: {}, document: {} }).hotkey("k", () => undefined)()]).toEqual([false, undefined]);

    });
    it("awake renews the lock when the page returns, keeps the old one on a refusal and releases exactly once", async () => {

        const r = rig();
        const took = (): string[] => r.calls.splice(0);
        const gates: (( open: boolean ) => void)[] = [];
        let made = 0;
        let refused = false;
        let slow = false;
        let sour = false;

        r.browser.wakeLock = {
            request: async ( kind ) => {

                made += 1;

                const id = made;

                r.calls.push(`lock:${kind}:${id}`);

                if ( refused ) throw Object.assign(new Error("hidden"), { name: "NotAllowedError" });
                if ( slow && !(await new Promise<boolean>(( done ) => { gates.push(done); })) ) throw new Error("late refusal");

                return {
                    release: async () => {

                        r.calls.push(`release:${id}`);

                        if ( sour ) throw new Error("already released");

                    },
                };

            },
        };
        r.page.visibilityState = "visible";

        const unit = web(r.host);
        const show = async ( state: string ): Promise<void> => {

            r.page.visibilityState = state;
            r.fire("page", "visibilitychange");
            await settle();

        };
        const stop = await unit.awake();

        expect([typeof stop, took(), r.count("page", "visibilitychange"), unit.can("awake")]).toEqual(["function", ["lock:screen:1"], 1, true]);
        await show("hidden");
        expect(took()).toEqual([]);
        await show("visible");
        expect(took()).toEqual(["lock:screen:2", "release:1"]);
        await show("prerender");
        expect(took()).toEqual(["lock:screen:3", "release:2"]);
        refused = true;
        await show("visible");
        expect(took()).toEqual(["lock:screen:4"]);
        refused = false;
        stop?.();
        await settle();
        expect([took(), r.count("page", "visibilitychange")]).toEqual([["release:3"], 0]);
        stop?.();
        await show("visible");
        expect(took()).toEqual([]);

        const late = await unit.awake();

        expect(took()).toEqual(["lock:screen:5"]);
        slow = true;
        await show("visible");
        expect([took(), gates.length]).toEqual([["lock:screen:6"], 1]);
        late?.();
        await settle();
        expect(took()).toEqual(["release:5"]);
        gates.shift()?.(true);
        await settle();
        expect(took()).toEqual(["release:6"]);
        slow = false;

        const twice = await unit.awake();

        took();
        slow = true;
        await show("visible");
        await show("visible");
        expect([took(), gates.length]).toEqual([["lock:screen:8", "lock:screen:9"], 2]);
        gates.shift()?.(true);
        await settle();
        expect(took()).toEqual(["release:7"]);
        gates.shift()?.(false);
        await settle();
        expect(took()).toEqual([]);
        slow = false;
        sour = true;
        expect(twice?.()).toBeUndefined();
        await settle();
        expect([took(), r.count("page", "visibilitychange")]).toEqual([["release:8"], 0]);
        sour = false;
        refused = true;
        expect([await unit.awake(), took(), r.count("page", "visibilitychange")]).toEqual([undefined, ["lock:screen:10"], 0]);

        const bare = rig();

        bare.browser.wakeLock = { request: async () => ({ release: async () => { bare.calls.push("release"); } }) };
        bare.page.addEventListener = undefined as never;
        bare.page.removeEventListener = undefined as never;

        const held = await web(bare.host).awake();

        held?.();
        held?.();
        expect([typeof held, bare.calls]).toEqual(["function", ["release"]]);
        expect([await web({ navigator: {}, document: {} }).awake(), web({ navigator: {}, document: {} }).can("awake")]).toEqual([undefined, false]);

    });
    it("reload asks the host page to reload where it can, and answers false where it cannot or the host throws", () => {

        const asked: string[] = [];
        const page = web({ navigator: {}, document: {}, location: { pathname: "/", search: "", hash: "", reload: () => { asked.push("reload"); } } });
        const broken = web({ navigator: {}, document: {}, location: { pathname: "/", search: "", hash: "", reload: () => { throw new Error("blocked"); } } });
        const plain = web({ navigator: {}, document: {}, location: { pathname: "/", search: "", hash: "" } });

        expect([page.can("reload"), page.reload(), asked]).toEqual([true, true, ["reload"]]);
        expect([broken.can("reload"), broken.reload()]).toEqual([true, false]);
        expect([plain.can("reload"), plain.reload(), device.create(device.unknown).reload()]).toEqual([false, false, false]);

    });
    it("the app badge sets a flag or a whole count inside the host range, clears on nothing and answers false on refusal", async () => {

        const r = rig();
        const took = (): string[] => r.calls.splice(0);
        let refused = false;

        r.browser.setAppBadge = async ( count ) => {

            r.calls.push(`set:${count}`);

            if ( refused ) throw new Error("not installed");

        };

        const plain = web(r.host);

        for ( const [given, wanted] of [[undefined, "set:undefined"], [3, "set:3"], [3.9, "set:3"], [0, "set:0"], [-0.5, "set:0"], [-5, "set:0"], [Number.NaN, "set:0"], [Number.NEGATIVE_INFINITY, "set:0"], [Number.POSITIVE_INFINITY, "set:9007199254740991"], [1e21, "set:9007199254740991"], [Number.MAX_SAFE_INTEGER, "set:9007199254740991"], [2 ** 53, "set:9007199254740991"]] as const ) expect([given, await (given === undefined ? plain.badge() : plain.badge(given)), took()]).toEqual([given, true, [wanted]]);

        r.browser.clearAppBadge = async () => {

            r.calls.push("clear");

            if ( refused ) throw new Error("not installed");

        };

        const unit = web(r.host);

        for ( const [given, wanted] of [[0, "clear"], [-0, "clear"], [0.9, "clear"], [-5, "clear"], [Number.NaN, "clear"], [Number.NEGATIVE_INFINITY, "clear"], [1, "set:1"], [1.5, "set:1"], [99, "set:99"]] as const ) expect([given, await unit.badge(given), took()]).toEqual([given, true, [wanted]]);

        expect([await unit.badge(), took()]).toEqual([true, ["set:undefined"]]);
        refused = true;
        expect([await unit.badge(4), await unit.badge(0), await unit.badge(), took()]).toEqual([false, false, false, ["set:4", "clear", "set:undefined"]]);
        expect([unit.can("badge"), web({ navigator: {}, document: {} }).can("badge"), await web({ navigator: {}, document: {} }).badge(2)]).toEqual([true, false, false]);

        const only = rig();

        only.browser.clearAppBadge = async () => { only.calls.push("clear"); };
        expect([web(only.host).can("badge"), await web(only.host).badge(0), only.calls]).toEqual([false, false, []]);

    });
    it("the facade answers the quiet value when an adapter throws, rejects or answers nothing, and passes the rest through", async () => {

        const base = { info: device.unknownInfo, watch: () => () => undefined };
        const boom = (): never => { throw new Error("boom"); };
        const sour = async (): Promise<never> => { throw new Error("sour"); };
        const none = (): never => undefined as never;
        const all: device.Capability[] = ["ask", "awake", "badge", "battery", "copy", "follow", "haptic", "keys", "media", "notify", "open", "paste", "pick", "position", "pushToken", "reload", "share", "state", "vibrate"];
        const quiet = [
            "unsupported", "unsupported", false, undefined, undefined, undefined, false, undefined, false, false, false, false, false, false, [], undefined, undefined, undefined, undefined, false,
        ];

        for ( const [label, fail] of [["throws", boom], ["rejects", sour], ["nothing", none]] as const ) {

            const flat = label === "rejects" ? boom : fail;
            const unit = device.create({ ...base, state: fail, ask: fail, notify: fail, pushToken: fail, position: fail, follow: flat, copy: fail, paste: fail, share: fail, vibrate: flat, haptic: flat, open: fail, reload: flat, pick: fail, media: fail, keys: flat, battery: fail, awake: fail, badge: fail });
            const follow = unit.follow({}, () => undefined);
            const keys = unit.keys(() => undefined);
            const answers = [
                await unit.state("camera"), await unit.ask("camera"), await unit.notify({ title: "t" }), await unit.pushToken(), await unit.position(), follow(), await unit.copy("x"), await unit.paste(), await unit.share({ text: "x" }),
                unit.vibrate(5), unit.haptic("light"), await unit.open("https://a.example"), await unit.open("javascript:alert(1)"), unit.reload(), await unit.pick(), await unit.media({ video: true }), keys(), await unit.battery(), await unit.awake(), await unit.badge(1),
            ];

            expect([label, answers]).toEqual([label, quiet]);
            expect([label, unit.capabilities(), unit.can("badge"), unit.hotkey("k", () => undefined)()]).toEqual([label, all, true, undefined]);

            const refused = await unit.require("camera").then(() => undefined, ( failure: unknown ) => failure);

            expect(refused).toMatchObject({ code: "unavailable", reason: "device.camera.unsupported", status: 503, errors: { camera: ["unsupported"] } });

        }

        const seen: unknown[][] = [];
        const said = <R,>( name: string, value: R ) => ( ...given: unknown[] ): R => {

            seen.push([name, ...given]);

            return value;

        };
        const fix: device.Position = { lat: 30.05, lng: 31.25, accuracy: 4, at: 9 };
        const stream: device.Stream = { stream: "s", stop: () => undefined };
        const picked: device.Picked[] = [{ name: "a.png", type: "image/png", size: 2, uri: "file:///a.png" }];
        const listener = (): void => undefined;
        const ended = (): void => { seen.push(["ended"]); };
        const full = device.create({
            ...base, state: said("state", "prompt" as const), ask: said("ask", Promise.resolve("granted" as const)), notify: said("notify", Promise.resolve(true)), pushToken: said("pushToken", Promise.resolve("push-1")), position: said("position", Promise.resolve(fix)),
            follow: said("follow", ended), copy: said("copy", Promise.resolve(true)), paste: said("paste", Promise.resolve("")), share: said("share", Promise.resolve(true)), vibrate: said("vibrate", true), haptic: said("haptic", true), open: said("open", Promise.resolve(true)),
            reload: said("reload", true), pick: said("pick", Promise.resolve(picked)), media: said("media", Promise.resolve(stream)), keys: said("keys", ended), battery: said("battery", Promise.resolve({ level: 0, charging: false })), awake: said("awake", Promise.resolve(ended)), badge: said("badge", Promise.resolve(true)),
        }, { schemes: ["https", "MyApp"] });

        expect([await full.state("push"), await full.ask("photos"), await full.notify({ title: "t", body: "b" }), await full.pushToken(), await full.position({ accuracy: "high" })]).toEqual(["prompt", "granted", true, "push-1", fix]);
        expect([full.follow({ timeout: 5 }, listener), await full.copy("text"), await full.paste(), await full.share({ url: "https://a.example" }), full.vibrate([1, 2]), full.haptic("error")]).toEqual([ended, true, "", true, true, true]);
        expect(full.reload()).toBe(true);
        expect([await full.open("  myapp://x  "), await full.open("mailto:a@a.example"), await full.pick({ source: "files" }), await full.media({ audio: true }), full.keys(listener), await full.battery(), await full.awake(), await full.badge(2), await full.badge()]).toEqual([true, false, picked, stream, ended, { level: 0, charging: false }, ended, true, true]);
        expect(seen).toEqual([
            ["state", "push"], ["ask", "photos"], ["notify", { title: "t", body: "b" }], ["pushToken"], ["position", { accuracy: "high" }], ["follow", { timeout: 5 }, listener], ["copy", "text"], ["paste"], ["share", { url: "https://a.example" }], ["vibrate", [1, 2]], ["haptic", "error"],
            ["reload"], ["open", "myapp://x"], ["pick", { source: "files" }], ["media", { audio: true }], ["keys", listener], ["battery"], ["awake"], ["badge", 2], ["badge"],
        ]);
        seen.length = 0;
        await full.require("push");
        expect(seen).toEqual([["state", "push"], ["ask", "push"]]);

        const listed = full.capabilities();

        listed.length = 0;
        expect([full.capabilities(), device.create(base).capabilities(), device.create({ ...base, badge: undefined, copy: async () => true }).capabilities()]).toEqual([all, [], ["copy"]]);

    });

});
