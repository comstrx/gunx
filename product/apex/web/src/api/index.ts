import * as api from "engine/api";
import type * as net from "engine/net";
import { transport as hello } from "./hello.ts";
import { transport as notifications } from "./notices.ts";
import { transport as sessions } from "./session.ts";

export type Status = "idle" | "pending" | "done" | "failed";
export type Client = api.Client;
export type Live = ReturnType<typeof api.live>;
export type LiveOptions = Parameters<typeof api.live>[0];
export type Doors = { baseUrl: string; client: string; wire?: api.Overrides | undefined; locale: () => string; token?: api.ClientOptions["token"]; fetcher?: net.Fetcher | undefined };

export const contracts = { hello, notifications, sessions } as const;
export const catalogue = api.catalogue(contracts);

export function createClient ( doors: Doors ): Client {

    return api.create({ baseUrl: doors.baseUrl, wire: api.wire(doors.wire), locale: doors.locale, token: doors.token, fetcher: doors.fetcher, client: doors.client });

}
export function connect ( options: LiveOptions ): Live {

    return api.live(options);

}
