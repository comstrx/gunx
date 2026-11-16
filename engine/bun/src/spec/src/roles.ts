import * as error from "engine-error";
import * as json from "engine-json";
import type { Compiled, Named, Roles, RolesOptions } from "./arch.ts";
import { serialize } from "./compiled.ts";

export function roles<R extends Readonly<Record<string, object>>, C extends Compiled> ( options: RolesOptions<R, C> ): Roles<R, C> {

    const given: unknown = options.roles;
    const names = (json.isRecord(given) ? Object.keys(given) : []) as Named<R>[];
    const current = options.current ?? names[0];

    if ( names.length === 0 ) throw error.fault("internal", "spec.roles", { message: "roles name at least one role, such as { admin }" });
    if ( typeof options.compile !== "function" ) throw error.fault("internal", "spec.roles", { message: "roles compile one role by its name, such as compile: compileRole" });
    if ( current === undefined || !names.includes(current) ) throw error.fault("internal", "spec.roles", { message: `${String(current)}: the current role is one of ${names.join(", ")}` });

    return Object.freeze({ roles: options.roles, names: Object.freeze([...names]), current, compile: options.compile, serialize });

}
