import * as net from "engine/net";
import { bench, do_not_optimize, run } from "mitata";

const fetcher: net.Fetcher = async () => new Response('{"data":{"ok":true}}', { status: 200, headers: { "content-type": "application/json" } });
const text: net.Fetcher = async () => new Response("plain", { status: 200, headers: { "content-type": "text/plain" } });
const failing: net.Fetcher = async () => new Response('{"code":"validation","message":"bad","errors":{"email":["taken"]}}', { status: 422, headers: { "content-type": "application/json", "retry-after": "3" } });
const redirecting: net.Fetcher = async ( url ) => (url.endsWith("/go") ? new Response(null, { status: 302, headers: { location: "/landed" } }) : new Response("ok"));
const allow = net.policy({ origins: ["https://api.example", "https://*.cdn.example"] });
const guarded = net.guarded(redirecting, allow);
const headers = { "user-agent": "Mozilla/5.0 (iPhone) Mobile Safari", "accept-language": "ar-EG,ar;q=0.9", "x-forwarded-for": "203.0.113.9, 10.0.0.1", referer: "https://ok.example/path", "x-request-id": "req-1" };
const stream = "id: 1\nevent: tick\ndata: {\"n\":1}\n\ndata: a\ndata: b\n\n".repeat(200);
const signal = new AbortController().signal;

bench("net.parseUrl", () => do_not_optimize(net.parseUrl("https://a.io:8443/p/q?x=1&x=2#h")));
bench("net.joinUrl", () => do_not_optimize(net.joinUrl("https://a.io/v1/", "users", "42", "orders")));
bench("net.withQuery", () => do_not_optimize(net.withQuery("/x?a=1", { b: 2, c: "3" })));
bench("net.isPrivateAddress name", () => do_not_optimize(net.isPrivateAddress("fcm.googleapis.com")));
bench("net.isPrivateAddress v4 public", () => do_not_optimize(net.isPrivateAddress("203.0.113.9")));
bench("net.isPrivateAddress v4 private", () => do_not_optimize(net.isPrivateAddress("10.0.0.1")));
bench("net.isPrivateAddress v6", () => do_not_optimize(net.isPrivateAddress("2001:db8::1")));
bench("net.isPrivateAddress mapped", () => do_not_optimize(net.isPrivateAddress("::ffff:10.0.0.1")));
bench("net.isPrivateAddress odd form", () => do_not_optimize(net.isPrivateAddress("0x7f.1")));
bench("net.isLoopback", () => do_not_optimize(net.isLoopback("localhost")));
bench("net.forwardedFor 1 hop", () => do_not_optimize(net.forwardedFor("203.0.113.9")));
bench("net.forwardedFor 3 hops", () => do_not_optimize(net.forwardedFor("203.0.113.9, 10.0.0.1, [2001:db8::1]:443")));
bench("net.retryAfter seconds", () => do_not_optimize(net.retryAfter("120")));
bench("net.retryAfter date", () => do_not_optimize(net.retryAfter("Wed, 21 Oct 2015 07:28:00 GMT", 1_445_412_450_000)));
bench("net.contentSecurityPolicy", () => do_not_optimize(net.contentSecurityPolicy({ "default-src": ["'self'"], "img-src": "* data:", "script-src": ["'self'", "https://cdn.example"], "upgrade-insecure-requests": true })));
bench("net.securityHeaders", () => do_not_optimize(net.securityHeaders({ csp: { "default-src": "'self'" } })));
bench("net.facts", () => do_not_optimize(net.facts(headers)));
bench("net.policy build", () => do_not_optimize(net.policy({ origins: ["https://api.example", "https://*.cdn.example"] })));
bench("net.policy check", () => do_not_optimize(allow("https://x.cdn.example/path")));
bench("net.request json", async () => do_not_optimize(await net.request("https://a.io/ok", { fetcher })));
bench("net.request text", async () => do_not_optimize(await net.request("https://a.io/ok", { fetcher: text })));
bench("net.request post json", async () => do_not_optimize(await net.request("https://a.io/ok", { fetcher, method: "POST", body: { a: 1, b: [1, 2, 3] } })));
bench("net.request failure envelope", async () => do_not_optimize(await net.request("https://a.io/ok", { fetcher: failing }).catch(( fault: unknown ) => fault)));
bench("net.guarded redirect", async () => do_not_optimize(await guarded("https://api.example/go", { method: "GET", headers: {}, signal })));
bench("net.readBytes 64k", async () => do_not_optimize(await net.readBytes(new Response(new Uint8Array(65_536)), 1_000_000)));
bench("net.parseEvents 200 blocks", () => do_not_optimize(net.parseEvents(stream)));
bench("net.events stream 200 blocks", async () => {

    let count = 0;

    for await ( const _ of net.events("https://a.io/sse", { fetcher: async () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }) }) ) count += 1;

    do_not_optimize(count);

});
bench("net.poll 3 attempts", async () => {

    let turn = 0;

    do_not_optimize(await net.poll(() => { turn += 1; return turn; }, { every: 0, until: ( value ) => value >= 3 }));

});
bench("net.timeoutSignal", () => do_not_optimize(net.timeoutSignal(1_000_000)));
bench("net.anySignal", () => do_not_optimize(net.anySignal(signal, undefined)));

await run();
