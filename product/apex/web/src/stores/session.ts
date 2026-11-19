import * as auth from "engine/auth";
import * as cache from "engine/cache";
import * as exception from "engine/exception";
import * as json from "engine/json";
import { type Client, createClient } from "@/api/index.ts";
import { type Person, type Signed, transport } from "@/api/session.ts";
import { host } from "@/specs/index.ts";
import { instance } from "@/stores/preferences.ts";

type Handed = { tokens: auth.Tokens; user: Person };

function personOf ( found: Signed ): Person {

    const roles = found.memberships.find(( one ) => one.tenant_id === found.tenant)?.roles ?? [];

    return { id: found.user.id, email: found.user.email, name: found.user.name, roles, tenant: found.tenant };

}
function isHanded ( given: unknown ): given is Handed {

    return json.isRecord(given) && json.isRecord(given.tokens) && typeof given.tokens.access === "string" && json.isRecord(given.user) && typeof given.user.id === "string";

}

const made = host.own(( app ) => {

    if ( app.address === undefined ) throw exception.fault("internal", "spec.address", { message: "the surface names no api address; set contracts.baseUrl" });

    const open: Client = createClient({ baseUrl: app.address, client: app.compiled.surface.platform, wire: app.config.contracts.wire, locale: () => instance().getState().locale });
    const held = auth.session<Person>({
        name: "session",
        box: cache.open({ kind: cache.volatile("secure") ? app.config.settings.storage.secure : "secure", prefix: `${app.id}.session` }),
        renew: async ( refresh, signal ) => auth.withExpiry((await open.call(transport.renew, { refresh }, { signal })).data),
        fail: ( fault ) => app.report(fault, "session"),
    });
    const adopt = (): void => {

        const handed = host.carried().session;

        if ( isHanded(handed) ) held.begin(handed.tokens, handed.user);

    };

    held.watch(( user ) => app.live.patch({ user: user === null ? null : { ...user, abilities: user.roles } }));
    void held.hydrate().then(adopt).catch(( caught: unknown ) => app.report(caught, "session.restore"));
    host.active.subscribe(( name ) => {

        if ( name === app.name ) adopt();

    });

    return { open, held };

});

export function session (): auth.Session<Person> {

    return made().held;

}
export function carried ( asked: readonly string[] ): Record<string, unknown> {

    const { tokens, user } = session().state.getState();

    return asked.includes("session") && tokens !== null && user !== null ? { session: { tokens, user } } : {};

}
export async function request ( email: string ): Promise<void> {

    await made().open.call(transport.code, { email });

}
export async function start ( email: string, code: string ): Promise<Person> {

    const found = (await made().open.call(transport.start, { email, code })).data;
    const user = personOf(found);

    session().begin(auth.withExpiry({ access: found.access, refresh: found.refresh }), user);

    return user;

}
