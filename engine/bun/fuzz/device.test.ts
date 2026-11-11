import { describe, expect, test as it } from "bun:test";
import * as device from "engine/device";
import * as fc from "fast-check";

type Model = { os: string; version: string; browser: string; mobile: boolean; text: string };
type Spelled = { combo: device.Combo; text: string; listable: boolean };
type Browser = NonNullable<device.Host["navigator"]>;
type Page = NonNullable<device.Host["document"]>;
type Listener = ( event: never ) => void;
type Step = "hide" | "show" | "refuse" | "allow" | "slow" | "fast" | "grant" | "deny" | "stop";

const runs = 10_000;
const systems = ["ios", "android", "windows", "chromeos", "macos", "linux", "unknown"];
const browsers = ["edge", "opera", "samsung", "chrome", "firefox", "safari", "unknown"];
const versioned = /^(?:\d+(?:\.\d+)?)?$/;
const schemed = /^([a-z][a-z0-9+.-]*):/i;
const openable = ["http", "https", "mailto", "tel", "sms", "geo"];
const refused = ["javascript", "data", "vbscript", "file", "blob", "intent", "about", "chrome", "view-source", "ms-settings", "x-custom"];
const named = ["escape", "enter", "tab", "backspace", "delete", "insert", "home", "end", "pageup", "pagedown", "arrowup", "arrowdown", "arrowleft", "arrowright", "f1", "f5", "f12"];
const symbols = ["+", ",", ".", "/", ";", "'", "[", "]", "\\", "-", "=", "`", "?", "!", "@", "#"];
const letters = "abcdefghijklmnopqrstuvwxyz".split("");
const digits = "0123456789".split("");
const spellings = new Map<string, string[]>([
    ["escape", ["esc", "escape"]], ["enter", ["return", "enter"]], [" ", ["space", "spacebar"]], ["arrowup", ["up", "arrowup"]], ["arrowdown", ["down", "arrowdown"]], ["arrowleft", ["left", "arrowleft"]], ["arrowright", ["right", "arrowright"]],
    ["delete", ["del", "delete"]], ["insert", ["ins", "insert"]], ["pageup", ["pgup", "pageup"]], ["pagedown", ["pgdn", "pagedown"]], ["+", ["plus"]], [",", ["comma", ","]],
]);
const words = { ctrl: ["ctrl", "control"], meta: ["meta", "cmd", "command", "win"], shift: ["shift"], alt: ["alt", "option"] } as const;
const flags = fc.record({ ctrl: fc.boolean(), meta: fc.boolean(), shift: fc.boolean(), alt: fc.boolean() });
const key = fc.oneof(fc.constantFrom(...letters), fc.constantFrom(...digits), fc.constantFrom(...named), fc.constantFrom(...symbols), fc.constant(" "));
const gap = fc.constantFrom("", "", " ", "  ", "\t");
const typed = fc.oneof(key, key.map(( one ) => one.toUpperCase()), fc.constantFrom("л", "ش", "é", "Dead", "Unidentified", "Process", ""), fc.string({ maxLength: 3 }));
const code = fc.oneof(fc.constantFrom(...letters).map(( one ) => `Key${one.toUpperCase()}`), fc.constantFrom(...digits).map(( one ) => `Digit${one}`), fc.constantFrom("", "Equal", "NumpadAdd", "Comma", "Space", "Escape"));
const press: fc.Arbitrary<device.Key> = fc.record({ key: typed, code, ctrl: fc.boolean(), meta: fc.boolean(), shift: fc.boolean(), alt: fc.boolean(), repeat: fc.boolean() });
const cased = ( word: string ): fc.Arbitrary<string> => fc.array(fc.boolean(), { minLength: word.length, maxLength: word.length }).map(( ups ) => [...word].map(( letter, at ) => (ups[at] ? letter.toUpperCase() : letter)).join(""));
const spelled: fc.Arbitrary<Spelled> = fc.record({ flags, key, seed: fc.infiniteStream(fc.nat({ max: 1_000_000 })), tail: fc.boolean() }).chain(({ flags: held, key: struck, seed, tail }) => {

    const draw = seed[Symbol.iterator]();
    const pick = <T,>( from: readonly T[] ): T => from[(draw.next().value as number) % from.length] as T;
    const mods = (["ctrl", "meta", "shift", "alt"] as const).filter(( name ) => held[name]).map(( name ) => pick(words[name]));
    const said = pick(spellings.get(struck) ?? [struck]);
    const shuffled = [...mods].sort(() => (pick([0, 1]) === 0 ? -1 : 1));
    const plus = struck === "+" && tail;
    const at = plus || said === "," ? shuffled.length : pick(shuffled.map(( _, index ) => index).concat(shuffled.length));
    const parts = plus ? [...shuffled, ""] : [...shuffled.slice(0, at), said, ...shuffled.slice(at)];

    return fc.tuple(fc.array(gap, { minLength: parts.length + 2, maxLength: parts.length + 2 }), fc.tuple(...parts.map(cased))).map(([gaps, typed]) => {

        const body = typed.map(( part, index ) => `${gaps[index] ?? ""}${part}${gaps[index + 1] ?? ""}`).join("+");
        const text = plus ? `${body}+` : body;

        return { combo: { key: struck, ...held }, text, listable: !(said === "," && shuffled.length === 0) };

    });

});
const agents: fc.Arbitrary<Model> = fc.record({ os: fc.constantFrom("ios", "ipad", "android", "tablet", "windows", "chromeos", "macos", "linux"), browser: fc.constantFrom(...browsers.slice(0, 6)), major: fc.integer({ min: 1, max: 99 }), minor: fc.integer({ min: 0, max: 99 }), patch: fc.integer({ min: 0, max: 99 }) }).map(({ os, browser, major, minor, patch }) => {

    const handheld = os === "ios" || os === "android";
    const system = new Map<string, [string, string, string]>([
        ["ios", [`(iPhone; CPU iPhone OS ${major}_${minor}_${patch} like Mac OS X)`, "ios", `${major}.${minor}`]],
        ["ipad", [`(iPad; CPU OS ${major}_${minor} like Mac OS X)`, "ios", `${major}.${minor}`]],
        ["android", [`(Linux; Android ${major}; Pixel 8)`, "android", `${major}`]],
        ["tablet", [`(Linux; Android ${major}.${minor}; SM-X710)`, "android", `${major}.${minor}`]],
        ["windows", [`(Windows NT ${major}.${minor}; Win64; x64)`, "windows", `${major}.${minor}`]],
        ["chromeos", [`(X11; CrOS x86_64 ${major}.${minor}.${patch})`, "chromeos", `${major}.${minor}`]],
        ["macos", [`(Macintosh; Intel Mac OS X ${major}_${minor}_${patch})`, "macos", `${major}.${minor}`]],
        ["linux", ["(X11; Linux x86_64)", "linux", ""]],
    ]).get(os) ?? ["", "unknown", ""];
    const mark = handheld ? " Mobile" : "";
    const engine = new Map<string, string>([
        ["edge", `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0${mark} Safari/537.36 Edg/${major}.0.0.0`],
        ["opera", `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0${mark} Safari/537.36 OPR/${minor}.0.0.0`],
        ["samsung", `AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/${major}.0 Chrome/${minor}.0.0.0${mark} Safari/537.36`],
        ["chrome", `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0${mark} Safari/537.36`],
        ["firefox", `Gecko/20100101${mark} Firefox/${major}.0`],
        ["safari", `AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${major}.${minor}${mark}/15E148 Safari/604.1`],
    ]).get(browser) ?? "";

    return { os: system[1], version: system[2], browser, mobile: handheld, text: `Mozilla/5.0 ${system[0]} ${engine}` };

});

