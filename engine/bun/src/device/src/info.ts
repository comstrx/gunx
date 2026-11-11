export type Platform = "web" | "ios" | "android" | "desktop" | "server";
export type Scheme = "light" | "dark";
export type Orientation = "portrait" | "landscape";
export type Network = "wifi" | "cellular" | "ethernet" | "none" | "unknown";
export type Pointer = "fine" | "coarse" | "none";
export type Contrast = "more" | "less" | "normal";
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Info = {
    platform: Platform;
    os: string;
    version: string;
    browser: string;
    model: string;
    mobile: boolean;
    touch: boolean;
    pointer: Pointer;
    language: string;
    languages: string[];
    timeZone: string;
    online: boolean;
    network: Network;
    reducedMotion: boolean;
    contrast: Contrast;
    scheme: Scheme;
    width: number;
    height: number;
    pixelRatio: number;
    orientation: Orientation;
    insets: Insets;
    standalone: boolean;
    visible: boolean;
    focused: boolean;
};
export type Agent = { os: string; version: string; browser: string; mobile: boolean };
export type Hints = { platform?: string | undefined; mobile?: boolean | undefined; touch?: number | undefined };

const longest = 1024;
const systems: [string, RegExp][] = [
    ["ios", /iphone|ipad|ipod/i],
    ["android", /android/i],
    ["windows", /windows/i],
    ["chromeos", /\bcros\b/i],
    ["macos", /mac os|macintosh/i],
    ["linux", /linux/i],
];
const browsers: [string, RegExp][] = [
    ["edge", /edg(?:e|a|ios)?\//i],
    ["opera", /opr\/|opera/i],
    ["samsung", /samsungbrowser\//i],
    ["chrome", /chrome|crios|chromium/i],
    ["firefox", /firefox|fxios/i],
    ["safari", /safari/i],
];
const versions = new Map<string, RegExp>([
    ["ios", /(?:iphone|ipad|ipod)[^)]*?os (\d+)[._](\d+)/i],
    ["android", /android (\d+(?:\.\d+)?)/i],
    ["windows", /windows nt (\d+\.\d+)/i],
    ["macos", /mac os x (\d+)[._](\d+)/i],
    ["chromeos", /\bcros \S+ (\d+\.\d+)/i],
]);
const hinted = new Map<string, string>([["android", "android"], ["ios", "ios"], ["macos", "macos"], ["windows", "windows"], ["linux", "linux"], ["chrome os", "chromeos"], ["chromeos", "chromeos"]]);
const handheld = /mobi|iphone|ipod|windows phone/i;
const slate = /ipad|tablet/i;

export function unknownInfo (): Info {

    return {
        platform: "server", os: "unknown", version: "", browser: "unknown", model: "", mobile: false, touch: false, pointer: "fine", language: "en", languages: ["en"], timeZone: "UTC",
        online: true, network: "unknown", reducedMotion: false, contrast: "normal", scheme: "light", width: 0, height: 0, pixelRatio: 1, orientation: "portrait",
        insets: { top: 0, right: 0, bottom: 0, left: 0 }, standalone: false, visible: true, focused: true,
    };

}
export function parseAgent ( agent: string, hints: Hints = {} ): Agent {

    const text = agent.slice(0, longest);
    const sniffed = systems.find(([, shape]) => shape.test(text))?.[0] ?? "unknown";
    const named = hinted.get((hints.platform ?? "").trim().toLowerCase()) ?? sniffed;
    const os = named === "macos" && (hints.touch ?? 0) > 1 ? "ios" : named;
    const found = os === sniffed ? versions.get(os)?.exec(text) : undefined;
    const version = found ? found.slice(1).filter(( part ) => part !== undefined).join(".") : "";
    const browser = browsers.find(([, shape]) => shape.test(text))?.[0] ?? "unknown";
    const mobile = hints.mobile ?? (handheld.test(text) && !slate.test(text));

    return { os, version, browser, mobile };

}
export function orientationOf ( width: number, height: number ): Orientation {

    return width > height ? "landscape" : "portrait";

}
