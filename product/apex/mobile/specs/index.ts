import { client } from "./client/index.ts";

export const roles = { client } as const;
export const current: RoleName = "client";

export type RoleName = keyof typeof roles;
