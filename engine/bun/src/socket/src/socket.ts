import * as adapter from "engine-adapter";
import * as date from "engine-date";
import * as error from "engine-error";
import * as event from "engine-event";
import * as func from "engine-func";
import * as json from "engine-json";
import * as rand from "engine-rand";

export type Frame = { event: string; data?: unknown; channel?: string | undefined; id?: string | undefined };
export type Status = "idle" | "connecting" | "open" | "closed" | "failed";
export type Handler = ( data: unknown, frame: Frame ) => void;
export type Socket = {
    readyState: number;
    bufferedAmount?: number | undefined;
    send: ( text: string ) => void;
    close: ( code?: number, reason?: string ) => void;
    onopen: (() => void) | null;
    onclose: (( closing: { code: number; reason: string } ) => void) | null;
    onerror: (( failure: unknown ) => void) | null;
    onmessage: (( message: { data: unknown } ) => void) | null;
};
export type SocketFactory = ( url: string, protocols?: string | string[] ) => Socket;
export type Reconnect = {
    min?: number | undefined;
    max?: number | undefined;
    factor?: number | undefined;
    limit?: number | undefined;
    steady?: number | undefined;
    when?: (( code: number, reason: string ) => boolean) | undefined;
};
export type Ask = event.Wait & { channel?: string | undefined };
export type Stats = { sent: number; received: number; refused: number; opens: number };
export type Options = {
    url: string | (() => string | Promise<string>);
    protocols?: string | string[] | undefined;
    auth?: string | (() => string | undefined | Promise<string | undefined>) | undefined;
    reconnect?: Reconnect | false | undefined;
    heartbeat?: number | undefined;
    timeout?: number | undefined;
    maxFrame?: number | undefined;
    buffer?: number | undefined;
    backlog?: number | undefined;
    factory?: SocketFactory | undefined;
    fail?: event.Fail | undefined;
    onStatus?: (( status: Status, attempt: number ) => void) | undefined;
};
export type Connection = {
    status: () => Status;
    id: () => string | undefined;
    cause: () => error.Fault | undefined;
    attempts: () => number;
    stats: () => Stats;
    channels: () => string[];
    joined: ( channel: string ) => boolean;
    connect: () => Promise<void>;
    close: ( code?: number, reason?: string ) => void;
    emit: ( name: string, data?: unknown, channel?: string ) => boolean;
    request: <T = unknown>( name: string, data?: unknown, options?: Ask ) => Promise<T>;
    on: ( name: string, handler: Handler, channel?: string ) => () => void;
    once: ( name: string, channel?: string, wait?: number | event.Wait ) => Promise<unknown>;
    watch: ( listener: ( status: Status, attempt: number ) => void ) => () => void;
    join: ( channel: string ) => Promise<void>;
    leave: ( channel: string ) => Promise<void>;
};

type Frames = Record<string, Frame>;
type Rows = event.Emitter<Frames>;
type Timer = ReturnType<typeof setTimeout>;
type Waiting = { resolve: ( frame: Frame ) => void; reject: ( cause: unknown ) => void; sent: boolean };
type Held = { text: string; id: string | undefined };
type Room = { joined: boolean; asking: number; gate: func.Deferred<void> | undefined };
type Note = { status: Status; attempt: number };
type Plan = { min: number; max: number; factor: number; limit: number; steady: number; when: ( code: number, reason: string ) => boolean };

const pingEvent = "ping";
const pongEvent = "pong";
const joinEvent = "join";
const leaveEvent = "leave";
const ackEvent = "ack";
const authEvent = "auth";
const errorEvent = "error";
const greetEvent = "connected";
const longest = 65_536;
const ceiling = 2_147_483_647;
const crowd = 1024;
const reachable = /^(?:wss?|https?):\/\/[^/]/i;

let reader: TextDecoder | undefined;

