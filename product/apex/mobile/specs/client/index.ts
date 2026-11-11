import { messages } from "./brand/messages.ts";
import { config } from "./config/index.ts";
import { screens } from "./schema/index.ts";

export const client = { role: "client", config, screens, messages } as const;
