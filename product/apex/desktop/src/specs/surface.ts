import * as spec from "engine/spec";
import * as validate from "engine/validate";
import { catalogue, manifests } from "@/api/index.ts";
import { addressOf, type Compiled, type Deployment, deployment, type Role, roleOf } from "@/specs/deployment.ts";
import { platform } from "@/types/platform.ts";
import type { RoleName } from "../../specs/index.ts";

const space = validate.enum(["none", "xs", "sm", "md", "lg", "xl"]);

export const stack = validate.partial(validate.strictObject({
    direction: validate.enum(["row", "column"]),
    gap: space,
    align: validate.enum(["start", "center", "end", "stretch"]),
    justify: validate.enum(["start", "center", "end", "between"]),
    padding: space,
    surface: validate.enum(["plain", "raised"]),
    width: validate.enum(["auto", "full", "reading"]),
    height: validate.enum(["auto", "screen"]),
}));
export const placement = validate.strictObject({ name: validate.enum(Object.keys(manifests) as [string, ...string[]]) });
export const blocks = { stack, feature: placement };

export type { Compiled, Deployment, Role } from "@/specs/deployment.ts";
export type StackProps = validate.infer<typeof stack>;

export function compileRole ( name: RoleName, given: Deployment = deployment() ): Compiled {

    const role: Role = roleOf(name);
    const address = addressOf(role, given);
    const surface = spec.surface({ name: `${platform}-${role.role}`, role: role.role, platform, world: [...(role.config.settings.world ?? [])], locales: [...role.config.settings.locales], locale: role.config.settings.locale, screens: [...role.screens] });

    const sheet = (role.messages as Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>)[surface.locale];
    const texts = Object.entries(sheet ?? {}).flatMap(([feature, keys]) => Object.keys(keys).map(( key ) => `${feature}.${key}`));

    return { ...spec.compile(surface, { blocks, features: manifests, catalogue, texts, grants: [...role.config.settings.grants], maxDepth: 4 }), role, address };

}
