import type { Channel, Connection } from "./arch.ts";

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