function clean ( text: string, most: number ): boolean {

    if ( text === "" || text.length > most ) return false;

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code < 33 || code === 127 ) return false;

    }

    return true;

}
function named ( value: unknown ): value is string {

    return typeof value === "string" && clean(value, 256);

}
function wired ( address: string ): string {

    if ( (address.charCodeAt(0) | 32) !== 104 ) return address;

    return (address.charCodeAt(4) | 32) === 115 ? `wss${address.slice(5)}` : `ws${address.slice(4)}`;

}
function weigh ( text: string ): number {

    let total = 0;

    for ( let at = 0; at < text.length; at += 1 ) {

        const code = text.charCodeAt(at);

        if ( code < 0x80 ) total += 1;
        else if ( code < 0x800 ) total += 2;
        else if ( code >= 0xd800 && code <= 0xdbff ) total += 2;
        else if ( code >= 0xdc00 && code <= 0xdfff ) total += 2;
        else total += 3;

    }

    return total;

}
function fits ( text: string, most: number ): boolean {

    return text.length <= most && (text.length * 3 <= most || weigh(text) <= most);

}
function textOf ( raw: unknown, most: number ): string | undefined {

    const bytes = raw instanceof Uint8Array ? raw : raw instanceof ArrayBuffer ? new Uint8Array(raw) : undefined;

    if ( !bytes || bytes.byteLength > most ) return undefined;

    reader = reader ?? new TextDecoder();

    return reader.decode(bytes);

}
function span ( value: number | undefined, fallback: number ): number {

    if ( value === undefined ) return fallback;
    if ( !(value >= 0) ) throw new RangeError("not a duration");

    return value;

}
function sized ( value: number | undefined, fallback: number ): number {

    if ( value === undefined ) return fallback;
    if ( !(value >= 0) ) throw new RangeError("not a size");

    return value;

}
function retried ( code: number ): boolean {

    return code !== 1008 && code !== 4001;

}
function planOf ( given: Reconnect | false | undefined ): Plan | undefined {

    if ( given === false ) return undefined;

    const { factor = 2, limit = Number.POSITIVE_INFINITY } = given ?? {};

    if ( !(factor >= 1) ) throw new RangeError("not a factor");
    if ( !(limit >= 0) ) throw new RangeError("not a count");

    return { min: span(given?.min, 500), max: span(given?.max, 30_000), factor, limit, steady: span(given?.steady, 5000), when: given?.when ?? retried };

}
function pause ( plan: Plan, attempts: number ): number {

    const base = Math.min(plan.max, plan.min * Math.min(plan.factor ** Math.max(0, attempts - 1), 1e9));

    return Math.min(ceiling, adapter.probe(() => rand.jitter(base, 0.25)) ?? base);

}
function later ( ms: number, work: () => void ): Timer | undefined {

    return ms === Number.POSITIVE_INFINITY ? undefined : setTimeout(work, Math.min(ms, ceiling));

}
function faulted ( caught: unknown, reason: string ): error.Fault {

    return error.isFault(caught) ? caught : error.fault("unavailable", reason, { cause: caught });

}
function closed ( cause?: error.Fault ): error.Fault {

    return cause?.reason === "socket.closed" ? cause : error.fault("unavailable", "socket.closed", cause ? { cause } : {});

}
function refusal ( data: unknown ): error.Fault {

    return error.fromJson(data) ?? error.fromEnvelope(data, 400);

}
function ending ( code: number, reason: string ): error.Fault {

    const cause = { code, reason };

    if ( code === 4001 ) return error.fault("unauthorized", "socket.refused", { cause });
    if ( code === 1008 ) return error.fault("forbidden", "socket.refused", { cause });

    return error.fault("unavailable", "socket.closed", { cause });

}
function asked<T> ( read: () => T | Promise<T>, reason: string ): Promise<T> {

    return new Promise<T>(( resolve ) => resolve(read())).catch(( caught: unknown ) => {

        throw faulted(caught, reason);

    });

}
function bounded<T> ( reason: string, limit: number | undefined, signal: AbortSignal | undefined, arm: ( resolve: ( value: T ) => void, reject: ( cause: unknown ) => void ) => () => void ): Promise<T> {

    if ( limit !== undefined && !(limit >= 0) ) return Promise.reject(new RangeError("not a duration"));
    if ( signal?.aborted ) return Promise.reject(error.fault("timeout", "socket.aborted", { cause: signal.reason }));

    return new Promise<T>(( resolve, reject ) => {

        let timer: Timer | undefined;
        let stop: (() => void) | undefined;
        let live = true;
        const end = (): boolean => {

            if ( !live ) return false;

            live = false;

            if ( timer !== undefined ) clearTimeout(timer);

            signal?.removeEventListener("abort", abort);
            stop?.();

            return true;

        };
        const abort = (): void => {

            if ( end() ) reject(error.fault("timeout", "socket.aborted", { cause: signal?.reason }));

        };

        stop = arm(
            ( value ) => {

                if ( end() ) resolve(value);

            },
            ( cause ) => {

                if ( end() ) reject(cause);

            },
        );

        if ( !live ) {

            stop();

            return;

        }

        if ( limit !== undefined ) timer = later(limit, () => {

            if ( end() ) reject(error.fault("timeout", reason));

        });

        signal?.addEventListener("abort", abort, { once: true });

    });

}

