import * as spec from "engine/spec";
import { compiled } from "#spec";
import type { Defaults } from "@/specs/part.ts";

export const host = spec.boot<Defaults>(compiled);
