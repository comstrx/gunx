import { type ComponentType, lazy } from "react";

export const registry: Readonly<Record<string, ComponentType>> = {
    hello: lazy(() => import("@/features/hello/index.tsx").then(( module ) => ({ default: module.Hello }))),
};
