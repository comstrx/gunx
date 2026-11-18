import { describe, expect, test as it } from "bun:test";
import { createHash, createHmac, hkdfSync } from "node:crypto";
import * as crypto from "engine/crypto";
import * as strings from "engine/string";
import * as fc from "fast-check";

const text = fc.string({ maxLength: 64, unit: "grapheme" });
const filled = fc.string({ minLength: 1, maxLength: 48, unit: "grapheme" });
const bytes = fc.uint8Array({ minLength: 1, maxLength: 64 });
const secret = fc.oneof(filled, bytes);
const algorithm = fc.constantFrom<crypto.Algorithm>("SHA-1", "SHA-256", "SHA-384", "SHA-512");
const registered = new Set(["sub", "iss", "jti", "exp", "nbf", "iat", "aud"]);
const claim = fc.stringMatching(/^[a-z][a-zA-Z0-9_]{0,9}$/).filter(( name ) => !registered.has(name));
const scalar = fc.oneof(fc.string({ maxLength: 24 }), fc.integer(), fc.boolean(), fc.constant(null));
const claims = fc.dictionary(claim, fc.oneof(scalar, fc.array(scalar, { maxLength: 4 }), fc.dictionary(claim, scalar, { maxKeys: 3, noNullPrototype: true })), { maxKeys: 6, noNullPrototype: true });
const names: Record<crypto.Algorithm, string> = { "SHA-1": "sha1", "SHA-256": "sha256", "SHA-384": "sha384", "SHA-512": "sha512" };

function flipped ( encoded: string, at: number ): string {

    const raw = strings.fromBase64(encoded);
    const index = at % (raw.length * 8);

    raw[index >> 3] = (raw[index >> 3] ?? 0) ^ (1 << (index & 7));

    return strings.base64url(raw);

}

