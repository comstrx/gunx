import * as rand from "engine-rand";
import * as string from "engine-string";
import type { Bytes, Gcm, Kept, Lane, Source } from "./arch.ts";
import { engine, equal, kept, keyed, label, mac, view } from "./digest.ts";

const prefix = "v1";
const iterations = 210_000;
const budget = 1_048_576;
const sealedPattern = /^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
const urlPattern = /^[A-Za-z0-9_-]*$/;
const lanes = new Map<string, Lane>();
const sealing = kept<CryptoKey>(16);
const opening = kept<CryptoKey>(64);

function turn ( name: string ): Lane {

    const found = lanes.get(name);

    if ( found && found.left > 0 ) {

        found.left -= 1;

        return found;

    }

    const salt = rand.bytes(16);
    const made: Lane = { salt, text: string.base64url(salt), left: budget - 1 };

    if ( !found && lanes.size >= 16 ) lanes.delete(lanes.keys().next().value ?? "");

    lanes.set(name, made);

    return made;

}
function aesKey ( held: Kept<CryptoKey>, source: Source, name: string, material: Bytes, salt: Bytes, text: string ): Promise<CryptoKey> {

    return held(source, `${text}:${name}`, async ( subtle ) => {

        const base = await subtle.importKey("raw", material, "PBKDF2", false, ["deriveKey"]);

        return subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

    });

}
function gcm ( iv: Bytes, context: string | undefined ): Gcm {

    return context === undefined ? { name: "AES-GCM", iv } : { name: "AES-GCM", iv, additionalData: view(context) };

}

export async function seal ( text: string, secret: string | Uint8Array, context?: string ): Promise<string> {

    const source = engine.get();
    const material = keyed(secret);
    const name = await label(source, material);
    const lane = turn(name);
    const iv = rand.bytes(12);
    const key = await aesKey(sealing, source, name, material, lane.salt, lane.text);
    const cipher = await source.subtle.encrypt(gcm(iv, context), key, view(text));

    return `${prefix}.${lane.text}.${string.base64url(iv)}.${string.base64url(new Uint8Array(cipher))}`;

}
export function isSealed ( value: unknown ): boolean {

    return typeof value === "string" && sealedPattern.test(value);

}
export async function open ( sealed: string, secret: string | Uint8Array, context?: string ): Promise<string | undefined> {

    const material = keyed(secret);
    const source = engine.get();
    const subtle = source.subtle;

    if ( !isSealed(sealed) ) return undefined;

    const [, salt = "", iv = "", cipher = ""] = sealed.split(".");

    try {

        const name = await label(source, material);
        const held = lanes.get(name)?.text === salt ? sealing : opening;

        const key = await aesKey(held, source, name, material, view(string.fromBase64(salt)), salt);
        const plain = await subtle.decrypt(gcm(view(string.fromBase64(iv)), context), key, view(string.fromBase64(cipher)));

        return string.utf8(new Uint8Array(plain));

    } catch {

        return undefined;

    }

}
export async function sign ( payload: string, secret: string | Uint8Array ): Promise<string> {

    const body = string.base64url(payload);

    return `${body}.${string.base64url(await mac(secret, body))}`;

}
export async function unsign ( signed: string, secret: string | Uint8Array ): Promise<string | undefined> {

    keyed(secret);

    const at = typeof signed === "string" ? signed.lastIndexOf(".") : -1;

    if ( at < 0 ) return undefined;

    const body = signed.slice(0, at);

    if ( !equal(string.base64url(await mac(secret, body)), signed.slice(at + 1)) || !urlPattern.test(body) ) return undefined;

    const decoded = string.fromBase64(body);

    return decoded.length === 0 && body !== "" ? undefined : string.utf8(decoded);

}
