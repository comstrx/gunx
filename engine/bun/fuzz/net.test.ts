import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as net from "engine/net";
import * as fc from "fast-check";

type Status = { code: number; body: string; type: string | undefined; retry: string | undefined };

const runs = 4000;
const byte = fc.integer({ min: 0, max: 255 });
const word = fc.integer({ min: 0, max: 0xffff });
const v4 = fc.tuple(byte, byte, byte, byte).map(( parts ) => parts.join("."));
const v6 = fc.array(word, { minLength: 8, maxLength: 8 }).map(( words ) => words.map(( one ) => one.toString(16)).join(":"));
const gapped = fc.tuple(fc.array(word, { maxLength: 3 }), fc.array(word, { maxLength: 3 })).map(([head, tail]) => `${head.map(( one ) => one.toString(16)).join(":")}::${tail.map(( one ) => one.toString(16)).join(":")}`);
const mapped = v4.map(( quad ) => `::ffff:${quad}`);
const junk = fc.oneof(fc.string({ maxLength: 20 }), fc.stringMatching(/^[0-9a-f:.]{0,40}$/), fc.constantFrom("1.2.3", "1.2.3.4.5", "256.1.1.1", ":::", "1::2::3", "::g", "[::1", "::1]", "0x7f.1", "2130706433", "localhost", "a.io", "", " ", "1.2.3.4 "));
const host = fc.oneof(v4, v6, gapped, mapped, junk);
const sseLine = fc.oneof(
    fc.constant(""),
    fc.tuple(fc.constantFrom("data", "event", "id", "retry", "other", "data ", ""), fc.constantFrom(": ", ":", ""), fc.stringMatching(/^[a-z0-9 {}":,]{0,12}$/)).map(([field, sep, value]) => `${field}${sep}${value}`),
    fc.constant(": comment"),
    fc.constant("retry: 50"),
    fc.constant("id"),
);
const statusArb: fc.Arbitrary<Status> = fc.record({
    code: fc.constantFrom(200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503),
    body: fc.oneof(fc.constant(""), fc.constant('{"data":{"ok":true}}'), fc.constant('{"code":"validation","message":"bad","errors":{"email":["taken"]},"reason":"signup"}'), fc.constant("<html>"), fc.constant("{broken"), fc.constant("plain text")),
    type: fc.constantFrom(undefined, "application/json", "text/plain", "application/problem+json"),
    retry: fc.constantFrom(undefined, "3", "x"),
});

function hostAccepts ( text: string ): string | undefined {

    try {

        const url = new URL(`http://${text.includes(":") ? `[${text}]` : text}/`);

        return url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;

    } catch {

        return undefined;

    }

}
function expand ( text: string ): string | undefined {

    const bare = text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;

    if ( !bare.includes(":") ) return /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) ? bare : undefined;

    const shaped = hostAccepts(bare);

    return shaped;

}
function chunked ( text: string, cuts: readonly number[] ): string[] {

    const points = [...new Set(cuts.map(( cut ) => Math.min(text.length, cut)))].sort(( a, b ) => a - b);
    const out: string[] = [];
    let from = 0;

    for ( const point of points ) {

        out.push(text.slice(from, point));
        from = point;

    }

    out.push(text.slice(from));

    return out;

}

describe("fuzz net", () => {

    it("url verbs never throw and query merging keeps the path", () => {

        fc.assert(fc.property(fc.webUrl({ withQueryParameters: true, withFragments: true }), fc.string({ maxLength: 16 }), ( url, junkText ) => {

            const parsed = net.parseUrl(url);

            expect(parsed?.protocol === "http" || parsed?.protocol === "https").toBe(true);
            expect(net.stripQuery(net.withQuery(url, { z: "1" }))).toBe(net.stripQuery(url));
            expect(net.parseUrl(junkText) === undefined || typeof net.parseUrl(junkText)?.origin === "string").toBe(true);
            net.parseEvents(junkText);
            net.retryAfter(junkText);
            net.forwardedFor(junkText);
            net.isPrivateAddress(junkText);
            net.isLoopback(junkText);

        }), { numRuns: runs });
        fc.assert(fc.property(fc.oneof(fc.string({ maxLength: 12 }), fc.stringMatching(/^[a-z.%2eE/]{0,12}$/)), ( segment ) => {

            let joined: string | undefined;

            try {

                joined = net.joinUrl("https://a.io/v1/users", segment);

            } catch ( caught ) {

                expect(caught).toBeInstanceOf(RangeError);

                return;

            }

            let landed: string | undefined;

            try {

                landed = new URL(joined).pathname;

            } catch {

                return;

            }

            expect(landed === "/v1/users" || landed.startsWith("/v1/users/")).toBe(true);

        }), { numRuns: runs });

    });
    it("the address scanner agrees with the host parser on every address it accepts and never reads what the host refuses as a different value", () => {

        fc.assert(fc.property(host, ( text ) => {

            const own = net.isAddress(text);
            const theirs = expand(text.trim());

            if ( own ) {

                expect(theirs).not.toBeUndefined();

                const canonical = net.forwardedFor(text) ?? "";
                const back = text.includes(":") && !canonical.includes(":") ? `::ffff:${canonical}` : canonical;

                expect(canonical).not.toBe("");
                expect(hostAccepts(back)).toBe(theirs);

            } else if ( theirs !== undefined && !text.includes(":") ) {

                expect(/^\d{1,3}(\.\d{1,3}){3}$/.test(text) && text.split(".").every(( part ) => Number(part) <= 255 && (part === "0" || !part.startsWith("0")))).toBe(false);

            }

            expect(typeof net.isPrivateAddress(text)).toBe("boolean");
            expect(net.isLoopback(text) ? net.isPrivateAddress(text) : true).toBe(true);

        }), { numRuns: runs });
        fc.assert(fc.property(fc.array(fc.oneof(v4, gapped, mapped, fc.constantFrom("unknown", "", " ", "junk", "10.0.0.1", "192.168.1.1", "127.0.0.1")), { minLength: 1, maxLength: 5 }), ( chain ) => {

            const header = chain.join(", ");
            const answer = net.forwardedFor(header);
            const sound = chain.map(( entry ) => (net.isAddress(entry.trim()) ? entry.trim() : undefined));
            const open = [...sound].reverse().find(( entry ) => entry !== undefined && !net.isPrivateAddress(entry));
            const first = sound.find(( entry ) => entry !== undefined);

            if ( open !== undefined ) expect(answer).toBe(net.forwardedFor(open));
            else if ( first !== undefined ) expect(answer).toBe(net.forwardedFor(first));
            else expect(answer).toBeUndefined();

            for ( let hops = 1; hops <= chain.length; hops += 1 ) {

                const picked = sound[chain.length - hops];

                expect(net.forwardedFor(header, hops)).toBe(picked === undefined ? undefined : net.forwardedFor(picked));

            }

        }), { numRuns: runs });

    });
    it("an event feed cut at any boundary dispatches the same events as the whole text, and never a tail", async () => {

        await fc.assert(fc.asyncProperty(fc.array(sseLine, { maxLength: 10 }), fc.array(fc.constantFrom("\n", "\r\n", "\r"), { minLength: 10, maxLength: 10 }), fc.array(fc.nat({ max: 120 }), { maxLength: 4 }), fc.boolean(), async ( lines, ends, cuts, terminated ) => {

            const text = lines.map(( line, at ) => line + (ends[at] ?? "\n")).join("") + (terminated ? "\n" : "");
            const whole = net.parseEvents(text);
            const pieces = chunked(text, cuts);
            const stream = new ReadableStream<Uint8Array>({ start ( controller ) {

                for ( const piece of pieces ) controller.enqueue(new TextEncoder().encode(piece));

                controller.close();

            } });
            const feed = net.events("https://a.example/sse", { fetcher: async () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }) });
            const seen: net.Event[] = [];
            const drained = (async () => {

                for await ( const one of feed ) seen.push(one);

            })();

            await drained.then(() => {

                const blocks = text.split(/\r\n|\r|\n/);
                let data: string[] = [];

                blocks.pop();

                let expected = 0;

                for ( const line of blocks ) {

                    if ( line === "" ) {

                        if ( data.length > 0 ) expected += 1;

                        data = [];

                    } else if ( line.startsWith("data") && (line.length === 4 || line[4] === ":") ) data.push(line);

                }

                expect(whole.length).toBe(expected);
                expect(seen).toEqual(whole);

                for ( const one of whole ) expect(one.event === "" ? "x" : one.event).not.toBe("");

            });

        }), { numRuns: 1500 });

    });
    it("request maps every reply it can meet into a reply or a fault that keeps the status, and retries only what is transient and safe", async () => {

        await fc.assert(fc.asyncProperty(statusArb, fc.constantFrom<net.Method>("GET", "POST", "DELETE"), fc.integer({ min: 0, max: 1 }), fc.boolean(), async ( given, method, retries, idempotent ) => {

            let calls = 0;
            const fetcher: net.Fetcher = async () => {

                calls += 1;

                const headers: Record<string, string> = {};

                if ( given.type ) headers["content-type"] = given.type;
                if ( given.retry ) headers["retry-after"] = given.retry;

                return new Response(given.code === 204 ? null : given.body, { status: given.code, headers });

            };
            const answer = await net.request("https://a.example/x", { method, fetcher, retries, idempotent, body: method === "GET" ? undefined : { a: 1 }, timeout: 1000 }).then(( out ) => ({ out }), ( fault: unknown ) => ({ fault }));
            const ok = given.code < 400;
            const claims = (given.type ?? "").includes("json");
            const parsedBody = given.body === "" ? undefined : (() => {

                try {

                    return JSON.parse(given.body) as unknown;

                } catch {

                    return undefined;

                }

            })();

            if ( "out" in answer ) {

                expect(ok).toBe(true);
                expect(answer.out.status).toBe(given.code);
                expect(answer.out.attempts).toBe(1);

                if ( claims && given.body !== "" && given.code !== 204 ) expect(parsedBody).not.toBeUndefined();
                if ( claims && parsedBody !== undefined && given.code !== 204 ) expect(answer.out.body).toEqual(parsedBody);
                if ( !claims ) expect(answer.out.body).toBe(given.code === 204 ? "" : given.body);

                return;

            }

            expect(error.is(answer.fault)).toBe(true);

            if ( !error.is(answer.fault) ) return;

            if ( ok ) {

                expect([answer.fault.reason, claims, parsedBody]).toEqual(["net.json", true, undefined]);

                return;

            }

            expect(answer.fault.status).toBe(given.code);
            expect(answer.fault.code).toBe(error.fromEnvelope(claims ? (parsedBody ?? given.body) : given.body, given.code).code);
            expect(answer.fault.retryAfter).toBe(given.retry === "3" ? 3 : undefined);

            const transient = error.retryable(answer.fault);
            const allowed = idempotent;

            expect(calls).toBe(transient && allowed ? retries + 1 : 1);
            expect(answer.fault.requestId).toBeDefined();

        }), { numRuns: 200 });

    }, 60_000);
    it("a policy admits exactly the origins it was built from, and a guarded call never leaves them", async () => {

        const label = fc.stringMatching(/^[a-z]{1,6}$/);
        const origin = fc.tuple(fc.constantFrom("http", "https"), fc.array(label, { minLength: 1, maxLength: 3 }), fc.constantFrom("", ":8080", ":443")).map(([scheme, labels, port]) => `${scheme}://${labels.join(".")}.example${port}`);
        const wildcard = fc.tuple(fc.constantFrom("http", "https"), fc.array(label, { minLength: 1, maxLength: 2 }), fc.constantFrom("", ":8080")).map(([scheme, labels, port]) => `${scheme}://*.${labels.join(".")}.example${port}`);

        await fc.assert(fc.asyncProperty(fc.array(fc.oneof(origin, wildcard), { minLength: 1, maxLength: 4 }), fc.array(origin, { minLength: 1, maxLength: 6 }), async ( rules, probes ) => {

            const allow = net.policy({ origins: rules });
            const expected = ( url: string ): boolean => {

                const parts = net.parseUrl(url);

                if ( !parts ) return false;

                return rules.some(( rule ) => {

                    if ( !rule.includes("*.") ) return net.originOf(rule) === parts.origin;

                    const ruled = net.parseUrl(rule.replace("*.", "x."));

                    return ruled !== undefined && ruled.protocol === parts.protocol && ruled.port === parts.port && parts.hostname.endsWith(ruled.hostname.slice(1)) && parts.hostname.length > ruled.hostname.length - 1;

                });

            };

            for ( const probe of probes ) expect([probe, allow(`${probe}/path`)]).toEqual([probe, expected(`${probe}/path`)]);

            const landing = probes[0] as string;
            const fetcher: net.Fetcher = async ( url ) => (url.endsWith("/go") ? new Response(null, { status: 302, headers: { location: `${landing}/landed` } }) : new Response("ok"));
            const guarded = net.guarded(fetcher, allow);
            const start = rules.find(( rule ) => !rule.includes("*.")) ?? (rules[0] as string).replace("*.", "a.");
            const answer = await guarded(`${start}/go`, { method: "GET", headers: {}, signal: new AbortController().signal }).then(( response ) => response.status, ( fault: unknown ) => (error.is(fault) ? fault.reason : "?"));

            expect(answer).toBe(allow(`${landing}/landed`) ? 200 : "net.redirect");

        }), { numRuns: 800 });

    });

});
