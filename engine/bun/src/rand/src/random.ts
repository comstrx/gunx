import * as list from "engine-list";
import * as number from "engine-number";
import * as strings from "engine-string";
import { bytes, fill, sized, versioned } from "./identity.ts";

export type Charset = "alpha" | "upper" | "lower" | "digits" | "alnum" | "hex" | "safe";
export type PasswordRules = {
    length?: number | undefined;
    lower?: boolean | undefined;
    upper?: boolean | undefined;
    digits?: boolean | undefined;
    symbols?: boolean | string | undefined;
    safe?: boolean | undefined;
};
export type Random = {
    next: () => number;
    int: ( low: number, high: number ) => number;
    float: ( low?: number, high?: number, digits?: number ) => number;
    boolean: ( truth?: number ) => boolean;
    chance: ( percent: number ) => boolean;
    index: ( length: number ) => number;
    pick: <T>( items: readonly T[] ) => T | undefined;
    pickMany: <T>( items: readonly T[], count: number ) => T[];
    shuffle: <T>( items: readonly T[] ) => T[];
    weighted: <T>( items: readonly { item: T; weight: number }[] ) => T | undefined;
    bytes: ( size: number ) => Uint8Array<ArrayBuffer>;
    uuid: () => string;
    letters: ( length: number, alphabet: string ) => string;
    string: ( length: number, charset?: Charset ) => string;
    hex: ( length: number ) => string;
    digits: ( length: number ) => string;
    password: ( rules?: PasswordRules ) => string;
    gaussian: ( mean?: number, deviation?: number ) => number;
    jitter: ( value: number, ratio?: number ) => number;
    color: () => string;
    date: ( from: Date | number, to: Date | number ) => Date;
};

