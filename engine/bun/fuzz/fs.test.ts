import { describe, expect, test as it } from "bun:test";
import { posix } from "node:path";
import * as error from "engine/error";
import * as fs from "engine/fs";
import * as fc from "fast-check";

type Item = { low: string; high: string | undefined; raw: boolean };
type Flat = { kind: "lit"; letter: string; raw: boolean } | { kind: "star" } | { kind: "any" } | { kind: "sep" } | { kind: "class"; not: boolean; mark: string; items: Item[] };
type Token = Flat | { kind: "group"; choices: Token[][] };
type Pattern = { negated: boolean; tokens: Token[] };
type Shape = { rooted: boolean; open: boolean; source: string };
type Verb = "write" | "append" | "remove" | "ensure" | "empty" | "copy" | "move" | "read";
type Deed = { verb: Verb; path: string; to: string; text: string };
type Tree = { files: Map<string, string>; folders: Set<string> };
type Shot = { bytes: Uint8Array; width: number; height: number; sound: boolean };

const runs = 10_000;
const drive = /^[A-Za-z]:(?:[\\/]|$)/;
const counted = /^(.*) \((\d{1,9})\)$/;
const cwd = `/${Array.from({ length: 40 }, ( _, at ) => `@${at}`).join("/")}`;
const word = fc.stringMatching(/^[A-Za-z0-9._-]{1,6}$/);
const piece = fc.oneof({ weight: 6, arbitrary: word }, { weight: 2, arbitrary: fc.constant("..") }, { weight: 1, arbitrary: fc.constantFrom(".", "") });
const loose = fc.array(piece, { maxLength: 8 }).map(( pieces ) => pieces.join("/"));
const posed = fc.tuple(fc.boolean(), loose, fc.boolean()).map(([lead, body, tail]) => `${lead ? "/" : ""}${body}${tail ? "/" : ""}`);
const rooted = loose.map(( body ) => `/${body}`);
const free = loose.filter(( body ) => !body.startsWith("/"));
const odd = fc.constantFrom("C:", "z:", "C:x", "1:", "a b", "é", "🙂", "x.Y", ".env", " ");
const mixed = fc.tuple(
    fc.constantFrom("", "", "", "/", "\\", "C:", "C:/", "c:\\", "//", "./", "../", ".\\"),
    fc.array(fc.tuple(fc.oneof({ weight: 6, arbitrary: word }, { weight: 2, arbitrary: fc.constantFrom("..", ".", "") }, { weight: 3, arbitrary: odd }), fc.constantFrom("/", "/", "\\", "//", "\\/")), { maxLength: 7 }),
    fc.boolean(),
).map(([lead, body, open]) => {

    const text = body.map(([name, gap]) => `${name}${gap}`).join("");

    return `${lead}${open ? text : text.replace(/[\\/]+$/, "")}`;

});
const wild = fc.oneof(posed, mixed, fc.string({ maxLength: 40 }));
const sane = fc.oneof(posed, mixed);
const names = fc.oneof(word, odd, fc.constantFrom("", ".", "..", "a/b", "a\\b", "a\u0000b", "/", "\\", "c:", "a.b.c", "é.PNG", "...", "..a", "a."), fc.string({ maxLength: 8 }));

const plain = ["a", "b", "c", "A", "B", ".", "-", "_", "é", "É", "1", "🙂", " "];
const sharp = ["*", "?", "[", "]", "{", "}", ",", "\\", "!", "^"];
const most = 512;
const star: fc.Arbitrary<Token> = fc.constant({ kind: "star" });
const any: fc.Arbitrary<Token> = fc.constant({ kind: "any" });
const sep: fc.Arbitrary<Token> = fc.constant({ kind: "sep" });
const lit: fc.Arbitrary<Token> = fc.oneof(
    { weight: 8, arbitrary: fc.record({ kind: fc.constant("lit" as const), letter: fc.constantFrom(...plain), raw: fc.boolean() }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant("lit" as const), letter: fc.constantFrom(...sharp), raw: fc.constant(false) }) },
);
const item: fc.Arbitrary<Item> = fc.oneof(
    fc.record({ low: fc.constantFrom(...plain, ...sharp), high: fc.constant(undefined), raw: fc.boolean() }),
    fc.record({ low: fc.constantFrom("a", "A", "1", "X", "é", " "), high: fc.constantFrom("c", "C", "9", "c", "z", "É", "a", "_"), raw: fc.constant(true) }),
);
const set: fc.Arbitrary<Token> = fc.record({ kind: fc.constant("class" as const), not: fc.boolean(), mark: fc.constantFrom("!", "^"), items: fc.array(item, { minLength: 1, maxLength: 4 }) });
const basic: fc.Arbitrary<Token> = fc.oneof({ weight: 7, arbitrary: lit }, { weight: 2, arbitrary: star }, { weight: 1, arbitrary: any }, { weight: 2, arbitrary: set }, { weight: 2, arbitrary: sep });
const inner: fc.Arbitrary<Token> = fc.array(fc.array(basic, { maxLength: 3 }), { minLength: 2, maxLength: 3 }).map(( choices ) => ({ kind: "group", choices }));
const outer: fc.Arbitrary<Token> = fc.array(fc.array(fc.oneof({ weight: 8, arbitrary: basic }, { weight: 1, arbitrary: inner }), { maxLength: 4 }), { minLength: 2, maxLength: 3 }).map(( choices ) => ({ kind: "group", choices }));
const deep: Token[] = [{ kind: "star" }, { kind: "star" }];
const chunk: fc.Arbitrary<Token[]> = fc.oneof(
    { weight: 10, arbitrary: basic.map(( token ) => [token]) },
    { weight: 2, arbitrary: fc.constantFrom<Token[]>([{ kind: "sep" }, ...deep, { kind: "sep" }], [...deep, { kind: "sep" }], [{ kind: "sep" }, ...deep], deep) },
    { weight: 1, arbitrary: outer.map(( token ) => [token]) },
);
const pattern: fc.Arbitrary<Pattern> = fc.record({ negated: fc.boolean(), tokens: fc.array(chunk, { maxLength: 8 }).map(( chunks ) => chunks.flat()) });
const roamed = fc.tuple(fc.boolean(), fc.array(fc.array(fc.constantFrom(...plain, ...sharp.filter(( letter ) => letter !== "\\")), { maxLength: 4 }).map(( letters ) => letters.join("")), { maxLength: 4 })).map(([lead, parts]) => `${lead ? "/" : ""}${parts.join("/")}`);
const dice = fc.array(fc.nat({ max: 9973 }), { minLength: 24, maxLength: 24 });

