import * as zod from "./zod.ts";

export type Schema<Out = unknown, In = unknown> = zod.ZodMiniType<Out, In>;
export type Issue = zod.core.$ZodIssue;
export type Context = zod.core.ParsePayload;
export type Check = zod.core.$ZodCheck<never>;
export type infer<T extends Schema> = zod.core.output<T>;
export type output<T extends Schema> = zod.core.output<T>;
export type input<T extends Schema> = zod.core.input<T>;

export function toJSONSchema ( schema: Schema, options: { io?: "input" | "output" | undefined } = {} ): Record<string, unknown> {

    return zod.toJSONSchema(schema, { io: options.io ?? "output", unrepresentable: "any" }) as Record<string, unknown>;

}
