import * as date from "engine-date";
import * as event from "engine-event";
import * as func from "engine-func";
import * as json from "engine-json";
import type { Connection, Handler } from "./socket.ts";

export type Channel = {
    readonly name: string;
    joined: () => boolean;
    on: ( name: string, handler: Handler ) => () => void;
    once: ( name: string, wait?: number | event.Wait ) => Promise<unknown>;
    emit: ( name: string, data?: unknown ) => boolean;
    request: <T = unknown>( name: string, data?: unknown, wait?: number | event.Wait ) => Promise<T>;
    join: () => Promise<void>;
    leave: () => Promise<void>;
};
export type Member = { id: string; at: number; data?: unknown };
export type PresenceState = { members: readonly Member[]; count: number };
export type PresenceOptions = {
    joined?: string | undefined;
    left?: string | undefined;
    synced?: string | undefined;
    ask?: string | undefined;
    sync?: boolean | undefined;
    limit?: number | undefined;
    fail?: event.Fail | undefined;
};
export type Presence = {
    state: () => PresenceState;
    members: () => Member[];
    has: ( id: string ) => boolean;
    get: ( id: string ) => Member | undefined;
    sync: () => Promise<PresenceState>;
    watch: ( listener: ( state: PresenceState ) => void ) => () => void;
    stop: () => void;
};

function idOf ( value: unknown ): string | undefined {

    if ( typeof value === "string" ) return value === "" || value.length > 256 ? undefined : value;

    return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;

}
function memberOf ( value: unknown ): Member | undefined {

    const record = json.isRecord(value) ? value : undefined;
    const id = idOf(record ? record.id : value);

    if ( id === undefined ) return undefined;
    if ( !record ) return { id, at: date.now() };

    return { id, at: date.now(), data: Object.hasOwn(record, "data") ? record.data : record };

}
function listOf ( data: unknown ): readonly unknown[] | undefined {

    if ( Array.isArray(data) ) return data;

    return json.isRecord(data) && Array.isArray(data.actors) ? data.actors : undefined;

}

export function channel ( connection: Connection, name: string ): Channel {

    return {
        name,
        joined: () => connection.joined(name),
        on: ( heard, handler ) => connection.on(heard, handler, name),
        once: ( heard, wait ) => connection.once(heard, name, wait),
        emit: ( sent, data ) => connection.emit(sent, data, name),
        request: ( asked, data, wait ) => connection.request(asked, data, { ...(typeof wait === "number" ? { timeout: wait } : wait), channel: name }),
        join: () => connection.join(name),
        leave: () => connection.leave(name),
    };

}
export function presence ( connection: Connection, name: string, options: PresenceOptions = {} ): Presence {

    const { joined = "presence.joined", left = "presence.left", synced = "presence.synced", ask = "presence", limit = 5000, fail } = options;
    const state = event.signal<PresenceState>({ members: [], count: 0 }, { fail });
    let held = new Map<string, Member>();
    let live = true;

    if ( !(limit >= 0) ) throw new RangeError("not a count");

    const publish = (): void => {

        const members = [...held.values()];

        state.set({ members, count: members.length });

    };
    const replace = ( data: unknown ): void => {

        const listed = listOf(data);
        const next = new Map<string, Member>();

        if ( !listed || !live ) return;

        for ( const item of listed ) {

            const member = next.size < limit ? memberOf(item) : undefined;
            const known = member && held.get(member.id);

            if ( member ) next.set(member.id, !known ? member : json.equal(known.data, member.data) ? known : { ...member, at: known.at });

        }

        const before = state.get().members;
        const after = [...next.values()];

        held = next;

        if ( before.length !== after.length || after.some(( member, at ) => member !== before[at]) ) state.set({ members: after, count: after.length });

    };
    const sync = (): Promise<PresenceState> =>
        connection.request(ask, undefined, { channel: name }).then(( data ) => {

            replace(data);

            return state.get();

        });
    const refresh = (): void => {

        void connection.join(name).then(sync).catch(fail ?? func.noop);

    };
    const stops = [
        connection.on(joined, ( data ) => {

            const member = memberOf(data);
            const known = member && held.get(member.id);

            if ( !member || (known ? json.equal(known.data, member.data) : held.size >= limit) ) return;

            held.set(member.id, known ? { ...member, at: known.at } : member);
            publish();

        }, name),
        connection.on(left, ( data ) => {

            const id = idOf(json.isRecord(data) ? data.id : data);

            if ( id !== undefined && held.delete(id) ) publish();

        }, name),
        connection.on(synced, replace, name),
    ];

    if ( options.sync ) {

        stops.push(connection.watch(( status ) => {

            if ( status === "open" ) refresh();

        }));

        if ( connection.status() === "open" ) refresh();

    }

    return {
        state: state.get,
        members: () => [...state.get().members],
        has: ( id ) => held.has(id),
        get: ( id ) => held.get(id),
        sync,
        watch: ( listener ) => state.watch(( value ) => listener(value)),
        stop: () => {

            live = false;

            for ( const stop of stops.splice(0) ) stop();

        },
    };

}