const sentinel = "\u0000";
const devices = ["con", "prn", "aux", "nul", ...Array.from({ length: 9 }, ( _, at ) => `com${at + 1}`), ...Array.from({ length: 9 }, ( _, at ) => `lpt${at + 1}`)];
const grammar = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const glyphs = ["a", "b", "Z", "0", "7", ".", "-", "_", " ", "\t", "\n", "/", "\\", ":", "*", "?", "\"", "<", ">", "|", "é", "🙂", "漢", "con", "NUL", "com1", "LPT9", "aux", ".txt", ".tar.gz", ...[0, 0x7f, 0x85, 0x200e, 0x202e, 0x2066, 0xfeff, 0xd800, 0xdfff, 0xa0, 0x3000].map(( code ) => String.fromCharCode(code))];
const titled = fc.array(fc.constantFrom(...glyphs), { maxLength: 24 }).map(( parts ) => parts.join(""));
const tidy = fc.stringMatching(/^[A-Za-z0-9_][A-Za-z0-9_-]{0,12}( [A-Za-z0-9_]{1,5}){0,2}(\.[a-z0-9]{1,6})?$/).filter(( name ) => !devices.includes((name.split(".")[0] ?? "").toLowerCase()));
const typed = fc.oneof(
    fc.constantFrom("image/png", "IMAGE/PNG", " text/html ; charset=utf-8", "image/jpg", "application/json", "text/plain;base64", "", "image/", "/png", "image/p ng", "a/b/c", "*/*", "image/*", `text/${String.fromCharCode(0x212a)}ind`),
    fc.array(fc.constantFrom("a", "Z", "9", "/", ";", " ", "+", ".", "-", "_", "!", "#", "$", "&", "^", "*", "=", "\"", "é", String.fromCharCode(0x212a), String.fromCharCode(0x130)), { maxLength: 10 }).map(( parts ) => parts.join("")),
);
const kinds = ["image/png", "IMAGE/PNG", "text/plain;charset=utf-8", "", "bad type", "application/json", " text/html "];
const blanks = [" ", "\n", "\t", "\r", "\f", "\r\n  "];
const magic: number[][] = [[], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], [0xff, 0xd8, 0xff], [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50], [0x42, 0x4d], [0, 0, 1, 0], [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], [0x50, 0x4b, 3, 4], [0x1a, 0x45, 0xdf, 0xa3]];
const noise = fc.tuple(fc.constantFrom(...magic), fc.uint8Array({ maxLength: 80 })).map(([lead, rest]) => Uint8Array.of(...lead, ...rest));
const span = fc.oneof({ weight: 1, arbitrary: fc.constant(0) }, { weight: 9, arbitrary: fc.integer({ min: 1, max: 65_535 }) });
const filler = fc.tuple(fc.constantFrom(0xe0, 0xe2, 0xed, 0xee, 0xfe, 0xdb, 0xc4, 0xdd), fc.array(fc.nat({ max: 255 }), { maxLength: 12 }));
const frames = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc9, 0xcf];
const decoder = new TextDecoder();
const leaf = fc.constantFrom("a", "a", "b", "b", "c");
const spot = fc.array(leaf, { minLength: 1, maxLength: 3 }).map(( parts ) => `/${parts.join("/")}`);
const placed = fc.oneof(
    { weight: 14, arbitrary: spot },
    { weight: 2, arbitrary: spot.map(( path ) => `${path.replaceAll("/", "/./")}//`) },
    { weight: 1, arbitrary: spot.map(( path ) => `${path}/..`) },
    { weight: 1, arbitrary: fc.tuple(spot, leaf).map(([path, name]) => `${path}/../${name}`) },
    { weight: 1, arbitrary: fc.constantFrom("/", "", `/a${sentinel}`, "/..", "//", "/a/../..") },
);
const alone = fc.oneof({ weight: 15, arbitrary: placed }, { weight: 1, arbitrary: fc.constantFrom(".", "..", "a/..", "../..", "a", "b/c", "./a", "../a") });
const body = fc.constantFrom("", "1", "22", "é", "three");
const deed: fc.Arbitrary<Deed> = fc.oneof(
    { weight: 5, arbitrary: fc.record({ verb: fc.constantFrom<Verb>("write", "write", "write", "append", "remove", "ensure", "ensure", "empty", "read", "read"), path: alone, to: fc.constant(""), text: body }) },
    { weight: 4, arbitrary: fc.record({ verb: fc.constantFrom<Verb>("copy", "move"), path: placed, to: placed, text: fc.constant("") }) },
);
const images = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const refusals = ["validation/file.size", "validation/file.type", "validation/file.content", "validation/file.pixels"];
const claimed = fc.constantFrom("image/png", "image/jpeg", "image/gif", "image/webp", "image/jpg", "IMAGE/PNG", "", "text/plain", "text/html", "application/pdf", "image/svg+xml", "bad type");
const labels = fc.constantFrom("a.png", "a.jpg", "a.gif", "a.webp", "a", "a.txt", "a.svg", "a.html", "../x.gif", "");
const shot: fc.Arbitrary<Shot> = fc.oneof(
    fc.tuple(fc.oneof(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 4000 })), fc.oneof(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 4000 })), fc.array(fc.nat({ max: 255 }), { maxLength: 40 }), fc.nat({ max: 2 })).map(([width, height, tail, pick]): Shot => ({ bytes: pick === 0 ? png(width, height, tail) : pick === 1 ? gif(width, height, tail) : jpeg(width, height, [], 0xc0, tail), width, height, sound: true })),
    noise.map(( bytes ): Shot => ({ bytes, width: 0, height: 0, sound: false })),
    fc.constantFrom("", "hello", "<svg xmlns='http://www.w3.org/2000/svg'/>", "<html><script>alert(1)</script>", "<img src=x onerror=alert(1)>", "%PDF-1.7 x", "GIF89a").map(( text ): Shot => ({ bytes: new TextEncoder().encode(text), width: 0, height: 0, sound: false })),
);

function rootOf ( path: string ): string {

    return path.startsWith("/") || path.startsWith("\\") ? "/" : drive.test(path) ? `${path.slice(0, 2)}/` : "";

}
function trimmed ( path: string ): string {

    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

}
function bad ( name: string ): boolean {

    return name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\u0000");

}
function climb ( path: string ): string[] {

    const out: string[] = [];
    let current = path;

    for ( let next = posix.dirname(current); next !== current; next = posix.dirname(current) ) {

        out.push(next);
        current = next;

    }

    return out;

}

