import * as exception from "engine/exception";
import type { Spoken, Window } from "../host/contract.ts";

export type Hosted = { name: string; settings: { app: { name: string; identifier: string; version: string }; window: Window } };

export function hosted ( { name, settings }: Hosted ): Spoken {

    if ( settings.app.name === "" || settings.app.identifier === "" ) throw exception.fault("validation", "host.identity", { message: `${name}: a desktop build needs settings.app with a name and an identifier` });

    return { identity: name, name: settings.app.name, identifier: settings.app.identifier, version: settings.app.version, window: settings.window };

}
