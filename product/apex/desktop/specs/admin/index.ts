import { messages } from "./brand/messages.ts";
import { config } from "./config/index.ts";
import { screens } from "./schema/index.ts";

export const admin = { role: "admin", config, screens, messages } as const;