function show ( tokens: readonly Token[] ): string {

    return tokens.map(( token ) => {

        if ( token.kind === "lit" ) return token.raw ? token.letter : `\\${token.letter}`;
        if ( token.kind === "star" ) return "*";
        if ( token.kind === "any" ) return "?";
        if ( token.kind === "sep" ) return "/";
        if ( token.kind === "group" ) return `{${token.choices.map(show).join(",")}}`;

        return `[${token.not ? token.mark : ""}${token.items.map(( one ) => (one.high !== undefined ? `${one.low}-${one.high}` : one.raw && one.low !== "-" && plain.includes(one.low) ? one.low : `\\${one.low}`)).join("")}]`;

    }).join("");

}
function count ( tokens: readonly Token[] ): number {

    return tokens.reduce(( total, token ) => Math.min(total * (token.kind === "group" ? token.choices.reduce(( sum, choice ) => sum + count(choice), 0) : 1), 1e9), 1);

}
function spread ( tokens: readonly Token[] ): Flat[][] {

    let out: Flat[][] = [[]];

    for ( const token of tokens ) {

        const next: Flat[][] = token.kind === "group" ? token.choices.flatMap(spread) : [[token]];

        out = out.flatMap(( head ) => next.map(( tail ) => [...head, ...tail]));

    }

    return out;

}
function point ( letter: string ): string {

    return `\\u{${(letter.codePointAt(0) ?? 0).toString(16)}}`;

}
function unit ( token: Flat ): string {

    if ( token.kind === "lit" ) return point(token.letter);
    if ( token.kind === "star" ) return "[^/]*";
    if ( token.kind !== "class" ) return "[^/]";

    const body = token.items.map(( one ) => (one.high === undefined ? point(one.low) : (one.low.codePointAt(0) ?? 0) <= (one.high.codePointAt(0) ?? 0) ? `${point(one.low)}-${point(one.high)}` : "")).join("");

    return body === "" ? (token.not ? "[^/]" : "(?!)") : `(?:(?!/)[${token.not ? "^" : ""}${body}])`;

}
function shape ( tokens: readonly Flat[], dot: boolean ): Shape {

    const parts: Flat[][] = [[]];

    for ( const token of tokens ) {

        if ( token.kind === "sep" ) parts.push([]);
        else parts[parts.length - 1]?.push(token);

    }

    const pieces = parts
        .filter(( part ) => part.length > 0 && !(part.length === 1 && part[0]?.kind === "lit" && part[0].letter === "." && part[0].raw))
        .map(( part ) => (part.length === 2 && part.every(( token ) => token.kind === "star") ? null : part));
    const source = pieces.map(( piece ) => {

        if ( piece === null ) return dot ? "(?:[^/]+/)*" : "(?:(?!\\.)[^/]+/)*";

        const first = piece[0];
        const dotted = first?.kind === "lit" && first.letter === ".";

        return `${dot || dotted ? "" : "(?!\\.)"}${piece.map(unit).join("")}/`;

    }).join("");

    return { rooted: tokens[0]?.kind === "sep", open: pieces[0] === null, source: `^${source}$` };

}
function verdict ( patterns: readonly Pattern[], path: string, dot: boolean, insensitive: boolean ): boolean {

    const joined = fs.segments(path).map(( part ) => `${part}/`).join("");
    const root = rootOf(path);
    const wanted: Shape[] = [];
    const refused: Shape[] = [];
    const passes = ( made: Shape ): boolean => (made.rooted ? root !== "" : root === "" || made.open) && new RegExp(made.source, insensitive ? "iu" : "u").test(joined);

    for ( const one of patterns ) for ( const flat of spread(one.tokens) ) (one.negated ? refused : wanted).push(shape(flat, dot));

    return (wanted.length === 0 ? refused.length > 0 : wanted.some(passes)) && !refused.some(passes);

}
function sample ( tokens: readonly Flat[], rolls: readonly number[] ): string {

    let at = 0;
    const roll = ( size: number ): number => {

        at += 1;

        return (rolls[at % rolls.length] ?? 0) % size;

    };
    const pick = ( from: readonly string[] ): string => from[roll(from.length)] ?? "";
    const text = tokens.map(( token ) => {

        if ( token.kind === "lit" ) return token.letter === "\\" ? "" : token.letter;
        if ( token.kind === "star" ) return pick(["", "", "a", "b1", ".a", "É🙂", "a/b", ".b/c"]);
        if ( token.kind === "any" ) return pick(plain);
        if ( token.kind === "sep" ) return "/";

        return token.not ? pick(["z", "a", "🙂"]) : (token.items[roll(token.items.length)]?.low ?? "");

    }).join("");

    return Array.from(text, ( letter ) => (roll(4) === 0 && letter.toUpperCase().length === letter.length ? letter.toUpperCase() : roll(7) === 0 ? letter.toLowerCase() : letter)).join("");

}

