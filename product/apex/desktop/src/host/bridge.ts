import type { Answer, Bridge, Info, Input, Request } from "@host/contract.ts";
import { connect } from "@host/view.ts";
import * as exception from "engine/exception";

export type Host = {
    ready: () => boolean;
    opened: () => Promise<boolean>;
    info: () => Promise<Info | null>;
    title: ( text: string ) => Promise<void>;
    open: ( url: string ) => Promise<boolean>;
    mark: () => void;
};

export function createHost ( opener: () => Promise<Bridge | null> ): Host {

    let bridge: Bridge | null = null;
    const opening = opener().then(( found ) => {

        bridge = found;

        return found;

    }, () => null);
    const ask = async <K extends Request>( name: K, params: Input<K> ): Promise<Answer<K>> => {

        const found = await opening;

        if ( !found ) throw exception.fault("unavailable", "host.absent");

        return found.ask(name, params);

    };

    return {
        ready: () => bridge !== null,
        opened: async () => (await opening) !== null,
        info: async () => ((await opening) ? ask("info", undefined) : null),
        title: ( text ) => ask("title", { title: text }),
        open: ( url ) => ask("open", { url }),
        mark: () => {

            bridge?.tell("ready", { at: Date.now() });

        },
    };

}

export const host: Host = createHost(connect);