const most = 1_048_576;
const whole = { lower: "abcdefghijklmnopqrstuvwxyz", upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", digits: "0123456789" } as const;
const clear = { lower: "abcdefghjkmnpqrstuvwxyz", upper: "ABCDEFGHJKLMNPQRSTUVWXYZ", digits: "23456789" } as const;
const marks = "!@#$%^&*()-_=+[]{}<>?";
const charsets = new Map<string, readonly string[]>([
    ["alpha", [...whole.upper, ...whole.lower]],
    ["upper", [...whole.upper]],
    ["lower", [...whole.lower]],
    ["digits", [...whole.digits]],
    ["alnum", [...whole.upper, ...whole.lower, ...whole.digits]],
    ["hex", [...whole.digits, ..."abcdef"]],
    ["safe", [...clear.upper, ...clear.lower, ...clear.digits]],
]);
const scratch = new Uint8Array(8);
const words = new Uint32Array(scratch.buffer);

function known ( charset: string ): readonly string[] {

    const found = charsets.get(charset);

    if ( found ) return found;

    throw new RangeError("not a charset");

}
function worth ( weight: number ): number {

    return weight > 0 && Number.isFinite(weight) ? weight : 0;

}
function timeOf ( value: Date | number ): number {

    return typeof value === "number" ? value : value.getTime();

}
function swap<T> ( items: T[], a: number, b: number ): void {

    const kept = items[a] as T;

    items[a] = items[b] as T;
    items[b] = kept;

}
function mulberry ( seed: number ): () => number {

    let state = seed >>> 0;

    return () => {

        state = (state + 0x6d2b79f5) >>> 0;

        let value = Math.imul(state ^ (state >>> 15), 1 | state);

        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;

    };

}
function secure (): number {

    fill(scratch);

    return (((words[0] ?? 0) >>> 5) * 67108864 + ((words[1] ?? 0) >>> 6)) / 9007199254740992;

}
function generator ( next: () => number, filled: ( size: number ) => Uint8Array<ArrayBuffer> ): Random {

    const wide = (): number => (Math.floor(next() * 67108864) * 134217728 + Math.floor(next() * 134217728)) / 9007199254740992;
    const below = ( size: number ): number => Math.floor((size > 4294967296 ? wide() : next()) * size);
    const drawn = ( length: number, letters: readonly string[] ): string => {

        if ( letters.length === 0 ) throw new RangeError("not an alphabet");

        return list.times(sized(length, most), () => letters[below(letters.length)] ?? "").join("");

    };
    const random: Random = {
        next,
        int: ( low, high ) => {

            const floor = Math.ceil(Math.min(low, high));
            const ceiling = Math.floor(Math.max(low, high));
            const span = ceiling - floor + 1;

            return span >= 1 && Number.isFinite(span) ? Math.min(ceiling, floor + below(span)) : Number.NaN;

        },
        float: ( low = 0, high = 1, digits ) => {

            const span = high - low;
            const share = next();
            const value = Number.isFinite(span) ? low + share * span : low * (1 - share) + high * share;

            return digits === undefined ? value : number.precision(value, digits);

        },
        boolean: ( truth = 0.5 ) => next() < truth,
        chance: ( percent ) => next() * 100 < percent,
        index: ( length ) => {

            const size = Math.trunc(length);

            return size >= 1 && Number.isFinite(size) ? below(size) : -1;

        },
        pick: ( items ) => items[random.index(items.length)],
        pickMany: ( items, count ) => {

            const out = [...items];
            const size = count >= 0 ? Math.min(out.length, Math.trunc(count)) : 0;

            for ( let at = 0; at < size; at += 1 ) swap(out, at, at + below(out.length - at));

            out.length = size;

            return out;

        },
        shuffle: ( items ) => {

            const out = [...items];

            for ( let index = out.length - 1; index > 0; index -= 1 ) swap(out, index, below(index + 1));

            return out;

        },
        weighted: ( items ) => {

            let total = 0;

            for ( const entry of items ) total += worth(entry.weight);

            if ( !(total > 0 && Number.isFinite(total)) ) return undefined;

            let roll = next() * total;
            let found: (typeof items)[number]["item"] | undefined;

            for ( const entry of items ) {

                const share = worth(entry.weight);

                if ( share === 0 ) continue;

                found = entry.item;
                roll -= share;

                if ( roll < 0 ) break;

            }

            return found;

        },
        bytes: filled,
        uuid: () => versioned(filled(16), 4),
        letters: ( length, alphabet ) => drawn(length, strings.graphemes(alphabet)),
        string: ( length, charset = "alnum" ) => drawn(length, known(charset)),
        hex: ( length ) => drawn(length, known("hex")),
        digits: ( length ) => drawn(length, known("digits")),
        password: ( rules = {} ) => {

            const { length, lower = true, upper = true, digits = true, symbols = true, safe = false } = rules;
            const from = safe ? clear : whole;
            const wanted = [lower ? from.lower : "", upper ? from.upper : "", digits ? from.digits : "", symbols === true ? marks : symbols || ""];
            const classes = wanted.map(( text ) => strings.graphemes(text)).filter(( letters ) => letters.length > 0);

            if ( classes.length === 0 ) throw new RangeError("not a rule");

            const pool = classes.flat();
            const size = sized(Math.max(classes.length, number.finite(length, 16)), most);
            const required = classes.map(( letters ) => letters[below(letters.length)] ?? "");
            const rest = list.times(size - required.length, () => pool[below(pool.length)] ?? "");

            return random.shuffle([...required, ...rest]).join("");

        },
        gaussian: ( mean = 0, deviation = 1 ) => {

            const first = Math.max(next(), Number.EPSILON);
            const second = next();

            return mean + deviation * Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);

        },
        jitter: ( value, ratio = 0.1 ) => value + value * ratio * (next() * 2 - 1),
        color: () => `#${random.hex(6)}`,
        date: ( from, to ) => new Date(random.int(timeOf(from), timeOf(to))),
    };

    return random;

}

export function hashed ( text: string ): number {

    let hash = 0x811c9dc5;

    for ( const byte of strings.bytes(text) ) {

        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;

    }

    return hash >>> 0;

}
export function create ( next: () => number ): Random {

    return generator(next, ( size ) => Uint8Array.from({ length: sized(size) }, () => Math.floor(next() * 256)));

}
export function seeded ( seed: string | number ): Random {

    return create(mulberry(typeof seed === "number" && Number.isInteger(seed) && seed >= 0 && seed <= 4294967295 ? seed : hashed(String(seed))));

}

const shared = generator(secure, bytes);

export const int = shared.int;
export const float = shared.float;
export const boolean = shared.boolean;
export const chance = shared.chance;
export const index = shared.index;
export const pick = shared.pick;
export const pickMany = shared.pickMany;
export const shuffle = shared.shuffle;
export const weighted = shared.weighted;
export const letters = shared.letters;
export const string = shared.string;
export const hex = shared.hex;
export const digits = shared.digits;
export const password = shared.password;
export const gaussian = shared.gaussian;
export const jitter = shared.jitter;
export const color = shared.color;
export const date = shared.date;
