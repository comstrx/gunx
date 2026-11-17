import type * as spec from "engine/spec";
import * as validate from "engine/validate";

export const manifest: spec.Manifest = {
    name: "note",
    settings: validate.strictObject({ title: validate.string().check(validate.minLength(1)), body: validate.optional(validate.string().check(validate.minLength(1))) }),
};
