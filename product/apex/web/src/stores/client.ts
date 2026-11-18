import type * as api from "engine/api";
import * as exception from "engine/exception";
import { createClient } from "@/api/index.ts";
import { host } from "@/specs/app.ts";
import { instance } from "@/stores/preferences.ts";
import { session } from "@/stores/session.ts";

export const client: () => api.Client = host.own(( app ) => {

    if ( app.address === undefined ) throw exception.fault("internal", "spec.address", { message: "the surface names no api address; set contracts.baseUrl" });

    return createClient({ baseUrl: app.address, wire: app.config.contracts.wire, locale: () => instance().getState().locale, token: () => session().token() });

});
