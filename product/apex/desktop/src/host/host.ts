import type { Spoken, Window } from "@host/contract.ts";

export type Hosted = { name: string; settings: { app: { name: string; identifier: string; version: string }; window: Window } };

export function hosted ( { name, settings }: Hosted ): Spoken {

    return { identity: name, ...settings.app, window: settings.window };

}
