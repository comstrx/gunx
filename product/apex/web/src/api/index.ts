import * as api from "engine/api";
import type * as net from "engine/net";
import type * as spec from "engine/spec";
import { manifest as action } from "./action.ts";
import { manifest as hello, transport as helloTransport } from "./hello.ts";
import { manifest as locate } from "./locate.ts";
import { manifest as note } from "./note.ts";
import { manifest as notices, transport as noticesTransport } from "./notices.ts";
import { manifest as probe } from "./probe.ts";
import { manifest as account, transport as sessionTransport } from "./session.ts";
import { manifest as vault } from "./vault.ts";

export type Status = "idle" | "pending" | "done" | "failed";

export const platform: spec.Platform = "web";

export type Doors = { baseUrl: string; wire?: api.Overrides | undefined; locale: () => string; token?: api.ClientOptions["token"]; fetcher?: net.Fetcher | undefined };

export const contracts = { hello: helloTransport, notifications: noticesTransport, sessions: sessionTransport } as const;
export const manifests: Readonly<Record<string, spec.Manifest>> = { account, action, hello, locate, note, notices, probe, vault };
export const catalogue: spec.Catalogue = api.catalogue(contracts);

export function createClient ( doors: Doors ): api.Client {

    return api.create({ baseUrl: doors.baseUrl, wire: api.wire(doors.wire), locale: doors.locale, token: doors.token, fetcher: doors.fetcher, client: platform });

}
