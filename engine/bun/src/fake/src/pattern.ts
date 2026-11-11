import type * as rand from "engine-rand";

export type Draw = ( random: rand.Random, extra?: number ) => string;

const loop = 3;
const spread = 32;
const widest = 256;
const longest = 2048;
const budget = 65_536;
const remembered = 256;
const digits = "0123456789";
const lower = "abcdefghijklmnopqrstuvwxyz";
const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const plain = `${lower}${upper}${digits}`;
const wordy = `${plain}_`;
const counted = /^\{(\d{1,9})(?:(,)(\d{1,9})?)?\}/;
const classes: Readonly<Record<string, string>> = { d: digits, w: wordy, s: " ", D: lower, W: "-", S: plain, n: "\n", t: "\t", r: "\r", f: "\f", v: "\v", b: "", B: "" };
const refused = new Set<string>(["p", "P", "k", "c", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
const known = new Map<string, Draw | undefined>();
let room = 0;
let spare = -1;

function oneOf ( pool: string ): Draw {

    if ( pool.length <= 1 ) return () => pool;

    return ( random ) => pool[random.index(pool.length)] ?? "";

}
function compile ( source: string ): Draw | undefined {

    let at = 0;
    let sound = true;
    const coded = ( size: number ): string => {

        const braced = size === 4 && source[at] === "{";
        const end = braced ? source.indexOf("}", at) : at + size;
        const code = Number.parseInt(source.slice(braced ? at + 1 : at, end), 16);

        sound &&= end > at && end <= source.length && code >= 0 && code <= 0x10ffff;
        at = braced ? end + 1 : end;

        return sound ? String.fromCodePoint(code) : "";

    };
    const escaped = (): string => {

        const letter = source[at] ?? "";

        at += 1;

        if ( letter === "" || refused.has(letter) ) sound = false;
        if ( letter === "x" ) return coded(2);
        if ( letter === "u" ) return coded(4);

        return classes[letter] ?? (letter === "0" ? "\0" : letter);

    };
    const member = (): string => {

        const letter = source[at] ?? "";

        at += 1;

        return letter === "\\" ? escaped() : letter;

    };
    const set = (): Draw => {

        const negated = source[at] === "^";
        let pool = "";

        if ( negated ) at += 1;

        while ( at < source.length && source[at] !== "]" ) {

            const first = member();
            const ranged = source[at] === "-" && source[at + 1] !== "]" && at + 1 < source.length && first.length === 1;

            if ( !ranged ) {

                pool += first;

                continue;

            }

            at += 1;

            const last = member();
            const low = first.charCodeAt(0);
            const high = last.length === 1 ? last.charCodeAt(0) : -1;

            if ( high < low || high - low >= widest ) sound = false;
            else for ( let code = low; code <= high; code += 1 ) pool += String.fromCharCode(code);

        }

        if ( source[at] !== "]" ) sound = false;

        at += 1;

        if ( negated ) {

            let rest = "";

            for ( let code = 32; code < 127; code += 1 ) if ( !pool.includes(String.fromCharCode(code)) ) rest += String.fromCharCode(code);

            pool = rest;

        }

        if ( pool === "" ) sound = false;

        return oneOf(pool);

    };
    const repeated = ( draw: Draw ): Draw => {

        const letter = source[at] ?? "";
        const found = letter === "{" ? counted.exec(source.slice(at, at + 24)) : null;
        let low = 1;
        let high = 1;
        let open = false;

        if ( letter === "*" || letter === "+" || letter === "?" ) {

            low = letter === "+" ? 1 : 0;
            open = letter !== "?";
            high = open ? low + loop : 1;
            at += 1;

        } else if ( found ) {

            low = Number(found[1]);
            open = found[2] !== undefined && found[3] === undefined;
            high = found[2] === undefined ? low : open ? low + loop : Number(found[3]);
            sound = sound && high >= low;
            high = Math.min(high, low + spread);
            at += found[0].length;

        } else return draw;

        if ( source[at] === "?" ) at += 1;

        return ( random ) => {

            let count = low === high ? low : random.int(low, high);
            let out = "";

            if ( open && spare >= 0 ) {

                count = low + spare;
                spare = 0;

            }

            for ( let turn = 0; turn < count; turn += 1 ) {

                room -= 1;

                if ( room < 0 ) throw new RangeError("not a pattern");

                out += draw(random);

            }

            return out;

        };

    };
    const group = (): Draw => {

        if ( source[at] === "?" ) {

            const named = source[at + 1] === "<" && source[at + 2] !== "=" && source[at + 2] !== "!";
            const close = named ? source.indexOf(">", at) : -1;

            if ( source[at + 1] === ":" ) at += 2;
            else if ( close > at ) at = close + 1;
            else sound = false;

        }

        const inner = either();

        if ( source[at] !== ")" ) sound = false;

        at += 1;

        return inner;

    };
    const atom = (): Draw => {

        const letter = source[at] ?? "";

        at += 1;

        if ( letter === "(" ) return group();
        if ( letter === "[" ) return set();
        if ( letter === "." ) return oneOf(plain);
        if ( letter === "^" || letter === "$" ) return oneOf("");

        return oneOf(letter === "\\" ? escaped() : letter);

    };
    const sequence = (): Draw => {

        const parts: Draw[] = [];

        while ( sound && at < source.length && source[at] !== "|" && source[at] !== ")" ) parts.push(repeated(atom()));

        return ( random ) => {

            let out = "";

            for ( const part of parts ) out += part(random);

            return out;

        };

    };
    function either (): Draw {

        const options: Draw[] = [sequence()];

        while ( sound && source[at] === "|" ) {

            at += 1;
            options.push(sequence());

        }

        return options.length === 1 ? (options[0] as Draw) : ( random ) => (options[random.index(options.length)] as Draw)(random);

    }

    const whole = either();

    if ( !sound || at < source.length ) return undefined;

    return ( random, extra ) => {

        room = budget;
        spare = extra === undefined ? -1 : Math.max(0, Math.min(budget, Math.trunc(extra) || 0));

        return whole(random);

    };

}

export function matcher ( pattern: RegExp | string ): Draw | undefined {

    const source = typeof pattern === "string" ? pattern : pattern.source;

    if ( source.length > longest ) return undefined;
    if ( known.has(source) ) return known.get(source);

    const made = compile(source);

    if ( known.size >= remembered ) known.clear();

    known.set(source, made);

    return made;

}
