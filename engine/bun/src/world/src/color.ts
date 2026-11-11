import * as number from "engine-number";

export type Rgb = { r: number; g: number; b: number; a: number };
export type Hsl = { h: number; s: number; l: number; a: number };
export type Oklch = { l: number; c: number; h: number; a: number };
export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";
export type ContrastLevel = "AA" | "AAA";
export type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
export type Shades = Record<Shade, Rgb>;

type Triple = [number, number, number];

const steps: readonly Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/;
const angles: Record<string, number> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
const edge = 1e-4;
const names =
    "aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a " +
    "burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b " +
    "darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 " +
    "darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff " +
    "dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 " +
    "gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 " +
    "lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 " +
    "lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 " +
    "magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a " +
    "mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 " +
    "olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 " +
    "peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 " +
    "seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c " +
    "teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32";

let named: Map<string, string> | undefined;
let ramp: Float64Array | undefined;

function channel ( value: number ): number {

    return number.clamp(Math.round(value) || 0, 0, 255);

}
function unit ( value: number ): number {

    return number.clamp(value || 0, 0, 1);

}
function hue ( value: number ): number {

    return (((value % 360) + 360) % 360) || 0;

}
function curve ( value: number ): number {

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

}
function linear ( value: number ): number {

    ramp ??= Float64Array.from({ length: 256 }, ( _, at ) => curve(at / 255));

    return ramp[value] ?? curve(value / 255);

}
function gamma ( value: number ): number {

    const v = unit(value);

    return (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

}
function spread ( h: number, s: number, l: number ): Triple {

    const reach = s * Math.min(l, 1 - l);
    const at = ( n: number ): number => {

        const k = (n + h / 30) % 12;

        return l - reach * Math.max(-1, Math.min(k - 3, 9 - k, 1));

    };

    return [at(0), at(8), at(4)];

}
function lit ( l: number, a: number, b: number ): Triple {

    const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

    return [
        4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
        -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
        -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
    ];

}
function fits ( light: Triple ): boolean {

    return light.every(( value ) => value >= -edge && value <= 1 + edge);

}
function measure ( text: string, whole: number, bare = 1 ): number {

    if ( text === "none" ) return 0;

    const percent = text.endsWith("%");
    const digits = percent ? text.slice(0, -1) : text;

    if ( !numeric.test(digits) ) return Number.NaN;

    return percent ? (Number(digits) / 100) * whole : Number(digits) * bare;

}
function angle ( text: string ): number {

    if ( text === "none" ) return 0;

    const found = /^(.*?)(deg|grad|rad|turn)?$/.exec(text);
    const digits = found?.[1] ?? "";

    return numeric.test(digits) ? Number(digits) * (angles[found?.[2] ?? "deg"] ?? 1) : Number.NaN;

}
function hexed ( hex: string ): Rgb | undefined {

    if ( !/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex) ) return undefined;

    const wide = hex.length <= 4 ? hex.replace(/./g, "$&$&") : hex;
    const bits = Number.parseInt(wide, 16);

    return wide.length === 8 ? rgb(bits >>> 24, (bits >>> 16) & 255, (bits >>> 8) & 255, (bits & 255) / 255) : rgb(bits >>> 16, (bits >>> 8) & 255, bits & 255);

}
function known ( name: string ): Rgb | undefined {

    if ( name === "transparent" ) return rgb(0, 0, 0, 0);

    named ??= new Map(names.split(" ").map(( pair ) => [pair.slice(0, -7), pair.slice(-6)]));

    return hexed(named.get(name) ?? "");

}
function fromHwb ( h: number, white: number, black: number, a: number ): Rgb {

    const sum = white + black;
    const gray = sum >= 1 ? (white / sum) * 255 : 0;

    if ( sum >= 1 ) return rgb(gray, gray, gray, a);

    const [r, g, b] = spread(hue(h), 1, 0.5);
    const lift = ( value: number ): number => (value * (1 - sum) + white) * 255;

    return rgb(lift(r), lift(g), lift(b), a);

}
function ratio ( foreground: Rgb, background: Rgb ): number {

    const front = luminance(foreground.a < 1 ? blend(foreground, { ...background, a: 1 }) : foreground);
    const back = luminance(background);

    return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);

}
export function rgb ( r: number, g: number, b: number, a = 1 ): Rgb {

    return { r: channel(r), g: channel(g), b: channel(b), a: unit(a) };

}
export function hsl ( h: number, s: number, l: number, a = 1 ): Hsl {

    return { h: hue(h), s: unit(s), l: unit(l), a: unit(a) };

}
export function oklch ( l: number, c: number, h: number, a = 1 ): Oklch {

    return { l: unit(l), c: Math.max(0, c || 0), h: hue(h), a: unit(a) };

}
export function fromHsl ( given: Hsl ): Rgb {

    const [r, g, b] = spread(given.h, given.s, given.l);

    return rgb(r * 255, g * 255, b * 255, given.a);

}
export function toHsl ( given: Rgb ): Hsl {

    const r = given.r / 255;
    const g = given.g / 255;
    const b = given.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;

    if ( d === 0 ) return { h: 0, s: 0, l, a: given.a };

    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;

    return { h: hue(h * 60), s: unit(s), l: unit(l), a: given.a };

}
export function toOklch ( given: Rgb ): Oklch {

    const r = linear(given.r);
    const g = linear(given.g);
    const b = linear(given.b);
    const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const l = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
    const green = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
    const blue = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
    const c = Math.sqrt(green * green + blue * blue);

    return { l: unit(l), c, h: c < 1e-6 ? 0 : hue((Math.atan2(blue, green) * 180) / Math.PI), a: given.a };

}
export function fromOklch ( given: Oklch ): Rgb {

    const l = unit(given.l);
    const radians = (given.h * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    let light = lit(l, given.c * cos, given.c * sin);

    if ( !fits(light) ) {

        let low = 0;
        let high = Math.min(given.c, 0.5);

        for ( let round = 0; round < 14; round += 1 ) {

            const middle = (low + high) / 2;

            if ( fits(lit(l, middle * cos, middle * sin)) ) low = middle;
            else high = middle;

        }

        light = lit(l, low * cos, low * sin);

    }

    return rgb(gamma(light[0]), gamma(light[1]), gamma(light[2]), given.a);

}
export function color ( text: string ): Rgb | undefined {

    if ( text.length > 128 ) return undefined;

    const clean = text.trim().toLowerCase();

    if ( clean.startsWith("#") ) return hexed(clean.slice(1));

    const found = /^(?:(rgb|hsl)a?|(hwb|oklch|oklab))\((.*)\)$/.exec(clean);

    if ( !found ) return known(clean);

    const kind = found[1] ?? found[2];
    const inner = found[3] ?? "";
    const [body = "", tail, more] = inner.split("/");
    const parts = body.split(/[\s,]+/).filter(Boolean);

    if ( more !== undefined || parts.length < 3 || parts.length > (tail === undefined ? 4 : 3) ) return undefined;

    const [x = "", y = "", z = "", w = tail?.trim()] = parts;
    const a = w === undefined ? 1 : measure(w, 1);
    const read: Triple =
        kind === "rgb" ? [measure(x, 255), measure(y, 255), measure(z, 255)]
        : kind === "oklch" ? [measure(x, 1), measure(y, 0.4), angle(z)]
        : kind === "oklab" ? [measure(x, 1), measure(y, 0.4), measure(z, 0.4)]
        : [angle(x), measure(y, 1, 0.01), measure(z, 1, 0.01)];

    if ( Number.isNaN(a) || read.some(( value ) => Number.isNaN(value)) ) return undefined;

    const [p, q, s] = read;

    if ( kind === "rgb" ) return rgb(p, q, s, a);
    if ( kind === "hsl" ) return fromHsl(hsl(p, q, s, a));
    if ( kind === "hwb" ) return fromHwb(p, unit(q), unit(s), a);
    if ( kind === "oklch" ) return fromOklch(oklch(p, q, s, a));

    return fromOklch(oklch(p, Math.hypot(q, s), (Math.atan2(s, q) * 180) / Math.PI, a));

}
export function isColor ( value: unknown ): value is string {

    return typeof value === "string" && color(value) !== undefined;

}
export function toHex ( given: Rgb, alpha = given.a < 1 ): string {

    const pair = ( value: number ): string => channel(value).toString(16).padStart(2, "0");

    return `#${pair(given.r)}${pair(given.g)}${pair(given.b)}${alpha ? pair(given.a * 255) : ""}`;

}
export function toCss ( given: Rgb, format: ColorFormat = "hex" ): string {

    if ( format === "hex" ) return toHex(given);

    const tail = given.a < 1 ? ` / ${number.precision(given.a, 3)}` : "";

    if ( format === "rgb" ) return `rgb(${given.r} ${given.g} ${given.b}${tail})`;
    if ( format === "hsl" ) return `hsl(${channels(given)}${tail})`;

    const { l, c, h } = toOklch(given);

    return `oklch(${number.precision(l * 100, 2)}% ${number.precision(c, 4)} ${number.precision(h, 2)}${tail})`;

}
export function channels ( given: Rgb ): string {

    const { h, s, l } = toHsl(given);

    return `${number.precision(h, 1)} ${number.precision(s * 100, 1)}% ${number.precision(l * 100, 1)}%`;

}
export function luminance ( given: Rgb ): number {

    return 0.2126 * linear(given.r) + 0.7152 * linear(given.g) + 0.0722 * linear(given.b);

}
export function blend ( top: Rgb, bottom: Rgb ): Rgb {

    const a = top.a + bottom.a * (1 - top.a);
    const over = ( front: number, back: number ): number => (front * top.a + back * bottom.a * (1 - top.a)) / a;

    return a === 0 ? rgb(0, 0, 0, 0) : rgb(over(top.r, bottom.r), over(top.g, bottom.g), over(top.b, bottom.b), a);

}
export function contrast ( foreground: Rgb, background: Rgb ): number {

    return number.precision(ratio(foreground, background), 2);

}
export function readable ( foreground: Rgb, background: Rgb, level: ContrastLevel = "AA", large = false ): boolean {

    return ratio(foreground, background) >= (level === "AAA" ? (large ? 4.5 : 7) : large ? 3 : 4.5);

}
export function isDark ( given: Rgb ): boolean {

    return luminance(given) < 0.179;

}
export function onColor ( background: Rgb ): Rgb {

    return isDark(background) ? rgb(255, 255, 255) : rgb(0, 0, 0);

}
export function alpha ( given: Rgb, value: number ): Rgb {

    return rgb(given.r, given.g, given.b, value);

}
export function mix ( a: Rgb, b: Rgb, amount = 0.5 ): Rgb {

    const t = unit(amount);
    const x = toOklch(a);
    const y = toOklch(b);
    const seen = x.a + (y.a - x.a) * t;
    const gap = ((y.h - x.h + 540) % 360) - 180;
    const h = x.c < 1e-4 ? y.h : y.c < 1e-4 ? x.h : x.h + gap * t;
    const weigh = ( from: number, to: number ): number => (seen === 0 ? from + (to - from) * t : (from * x.a * (1 - t) + to * y.a * t) / seen);

    return fromOklch({ l: weigh(x.l, y.l), c: weigh(x.c, y.c), h: hue(h), a: seen });

}
export function lighten ( given: Rgb, amount = 0.1 ): Rgb {

    const lab = toOklch(given);

    return fromOklch({ ...lab, l: unit(lab.l + amount) });

}
export function darken ( given: Rgb, amount = 0.1 ): Rgb {

    return lighten(given, -amount);

}
export function saturate ( given: Rgb, amount = 0.05 ): Rgb {

    const lab = toOklch(given);

    return fromOklch({ ...lab, c: Math.max(0, lab.c + amount) });

}
export function rotate ( given: Rgb, degrees: number ): Rgb {

    const lab = toOklch(given);

    return fromOklch({ ...lab, h: hue(lab.h + degrees) });

}
export function grayscale ( given: Rgb ): Rgb {

    return fromOklch({ ...toOklch(given), c: 0 });

}
export function shades ( base: Rgb ): Shades {

    const lab = toOklch(base);
    const top = Math.max(0.97, (lab.l + 1) / 2);
    const bottom = Math.min(0.18, lab.l / 2);
    const made = ( step: Shade ): Rgb => {

        if ( step === 500 ) return rgb(base.r, base.g, base.b);

        const light = step < 500;
        const t = Math.abs(step - 500) / 450;

        return fromOklch({ l: lab.l + ((light ? top : bottom) - lab.l) * t, c: lab.c * (1 - (light ? 0.675 : 0.45) * t), h: lab.h, a: 1 });

    };

    return Object.fromEntries(steps.map(( step ) => [step, made(step)])) as Shades;

}
export function ensureReadable ( foreground: Rgb, background: Rgb, level: ContrastLevel = "AA", large = false ): Rgb {

    if ( readable(foreground, background, level, large) ) return foreground;

    const lab = toOklch(foreground);
    const at = ( l: number ): Rgb => fromOklch({ ...lab, l });
    let near = lab.l;
    let far = isDark(background) ? 1 : 0;

    if ( !readable(at(far), background, level, large) ) return onColor(background);

    for ( let round = 0; round < 10; round += 1 ) {

        const middle = (near + far) / 2;

        if ( readable(at(middle), background, level, large) ) far = middle;
        else near = middle;

    }

    return at(far);

}
