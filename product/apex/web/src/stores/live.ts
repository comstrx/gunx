import * as api from "engine/api";
import type * as spec from "engine/spec";
import { session } from "@/stores/session.ts";

export function live ( app: spec.App ): spec.Feeder | undefined {

    const path = app.config.contracts.live;

    if ( app.address === undefined || typeof path !== "string" || path === "" ) return undefined;

    const held = session();
    const door = api.live({ url: `${app.address}${path}`, token: () => held.token(), fail: ( caught ) => app.report(caught, "live") });

    let last = held.state.getState().user?.id;

    held.watch(( user ) => {

        if ( user?.id === last ) return;

        last = user?.id;
        door.close();

    });

    return { open: door.open, subscribe: ( feature, handler ) => door.subscribe(feature, handler, held.state.getState().user?.id) };

}
