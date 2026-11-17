import * as spec from "engine/spec";
import type { Defaults } from "@/specs/part.ts";
import { artifact, load } from "../../.cache/spec/current.ts";

export const host = spec.boot<Defaults>(artifact, { load });
