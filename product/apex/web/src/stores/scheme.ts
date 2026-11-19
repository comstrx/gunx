import * as world from "engine/world";
import { host } from "@/specs/index.ts";
import { bind } from "@/stores/bind.ts";
import { box } from "@/stores/box.ts";

const own = "scheme.own";
export const schemed = host.own(( app ) => {

    const handed = host.carried().scheme;
    const told = app.config.settings.scheme;
    const held = box();
    const scheme: world.Theme<Record<string, string>> = world.theme({ tokens: app.theme().color, preference: world.isPreference(handed) ? handed : world.isPreference(told) ? told : "system", box: held, key: "scheme" });

    const adopt = (): void => {

        const given = host.carried().scheme;

        if ( world.isPreference(given) ) void held.get<boolean>(own).then(( chosen ) => (chosen === true ? undefined : scheme.hydrate().then(() => scheme.set(given)))).catch(( caught: unknown ) => app.report(caught, "scheme.inherit"));

    };

    adopt();
    host.active.subscribe(( name ) => {

        if ( name === app.name ) adopt();

    });

    return { scheme, bound: bind(scheme), chose: (): void => void held.set(own, true).catch(( caught: unknown ) => app.report(caught, "scheme.choose")) };

});

export function scheme (): world.Theme<Record<string, string>> {

    return schemed().scheme;

}
