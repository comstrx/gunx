import * as date from "engine-date";
import * as error from "engine-error";
import * as event from "engine-event";
import * as json from "engine-json";
import { dropped, readBytes } from "./guard.ts";
import { address, type Fetcher, failure, gone, header, fetcher as shared } from "./transport.ts";

export type Event = { id: string | undefined; event: string; data: string; json: unknown };
export type EventsOptions = {
    headers?: Record<string, string | undefined> | undefined;
    signal?: AbortSignal | undefined;
    fetcher?: Fetcher | undefined;
    lastId?: string | undefined;
    reconnect?: number | undefined;
    retry?: number | undefined;
    idle?: number | undefined;
    maxBytes?: number | undefined;
};
export type PollOptions<T> = {
    every?: number | (( attempt: number, value: T ) => number) | undefined;
    until?: (( value: T, attempt: number ) => boolean) | undefined;
    limit?: number | undefined;
    timeout?: number | undefined;
    signal?: AbortSignal | undefined;
};

type Feed = { push: ( chunk: string ) => Event[]; last: () => string | undefined; retry: () => number | undefined };
type Held = { cancel: () => Promise<void> } | null | undefined;

const digits = /^\d{1,9}$/;
const longest = 2_147_483_647;
const slowest = 30_000;

function over ( limit: number ): error.Fault {

    return error.fault("too_large", "net.event", { errors: { event: [`max:${limit}`] } });

}
function feed ( limit: number ): Feed {

    const data: string[] = [];
    let line = "";
    let carriage = false;
    let fresh = true;
    let id: string | undefined;
    let name = "";
    let held = 0;
    let last: string | undefined;
    let retry: number | undefined;
    const take = ( text: string, out: Event[] ): void => {

        if ( text === "" ) {

            if ( data.length > 0 ) {

                const joined = data.length === 1 ? (data[0] ?? "") : data.join("\n");

                out.push({ id, event: name || "message", data: joined, json: json.parse(joined) });

            }

            if ( id !== undefined ) last = id;

            id = undefined;
            name = "";
            data.length = 0;
            held = 0;

            return;

        }

        if ( text.charCodeAt(0) === 58 ) return;

        held += text.length;

        if ( held > limit ) throw over(limit);

        const at = text.indexOf(":");
        const field = at === -1 ? text : text.slice(0, at);
        const value = at === -1 ? "" : text.slice(text.charCodeAt(at + 1) === 32 ? at + 2 : at + 1);

        if ( field === "data" ) data.push(value);
        else if ( field === "event" ) name = value;
        else if ( field === "id" && !value.includes("\0") ) id = value;
        else if ( field === "retry" && digits.test(value) ) retry = Number(value);

    };

    return {
        last: () => last,
        retry: () => retry,
        push: ( chunk ) => {

            const out: Event[] = [];
            const text = fresh && chunk.charCodeAt(0) === 0xfeff ? chunk.slice(1) : chunk;

            if ( chunk === "" ) return out;

            let from = carriage && text.charCodeAt(0) === 10 ? 1 : 0;

            fresh = false;
            carriage = false;

            for ( let at = from; at < text.length; at += 1 ) {

                const code = text.charCodeAt(at);

                if ( code !== 10 && code !== 13 ) continue;

                take(line === "" ? text.slice(from, at) : line + text.slice(from, at), out);
                line = "";

                if ( code === 13 && at + 1 === text.length ) carriage = true;
                else if ( code === 13 && text.charCodeAt(at + 1) === 10 ) at += 1;

                from = at + 1;

            }

            if ( from < text.length ) line += text.slice(from);
            if ( line.length > limit ) throw over(limit);

            return out;

        },
    };

}
function tries ( value: number | undefined ): number {

    if ( Number.isNaN(value) ) throw new RangeError("not a count");

    return Math.max(0, Math.trunc(value ?? 0));

}
async function within<T> ( work: PromiseLike<T>, link: event.Abortable, idle: number ): Promise<T> {

    const timer = idle === Number.POSITIVE_INFINITY ? undefined : setTimeout(() => link.abort(error.fault("timeout", "net.idle")), Math.min(Math.max(0, idle), longest));

    try {

        return await event.race(work, link.signal);

    } finally {

        if ( timer !== undefined ) clearTimeout(timer);

    }

}
async function refusal ( response: Response, signal: AbortSignal ): Promise<error.Fault> {

    const text = await readBytes(response, 65_536, signal).then(( bytes ) => new TextDecoder().decode(bytes), () => "");
    const after = response.headers.get("retry-after");
    const fault = failure(response.status, json.parse(text) ?? text, after === null ? {} : { "retry-after": after });

    return fault.reason === undefined ? fault.with({ reason: "net.events" }) : fault;

}

