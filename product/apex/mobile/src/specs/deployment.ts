import * as api from "engine/api";
import type * as spec from "engine/spec";
import { current, type RoleName, roles } from "../../specs/index.ts";

export type Role = (typeof roles)[RoleName];
export type Deployment = { url?: string | undefined; release?: boolean | undefined };
export type Compiled = spec.Compiled & { role: Role; address: string };

export function deployment (): Deployment {

    return { url: process.env.EXPO_PUBLIC_API_URL || process.env.API_URL, release: (process.env.EXPO_PUBLIC_ENGINE_ENV || process.env.ENGINE_ENV) === "production" };

}
export function addressOf ( role: Role, given: Deployment = deployment() ): string {

    return api.address(given.url || role.config.contracts.baseUrl, { release: given.release });

}
export function roleOf ( name: RoleName = current ): Role {

    return roles[name];

}
