import * as date from "engine-date";
import * as error from "engine-error";
import * as event from "engine-event";
import * as json from "engine-json";
import * as net from "engine-net";
import * as rand from "engine-rand";
import * as validate from "engine-validate";
import { address } from "./address.ts";
import type { Ambient, Call, CallScope, Client, ClientOptions, Endpoint, Kept, Part, Ready, Refusal, Reply, Sent, Wire } from "./arch.ts";
import { idOf, partsOf } from "./contract.ts";
import { pageOf, unwrap } from "./envelope.ts";
import { house } from "./wire.ts";

const capacity = 256;
const printable = /^[!-~]{1,255}$/;
const digits = /^\d{1,9}$/;
const arrays = new WeakMap<object, validate.Schema>();

function isPromise<T> ( value: T | Promise<T> ): value is Promise<T> {

    return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";

}
function interrupted ( call: CallScope ): error.Fault {

    return call.interruption?.() ?? error.fault("timeout", "api.aborted", { cause: call.signal?.reason });

}
function unbound ( endpoint: Endpoint, name: string, message: string ): error.Fault {

    return error.fault("validation", "api.param", { message: `${idOf(endpoint)}: the path parameter {${name}} ${message}`, errors: { [name]: [message] } });

}
function worded ( value: unknown ): string | undefined {

    if ( typeof value === "string" ) return value;
    if ( typeof value === "number" ) return Number.isFinite(value) ? String(value) : undefined;
    if ( typeof value === "boolean" || typeof value === "bigint" ) return String(value);
    if ( value instanceof Date ) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();

    return undefined;

}
function plainly ( value: unknown ): string | undefined {

    return worded(value) ?? (typeof value === "object" && value !== null ? json.stringify(value, { stable: true }) : undefined);

}
function encoded ( endpoint: Endpoint, part: Part, value: unknown ): string {

    const text = worded(value);

    if ( text === undefined || text === "" ) throw unbound(endpoint, part.name, "needs a value");

    const pieces = part.rest ? text.split("/") : [text];

    if ( pieces.some(( piece ) => piece === "" || piece === "." || piece === "..") ) throw unbound(endpoint, part.name, "is not a path segment");

    try {

        return pieces.map(encodeURIComponent).join("/");

    } catch {

        throw unbound(endpoint, part.name, "is not well formed text");

    }

}
function queried ( value: unknown ): string | string[] | undefined {

    if ( !Array.isArray(value) ) return plainly(value);

    const made: string[] = [];

    for ( const item of value ) {

        const text = plainly(item);

        if ( text !== undefined ) made.push(text);

    }

    return made;

}
function split ( endpoint: Endpoint, input: Record<string, unknown> ): Sent {

    const parts = partsOf(endpoint);
    const bodiless = endpoint.method === "GET" || endpoint.method === "DELETE";
    const query: Record<string, string | string[]> = {};
    const body: Record<string, unknown> = {};
    let path = "";

    for ( const part of parts ) path += part.name === "" ? part.text : `${part.text}${encoded(endpoint, part, input[part.name])}`;

    for ( const key of Object.keys(input) ) {

        if ( !json.safeKey(key) || parts.some(( part ) => part.name === key) ) continue;

        if ( !bodiless ) {

            body[key] = input[key];

            continue;

        }

        const text = queried(input[key]);

        if ( text !== undefined ) query[key] = text;

    }

    return { path, query, body: bodiless ? undefined : body };

}
function rooted ( value: unknown ): string {

    const text = typeof value === "string" ? value.trim() : "";
    let end = text.length;

    if ( !text.startsWith("/") ) return address(value as string);
    if ( text.startsWith("//") || text.includes("?") || text.includes("#") ) throw error.fault("internal", "api.address", { message: "a client is rooted at a bare url or an absolute path, without a query or a hash" });

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code <= 32 || code === 127 ) throw error.fault("internal", "api.address", { message: "a client is rooted at a path without spaces or control characters" });

    }

    while ( end > 0 && text.charCodeAt(end - 1) === 47 ) end -= 1;

    return text.slice(0, end);

}
function frozen<T> ( value: T ): T {

    if ( Array.isArray(value) ) {

        for ( const item of value ) frozen(item);

        return Object.freeze(value);

    }

    if ( json.isRecord(value) ) {

        for ( const key of Object.keys(value) ) frozen(value[key]);

        return Object.freeze(value);

    }

    return value;

}
function untold ( cause: unknown ): never {

    throw error.isFault(cause) ? cause : error.fault("internal", "api.token", { message: "the token provider failed", cause });

}
function merged ( ...sources: readonly (Record<string, string | undefined> | undefined)[] ): Record<string, string | undefined> {

    const made: Record<string, string | undefined> = {};

    for ( const source of sources ) {

        for ( const name of Object.keys(source ?? {}) ) made[name.toLowerCase()] = source?.[name];

    }

    return made;

}
function shaped ( endpoint: Endpoint ): validate.Schema {

    if ( !endpoint.many ) return endpoint.output;

    const known = arrays.get(endpoint.output);

    if ( known ) return known;

    const made = validate.array(endpoint.output);

    arrays.set(endpoint.output, made);

    return made;

}
function refusal ( wire: Wire ): Refusal {

    const paths = wire.envelope;

    return ( status, body, headers ) => {

        const wait = net.retryAfter(headers["retry-after"]);
        const later = json.pathGet(body, paths.retryAfter);
        const fault = json.isRecord(body) ? error.fromEnvelope({
            code: json.pathGet(body, paths.code),
            message: json.pathGet(body, paths.message),
            reason: json.pathGet(body, paths.reason),
            errors: json.pathGet(body, paths.errors),
            request_id: json.pathGet(body, paths.requestId),
            retry_after: typeof later === "string" && digits.test(later) ? Number(later) : later,
        }, status) : error.fromStatus(status);

        return wait === undefined ? fault : fault.with({ retryAfter: wait });

    };

}

