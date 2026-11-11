import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as net from "engine/net";

function fake ( handler: ( url: string, init: { method: string; headers: Record<string, string>; body?: unknown } ) => Response | Promise<Response> ): net.Fetcher {

    return async ( url, init ) => {

        if ( init.signal.aborted ) throw Object.assign(new Error("aborted"), { name: "AbortError" });

        return handler(url, init);

    };

}
function told ( failure: unknown ): string;
function told ( run: () => unknown ): string;
function told ( given: unknown ): string {

    try {

        if ( typeof given === "function" ) {

            given();

            return "ok";

        }

        throw given;

    } catch ( failure ) {

        if ( error.is(failure) ) return `${failure.code}/${failure.reason}`;

        return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

    }

}
function reply ( body: unknown, status = 200, headers: Record<string, string> = {} ): Response {

    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

}

describe("net", () => {

    it("urls parse, join and compare", () => {

        expect(net.parseUrl("https://a.io:8443/p/q?x=1&x=2#h")).toEqual({ protocol: "https", host: "a.io:8443", hostname: "a.io", port: "8443", path: "/p/q", query: { x: ["1", "2"] }, hash: "h", origin: "https://a.io:8443" });
        expect(net.parseUrl("nope")).toBeUndefined();
        expect(net.isEndpoint("https://a.io/x") && !net.isEndpoint("ftp://a.io") && !net.isEndpoint("x")).toBe(true);
        expect(net.isOrigin("https://a.io") && !net.isOrigin("https://a.io/") && !net.isOrigin("https://a.io/x")).toBe(true);
        expect(net.originOf("https://a.io/x/y")).toBe("https://a.io");
        expect(net.hostname("http://[::1]:3000/")).toBe("[::1]");
        expect(net.sameOrigin("https://a.io/x", "https://a.io/y") && !net.sameOrigin("https://a.io", "http://a.io")).toBe(true);
        expect(net.isLoopback("localhost") && net.isLoopback("127.0.0.1") && net.isLoopback("[::1]") && !net.isLoopback("a.io")).toBe(true);
        expect(net.isPrivateAddress("10.0.0.1") && net.isPrivateAddress("172.20.1.1") && net.isPrivateAddress("192.168.1.1") && !net.isPrivateAddress("8.8.8.8")).toBe(true);
        expect(net.joinUrl("https://a.io/", "/v1/", "users", "")).toBe("https://a.io/v1/users");
        expect(net.joinUrl("https://a.io")).toBe("https://a.io");
        expect(net.withQuery("/x?a=1#h", { b: 2, a: "3", c: null })).toBe("/x?a=3&b=2#h");
        expect(net.stripQuery("/x?a=1#h")).toBe("/x");

    });
    it("request handles json, envelopes, retries, timeouts and caps", async () => {

        let calls = 0;
        const fetcher = fake(( url, init ) => {

            calls += 1;

            if ( url.endsWith("/flaky") && calls < 3 ) return new Response("", { status: 503 });
            if ( url.endsWith("/fail") ) return new Response(JSON.stringify({ code: "validation", message: "bad", errors: { email: ["taken"] }, reason: "signup", meta: { request_id: "srv-1" } }), { status: 422, headers: { "content-type": "application/json", "retry-after": "7" } });
            if ( url.endsWith("/big") ) return new Response("x".repeat(100), { status: 200, headers: { "content-length": "100" } });
            if ( url.endsWith("/text") ) return new Response("plain", { status: 200, headers: { "content-type": "text/plain" } });
            if ( url.endsWith("/slow") ) return new Promise(( resolve ) => setTimeout(() => resolve(new Response("late")), 200));

            return new Response(JSON.stringify({ data: { echo: init.headers, method: init.method, body: init.body, url } }), { status: 200, headers: { "content-type": "application/json" } });

        });
        const reply = await net.request<{ data: { echo: Record<string, string>; method: string; body: string; url: string } }>("https://a.io/ok", { method: "POST", body: { a: 1 }, query: { q: "x" }, headers: { Authorization: "Bearer t", "X-Skip": undefined }, fetcher, requestId: "req-1" });

        expect(reply.status).toBe(200);
        expect(reply.body.data.method).toBe("POST");
        expect(reply.body.data.body).toBe('{"a":1}');
        expect(reply.body.data.url).toBe("https://a.io/ok?q=x");
        expect(reply.body.data.echo).toEqual({ accept: "application/json", "x-request-id": "req-1", authorization: "Bearer t", "content-type": "application/json" });
        expect(reply.requestId).toBe("req-1");
        expect(reply.attempts).toBe(1);

        calls = 0;

        const flaky = await net.request("https://a.io/flaky", { retries: 3, fetcher });

        expect(flaky.attempts).toBe(3);

        const failed = await net.request("https://a.io/fail", { fetcher }).catch(( caught: unknown ) => caught);

        expect(error.isFault(failed) && failed.code === "validation" && failed.field("email") === "taken" && failed.retryAfter === 7 && failed.requestId === "srv-1").toBe(true);
        await expect(net.request("https://a.io/big", { fetcher, maxBytes: 50 })).rejects.toMatchObject({ code: "too_large" });
        expect((await net.request("https://a.io/text", { fetcher })).body).toBe("plain");
        await expect(net.request("https://a.io/slow", { fetcher, timeout: 20 })).rejects.toMatchObject({ code: "timeout" });
        await expect(net.request("https://a.io/x", { fetcher: async () => { throw new TypeError("fetch failed"); } })).rejects.toMatchObject({ code: "network" });

        const controller = new AbortController();

        controller.abort();
        await expect(net.request("https://a.io/x", { fetcher, signal: controller.signal })).rejects.toMatchObject({ code: "timeout" });
        expect(net.failure(404, { message: "gone" }).code).toBe("not_found");
        expect(net.failure(429, "", { "retry-after": "3" }).retryAfter).toBe(3);
        expect((await net.fetcher.with(fetcher, () => net.request("https://a.io/text"))).text).toBe("plain");
        expect(net.fetcher.bound()).toBe(false);

    });
    it("headers, facts, events and polling", async () => {

        expect(net.forwardedFor("203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
        expect(net.forwardedFor("::ffff:1.2.3.4")).toBe("1.2.3.4");
        expect(net.forwardedFor("junk value")).toBeUndefined();
        expect(net.retryAfter("120")).toBe(120);
        expect(net.retryAfter("Wed, 21 Oct 2015 07:28:00 GMT", Date.UTC(2015, 9, 21, 7, 27, 30))).toBe(30);
        expect(net.retryAfter("x")).toBeUndefined();
        expect(net.contentSecurityPolicy({ "default-src": ["'self'"], "img-src": "*", "upgrade-insecure-requests": true })).toBe("default-src 'self'; img-src *; upgrade-insecure-requests");

        const secure = net.securityHeaders({ csp: { "default-src": "'self'" }, frame: "SAMEORIGIN" });

        expect(secure["x-frame-options"]).toBe("SAMEORIGIN");
        expect(secure["content-security-policy"]).toBe("default-src 'self'");
        expect(secure["strict-transport-security"]).toContain("max-age");
        expect(net.securityHeaders({ hsts: false })["strict-transport-security"]).toBeUndefined();

        const facts = net.facts({ "user-agent": "Mozilla/5.0 (iPhone) Mobile Safari", "accept-language": "ar-EG,ar;q=0.9", "x-forwarded-for": "1.2.3.4", "x-forwarded-proto": "https" });

        expect(facts).toEqual({ ip: "1.2.3.4", agent: "Mozilla/5.0 (iPhone) Mobile Safari", language: "ar-EG", referer: undefined, requestId: undefined, secure: true, mobile: true, bot: false });
        expect(net.facts(new Headers({ "user-agent": "Googlebot/2.1" }), "9.9.9.9").bot).toBe(true);
        expect(net.facts(new Headers({ "user-agent": "Googlebot/2.1" }), "9.9.9.9").ip).toBe("9.9.9.9");

        const parsed = net.parseEvents("id: 1\nevent: tick\ndata: {\"n\":1}\n\n: comment\ndata: a\ndata: b\n\n");

        expect(parsed).toEqual([{ id: "1", event: "tick", data: '{"n":1}', json: { n: 1 } }, { id: undefined, event: "message", data: "a\nb", json: undefined }]);

        const stream = new ReadableStream<Uint8Array>({
            start ( controller ) {

                controller.enqueue(new TextEncoder().encode("data: one\n\nda"));
                controller.enqueue(new TextEncoder().encode("ta: two\n\n"));
                controller.close();

            },
        });
        const seen: string[] = [];

        for await ( const event of net.events("https://a.io/sse", { fetcher: async () => new Response(stream, { status: 200 }) }) ) seen.push(event.data);

        expect(seen).toEqual(["one", "two"]);
        await expect((async () => { for await ( const _ of net.events("https://a.io/sse", { fetcher: async () => new Response("", { status: 500 }) }) ) return _; return undefined; })()).rejects.toMatchObject({ code: "internal" });

        let polls = 0;

        expect(await net.poll(async () => { polls += 1; return polls; }, { every: 1, until: ( value ) => value >= 3 })).toBe(3);
        await expect(net.poll(async () => 0, { every: 1, until: () => false, limit: 2 })).rejects.toMatchObject({ code: "timeout", reason: "net.exhausted" });

    });
    it("signals time out and combine, bodies are read under a cap, and a policy fences origins", async () => {

        const soon = net.timeoutSignal(5);

        expect(soon.aborted).toBe(false);
        await new Promise(( resolve ) => setTimeout(resolve, 15));
        expect(soon.aborted).toBe(true);

        const own = new AbortController();
        const any = net.anySignal(own.signal, undefined, new AbortController().signal);

        expect(any.aborted).toBe(false);
        own.abort();
        expect(any.aborted).toBe(true);

        const body = new Response(new Uint8Array([1, 2, 3, 4]));

        expect([...(await net.readBytes(body, 10))]).toEqual([1, 2, 3, 4]);
        await expect(net.readBytes(new Response(new Uint8Array(20)), 10)).rejects.toMatchObject({ code: "too_large" });

        const allow = net.policy({ origins: ["https://api.acme.example/", "https://cdn.acme.example"], allowLoopback: true });

        expect(allow("https://api.acme.example/orders") && allow("http://localhost:8100/x") && !allow("https://evil.example/") && !allow("nope")).toBe(true);
        expect(net.policy({ origins: [] })("http://localhost:1/")).toBe(false);

        const fetcher = net.guarded(async () => new Response("ok"), allow);

        expect(await (await fetcher("https://api.acme.example/ok", { method: "GET", headers: {}, signal: own.signal })).text()).toBe("ok");
        await expect(fetcher("https://evil.example/", { method: "GET", headers: {}, signal: own.signal })).rejects.toMatchObject({ code: "forbidden" });

    });
    it("addresses: private, loopback, mapped, odd and unparsable forms are read like the host and fenced like a firewall", () => {

        const fenced = ["10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "127.255.0.1", "0.0.0.0", "169.254.1.1", "100.64.0.1", "100.127.255.255", "198.18.0.1", "198.19.255.255", "192.0.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "febf::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:192.168.0.1", "64:ff9b::10.0.0.1", "64:ff9b:1::1", "2002:0a00:0001::", "::10.0.0.1", "[::1]", "[fd00::1]:8080".slice(0, -5), "0x7f.1", "0x7f000001", "2130706433", "017700000001", "127.1", "10.1", "localhost", "LOCALHOST.", "api.internal", "printer.local", "router.home.arpa", "intranet", "a..b", "exa mple.com", "-", "", "x".repeat(300), "::ffff:0a00:0001", "0177.0.0.1", "0x0a.0.0.1"];
        const open = ["8.8.8.8", "1.1.1.1", "203.0.113.9", "198.51.100.7", "100.63.255.255", "100.128.0.0", "172.15.255.255", "172.32.0.1", "192.167.1.1", "198.17.0.1", "198.20.0.1", "223.255.255.255", "2001:db8::1", "2606:4700::1111", "::ffff:8.8.8.8", "64:ff9b::8.8.8.8", "2002:0808:0808::", "fcm.googleapis.com", "example.com", "a.io", "xn--mgbh0fb.xn--kgbechtv", "sub.example.co.uk", "a-b.example", "8.8.8.8."];

        for ( const host of fenced ) expect([host, net.isPrivateAddress(host)]).toEqual([host, true]);
        for ( const host of open ) expect([host, net.isPrivateAddress(host)]).toEqual([host, false]);

        expect(["localhost", "a.localhost", "LocalHost", "127.0.0.1", "127.9.9.9", "[::1]", "::1", "::ffff:127.0.0.1", "0x7f.1", "2130706433"].map(( host ) => net.isLoopback(host))).toEqual(Array.from({ length: 10 }, () => true));
        expect(["a.io", "10.0.0.1", "::2", "::ffff:10.0.0.1", "localhost.example", "", "junk host"].map(( host ) => net.isLoopback(host))).toEqual(Array.from({ length: 7 }, () => false));
        expect(["1.2.3.4", "::1", "[::1]", "2001:db8::1", "::ffff:1.2.3.4", "0:0:0:0:0:0:0:1", "1:2:3:4:5:6:7:8"].map(( host ) => net.isAddress(host))).toEqual([true, true, true, true, true, true, true]);
        expect(["1.2.3", "1.2.3.4.5", "256.1.1.1", "01.2.3.4", "1.2.3.4:80", "a.io", "localhost", ":::", "1::2::3", "1:2:3:4:5:6:7:8:9", "::ffff:1.2.3", "12345::", "1:2:3:4:5:6:7:1.2.3.4", "", ":", "1:", ":1", "::g"].map(( host ) => net.isAddress(host))).toEqual(Array.from({ length: 18 }, () => false));

    });
    it("guarded calls follow redirects inside the policy, switch to GET on 303 and old 301/302 posts, strip secrets across origins, and stop at the hop limit", async () => {

        const seen: string[] = [];
        const fetcher: net.Fetcher = async ( url, init ) => {

            seen.push(`${init.method} ${url} ${init.redirect ?? "-"} ${Object.keys(init.headers).sort().join(",")} ${init.body === undefined ? "-" : "body"}`);

            if ( url.endsWith("/a") ) return new Response(null, { status: 303, headers: { location: "/b" } });
            if ( url.endsWith("/b") ) return new Response(null, { status: 307, headers: { location: "https://other.example/c" } });
            if ( url.endsWith("/c") ) return new Response("done", { status: 200 });
            if ( url.endsWith("/old") ) return new Response(null, { status: 302, headers: { location: "/c" } });
            if ( url.endsWith("/keep") ) return new Response(null, { status: 308, headers: { location: "/c" } });
            if ( url.endsWith("/loop") ) return new Response(null, { status: 302, headers: { location: "/loop" } });
            if ( url.endsWith("/away") ) return new Response(null, { status: 302, headers: { location: "https://evil.test/" } });
            if ( url.endsWith("/broken") ) return new Response(null, { status: 302, headers: { location: "http://[::1" } });
            if ( url.endsWith("/opaque") ) return { status: 0, type: "opaqueredirect", url: "", headers: new Headers(), body: null } as unknown as Response;
            if ( url.endsWith("/landed") ) return { status: 200, type: "basic", url: "https://evil.test/landed", headers: new Headers(), body: null, text: async () => "elsewhere" } as unknown as Response;

            return new Response("plain");

        };
        const allow = net.policy({ origins: ["https://api.example", "https://*.example"] });
        const guarded = net.guarded(fetcher, allow, 3);
        const init = { method: "POST", headers: { authorization: "t", cookie: "c", "content-type": "x", "content-length": "7", "x-keep": "1" }, body: "payload", signal: new AbortController().signal };

        expect(await (await guarded("https://api.example/a", init)).text()).toBe("done");
        expect(seen).toEqual(["POST https://api.example/a manual authorization,content-length,content-type,cookie,x-keep body", "GET https://api.example/b manual authorization,cookie,x-keep -", "GET https://other.example/c manual x-keep -"]);
        seen.length = 0;
        await guarded("https://api.example/old", init);
        await guarded("https://api.example/keep", init);
        await guarded("https://api.example/old", { ...init, method: "PUT" });
        expect(seen.map(( line ) => line.split(" ").slice(0, 2).join(" ").concat(line.endsWith("body") ? " body" : ""))).toEqual(["POST https://api.example/old body", "GET https://api.example/c", "POST https://api.example/keep body", "POST https://api.example/c body", "PUT https://api.example/old body", "PUT https://api.example/c body"]);
        seen.length = 0;
        expect([await guarded("https://api.example/loop", { ...init, method: "GET", body: undefined }).then(() => "followed", told), seen.length]).toEqual(["forbidden/net.redirect", 4]);
        expect(await guarded("https://api.example/away", init).then(() => "followed", told)).toBe("forbidden/net.redirect");
        expect(await guarded("https://api.example/broken", init).then(() => "followed", told)).toBe("forbidden/net.redirect");
        expect(await guarded("https://evil.test/x", init).then(() => "called", told)).toBe("forbidden/net.origin");
        expect(await guarded("https://api.example/opaque", init).then(() => "returned", told)).toBe("forbidden/net.redirect");
        expect((await guarded("https://api.example/opaque", { ...init, redirect: "manual" })).type).toBe("opaqueredirect");
        expect((await guarded("https://api.example/a", { ...init, redirect: "manual" })).status).toBe(303);
        expect(await guarded("https://api.example/landed", init).then(() => "returned", told)).toBe("forbidden/net.redirect");
        expect([allow("https://x.example/"), allow("https://example/"), allow("https://x.y.example:8443/"), allow("http://x.example/"), allow("https://api.example:443/"), allow("https://API.example/path?q#h"), allow(""), allow("nope")]).toEqual([true, false, false, false, true, true, false, false]);

        for ( const origin of ["https://a.example/x", "https://a.example?x", "https://u@a.example", "https://*", "file:///x", "https://a.*.example", "https://a.example#h", "not an origin", ""] ) expect([origin, told(() => net.policy({ origins: [origin] }))]).toEqual([origin, "RangeError: not an origin"]);

        expect(told(() => net.policy({ origins: ["https://a.example/", "https://*.b.example", "http://localhost:3000"] }))).toBe("ok");
        expect([net.policy({ origins: [], allowLoopback: true })("http://127.0.0.1:9/x"), net.policy({ origins: [], allowLoopback: true })("https://[::1]/"), net.policy({ origins: [], allowLoopback: true })("ws://localhost/"), net.policy({ origins: [] })("http://localhost/")]).toEqual([true, true, false, false]);

    });
    it("request encodes every body kind, refuses what the wire cannot carry, reads replies by their claims, and retries writes only when told", async () => {

        const fetcher: net.Fetcher = async ( url, init ) => {

            if ( url.endsWith("/echo") ) return reply({ method: init.method, body: init.body instanceof Uint8Array ? [...init.body] : init.body instanceof FormData ? "form" : init.body instanceof Blob ? "blob" : init.body, type: init.headers["content-type"] ?? null, accept: init.headers.accept });
            if ( url.endsWith("/nojson") ) return new Response("<html>", { status: 200, headers: { "content-type": "application/json" } });
            if ( url.endsWith("/empty") ) return new Response("", { status: 200, headers: { "content-type": "application/json" } });
            if ( url.endsWith("/bytes") ) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/octet-stream" } });
            if ( url.endsWith("/badhtml") ) return new Response("<h1>oops</h1>", { status: 500, headers: { "content-type": "text/html" } });
            if ( url.endsWith("/badjson") ) return new Response("{broken", { status: 503, headers: { "content-type": "application/json" } });
            if ( url.endsWith("/envelope") ) return reply({ code: "forbidden", message: "nope", reason: "doors", meta: { request_id: "srv-9" } }, 403);
            if ( url.endsWith("/slowbody") ) return new Response(new ReadableStream({ start () { return undefined; } }), { status: 200 });
            if ( url.endsWith("/head") ) return new Response("ignored", { status: 200, headers: { "content-type": "application/json" } });

            return new Response("x", { headers: { "X-Mixed": "Case" } });

        };
        const ask = ( path: string, options: net.RequestOptions = {} ): Promise<string> => net.request(`https://a.example/${path}`, { fetcher, ...options }).then(( out ) => JSON.stringify(out.body ?? out.text), told);

        expect(await ask("echo", { method: "POST", body: new URLSearchParams({ a: "1" }) })).toBe('{"method":"POST","body":"a=1","type":"application/x-www-form-urlencoded;charset=UTF-8","accept":"application/json"}');
        expect(await ask("echo", { method: "PUT", body: new Uint8Array([9]).buffer })).toBe('{"method":"PUT","body":[9],"type":null,"accept":"application/json"}');
        expect(await ask("echo", { method: "PATCH", body: new DataView(new Uint8Array([7, 8]).buffer, 1) })).toBe('{"method":"PATCH","body":[8],"type":null,"accept":"application/json"}');
        expect(await ask("echo", { method: "POST", body: 5 })).toBe('{"method":"POST","body":"5","type":"application/json","accept":"application/json"}');
        expect(await ask("echo", { method: "POST", body: "raw", headers: { "content-type": "text/plain" } })).toBe('{"method":"POST","body":"raw","type":"text/plain","accept":"application/json"}');
        expect(await ask("echo", { method: "POST", body: new FormData() })).toBe('{"method":"POST","body":"form","type":null,"accept":"application/json"}');
        expect(await ask("echo", { method: "POST", body: new Blob(["b"]) })).toBe('{"method":"POST","body":"blob","type":null,"accept":"application/json"}');
        expect(await ask("echo", { method: "DELETE", as: "text" })).toBe('"{\\"method\\":\\"DELETE\\",\\"type\\":null,\\"accept\\":\\"*/*\\"}"');
        expect([await ask("echo", { method: "POST", body: () => 1 }), await ask("echo", { method: "POST", body: Symbol("s") }), await ask("echo", { method: "POST", body: new ReadableStream() }), await ask("echo", { method: "GET", body: "x" }), await ask("echo", { method: "HEAD", body: {} })]).toEqual(["internal/net.body", "internal/net.body", "internal/net.body", "internal/net.body", "internal/net.body"]);
        expect([await ask("nojson"), await ask("empty"), await ask("empty", { as: "json" }), await ask("bytes", { as: "bytes" }), await ask("bytes"), await ask("badhtml"), await ask("badjson"), await ask("envelope"), await ask("slowbody", { timeout: 20 }), await ask("head", { method: "HEAD" })]).toEqual(["internal/net.json", '""', '""', '{"0":1,"1":2,"2":3}', '"\\u0001\\u0002\\u0003"', "internal/undefined", "unavailable/undefined", "forbidden/doors", "timeout/net.timeout", '""']);

        const failed = await net.request("https://a.example/envelope", { fetcher, requestId: "mine" }).catch(( caught: unknown ) => caught);

        expect(error.is(failed) ? [failed.status, failed.requestId, failed.message] : []).toEqual([403, "srv-9", "nope"]);

        const custom = await net.request("https://a.example/badhtml", { fetcher, failure: ( status, body ) => error.fault("conflict", "custom", { status, message: String(body).slice(0, 4) }) }).catch(( caught: unknown ) => caught);

        expect(error.is(custom) ? [custom.code, custom.reason, custom.message, custom.requestId !== undefined] : []).toEqual(["conflict", "custom", "<h1>", true]);
        expect((await net.request("https://a.example/plain", { fetcher })).headers).toEqual({ "x-mixed": "Case" });
        expect(Object.getPrototypeOf((await net.request("https://a.example/plain", { fetcher })).headers)).toBeNull();
        expect([await ask("x", { fetcher: undefined, method: "GET" }).then(() => "sent").catch(() => "x"), await ask("echo", { requestId: "bad\nid" }), await ask("echo", { headers: { "bad name": "v" } }), await ask("echo", { headers: { ok: "line\r\nbreak" } }), await ask("echo", { headers: { ok: "tab\tis fine" } }).then(( out ) => out.slice(0, 1))]).toEqual(["sent", "internal/net.header", "internal/net.header", "internal/net.header", "{"]);
        expect([await net.request("javascript:alert(1)", { fetcher }).then(() => "sent", told), await net.request("FILE:///etc/passwd", { fetcher }).then(() => "sent", told), await net.request("ftp://a.example/", { fetcher }).then(() => "sent", told), await net.request("https://a.example/x\u0000", { fetcher }).then(() => "sent", told), await net.request(" https://a.example/", { fetcher }).then(() => "sent", told), await net.request("/relative", { fetcher }).then(() => "sent", told), await net.request("a.example/no-scheme", { fetcher }).then(() => "sent", told)]).toEqual(["forbidden/net.scheme", "forbidden/net.scheme", "forbidden/net.scheme", "internal/net.address", "internal/net.address", "sent", "sent"]);

        let writes = 0;
        const flaky: net.Fetcher = async () => {

            writes += 1;

            return new Response("", { status: 503 });

        };

        await net.request("https://a.example/w", { method: "POST", body: {}, retries: 2, fetcher: flaky }).catch(() => undefined);
        expect(writes).toBe(1);
        writes = 0;
        await net.request("https://a.example/w", { method: "POST", body: {}, retries: 2, fetcher: flaky, idempotent: true }).catch(() => undefined);
        expect(writes).toBe(3);
        writes = 0;
        await net.request("https://a.example/w", { retries: 2, fetcher: flaky, idempotent: false }).catch(() => undefined);
        expect(writes).toBe(1);
        writes = 0;
        await net.request("https://a.example/w", { retries: 2.9, fetcher: flaky }).catch(() => undefined);
        expect(writes).toBe(3);

        const controller = new AbortController();
        const hanging = net.request("https://a.example/x", { fetcher: () => new Promise(() => undefined), signal: controller.signal });

        controller.abort(new Error("leaving"));
        expect(await hanging.then(() => "sent", told)).toBe("timeout/net.aborted");

    });
    it("header helpers: forwarded chains, retry-after forms, csp and security headers, and request facts from a hostile edge", () => {

        expect([net.forwardedFor("203.0.113.9, 10.0.0.1"), net.forwardedFor("10.0.0.1, 203.0.113.9"), net.forwardedFor("203.0.113.9:8080, [2001:db8::1]:443"), net.forwardedFor("unknown, 203.0.113.9"), net.forwardedFor("10.0.0.1, 192.168.1.1"), net.forwardedFor("2001:DB8:0:0:0:0:0:1"), net.forwardedFor("::FFFF:1.2.3.4"), net.forwardedFor(" 8.8.8.8 ,junk"), net.forwardedFor("junk")]).toEqual(["203.0.113.9", "203.0.113.9", "2001:db8::1", "203.0.113.9", "10.0.0.1", "2001:db8::1", "1.2.3.4", "8.8.8.8", undefined]);
        expect([net.forwardedFor("203.0.113.9, 198.51.100.7", 1), net.forwardedFor("203.0.113.9, 198.51.100.7", 2), net.forwardedFor("203.0.113.9", 5), net.forwardedFor("203.0.113.9, 10.0.0.1", 1), net.forwardedFor("203.0.113.9", 0), net.forwardedFor("203.0.113.9", 1.5), net.forwardedFor("x".repeat(3000)), net.forwardedFor(null), net.forwardedFor(undefined), net.forwardedFor("")]).toEqual(["198.51.100.7", "203.0.113.9", undefined, "10.0.0.1", undefined, undefined, undefined, undefined, undefined, undefined]);
        expect([net.retryAfter("0"), net.retryAfter("120"), net.retryAfter(" 7 "), net.retryAfter("1234567890"), net.retryAfter("9999999999999999"), net.retryAfter("-1"), net.retryAfter("7.5"), net.retryAfter("x"), net.retryAfter(""), net.retryAfter(null), net.retryAfter("x".repeat(70))]).toEqual([0, 120, 7, 1234567890, undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
        expect([net.retryAfter("Wed, 21 Oct 2015 07:28:00 GMT", Date.UTC(2015, 9, 21, 7, 27, 30)), net.retryAfter("Wed, 21 Oct 2015 07:28:00 GMT", Date.UTC(2015, 9, 21, 7, 28, 30)), net.retryAfter("2015-10-21T07:28:00Z", Date.UTC(2015, 9, 21, 7, 27, 0)), net.retryAfter("2015-10-21T07:28:00.400Z", Date.UTC(2015, 9, 21, 7, 27, 59, 900))]).toEqual([30, 0, 60, 1]);

        for ( const name of ["default src", "default-src;", "x/y", "", "1x", "default-src\n"] ) expect([name, told(() => net.contentSecurityPolicy({ [name]: ["'self'"] }))]).toEqual([name, "RangeError: not a directive"]);
        for ( const source of ["a;b", "a,b", "a b", "", "a\nb", "a\u0001"] ) expect([source, told(() => net.contentSecurityPolicy({ "img-src": [source] }))]).toEqual([source, "RangeError: not a source"]);

        expect(net.contentSecurityPolicy({ "img-src": [], sandbox: true, "x-off": false, "y-off": undefined, "script-src": "'self' https://cdn.example  'nonce-abc'" })).toBe("img-src 'none'; sandbox; script-src 'self' https://cdn.example 'nonce-abc'");
        expect(net.contentSecurityPolicy({})).toBe("");
        expect([told(() => net.securityHeaders({ hsts: { maxAge: -1 } })), told(() => net.securityHeaders({ hsts: { maxAge: 1.5 } })), told(() => net.securityHeaders({ referrer: "a\nb" })), told(() => net.securityHeaders({ permissions: "x\u007f" }))]).toEqual(["RangeError: not a duration", "RangeError: not a duration", "RangeError: not a header", "RangeError: not a header"]);
        expect(net.securityHeaders({ hsts: { maxAge: 0, subdomains: false, preload: true } })["strict-transport-security"]).toBe("max-age=0; preload");
        expect(net.securityHeaders()["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
        expect(net.securityHeaders({ hsts: true })["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
        expect(Object.keys(net.securityHeaders({ csp: { "default-src": "'self'" }, reportOnly: true })).sort()).toEqual(["content-security-policy-report-only", "cross-origin-opener-policy", "permissions-policy", "referrer-policy", "strict-transport-security", "x-content-type-options", "x-frame-options"]);
        expect(net.facts({ "user-agent": "bad\u0001agent", "accept-language": "x", referer: "javascript:1", "x-request-id": "a b", "x-forwarded-proto": "HTTPS, http" })).toEqual({ ip: undefined, agent: "", language: undefined, referer: undefined, requestId: undefined, secure: true, mobile: false, bot: false });
        expect(net.facts({ "user-agent": "x".repeat(300), "accept-language": "en-US,en;q=0.9", referer: "https://ok.example/path?q", "x-request-id": "req_1.2:3-4", "x-forwarded-proto": "http" })).toMatchObject({ agent: "x".repeat(256), language: "en-US", referer: "https://ok.example/path?q", requestId: "req_1.2:3-4", secure: false });
        expect([net.facts({ "x-forwarded-for": "10.0.0.1", "x-real-ip": "203.0.113.5" }, "9.9.9.9").ip, net.facts({ "x-forwarded-for": "junk", "x-real-ip": "203.0.113.5" }, "9.9.9.9").ip, net.facts({ "x-forwarded-for": "203.0.113.9" }, "9.9.9.9", 0).ip, net.facts({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }, "9.9.9.9", 2).ip, net.facts({}, "9.9.9.9").ip, net.facts({}).ip, net.facts({ referer: "ftp://x.example/", "x-request-id": "x".repeat(200) }).requestId]).toEqual(["10.0.0.1", "203.0.113.5", "9.9.9.9", "203.0.113.9", "9.9.9.9", undefined, undefined]);
        expect(net.facts(new Headers({ "User-Agent": "Mozilla/5.0 HeadlessChrome", "Accept-Language": "ar" })).bot).toBe(true);
        expect(net.facts({ "user-agent": undefined, "accept-language": "pt-BR" }).language).toBe("pt-BR");

    });
    it("event streams reconnect with the last id and the server's retry, honour 204, refuse non-streams, idle out and cap events", async () => {

        const streamed = ( ...chunks: string[] ): ReadableStream<Uint8Array> => new ReadableStream({ start ( controller ) {

            for ( const chunk of chunks ) controller.enqueue(new TextEncoder().encode(chunk));

            controller.close();

        } });
        const sse = ( ...chunks: string[] ): Response => new Response(streamed(...chunks), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
        const collect = async ( options: net.EventsOptions ): Promise<string[] | string> => {

            const seen: string[] = [];

            try {

                for await ( const one of net.events("https://a.example/sse", options) ) seen.push(`${one.id ?? "-"}|${one.event}|${one.data}`);

                return seen;

            } catch ( caught ) {

                return `${seen.join(",")} ${told(caught)}`;

            }

        };
        let calls = 0;
        const asked: string[] = [];
        const fetcher: net.Fetcher = async ( _, init ) => {

            calls += 1;
            asked.push(init.headers["last-event-id"] ?? "-");

            if ( calls === 1 ) return sse("id: 7\ndata: one\n\nretry: 10\nid: 8\nevent: tick\ndata: {\"n\":1}\ndata: more\n\n", "id: 9\ndata: half");
            if ( calls === 2 ) return sse("data: back\n\n");

            return new Response(null, { status: 204 });

        };

        expect(await collect({ fetcher, reconnect: 5, lastId: "0" })).toEqual(["7|message|one", "8|tick|{\"n\":1}\nmore", "-|message|back"]);
        expect([calls, asked]).toEqual([3, ["0", "8", "8"]]);
        expect(await collect({ fetcher: async () => sse("data: once\n\n") })).toEqual(["-|message|once"]);
        expect(await collect({ fetcher: async () => new Response("x", { status: 200, headers: { "content-type": "text/html" } }) })).toBe(" internal/net.stream");
        expect(await collect({ fetcher: async () => new Response(JSON.stringify({ code: "unauthorized", message: "no", reason: "session" }), { status: 401, headers: { "content-type": "application/json" } }) })).toBe(" unauthorized/session");
        expect(await collect({ fetcher: async () => new Response("", { status: 500 }), reconnect: 2, retry: 1 })).toBe(" internal/net.events");
        expect(await collect({ fetcher: async () => sse(`data: ${"x".repeat(50)}\n\n`), maxBytes: 10 })).toBe(" too_large/net.event");
        expect(await collect({ fetcher: async () => new Response(new ReadableStream({ start () { return undefined; } }), { status: 200 }), idle: 20 })).toBe(" timeout/net.idle");
        expect(await collect({ fetcher: async () => { throw new TypeError("down"); }, reconnect: 1, retry: 1 })).toBe(" network/net.unreachable");
        expect(await collect({ fetcher: async () => new Response(null, { status: 200 }) })).toBe(" unavailable/net.refused");
        expect(await collect({ fetcher: async () => new Response("", { status: 429, headers: { "retry-after": "0" } }), reconnect: 1, retry: 1 })).toBe(" too_many_requests/net.events");

        const controller = new AbortController();
        const aborted = collect({ fetcher: async () => new Response(new ReadableStream({ start () { return undefined; } }), { status: 200 }), signal: controller.signal });

        controller.abort(new Error("leaving"));
        expect(await aborted).toBe(" timeout/net.aborted");
        expect(await collect({ fetcher: async () => sse(""), signal: AbortSignal.abort() })).toBe(" timeout/net.aborted");
        expect(await Promise.all([net.events("https://a.example/sse", { idle: Number.NaN }).next().then(() => "ok", told), net.events("https://a.example/sse", { retry: Number.NaN }).next().then(() => "ok", told), net.events("https://a.example/sse", { maxBytes: Number.NaN }).next().then(() => "ok", told), net.events("https://a.example/sse", { reconnect: Number.NaN }).next().then(() => "ok", told), net.events("javascript:x").next().then(() => "ok", told)])).toEqual(["RangeError: not a duration", "RangeError: not a duration", "RangeError: not a size", "RangeError: not a count", "forbidden/net.scheme"]);
        expect(net.parseEvents("data: a\r\ndata: b\r\n\r\nid: 9\n\ndata:x\n\n")).toEqual([{ id: undefined, event: "message", data: "a\nb", json: undefined }, { id: undefined, event: "message", data: "x", json: undefined }]);
        expect([net.parseEvents("﻿data: bom\n\n")[0]?.data, net.parseEvents("data: tail"), net.parseEvents("data: tail\n"), net.parseEvents("event: ping\n\n"), net.parseEvents("id: a\u0000b\ndata: z\n\n")[0]?.id, net.parseEvents(": only a comment\n\n"), net.parseEvents("data\n\n")[0]?.data, net.parseEvents("data:  two spaces\n\n")[0]?.data, net.parseEvents("")]).toEqual(["bom", [], [], [], undefined, [], "", " two spaces", []]);
        expect(net.parseEvents("data: 1\rdata: 2\r\r")).toEqual([{ id: undefined, event: "message", data: "1\n2", json: undefined }]);

    });
    it("poll paces by a number or a function, stops on until, times out, aborts and runs out of attempts", async () => {

        let turns = 0;
        const controller = new AbortController();

        setTimeout(() => controller.abort(new Error("leaving")), 15);
        expect(await net.poll(async () => { turns += 1; return turns; }, { every: ( attempt ) => attempt * 2, until: ( value ) => value >= 3 })).toBe(3);
        expect([await net.poll(async () => 1, { every: 5, until: () => false, timeout: 12 }).then(() => "done", told), await net.poll(async () => 1, { every: 50, until: () => false, signal: controller.signal }).then(() => "done", told), await net.poll(async () => 1, { every: 1, until: () => false, limit: 0 }).then(() => "done", told), await net.poll(async () => 1, { every: 1, until: () => false, limit: 2 }).then(() => "done", told), await net.poll(() => { throw new Error("work broke"); }).then(() => "done", told), await net.poll(async () => 1, { every: Number.NaN }).then(() => "done", told), await net.poll(async () => 1, { limit: Number.NaN }).then(() => "done", told), await net.poll(async () => 1, { signal: AbortSignal.abort() }).then(() => "done", told)]).toEqual(["timeout/net.timeout", "timeout/net.aborted", "timeout/net.exhausted", "timeout/net.exhausted", "Error: work broke", "RangeError: not a duration", "RangeError: not a count", "timeout/net.aborted"]);

        const signals: boolean[] = [];

        expect(await net.poll(( attempt, signal ) => {

            signals.push(signal.aborted);

            return attempt;

        }, { every: 0, until: ( value ) => value === 2 })).toBe(2);
        expect(signals).toEqual([false, false]);
        expect(await net.poll(() => 7)).toBe(7);

    });
    it("readBytes trusts a declared length only to refuse early, and signals time out and combine", async () => {

        expect([await net.readBytes(new Response("abc", { headers: { "content-length": "999999999" } }), 10).then(() => "read", told), [...(await net.readBytes(new Response("abc", { headers: { "content-length": "nope" } }), 10))], await net.readBytes(new Response("abc"), Number.NaN).then(() => "read", told), await net.readBytes({ arrayBuffer: async () => new Uint8Array(20).buffer }, 10).then(() => "read", told), (await net.readBytes({ arrayBuffer: async () => new Uint8Array(3).buffer }, 10)).length]).toEqual(["too_large/net.body", [97, 98, 99], "RangeError: not a size", "too_large/net.body", 3]);

        const chunked = new ReadableStream<Uint8Array>({ start ( controller ) {

            controller.enqueue(new Uint8Array([1, 2]));
            controller.enqueue(new Uint8Array([3]));
            controller.close();

        } });

        expect([...(await net.readBytes(new Response(chunked), 10))]).toEqual([1, 2, 3]);

        const controller = new AbortController();
        const hanging = net.readBytes(new Response(new ReadableStream({ start () { return undefined; } })), 10, controller.signal);

        controller.abort(new Error("leaving"));
        expect(await hanging.then(() => "read", told)).toBe("timeout/event.aborted");
        expect([told(() => net.timeoutSignal(Number.NaN)), net.timeoutSignal(Number.POSITIVE_INFINITY).aborted, net.timeoutSignal(-5).aborted]).toEqual(["RangeError: not a duration", false, false]);
        expect(net.anySignal().aborted).toBe(false);
        expect(net.anySignal(AbortSignal.abort(), undefined).aborted).toBe(true);
        expect([net.joinUrl("https://a.io/base/", "x", "y/z"), net.joinUrl("https://a.io/base?q=1#h", "/p/"), net.joinUrl("", "a"), net.joinUrl("/", ""), told(() => net.joinUrl("https://a.io", "..")), told(() => net.joinUrl("https://a.io", "a/./b")), told(() => net.joinUrl("https://a.io", "a\\b")), net.joinUrl("https://a.io", "a.b", "c..d")]).toEqual(["https://a.io/base/x/y/z", "https://a.io/base/p?q=1#h", "/a", "", "RangeError: not a path segment", "RangeError: not a path segment", "RangeError: not a path segment", "https://a.io/a.b/c..d"]);
        expect([net.withQuery("/x", { a: undefined, b: null, c: ["1", "2"], __proto__: "p" } as unknown as Parameters<typeof net.withQuery>[1]), net.withQuery("/x?a=1&a=2", { a: "3" }), net.withQuery("/x?keep=1", {}), net.stripQuery("https://a.io/p?x#y"), net.stripQuery("plain")]).toEqual(["/x?c=1&c=2", "/x?a=3", "/x?keep=1", "https://a.io/p", "plain"]);
        expect([net.isOrigin("HTTPS://A.IO"), net.isOrigin("https://a.io:443"), net.isOrigin("https://a.io:8443"), net.originOf("blob:https://a.io/x"), net.originOf("x"), net.hostname("https://[2001:DB8::1]/")]).toEqual([true, false, true, "https://a.io", undefined, "[2001:db8::1]"]);

    });
    it("survivors: nine-word gaps, long and unspeakable names, scheme letters, unsafe query keys, 303 verbs, hop counts, capped waits, comment lines and server retry", async () => {

        expect([net.isAddress("1:2:3:4:5:6:7:8::"), net.isAddress("::1:2:3:4:5:6:7:8"), net.isAddress("1:2:3:4:5:6:7::8"), net.isAddress("1::2:3:4:5:6:7:8"), net.isAddress("1:2:3:4:5:6:7:8")]).toEqual([false, false, false, false, true]);
        expect([net.isPrivateAddress(`${"a.".repeat(130)}b`), net.isPrivateAddress(`${"a.".repeat(100)}b`), net.isPrivateAddress("xn--.example"), net.isPrivateAddress("xn--mgbh0fb.xn--kgbechtv"), net.isPrivateAddress("ÄÖ.example"), net.isPrivateAddress("a..b"), net.isPrivateAddress("a-.b")]).toEqual([true, false, true, false, false, true, false]);

        const seen: string[] = [];
        const fetcher: net.Fetcher = async ( url, init ) => {

            seen.push(`${init.method} ${url}`);

            if ( url.endsWith("/a") ) return new Response(null, { status: 303, headers: { location: "/c" } });

            return new Response("x");

        };

        expect([await net.request("ht tp://x", { fetcher }).then(() => "sent", told), await net.request("1http://x", { fetcher }).then(() => "sent", told), await net.request("h-t.t+p://x", { fetcher }).then(() => "sent", told), await net.request("http:relative", { fetcher }).then(() => "sent", told)]).toEqual(["sent", "sent", "forbidden/net.scheme", "sent"]);
        expect([net.withQuery("/x", JSON.parse('{"__proto__":"p","constructor":"c","ok":"1"}') as Record<string, string>), net.withQuery("/x?a=1", JSON.parse('{"__proto__":"p"}') as Record<string, string>)]).toEqual(["/x?ok=1", "/x?a=1"]);

        const guarded = net.guarded(fetcher, () => true);

        seen.length = 0;
        await guarded("https://api.example/a", { method: "PUT", headers: {}, body: "payload", signal: new AbortController().signal });
        await guarded("https://api.example/a", { method: "HEAD", headers: {}, signal: new AbortController().signal });
        expect(seen).toEqual(["PUT https://api.example/a", "GET https://api.example/c", "HEAD https://api.example/a", "HEAD https://api.example/c"]);
        for ( const piece of ["%2e%2e", "%2E%2E", ".%2e", "%2e.", "%2e", "a/%2e%2e/b", "%2e%2e/admin", "..", ".", "a/../b"] ) expect([piece, told(() => net.joinUrl("https://a.io/v1/users", piece))]).toEqual([piece, "RangeError: not a path segment"]);

        expect([net.joinUrl("https://a.io/v1", "%252e%252e"), new URL(net.joinUrl("https://a.io/v1", "%252e%252e")).pathname, net.joinUrl("https://a.io/v1", "a.b", "%2ex", "x%2e")]).toEqual(["https://a.io/v1/%252e%252e", "/v1/%252e%252e", "https://a.io/v1/a.b/%2ex/x%2e"]);
        expect([net.forwardedFor("203.0.113.9, 10.0.0.1", 0), net.forwardedFor("203.0.113.9, 10.0.0.1", -1), net.forwardedFor("203.0.113.9, 10.0.0.1", 1.5), net.forwardedFor("203.0.113.9, 10.0.0.1", 3)]).toEqual([undefined, undefined, undefined, undefined]);
        expect([net.retryAfter("99999999999"), net.retryAfter("2147483648"), net.retryAfter("2147483647")]).toEqual([2_147_483_647, 2_147_483_647, 2_147_483_647]);
        expect(net.facts({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.5" }, "9.9.9.9", 0).ip).toBe("9.9.9.9");
        expect(net.facts({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.5" }, "9.9.9.9").ip).toBe("203.0.113.9");

        const streamed = ( text: string ): Response => new Response(new ReadableStream<Uint8Array>({ start ( controller ) {

            controller.enqueue(new TextEncoder().encode(text));
            controller.close();

        } }), { status: 200, headers: { "content-type": "text/event-stream" } });
        const commented: string[] = [];

        for await ( const one of net.events("https://a.example/sse", { fetcher: async () => streamed(`: ${"x".repeat(50)}\ndata: a\n\n`), maxBytes: 10 }) ) commented.push(one.data);

        expect(commented).toEqual(["a"]);

        let calls = 0;
        const quick: net.Fetcher = async () => {

            calls += 1;

            return calls === 1 ? streamed("retry: 5\ndata: first\n\n") : new Response(null, { status: 204 });

        };
        const started = Date.now();
        const heard: string[] = [];

        for await ( const one of net.events("https://a.example/sse", { fetcher: quick, reconnect: 1, retry: 4000 }) ) heard.push(one.data);

        expect([heard, calls, Date.now() - started < 1000]).toEqual([["first"], 2, true]);

    });
});
