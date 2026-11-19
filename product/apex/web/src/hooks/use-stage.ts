import { createContext, useContext } from "react";
import type * as spec from "@/specs/index.ts";
import { host } from "@/specs/index.ts";

export type Stage = { live: spec.Runtime; screen: string };

export const StageContext = createContext<Stage | undefined>(undefined);

export function useStage (): Stage {

    return useContext(StageContext) ?? { live: host.app.live, screen: "" };

}
