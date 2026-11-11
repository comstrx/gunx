import { admin } from "./admin/index.ts";

export const roles = { admin } as const;
export const current: RoleName = "admin";

export type RoleName = keyof typeof roles;
