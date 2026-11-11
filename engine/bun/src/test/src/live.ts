import * as error from "engine-error";
import * as json from "engine-json";
import * as socket from "engine-socket";

export type Caller = { id: string; token: string | undefined };
export type LiveOptions = {
    auth?: (( token: string | undefined ) => boolean) | undefined;
    gate?: (( channel: string, from: Caller ) => boolean) | undefined;
    onFrame?: (( frame: socket.Frame, reply: ( frame: socket.Frame ) => void, from: Caller ) => boolean | undefined | Promise<boolean | undefined>) | undefined;
};
export type Live = {
    url: string;
    port: number;
    clients: () => number;
    broadcast: ( frame: socket.Frame ) => void;
    received: () => socket.Frame[];
    drop: ( code?: number, reason?: string ) => void;
    stop: () => void;
};

type Data = { id: string; token: string | undefined; passed: boolean; channels: Set<string> };
type Client = { send: ( text: string ) => unknown; close: ( code?: number, reason?: string ) => void; data: Data };

const kept = 10_000;

export function live ( options: LiveOptions = {} ): Live {

    const received: socket.Frame[] = [];
    const sockets = new Set<Client>();
    let counter = 0;
    let stopped = false;

    function admits ( token: string | undefined ): boolean {

        const judged = error.attemptSync(() => options.auth === undefined || options.auth(token) === true);

        return judged.ok && judged.value;

    }
    function opens ( channel: string, from: Caller ): boolean {

        const judged = error.attemptSync(() => options.gate === undefined || options.gate(channel, from) === true);

        return judged.ok && judged.value;

    }
    function heard ( client: Client, frame: socket.Frame ): void {

        const held = client.data;
        const reply = ( out: socket.Frame ): void => {

            if ( sockets.has(client) ) client.send(socket.encode(out));

        };
        const refuse = ( code: string, reason: string ): void => reply({ event: "error", data: { code, reason }, channel: frame.channel, id: frame.id });

        received.push(frame);

        if ( received.length > kept ) received.splice(0, received.length - kept);

        if ( frame.event === "auth" ) {

            held.token = json.isRecord(frame.data) && typeof frame.data.token === "string" ? frame.data.token : undefined;
            held.passed = admits(held.token);

            if ( !held.passed ) client.close(4001, "unauthorized");

            return;

        }

        if ( !held.passed ) held.passed = admits(undefined);

        if ( !held.passed ) {

            client.close(4001, "unauthorized");

            return;

        }

        const from: Caller = { id: held.id, token: held.token };

        if ( frame.event === "ping" ) {

            reply({ event: "pong", data: {}, id: frame.id });

            return;

        }

        if ( frame.event === "join" && frame.channel !== undefined ) {

            if ( !opens(frame.channel, from) ) {

                refuse("forbidden", "socket.forbidden");

                return;

            }

            held.channels.add(frame.channel);
            reply({ event: "joined", data: { channel: frame.channel }, channel: frame.channel, id: frame.id });

            return;

        }

        if ( frame.event === "leave" && frame.channel !== undefined ) {

            held.channels.delete(frame.channel);
            reply({ event: "left", data: { channel: frame.channel }, channel: frame.channel, id: frame.id });

            return;

        }

        void Promise.resolve()
            .then(() => options.onFrame?.(frame, reply, from))
            .then(( handled ) => {

                if ( !handled && frame.id !== undefined ) reply({ event: "ack", id: frame.id, data: frame.data });

            })
            .catch(( caught: unknown ) => {

                const fault = error.of(caught);

                refuse(fault.code, fault.reason ?? "socket.handler");

            });

    }

    const server = Bun.serve<Data>({
        hostname: "127.0.0.1",
        port: 0,
        fetch ( request, host ) {

            counter += 1;

            if ( host.upgrade(request, { data: { id: `c${counter}`, token: undefined, passed: false, channels: new Set<string>() } }) ) return undefined;

            return new Response("websocket only", { status: 426 });

        },
        websocket: {
            open ( client ) {

                sockets.add(client);
                client.send(socket.encode({ event: "connected", data: { id: client.data.id } }));

            },
            close ( client ) {

                sockets.delete(client);

            },
            message ( client, raw ) {

                const frame = socket.decode(raw);

                if ( frame ) heard(client, frame);

            },
        },
    });

    return {
        url: `ws://127.0.0.1:${server.port}`,
        port: server.port ?? 0,
        clients: () => sockets.size,
        received: () => [...received],
        broadcast: ( frame ) => {

            const text = socket.encode(frame);

            for ( const client of sockets ) {

                if ( frame.channel === undefined || client.data.channels.has(frame.channel) ) client.send(text);

            }

        },
        drop: ( code = 1012, reason = "restart" ) => {

            for ( const client of [...sockets] ) client.close(code, reason);

        },
        stop: () => {

            if ( stopped ) return;

            stopped = true;

            for ( const client of [...sockets] ) client.close(1001, "stopped");

            void server.stop(true);

        },
    };

}