function physical ( wanted: string ): string {

    if ( letters.includes(wanted) ) return `Key${wanted.toUpperCase()}`;

    return digits.includes(wanted) ? `Digit${wanted}` : "";

}
function strikes ( pressed: device.Key, wanted: device.Combo ): boolean {

    const typed = pressed.key.toLowerCase();
    const plain = typed.length === 1 && (letters.includes(typed) || digits.includes(typed));
    const mark = wanted.key.length === 1 && wanted.key !== " " && physical(wanted.key) === "";

    if ( wanted.key === "" ) return false;
    if ( pressed.ctrl !== wanted.ctrl || pressed.meta !== wanted.meta || pressed.alt !== wanted.alt ) return false;
    if ( pressed.shift !== wanted.shift && !(mark && !wanted.shift) ) return false;
    if ( typed === wanted.key ) return true;

    return !plain && physical(wanted.key) !== "" && pressed.code === physical(wanted.key);

}
function pressOf ( wanted: device.Combo ): device.Key {

    return { key: wanted.key, code: physical(wanted.key), ctrl: wanted.ctrl, meta: wanted.meta, shift: wanted.shift, alt: wanted.alt, repeat: false };

}
function web ( given: device.Host, options?: device.Options ): device.Device {

    const made = device.webAdapter(given);

    if ( !made ) throw new Error("no web adapter");

    return device.create(made, options);

}
function settle ( turns = 12 ): Promise<void> {

    return turns === 0 ? Promise.resolve() : Promise.resolve().then(() => settle(turns - 1));

}

