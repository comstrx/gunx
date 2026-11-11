import { describe, expect, test as it } from "bun:test";
import { createCipheriv, createHmac, hkdfSync, pbkdf2Sync } from "node:crypto";
import * as crypto from "engine/crypto";
import * as error from "engine/error";
import * as strings from "engine/string";
import * as stage from "engine/test";

const jwtIo = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const rfc7515 = "eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const rfc7515Key = "AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow";
const now = 1_700_000_000_000;

async function refused ( work: () => unknown ): Promise<string> {

    try {

        await work();

    } catch ( caught ) {

        return caught instanceof RangeError ? caught.message : "other";

    }

    return "none";

}
async function forged ( header: unknown, body: unknown, secret: string ): Promise<string> {

    const payload = `${strings.base64url(JSON.stringify(header))}.${strings.base64url(JSON.stringify(body))}`;

    return `${payload}.${strings.base64url(await crypto.mac(secret, payload))}`;

}
function foreign ( text: string, secret: string, context?: string ): string {

    const salt = new Uint8Array(16).fill(7);
    const iv = new Uint8Array(12).fill(9);
    const cipher = createCipheriv("aes-256-gcm", pbkdf2Sync(secret, salt, 210_000, 32, "sha256"), iv);

    if ( context !== undefined ) cipher.setAAD(strings.bytes(context));

    const body = new Uint8Array([...cipher.update(text, "utf8"), ...cipher.final(), ...cipher.getAuthTag()]);

    return `v1.${strings.base64url(salt)}.${strings.base64url(iv)}.${strings.base64url(body)}`;

}

