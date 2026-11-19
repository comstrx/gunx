import * as api from "engine/api";
import * as validate from "engine/validate";

export const tones = ["plain", "warm", "formal"] as const;
export const greeting = validate.object({ message: validate.string(), locale: validate.string(), tone: validate.enum(tones) });

export const transport = api.feature("hello", {
    world: api.get("/api/hello", validate.object({ tone: validate.optional(validate.enum(tones)) }), greeting, { auth: false, cache: 30 }),
    me: api.get("/api/hello/me", validate.object({}), greeting, { auth: true }),
    someone: api.get("/api/hello/{name}", validate.object({ name: validate.string().check(validate.minLength(1), validate.maxLength(40)) }), greeting, { auth: false }),
});

export type Tone = (typeof tones)[number];
export type Greeting = validate.infer<typeof greeting>;
