import { expect, test as it } from "bun:test";
import * as crypto from "engine/crypto";

function source ( name: string, calls: string[], wait?: Promise<void> ): crypto.Source {

    const native = globalThis.crypto.subtle;

    return { subtle: new Proxy(native, { get ( target, key ) {

        const value = Reflect.get(target, key) as unknown;

        if ( typeof value !== "function" ) return value;
        if ( key === "importKey" ) return async ( ...args: Parameters<SubtleCrypto["importKey"]> ) => {

            calls.push(`${name}.import`);

            if ( wait ) await wait;

            return Reflect.apply(value, target, args);

        };

        return ( ...args: unknown[] ) => {

            calls.push(`${name}.${String(key)}`);

            return Reflect.apply(value, target, args);

        };

    } }) };

}

it("crypto operations keep the provider that created their key across rebinding", async () => {

    for ( const work of [( secret: string ) => crypto.mac(secret, "payload"), ( secret: string ) => crypto.seal("payload", secret)] ) {

        const gate = Promise.withResolvers<void>();
        const calls: string[] = [];
        const first = crypto.engine.use(source("first", calls, gate.promise));
        const pending = work("provider-owned");
        const second = crypto.engine.use(source("second", calls));

        try {

            gate.resolve();
            await pending;
            expect(calls.some(( call ) => call.startsWith("second."))).toBe(false);

        } finally {

            second();
            first();

        }

    }

});

it("a rejected old provider key never evicts the new provider cache entry", async () => {

    const gate = Promise.withResolvers<void>();
    const calls: string[] = [];
    const first = crypto.engine.use(source("first", calls, gate.promise));
    const pending = crypto.seal("payload", "same-secret").catch(() => undefined);
    const second = crypto.engine.use(source("second", calls));

    try {

        await crypto.seal("payload", "same-secret");
        gate.reject(new Error("old provider failed"));
        await pending;
        await crypto.seal("payload", "same-secret");
        expect(calls.filter(( call ) => call === "second.import")).toHaveLength(1);

    } finally {

        second();
        first();

    }

});


it("crypto caches contain opaque identities rather than raw secrets or reusable unkeyed digests", async () => {

    const raw = "cache-secret-sentinel-7d2970c1";
    const material = new TextEncoder().encode(raw);
    const hex = Array.from(material, ( byte ) => byte.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.hash(raw);
    const seen: string[] = [];
    const original = Map.prototype.set;
    const restore = crypto.engine.use({ subtle: globalThis.crypto.subtle });

    Map.prototype.set = function<K, V> ( this: Map<K, V>, key: K, value: V ): Map<K, V> {

        if ( typeof key === "string" ) seen.push(key);

        return original.call(this, key, value) as Map<K, V>;

    };

    try {

        await crypto.mac(raw, "payload");
        const sealed = await crypto.seal("payload", material);

        expect(await crypto.open(sealed, raw)).toBe("payload");
        expect(seen.length).toBeGreaterThan(0);
        expect(seen.some(( key ) => key.includes(raw) || key.includes(hex) || key.includes(digest))).toBe(false);

    } finally {

        Map.prototype.set = original;
        restore();

    }

});

it("mutable secret, payload and signature buffers are captured at invocation", async () => {

    const text = "mutable-secret";
    const body = "payload";
    const expected = await crypto.hmac(text, body);
    const secret = new TextEncoder().encode(text);
    const bytes = new TextEncoder().encode(body);
    const pending = crypto.hmac(secret, bytes);

    secret.fill(0);
    bytes.fill(0);
    expect(await pending).toBe(expected);
    expect(await crypto.hmac(text, body)).toBe(expected);

    const signature = await crypto.mac(text, body);
    const checkedSecret = new TextEncoder().encode(text);
    const checkedBody = new TextEncoder().encode(body);
    const verifying = crypto.verify(checkedSecret, checkedBody, signature);

    checkedSecret.fill(0);
    checkedBody.fill(0);
    signature.fill(0);
    expect(await verifying).toBe(true);

    const sealedSecret = new TextEncoder().encode(text);
    const sealing = crypto.seal(body, sealedSecret);

    sealedSecret.fill(0);

    const sealed = await sealing;
    const openingSecret = new TextEncoder().encode(text);
    const opening = crypto.open(sealed, openingSecret);

    openingSecret.fill(0);
    expect(await opening).toBe(body);

});

it("an unavailable cache identity can retry without retaining a rejected provider key", async () => {

    const native = globalThis.crypto.subtle;
    let attempts = 0;
    const restore = crypto.engine.use({ subtle: new Proxy(native, {
        get ( target, key ) {

            const value: unknown = Reflect.get(target, key, target);

            if ( key === "generateKey" ) return async ( ...args: Parameters<SubtleCrypto["generateKey"]> ) => {

                attempts += 1;

                if ( attempts === 1 ) throw new Error("key generation failed");

                expect(args[1]).toBe(false);

                return Reflect.apply(value as (...args: unknown[]) => unknown, target, args);

            };

            return typeof value === "function" ? value.bind(target) : value;

        },
    }) });

    try {

        await expect(crypto.seal("payload", "retry-identity")).rejects.toThrow("key generation failed");
        expect(crypto.isSealed(await crypto.seal("payload", "retry-identity"))).toBe(true);
        expect(attempts).toBe(2);

    } finally {

        restore();

    }

});