describe("fuzz device", () => {

    it("any text parses into a known agent, and nothing past the cap or beside the hints changes the answer", () => {

        const platform = fc.constantFrom(undefined, "Android", "iOS", "macOS", "Windows", "Linux", "Chrome OS", "  chromeos ", "Fuchsia", "");
        const hinted = new Map<string, string>([["android", "android"], ["ios", "ios"], ["macos", "macos"], ["windows", "windows"], ["linux", "linux"], ["chrome os", "chromeos"], ["chromeos", "chromeos"]]);

        fc.assert(
            fc.property(fc.oneof(fc.string({ maxLength: 200 }), fc.string({ unit: "binary", maxLength: 2500 })), ( text ) => {

                const agent = device.parseAgent(text);

                expect(systems).toContain(agent.os);
                expect(browsers).toContain(agent.browser);
                expect(agent.version).toMatch(versioned);
                expect(typeof agent.mobile).toBe("boolean");
                expect(device.parseAgent(text.slice(0, 1024))).toEqual(agent);

            }),
            { numRuns: runs },
        );
        fc.assert(
            fc.property(agents, agents, platform, fc.option(fc.boolean(), { nil: undefined }), fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }), ( model, other, named, mobile, touch ) => {

                const { text, ...wanted } = model;
                const base = hinted.get((named ?? "").trim().toLowerCase()) ?? model.os;
                const os = base === "macos" && (touch ?? 0) > 1 ? "ios" : base;

                expect(device.parseAgent(text)).toEqual(wanted);
                expect(device.parseAgent(`${text.padEnd(1024, " ")}${other.text}`)).toEqual(wanted);
                expect(device.parseAgent(text, { platform: named, mobile, touch })).toEqual({ os, version: os === model.os ? model.version : "", browser: model.browser, mobile: mobile ?? model.mobile });

            }),
            { numRuns: runs },
        );

    });
    it("orientation is landscape only when the width is the larger side", () => {

        fc.assert(
            fc.property(fc.double(), fc.double(), ( width, height ) => {

                expect(device.orientationOf(width, height)).toBe(width > height ? "landscape" : "portrait");

            }),
            { numRuns: runs },
        );

    });
    it("a combo spelled in any order, case, alias and spacing parses into the same combo", () => {

        fc.assert(
            fc.property(spelled, fc.boolean(), gap, ( { combo, text }, mac, pad ) => {

                expect(device.combo(text, mac)).toEqual(combo);
                expect(device.combo(`${pad}mod${pad}+${text}`, mac)).toEqual({ ...combo, [mac ? "meta" : "ctrl"]: true });
                expect(device.combos(text.includes(",") ? "" : text, mac)).toEqual(text.includes(",") ? [] : [combo]);

            }),
            { numRuns: runs },
        );

    });
    it("a list of combos splits on its commas alone, whatever keys and gaps it holds", () => {

        const separator = fc.constantFrom(",", " , ", ",,", ", ,", "\t,");

        fc.assert(
            fc.property(fc.array(fc.tuple(spelled.filter(( one ) => one.listable), separator), { maxLength: 6 }), separator, fc.boolean(), ( items, lead, edge ) => {

                const text = `${edge ? lead : ""}${items.map(([one, mark]) => `${one.text}${mark}`).join("")}`;
                const found = device.combos(text);

                expect(found).toEqual(items.map(([one]) => one.combo));
                expect(found.every(( one ) => one.key !== "")).toBe(true);

            }),
            { numRuns: runs },
        );
        fc.assert(
            fc.property(fc.string({ maxLength: 60 }), fc.boolean(), ( text, mac ) => {

                const found = device.combos(text, mac);

                expect(found.every(( one ) => one.key !== "" && one.key === one.key.toLowerCase().trim() || one.key === " ")).toBe(true);
                expect(found.length).toBeLessThanOrEqual(text.split(",").length);

            }),
            { numRuns: runs },
        );

    });
    it("a described combo reads back as itself, with its modifiers in one fixed order", () => {

        fc.assert(
            fc.property(spelled, ( { combo } ) => {

                const label = device.describe({ ...combo, ctrl: false, meta: false, shift: false, alt: false });
                const names = [combo.ctrl ? "Ctrl" : "", combo.alt ? "Alt" : "", combo.shift ? "Shift" : "", combo.meta ? "Win" : ""].filter(( name ) => name !== "");
                const glyphs = [combo.ctrl ? "⌃" : "", combo.alt ? "⌥" : "", combo.shift ? "⇧" : "", combo.meta ? "⌘" : ""].join("");

                expect(device.describe(combo)).toBe([...names, label].join("+"));
                expect(device.describe(combo, true)).toBe(`${glyphs}${label}`);
                expect(device.combo(device.describe(combo))).toEqual(combo);
                expect(device.combos(device.describe(combo))).toEqual(combo.key === "," && names.length === 0 ? [] : [combo]);
                expect(label).not.toBe("");

            }),
            { numRuns: runs },
        );

    });
    it("a key press matches a combo exactly as the reference model says", () => {

        const near = fc.tuple(spelled, press, fc.array(fc.constantFrom("key", "code", "ctrl", "meta", "shift", "alt"), { maxLength: 2 })).map(([{ combo }, other, swapped]) => {

            const made: Record<string, unknown> = { ...pressOf(combo) };

            for ( const name of swapped ) made[name] = other[name as keyof device.Key];

            return [made as device.Key, combo] as const;

        });

        fc.assert(
            fc.property(fc.oneof(near, fc.tuple(press, spelled.map(( one ) => one.combo))), ( [pressed, wanted] ) => {

                expect([pressed, wanted, device.matches(pressed, wanted)]).toEqual([pressed, wanted, strikes(pressed, wanted)]);

            }),
            { numRuns: runs * 2 },
        );
        fc.assert(
            fc.property(spelled, fc.constantFrom("ctrl", "meta", "alt"), fc.constantFrom("л", "ش", "é", "ｋ"), ( { combo }, flipped, foreign ) => {

                const exact = pressOf(combo);
                const lettered = physical(combo.key) !== "";

                expect(device.matches(exact, combo)).toBe(true);
                expect(device.matches({ ...exact, repeat: true, typing: true }, combo)).toBe(true);
                expect(device.matches({ ...exact, [flipped]: !exact[flipped as "ctrl"] }, combo)).toBe(false);
                expect(device.matches({ ...exact, key: exact.key.toUpperCase() }, combo)).toBe(true);
                expect(device.matches({ ...exact, key: foreign }, combo)).toBe(lettered);
                expect(device.matches({ ...exact, key: foreign, code: "" }, combo)).toBe(false);
                expect(device.matches(exact, { ...combo, key: "" })).toBe(false);
                expect(device.matches({ ...exact, key: undefined as never }, combo)).toBe(false);

            }),
            { numRuns: runs },
        );

    });
    it("a target that passes is the trimmed text, printable, and never resolves to a scheme outside the list", () => {

        const pad = fc.constantFrom("", "", " ", "\t", "\n", " ", "﻿", "\u0000", "\u0001", "\u007f");
        const scheme = fc.constantFrom(...openable, ...refused).chain(cased);
        const rest = fc.oneof(fc.string({ maxLength: 40 }), fc.constantFrom("alert(1)", "//evil.example/x", "+201000000000", "a@a.example", "text/html,<script>alert(1)</script>", "/etc/passwd"));
        const text = fc.oneof(
            fc.tuple(pad, scheme, fc.constantFrom(":", "://", ":/", "", " :", "\t:"), rest, pad).map(( parts ) => parts.join("")),
            fc.tuple(fc.constantFrom("//", "/", "\\\\", "?", "#", "", "1", "-", "ｊavascript:"), rest).map(( parts ) => parts.join("")),
            fc.string({ maxLength: 60 }),
            fc.string({ unit: "binary", maxLength: 60 }),
        );
        const tame = ( given: string ): boolean => [...given].every(( letter ) => letter.charCodeAt(0) >= 32 && letter.charCodeAt(0) !== 127);
        const custom = fc.subarray([...openable, ...refused]).chain(( list ) => fc.tuple(...list.map(cased)));

        fc.assert(
            fc.property(text, custom, ( given, list ) => {

                const trimmed = given.trim();
                const named = schemed.exec(trimmed)?.[1]?.toLowerCase();
                const fine = trimmed !== "" && trimmed.length <= 8192 && tame(trimmed);
                const lowered = list.map(( one ) => one.toLowerCase());

                for ( const [found, allowed] of [[device.targetOf(given), openable], [device.targetOf(given, list), lowered], [device.targetOf(given, []), []]] as const ) {

                    expect<unknown[]>([given, found]).toEqual([given, fine && (named === undefined || (allowed as readonly string[]).includes(named)) ? trimmed : undefined]);

                    if ( found === undefined || !URL.canParse(found, "https://app.example/x/y") ) continue;

                    expect(["https:", ...allowed.map(( one ) => `${one}:`)]).toContain(new URL(found, "https://app.example/x/y").protocol);

                }

            }),
            { numRuns: runs * 2 },
        );
        fc.assert(
            fc.property(fc.constantFrom(...refused).chain(cased), fc.constantFrom("", " ", "\t", "\n", "\r\n", " ", "﻿"), rest, ( named, lead, tail ) => {

                expect(device.targetOf(`${lead}${named}:${tail}`)).toBeUndefined();

            }),
            { numRuns: runs },
        );
        expect([device.targetOf(`https://a.example/${"a".repeat(8192 - 18)}`)?.length, device.targetOf(`https://a.example/${"a".repeat(8192 - 17)}`)]).toEqual([8192, undefined]);

    });
    it("the web door opens only what the target rule passes, and a web address always opens detached", async () => {

        const scheme = fc.constantFrom(...openable, ...refused).chain(cased);
        const rest = fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom("alert(1)", "//evil.example/x", "+201000000000", "a@a.example"));
        const text = fc.oneof(fc.tuple(fc.constantFrom("", " ", "\t"), scheme, fc.constantFrom(":", "://", ""), rest).map(( parts ) => parts.join("")), fc.string({ maxLength: 40 }), fc.constantFrom("settings", " settings ", "/orders/7", "//cdn.example/a.png"));
        const custom = fc.option(fc.subarray([...openable, ...refused]).chain(( list ) => fc.tuple(...list.map(cased))), { nil: undefined });

        await fc.assert(
            fc.asyncProperty(text, custom, async ( given, list ) => {

                const calls: unknown[][] = [];
                const unit = web({ navigator: {}, document: {}, open: ( ...sent ) => calls.push(sent) }, list === undefined ? {} : { schemes: list });
                const found = device.targetOf(given, list ?? openable);
                const allowed = (list ?? openable).map(( one ) => `${one.toLowerCase()}:`);
                const opened = await unit.open(given);

                expect([given, opened, calls.length]).toEqual([given, found !== undefined && found !== "settings", found !== undefined && found !== "settings" ? 1 : 0]);

                for ( const [target, frame, features] of calls ) {

                    const web = typeof target === "string" && URL.canParse(target, "https://app.example/x") ? new URL(target, "https://app.example/x").protocol : "";

                    expect(target).toBe(found);
                    expect(["https:", ...allowed, ""]).toContain(web);

                    if ( web === "http:" || web === "https:" ) expect([frame, features]).toEqual(["_blank", "noopener,noreferrer"]);
                    else if ( web !== "" ) expect([frame, features]).toEqual(["_self", undefined]);

                }

            }),
            { numRuns: 3000 },
        );

    });
    it("the web device reads any host, whatever is missing, empty or throwing, into one complete info", () => {

        const maybe = <T,>( given: fc.Arbitrary<T> ): fc.Arbitrary<T | undefined> => fc.option(given, { nil: undefined });
        const looks = ["(prefers-color-scheme: dark)", "(prefers-reduced-motion: reduce)", "(prefers-contrast: more)", "(prefers-contrast: less)", "(pointer: coarse)", "(pointer: none)", "(display-mode: standalone)"];
        const facts = fc.record({
            userAgent: maybe(fc.oneof(agents.map(( one ) => one.text), fc.string({ maxLength: 80 }))),
            platform: maybe(fc.constantFrom("Android", "iOS", "macOS", "Windows", "Fuchsia", "")),
            handheld: maybe(fc.boolean()),
            language: maybe(fc.constantFrom("", "ar-EG", "en")),
            languages: maybe(fc.array(fc.constantFrom("ar", "en-US", "fr"), { maxLength: 3 })),
            onLine: maybe(fc.boolean()),
            touch: maybe(fc.integer({ min: 0, max: 10 })),
            link: maybe(fc.record({ type: maybe(fc.constantFrom("wifi", "cellular", "ethernet", "none", "bluetooth", "")), effectiveType: maybe(fc.constantFrom("4g", "")) })),
            standalone: maybe(fc.boolean()),
            width: maybe(fc.integer({ min: 0, max: 10_000 })),
            height: maybe(fc.integer({ min: 0, max: 10_000 })),
            ratio: maybe(fc.double({ min: 0.5, max: 4, noNaN: true })),
            seen: maybe(fc.constantFrom("visible", "hidden", "prerender")),
            focus: fc.constantFrom("yes", "no", "throws", "missing"),
            media: fc.constantFrom("works", "works", "throws", "nothing", "missing"),
            matched: fc.subarray(looks),
            style: fc.constantFrom("works", "works", "throws", "nothing", "missing"),
            inset: fc.constantFrom("44px", "", "abc", "12.5px", "-3px", "0"),
        });
        const pruned = ( given: Record<string, unknown> ): Record<string, unknown> => Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined));

        fc.assert(
            fc.property(facts, ( given ) => {

                const browser = pruned({
                    userAgent: given.userAgent, language: given.language, languages: given.languages, onLine: given.onLine, maxTouchPoints: given.touch, standalone: given.standalone,
                    connection: given.link && pruned(given.link), userAgentData: given.platform === undefined && given.handheld === undefined ? undefined : pruned({ platform: given.platform, mobile: given.handheld }),
                }) as Browser;
                const page = pruned({
                    visibilityState: given.seen,
                    hasFocus: given.focus === "missing" ? undefined : () => {

                        if ( given.focus === "throws" ) throw new Error("detached");

                        return given.focus === "yes";

                    },
                }) as Page;
                const host = pruned({
                    navigator: browser, document: page, innerWidth: given.width, innerHeight: given.height, devicePixelRatio: given.ratio,
                    matchMedia: given.media === "missing" ? undefined : ( query: string ) => {

                        if ( given.media === "throws" ) throw new Error("no media");

                        return given.media === "nothing" ? undefined : { matches: given.matched.includes(query) };

                    },
                    getComputedStyle: given.style === "missing" ? undefined : () => {

                        if ( given.style === "throws" ) throw new Error("no style");

                        return given.style === "nothing" ? undefined : { getPropertyValue: () => given.inset };

                    },
                }) as device.Host;
                const unit = web(host);
                const info = unit.info();
                const look = ( query: string ): boolean => given.media === "works" && given.matched.includes(query);
                const agent = device.parseAgent(given.userAgent ?? "", { platform: given.platform, mobile: given.handheld, touch: given.touch });
                const language = given.language || given.languages?.[0] || "en";
                const side = given.style === "works" && Number.isFinite(Number.parseFloat(given.inset)) ? Number.parseFloat(given.inset) : 0;
                const link = given.link?.type;
                const width = given.width ?? 0;
                const height = given.height ?? 0;

                expect(info).toEqual({
                    platform: "web", os: agent.os, version: agent.version, browser: agent.browser, model: "", mobile: agent.mobile, touch: (given.touch ?? 0) > 0,
                    pointer: look(looks[4] ?? "") ? "coarse" : look(looks[5] ?? "") ? "none" : "fine", language, languages: given.languages?.length ? given.languages : [language], timeZone: info.timeZone,
                    online: given.onLine ?? true, network: link === "wifi" || link === "cellular" || link === "ethernet" || link === "none" ? link : given.link?.effectiveType ? "cellular" : "unknown",
                    reducedMotion: look(looks[1] ?? ""), contrast: look(looks[2] ?? "") ? "more" : look(looks[3] ?? "") ? "less" : "normal", scheme: look(looks[0] ?? "") ? "dark" : "light", width, height, pixelRatio: given.ratio ?? 1,
                    orientation: width > height ? "landscape" : "portrait", insets: { top: side, right: side, bottom: side, left: side }, standalone: given.standalone === true || look(looks[6] ?? ""),
                    visible: given.seen !== "hidden", focused: given.focus !== "no",
                });
                expect(Object.keys(info).sort()).toEqual(Object.keys(device.unknownInfo()).sort());
                expect(info.timeZone).not.toBe("");
                info.languages.push("xx");
                info.insets.top = -1;
                expect([unit.info().languages.includes("xx"), unit.info().insets.top]).toEqual([false, side]);
                expect([unit.is("web"), unit.facts()]).toEqual([true, { platform: "web", os: agent.os, version: agent.version, browser: agent.browser, mobile: agent.mobile, language, timeZone: info.timeZone, scheme: info.scheme, viewport: `${width}x${height}`, online: info.online, network: info.network }]);

            }),
            { numRuns: 4000 },
        );

    });
    it("hotkeys fire the first bound combo that matches, honouring typing and repeat", () => {

        const listable = spelled.filter(( one ) => one.listable).map(( one ) => one.text);
        const texts = fc.array(fc.oneof(listable, fc.tuple(listable, listable).map(( pair ) => pair.join(" , ")), listable.map(( one ) => `mod+${one}`)), { minLength: 1, maxLength: 5 });
        const events = fc.array(fc.record({ from: fc.nat({ max: 1000 }), exact: fc.boolean(), typing: fc.boolean(), repeat: fc.boolean(), other: press }), { maxLength: 12 });
        const options = fc.record({ typing: fc.option(fc.boolean(), { nil: undefined }), repeat: fc.option(fc.boolean(), { nil: undefined }) });

        fc.assert(
            fc.property(fc.constantFrom("macos", "ios", "windows", "linux", "android", "unknown"), texts, events, options, ( os, bound, pressed, hotkey ) => {

                const fired: number[] = [];
                const sinks = new Set<( key: device.Key ) => void>();
                const unit = device.create({
                    info: () => ({ ...device.unknownInfo(), os }),
                    watch: () => () => undefined,
                    keys: ( listener ) => {

                        sinks.add(listener);

                        return () => { sinks.delete(listener); };

                    },
                });
                const handlers: Record<string, ( key: device.Key ) => void> = {};

                bound.forEach(( text, at ) => { handlers[text] = () => { fired.push(at); }; });

                const mac = os === "macos" || os === "ios";
                const wanted = Object.entries(handlers).flatMap(([text]) => device.combos(text, mac).map(( one ) => [one, bound.lastIndexOf(text)] as const));
                const stop = unit.hotkeys(handlers, hotkey);
                const expected: number[] = [];

                expect(sinks.size).toBe(1);

                for ( const event of pressed ) {

                    const base = event.exact && wanted.length > 0 ? pressOf((wanted[event.from % wanted.length] as (typeof wanted)[number])[0]) : event.other;
                    const key: device.Key = { ...base, repeat: event.repeat, typing: event.typing };
                    const hit = key.repeat && hotkey.repeat !== true ? undefined : wanted.find(([one]) => strikes(key, one) && (!event.typing || (hotkey.typing ?? (one.ctrl || one.meta || one.key === "escape"))));

                    if ( hit ) expected.push(hit[1]);

                    for ( const sink of sinks ) sink(key);

                }

                expect(fired).toEqual(expected);
                stop();
                expect(sinks.size).toBe(0);

            }),
            { numRuns: 5000 },
        );

    });
    it("the app badge only ever receives nothing or a whole count inside the host range", async () => {

        await fc.assert(
            fc.asyncProperty(fc.option(fc.oneof(fc.double(), fc.integer(), fc.constantFrom(0, -0, 0.5, 2 ** 53, 2 ** 64, 1e308)), { nil: undefined }), fc.boolean(), async ( count, clears ) => {

                const calls: (number | string | undefined)[] = [];
                const browser: Browser = { setAppBadge: async ( total ) => { calls.push(total); } };

                if ( clears ) browser.clearAppBadge = async () => { calls.push("clear"); };

                const done = await (count === undefined ? web({ navigator: browser, document: {} }).badge() : web({ navigator: browser, document: {} }).badge(count));
                const total = count === undefined ? undefined : Number.isNaN(count) ? 0 : Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(count)));

                expect([count, done, calls]).toEqual([count, true, [clears && total === 0 ? "clear" : total]]);

                if ( typeof calls[0] === "number" ) expect([Number.isSafeInteger(calls[0]), calls[0] >= 0, Object.is(calls[0], -0)]).toEqual([true, true, false]);

            }),
            { numRuns: 3000 },
        );

    });
    it("a wake lock never leaks: one live sentinel while held, none after release, none released twice", async () => {

        const step = fc.constantFrom<Step>("hide", "show", "show", "refuse", "allow", "slow", "fast", "grant", "grant", "deny", "stop");

        await fc.assert(
            fc.asyncProperty(fc.array(step, { maxLength: 30 }), async ( steps ) => {

                const live = new Set<number>();
                const released: number[] = [];
                const gates: (( open: boolean ) => void)[] = [];
                const heard = new Set<Listener>();
                const page: Page = { visibilityState: "visible", addEventListener: ( _, handler ) => { heard.add(handler); }, removeEventListener: ( _, handler ) => { heard.delete(handler); } };
                let made = 0;
                let refusing = false;
                let slow = false;
                let stopped = false;
                const browser: Browser = {
                    wakeLock: {
                        request: async () => {

                            if ( refusing ) throw new Error("refused");
                            if ( slow && !(await new Promise<boolean>(( done ) => { gates.push(done); })) ) throw new Error("denied");

                            made += 1;

                            const id = made;

                            live.add(id);

                            return { release: async () => { released.push(id); live.delete(id); } };

                        },
                    },
                };
                const stop = await web({ navigator: browser, document: page }).awake();
                const turn = ( state: string ): void => {

                    page.visibilityState = state;

                    for ( const handler of [...heard] ) handler({} as never);

                };

                expect([typeof stop, live.size, heard.size]).toEqual(["function", 1, 1]);

                for ( const one of steps ) {

                    if ( one === "hide" ) turn("hidden");
                    if ( one === "show" ) turn("visible");
                    if ( one === "refuse" || one === "allow" ) refusing = one === "refuse";
                    if ( one === "slow" || one === "fast" ) slow = one === "slow";
                    if ( one === "grant" || one === "deny" ) gates.shift()?.(one === "grant");
                    if ( one === "stop" ) stopped = true;
                    if ( one === "stop" ) stop?.();

                    await settle();
                    expect([one, live.size, heard.size, new Set(released).size]).toEqual([one, stopped ? 0 : 1, stopped ? 0 : 1, released.length]);

                }

                for ( const gate of gates.splice(0) ) gate(true);

                await settle();
                stop?.();
                await settle();
                expect([live.size, heard.size, new Set(released).size, released.length]).toEqual([0, 0, released.length, made]);

            }),
            { numRuns: 1500 },
        );

    });

});
