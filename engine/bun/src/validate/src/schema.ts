import type { Schema } from "./arch.ts";
import * as zod from "./zod.ts";

export function toJSONSchema ( schema: Schema, options: { io?: "input" | "output" | undefined } = {} ): Record<string, unknown> {

    return zod.toJSONSchema(schema, { io: options.io ?? "output", unrepresentable: "any" }) as Record<string, unknown>;

}