describe("fuzz crypto", () => {

    it("seal and sign round trip any text", async () => {

        await fc.assert(
            fc.asyncProperty(text, async ( plain ) => {

                const sealed = await crypto.seal(plain, "k");

                expect(crypto.isSealed(sealed)).toBe(true);
                expect(await crypto.open(sealed, "k")).toBe(plain);
                expect(await crypto.unsign(await crypto.sign(plain, "k"), "k")).toBe(plain);

            }),
            { numRuns: 1000 },
        );

    }, 60_000);
    it("junk never throws and never opens", async () => {

        await fc.assert(
            fc.asyncProperty(fc.string({ maxLength: 80 }), async ( junk ) => {

                expect(await crypto.open(junk, "k")).toBeUndefined();

                const unsigned = await crypto.unsign(junk, "k");

                expect(unsigned === undefined || typeof unsigned === "string").toBe(true);
                expect(await crypto.verifyToken(junk, "k")).toBeUndefined();
                expect(crypto.decodeToken(junk) === undefined || typeof crypto.decodeToken(junk) === "object").toBe(true);
                expect(await crypto.verifyPassword("password", junk)).toBe(false);
                expect(await crypto.verify("k", "data", junk)).toBe(false);
                expect(crypto.isSealed(junk)).toBe(false);
                expect(crypto.needsRehash(junk)).toBe(true);

            }),
            { numRuns: 2000 },
        );

    });
    it("one flipped bit never opens a seal, a signature or a token", async () => {

        await fc.assert(
            fc.asyncProperty(text, fc.nat(), fc.boolean(), async ( plain, at, inVector ) => {

                const [mark = "", salt = "", iv = "", cipher = ""] = (await crypto.seal(plain, "k", "ctx")).split(".");
                const [body = "", signature = ""] = (await crypto.sign(plain, "k")).split(".");
                const [head = "", payload = "", proof = ""] = (await crypto.signToken({ note: plain }, "k")).split(".");

                expect(await crypto.open(inVector ? `${mark}.${salt}.${flipped(iv, at)}.${cipher}` : `${mark}.${salt}.${iv}.${flipped(cipher, at)}`, "k", "ctx")).toBeUndefined();
                expect(await crypto.unsign(`${body}.${flipped(signature, at)}`, "k")).toBeUndefined();
                expect(await crypto.verifyToken(`${head}.${payload}.${flipped(proof, at)}`, "k")).toBeUndefined();
                expect(await crypto.verifyToken(`${head}.${strings.base64url(JSON.stringify({ note: `${plain}!` }))}.${proof}`, "k")).toBeUndefined();

            }),
            { numRuns: 1000 },
        );

    }, 60_000);
    it("digests and macs agree with the platform for any input", async () => {

        await fc.assert(
            fc.asyncProperty(secret, text, algorithm, async ( key, data, name ) => {

                const expected = createHmac(names[name], key).update(data).digest("hex");
                const made = await crypto.hmac(key, data, name);

                expect(await crypto.hash(data, name)).toBe(createHash(names[name]).update(data).digest("hex"));
                expect(await crypto.hash(strings.bytes(data), name)).toBe(await crypto.hash(data, name));
                expect(made).toBe(expected);
                expect(strings.hex(await crypto.mac(key, strings.bytes(data), name))).toBe(expected);
                expect(await crypto.verify(key, data, made, name)).toBe(true);
                expect(await crypto.verify(key, data, await crypto.mac(key, data, name), name)).toBe(true);
                expect(await crypto.verify(key, `${data}!`, made, name)).toBe(false);
                expect(await crypto.verify(key, data, flipped(strings.base64url(strings.fromHex(made)), 0), name)).toBe(false);

            }),
            { numRuns: 2000 },
        );

    });
    it("a derived key is stable, bound to its purpose and equal to HKDF", async () => {

        await fc.assert(
            fc.asyncProperty(secret, filled, filled, fc.integer({ min: 16, max: 64 }), async ( key, purpose, other, size ) => {

                const made = await crypto.derive(key, purpose, size);

                expect(made).toBe(strings.base64url(new Uint8Array(hkdfSync("sha256", key, new Uint8Array(0), purpose, size))));
                expect(await crypto.derive(key, purpose, size)).toBe(made);
                expect(strings.fromBase64(made)).toHaveLength(size);
                expect((await crypto.derive(key, other, size)) === made).toBe(other === purpose);

            }),
            { numRuns: 1000 },
        );

    });
    it("equal agrees with identity for text and for bytes", () => {

        fc.assert(
            fc.property(fc.string({ maxLength: 40, unit: "binary" }), fc.string({ maxLength: 40, unit: "binary" }), fc.uint8Array({ maxLength: 40 }), fc.uint8Array({ maxLength: 40 }), ( left, right, a, b ) => {

                expect(crypto.equal(left, right)).toBe(left === right);
                expect(crypto.equal(left, `${left}`)).toBe(true);
                expect(crypto.equal(a, b)).toBe(a.length === b.length && a.every(( byte, at ) => byte === b[at]));
                expect(crypto.equal(a, a.slice())).toBe(true);
                expect(crypto.equal(left, a)).toBe(false);

            }),
            { numRuns: 10_000 },
        );

    });
    it("a token carries any claims and holds its clock", async () => {

        await fc.assert(
            fc.asyncProperty(claims, secret, fc.integer({ min: 0, max: 4_000_000_000 }), fc.integer({ min: 1, max: 100_000 }), async ( body, key, seconds, life ) => {

                const now = seconds * 1000;
                const token = await crypto.signToken(body, key, { now, expiresIn: life });
                const expected = { ...JSON.parse(JSON.stringify(body)), iat: seconds, exp: seconds + life };

                expect(token.split(".")).toHaveLength(3);
                expect(crypto.decodeToken(token)).toEqual(expected);
                expect(await crypto.verifyToken(token, key, { now })).toEqual(expected);
                expect(await crypto.verifyToken(token, key, { now: now + life * 1000 - 1 })).toEqual(expected);
                expect(await crypto.verifyToken(token, key, { now: now + life * 1000 })).toBeUndefined();
                expect(await crypto.verifyToken(token, "another secret", { now })).toBeUndefined();
                expect(await crypto.verifyToken(token, key, { now, issuer: "nobody" })).toBeUndefined();

            }),
            { numRuns: 1000 },
        );

    });
    it("a password verifies only itself, in any normal form", async () => {

        await fc.assert(
            fc.asyncProperty(filled, filled, async ( password, other ) => {

                const hashed = await crypto.hashPassword(password, 1000);

                expect(hashed.length <= 256 && hashed.startsWith("$pbkdf2-sha256$1000$")).toBe(true);
                expect(await crypto.verifyPassword(password, hashed)).toBe(true);
                expect(await crypto.verifyPassword(password.normalize("NFKC"), hashed)).toBe(true);
                expect(await crypto.verifyPassword(other, hashed)).toBe(other.normalize("NFKC") === password.normalize("NFKC"));
                expect(crypto.needsRehash(hashed, 1000)).toBe(false);
                expect(crypto.needsRehash(hashed)).toBe(true);

            }),
            { numRuns: 300 },
        );

    }, 60_000);

});
