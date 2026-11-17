import type * as spec from "engine/spec";
import * as validate from "engine/validate";

export const accuracies = ["low", "balanced", "high"] as const;
export const manifest: spec.Manifest = {
    name: "locate",
    settings: validate.strictObject({
        accuracy: validate.optional(validate.enum(accuracies)),
        zoom: validate.optional(validate.int().check(validate.gte(1), validate.lte(20))),
        every: validate.optional(validate.int().check(validate.gte(1), validate.lte(1000))),
    }),
    actions: ["find", "follow", "stop"],
    emits: ["locate.moved"],
    signals: ["position"],
};

export type Accuracy = (typeof accuracies)[number];
