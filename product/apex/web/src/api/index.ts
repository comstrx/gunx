import * as api from "engine/api";
import type * as net from "engine/net";
import type * as spec from "engine/spec";
import { platform } from "@/types/platform.ts";
import { manifest as hello, transport as helloTransport } from "./hello.ts";

export type Doors = { baseUrl: string; locale: () => string; fetcher?: net.Fetcher | undefined };

export const contracts = { hello: helloTransport } as const;
export const manifests: Readonly<Record<string, spec.Manifest>> = { hello };
export const catalogue: spec.Catalogue = api.catalogue(contracts);

export function createClient ( doors: Doors ): api.Client {

    return api.create({ baseUrl: doors.baseUrl, locale: doors.locale, fetcher: doors.fetcher, client: platform, timeout: 8000 });

}
