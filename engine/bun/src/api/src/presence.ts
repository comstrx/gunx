import * as date from "engine-date";
import * as event from "engine-event";
import * as func from "engine-func";
import * as json from "engine-json";
import type * as socket from "engine-socket";
import type { Member, Presence, PresenceOptions, PresenceState } from "./arch.ts";

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

export function presence ( connection: socket.Connection, name: string, options: PresenceOptions = {} ): Presence {

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
