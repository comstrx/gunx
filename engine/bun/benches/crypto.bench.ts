import * as crypto from "engine/crypto";
import { bench, do_not_optimize, run } from "mitata";

const text = "payload payload payload";
const sealed = await crypto.seal(text, "secret");
const signed = await crypto.sign(text, "secret");
const proof = await crypto.hmac("key", "hello world");
const token = await crypto.signToken({ sub: "u" }, "secret", { expiresIn: 60 });
const hashed = await crypto.hashPassword("correct horse battery staple");
const left = "a".repeat(64);
const right = `${"a".repeat(63)}b`;
let cold = 0;

bench("crypto.hash", async () => do_not_optimize(await crypto.hash("hello world")));
bench("crypto.hash.sha512", async () => do_not_optimize(await crypto.hash("hello world", "SHA-512")));
bench("crypto.hmac", async () => do_not_optimize(await crypto.hmac("key", "hello world")));
bench("crypto.mac", async () => do_not_optimize(await crypto.mac("key", "hello world")));
bench("crypto.verify", async () => do_not_optimize(await crypto.verify("key", "hello world", proof)));
bench("crypto.equal.64", () => do_not_optimize(crypto.equal(left, right)));
bench("crypto.derive", async () => do_not_optimize(await crypto.derive("master secret", "cookie")));
bench("crypto.key", () => do_not_optimize(crypto.key()));
bench("crypto.nonce", () => do_not_optimize(crypto.nonce()));
bench("crypto.seal.cold", async () => {

    cold += 1;
    do_not_optimize(await crypto.seal(text, `cold-${cold}`));

});
bench("crypto.seal.warm", async () => do_not_optimize(await crypto.seal(text, "secret")));
bench("crypto.open.warm", async () => do_not_optimize(await crypto.open(sealed, "secret")));
bench("crypto.sign", async () => do_not_optimize(await crypto.sign(text, "secret")));
bench("crypto.unsign", async () => do_not_optimize(await crypto.unsign(signed, "secret")));
bench("crypto.signToken", async () => do_not_optimize(await crypto.signToken({ sub: "u" }, "secret", { expiresIn: 60 })));
bench("crypto.verifyToken", async () => do_not_optimize(await crypto.verifyToken(token, "secret")));
bench("crypto.decodeToken", () => do_not_optimize(crypto.decodeToken(token)));
bench("crypto.hashPassword", async () => do_not_optimize(await crypto.hashPassword("correct horse battery staple")));
bench("crypto.verifyPassword", async () => do_not_optimize(await crypto.verifyPassword("correct horse battery staple", hashed)));

await run();
