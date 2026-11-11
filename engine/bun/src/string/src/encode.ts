const encoder = new TextEncoder();
const decoder = new TextDecoder();
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const lookup = new Map<string, number>([...alphabet].map(( letter, index ) => [letter, index]));

const pairs: string[] = [];

lookup.set("-", 62);
lookup.set("_", 63);

for ( let byte = 0; byte < 256; byte += 1 ) pairs.push((byte < 16 ? "0" : "") + byte.toString(16));

export function bytes ( text: string ): Uint8Array {

    return encoder.encode(text);

}
export function utf8 ( data: Uint8Array ): string {

    return decoder.decode(data);

}
export function hex ( data: Uint8Array ): string {

    let out = "";

    for ( let at = 0; at < data.length; at += 1 ) out += pairs[data[at] ?? 0];

    return out;

}
export function fromHex ( text: string ): Uint8Array {

    const clean = text.trim();

    if ( clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean) ) return new Uint8Array(0);

    const out = new Uint8Array(clean.length / 2);

    for ( let index = 0; index < out.length; index += 1 ) out[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);

    return out;

}
function encode ( data: Uint8Array, letters: string, padded: boolean ): string {

    let out = "";
    let index = 0;

    for ( ; index + 2 < data.length; index += 3 ) {

        const chunk = ((data[index] ?? 0) << 16) | ((data[index + 1] ?? 0) << 8) | (data[index + 2] ?? 0);

        out += `${letters[(chunk >> 18) & 63]}${letters[(chunk >> 12) & 63]}${letters[(chunk >> 6) & 63]}${letters[chunk & 63]}`;

    }

    if ( index < data.length ) {

        const first = data[index] ?? 0;
        const second = data[index + 1];
        const chunk = (first << 16) | ((second ?? 0) << 8);

        out += `${letters[(chunk >> 18) & 63]}${letters[(chunk >> 12) & 63]}`;
        out += second === undefined ? (padded ? "==" : "") : `${letters[(chunk >> 6) & 63]}${padded ? "=" : ""}`;

    }

    return out;

}
export function base64 ( data: Uint8Array | string ): string {

    return encode(typeof data === "string" ? bytes(data) : data, alphabet, true);

}
export function base64url ( data: Uint8Array | string ): string {

    return encode(typeof data === "string" ? bytes(data) : data, `${alphabet.slice(0, 62)}-_`, false);

}
export function fromBase64 ( text: string ): Uint8Array {

    const clean = text.replace(/[\s=]+/g, "");

    if ( /[^A-Za-z0-9+/_-]/.test(clean) || clean.length % 4 === 1 ) return new Uint8Array(0);

    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let buffer = 0;
    let bits = 0;
    let at = 0;

    for ( const letter of clean ) {

        buffer = (buffer << 6) | (lookup.get(letter) ?? 0);
        bits += 6;

        if ( bits >= 8 ) {

            bits -= 8;
            out[at] = (buffer >> bits) & 255;
            at += 1;

        }

    }

    return out.subarray(0, at);

}
