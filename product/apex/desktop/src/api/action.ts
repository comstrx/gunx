import type * as spec from "engine/spec";
import * as validate from "engine/validate";

export const looks = ["solid", "soft", "ghost", "danger"] as const;
export const manifest: spec.Manifest = {
    name: "action",
    settings: validate.strictObject({ label: validate.string().check(validate.minLength(1)), look: validate.optional(validate.enum(looks)) }),
    actions: ["press"],
};

export type Look = (typeof looks)[number];
