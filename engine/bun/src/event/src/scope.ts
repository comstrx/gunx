import type { Bus, Pattern } from "./bus.ts";

export type Scoped = Omit<Bus, "clear"> & { readonly prefix: string };

export function scope ( bus: Omit<Bus, "clear">, prefix: string ): Scoped {

    const head = prefix === "" || prefix.endsWith(".") ? prefix : `${prefix}.`;
    const full = ( topic: string ): string => `${head}${topic}`;

    return {
        prefix: head.slice(0, -1),
        publish: ( topic, payload ) => bus.publish(full(topic), payload),
        subscribe: ( pattern, subscriber, options ) => bus.subscribe(full(pattern), subscriber, options),
        once: ( pattern, options ) => bus.once(full(pattern), options),
        last: ( topic ) => bus.last(full(topic)),
        history: ( pattern = "**" ) => bus.history(full(pattern)),
        topics: () => bus.topics().filter(( topic ) => topic.startsWith(head)).map(( topic ) => topic.slice(head.length)),
        count: ( pattern = "**" ) => bus.count(full(pattern)),
        forget: ( pattern = "**" ) => bus.forget(full(pattern)),
    };

}
export function pipe ( from: Pick<Bus, "subscribe">, to: Pick<Bus, "publish">, pattern: Pattern = "**", rename: ( topic: string ) => string = ( topic ) => topic ): () => void {

    return from.subscribe(pattern, ( payload, message ) => {

        to.publish(rename(message.topic), payload);

    });

}
