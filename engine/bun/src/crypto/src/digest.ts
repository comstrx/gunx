import * as adapter from "engine-adapter";
import * as json from "engine-json";
import * as rand from "engine-rand";
import * as string from "engine-string";

export type Algorithm = "SHA-256" | "SHA-384" | "SHA-512" | "SHA-1";
export type Source = { subtle: SubtleCrypto };
export type Bytes = Uint8Array<ArrayBuffer>;
export type Kept<T> = ( name: string, make: ( subtle: SubtleCrypto ) => Promise<T> ) => Promise<T>;

const hexPattern = /^[0-9a-fA-F]+$/;
const algorithms = new Set<string>(["SHA-256", "SHA-384", "SHA-512", "SHA-1"]);

export const engine: adapter.Port<Source> = adapter.port<Source>("crypto.engine", {
    fallback: adapter.web<Source>("crypto.engine", ( host ) => host.crypto),
    check: ( value ) => Boolean(value.subtle) && typeof value.subtle.digest === "function",
});

function known ( algorithm: Algorithm ): Algorithm {

    if ( algorithms.has(algorithm) ) return algorithm;

    throw new RangeError("not an algorithm");

}
function given ( signature: unknown ): Bytes | undefined {

    if ( typeof signature === "string" ) return signature.length <= 128 && hexPattern.test(signature) ? view(string.fromHex(signature)) : undefined;

    return ArrayBuffer.isView(signature) ? view(signature) : undefined;

}

export function view ( data: string | ArrayBufferView ): Bytes {

    const found = typeof data === "string" ? string.bytes(data) : data;

    if ( !ArrayBuffer.isView(found) ) throw new RangeError("not data");

    const buffer = found.buffer;

    return buffer instanceof ArrayBuffer ? new Uint8Array(buffer, found.byteOffset, found.byteLength) : Uint8Array.from(new Uint8Array(buffer, found.byteOffset, found.byteLength));

}
export function keyed ( secret: string | Uint8Array ): Bytes {

    const found = typeof secret === "string" || ArrayBuffer.isView(secret) ? view(secret) : undefined;

    if ( found && found.length > 0 ) return found;

    throw new RangeError("not a secret");

}
export function label ( secret: string | Uint8Array, material: Bytes ): string {

    return typeof secret === "string" ? `text:${secret}` : `hex:${string.hex(material)}`;

}
export function kept<T> ( most: number ): Kept<T> {

    const held = new Map<string, Promise<T>>();
    let owner: Source | undefined;

    return ( name, make ) => {

        const source = engine.get();

        if ( source !== owner ) {

            held.clear();
            owner = source;

        }

        const found = held.get(name);

        if ( found ) return found;

        const made = make(source.subtle).catch(( cause: unknown ) => {

            held.delete(name);

            throw cause;

        });

        if ( held.size >= most ) held.delete(held.keys().next().value ?? "");

        held.set(name, made);

        return made;

    };

}

const macs = kept<CryptoKey>(64);

function macKey ( secret: string | Uint8Array, algorithm: Algorithm ): Promise<CryptoKey> {

    const material = keyed(secret);
    const hash = known(algorithm);

    return macs(`${hash}:${label(secret, material)}`, ( subtle ) => subtle.importKey("raw", material, { name: "HMAC", hash }, false, ["sign", "verify"]));

}

export async function digest ( data: string | Uint8Array, algorithm: Algorithm = "SHA-256" ): Promise<Bytes> {

    return new Uint8Array(await engine.get().subtle.digest(known(algorithm), view(data)));

}
export async function hash ( data: string | Uint8Array, algorithm: Algorithm = "SHA-256" ): Promise<string> {

    return string.hex(await digest(data, algorithm));

}
export async function mac ( secret: string | Uint8Array, data: string | Uint8Array, algorithm: Algorithm = "SHA-256" ): Promise<Bytes> {

    const key = await macKey(secret, algorithm);

    return new Uint8Array(await engine.get().subtle.sign("HMAC", key, view(data)));

}
export async function hmac ( secret: string | Uint8Array, data: string | Uint8Array, algorithm: Algorithm = "SHA-256" ): Promise<string> {

    return string.hex(await mac(secret, data, algorithm));

}
export async function verify ( secret: string | Uint8Array, data: string | Uint8Array, signature: string | Uint8Array, algorithm: Algorithm = "SHA-256" ): Promise<boolean> {

    const key = await macKey(secret, algorithm);
    const claimed = given(signature);

    return claimed !== undefined && engine.get().subtle.verify("HMAC", key, claimed, view(data));

}
export function equal ( a: string | Uint8Array, b: string | Uint8Array ): boolean {

    if ( typeof a === "string" && typeof b === "string" ) {

        let mismatch = a.length ^ b.length;

        for ( let index = Math.max(a.length, b.length) - 1; index >= 0; index -= 1 ) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);

        return mismatch === 0;

    }

    if ( typeof a === "string" || typeof b === "string" || !ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) ) return false;

    let mismatch = a.length ^ b.length;

    for ( let index = Math.max(a.length, b.length) - 1; index >= 0; index -= 1 ) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);

    return mismatch === 0;

}
export async function fingerprint ( value: unknown ): Promise<string> {

    return (await hash(json.stringify(value, { stable: true }))).slice(0, 32);

}
export function key ( size = 32 ): string {

    if ( size >= 16 ) return rand.token(size);

    throw new RangeError("not a size");

}
export function nonce ( size = 16 ): string {

    return rand.token(size);

}
export async function derive ( secret: string | Uint8Array, purpose: string, size = 32 ): Promise<string> {

    if ( typeof purpose !== "string" || purpose === "" ) throw new RangeError("not a purpose");
    if ( !(Number.isInteger(size) && size >= 16 && size <= 64) ) throw new RangeError("not a size");

    const subtle = engine.get().subtle;
    const material = await subtle.importKey("raw", keyed(secret), "HKDF", false, ["deriveBits"]);
    const bits = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: view(purpose) }, material, size * 8);

    return string.base64url(new Uint8Array(bits));

}
