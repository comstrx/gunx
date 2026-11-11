import * as error from "engine-error";
import * as json from "engine-json";
import * as net from "engine-net";
import * as parse from "engine-parse";
import { envelope, isEnvelope, refusal } from "./envelope.ts";
import { house, type Wire } from "./wire.ts";

export type Route = ( context: { params: Record<string, string>; query: parse.Query; body: unknown; headers: Record<string, string>; method: string; path: string } ) => unknown | Promise<unknown>;
export type Routes = Record<string, Route>;
export type Recorded = { method: string; path: string; query: parse.Query; body: unknown; headers: Record<string, string> };
export type Stub = {
    fetcher: net.Fetcher;
    calls: () => Recorded[];
    reset: () => void;
    latency: ( ms: number ) => void;
    route: ( key: string, handler: Route ) => void;
    refuse: ( key: string, fault: error.Fault | error.Code, times?: number ) => void;
};

type Row = { key: string; method: string; pattern: string; handler: Route; rank: number };
type Plan = { method: string; pattern: string; fault: error.Fault; left: number };

const methods: readonly string[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const gap = /\s/;
const longest = 60_000;

function keyed ( key: string ): { key: string; method: string; pattern: string } {

    const text = typeof key === "string" ? key.trim() : "";
    const at = text.search(gap);
    const method = at === -1 ? "*" : text.slice(0, at).toUpperCase();
    const pattern = at === -1 ? text : text.slice(at).trim();

    if ( !pattern.startsWith("/") || gap.test(pattern) || (method !== "*" && !methods.includes(method)) ) throw error.fault("internal", "api.route", { message: `${text.slice(0, 120)}: a route is keyed as a method and a path` });

    return { key: `${method} ${pattern}`, method, pattern };

}
function ranked ( method: string, pattern: string ): number {

    let rank = method === "*" ? 1 : 0;

    for ( const piece of pattern.split("/") ) rank += piece.includes("*}") ? 10_000 : piece.includes("{") ? 100 : 0;

    return rank;

}
function reply ( status: number, body: unknown, headers: Record<string, string> = {} ): Response {

    return new Response(json.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

}
function refused ( fault: error.Fault, wire: Wire, trace: string ): Response {

    if ( fault.status < 200 || fault.status > 599 ) throw fault;

    const made = refusal(fault, { requestId: fault.requestId ?? (trace === "" ? undefined : trace) }, wire.envelope);

    return reply(fault.status, made, fault.retryAfter === undefined ? {} : { "retry-after": String(Math.ceil(fault.retryAfter)) });

}
function waited ( ms: number, signal: AbortSignal | undefined ): Promise<void> {

    return new Promise(( resolve, reject ) => {

        let timer: ReturnType<typeof setTimeout> | undefined;
        const stop = (): void => {

            clearTimeout(timer);
            reject(signal?.reason ?? error.fault("timeout", "api.aborted"));

        };

        if ( signal?.aborted ) {

            stop();

            return;

        }

        timer = setTimeout(() => {

            signal?.removeEventListener("abort", stop);
            resolve();

        }, ms);
        signal?.addEventListener("abort", stop, { once: true });

    });

}
function located ( url: string ): { path: string; query: parse.Query } {

    const parsed = net.parseUrl(url);

    if ( parsed ) return { path: parsed.path === "" ? "/" : parsed.path, query: parsed.query };

    const hash = url.indexOf("#");
    const bare = hash === -1 ? url : url.slice(0, hash);
    const mark = bare.indexOf("?");

    return { path: (mark === -1 ? bare : bare.slice(0, mark)) || "/", query: mark === -1 ? {} : parse.query(bare.slice(mark + 1)) };

}

export function stub ( routes: Routes, wire: Wire = house ): Stub {

    const calls: Recorded[] = [];
    const plans: Plan[] = [];
    let table: Row[] = [];
    let delay = 0;

    function route ( key: string, handler: Route ): void {

        const named = keyed(key);

        if ( typeof handler !== "function" ) throw error.fault("internal", "api.route", { message: `${named.key}: a route answers with a function` });

        table = table.filter(( row ) => row.key !== named.key).concat({ ...named, handler, rank: ranked(named.method, named.pattern) }).sort(( left, right ) => left.rank - right.rank);

    }
    function planned ( method: string, path: string ): error.Fault | undefined {

        for ( const plan of plans ) {

            if ( plan.left <= 0 || (plan.method !== "*" && plan.method !== method) || !parse.matches(plan.pattern, path) ) continue;

            plan.left -= 1;

            return plan.fault;

        }

        return undefined;

    }

    for ( const key of Object.keys(routes) ) {

        const handler = routes[key];

        if ( handler ) route(key, handler);

    }

    return {
        route,
        calls: () => [...calls],
        reset: () => {

            calls.length = 0;
            plans.length = 0;

        },
        latency: ( ms ) => {

            delay = Number.isFinite(ms) ? Math.min(Math.max(0, ms), longest) : 0;

        },
        refuse: ( key, fault, times = 1 ) => {

            const named = keyed(key);
            const left = typeof times === "number" && times > 0 ? Math.floor(times) : 0;
            const kept = plans.filter(( plan ) => plan.method !== named.method || plan.pattern !== named.pattern);

            plans.length = 0;
            plans.push(...kept);

            if ( left > 0 ) plans.push({ method: named.method, pattern: named.pattern, fault: typeof fault === "string" ? error.fault(fault, "stub.refused") : fault, left });

        },
        fetcher: async ( url, init ) => {

            const { path, query } = located(url);
            const method = init.method.toUpperCase();
            const headers = { ...init.headers };
            const trace = headers[wire.headers.requestId] ?? "";
            const body = typeof init.body === "string" ? (json.parse(init.body) ?? init.body) : init.body;

            calls.push({ method, path, query, body, headers });

            if ( delay > 0 ) await waited(delay, init.signal);

            const fault = planned(method, path);

            if ( fault ) return refused(fault, wire, trace);

            for ( const row of table ) {

                if ( row.method !== "*" && row.method !== method ) continue;

                const params = parse.match(row.pattern, path);

                if ( !params ) continue;

                try {

                    const result = await row.handler({ params, query, body, headers, method, path });

                    if ( result instanceof Response ) return result;

                    return reply(200, isEnvelope(result, wire.envelope) ? result : envelope(result, {}, wire.envelope, wire.ok));

                } catch ( caught ) {

                    return refused(error.of(caught), wire, trace);

                }

            }

            return refused(error.fault("not_found", "stub.route"), wire, trace);

        },
    };

}
