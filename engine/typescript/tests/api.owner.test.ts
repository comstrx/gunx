import { expect, test as it } from "bun:test";
import * as api from "engine/api";
import * as validate from "engine/validate";

const item = api.feature("items", { show: api.get("/item", validate.object({}), validate.string(), { cache: 60 }) });

it("cache partitions cannot collide through separators in tenant or scope", async () => {

    let tenant = "a|b";
    let scope = "c";
    let calls = 0;
    const stub = api.stub({ "GET /item": () => { calls += 1; return `${tenant}/${scope}`; } });
    const client = api.create({ baseUrl: "https://test.example", tenant: () => tenant, scope: () => scope, fetcher: stub.fetcher });

    expect((await client.call(item.show, {})).data).toBe("a|b/c");
    tenant = "a";
    scope = "b|c";
    expect(client.cached(item.show, {})).toBeUndefined();
    expect((await client.call(item.show, {})).data).toBe("a/b|c");
    expect(calls).toBe(2);

});

it("per-call headers bypass shared cached responses and never overwrite them", async () => {

    let calls = 0;
    const stub = api.stub({ "GET /item": () => String(++calls) });
    const client = api.create({ baseUrl: "https://test.example", fetcher: stub.fetcher });

    expect((await client.call(item.show, {})).data).toBe("1");
    expect((await client.call(item.show, {}, { headers: { "x-view": "special" } })).data).toBe("2");
    expect((await client.call(item.show, {})).data).toBe("1");
    expect(calls).toBe(2);

});

it("a synchronous cache peek never assumes an unresolved authenticated identity", async () => {

    let token = "first";
    const stub = api.stub({ "GET /item": () => token });
    const client = api.create({ baseUrl: "https://test.example", token: async () => token, fetcher: stub.fetcher });

    expect((await client.call(item.show, {})).data).toBe("first");
    token = "second";
    expect(client.cached(item.show, {})).toBeUndefined();
    expect((await client.call(item.show, {})).data).toBe("second");

});

it("the total API budget includes identity acquisition and a late identity cannot send or clear a current cache", async () => {

    let resolve: ( value: string ) => void = () => undefined;
    let delayed = true;
    let calls = 0;
    const faults: string[] = [];
    const stub = api.stub({ "GET /item": () => { calls += 1; return "current"; } });
    const client = api.create({ baseUrl: "https://test.example", token: () => delayed ? new Promise<string>(( done ) => { resolve = done; }) : "current", fetcher: stub.fetcher, onFault: ( fault ) => { faults.push(fault.reason ?? ""); } });

    await expect(client.call(item.show, {}, { budget: 10 })).rejects.toMatchObject({ reason: "api.budget" });
    expect(calls).toBe(0);
    delayed = false;
    expect((await client.call(item.show, {})).data).toBe("current");
    resolve("obsolete");
    await Promise.resolve();
    await Promise.resolve();
    expect(client.cached(item.show, {})).toBe("current");
    expect(calls).toBe(1);
    expect(faults).toEqual(["api.budget"]);

});
it("API cancellation is observed while waiting for an identity, before acquiring any identity, and during retry backoff", async () => {

    let tokens = 0;
    const client = api.create({ baseUrl: "https://test.example", token: () => {

        tokens += 1;

        return new Promise<string>(() => undefined);

    } });

    await expect(client.call(item.show, {}, { signal: AbortSignal.abort() })).rejects.toMatchObject({ reason: "api.aborted" });
    expect(tokens).toBe(0);

    const stop = new AbortController();
    const pending = client.call(item.show, {}, { signal: stop.signal });

    stop.abort();
    await expect(pending).rejects.toMatchObject({ reason: "api.aborted" });
    expect(tokens).toBe(1);

    const faults: string[] = [];
    const retrying = api.create({ baseUrl: "https://test.example", token: () => "t", fetcher: async () => new Response("", { status: 503 }), onFault: ( fault ) => { faults.push(fault.reason ?? ""); } });

    await expect(retrying.call(item.show, {}, { budget: 10, retries: 5 })).rejects.toMatchObject({ reason: "api.budget" });
    expect(faults).toEqual(["api.budget"]);

});


it("one client keeps explicitly requested locales separate without mutating its default", async () => {

    const seen: string[] = [];
    const stub = api.stub({ "GET /item": ( context ) => {

        const language = context.headers["accept-language"] ?? "";

        seen.push(language);

        return language;

    } });
    const client = api.create({ baseUrl: "https://test.example", locale: () => "ar", fetcher: stub.fetcher });

    expect((await client.call(item.show, {}, { locale: "fr" })).data).toBe("fr");
    expect((await client.call(item.show, {})).data).toBe("ar");
    expect((await client.call(item.show, {}, { locale: "fr" })).cached).toBe(true);
    expect(seen).toEqual(["fr", "ar"]);

});


it("trace opt-out applies to both the selected API wire and the transport", async () => {

    const stub = api.stub({ "GET /item": () => "ok" });
    const client = api.create({ baseUrl: "https://test.example", trace: false, wire: api.wire({ headers: { requestId: "x-correlation-id" } }), fetcher: stub.fetcher });

    await client.call(item.show, {});
    expect(stub.calls()[0]?.headers["x-correlation-id"]).toBeUndefined();
    expect(stub.calls()[0]?.headers["x-request-id"]).toBeUndefined();

});
