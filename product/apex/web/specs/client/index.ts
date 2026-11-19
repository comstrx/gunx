import * as spec from "engine/spec";
import { assets } from "./assets/index.ts";
import { config } from "./config/index.ts";
import { messages } from "./messages/index.ts";
import { schema } from "./schema/index.ts";

export const client = spec.surface({ config, schema, messages, assets });