function weigh ( text: string ): number {

    return new TextEncoder().encode(text).length;

}
function foul ( code: number ): boolean {

    return code < 32 || (code >= 127 && code <= 159) || (code >= 0xd800 && code <= 0xdfff) || code === 0x200e || code === 0x200f || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || code === 0xfeff;

}
function flaws ( name: string, max: number ): string[] {

    const out: string[] = [];

    if ( name === "" ) out.push("empty");
    if ( Array.from(name).some(( letter ) => foul(letter.codePointAt(0) ?? 0)) ) out.push("hostile");
    if ( /[\\/:*?"<>|]/.test(name) ) out.push("special");
    if ( / {2}|[^\S ]/.test(name) ) out.push("blank");
    if ( /^[.\- ]/.test(name) ) out.push("lead");
    if ( /[. ]$/.test(name) ) out.push("trail");
    if ( devices.includes((name.split(".")[0] ?? "").toLowerCase()) ) out.push("device");
    if ( weigh(name) > max ) out.push("long");
    if ( fs.segments(name).join("/") !== name ) out.push("segment");

    return out;

}
function be ( value: number, size: 2 | 4 ): number[] {

    const low = [(value >>> 8) & 255, value & 255];

    return size === 2 ? low : [(value >>> 24) & 255, (value >>> 16) & 255, ...low];

}
function png ( width: number, height: number, tail: readonly number[] ): Uint8Array {

    return Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be(width, 4), ...be(height, 4), ...tail);

}
function gif ( width: number, height: number, tail: readonly number[] ): Uint8Array {

    return Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 255, width >>> 8, height & 255, height >>> 8, ...tail);

}
function jpeg ( width: number, height: number, fillers: readonly (readonly [number, readonly number[]])[], frame: number, tail: readonly number[] ): Uint8Array {

    return Uint8Array.of(0xff, 0xd8, ...fillers.flatMap(([marker, body]) => [0xff, marker, ...be(body.length + 2, 2), ...body]), 0xff, frame, 0, 17, 8, ...be(height, 2), ...be(width, 2), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, ...tail);

}
function based ( bytes: Uint8Array ): string {

    return btoa(Array.from(bytes, ( byte ) => String.fromCharCode(byte)).join(""));

}
function hexed ( byte: number, upper: boolean ): string {

    const text = byte.toString(16).padStart(2, "0");

    return `%${upper ? text.toUpperCase() : text}`;

}
function spelled ( bytes: Uint8Array, rolls: readonly number[] ): string {

    return Array.from(bytes, ( byte, at ) => {

        const roll = rolls[at % rolls.length] ?? 0;

        return /[A-Za-z0-9._~-]/.test(String.fromCharCode(byte)) && roll % 2 === 0 ? String.fromCharCode(byte) : hexed(byte, roll % 3 === 0);

    }).join("");

}
function read ( uri: string, max?: number ): { type: string; bytes: number[] } | undefined {

    const got = fs.parseDataUri(uri, max);

    return got === undefined ? undefined : { type: got.type, bytes: Array.from(got.bytes) };

}
function keyed ( path: string ): string {

    return posix.resolve("/", path);

}
function unsound ( path: string ): boolean {

    return path === "" || path.includes(sentinel);

}
function rootish ( path: string ): boolean {

    return posix.normalize(path).split("/").every(( part ) => part === "" || part === "." || part === "..");

}
function beneath ( base: string, key: string ): boolean {

    return key !== base && key.startsWith(base === "/" ? "/" : `${base}/`);

}
function blocked ( tree: Tree, key: string ): boolean {

    for ( let current = posix.dirname(key); current !== "/"; current = posix.dirname(current) ) if ( tree.files.has(current) ) return true;

    return false;

}
function raise ( tree: Tree, key: string ): void {

    for ( let current = key; current !== "/"; current = posix.dirname(current) ) tree.folders.add(current);

}
function under ( tree: Tree, key: string ): string[] {

    return [...tree.files.keys(), ...tree.folders].filter(( at ) => beneath(key, at));

}
function clear ( tree: Tree, keys: readonly string[] ): void {

    for ( const at of keys ) {

        tree.files.delete(at);
        tree.folders.delete(at);

    }

}
function settle ( tree: Tree, at: string, found: string | undefined ): void {

    if ( found === undefined ) tree.folders.add(at);
    else tree.files.set(at, found);

}
function enact ( tree: Tree, one: Deed ): string {

    const { verb, path, to, text } = one;

    if ( unsound(path) || ((verb === "copy" || verb === "move") && unsound(to)) ) return "validation/fs.path";

    const key = keyed(path);
    const target = keyed(to);
    const file = tree.files.get(key);
    const folder = tree.folders.has(key);

    if ( verb === "read" ) return file !== undefined ? "ok" : folder ? "conflict/fs.kind" : "not_found/fs.missing";

    if ( verb === "write" || verb === "append" ) {

        if ( folder || blocked(tree, key) ) return "conflict/fs.kind";

        raise(tree, posix.dirname(key));
        tree.files.set(key, verb === "append" ? `${file ?? ""}${text}` : text);

        return "ok";

    }

    if ( verb === "ensure" ) {

        if ( file !== undefined || blocked(tree, key) ) return "conflict/fs.kind";

        raise(tree, key);

        return "ok";

    }

    if ( verb === "remove" || verb === "empty" ) {

        if ( rootish(path) ) return "forbidden/fs.root";
        if ( verb === "empty" && (file !== undefined || blocked(tree, key)) ) return "conflict/fs.kind";

        clear(tree, verb === "remove" ? [key, ...under(tree, key)] : under(tree, key));

        if ( verb === "empty" ) raise(tree, key);

        return "ok";

    }

    if ( verb === "move" && key === "/" ) return "forbidden/fs.root";
    if ( file === undefined && !folder ) return "not_found/fs.missing";

    if ( verb === "copy" ) {

        if ( key === target ) return "ok";

        if ( file !== undefined ) {

            if ( tree.folders.has(target) || blocked(tree, target) ) return "conflict/fs.kind";

            raise(tree, posix.dirname(target));
            tree.files.set(target, file);

            return "ok";

        }

        if ( beneath(key, target) ) return "conflict/fs.inside";
        if ( tree.files.has(target) || blocked(tree, target) ) return "conflict/fs.kind";

        const copied = under(tree, key);

        if ( beneath(target, key) || copied.some(( at ) => (tree.files.has(at) ? tree.folders : tree.files).has(`${target}${at.slice(key.length)}`)) ) return "?";

        raise(tree, target);

        for ( const at of copied ) settle(tree, `${target}${at.slice(key.length)}`, tree.files.get(at));

        return "ok";

    }

    if ( folder && beneath(key, target) ) return "conflict/fs.inside";
    if ( blocked(tree, target) ) return "conflict/fs.kind";
    if ( key === target ) return "ok";
    if ( file !== undefined ? tree.folders.has(target) : tree.files.has(target) ) return "conflict/fs.kind";
    if ( folder && under(tree, target).length > 0 ) return "conflict/fs.exists";

    const whole = [key, ...under(tree, key)];
    const moved = whole.map(( at ): [string, string | undefined] => [`${target}${at.slice(key.length)}`, tree.files.get(at)]);

    clear(tree, whole);
    raise(tree, posix.dirname(target));

    for ( const [at, found] of moved ) settle(tree, at, found);

    return "ok";

}
function drawn ( tree: Tree ): string[] {

    return [...Array.from(tree.files, ([at, text]) => `${at} = ${JSON.stringify(text)}`), ...Array.from(tree.folders, ( at ) => `${at}/`)].sort();

}
function named ( failure: unknown ): string {

    return failure instanceof error.Fault ? `${failure.code}/${failure.reason}` : String(failure);

}
async function census ( memory: fs.MemoryDisk ): Promise<Tree> {

    const files = new Map<string, string>();
    const folders = new Set(["/"]);

    for ( const entry of await fs.walk("/") ) {

        if ( entry.kind === "dir" ) folders.add(entry.path);
        else files.set(entry.path, decoder.decode(memory.files.get(entry.path)));

    }

    return { files, folders };

}
async function perform ( one: Deed ): Promise<[said: string, text: string]> {

    const { verb, path, to, text } = one;

    try {

        if ( verb === "read" ) return ["ok", await fs.text(path)];
        if ( verb === "ensure" ) return ["ok", await fs.ensure(path)];

        if ( verb === "write" ) await fs.write(path, text);
        else if ( verb === "append" ) await fs.append(path, text);
        else if ( verb === "remove" ) await fs.remove(path);
        else if ( verb === "empty" ) await fs.empty(path);
        else if ( verb === "copy" ) await fs.copy(path, to);
        else await fs.move(path, to);

        return ["ok", ""];

    } catch ( failure ) {

        return [named(failure), ""];

    }

}
async function judged ( file: Blob, bounds: fs.Limits ): Promise<[said: string, seen: fs.Seen | undefined]> {

    try {

        return ["ok", await fs.inspect(file, bounds)];

    } catch ( failure ) {

        return [named(failure), undefined];

    }

}

