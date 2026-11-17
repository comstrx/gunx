import * as exception from "engine-exception";
import * as json from "engine-json";
import * as socket from "engine-socket";
import * as string from "engine-string";
import type { Connect } from "./arch.ts";

let reader: TextDecoder | undefined;

export function encodeFrame ( frame: socket.Frame ): string {

    return json.stringify({ event: frame.event, data: frame.data, channel: frame.channel, id: frame.id });

}
export function decodeFrame ( raw: unknown, limit: number = 65_536 ): socket.Frame | undefined {

    const bytes = raw instanceof Uint8Array ? raw : raw instanceof ArrayBuffer ? new Uint8Array(raw) : undefined;
    let text: string;

    if ( typeof raw === "string" ) text = raw;
    else {

        if ( !bytes || bytes.byteLength > limit ) return undefined;

        reader = reader ?? new TextDecoder();
        text = reader.decode(bytes);

    }

    if ( text.length > limit || (text.length * 3 > limit && string.byteLength(text) > limit) ) return undefined;

    const parsed = json.parse(text);

    if ( !json.isRecord(parsed) || typeof parsed.event !== "string" || parsed.event === "" ) return undefined;

    return { event: parsed.event, data: parsed.data, channel: typeof parsed.channel === "string" && parsed.channel !== "" ? parsed.channel : undefined, id: typeof parsed.id === "string" && parsed.id !== "" ? parsed.id : undefined };

}
function identityOf ( frame: socket.Frame ): string | undefined {

    const id = json.isRecord(frame.data) ? frame.data.id : undefined;

    if ( typeof id !== "string" || id.length === 0 || id.length > 256 ) return undefined;

    for ( let at = 0; at < id.length; at += 1 ) {

        const code = id.charCodeAt(at);

        if ( code < 33 || code === 127 ) return undefined;

    }

    return id;

}
export const liveProtocol: socket.Protocol = {
    encode: ( frame, command ) => encodeFrame(command ? { ...frame, event: command } : frame),
    decode: ( text ) => decodeFrame(text, Number.POSITIVE_INFINITY),
    kind: ( frame ) => frame.event === "ping" ? "ping" : frame.event === "pong" || (frame.event === "ack" && frame.id !== undefined) ? "quiet" : frame.event === "error" ? "error" : frame.event === "connected" ? "hello" : undefined,
    fault: ( frame ) => exception.fromJson(frame.data) ?? exception.fromEnvelope(frame.data, 400),
    identity: identityOf,
    ending: ( code, reason ) => exception.fault(code === 4001 ? "unauthorized" : code === 1008 ? "forbidden" : "unavailable", code === 4001 || code === 1008 ? "socket.refused" : "socket.closed", { cause: { code, reason } }),
    retry: ( code ) => code !== 1000 && code !== 1008 && code !== 4001,
};
export function connect ( options: Connect ): socket.Connection {

    const { auth, ...rest } = options;
    const prepare = auth === undefined ? undefined : async (): Promise<string | undefined> => {

        const token = typeof auth === "function" ? await auth() : auth;

        return token ? encodeFrame({ event: "auth", data: { token } }) : undefined;

    };

    return socket.open({ ...rest, protocol: liveProtocol, prepare });

}
