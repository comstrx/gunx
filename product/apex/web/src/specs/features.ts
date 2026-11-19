import type * as spec from "engine/spec";
import * as validate from "engine/validate";
import { tones } from "@/api/hello.ts";

export const looks = ["solid", "soft", "ghost", "danger"] as const;
export const accuracies = ["low", "balanced", "high"] as const;
export const permissions = ["location", "notifications", "camera", "microphone", "clipboard"] as const;
export const tools = ["copy", "share", "buzz", "notify", "photo", "shot", "file", "video", "film", "audio", "voice", "record", "snap"] as const;
export const kinds = ["local", "session", "memory", "cookie"] as const;

export type Look = (typeof looks)[number];
export type Accuracy = (typeof accuracies)[number];
export type Permission = (typeof permissions)[number];
export type Tool = (typeof tools)[number];
export type Outcome = "done" | "refused" | "unsupported";
export type Kind = (typeof kinds)[number];

export const manifests: Readonly<Record<string, spec.Manifest>> = {
    account: {
        name: "account",
        settings: validate.strictObject({ email: validate.optional(validate.email()) }),
        actions: ["code", "start", "end", "greet"],
        emits: ["session.started", "session.ended"],
        signals: ["signed"],
    },
    action: {
        name: "action",
        settings: validate.strictObject({ label: validate.string().check(validate.minLength(1)), look: validate.optional(validate.enum(looks)) }),
        actions: ["press"],
    },
    hello: {
        name: "hello",
        settings: validate.strictObject({ tone: validate.optional(validate.enum(tones)) }),
        ports: { greeting: { kind: "one", required: false } },
        actions: ["refresh"],
        emits: ["hello.greeted"],
    },
    locate: {
        name: "locate",
        settings: validate.strictObject({
            accuracy: validate.optional(validate.enum(accuracies)),
            zoom: validate.optional(validate.int().check(validate.gte(1), validate.lte(20))),
            every: validate.optional(validate.int().check(validate.gte(1), validate.lte(1000))),
        }),
        actions: ["find", "follow", "stop"],
        emits: ["locate.moved"],
        signals: ["position"],
    },
    note: {
        name: "note",
        settings: validate.strictObject({ title: validate.string().check(validate.minLength(1)), body: validate.optional(validate.string().check(validate.minLength(1))) }),
    },
    notices: {
        name: "notices",
        settings: validate.strictObject({ limit: validate.optional(validate.number().check(validate.gte(1), validate.lte(100))) }),
        ports: { rows: { kind: "list", required: false } },
        actions: ["refresh"],
    },
    probe: {
        name: "probe",
        settings: validate.strictObject({ permissions: validate.optional(validate.array(validate.enum(permissions))) }),
        actions: ["ask", ...tools],
        signals: ["grants"],
    },
    vault: {
        name: "vault",
        settings: validate.strictObject({ kinds: validate.optional(validate.array(validate.enum(kinds))), seconds: validate.optional(validate.int().check(validate.gte(1), validate.lte(3600))) }),
        actions: ["bump", "expire", "clear"],
        signals: ["stored"],
    },
};
