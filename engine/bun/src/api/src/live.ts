import * as error from "engine-error";
import * as json from "engine-json";
import * as socket from "engine-socket";

export type Patch = { key?: string | undefined; version?: string | undefined; at?: "start" | "end" | undefined };
export type Patched = { value: unknown; applied: boolean };
export type Events = { created: string; updated: string; deleted: string };
export type Realtime = {
    url: socket.Options["url"];
    token?: (() => string | null | undefined | Promise<string | null | undefined>) | undefined;
    channel?: string | undefined;
    events?: Partial<Events> | undefined;
    key?: string | undefined;
    version?: string | undefined;
    protocols?: socket.Options["protocols"];
    reconnect?: socket.Options["reconnect"];
    heartbeat?: number | undefined;
    timeout?: number | undefined;
    factory?: socket.SocketFactory | undefined;
    fail?: socket.Options["fail"];
    onStatus?: socket.Options["onStatus"];
};
export type Change = "created" | "updated" | "deleted" | "other";
export type Delivery = { change: Change; event: string; data: unknown; channel: string | undefined };
export type Live = {
    readonly status: () => socket.Status;
    open: () => Promise<void>;
    close: () => void;
    channelOf: ( feature: string, id?: string | number ) => string;
    subscribe: ( feature: string, handler: ( delivery: Delivery ) => void, id?: string | number ) => () => void;
    request: <T = unknown>( event: string, data?: unknown, channel?: string ) => Promise<T>;
    emit: ( event: string, data?: unknown, channel?: string ) => boolean;
    on: ( event: string, handler: socket.Handler, channel?: string ) => () => void;
    watch: ( listener: Listener ) => () => void;
    patch: ( current: unknown, many: boolean, delivery: Delivery ) => Patched;
};

type Listener = ( status: socket.Status, attempt: number ) => void;
type Entry = { event: string; channel: string | undefined; handler: socket.Handler; off: (() => void) | undefined };
type Watcher = { listener: Listener; off: (() => void) | undefined };

const slot = "{feature}";
const counted = /^\d{1,15}(?:\.\d{1,9})?$/;
const quiet: ReadonlySet<string> = new Set(["ping", "pong", "ack"]);

export const liveHouse = { channel: "{feature}", events: { created: "{feature}.created", updated: "{feature}.updated", deleted: "{feature}.deleted" }, key: "id" } as const;

function fill ( template: string, feature: string ): string {

    return template.split(slot).join(feature);

}
function namesOf ( feature: string, events: Partial<Events> | undefined ): Events {

    return {
        created: fill(events?.created ?? liveHouse.events.created, feature),
        updated: fill(events?.updated ?? liveHouse.events.updated, feature),
        deleted: fill(events?.deleted ?? liveHouse.events.deleted, feature),
    };

}
function changed ( event: string, names: Events ): Change {

    return event === names.created ? "created" : event === names.updated ? "updated" : event === names.deleted ? "deleted" : "other";

}
function stamp ( value: unknown ): number | string | undefined {

    if ( typeof value === "number" ) return Number.isFinite(value) ? value : undefined;
    if ( typeof value !== "string" || value === "" ) return undefined;

    return counted.test(value) ? Number(value) : value;

}
function newer ( current: json.Dictionary, incoming: json.Dictionary, version: string | undefined ): boolean {

    if ( !version ) return true;

    const before = stamp(current[version]);
    const after = stamp(incoming[version]);

    if ( before === undefined || after === undefined ) return true;
    if ( typeof before === "number" && typeof after === "number" ) return after >= before;

    return String(after) >= String(before);

}
function same ( left: unknown, right: unknown ): boolean {

    if ( left === right ) return true;

    return (typeof left === "string" || typeof left === "number") && (typeof right === "string" || typeof right === "number") && String(left) === String(right);

}

