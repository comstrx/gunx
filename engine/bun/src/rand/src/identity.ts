import * as adapter from "engine-adapter";
import * as string from "engine-string";

export type Source = { getRandomValues: ( data: Uint8Array<ArrayBuffer> ) => unknown; randomUUID?: (() => string) | undefined };

type Track = { time: number; tail: Uint8Array<ArrayBuffer> };

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const urlSafe = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
const ulidPattern = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const sevenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quota = 65_536;
const ceiling = 16_777_216;
const horizon = 281_474_976_710_655;
const ulids: readonly [Track, Track] = [track(), track()];
const sevens: readonly [Track, Track] = [track(), track()];

export const engine: adapter.Port<Source> = adapter.port<Source>("rand.engine", {
    fallback: adapter.web<Source>("rand.engine", ( host ) => host.crypto),
    check: ( value ) => typeof value.getRandomValues === "function",
});

function track (): Track {

    return { time: -1, tail: new Uint8Array(10) };

}
function stamp ( at: number ): number {

    const time = Math.trunc(at);

    if ( time >= 0 && time <= horizon ) return time;

    throw new RangeError("not a time");

}
function bumped ( tail: Uint8Array, from: number ): boolean {

    for ( let index = tail.length - 1; index >= from; index -= 1 ) {

        const next = ((tail[index] ?? 0) + 1) & 255;

        tail[index] = next;

        if ( next !== 0 ) return true;

    }

    return false;

}
function turn ( tracks: readonly [Track, Track], at: number | undefined, from: number ): Track {

    const free = at === undefined;
    const held = tracks[free ? 0 : 1];
    const time = stamp(at ?? Date.now());

    if ( free ? time <= held.time : time === held.time ) {

        if ( bumped(held.tail, from) ) return held;

        held.time += free ? 1 : 0;

    } else held.time = time;

    fill(held.tail);

    return held;

}
function encodeTime ( at: number ): string {

    let remaining = at;
    let out = "";

    for ( let index = 0; index < 10; index += 1 ) {

        out = `${crockford[remaining % 32]}${out}`;
        remaining = Math.floor(remaining / 32);

    }

    return out;

}
function encodeRandom ( data: Uint8Array ): string {

    let out = "";
    let buffer = 0;
    let bits = 0;

    for ( const byte of data ) {

        buffer = (buffer << 8) | byte;
        bits += 8;

        while ( bits >= 5 ) {

            bits -= 5;
            out += crockford[(buffer >> bits) & 31];

        }

    }

    return out;

}

export function sized ( value: number, most = ceiling ): number {

    const size = Math.trunc(value);

    if ( size >= 0 && size <= most ) return size + 0;

    throw new RangeError("not a size");

}
export function fill ( data: Uint8Array<ArrayBuffer> ): Uint8Array<ArrayBuffer> {

    const source = engine.get();

    if ( data.length <= quota ) source.getRandomValues(data);
    else for ( let at = 0; at < data.length; at += quota ) source.getRandomValues(data.subarray(at, at + quota));

    return data;

}
export function versioned ( data: Uint8Array, version: number ): string {

    data[6] = ((data[6] ?? 0) & 0x0f) | (version << 4);
    data[8] = ((data[8] ?? 0) & 0x3f) | 0x80;

    const text = string.hex(data);

    return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;

}
export function bytes ( size: number ): Uint8Array<ArrayBuffer> {

    return fill(new Uint8Array(sized(size)));

}
export function uuid (): string {

    const source = engine.get();

    return typeof source.randomUUID === "function" ? source.randomUUID() : versioned(bytes(16), 4);

}
export function uuid7 ( at?: number ): string {

    const { time, tail } = turn(sevens, at, 3);
    const data = new Uint8Array(16);
    const high = Math.floor(time / 4294967296);
    const low = time >>> 0;

    data[0] = high >>> 8;
    data[1] = high;
    data[2] = low >>> 24;
    data[3] = low >>> 16;
    data[4] = low >>> 8;
    data[5] = low;
    data.set(tail, 6);

    return versioned(data, 7);

}
export function uuidTime ( value: unknown ): number | undefined {

    return typeof value === "string" && sevenPattern.test(value) ? Number.parseInt(`${value.slice(0, 8)}${value.slice(9, 13)}`, 16) : undefined;

}
export function ulid ( at?: number ): string {

    const { time, tail } = turn(ulids, at, 0);

    return `${encodeTime(time)}${encodeRandom(tail)}`;

}
export function isUlid ( value: unknown ): boolean {

    return typeof value === "string" && ulidPattern.test(value);

}
export function ulidTime ( value: unknown ): number | undefined {

    if ( typeof value !== "string" || !ulidPattern.test(value) ) return undefined;

    let time = 0;

    for ( let index = 0; index < 10; index += 1 ) time = time * 32 + crockford.indexOf(value[index] ?? "");

    return time;

}
export function token ( size = 32 ): string {

    return string.base64url(bytes(size));

}
export function trace ( size = 8 ): string {

    return string.hex(bytes(size));

}
export function nanoid ( size = 21 ): string {

    let out = "";

    for ( const byte of bytes(size) ) out += urlSafe[byte & 63];

    return out;

}
export function otp ( length = 6 ): string {

    const size = sized(length);
    let out = "";

    while ( out.length < size ) {

        for ( const byte of bytes(size - out.length) ) if ( byte < 250 ) out += String(byte % 10);

    }

    return out;

}
