import { type ComponentType, lazy } from "react";

export type Placed = { id: string };

export const registry: Readonly<Record<string, ComponentType<Placed>>> = {
    account: lazy(() => import("@/features/account/index.tsx").then(( module ) => ({ default: module.Account }))),
    action: lazy(() => import("@/features/action/index.tsx").then(( module ) => ({ default: module.Action }))),
    hello: lazy(() => import("@/features/hello/index.tsx").then(( module ) => ({ default: module.Hello }))),
    locate: lazy(() => import("@/features/locate/index.tsx").then(( module ) => ({ default: module.Locate }))),
    note: lazy(() => import("@/features/note/index.tsx").then(( module ) => ({ default: module.Note }))),
    notices: lazy(() => import("@/features/notices/index.tsx").then(( module ) => ({ default: module.Notices }))),
    probe: lazy(() => import("@/features/probe/index.tsx").then(( module ) => ({ default: module.Probe }))),
    vault: lazy(() => import("@/features/vault/index.tsx").then(( module ) => ({ default: module.Vault }))),
};