export function encode ( frame: Frame ): string {

    return json.stringify({ event: frame.event, data: frame.data, channel: frame.channel, id: frame.id });

}
export function decode ( raw: unknown, limit: number = longest ): Frame | undefined {

    const text = typeof raw === "string" ? raw : textOf(raw, limit);

    if ( text === undefined || text.length > limit ) return undefined;

    const parsed = json.parse(text);

    if ( !json.isRecord(parsed) ) return undefined;

    const name = parsed.event;
    const channel = parsed.channel;
    const id = parsed.id;

    if ( typeof name !== "string" || name === "" ) return undefined;

    return { event: name, data: parsed.data, channel: typeof channel === "string" && channel !== "" ? channel : undefined, id: typeof id === "string" && id !== "" ? id : undefined };

}
export const factory: adapter.Port<SocketFactory> = adapter.port<SocketFactory>("socket.factory", {
    fallback: adapter.web("socket.unsupported", ( host ) => {

        const found = host.WebSocket;

        return found ? ( url, protocols ) => new found(url, protocols) as Socket : undefined;

    }),
});
export function open ( options: Options ): Connection {

    const { url, auth, fail } = options;
    const plan = planOf(options.reconnect);
    const beat = span(options.heartbeat, 25_000);
    const limit = span(options.timeout, 10_000);
    const most = sized(options.maxFrame, longest);
    const spare = sized(options.buffer, 0);
    const backlog = sized(options.backlog, 1_048_576);
    const stem = date.now().toString(36);
    const waiting = new Map<string, Waiting>();
    const rooms = new Map<string, Room>();
    const scoped = new Map<string, Rows>();
    const outbox: Held[] = [];
    const notes: Note[] = [];
    let socket: Socket | undefined;
    let status: Status = "idle";
    let noted: Note = { status: "idle", attempt: 0 };
    let last: error.Fault | undefined;
    let gate: func.Deferred<void> | undefined;
    let ident: string | undefined;
    let guard: Timer | undefined;
    let again: Timer | undefined;
    let pulse: ReturnType<typeof setInterval> | undefined;
    let breakage: unknown;
    let wanted = false;
    let quiet = false;
    let telling = false;
    let broken = false;
    let attempts = 0;
    let epoch = 0;
    let started = 0;
    let serial = 0;
    let asks = 0;
    let loose = 0;
    let sent = 0;
    let received = 0;
    let refused = 0;
    let opens = 0;
    const mishap = ( cause: unknown ): void => {

        if ( fail ) {

            fail(cause);

            return;

        }

        if ( broken ) return;

        broken = true;
        breakage = cause;

    };
    const states = event.emitter<{ status: Note }>({ fail: mishap });
    const everywhere: Rows = event.emitter<Frames>({ fail: mishap });
    const tell = (): void => {

        if ( telling ) return;

        telling = true;

        try {

            for ( let note = notes.shift(); note; note = notes.shift() ) states.emit("status", note);

        } finally {

            telling = false;

        }

        if ( !broken ) return;

        const cause = breakage;

        broken = false;
        breakage = undefined;

        throw cause;

    };
    const mark = ( next: Status ): void => {

        status = next;

        if ( noted.status === next && noted.attempt === attempts ) return;

        noted = { status: next, attempt: attempts };
        notes.push(noted);

    };
    const crowded = (): boolean => (socket?.bufferedAmount ?? 0) > backlog;
    const push = ( text: string ): boolean => {

        const made = socket;

        if ( made?.readyState !== 1 ) return false;

        try {

            made.send(text);

        } catch {

            return false;

        }

        sent += 1;

        return true;

    };
    const rowsOf = ( channel: string ): Rows => {

        const known = scoped.get(channel);

        if ( known ) return known;

        const rows: Rows = event.emitter<Frames>({ fail: mishap });

        scoped.set(channel, rows);

        return rows;

    };
    const deliver = ( frame: Frame ): void => {

        if ( frame.channel !== undefined ) scoped.get(frame.channel)?.emit(frame.event, frame);

        everywhere.emit(frame.event, frame);

    };
    const pack = ( name: string, data: unknown, channel: string | undefined, id: string | undefined ): string => {

        if ( !named(name) ) throw error.fault("internal", "socket.event");
        if ( channel !== undefined && channel !== "" && !named(channel) ) throw error.fault("internal", "socket.channel");

        const text = encode({ event: name, data, channel: channel || undefined, id });

        if ( !fits(text, most) ) throw error.fault("too_large", "socket.frame");

        return text;

    };
    const unhold = ( id: string ): void => {

        const at = outbox.findIndex(( one ) => one.id === id);

        if ( at >= 0 ) outbox.splice(at, 1);

    };
    const flush = (): void => {

        const held = outbox.splice(0);
        let stuck = false;

        loose = 0;

        for ( const one of held ) {

            const entry = one.id === undefined ? undefined : waiting.get(one.id);

            if ( !stuck && push(one.text) ) {

                if ( entry ) entry.sent = true;

                continue;

            }

            stuck = true;
            outbox.push(one);

            if ( one.id === undefined ) loose += 1;

        }

    };
    const ask = ( name: string, data: unknown, channel: string | undefined, wait: event.Wait = {} ): Promise<Frame> => {

        if ( !wanted ) return Promise.reject(closed(last));

        serial += 1;

        const id = `${stem}-${serial.toString(36)}`;
        let text: string;

        try {

            text = pack(name, data, channel, id);

        } catch ( caught ) {

            return Promise.reject(caught);

        }

        return bounded<Frame>("socket.request", wait.timeout ?? limit, wait.signal, ( resolve, reject ) => {

            const entry: Waiting = { resolve, reject, sent: false };
            const direct = status === "open";

            if ( direct ? crowded() : outbox.length >= crowd ) {

                reject(error.fault("unavailable", "socket.busy"));

                return func.noop;

            }

            waiting.set(id, entry);
            entry.sent = direct && push(text);

            if ( !entry.sent ) outbox.push({ text, id });

            return () => {

                waiting.delete(id);

                if ( !entry.sent ) unhold(id);

            };

        });

    };
    const settle = ( name: string, room: Room, turn: number, cause: error.Fault | undefined, reply?: Frame ): void => {

        if ( rooms.get(name) !== room || room.asking !== turn ) return;

        const waiter = room.gate;

        room.asking = 0;
        room.gate = undefined;

        if ( !cause ) {

            room.joined = true;
            waiter?.resolve();

            return;

        }

        if ( reply && !error.retryable(cause) ) rooms.delete(name);

        if ( waiter ) waiter.reject(cause.reason === "socket.request" ? error.fault("timeout", "socket.join", { cause }) : cause);
        else if ( reply ) deliver({ event: errorEvent, data: reply.data, channel: name });

    };
    const enter = ( name: string, room: Room ): void => {

        if ( room.joined || room.asking !== 0 || status !== "open" ) return;

        asks += 1;

        const turn = asks;

        room.asking = turn;
        void ask(joinEvent, undefined, name).then(
            ( reply ) => {

                settle(name, room, turn, reply.event === errorEvent ? refusal(reply.data) : undefined, reply);
                tell();

            },
            ( caught: unknown ) => {

                settle(name, room, turn, faulted(caught, "socket.join"));
                tell();

            },
        );

    };
    const shed = ( cause: error.Fault, all: boolean ): void => {

        const shut = closed(cause);

        if ( all ) {

            outbox.length = 0;
            loose = 0;

        }

        for ( const [id, entry] of waiting ) {

            if ( !all && !entry.sent ) continue;

            waiting.delete(id);
            entry.reject(shut);

        }

        for ( const room of rooms.values() ) {

            const waiter = room.gate;

            room.joined = false;
            room.asking = 0;

            if ( !all || !waiter ) continue;

            room.gate = undefined;
            waiter.reject(shut);

        }

    };
    const abandon = ( code?: number, reason?: string ): void => {

        const made = socket;

        epoch += 1;
        socket = undefined;
        ident = undefined;
        quiet = false;

        if ( guard !== undefined ) clearTimeout(guard);
        if ( again !== undefined ) clearTimeout(again);
        if ( pulse !== undefined ) clearInterval(pulse);

        guard = undefined;
        again = undefined;
        pulse = undefined;

        if ( !made ) return;

        made.onopen = null;
        made.onclose = null;
        made.onmessage = null;
        made.onerror = func.noop;

        try {

            made.close(code, reason);

        } catch {

            adapter.probe(() => made.close());

        }

    };
    const lost = ( cause: error.Fault, final: boolean, code?: number, reason?: string ): void => {

        if ( plan && status === "open" && date.now() - started >= plan.steady ) attempts = 0;

        const next = final || !plan || attempts >= plan.limit ? undefined : plan;

        abandon(code, reason);
        last = cause;
        shed(cause, !next);

        if ( next ) {

            mark("connecting");
            again = later(pause(next, attempts), () => {

                again = undefined;
                begin();
                tell();

            });

            return;

        }

        const waiter = gate;

        wanted = false;
        gate = undefined;
        mark("failed");
        waiter?.reject(cause);

    };
    const ended = ( code: unknown, reason: unknown ): void => {

        const how = typeof code === "number" ? code : 1006;
        const why = typeof reason === "string" ? reason : "";

        lost(ending(how, why), adapter.probe(() => plan?.when(how, why)) === false);

    };
    const tick = (): void => {

        if ( !quiet ) {

            quiet = true;
            push(encode({ event: pingEvent }));

            return;

        }

        lost(error.fault("timeout", "socket.heartbeat"), false, 4000, "heartbeat");
        tell();

    };
    const opened = ( token: unknown ): void => {

        if ( guard !== undefined ) clearTimeout(guard);

        guard = undefined;
        started = date.now();
        opens += 1;
        quiet = false;
        last = undefined;
        mark("open");

        if ( typeof token === "string" && token !== "" ) push(encode({ event: authEvent, data: { token } }));

        for ( const [name, room] of rooms ) enter(name, room);

        flush();

        if ( beat > 0 && beat !== Number.POSITIVE_INFINITY ) pulse = setInterval(tick, Math.min(beat, ceiling));

        gate?.resolve();
        gate = undefined;

    };
    const heard = ( raw: unknown ): void => {

        const frame = decode(raw, most);

        quiet = false;

        if ( !frame ) {

            refused += 1;

            return;

        }

        received += 1;

        if ( frame.event === pingEvent ) {

            push(encode({ event: pongEvent, id: frame.id }));

            return;

        }

        const entry = frame.id === undefined ? undefined : waiting.get(frame.id);

        if ( entry ) {

            entry.resolve(frame);

            return;

        }

        if ( frame.event === pongEvent || (frame.event === ackEvent && frame.id !== undefined) ) return;
        if ( frame.event === greetEvent && json.isRecord(frame.data) && named(frame.data.id) ) ident = frame.data.id;

        deliver(frame);

    };
    const dial = ( address: unknown, token: unknown ): void => {

        if ( typeof address !== "string" || !clean(address, 2048) || !reachable.test(address) ) {

            lost(error.fault("internal", "socket.url"), true);

            return;

        }

        let made: Socket;

        try {

            made = (options.factory ?? factory.get())(wired(address), options.protocols);

        } catch ( caught ) {

            lost(faulted(caught, "socket.open"), true);

            return;

        }

        socket = made;
        made.onopen = () => {

            if ( socket !== made || status === "open" ) return;

            opened(token);
            tell();

        };
        made.onmessage = ( message ) => {

            if ( socket !== made ) return;

            heard(message.data);
            tell();

        };
        made.onerror = func.noop;
        made.onclose = ( closing ) => {

            if ( socket !== made ) return;

            ended(closing.code, closing.reason);
            tell();

        };

        if ( made.readyState === 1 ) opened(token);

    };
    const begin = (): void => {

        epoch += 1;
        attempts += 1;

        const turn = epoch;

        mark("connecting");
        guard = later(limit, () => {

            guard = undefined;
            lost(error.fault("timeout", "socket.open"), false, 4000, "timeout");
            tell();

        });

        if ( typeof url !== "function" && typeof auth !== "function" ) {

            dial(url, auth);

            return;

        }

        void Promise.all([typeof url === "function" ? asked(url, "socket.url") : url, typeof auth === "function" ? asked(auth, "socket.auth") : auth]).then(
            ( [address, token] ) => {

                if ( turn !== epoch ) return;

                dial(address, token);
                tell();

            },
            ( caught: unknown ) => {

                if ( turn !== epoch ) return;

                const cause = faulted(caught, "socket.auth");

                lost(cause, !error.retryable(cause));
                tell();

            },
        );

    };
    const connection: Connection = {
        status: () => status,
        id: () => ident,
        cause: () => last,
        attempts: () => (status === "open" && date.now() - started >= (plan?.steady ?? 0) ? 0 : attempts),
        stats: () => ({ sent, received, refused, opens }),
        channels: () => [...rooms.keys()].sort(),
        joined: ( name ) => rooms.get(name)?.joined === true,
        watch: ( listener ) => states.on("status", ( note ) => listener(note.status, note.attempt)),
        connect: () => {

            if ( !wanted ) {

                wanted = true;
                attempts = 0;
                last = undefined;
                begin();

            }

            try {

                tell();

            } catch ( caught ) {

                return Promise.reject(caught);

            }

            if ( status === "open" ) return Promise.resolve();
            if ( status !== "connecting" ) return Promise.reject(last ?? closed());

            gate = gate ?? func.deferred<void>();

            return gate.promise;

        },
        close: ( code = 1000, reason = "" ) => {

            const waiter = gate;
            const cause = closed();

            wanted = false;
            gate = undefined;
            abandon(code, reason);
            last = undefined;
            shed(cause, true);
            mark("closed");
            waiter?.reject(cause);
            tell();

        },
        emit: ( name, data, channel ) => {

            const text = pack(name, data, channel, undefined);

            if ( status === "open" ) return !crowded() && push(text);
            if ( !wanted || loose >= spare ) return false;

            loose += 1;
            outbox.push({ text, id: undefined });

            return true;

        },
        request: <T = unknown>( name: string, data?: unknown, given: Ask = {} ): Promise<T> =>
            ask(name, data, given.channel, given).then(( reply ) => {

                if ( reply.event === errorEvent ) throw refusal(reply.data);

                return reply.data as T;

            }),
        on: ( name, handler, channel ) => {

            if ( name !== "*" && !named(name) ) throw error.fault("internal", "socket.event");
            if ( channel !== undefined && channel !== "" && !named(channel) ) throw error.fault("internal", "socket.channel");

            const rows = channel ? rowsOf(channel) : everywhere;
            const off = name === "*" ? rows.any(( frame ) => handler(frame.data, frame)) : rows.on(name, ( frame ) => handler(frame.data, frame));

            return () => {

                off();

                if ( channel && rows.count() === 0 && scoped.get(channel) === rows ) scoped.delete(channel);

            };

        },
        once: ( name, channel, wait ) => {

            const given = typeof wait === "number" ? { timeout: wait } : (wait ?? {});

            return bounded<unknown>("socket.wait", given.timeout, given.signal, ( resolve ) => connection.on(name, resolve, channel));

        },
        join: ( name ) => {

            if ( !named(name) ) return Promise.reject(error.fault("internal", "socket.channel"));

            const room = rooms.get(name) ?? { joined: false, asking: 0, gate: undefined };

            rooms.set(name, room);

            if ( room.joined ) return Promise.resolve();

            const waiter = room.gate ?? func.deferred<void>();

            room.gate = waiter;
            enter(name, room);

            return bounded<void>("socket.join", limit, undefined, ( resolve, reject ) => {

                void waiter.promise.then(resolve, reject);

                return func.noop;

            });

        },
        leave: ( name ) => {

            const room = rooms.get(name);

            if ( !room ) return Promise.resolve();

            rooms.delete(name);
            room.gate?.reject(error.fault("conflict", "socket.left"));

            if ( status !== "open" ) return Promise.resolve();

            return ask(leaveEvent, undefined, name).then(func.noop, ( caught: unknown ) => {

                if ( !error.isFault(caught) || caught.reason !== "socket.closed" ) throw caught;

            });

        },
    };

    if ( options.onStatus ) connection.watch(options.onStatus);

    return connection;

}