describe("fuzz fs", () => {

    it("normalize agrees with the posix reference and holds its laws on any text", () => {

        fc.assert(fc.property(posed, ( path ) => {

            expect(fs.normalize(path)).toBe(trimmed(posix.normalize(path)));
            expect(fs.join(...path.split("/"))).toBe(trimmed(posix.normalize(path.split("/").filter(( part ) => part !== "").join("/"))));

        }), { numRuns: runs });
        fc.assert(fc.property(wild, ( path ) => {

            const once = fs.normalize(path);
            const parts = fs.segments(path);

            expect(fs.normalize(once)).toBe(once);
            expect(once.includes("//")).toBe(false);
            expect(once.includes("\\")).toBe(false);
            expect(fs.isAbsolute(path)).toBe(rootOf(path) !== "");
            expect(fs.isAbsolute(once)).toBe(fs.isAbsolute(path));
            expect(rootOf(once)).toBe(rootOf(path));
            expect(fs.segments(once)).toEqual(parts);
            expect(fs.depth(path)).toBe(parts.length);
            expect(parts.every(( part ) => part !== "" && part !== "." && !/[\\/]/.test(part))).toBe(true);
            expect(parts.lastIndexOf("..")).toBe(parts.filter(( part ) => part === "..").length - 1);

            if ( fs.isAbsolute(path) ) expect(parts.includes("..")).toBe(false);
            if ( fs.basename(path) !== "" ) expect(fs.join(fs.dirname(path), fs.basename(path))).toBe(once);

        }), { numRuns: runs });

    });

    it("dirname, basename, stem, extension, hidden, parse and ancestors agree with the posix reference", () => {

        fc.assert(fc.property(posed, fc.oneof(word, fc.constantFrom("", ".", ".txt", "txt")), ( path, suffix ) => {

            const flat = trimmed(posix.normalize(path));
            const base = flat === "." ? "" : posix.basename(flat);
            const tail = posix.extname(base);
            const name = base.slice(0, base.length - tail.length);
            const ext = tail.slice(1).toLowerCase();

            expect(fs.dirname(path)).toBe(posix.dirname(flat));
            expect(fs.basename(path)).toBe(base);
            expect(fs.basename(path, suffix)).toBe(base === "" ? "" : posix.basename(`x/${base}`, suffix));
            expect(fs.basename(path, tail)).toBe(tail.length > 1 || tail === "" ? name : base.slice(0, -1));
            expect(fs.stem(path)).toBe(name);
            expect(fs.extension(path)).toBe(ext);
            expect(fs.hidden(path)).toBe(base.startsWith(".") && base !== "..");
            expect(fs.ancestors(path)).toEqual(climb(flat));
            expect(fs.parse(path)).toEqual({ dir: posix.dirname(flat), base, name, ext });

        }), { numRuns: runs });
        fc.assert(fc.property(wild, ( path ) => {

            const once = fs.normalize(path);
            const chain = fs.ancestors(path);

            expect(fs.format(fs.parse(path))).toBe(once === "." ? "" : once);
            expect(chain).toEqual(chain.map(( _, at ) => fs.dirname(at === 0 ? path : (chain[at - 1] ?? ""))));
            expect(chain.length).toBe(fs.depth(path));
            expect(fs.dirname(chain[chain.length - 1] ?? once)).toBe(chain[chain.length - 1] ?? once);

        }), { numRuns: runs });

    });

    it("relative agrees with the posix reference and resolve walks it back", () => {

        fc.assert(fc.property(rooted, rooted, ( from, to ) => {

            expect(fs.relative(from, to)).toBe(posix.relative(from, to) || ".");

        }), { numRuns: runs });
        fc.assert(fc.property(wild, wild, ( from, to ) => {

            const walked = fs.relative(from, to);

            expect(fs.normalize(walked)).toBe(walked);
            expect(fs.relative(from, from)).toBe(".");

            if ( fs.segments(from).includes("..") || (fs.isAbsolute(from) && !fs.isAbsolute(to)) ) return;

            expect(fs.resolve(from, walked)).toBe(fs.normalize(to));

        }), { numRuns: runs });
        fc.assert(fc.property(rooted, fc.array(posed, { maxLength: 4 }), ( base, parts ) => {

            expect(fs.resolve(base, ...parts)).toBe(posix.resolve(base, ...parts));

        }), { numRuns: runs });

    });

    it("inside answers a normalized path under its base exactly when the posix reference lands there", () => {

        fc.assert(fc.property(rooted, posed, ( base, path ) => {

            const home = posix.resolve(base);
            const landed = posix.resolve(base, path);
            const held = landed === home || landed.startsWith(home === "/" ? "/" : `${home}/`);

            expect(fs.inside(base, path)).toBe(held ? landed : undefined);
            expect(fs.within(base, path)).toBe(held);

        }), { numRuns: runs });
        fc.assert(fc.property(free, posed, ( base, path ) => {

            const home = posix.resolve(cwd, base);
            const landed = posix.resolve(cwd, base, path);
            const held = landed === home || landed.startsWith(`${home}/`);

            expect(fs.inside(base, path)).toBe(held ? posix.relative(cwd, landed) || "." : undefined);

        }), { numRuns: runs });
        fc.assert(fc.property(wild, wild, ( base, path ) => {

            const found = fs.inside(base, path);

            expect(fs.within(base, path)).toBe(found !== undefined);

            if ( base.includes("\u0000") || path.includes("\u0000") ) expect(found).toBeUndefined();
            if ( found === undefined ) return;

            const held = fs.segments(base);
            const parts = fs.segments(found);

            expect(fs.normalize(found)).toBe(found);
            expect(rootOf(found)).toBe(rootOf(base));
            expect(parts.slice(0, held.length)).toEqual(held);
            expect(parts[held.length]).not.toBe("..");

        }), { numRuns: runs });

    });

    it("common answers the longest shared folder whatever the order", () => {

        const family = fc.tuple(sane, fc.array(loose, { minLength: 1, maxLength: 4 })).map(([head, tails]) => tails.map(( tail ) => `${head}/${tail}`));

        fc.assert(fc.property(fc.oneof(family, fc.array(wild, { maxLength: 4 }), fc.tuple(family, wild).map(([list, extra]) => [...list, extra])), ( paths ) => {

            const found = fs.common(paths);
            const lists = paths.map(( path ) => fs.segments(path));
            const first = lists[0] ?? [];
            const roots = new Set(paths.map(rootOf));
            let shared = 0;

            while ( shared < first.length && lists.every(( list ) => list[shared] === first[shared]) ) shared += 1;

            expect(fs.common([...paths].reverse())).toBe(found);

            if ( roots.size !== 1 ) {

                expect(found).toBe("");

                return;

            }

            expect(fs.segments(found)).toEqual(first.slice(0, shared));
            expect(rootOf(found)).toBe(rootOf(paths[0] ?? ""));

            if ( found !== "" ) expect(fs.normalize(found)).toBe(found);
            if ( found !== "" && fs.isAbsolute(found) ) for ( const path of paths ) expect(fs.inside(found, path)).toBe(fs.normalize(path));

        }), { numRuns: runs });

    });

    it("a new name, stem or ending keeps the folder and refuses whatever is not one name", () => {

        fc.assert(fc.property(sane, names, ( path, name ) => {

            if ( bad(name) ) {

                expect(() => fs.withName(path, name)).toThrow(new RangeError("not a name"));

                return;

            }

            const made = fs.withName(path, name);

            expect(fs.basename(made)).toBe(name);
            expect(fs.dirname(made)).toBe(fs.dirname(path));
            expect(fs.isAbsolute(made)).toBe(fs.isAbsolute(path));
            expect(fs.normalize(made)).toBe(made);

        }), { numRuns: runs });
        fc.assert(fc.property(sane, names, ( path, next ) => {

            const tail = posix.extname(fs.basename(path)).slice(1);

            if ( bad(next) ) {

                expect(() => fs.withStem(path, next)).toThrow(new RangeError("not a name"));

                return;

            }

            const made = fs.withStem(path, next);

            expect(fs.basename(made)).toBe(tail ? `${next}.${tail}` : next);
            expect(fs.dirname(made)).toBe(fs.dirname(path));
            expect(fs.isAbsolute(made)).toBe(fs.isAbsolute(path));

            if ( tail ) expect([fs.stem(made), fs.extension(made)]).toEqual([next, fs.extension(path)]);

        }), { numRuns: runs });
        fc.assert(fc.property(sane, names, ( path, next ) => {

            const base = fs.basename(path);
            const body = base.slice(0, base.length - posix.extname(base).length);
            const tail = next.replace(/^\.+/, "");
            const name = tail ? `${body}.${tail}` : body;

            if ( bad(name) ) {

                expect(() => fs.withExtension(path, next)).toThrow(new RangeError("not a name"));

                return;

            }

            const made = fs.withExtension(path, next);

            expect(fs.basename(made)).toBe(name);
            expect(fs.dirname(made)).toBe(fs.dirname(path));
            expect(fs.isAbsolute(made)).toBe(fs.isAbsolute(path));

        }), { numRuns: runs });

    });

    it("unique answers the path itself when free, else the first free count in the same folder", () => {

        const target = fc.tuple(sane, fc.option(fc.nat({ max: 12 }), { nil: undefined }), fc.constantFrom("", "", ".txt", ".tar.gz", ".")).map(([path, count, tail]) => `${path}${count === undefined ? "" : ` (${count})`}${tail}`).filter(( path ) => fs.basename(path) !== "" && fs.basename(path) !== "..");

        fc.assert(fc.property(target, fc.nat({ max: 6 }), fc.array(fc.integer({ min: 2, max: 9 }), { maxLength: 3 }), fc.array(wild, { maxLength: 3 }), ( path, run, gaps, noise ) => {

            const base = fs.basename(path);
            const body = base.slice(0, base.length - posix.extname(base).length);
            const found = counted.exec(body);
            const head = found?.[1] ?? body;
            const start = found ? Number(found[2]) : 1;
            const numbered = ( count: number ): string => fs.withName(path, `${head} (${count})${base.slice(body.length)}`);
            const others = [...gaps.map(( gap ) => numbered(start + run + gap)), ...noise.filter(( one ) => one !== path)];
            const taken = [path, ...Array.from({ length: run }, ( _, at ) => numbered(start + 1 + at)), ...others].filter(( one ) => one !== numbered(start + run + 1));
            const made = fs.unique(path, taken);

            expect(fs.unique(path, others)).toBe(path);
            expect(fs.unique(path, new Set(others))).toBe(path);
            expect(made).toBe(numbered(start + run + 1));
            expect(fs.unique(path, new Set(taken))).toBe(made);
            expect(taken.includes(made)).toBe(false);
            expect(fs.dirname(made)).toBe(fs.dirname(path));
            expect(fs.extension(made)).toBe(fs.extension(path));

        }), { numRuns: runs });

    });

    it("a glob answers what the reference pattern answers, over wildcards, classes, braces, globstars and negation", () => {

        fc.assert(fc.property(fc.array(pattern, { minLength: 1, maxLength: 3 }), roamed, dice, fc.boolean(), fc.boolean(), fc.boolean(), ( patterns, roam, rolls, drawn, dot, insensitive ) => {

            const texts = patterns.map(( one ) => `${one.negated ? "!" : ""}${show(one.tokens)}`);
            const options = { dot, insensitive };

            if ( patterns.some(( one ) => count(one.tokens) > most) ) {

                expect(() => fs.glob(texts, options)).toThrow(new RangeError("not a glob"));

                return;

            }

            const flats = spread(patterns[(rolls[0] ?? 0) % patterns.length]?.tokens ?? []);
            const path = drawn ? sample(flats[(rolls[1] ?? 0) % flats.length] ?? [], rolls) : roam;
            const wanted = verdict(patterns, path, dot, insensitive);
            const first = texts[0] ?? "";

            expect([texts, path, fs.glob(texts, options)(path)]).toEqual([texts, path, wanted]);
            expect(fs.matches(path, texts, options)).toBe(wanted);
            expect(fs.glob(first, options)(path)).toBe(verdict(patterns.slice(0, 1), path, dot, insensitive));
            expect(fs.matches(path, first, options)).toBe(fs.glob(first, options)(path));

        }), { numRuns: runs * 2 });

    });

    it("a glob refuses a pattern past its length or past its brace product and nothing short of them", () => {

        fc.assert(fc.property(fc.array(fc.integer({ min: 2, max: 6 }), { minLength: 1, maxLength: 5 }), fc.integer({ min: 1000, max: 1050 }), ( sizes, length ) => {

            const text = sizes.map(( size ) => `{${Array.from({ length: size }, ( _, at ) => String.fromCharCode(97 + at)).join(",")}}`).join("");
            const total = sizes.reduce(( product, size ) => product * size, 1);
            const long = "a".repeat(length);

            if ( total > most ) expect(() => fs.glob(text)).toThrow(new RangeError("not a glob"));
            else expect(fs.glob(text)(sizes.map(( size ) => String.fromCharCode(96 + size)).join(""))).toBe(true);

            if ( length > 1024 ) expect(() => fs.glob(long)).toThrow(new RangeError("not a glob"));
            else expect(fs.glob(long)(long)).toBe(true);

        }), { numRuns: 300 });

    });

    it("a safe name is the fallback or one clean bounded segment, blind to hostile letters, and a clean name passes untouched", () => {

        fc.assert(fc.property(titled, tidy, fc.integer({ min: 0, max: 40 }), fc.boolean(), ( name, clean, room, bounded ) => {

            const max = bounded ? room : 255;
            const out = fs.safe(name, sentinel, max);
            const again = fs.safe(out, sentinel, max);
            const bare = Array.from(name).filter(( letter ) => !foul(letter.codePointAt(0) ?? 0)).join("");

            expect([name, max, out === sentinel ? [] : flaws(out, max)]).toEqual([name, max, []]);
            expect([name, max, again === sentinel ? [] : flaws(again, max)]).toEqual([name, max, []]);
            expect(fs.safe(bare, sentinel, max)).toBe(out);

            if ( weigh(name) < max ) expect([name, max, again]).toEqual([name, max, out]);

            expect(fs.safe(clean)).toBe(clean);
            expect(fs.safe(clean, sentinel, weigh(clean))).toBe(clean);
            expect(flaws(clean, 255)).toEqual([]);

        }), { numRuns: runs });

    });

    it("an essence is empty or one lower-case type and subtype, whatever the parameters, the case and the padding", () => {

        fc.assert(fc.property(typed, fc.string(), ( type, extra ) => {

            const first = (type.split(";")[0] ?? "").trim().replace(/[A-Z]/g, ( letter ) => letter.toLowerCase());
            const clean = fs.essence(type);

            expect([type, clean === "" || grammar.test(clean)]).toEqual([type, true]);
            expect([type, clean === "" || grammar.test(first)]).toEqual([type, true]);
            expect([type, clean !== ""]).toEqual([type, grammar.test(first)]);
            expect(fs.essence(clean)).toBe(clean);
            expect(fs.essence(`\t${first.replace(/[a-z]/g, ( letter ) => letter.toUpperCase())} ;${extra}`)).toBe(clean);
            expect(fs.kind(type)).toBe(fs.kind(clean));
            expect(fs.isText(type)).toBe(fs.isText(clean));
            expect(fs.inert(type)).toBe(fs.inert(clean));
            expect(fs.extensionOf(type)).toBe(fs.extensionOf(clean));

            if ( clean === "" ) expect([fs.kind(type), fs.isText(type), fs.inert(type), fs.extensionOf(type), fs.accepts(type, ["image/*", ".png", "text/plain"])]).toEqual(["other", false, false, "", false]);

        }), { numRuns: runs });

    });

    it("an image header reads back its type and size from any view, a cut header never reads another size, and no bytes break the readers", () => {

        fc.assert(fc.property(noise, fc.tuple(span, span), fc.array(fc.nat({ max: 255 }), { maxLength: 12 }), fc.array(filler, { maxLength: 3 }), fc.constantFrom(...frames), fc.nat({ max: 400 }), ( junk, [width, height], tail, fillers, frame, cut ) => {

            const found = fs.sniff(junk);
            const seen = fs.imageSize(junk);

            expect(found === undefined || grammar.test(found)).toBe(true);
            expect(seen === undefined || (seen.type === found && seen.width > 0 && seen.height > 0)).toBe(true);

            for ( const [type, full] of [["image/png", png(width, height, tail)], ["image/gif", gif(width, height, tail)], ["image/jpeg", jpeg(width, height, fillers, frame, tail)]] as const ) {

                const wanted = width > 0 && height > 0 ? { width, height, type } : undefined;
                const framed = new Uint8Array(junk.length + full.length);

                framed.set(junk);
                framed.set(full, junk.length);

                expect(fs.sniff(full)).toBe(type);
                expect([type, width, height, fs.imageSize(full)]).toEqual([type, width, height, wanted]);
                expect(fs.sniff(framed.subarray(junk.length))).toBe(type);
                expect(fs.imageSize(framed.subarray(junk.length))).toEqual(wanted);
                expect<unknown[]>([undefined, wanted]).toContainEqual(fs.imageSize(full.subarray(0, cut % (full.length + 1))));

            }

        }), { numRuns: runs });

    });

    it("a data uri gives back its bytes under bare padding, url letters, percent signs, blanks, a fragment and any case, up to the exact cap", () => {

        fc.assert(fc.property(fc.uint8Array({ maxLength: 48 }), fc.constantFrom(...kinds), dice, fc.integer({ min: -3, max: 3 }), fc.string(), ( bytes, type, rolls, slack, junk ) => {

            const base = based(bytes);
            const bare = base.replace(/=+$/, "");
            const uri = fs.dataUri(type, base);
            const text = `data:${type},${spelled(bytes, rolls)}`;
            const wanted = { type: fs.essence(type) || "text/plain", bytes: Array.from(bytes) };
            const roll = ( at: number ): number => rolls[at % rolls.length] ?? 0;
            const spaced = Array.from(base, ( letter, at ) => `${letter}${roll(at) % 5 === 0 ? (blanks[roll(at + 1) % blanks.length] ?? "") : ""}`).join("");

            expect(uri).toBe(`data:${type};base64,${base}`);
            expect(read(uri)).toEqual(wanted);
            expect(read(fs.dataUri(type, bare))).toEqual(wanted);
            expect(read(fs.dataUri(type, bare.replaceAll("+", "-").replaceAll("/", "_")))).toEqual(wanted);
            expect(read(fs.dataUri(type, base.replace(/[=+/]/g, ( letter ) => hexed(letter.charCodeAt(0), roll(0) % 2 === 0))))).toEqual(wanted);
            expect(read(fs.dataUri(type, spaced))).toEqual(wanted);
            expect(read(`${uri}#${junk}`)).toEqual(wanted);
            expect(read(`${text}#${junk}`)).toEqual(wanted);
            expect(read(`DATA:${type};charset=x; BASE64 ,${base}`)).toEqual(wanted);
            expect(read(`data:${type};base64x,${bare}`)).toEqual({ type: wanted.type, bytes: Array.from(bare, ( letter ) => letter.charCodeAt(0)) });
            expect(read(text)).toEqual(wanted);
            expect(read(`${uri}!`)).toBeUndefined();
            expect(read(uri.slice(5))).toBeUndefined();
            expect(read(uri.replace(",", ""))).toBeUndefined();
            expect(read(uri, bytes.length + slack)).toEqual(slack < 0 ? undefined : wanted);
            expect(read(text, bytes.length + slack)).toEqual(slack < 0 ? undefined : wanted);

            if ( bare.length % 4 === 0 ) expect(read(fs.dataUri(type, `${bare}A`))).toBeUndefined();

        }), { numRuns: runs });

    });

    it("slices tile a blob end to end in order, and refuse a size that is not a count or a blob past ten thousand pieces", () => {

        fc.assert(fc.property(fc.oneof({ weight: 20, arbitrary: fc.integer({ min: 0, max: 300 }) }, { weight: 1, arbitrary: fc.constantFrom(10_000, 10_001, 20_000, 20_001) }), fc.oneof({ weight: 12, arbitrary: fc.integer({ min: -2, max: 9 }) }, { weight: 1, arbitrary: fc.constantFrom(0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 40) }), ( length, size ) => {

            const blob = new Blob([new Uint8Array(length)], { type: "image/png" });

            if ( !Number.isInteger(size) || size <= 0 || length / size > 10_000 ) {

                expect(() => fs.slices(blob, size)).toThrow(new RangeError("not a size"));

                return;

            }

            const made = fs.slices(blob, size);

            expect(made.length).toBe(Math.ceil(length / size));
            expect(made.map(( one ) => [one.index, one.start, one.end, one.blob.size, one.blob.type])).toEqual(made.map(( _, at ) => [at, at * size, Math.min(length, (at + 1) * size), Math.min(length, (at + 1) * size) - at * size, "image/png"]));

        }), { numRuns: 400 });

    });

    it("a data uri reads the way the host reads it, and a blob comes back whole from its own uri, its slices and its head", async () => {

        await fc.assert(fc.asyncProperty(fc.uint8Array({ maxLength: 64 }), fc.constantFrom(...kinds), fc.integer({ min: 1, max: 9 }), dice, async ( bytes, type, size, rolls ) => {

            const blob = new Blob([new Uint8Array(bytes)], { type });
            const back = read(await fs.toDataUri(blob));

            for ( const uri of [fs.dataUri("image/png", based(bytes)), `data:text/plain,${spelled(bytes, rolls)}`] ) expect(Array.from(new Uint8Array(await (await fetch(uri)).arrayBuffer()))).toEqual(read(uri)?.bytes ?? [-1]);

            expect(back).toEqual({ type: fs.essence(blob.type) || "application/octet-stream", bytes: Array.from(bytes) });
            expect(Array.from(await fs.bytes(new Blob(fs.slices(blob, size).map(( one ) => one.blob))))).toEqual(Array.from(bytes));
            expect(Array.from(await fs.head(blob, size))).toEqual(Array.from(bytes.subarray(0, size)));

        }), { numRuns: 200 });

    });

    it("the disk verbs answer what a tree model answers, deed after deed, and a refused deed leaves the tree as it was", async () => {

        await fc.assert(fc.asyncProperty(fc.array(deed, { maxLength: 30, size: "max" }), async ( deeds ) => {

            const memory = fs.memoryDisk();
            const tree: Tree = { files: new Map(), folders: new Set(["/"]) };

            await fs.disk.with(memory, async () => {

                for ( const one of deeds ) {

                    const before = drawn(tree);
                    const wanted = enact(tree, one);
                    const [said, text] = await perform(one);
                    const now = await census(memory);
                    const key = keyed(one.path);

                    if ( wanted === "?" ) {

                        expect(["ok", "conflict/fs.kind"]).toContain(said);

                        tree.files = now.files;
                        tree.folders = now.folders;

                        continue;

                    }

                    expect([one, said]).toEqual([one, wanted]);
                    expect([one, drawn(now), memory.files.size]).toEqual([one, wanted === "ok" ? drawn(tree) : before, tree.files.size]);

                    if ( wanted === "ok" && one.verb === "read" ) expect(text).toBe(tree.files.get(key) ?? "");
                    if ( wanted === "ok" && one.verb === "ensure" ) expect(text).toBe(fs.normalize(one.path));
                    if ( wanted === "ok" && one.verb === "copy" && tree.files.has(key) ) expect(await fs.same(one.path, one.to)).toBe(true);

                    if ( !unsound(one.path) ) expect([await fs.exists(one.path), await fs.isFile(one.path), await fs.isDir(one.path)]).toEqual([tree.files.has(key) || tree.folders.has(key), tree.files.has(key), tree.folders.has(key)]);

                }

            });

        }), { numRuns: 600 });

    });
    it("inspect under an image list accepts only what the bytes name, never a well formed image short of its bounds, and refuses by one of four reasons", async () => {

        await fc.assert(fc.asyncProperty(shot, claimed, labels, fc.constantFrom(0, 40, 10_000_000, 10_000_000), fc.option(fc.constantFrom(1, 100, 10_000, 16_000_000), { nil: undefined }), async ( { bytes, width, height, sound }, type, name, maxBytes, maxPixels ) => {

            const [said, seen] = await judged(new File([new Uint8Array(bytes)], name, { type }), { maxBytes, maxFiles: 1, types: images, maxPixels });

            if ( seen === undefined ) expect(refusals).toContain(said);
            else expect([images.includes(seen.type), fs.sniff(bytes), seen.size, seen.size <= maxBytes, seen.name, maxPixels === undefined || (seen.width ?? Number.NaN) * (seen.height ?? Number.NaN) <= maxPixels]).toEqual([true, seen.type, bytes.length, true, fs.safe(name, ""), true]);

            if ( bytes.length > maxBytes ) expect(said).toBe("validation/file.size");
            else if ( sound ) expect([said, seen?.width, seen?.height]).toEqual(maxPixels !== undefined && width * height > maxPixels ? ["validation/file.pixels", undefined, undefined] : ["ok", width, height]);

        }), { numRuns: 3000 });

    });

});
