import * as spec from "engine/spec";
import { brand } from "./brand/index.ts";
import { config } from "./config/index.ts";
import { schema } from "./schema/index.ts";

export const admin = spec.surface({ config, schema, brand });
