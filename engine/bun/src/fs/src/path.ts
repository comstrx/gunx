export type Parsed = { dir: string; base: string; name: string; ext: string };
export type Glob = { dot?: boolean | undefined; insensitive?: boolean | undefined };
export type Matcher = ( path: string ) => boolean;

type Split = { root: string; parts: string[] };
type Class = { not: boolean; loose: boolean; singles: Set<string>; ranges: number[] };
type Unit = string | number | Class;
type Piece = readonly Unit[] | null;
type Plan = { rooted: boolean; pieces: Piece[] };

export const separator = "/";

const one = 0;
const many = 1;
const longest = 1024;
const widest = 512;
const kept = 256;
const drive = /^[A-Za-z]:(?:[\\/]|$)/;
const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const matchers = new Map<string, Matcher>();

function split ( path: string ): Split {

    const lead = path[0];
    const root = lead === "/" || lead === "\\" ? separator : drive.test(path) ? `${path.slice(0, 2)}/` : "";
    const parts: string[] = [];

    for ( const segment of (root.length > 1 ? path.slice(2) : path).split(/[\\/]+/) ) {

        if ( segment === "" || segment === "." ) continue;

        if ( segment !== ".." ) parts.push(segment);
        else if ( parts.length && parts[parts.length - 1] !== ".." ) parts.pop();
        else if ( root === "" ) parts.push("..");

    }

    return { root, parts };

}
function whole ( root: string, parts: readonly string[] ): string {

    const text = parts.join(separator);

    return root === "" && drive.test(text) ? `./${text}` : root + text;

}
function cut ( name: string ): [string, string] {

    const index = name.lastIndexOf(".");

    return index <= 0 || name === ".." ? [name, ""] : [name.slice(0, index), name.slice(index + 1)];

}
function wide ( text: string ): boolean {

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code >= 0xd800 && code <= 0xdfff ) return true;

    }

    return false;

}
function lettersOf ( text: string ): ArrayLike<string> {

    return wide(text) ? Array.from(text) : text;

}
function folded ( letter: string ): string {

    const lower = letter.toLowerCase();

    return lower.length === letter.length ? lower : letter;

}
function lowered ( path: string ): string {

    const lower = path.toLowerCase();

    return lower.length === path.length ? lower : Array.from(path, folded).join("");

}
function hostile ( code: number ): boolean {

    return code < 32 || (code >= 127 && code <= 159) || (code >= 0xd800 && code <= 0xdfff) || code === 0x200e || code === 0x200f || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || code === 0xfeff;

}
function weight ( letter: string ): number {

    const code = letter.codePointAt(0) ?? 0;

    return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;

}
function braces ( pattern: string ): string[] {

    const commas: number[] = [];
    let depth = 0;
    let open = -1;

    for ( let at = 0; at < pattern.length; at += 1 ) {

        const letter = pattern[at];

        if ( letter === "\\" ) at += 1;
        else if ( letter === "{" ) {

            if ( depth === 0 ) {

                open = at;
                commas.length = 0;

            }

            depth += 1;

        } else if ( letter === "," && depth === 1 ) commas.push(at);
        else if ( letter === "}" && depth > 0 ) {

            depth -= 1;

            if ( depth > 0 || commas.length === 0 ) continue;

            const cuts = [open, ...commas, at];
            const head = pattern.slice(0, open);
            const tails = braces(pattern.slice(at + 1));
            const out: string[] = [];

            for ( let index = 0; index + 1 < cuts.length; index += 1 ) {

                for ( const choice of braces(pattern.slice((cuts[index] ?? 0) + 1, cuts[index + 1])) ) for ( const tail of tails ) out.push(head + choice + tail);

                if ( out.length > widest ) throw new RangeError("not a glob");

            }

            return out;

        }

    }

    return [pattern];

}
function classOf ( letters: readonly string[], open: number, loose: boolean ): { unit: Class; end: number } | undefined {

    const singles = new Set<string>();
    const ranges: number[] = [];
    const not = letters[open + 1] === "!" || letters[open + 1] === "^";
    const start = open + (not ? 2 : 1);

    for ( let at = start; at < letters.length; at += 1 ) {

        let letter = letters[at] ?? "";

        if ( letter === "]" && at > start ) return { unit: { not, loose, singles, ranges }, end: at };

        if ( letter === "\\" && at + 1 < letters.length ) {

            at += 1;
            letter = letters[at] ?? "";

        }

        const last = letters[at + 2];

        if ( letters[at + 1] === "-" && last !== undefined && last !== "]" ) {

            ranges.push(letter.codePointAt(0) ?? 0, last.codePointAt(0) ?? 0);
            at += 2;

        } else singles.add(loose ? folded(letter) : letter);

    }

    return undefined;

}
function unitsOf ( text: string, loose: boolean ): Unit[] {

    const letters = Array.from(text);
    const out: Unit[] = [];

    for ( let at = 0; at < letters.length; at += 1 ) {

        const letter = letters[at] ?? "";
        const found = letter === "[" ? classOf(letters, at, loose) : undefined;

        if ( found ) {

            out.push(found.unit);
            at = found.end;

        } else if ( letter === "*" ) {

            if ( out[out.length - 1] !== many ) out.push(many);

        } else if ( letter === "?" ) out.push(one);
        else if ( letter === "\\" ) {

            at += 1;

            if ( at < letters.length ) out.push(loose ? folded(letters[at] ?? "") : (letters[at] ?? ""));

        } else out.push(loose ? folded(letter) : letter);

    }

    return out;

}
function planOf ( pattern: string, loose: boolean ): Plan {

    const pieces: Piece[] = [];

    for ( const segment of pattern.split("/") ) {

        if ( segment === "" || segment === "." ) continue;

        if ( segment !== "**" ) pieces.push(unitsOf(segment, loose));
        else if ( pieces.length === 0 || pieces[pieces.length - 1] !== null ) pieces.push(null);

    }

    return { rooted: pattern.startsWith("/"), pieces };

}
function fits ( unit: Unit, letter: string ): boolean {

    if ( typeof unit === "string" ) return unit === letter;
    if ( typeof unit === "number" ) return true;

    const code = letter.codePointAt(0) ?? 0;
    const upper = unit.loose ? letter.toUpperCase() : letter;
    const other = upper.length === letter.length ? (upper.codePointAt(0) ?? 0) : code;
    let found = unit.singles.has(letter);

    for ( let at = 0; !found && at + 1 < unit.ranges.length; at += 2 ) {

        const low = unit.ranges[at] ?? 0;
        const high = unit.ranges[at + 1] ?? 0;

        found = (code >= low && code <= high) || (other >= low && other <= high);

    }

    return found !== unit.not;

}
function word ( units: readonly Unit[], text: ArrayLike<string>, dot: boolean ): boolean {

    let seen = 0;
    let unit = 0;
    let star = -1;
    let mark = 0;

    if ( !dot && text[0] === "." && units[0] !== "." ) return false;

    while ( seen < text.length ) {

        const current = units[unit];

        if ( current === many ) {

            star = unit;
            mark = seen;
            unit += 1;

        } else if ( current !== undefined && fits(current, text[seen] ?? "") ) {

            seen += 1;
            unit += 1;

        } else if ( star !== -1 ) {

            unit = star + 1;
            mark += 1;
            seen = mark;

        } else return false;

    }

    while ( units[unit] === many ) unit += 1;

    return unit === units.length;

}
function route ( pieces: readonly Piece[], parts: readonly ArrayLike<string>[], dot: boolean ): boolean {

    let seen = 0;
    let piece = 0;
    let star = -1;
    let mark = 0;

    while ( seen < parts.length ) {

        const current = pieces[piece];

        if ( current === null ) {

            star = piece;
            mark = seen;
            piece += 1;

        } else if ( current !== undefined && word(current, parts[seen] ?? "", dot) ) {

            seen += 1;
            piece += 1;

        } else if ( star !== -1 && (dot || parts[mark]?.[0] !== ".") ) {

            piece = star + 1;
            mark += 1;
            seen = mark;

        } else return false;

    }

    while ( pieces[piece] === null ) piece += 1;

    return piece === pieces.length;

}
function named ( name: string ): string {

    if ( typeof name !== "string" || name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\u0000") ) throw new RangeError("not a name");

    return name;

}
function dull ( name: string ): boolean {

    return reserved.test(name.split(".")[0] ?? "");

}
function fitted ( head: string, room: number ): string {

    let out = "";
    let left = room;

    for ( const letter of head ) {

        left -= weight(letter);

        if ( left < 0 ) break;

        out += letter;

    }

    return out.replace(/[. ]+$/, "");

}

export function isAbsolute ( path: string ): boolean {

    return path.startsWith(separator) || path.startsWith("\\") || drive.test(path);

}
export function normalize ( path: string ): string {

    const { root, parts } = split(path);

    return whole(root, parts) || ".";

}
export function join ( ...parts: readonly string[] ): string {

    return normalize(parts.filter(( part ) => part !== "").join(separator));

}
export function resolve ( base: string, ...parts: readonly string[] ): string {

    let current = base === "" ? "." : base;

    for ( const part of parts ) current = isAbsolute(part) ? part : `${current}${separator}${part}`;

    return normalize(current);

}
export function segments ( path: string ): string[] {

    return split(path).parts;

}
export function depth ( path: string ): number {

    return split(path).parts.length;

}
export function basename ( path: string, extension?: string ): string {

    const { parts } = split(path);
    const name = parts[parts.length - 1] ?? "";

    return extension && name.endsWith(extension) && name !== extension ? name.slice(0, -extension.length) : name;

}
export function dirname ( path: string ): string {

    const { root, parts } = split(path);

    return parts.length <= 1 ? root || "." : whole(root, parts.slice(0, -1));

}
export function ancestors ( path: string ): string[] {

    const { root, parts } = split(path);
    const out: string[] = [];

    for ( let size = parts.length - 1; size > 0; size -= 1 ) out.push(whole(root, parts.slice(0, size)));

    if ( parts.length ) out.push(root || ".");

    return out;

}
export function extension ( path: string ): string {

    return cut(basename(path))[1].toLowerCase();

}
export function stem ( path: string ): string {

    return cut(basename(path))[0];

}
export function hidden ( path: string ): boolean {

    const name = basename(path);

    return name.startsWith(".") && name !== "..";

}
export function withName ( path: string, name: string ): string {

    const { root, parts } = split(path);

    return whole(root, [...parts.slice(0, -1), named(name)]);

}
export function withStem ( path: string, next: string ): string {

    const ending = cut(basename(path))[1];

    return withName(path, ending ? `${named(next)}.${ending}` : next);

}
export function withExtension ( path: string, next: string ): string {

    const ending = next.replace(/^\.+/, "");

    return withName(path, ending ? `${stem(path)}.${ending}` : stem(path));

}
export function relative ( from: string, to: string ): string {

    const source = split(from);
    const target = split(to);
    let shared = 0;

    if ( source.root !== target.root ) return normalize(to);

    while ( shared < source.parts.length && shared < target.parts.length && source.parts[shared] === target.parts[shared] ) shared += 1;

    return whole("", [...source.parts.slice(shared).map(() => ".."), ...target.parts.slice(shared)]) || ".";

}
export function inside ( base: string, path: string ): string | undefined {

    if ( base.includes("\u0000") || path.includes("\u0000") ) return undefined;

    const target = resolve(normalize(base), path);
    const held = split(base);
    const found = split(target);

    if ( held.root !== found.root || found.parts[held.parts.length] === ".." ) return undefined;

    return held.parts.every(( part, at ) => part === found.parts[at]) ? target : undefined;

}
export function within ( base: string, path: string ): boolean {

    return inside(base, path) !== undefined;

}
export function parse ( path: string ): Parsed {

    return { dir: dirname(path), base: basename(path), name: stem(path), ext: extension(path) };

}
export function format ( parsed: Partial<Parsed> ): string {

    const base = parsed.base ?? `${parsed.name ?? ""}${parsed.ext ? `.${parsed.ext.replace(/^\./, "")}` : ""}`;

    return parsed.dir && parsed.dir !== "." ? join(parsed.dir, base) : drive.test(base) ? `./${base}` : base;

}
export function common ( paths: readonly string[] ): string {

    const lists = paths.map(split);
    const first = lists[0];
    let shared = 0;

    if ( !first || lists.some(( found ) => found.root !== first.root) ) return "";

    while ( shared < first.parts.length && lists.every(( found ) => found.parts[shared] === first.parts[shared]) ) shared += 1;

    return whole(first.root, first.parts.slice(0, shared));

}
export function unique ( path: string, taken: ReadonlySet<string> | readonly string[] ): string {

    const used = taken instanceof Set ? taken : new Set(taken);
    const base = basename(path);
    const [name] = cut(base);
    const tail = base.slice(name.length);
    const found = /^(.*) \((\d{1,9})\)$/.exec(name);
    const head = found?.[1] ?? name;
    let count = found ? Number(found[2]) : 1;
    let next = path;

    while ( used.has(next) ) {

        count += 1;
        next = withName(path, `${head} (${count})${tail}`);

    }

    return next;

}
export function glob ( pattern: string | readonly string[], options: Glob = {} ): Matcher {

    const { dot = true, insensitive = false } = options;
    const wanted: Plan[] = [];
    const refused: Plan[] = [];

    for ( const given of typeof pattern === "string" ? [pattern] : pattern ) {

        if ( given.length > longest ) throw new RangeError("not a glob");

        const negated = given.startsWith("!");

        for ( const plain of braces(negated ? given.slice(1) : given) ) (negated ? refused : wanted).push(planOf(plain, insensitive));

    }

    const passes = ( plan: Plan, root: string, parts: readonly ArrayLike<string>[] ): boolean => (plan.rooted ? root !== "" : root === "" || plan.pieces[0] === null) && route(plan.pieces, parts, dot);

    return ( path ) => {

        const { root, parts } = split(insensitive ? lowered(path) : path);
        const letters = parts.map(lettersOf);

        return (wanted.length === 0 ? refused.length > 0 : wanted.some(( plan ) => passes(plan, root, letters))) && !refused.some(( plan ) => passes(plan, root, letters));

    };

}
export function matches ( path: string, pattern: string | readonly string[], options: Glob = {} ): boolean {

    const listed = typeof pattern === "string" ? `=${pattern}` : pattern.map(( one ) => `${one.length}:${one}`).join("");
    const key = `${options.dot === false ? 0 : 1}${options.insensitive ? 1 : 0}${listed}`;
    let found = matchers.get(key);

    if ( !found ) {

        found = glob(pattern, options);

        if ( matchers.size >= kept ) for ( const oldest of matchers.keys() ) {

            matchers.delete(oldest);

            break;

        }

        matchers.set(key, found);

    }

    return found(path);

}
export function safe ( name: string, fallback = "file", max = 255 ): string {

    let clean = "";

    for ( const letter of name ) if ( !hostile(letter.codePointAt(0) ?? 0) ) clean += letter;

    clean = clean.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().replace(/^[.\- ]+/, "").replace(/[. ]+$/, "");

    const at = clean.lastIndexOf(".");
    const tail = at > 0 && clean.length - at <= 17 ? clean.slice(at) : "";
    const head = tail ? clean.slice(0, at) : clean;
    let room = max;

    for ( const letter of tail ) room -= weight(letter);

    const whole = fitted(head, room);
    const out = dull(whole) ? fitted(head, room - 1) : whole;

    if ( out === "" ) return fallback;

    return `${dull(out) ? "_" : ""}${out}${tail}`;

}
