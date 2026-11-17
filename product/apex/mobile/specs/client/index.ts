import * as spec from "engine/spec";
import { messages } from "./brand/messages/index.ts";
import { config } from "./config/index.ts";
import { schema } from "./schema/index.ts";

export const client = spec.surface({ config, schema, messages });