export function applyPatch ( current: unknown, many: boolean, change: Change, data: unknown, patch: Patch = {} ): Patched {

    const key = patch.key ?? liveHouse.key;
    const untouched = { value: current, applied: false };

    if ( !json.isRecord(data) || !Object.hasOwn(data, key) || data[key] === undefined || data[key] === null ) return untouched;

    const id = data[key];

    if ( many ) {

        const rows: readonly unknown[] = Array.isArray(current) ? current : [];
        const at = rows.findIndex(( row ) => json.isRecord(row) && same(row[key], id));
        const held = rows[at];

        if ( change === "deleted" ) return at === -1 ? untouched : { value: rows.filter(( _, index ) => index !== at), applied: true };
        if ( !json.isRecord(held) ) return change === "created" ? { value: patch.at === "end" ? [...rows, data] : [data, ...rows], applied: true } : untouched;
        if ( !newer(held, data, patch.version) ) return untouched;

        return { value: rows.map(( row, index ) => (index === at ? { ...held, ...data, [key]: held[key] } : row)), applied: true };

    }

    if ( !json.isRecord(current) || !same(current[key], id) || change === "deleted" || !newer(current, data, patch.version) ) return untouched;

    return { value: { ...current, ...data, [key]: current[key] }, applied: true };

}
export function changeOf ( event: string, feature: string, events: Partial<Events> = liveHouse.events ): Change {

    return changed(event, namesOf(feature, events));

}
export function live ( options: Realtime ): Live {

    const entries = new Set<Entry>();
    const watchers = new Set<Watcher>();
    const rooms = new Map<string, number>();
    let connection: socket.Connection | undefined;

    function told ( link: socket.Connection, cause: unknown ): void {

        if ( error.isFault(cause) && (cause.reason === "socket.left" || cause.reason === "socket.closed" || (cause.code === "timeout" && link.status() !== "open")) ) return;

        options.fail?.(cause);

    }
    function connect (): socket.Connection {

        if ( connection ) return connection;

        const link = socket.open({
            url: options.url,
            auth: options.token ? async () => (await options.token?.()) ?? undefined : undefined,
            protocols: options.protocols,
            reconnect: options.reconnect,
            heartbeat: options.heartbeat,
            timeout: options.timeout,
            factory: options.factory,
            fail: options.fail,
            onStatus: options.onStatus,
        });

        connection = link;

        for ( const entry of entries ) entry.off = link.on(entry.event, entry.handler, entry.channel);
        for ( const watcher of watchers ) watcher.off = link.watch(watcher.listener);
        for ( const channel of rooms.keys() ) void link.join(channel).catch(( cause: unknown ) => told(link, cause));

        return link;

    }
    function listen ( event: string, handler: socket.Handler, channel: string | undefined ): () => void {

        const entry: Entry = { event, channel, handler, off: connect().on(event, handler, channel) };

        entries.add(entry);

        return () => {

            if ( !entries.delete(entry) ) return;

            entry.off?.();
            entry.off = undefined;

        };

    }
    function enter ( channel: string ): void {

        const link = connect();
        const count = rooms.get(channel) ?? 0;

        rooms.set(channel, count + 1);

        if ( count === 0 ) void link.join(channel).catch(( cause: unknown ) => told(link, cause));

    }
    function exit ( channel: string ): void {

        const count = rooms.get(channel) ?? 0;
        const link = connection;

        if ( count > 1 ) {

            rooms.set(channel, count - 1);

            return;

        }

        rooms.delete(channel);

        if ( count === 1 && link ) void link.leave(channel).catch(( cause: unknown ) => told(link, cause));

    }
    function channelOf ( feature: string, id?: string | number ): string {

        const base = fill(options.channel ?? liveHouse.channel, feature);

        return id === undefined ? base : `${base}.${String(id)}`;

    }

    return {
        channelOf,
        status: () => connection?.status() ?? "idle",
        open: () => connect().connect(),
        close: () => {

            connection?.close();
            connection = undefined;

            for ( const entry of entries ) entry.off = undefined;
            for ( const watcher of watchers ) watcher.off = undefined;

        },
        request: ( event, data, channel ) => connect().request(event, data, channel ? { channel } : {}),
        emit: ( event, data, channel ) => connect().emit(event, data, channel),
        on: ( event, handler, channel ) => listen(event, handler, channel),
        watch: ( listener ) => {

            const watcher: Watcher = { listener, off: connection?.watch(listener) };

            watchers.add(watcher);

            return () => {

                if ( !watchers.delete(watcher) ) return;

                watcher.off?.();
                watcher.off = undefined;

            };

        },
        patch: ( current, many, delivery ) => applyPatch(current, many, delivery.change, delivery.data, { key: options.key, version: options.version }),
        subscribe: ( feature, handler, id ) => {

            const channel = channelOf(feature, id);
            const names = namesOf(feature, options.events);
            const stop = listen("*", ( data, frame ) => {

                if ( quiet.has(frame.event) ) return;

                handler({ change: changed(frame.event, names), event: frame.event, data, channel: frame.channel });

            }, channel);
            let bound = true;

            enter(channel);

            return () => {

                if ( !bound ) return;

                bound = false;
                stop();
                exit(channel);

            };

        },
    };

}
