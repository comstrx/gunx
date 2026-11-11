import * as rand from "engine-rand";
import * as string from "engine-string";
import { type Bytes, engine, equal, view } from "./digest.ts";

type Read = { rounds: number; salt: Bytes; digest: string };

const scheme = "pbkdf2-sha256";
const iterations = 600_000;
const least = 1000;
const most = 10_000_000;
const longest = 1024;
const hashedPattern = /^\$pbkdf2-sha256\$([1-9]\d{3,7})\$([A-Za-z0-9_-]{22,86})\$([A-Za-z0-9_-]{43})$/;

function worded ( password: unknown ): password is string {

    return typeof password === "string" && password !== "" && password.length <= longest;

}
function counted ( rounds: number ): number {

    if ( Number.isInteger(rounds) && rounds >= least && rounds <= most ) return rounds;

    throw new RangeError("not a round count");

}
function parts ( hashed: unknown ): Read | undefined {

    const match = typeof hashed === "string" && hashed.length <= 256 ? hashedPattern.exec(hashed) : null;
    const rounds = Number(match?.[1]);

    if ( !match || rounds > most ) return undefined;

    return { rounds, salt: view(string.fromBase64(match[2] ?? "")), digest: match[3] ?? "" };

}
async function stretch ( password: string, salt: Bytes, rounds: number ): Promise<string> {

    const subtle = engine.get().subtle;
    const material = await subtle.importKey("raw", view(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);

    return string.base64url(new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" }, material, 256)));

}

export async function hashPassword ( password: string, rounds = iterations ): Promise<string> {

    if ( !worded(password) ) throw new RangeError("not a password");

    const cost = counted(rounds);
    const salt = rand.bytes(16);

    return `$${scheme}$${cost}$${string.base64url(salt)}$${await stretch(password, salt, cost)}`;

}
export async function verifyPassword ( password: string, hashed: string ): Promise<boolean> {

    const read = parts(hashed);

    return read !== undefined && worded(password) && equal(await stretch(password, read.salt, read.rounds), read.digest);

}
export function needsRehash ( hashed: string, rounds = iterations ): boolean {

    const read = parts(hashed);

    return read === undefined || read.rounds < rounds;

}