describe("crypto", () => {

    it("hashes, hmacs and constant-time equality", async () => {

        expect(await crypto.hash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        expect(await crypto.hash("abc", "SHA-1")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
        expect(await crypto.hash(new Uint8Array([97, 98, 99]), "SHA-512")).toHaveLength(128);
        expect(await crypto.hmac("key", "The quick brown fox jumps over the lazy dog")).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
        expect(await crypto.verify("key", "The quick brown fox jumps over the lazy dog", "F7BC83F430538424B13298E6AA6FB143EF4D59A14946175997479DBC2D1A3CD8")).toBe(true);
        expect(await crypto.verify("key", "x", "00")).toBe(false);
        expect(crypto.equal("abc", "abc") && !crypto.equal("abc", "abx") && !crypto.equal("abc", "ab")).toBe(true);
        expect(await crypto.fingerprint({ b: 1, a: [1, 2] })).toBe(await crypto.fingerprint({ a: [1, 2], b: 1 }));
        expect(await crypto.fingerprint({ a: 1 })).toHaveLength(32);
        expect(crypto.key()).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(crypto.key(16)).toHaveLength(22);

    });
    it("seal and open round trip under one secret only", async () => {

        const sealed = await crypto.seal("مرحبا secret ✓", "pass-phrase");

        expect(crypto.isSealed(sealed)).toBe(true);
        expect(crypto.isSealed("v1.a.b")).toBe(false);
        expect(await crypto.open(sealed, "pass-phrase")).toBe("مرحبا secret ✓");
        expect(await crypto.open(sealed, "wrong")).toBeUndefined();
        expect(await crypto.open("junk", "pass-phrase")).toBeUndefined();
        expect(await crypto.seal("x", "k")).not.toBe(await crypto.seal("x", "k"));

        const signed = await crypto.sign('{"a":1}', "secret");

        expect(await crypto.unsign(signed, "secret")).toBe('{"a":1}');
        expect(await crypto.unsign(signed, "other")).toBeUndefined();
        expect(await crypto.unsign(`${signed}x`, "secret")).toBeUndefined();
        expect(await crypto.unsign("nodot", "secret")).toBeUndefined();

    });
    it("passwords hash with PBKDF2 and know when to rehash", async () => {

        const hashed = await crypto.hashPassword("correct horse", 10_000);

        expect(hashed.startsWith("$pbkdf2-sha256$10000$")).toBe(true);
        expect(await crypto.verifyPassword("correct horse", hashed)).toBe(true);
        expect(await crypto.verifyPassword("wrong horse", hashed)).toBe(false);
        expect(await crypto.verifyPassword("x", "garbage")).toBe(false);
        expect(crypto.needsRehash(hashed)).toBe(true);
        expect(crypto.needsRehash(hashed, 10_000)).toBe(false);
        expect(crypto.needsRehash("garbage")).toBe(true);
        expect(await crypto.verifyPassword("ﬁsh", await crypto.hashPassword("fish", 1000))).toBe(true);

    });
    it("tokens sign, verify, expire and decode", async () => {

        const now = 1_700_000_000_000;
        const token = await crypto.signToken({ sub: "user-7", role: "admin" }, "secret-key", { expiresIn: 60, issuer: "acme", now });

        expect(token.split(".")).toHaveLength(3);
        expect(crypto.decodeToken(token)).toEqual({ sub: "user-7", role: "admin", iat: 1_700_000_000, exp: 1_700_000_060, iss: "acme" });
        expect(await crypto.verifyToken(token, "secret-key", { now, issuer: "acme" })).toMatchObject({ sub: "user-7" });
        expect(await crypto.verifyToken(token, "other", { now })).toBeUndefined();
        expect(await crypto.verifyToken(token, "secret-key", { now: now + 61_000 })).toBeUndefined();
        expect(await crypto.verifyToken(token, "secret-key", { now: now + 61_000, leeway: 5 })).toBeDefined();
        expect(await crypto.verifyToken(token, "secret-key", { now, issuer: "else" })).toBeUndefined();
        expect(await crypto.verifyToken(token, "secret-key", { now, audience: "web" })).toBeUndefined();
        expect(await crypto.verifyToken("a.b", "secret-key")).toBeUndefined();
        expect(await crypto.verifyToken(`${token}x`, "secret-key", { now })).toBeUndefined();
        expect(crypto.decodeToken("x.!!!.y")).toBeUndefined();

        const early = await crypto.signToken({ nbf: 1_700_000_100 }, "secret-key", { now });

        expect(await crypto.verifyToken(early, "secret-key", { now })).toBeUndefined();
        expect(await crypto.verifyToken(early, "secret-key", { now: now + 200_000 })).toBeDefined();

    });
    it("digests and macs answer the published vectors as bytes and as hex", async () => {

        const fox = new Uint8Array(20).fill(0x0b);

        expect(await crypto.hash("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        expect(await crypto.hash("abc", "SHA-384")).toBe("cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7");
        expect(await crypto.hash("abc", "SHA-512")).toBe("ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");
        expect(await crypto.digest("abc")).toHaveLength(32);
        expect(strings.hex(await crypto.digest("abc", "SHA-1"))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
        expect(await crypto.hmac(fox, "Hi There")).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
        expect(await crypto.hmac("Jefe", "what do ya want for nothing?")).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
        expect(await crypto.hmac(fox, "Hi There", "SHA-512")).toBe(createHmac("sha512", fox).update("Hi There").digest("hex"));
        expect(strings.hex(await crypto.mac("Jefe", strings.bytes("what do ya want for nothing?")))).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
        expect(await crypto.hmac("6162", "x")).not.toBe(await crypto.hmac("ab", "x"));
        expect(await crypto.hmac(new Uint8Array([0x61, 0x62]), "x")).toBe(await crypto.hmac("ab", "x"));
        expect(await crypto.hmac(strings.fromHex("6162"), "x")).toBe(await crypto.hmac("ab", "x"));
        expect(await crypto.verify("Jefe", "what do ya want for nothing?", await crypto.mac("Jefe", "what do ya want for nothing?"))).toBe(true);
        expect(await crypto.verify("Jefe", "what do ya want for nothing?", (await crypto.mac("Jefe", "what do ya want for nothing?")).subarray(0, 16))).toBe(false);
        expect(await crypto.verify("Jefe", "x", "zz")).toBe(false);
        expect(await crypto.verify("Jefe", "x", "abc")).toBe(false);
        expect(await crypto.verify("Jefe", "x", "ab".repeat(65))).toBe(false);
        expect(await crypto.verify("Jefe", "x", 5 as unknown as string)).toBe(false);
        expect(await crypto.verify("Jefe", "x", await crypto.hmac("Jefe", "x"), "SHA-512")).toBe(false);
        expect(crypto.equal("\ud800", "\ud801")).toBe(false);
        expect(crypto.equal("", "")).toBe(true);
        expect(crypto.equal(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
        expect(crypto.equal(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
        expect(crypto.equal(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
        expect(crypto.equal("a", new Uint8Array([97]))).toBe(false);
        expect(crypto.nonce()).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(crypto.nonce(8)).toMatch(/^[A-Za-z0-9_-]{11}$/);
        expect(crypto.nonce()).not.toBe(crypto.nonce());
        expect(crypto.key()).not.toBe(crypto.key());

    });
    it("derived keys are HKDF over the purpose and nothing weak is accepted", async () => {

        const expected = strings.base64url(new Uint8Array(hkdfSync("sha256", "master secret", new Uint8Array(0), "cookie", 32)));

        expect(await crypto.derive("master secret", "cookie")).toBe(expected);
        expect(await crypto.derive(strings.bytes("master secret"), "cookie")).toBe(expected);
        expect(await crypto.derive("master secret", "session")).not.toBe(expected);
        expect(await crypto.derive("other secret", "cookie")).not.toBe(expected);
        expect(await crypto.derive("master secret", "cookie", 16)).toHaveLength(22);
        expect(await crypto.derive("master secret", "cookie", 64)).toHaveLength(86);
        expect(await refused(() => crypto.derive("master secret", ""))).toBe("not a purpose");
        expect(await refused(() => crypto.derive("master secret", "cookie", 8))).toBe("not a size");
        expect(await refused(() => crypto.derive("master secret", "cookie", 65))).toBe("not a size");
        expect(await refused(() => crypto.derive("master secret", "cookie", 16.5))).toBe("not a size");
        expect(await refused(() => crypto.derive("", "cookie"))).toBe("not a secret");
        expect(await refused(() => crypto.hash("abc", "MD5" as crypto.Algorithm))).toBe("not an algorithm");
        expect(await refused(() => crypto.hmac("k", "abc", "sha-256" as crypto.Algorithm))).toBe("not an algorithm");
        expect(await refused(() => crypto.hash(5 as unknown as string))).toBe("not data");
        expect(await refused(() => crypto.hmac("", "x"))).toBe("not a secret");
        expect(await refused(() => crypto.hmac(new Uint8Array(0), "x"))).toBe("not a secret");
        expect(await refused(() => crypto.mac(5 as unknown as string, "x"))).toBe("not a secret");
        expect(await refused(() => crypto.verify("", "x", "00"))).toBe("not a secret");
        expect(await refused(() => crypto.key(8))).toBe("not a size");
        expect(await refused(() => crypto.key(Number.NaN))).toBe("not a size");
        expect(await refused(() => crypto.seal("x", ""))).toBe("not a secret");
        expect(await refused(() => crypto.open("x", ""))).toBe("not a secret");
        expect(await refused(() => crypto.sign("x", ""))).toBe("not a secret");
        expect(await refused(() => crypto.unsign("x.y", ""))).toBe("not a secret");
        expect(await refused(() => crypto.signToken({}, ""))).toBe("not a secret");
        expect(await refused(() => crypto.verifyToken(jwtIo, ""))).toBe("not a secret");

    });
    it("the subtle source is a port: bound, scoped, checked, and refused when the host has none", async () => {

        const fake = { subtle: { digest: async () => new Uint8Array([1, 2, 3]).buffer } } as unknown as crypto.Source;
        const sealed = await crypto.seal("kept", "port-secret");

        expect(crypto.engine.name).toBe("crypto.engine");
        expect(crypto.engine.bound()).toBe(false);
        expect(await crypto.engine.with(fake, () => crypto.hash("abc"))).toBe("010203");
        expect(await crypto.hash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

        const rejected = error.attemptSync(() => crypto.engine.use({} as unknown as crypto.Source));

        expect(rejected.ok ? undefined : [rejected.fault.code, rejected.fault.reason]).toEqual(["internal", "crypto.engine.rejected"]);
        expect(crypto.engine.bound()).toBe(false);

        const restore = stage.globals({ crypto: undefined });

        try {

            crypto.engine.reset();

            const hashing = await error.attempt(() => crypto.hash("abc"));
            const opening = await error.attempt(() => crypto.open(sealed, "port-secret"));

            expect(hashing.ok ? undefined : [hashing.fault.code, hashing.fault.reason]).toEqual(["unavailable", "crypto.engine"]);
            expect(opening.ok ? undefined : [opening.fault.code, opening.fault.reason]).toEqual(["unavailable", "crypto.engine"]);

        } finally {

            restore();
            crypto.engine.reset();

        }

        expect(await crypto.open(sealed, "port-secret")).toBe("kept");

    });
    it("a seal derives once per secret, opens a foreign blob and binds its context", async () => {

        let derived = 0;
        const watched: crypto.Source = {
            subtle: new Proxy(globalThis.crypto.subtle, {
                get: ( target, name ) => {

                    const found = Reflect.get(target, name) as unknown;

                    if ( name === "deriveKey" ) derived += 1;

                    return typeof found === "function" ? found.bind(target) : found;

                },
            }),
        };
        const shaped = `v1.${"A".repeat(22)}.${"A".repeat(16)}.${"A".repeat(22)}`;

        await crypto.engine.with(watched, async () => {

            expect(await crypto.open("v1.a.b.c", "watch-secret")).toBeUndefined();
            expect(await crypto.open(`${shaped}!`, "watch-secret")).toBeUndefined();
            expect(derived).toBe(0);
            expect(await crypto.open(shaped, "watch-secret")).toBeUndefined();
            expect(await crypto.open(shaped, "watch-secret")).toBeUndefined();
            expect(derived).toBe(1);

            const one = await crypto.seal("a", "watch-secret");
            const two = await crypto.seal("b", "watch-secret");

            expect(derived).toBe(2);
            expect(one.split(".")[1]).toBe(two.split(".")[1] ?? "");
            expect(one.split(".")[2]).not.toBe(two.split(".")[2] ?? "");
            expect([await crypto.open(one, "watch-secret"), await crypto.open(two, "watch-secret")]).toEqual(["a", "b"]);
            expect(derived).toBe(2);
            expect((await crypto.seal("a", "watch-other")).split(".")[1]).not.toBe(one.split(".")[1] ?? "");
            expect(derived).toBe(3);

        });

        expect(await crypto.open(foreign("مرحبا ✓", "shared-secret"), "shared-secret")).toBe("مرحبا ✓");
        expect(await crypto.open(foreign("bound", "shared-secret", "tenant-7"), "shared-secret", "tenant-7")).toBe("bound");
        expect(await crypto.open(foreign("bound", "shared-secret", "tenant-7"), "shared-secret")).toBeUndefined();
        expect(await crypto.open(foreign("bound", "shared-secret"), "shared-secret", "tenant-7")).toBeUndefined();

        const bound = await crypto.seal("mine", "shared-secret", "tenant-7");

        expect(await crypto.open(bound, "shared-secret", "tenant-7")).toBe("mine");
        expect(await crypto.open(bound, "shared-secret", "tenant-8")).toBeUndefined();
        expect(await crypto.open(bound, "shared-secret")).toBeUndefined();
        expect(await crypto.open(await crypto.seal("x", "ab"), new Uint8Array([0x61, 0x62]))).toBe("x");
        expect(await crypto.open(await crypto.seal("", "shared-secret"), "shared-secret")).toBe("");
        expect(crypto.isSealed("v1.a.b.c")).toBe(false);
        expect(crypto.isSealed(5)).toBe(false);
        expect(crypto.isSealed(`${bound}!`)).toBe(false);
        expect(crypto.isSealed(bound.replace("v1.", "v2."))).toBe(false);

    });
    it("a signed payload is one canonical text", async () => {

        const signed = await crypto.sign("payload ✓", "secret");
        const [body = "", signature = ""] = signed.split(".");
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        const twin = alphabet[alphabet.indexOf(signature.slice(-1)) ^ 1] ?? "";

        expect(body).toBe(strings.base64url("payload ✓"));
        expect(signature).toBe(createHmac("sha256", "secret").update(body).digest("base64url"));
        expect(await crypto.unsign(`${body}.${signature.slice(0, -1)}${twin}`, "secret")).toBeUndefined();
        expect(await crypto.unsign(`${body}=.${signature}`, "secret")).toBeUndefined();
        expect(await crypto.unsign(await crypto.sign("", "secret"), "secret")).toBe("");
        expect(await crypto.unsign(await crypto.sign("a.b.c", strings.bytes("secret")), "secret")).toBe("a.b.c");
        expect(await crypto.unsign("", "secret")).toBeUndefined();
        expect(await crypto.unsign(5 as unknown as string, "secret")).toBeUndefined();

    });
    it("password hashes are bounded PBKDF2 and a stored hash is read strictly", async () => {

        const salt = strings.base64url("saltSALTsaltSALTsaltSALTsaltSALTsalt");
        const digest = strings.base64url(strings.fromHex("348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1"));
        const stored = `$pbkdf2-sha256$4096$${salt}$${digest}`;
        const shaped = ( rounds: string, grain = "A".repeat(22), body = "A".repeat(43) ): string => `$pbkdf2-sha256$${rounds}$${grain}$${body}`;

        expect(await crypto.verifyPassword("passwordPASSWORDpassword", stored)).toBe(true);
        expect(await crypto.verifyPassword("passwordPASSWORDpasswore", stored)).toBe(false);
        expect(await crypto.verifyPassword("", stored)).toBe(false);
        expect(await crypto.verifyPassword("x".repeat(1025), stored)).toBe(false);
        expect(await crypto.verifyPassword(5 as unknown as string, stored)).toBe(false);
        expect(await crypto.verifyPassword("x", 5 as unknown as string)).toBe(false);
        expect((await crypto.hashPassword("correct horse")).startsWith("$pbkdf2-sha256$600000$")).toBe(true);
        expect(await crypto.hashPassword("same", 1000)).not.toBe(await crypto.hashPassword("same", 1000));
        expect(await refused(() => crypto.hashPassword("pw", 10))).toBe("not a round count");
        expect(await refused(() => crypto.hashPassword("pw", 1000.5))).toBe("not a round count");
        expect(await refused(() => crypto.hashPassword("pw", 10_000_001))).toBe("not a round count");
        expect(await refused(() => crypto.hashPassword("pw", Number.NaN))).toBe("not a round count");
        expect(await refused(() => crypto.hashPassword(""))).toBe("not a password");
        expect(await refused(() => crypto.hashPassword("x".repeat(1025)))).toBe("not a password");
        expect(await refused(() => crypto.hashPassword(5 as unknown as string))).toBe("not a password");

        for ( const hashed of [shaped("0x3e8"), shaped("1e3"), shaped("999"), shaped("01000"), shaped("10000001"), shaped("1000", "A".repeat(21)), shaped("1000", "A".repeat(87)), shaped("1000", "A".repeat(22), "A".repeat(42)), shaped("1000", "A".repeat(22), "A".repeat(44)), `${shaped("1000")}$`, ` ${shaped("1000")}`, shaped("1000").replace("sha256", "sha512")] ) {

            expect([hashed, await crypto.verifyPassword("x", hashed), crypto.needsRehash(hashed)]).toEqual([hashed, false, true]);

        }

        expect(crypto.needsRehash(shaped("600000"))).toBe(false);
        expect(crypto.needsRehash(shaped("210000"))).toBe(true);
        expect(crypto.needsRehash(shaped("210000"), 210_000)).toBe(false);
        expect(crypto.needsRehash(shaped("10000000"))).toBe(false);
        expect(crypto.needsRehash(5 as unknown as string)).toBe(true);

    });
    it("tokens verify the published HS256 vectors and any sound header", async () => {

        expect(await crypto.verifyToken(jwtIo, "your-256-bit-secret")).toEqual({ sub: "1234567890", name: "John Doe", iat: 1_516_239_022 });
        expect(await crypto.verifyToken(jwtIo, strings.bytes("your-256-bit-secret"))).toEqual({ sub: "1234567890", name: "John Doe", iat: 1_516_239_022 });
        expect(await crypto.verifyToken(rfc7515, strings.fromBase64(rfc7515Key), { now: 1_300_819_000_000 })).toEqual({ iss: "joe", exp: 1_300_819_380, "http://example.com/is_root": true });
        expect(await crypto.verifyToken(rfc7515, strings.fromBase64(rfc7515Key), { now: 1_300_819_380_000 })).toBeUndefined();
        expect(crypto.decodeToken(rfc7515)).toEqual({ iss: "joe", exp: 1_300_819_380, "http://example.com/is_root": true });
        expect(await crypto.signToken({ sub: "1234567890", name: "John Doe", iat: 1_516_239_022 }, "your-256-bit-secret")).toBe(jwtIo);
        expect(await crypto.verifyToken(await forged({ alg: "HS256" }, { sub: "u" }, "k"), "k")).toEqual({ sub: "u" });
        expect(await crypto.verifyToken(await forged({ typ: "jwt", alg: "HS256" }, { sub: "u" }, "k"), "k")).toEqual({ sub: "u" });
        expect(await crypto.verifyToken(await forged({ alg: "HS256", typ: "JWT", kid: "1" }, { sub: "u" }, "k"), "k")).toEqual({ sub: "u" });

        for ( const header of [{ alg: "none" }, { alg: "HS512", typ: "JWT" }, { alg: "hs256" }, { alg: "HS256", typ: "JWE" }, { alg: "HS256", typ: 5 }, { alg: "HS256", crit: ["exp"] }, { typ: "JWT" }, ["HS256"], "HS256"] ) {

            expect([header, await crypto.verifyToken(await forged(header, { sub: "u" }, "k"), "k")]).toEqual([header, undefined]);

        }

        expect(await crypto.verifyToken(`${strings.base64url('{"alg":"none"}')}.${strings.base64url('{"sub":"u"}')}.AA`, "k")).toBeUndefined();

    });
    it("tokens refuse unsound claims, wrong audiences and bad clocks", async () => {

        for ( const body of [{ exp: "1" }, { exp: null }, { nbf: "0" }, { iat: true }, { sub: 5 }, { iss: ["a"] }, { jti: 7 }, { aud: 5 }, { aud: ["a", 5] }, { aud: { a: 1 } }] ) {

            const token = await forged({ alg: "HS256", typ: "JWT" }, body, "k");

            expect([body, await crypto.verifyToken(token, "k", { now }), crypto.decodeToken(token)]).toEqual([body, undefined, undefined]);

        }

        const token = await crypto.signToken({ role: "admin" }, "k", { now, expiresIn: 60, notBefore: 10, issuer: "acme", audience: ["web", "mobile"], subject: "user-7", id: "t-1" });
        const later = now + 20_000;

        expect(crypto.decodeToken(token)).toEqual({ role: "admin", iat: 1_700_000_000, exp: 1_700_000_060, nbf: 1_700_000_010, iss: "acme", aud: ["web", "mobile"], sub: "user-7", jti: "t-1" });
        expect(await crypto.verifyToken(token, "k", { now })).toBeUndefined();
        expect(await crypto.verifyToken(token, "k", { now, leeway: 10 })).toBeDefined();
        expect(await crypto.verifyToken(token, "k", { now: later, audience: "mobile" })).toBeDefined();
        expect(await crypto.verifyToken(token, "k", { now: later, audience: ["desktop", "web"] })).toBeDefined();
        expect(await crypto.verifyToken(token, "k", { now: later, audience: "desktop" })).toBeUndefined();
        expect(await crypto.verifyToken(token, "k", { now: later, audience: [] })).toBeUndefined();
        expect(await crypto.verifyToken(token, "k", { now: later, subject: "user-7" })).toBeDefined();
        expect(await crypto.verifyToken(token, "k", { now: later, subject: "user-8" })).toBeUndefined();
        expect(await crypto.verifyToken(token, "k", { now: later, maxAge: 20 })).toBeDefined();
        expect(await crypto.verifyToken(token, "k", { now: later, maxAge: 19 })).toBeUndefined();
        expect(await crypto.verifyToken(token, "k", { now: later, maxAge: 15, leeway: 5 })).toBeDefined();
        expect(await crypto.verifyToken(await forged({ alg: "HS256" }, { sub: "u" }, "k"), "k", { maxAge: 60 })).toBeUndefined();
        expect(await crypto.verifyToken(await crypto.signToken({ aud: "web" }, "k"), "k", { audience: ["web"] })).toBeDefined();
        expect(await crypto.verifyToken(await crypto.signToken({}, "k", { now, expiresIn: -5 }), "k", { now })).toBeUndefined();
        expect(crypto.decodeToken(await crypto.signToken({ iat: 5 }, "k", { now }))).toEqual({ iat: 5 });
        expect(await crypto.verifyToken(await crypto.signToken({ sub: "u" }, strings.bytes("k"), { now }), "k", { now })).toEqual({ sub: "u", iat: 1_700_000_000 });
        expect(await refused(() => crypto.signToken({}, "k", { now: Number.NaN }))).toBe("not a time");
        expect(await refused(() => crypto.signToken({}, "k", { expiresIn: Number.NaN }))).toBe("not a duration");
        expect(await refused(() => crypto.signToken({}, "k", { notBefore: Number.POSITIVE_INFINITY }))).toBe("not a duration");
        expect(await refused(() => crypto.signToken({ exp: "1" as unknown as number }, "k"))).toBe("not a claim");
        expect(await refused(() => crypto.signToken({ sub: 5 as unknown as string }, "k"))).toBe("not a claim");
        expect(await refused(() => crypto.signToken({ note: "x".repeat(8192) }, "k"))).toBe("not a claim");
        expect(await refused(() => crypto.verifyToken(token, "k", { now: Number.NaN }))).toBe("not a time");
        expect(await refused(() => crypto.verifyToken(token, "k", { leeway: Number.NaN }))).toBe("not a duration");
        expect(await refused(() => crypto.verifyToken(token, "k", { maxAge: Number.NaN }))).toBe("not a duration");

        const long = await forged({ alg: "HS256" }, { note: "x".repeat(7000) }, "k");

        expect(long.length > 8192).toBe(true);
        expect([await crypto.verifyToken(long, "k"), crypto.decodeToken(long)]).toEqual([undefined, undefined]);
        expect(crypto.decodeToken(5 as unknown as string)).toBeUndefined();
        expect(crypto.decodeToken("a.b")).toBeUndefined();
        expect(crypto.decodeToken(`a.${strings.base64url("[1]")}.c`)).toBeUndefined();

    });

});
