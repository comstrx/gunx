import type * as spec from "engine/spec";
import { createContext, useContext } from "react";
import { host } from "@/specs/app.ts";

export type Stage = { live: spec.Runtime; screen: string };

export const StageContext = createContext<Stage | undefined>(undefined);

export function useStage (): Stage {

    return useContext(StageContext) ?? { live: host.app.live, screen: "" };

}
