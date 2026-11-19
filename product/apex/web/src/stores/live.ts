import { connect } from "@/api/index.ts";
import type * as spec from "@/specs/index.ts";
import { session } from "@/stores/session.ts";

export function live ( app: spec.App ): spec.Feeder | undefined {

    const told = app.config.contracts.live;

    if ( app.address === undefined || told.path === "" ) return undefined;

    const held = session();
    const door = connect({ url: `${app.address}${told.path}`, channel: told.channel, events: told.events, key: told.key, token: () => held.token(), fail: ( caught ) => app.report(caught, "live") });

    let last = held.state.getState().user?.id;

    held.watch(( user ) => {

        if ( user?.id === last ) return;

        last = user?.id;
        door.close();

    });

    return { open: door.open, subscribe: ( feature, handler ) => door.subscribe(feature, handler, held.state.getState().user?.id) };

}
