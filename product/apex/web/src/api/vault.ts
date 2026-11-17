import type * as spec from "engine/spec";
import * as validate from "engine/validate";

export const kinds = ["local", "session", "memory", "cookie"] as const;
export const manifest: spec.Manifest = {
    name: "vault",
    settings: validate.strictObject({ kinds: validate.optional(validate.array(validate.enum(kinds))), seconds: validate.optional(validate.int().check(validate.gte(1), validate.lte(3600))) }),
    actions: ["bump", "expire", "clear"],
    signals: ["stored"],
};

export type Kind = (typeof kinds)[number];
