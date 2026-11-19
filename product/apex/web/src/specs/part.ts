import * as spec from "engine/spec";
import * as validate from "engine/validate";
import { catalogue } from "@/api/index.ts";
import { manifests } from "@/specs/features.ts";

const space = validate.enum(["none", "xs", "sm", "md", "lg", "xl"]);

export type StackProps = validate.infer<typeof stack>;
export type Defaults = typeof defaults;
export type PopupProps = validate.infer<typeof popup>;
export type ScreenProps = validate.infer<typeof screen>;

export const stack = validate.partial(validate.strictObject({
    direction: validate.enum(["row", "column"]),
    gap: space,
    align: validate.enum(["start", "center", "end", "stretch"]),
    justify: validate.enum(["start", "center", "end", "between"]),
    padding: space,
    surface: validate.enum(["plain", "raised"]),
    width: validate.enum(["auto", "full", "reading"]),
    wrap: validate.boolean(),
    height: validate.enum(["auto", "screen"]),
}));
export const placement = validate.strictObject({ name: validate.string().check(validate.minLength(1), validate.maxLength(64)) });
export const popup = validate.partial(validate.strictObject({ size: validate.enum(["sm", "md", "lg", "full"]), url: validate.boolean() }));
export const screen = validate.partial(validate.strictObject({ width: validate.enum(["auto", "full", "reading"]), shield: validate.boolean() }));
export const blocks = { stack, feature: placement, popup };
export const defaults = {
    settings: { budget: { js: 1_150_000 as number | string, desk: 640_000 as number | string }, output: "export", window: { width: 1280, height: 800, minWidth: 960, minHeight: 640 } },
    themes: {},
    contents: { name: {} as Readonly<Record<string, string>>, tagline: {} as Readonly<Record<string, string>>, url: "" },
    contracts: { maps: { key: "" } },
};
export const platform: spec.Platform = "web";
export const part = spec.part({ platform, blocks, screen, carries: ["session"], features: manifests, catalogue, defaults, maxDepth: 4 });
