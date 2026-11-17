import * as date from "engine-date";
import * as device from "engine-device";
import * as event from "engine-event";
import * as exception from "engine-exception";
import * as func from "engine-func";
import * as rand from "engine-rand";
import * as string from "engine-string";
import type { Ask, Command, Connection, Frame, Frames, Held, Note, Options, Plan, Reconnect, Room, Rows, Socket, SocketFactory, Status, Timer, Waiting } from "./arch.ts";

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
function fits ( text: string, most: number ): boolean {

    return text.length <= most && (text.length * 3 <= most || string.byteLength(text) <= most);

}
function textOf ( raw: unknown, most: number ): string | undefined {

    const bytes = raw instanceof Uint8Array ? raw : raw instanceof ArrayBuffer ? new Uint8Array(raw) : undefined;

    if ( !bytes || bytes.byteLength > most ) return undefined;

    reader = reader ?? new TextDecoder();

    return reader.decode(bytes);

}
function span ( value: number | undefined, fallback: number ): number {

    if ( value === undefined ) return fallback;
    if ( !(value >= 0) ) throw exception.misuse("not a duration");

    return value;

}
function sized ( value: number | undefined, fallback: number ): number {

    if ( value === undefined ) return fallback;
    if ( !(value >= 0) ) throw exception.misuse("not a size");

    return value;

}
function planOf ( given: Reconnect | false | undefined, retry?: ( code: number, reason: string ) => boolean ): Plan | undefined {

    if ( given === false ) return undefined;

    const { factor = 2, limit = 8 } = given ?? {};

    if ( !(factor >= 1) ) throw exception.misuse("not a factor");
    if ( !(limit >= 0) ) throw exception.misuse("not a count");

    return { min: span(given?.min, 500), max: span(given?.max, 30_000), factor, limit, steady: span(given?.steady, 5000), when: given?.when ?? retry ?? (( code ) => code !== 1000 && code !== 1008) };

}
function pause ( plan: Plan, attempts: number ): number {

    const base = Math.min(plan.max, plan.min * Math.min(plan.factor ** Math.max(0, attempts - 1), 1e9));

    return Math.min(ceiling, exception.probe(() => rand.jitter(base, 0.25)) ?? base);

}
function later ( ms: number, work: () => void ): Timer | undefined {

    return ms === Number.POSITIVE_INFINITY ? undefined : setTimeout(work, Math.min(ms, ceiling));

}
function faulted ( caught: unknown, reason: string ): exception.Fault {

    return exception.isFault(caught) ? caught : exception.fault("unavailable", reason, { cause: caught });

}
function closed ( cause?: exception.Fault ): exception.Fault {

    return cause?.reason === "socket.closed" ? cause : exception.fault("unavailable", "socket.closed", cause ? { cause } : {});

}
function asked<T> ( read: () => T | Promise<T>, reason: string ): Promise<T> {

    return exception.mend(new Promise<T>(( resolve ) => resolve(read())), ( caught ) => {

        throw faulted(caught, reason);

    });

}
function bounded<T> ( reason: string, limit: number | undefined, signal: AbortSignal | undefined, arm: ( resolve: ( value: T ) => void, reject: ( cause: unknown ) => void ) => () => void ): Promise<T> {

    if ( limit !== undefined && !(limit >= 0) ) return Promise.reject(exception.misuse("not a duration"));
    if ( signal?.aborted ) return Promise.reject(exception.fault("timeout", "socket.aborted", { cause: signal.reason }));

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

            if ( end() ) reject(exception.fault("timeout", "socket.aborted", { cause: signal?.reason }));

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

            if ( end() ) reject(exception.fault("timeout", reason));

        });

        signal?.addEventListener("abort", abort, { once: true });

        if ( signal?.aborted ) abort();

    });

}

function posted ( socket: Socket, text: string ): void {

    socket.send(text);

}