export function create ( options: ClientOptions ): Client {

    const wire = options.wire ?? house;
    const base = rooted(options.baseUrl);
    const refuse = refusal(wire);
    const cache = new Map<string, Kept>();
    const flights = new Map<string, Promise<Reply<unknown>>>();
    let seen = "";
    let epoch = 0;

    function told ( run: () => void ): void {

        try {

            run();

        } catch ( cause ) {

            options.fail?.(cause);

        }

    }
    function asked<T> ( run: () => T ): T {

        try {

            return run();

        } catch ( cause ) {

            return untold(cause);

        }

    }
    function grieved ( endpoint: Endpoint, caught: unknown ): error.Fault {

        const fault = error.of(caught);

        told(() => options.onFault?.(fault, endpoint));

        return fault;

    }
    function wipe (): void {

        cache.clear();
        flights.clear();
        epoch += 1;

    }
    function keep ( key: string, kept: Kept ): void {

        cache.delete(key);

        if ( cache.size >= capacity ) {

            const oldest = cache.keys().next();

            if ( !oldest.done ) cache.delete(oldest.value);

        }

        cache.set(key, kept);

    }
    function ambience ( call?: Call ): Ambient {

        return { locale: call?.locale ?? options.locale?.() ?? "", currency: options.currency?.() ?? "", tenant: options.tenant?.() ?? "", scope: options.scope?.() ?? "" };

    }
    function keyOf ( endpoint: Endpoint, ambient: Ambient, record: Record<string, unknown> ): string {

        return json.stringify([idOf(endpoint), ambient.locale, ambient.currency, ambient.tenant, ambient.scope, record], { stable: true });

    }
    function settled ( endpoint: Endpoint, record: Record<string, unknown>, call: Call, ambient: Ambient, token: string | null | undefined ): Ready {

        const bearer = typeof token === "string" ? token : "";
        const read = endpoint.method === "GET";
        const life = read && call.headers === undefined ? endpoint.cache || wire.cache : 0;
        const key = read ? keyOf(endpoint, ambient, record) : "";
        const owner = endpoint.auth ? bearer : "";
        const shared = read && !call.fresh && !call.signal && !call.headers && call.timeout === undefined && call.retries === undefined;

        if ( endpoint.auth && bearer !== seen ) {

            wipe();
            seen = bearer;

        }

        const kept = life > 0 && !call.fresh ? cache.get(key) : undefined;
        const live = kept !== undefined && kept.owner === owner && kept.until > date.now();

        return { record, ambient, bearer, owner, key, life, shared, kept: live ? { ...kept.value, cached: true } : undefined };

    }
    function prepared ( endpoint: Endpoint, input: unknown, call: CallScope ): Ready | Promise<Ready> {

        if ( call.signal?.aborted ) throw interrupted(call);

        const checked = validate.check(endpoint.input, input, `${idOf(endpoint)}.input`);

        if ( !checked.ok ) throw checked.fault;

        const record = (json.isRecord(checked.value) ? checked.value : {}) as Record<string, unknown>;
        const ambient = ambience(call);
        const given = endpoint.auth ? asked(() => options.token?.()) : undefined;

        return isPromise(given) ? event.race(given, call.signal).then(( token ) => {

            if ( call.signal?.aborted ) throw interrupted(call);

            return settled(endpoint, record, call, ambient, token);

        }, ( cause: unknown ) => {

            if ( call.signal?.aborted ) throw interrupted(call);

            return untold(cause);

        }) : settled(endpoint, record, call, ambient, given);

    }
    async function sent ( endpoint: Endpoint, ready: Ready, call: CallScope ): Promise<Reply<unknown>> {

        const born = epoch;
        const write = endpoint.method !== "GET";
        const safe = endpoint.idempotent || wire.idempotent.includes(endpoint.method);
        const once = call.idempotencyKey ?? (safe ? undefined : rand.uuid7());
        const requestId = options.trace === false ? "" : rand.trace();
        const headers = merged(options.headers?.(), call.headers);
        const { path, query, body } = split(endpoint, ready.record);

        if ( once !== undefined && (typeof once !== "string" || !printable.test(once)) ) throw error.fault("internal", "api.idempotency", { message: `${idOf(endpoint)}: an idempotency key is 1 to 255 visible ascii characters` });

        if ( ready.bearer !== "" ) headers[wire.headers.auth.name] = `${wire.headers.auth.prefix ?? ""}${ready.bearer}`;
        if ( ready.ambient.locale !== "" ) headers[wire.headers.language] = ready.ambient.locale;
        if ( ready.ambient.currency !== "" ) headers[wire.headers.currency] = ready.ambient.currency;
        if ( ready.ambient.tenant !== "" ) headers[wire.headers.tenant] = ready.ambient.tenant;
        if ( options.client ) headers[wire.headers.client] = options.client;
        if ( once !== undefined ) headers[wire.headers.idempotency] = once;

        if ( options.trace !== false ) headers[wire.headers.requestId] = requestId;

        const reply = await net.request(net.joinUrl(base, path), {
            method: endpoint.method,
            query,
            body,
            headers,
            requestId,
            trace: options.trace,
            fetcher: options.fetcher,
            timeout: call.timeout ?? options.timeout ?? wire.timeout,
            retries: call.retries ?? options.retries ?? (write ? wire.retries.write : wire.retries.read),
            idempotent: safe || (once !== undefined && (call.retries !== undefined || wire.retries.write > 0)),
            signal: call.signal,
            failure: refuse,
        }).catch(( cause: unknown ) => {

            if ( call.signal?.aborted ) throw interrupted(call);

            throw cause;

        }).finally(() => {

            if ( write ) wipe();

        });
        const envelope = unwrap(reply.body, wire.envelope, wire.ok);

        if ( envelope.code !== wire.ok && error.isCode(envelope.code) && error.codes[envelope.code] >= 400 ) {

            throw refuse(error.codes[envelope.code], reply.body, reply.headers).with({ requestId: envelope.requestId ?? reply.requestId });

        }

        const data = validate.check(shaped(endpoint), envelope.data, `${idOf(endpoint)}.output`);

        if ( !data.ok ) throw data.fault.with({ requestId: reply.requestId, status: 502 });

        const made: Reply<unknown> = { data: frozen(data.value), message: envelope.message, meta: envelope.meta, page: pageOf(reply.body, wire.envelope), requestId: envelope.requestId ?? reply.requestId, ms: reply.ms, status: reply.status, attempts: reply.attempts, cached: false };

        if ( ready.life > 0 && born === epoch ) keep(ready.key, { value: made, until: date.now() + ready.life * 1000, owner: ready.owner, id: idOf(endpoint), feature: endpoint.feature });

        return made;

    }
    async function answered ( endpoint: Endpoint, input: unknown, call: CallScope ): Promise<Reply<unknown>> {

        let ready: Ready;

        try {

            const made = prepared(endpoint, input, call);

            ready = isPromise(made) ? await made : made;

        } catch ( caught ) {

            throw grieved(endpoint, caught);

        }

        if ( ready.kept ) return ready.kept;

        const riding = ready.shared ? flights.get(ready.key) : undefined;

        if ( riding ) return riding;

        const flight = sent(endpoint, ready, call).then(
            ( made ) => {

                told(() => options.onReply?.(made, endpoint));

                return made;

            },
            ( caught: unknown ) => {

                throw grieved(endpoint, caught);

            },
        );

        if ( !ready.shared ) return flight;

        flights.set(ready.key, flight);

        return flight.finally(() => {

            if ( flights.get(ready.key) === flight ) flights.delete(ready.key);

        });

    }

    async function bounded ( endpoint: Endpoint, input: unknown, call: Call ): Promise<Reply<unknown>> {

        if ( call.budget === undefined ) return answered(endpoint, input, call);
        if ( !(call.budget >= 0) ) throw new RangeError("not a duration");

        const scope = event.deadline(call.budget, call.signal);

        try {

            return await answered(endpoint, input, { ...call, signal: scope.signal, interruption: () => error.fault("timeout", call.signal?.aborted ? "api.aborted" : "api.budget", { cause: scope.signal.reason }) });

        } finally {

            scope.release();

        }

    }

    return {
        wire,
        call: ( endpoint, input, call = {} ) => bounded(endpoint, input, call) as never,
        url: ( endpoint, input ) => {

            const { path, query } = split(endpoint, input);

            return net.withQuery(net.joinUrl(base, path), query);

        },
        cached: ( endpoint, input ) => {

            const checked = validate.check(endpoint.input, input);

            if ( !checked.ok || endpoint.method !== "GET" ) return undefined;

            const kept = cache.get(keyOf(endpoint, ambience(), (json.isRecord(checked.value) ? checked.value : {}) as Record<string, unknown>));
            const now = endpoint.auth ? asked(() => options.token?.()) : "";
            if ( isPromise(now) ) {

                void Promise.resolve(now).catch(( cause: unknown ) => grieved(endpoint, error.isFault(cause) ? cause : error.fault("internal", "api.token", { cause })));

                return undefined;

            }

            const owner = typeof now === "string" ? now : "";

            return kept && kept.owner === owner && kept.until > date.now() ? kept.value.data : undefined;

        },
        forget: ( target ) => {

            const named = typeof target === "string";
            const id = target === undefined || named ? target : idOf(target);

            epoch += 1;
            flights.clear();

            if ( id === undefined ) cache.clear();

            for ( const [key, kept] of cache ) if ( (named ? kept.feature : kept.id) === id ) cache.delete(key);

        },
    };

}
