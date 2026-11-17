import type * as spec from "engine/spec";
import * as validate from "engine/validate";

export const permissions = ["location", "notifications", "camera", "microphone", "clipboard"] as const;
export const tools = ["copy", "share", "buzz", "notify", "photo", "shot", "file", "video", "film", "audio", "voice", "record", "snap"] as const;
export const manifest: spec.Manifest = {
    name: "probe",
    settings: validate.strictObject({ permissions: validate.optional(validate.array(validate.enum(permissions))) }),
    actions: ["ask", ...tools],
    signals: ["grants"],
};

export type Permission = (typeof permissions)[number];
export type Tool = (typeof tools)[number];
export type Outcome = "done" | "refused" | "unsupported";