export const factory: exception.Slot<SocketFactory> = exception.slot<SocketFactory>("socket.factory", {
    fallback: () => {

        const found = device.host<{ WebSocket?: new ( url: string, protocols?: string | string[] ) => unknown }>().WebSocket;

        return found ? ( url, protocols ) => new found(url, protocols) as Socket : undefined;

    },
});
export function open ( options: Options ): Connection {

    const { url, prepare, protocol, fail } = options;
    const plan = planOf(options.reconnect, protocol.retry);
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
    let last: exception.Fault | undefined;
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

        if ( made?.readyState !== 1 || exception.threw(exception.run(posted, made, text)) ) return false;

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
    const pack = ( name: string, data: unknown, channel: string | undefined, id: string | undefined, command?: Command ): string => {

        if ( !command && !named(name) ) throw exception.fault("internal", "socket.event");
        if ( channel !== undefined && channel !== "" && !named(channel) ) throw exception.fault("internal", "socket.channel");

        const text = protocol.encode({ event: name, data, channel: channel || undefined, id }, command);

        if ( !fits(text, most) ) throw exception.fault("too_large", "socket.frame");

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
    const ask = ( name: string, data: unknown, channel: string | undefined, wait: event.Wait = {}, command?: Command ): Promise<Frame> => {

        if ( !wanted ) return Promise.reject(closed(last));

        serial += 1;

        const id = `${stem}-${serial.toString(36)}`;
        const text = exception.run(() => pack(name, data, channel, id, command));

        if ( exception.threw(text) ) return Promise.reject(text.caught);

        return bounded<Frame>("socket.request", wait.timeout ?? limit, wait.signal, ( resolve, reject ) => {

            const entry: Waiting = { resolve, reject, sent: false };
            const direct = status === "open";

            if ( waiting.size >= crowd || (direct ? crowded() : outbox.length >= crowd) ) {

                reject(exception.fault("unavailable", "socket.busy"));

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
    const settle = ( name: string, room: Room, turn: number, cause: exception.Fault | undefined, reply?: Frame ): void => {

        if ( rooms.get(name) !== room || room.asking !== turn ) return;

        const waiter = room.gate;

        room.asking = 0;
        room.gate = undefined;

        if ( !cause ) {

            room.joined = true;
            waiter?.resolve();

            return;

        }

        if ( reply && !exception.retryable(cause) ) rooms.delete(name);

        if ( waiter ) waiter.reject(cause.reason === "socket.request" ? exception.fault("timeout", "socket.join", { cause }) : cause);
        else if ( reply ) deliver({ event: reply.event, data: reply.data, channel: name });

    };
    const enter = ( name: string, room: Room ): void => {

        if ( room.joined || room.asking !== 0 || status !== "open" ) return;

        asks += 1;

        const turn = asks;

        room.asking = turn;
        void exception.mend(ask("", undefined, name, {}, "join").then(
            ( reply ) => {

                settle(name, room, turn, protocol.kind(reply) === "error" ? protocol.fault(reply) : undefined, reply);
                tell();

            },
        ), ( caught ) => {

            settle(name, room, turn, faulted(caught, "socket.join"));
            tell();

        });

    };
    const shed = ( cause: exception.Fault, all: boolean ): void => {

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

        exception.rescue(() => {

            made.close(code, reason);

        }, () => {

            exception.probe(() => made.close());

        });

    };
    const lost = ( cause: exception.Fault, final: boolean, code?: number, reason?: string ): void => {

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

        lost(exception.probe(() => protocol.ending?.(how, why)) ?? exception.fault("unavailable", "socket.closed", { cause: { code: how, reason: why } }), exception.probe(() => plan?.when(how, why)) === false);

    };
    const tick = (): void => {

        if ( !quiet ) {

            quiet = true;

            exception.rescue(() => {

                push(pack("", undefined, undefined, undefined, "ping"));

            }, ( cause ) => {

                lost(faulted(cause, "socket.protocol"), true);

            });

            return;

        }

        lost(exception.fault("timeout", "socket.heartbeat"), false, 4000, "heartbeat");
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

        if ( typeof token === "string" && token !== "" ) push(token);

        for ( const [name, room] of rooms ) enter(name, room);

        flush();

        if ( beat > 0 && beat !== Number.POSITIVE_INFINITY ) pulse = setInterval(tick, Math.min(beat, ceiling));

        gate?.resolve();
        gate = undefined;

    };
    const heard = ( raw: unknown ): void => {

        const text = typeof raw === "string" ? raw : textOf(raw, most);
        const frame = text !== undefined && fits(text, most) ? exception.probe(() => protocol.decode(text)) : undefined;

        if ( !frame ) {

            refused += 1;

            return;

        }

        exception.rescue(() => {

            const kind = protocol.kind(frame);
            const identity = kind === "hello" ? protocol.identity(frame) : undefined;

            received += 1;
            quiet = false;

            if ( kind === "ping" ) {

                push(pack("", undefined, undefined, frame.id, "pong"));

                return;

            }

            const entry = frame.id === undefined ? undefined : waiting.get(frame.id);

            if ( entry ) {

                entry.resolve(frame);

                return;

            }

            if ( kind === "quiet" ) return;
            if ( kind === "hello" ) ident = identity;

            deliver(frame);

        }, () => {

            refused += 1;

        });

    };
    const dial = ( address: unknown, token: unknown ): void => {

        if ( typeof address !== "string" || !clean(address, 2048) || !reachable.test(address) ) {

            lost(exception.fault("internal", "socket.url"), true);

            return;

        }

        if ( typeof token === "string" && !fits(token, most) ) {

            lost(exception.fault("too_large", "socket.frame"), true);

            return;

        }

        const made = exception.run(() => (options.factory ?? factory.get())(wired(address), options.protocols));

        if ( exception.threw(made) ) {

            lost(faulted(made.caught, "socket.open"), true);

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
            lost(exception.fault("timeout", "socket.open"), false, 4000, "timeout");
            tell();

        });

        if ( typeof url !== "function" && !prepare ) {

            dial(url, undefined);

            return;

        }

        void Promise.all([typeof url === "function" ? asked(url, "socket.url") : url, prepare ? asked(prepare, "socket.prepare") : undefined]).then(
            ( [address, token] ) => {

                if ( turn !== epoch ) return;

                dial(address, token);
                tell();

            },
            ( caught: unknown ) => {

                if ( turn !== epoch ) return;

                const cause = faulted(caught, "socket.prepare");

                lost(cause, !exception.retryable(cause));
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

            const told = exception.run(tell);

            if ( exception.threw(told) ) return Promise.reject(told.caught);

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

                if ( protocol.kind(reply) === "error" ) throw protocol.fault(reply);

                return reply.data as T;

            }),
        on: ( name, handler, channel ) => {

            if ( name !== "*" && !named(name) ) throw exception.fault("internal", "socket.event");
            if ( channel !== undefined && channel !== "" && !named(channel) ) throw exception.fault("internal", "socket.channel");

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

            if ( !named(name) ) return Promise.reject(exception.fault("internal", "socket.channel"));

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
            room.gate?.reject(exception.fault("conflict", "socket.left"));

            if ( status !== "open" ) return Promise.resolve();

            return exception.mend(ask("", undefined, name, {}, "leave").then(func.noop), ( caught ) => {

                if ( !exception.isFault(caught) || caught.reason !== "socket.closed" ) throw caught;

            });

        },
    };

    if ( options.onStatus ) connection.watch(options.onStatus);

    return connection;

}