export function parseEvents ( text: string ): Event[] {

    return feed(Number.POSITIVE_INFINITY).push(text);

}
export async function* events ( url: string, options: EventsOptions = {} ): AsyncGenerator<Event> {

    const { idle = Number.POSITIVE_INFINITY, maxBytes = 1_000_000, retry = 1000, signal } = options;
    const target = address(url);
    const send = options.fetcher ?? shared.get();
    const allowed = tries(options.reconnect);
    const headers: Record<string, string> = { accept: "text/event-stream", "cache-control": "no-cache" };
    let last = options.lastId;
    let wait = Math.max(0, retry);
    let failures = 0;

    if ( Number.isNaN(idle) || Number.isNaN(retry) ) throw new RangeError("not a duration");
    if ( Number.isNaN(maxBytes) ) throw new RangeError("not a size");

    for ( const [name, value] of Object.entries(options.headers ?? {}) ) if ( value !== undefined ) headers[header(name, value)] = value;

    for ( ;; ) {

        if ( signal?.aborted ) throw error.fault("timeout", "net.aborted", { cause: signal.reason });
        if ( last !== undefined && last !== "" ) headers[header("last-event-id", last)] = last;

        const link = event.abortable(signal);
        const reader = feed(maxBytes);
        let held: Held;
        let final = false;
        let asked = 0;

        try {

            const response = await within(send(target, { method: "GET", headers: { ...headers }, signal: link.signal }), link, idle);
            const kind = response.headers.get("content-type");

            held = response.body;

            if ( response.status === 204 ) return;
            if ( !response.ok ) throw await refusal(response, link.signal);

            final = true;

            if ( kind !== null && !/^text\/event-stream(?:\s*;|$)/i.test(kind.trim()) ) throw error.fault("internal", "net.stream", { status: 502, message: "the reply is not an event stream" });

            const body = response.body?.getReader();

            if ( !body ) throw error.fault("unavailable", "net.refused", { message: "the host does not stream a reply body" });

            const decoder = new TextDecoder();

            held = body;
            final = false;

            for ( ;; ) {

                const { done, value } = await within(body.read(), link, idle);

                if ( done ) break;

                for ( const one of reader.push(decoder.decode(value, { stream: true })) ) {

                    failures = 0;

                    yield one;

                }

            }

        } catch ( caught ) {

            const fault = gone(caught, signal, link.signal, "net.idle");

            if ( final || signal?.aborted || failures >= allowed || !error.retryable(fault) ) throw fault;

            asked = fault.retryAfter ?? 0;

        } finally {

            link.abort();
            link.release();
            dropped(held);

        }

        if ( failures >= allowed ) return;

        last = reader.last() ?? last;
        wait = reader.retry() ?? wait;
        failures += 1;

        await date.sleep(Math.min(Math.max(wait * 2 ** (failures - 1), asked), Math.max(wait, slowest)), signal).catch(( cause: unknown ) => {

            throw error.fault("timeout", "net.aborted", { cause });

        });

    }

}
export async function poll<T> ( work: ( attempt: number, signal: AbortSignal ) => Promise<T> | T, options: PollOptions<T> = {} ): Promise<T> {

    const { every = 1000, until = () => true, limit = 60, timeout = Number.POSITIVE_INFINITY, signal } = options;

    if ( Number.isNaN(limit) ) throw new RangeError("not a count");
    if ( typeof every === "number" && Number.isNaN(every) ) throw new RangeError("not a duration");

    const span = event.deadline(timeout, signal);
    const halted = (): error.Fault | undefined => signal?.aborted ? error.fault("timeout", "net.aborted", { cause: signal.reason }) : span.signal.aborted ? error.fault("timeout", "net.timeout") : undefined;

    try {

        for ( let attempt = 1; attempt <= limit; attempt += 1 ) {

            const halt = halted();

            if ( halt ) throw halt;

            const value = await event.race(Promise.resolve(work(attempt, span.signal)), span.signal);

            if ( until(value, attempt) ) return value;
            if ( attempt < limit ) await date.sleep(Math.max(0, typeof every === "function" ? every(attempt, value) : every) || 0, span.signal);

        }

    } catch ( caught ) {

        throw halted() ?? caught;

    } finally {

        span.release();

    }

    throw error.fault("timeout", "net.exhausted");

}
