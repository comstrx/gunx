import * as error from "engine-error";
import * as json from "engine-json";
import type { Compiled, CompiledScreen, Surface } from "./arch.ts";
import { maxDepth, namePattern } from "./arch.ts";

export function named ( value: unknown ): value is string {

    return typeof value === "string" && value.length <= 64 && namePattern.test(value) && value.split(".").every(json.safeKey);

}
function texts ( value: unknown ): value is string[] {

    return Array.isArray(value) && value.every(( item ) => typeof item === "string");

}
function blocksFit ( value: unknown, level: number ): boolean {

    return Array.isArray(value) && level <= maxDepth && value.every(( block ) => json.isRecord(block) && typeof block.kind === "string" && json.isRecord(block.props) && blocksFit(block.children, level + 1));

}
function featureFits ( value: unknown ): boolean {

    return json.isRecord(value) && named(value.name) && named(value.id) && json.isRecord(value.settings) && json.isRecord(value.ports) && json.isRecord(value.watch) && json.isRecord(value.on) && Array.isArray(value.triggers) && texts(value.access) && json.isRecord(value.form);

}
function screenFits ( value: unknown ): boolean {

    if ( !json.isRecord(value) || !named(value.name) || typeof value.path !== "string" || !json.isRecord(value.title) || typeof value.role !== "string" ) return false;
    if ( typeof value.menu !== "boolean" || typeof value.auth !== "boolean" || !texts(value.access) || !texts(value.query) || !texts(value.signals) || !texts(value.flow) ) return false;
    if ( !Array.isArray(value.features) || !value.features.every(featureFits) || !blocksFit(value.blocks, 0) || !json.isRecord(value.on) || !Array.isArray(value.triggers) ) return false;

    return texts(value.params) && texts(value.kinds) && typeof value.depth === "number" && texts(value.ids) && Array.isArray(value.watches) && texts(value.emits) && texts(value.listens);

}

export function screenOf ( compiled: Compiled, name: string ): CompiledScreen | undefined {

    return typeof name === "string" && compiled.byName !== undefined && Object.hasOwn(compiled.byName, name) ? compiled.byName[name] : undefined;

}
export function serialize ( compiled: Compiled ): json.Dictionary {

    return {
        surface: json.omit(compiled.surface, ["screens"]),
        screens: compiled.screens.map(( found ) => ({ ...found, features: found.features.map(( feature ) => json.omit(feature, ["manifest"])) })),
        features: compiled.features,
        kinds: compiled.kinds,
        topics: compiled.topics,
    };

}
export function revive ( given: unknown ): Compiled {

    const surface = json.isRecord(given) ? given.surface : undefined;
    const screens = json.isRecord(given) ? given.screens : undefined;
    const topics = json.isRecord(given) && json.isRecord(given.topics) ? given.topics : {};

    if ( !json.isRecord(given) || !json.isRecord(surface) || !named(surface.name) || typeof surface.role !== "string" || typeof surface.locale !== "string" || !texts(surface.locales) ) throw error.fault("internal", "spec.revive", { message: "spec: not a serialized surface" });
    if ( !Array.isArray(screens) || !screens.every(screenFits) ) throw error.fault("internal", "spec.revive", { message: "spec: a serialized screen is malformed" });

    const byName: Record<string, CompiledScreen> = {};
    const found = (screens as CompiledScreen[]).map(( screen ) => ({ ...screen, features: screen.features.map(( feature ) => ({ ...feature, manifest: undefined })) }));

    for ( const screen of found ) byName[screen.name] = screen;

    return {
        surface: { ...(surface as unknown as Surface), world: Array.isArray(surface.world) ? surface.world as Surface["world"] : [], signals: texts(surface.signals) ? surface.signals : [], screens: found },
        screens: found,
        byName,
        features: texts(given.features) ? given.features : [],
        kinds: texts(given.kinds) ? given.kinds : [],
        topics: { emitted: texts(topics.emitted) ? topics.emitted : [], consumed: texts(topics.consumed) ? topics.consumed : [] },
        issues: [],
    };

}
