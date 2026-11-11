import * as json from "engine-json";
import * as validate from "engine-validate";
import type * as world from "engine-world";

export type Scalar = string | number | boolean | null;
export type Reference = { param: string } | { query: string } | { signal: string } | { form: string } | { user: string } | { setting: string } | { path: string } | { text: string };
export type Value = Scalar | Reference | readonly Scalar[];
export type Test = { is: string; eq?: Scalar | undefined; ne?: Scalar | undefined; in?: readonly Scalar[] | undefined; gt?: number | undefined; gte?: number | undefined; lt?: number | undefined; lte?: number | undefined; has?: Scalar | undefined; like?: string | undefined; empty?: boolean | undefined; can?: string | undefined };
export type When = boolean | Test | { all: When[] } | { any: When[] } | { not: When };
export type Effect =
    | { set: string; to: Value }
    | { clear: string }
    | { show: string }
    | { hide: string }
    | { enable: string }
    | { disable: string }
    | { emit: string; with?: Record<string, Value> | undefined }
    | { call: string; with?: Record<string, Value> | undefined; queue?: boolean | undefined }
    | { step: string }
    | { confirm: string; do: Effect[]; else?: Effect[] | undefined }
    | { check: string; do: Effect[]; else?: Effect[] | undefined; fields?: string[] | undefined }
    | { refresh: string }
    | { navigate: string; with?: Record<string, Value> | undefined }
    | { when: When; do: Effect[]; else?: Effect[] | undefined };
export type Hooks = { load?: Effect[] | undefined; leave?: Effect[] | undefined; submit?: Effect[] | undefined; success?: Effect[] | undefined; failure?: Effect[] | undefined; change?: Effect[] | undefined };
export type Trigger = { on: string; do: Effect[]; when?: When | undefined };
export type Listing = { sort?: string | undefined; filter?: Record<string, Value> | undefined; page?: Value | undefined; limit?: number | undefined; search?: Value | undefined };
export type Binding = { read: string; input?: Record<string, Value> | undefined; list?: Listing | undefined; live?: boolean | string | undefined } | { write: string; input?: Record<string, Value> | undefined; fields?: string[] | undefined } | { data: unknown } | { signal: string };
export type Feature = {
    name: string;
    id: string | undefined;
    settings: Record<string, unknown>;
    ports: Record<string, Binding>;
    when: When | undefined;
    watch: Record<string, Effect[]>;
    on: Hooks;
    triggers: Trigger[];
    access: string[];
    form: Record<string, string>;
};
export type Block = { kind: string; id: string | undefined; props: Record<string, unknown>; when: When | undefined; children: Block[] };
export type Screen = {
    name: string;
    path: string;
    title: Record<string, string>;
    role: string;
    menu: boolean;
    icon: string | undefined;
    auth: boolean;
    access: string[];
    query: string[];
    signals: string[];
    features: Feature[];
    blocks: Block[];
    on: Hooks;
    triggers: Trigger[];
    flow: string[];
};
export type Platform = "web" | "mobile" | "desktop";
export type Surface = {
    name: string;
    role: string;
    platform: Platform;
    world: world.Catalog[];
    locales: string[];
    locale: string;
    screens: Screen[];
    signals: string[];
};
export type PortKind = "list" | "one" | "write";
export type Port = { kind: PortKind; required?: boolean | undefined; fields?: readonly string[] | undefined };
export type Manifest = {
    name: string;
    settings?: validate.Schema | undefined;
    ports?: Readonly<Record<string, Port>> | undefined;
    fields?: readonly string[] | undefined;
    actions?: readonly string[] | undefined;
    emits?: readonly string[] | undefined;
    signals?: readonly string[] | undefined;
    access?: readonly string[] | undefined;
};
export type Operation = { many: boolean; write: boolean; input: readonly string[]; output?: readonly string[] | undefined };
export type Catalogue = Readonly<Record<string, Operation>>;

export const namePattern = /^[a-z][a-z0-9_.-]*$/;
export const pathPattern = /^\/(?:[a-z0-9-]+|\{[a-z][a-z0-9_]*\}|\*)?(?:\/(?:[a-z0-9-]+|\{[a-z][a-z0-9_]*\}|\*))*$/;
export const topicPattern = /^[a-z0-9_*-]+(?:\.[a-z0-9_*-]+)*$/;
export const fieldPattern = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/;
export const namespaces = ["params", "query", "signals", "form", "user", "device", "settings", "locale", "event", "flow"] as const;

function filled ( most?: number ) {

    return most === undefined ? validate.string().check(validate.minLength(1)) : validate.string().check(validate.minLength(1), validate.maxLength(most));

}
function safe ( text: string ): boolean {

    return text.split(".").every(json.safeKey);

}
function matching ( pattern: RegExp, most = 256 ) {

    return validate.string().check(validate.maxLength(most), validate.regex(pattern));

}
function upTo<T extends validate.Schema> ( item: T, most: number ) {

    return validate.array(item).check(validate.maxLength(most));

}

const name = validate.string().check(validate.trim(), validate.minLength(1), validate.maxLength(64), validate.regex(namePattern), validate.refine(safe));
const field = matching(fieldPattern).check(validate.refine(safe));
const topic = matching(topicPattern);
const operation = matching(/^[a-z][a-z0-9_-]*\.[a-z][a-zA-Z0-9_]*$/);
const action = matching(/^[a-z][a-z0-9_.-]*\.[a-z][a-zA-Z0-9_]*$/).check(validate.refine(safe));
const target = filled(128);
const grant = filled(120);
const scalar = validate.union([validate.string().check(validate.maxLength(4096)), validate.number(), validate.boolean(), validate.literal(null)]);
const reference = validate.union([
    validate.strictObject({ param: field }),
    validate.strictObject({ query: field }),
    validate.strictObject({ signal: field }),
    validate.strictObject({ form: field }),
    validate.strictObject({ user: field }),
    validate.strictObject({ setting: field }),
    validate.strictObject({ path: field }),
    validate.strictObject({ text: field }),
]);
const value = validate.union([scalar, reference, upTo(scalar, 200)]);
const test = validate.strictObject({
    is: field,
    eq: validate.optional(scalar),
    ne: validate.optional(scalar),
    in: validate.optional(upTo(scalar, 200)),
    gt: validate.optional(validate.number()),
    gte: validate.optional(validate.number()),
    lt: validate.optional(validate.number()),
    lte: validate.optional(validate.number()),
    has: validate.optional(scalar),
    like: validate.optional(validate.string().check(validate.maxLength(200))),
    empty: validate.optional(validate.boolean()),
    can: validate.optional(filled(120)),
});
const when: validate.Schema<When> = validate.lazy(() => validate.union([
    validate.boolean(),
    test,
    validate.strictObject({ all: upTo(when, 50) }),
    validate.strictObject({ any: upTo(when, 50) }),
    validate.strictObject({ not: when }),
])) as validate.Schema<When>;
const withShape = validate.optional(validate.record(field, value));
const effect: validate.Schema<Effect> = validate.lazy(() => validate.union([
    validate.strictObject({ set: field, to: value }),
    validate.strictObject({ clear: field }),
    validate.strictObject({ show: target }),
    validate.strictObject({ hide: target }),
    validate.strictObject({ enable: target }),
    validate.strictObject({ disable: target }),
    validate.strictObject({ emit: topic, with: withShape }),
    validate.strictObject({ call: action, with: withShape, queue: validate.optional(validate.boolean()) }),
    validate.strictObject({ step: filled(64) }),
    validate.strictObject({ confirm: field, do: upTo(effect, 50), else: validate.optional(upTo(effect, 50)) }),
    validate.strictObject({ check: name, do: upTo(effect, 50), else: validate.optional(upTo(effect, 50)), fields: validate.optional(upTo(filled(128), 100)) }),
    validate.strictObject({ refresh: name }),
    validate.strictObject({ navigate: filled(512), with: withShape }),
    validate.strictObject({ when, do: upTo(effect, 50), else: validate.optional(upTo(effect, 50)) }),
])) as validate.Schema<Effect>;
const effects = upTo(effect, 50);
const hooks = validate.strictObject({ load: validate.optional(effects), leave: validate.optional(effects), submit: validate.optional(effects), success: validate.optional(effects), failure: validate.optional(effects), change: validate.optional(effects) });
const trigger = validate.strictObject({ on: topic, do: effects, when: validate.optional(when) });
const binding = validate.union([
    validate.strictObject({
        read: operation,
        input: withShape,
        list: validate.optional(validate.strictObject({ sort: validate.optional(matching(/^-?[a-zA-Z_][a-zA-Z0-9_.]*$/)), filter: withShape, page: validate.optional(value), limit: validate.optional(validate.int().check(validate.gte(1), validate.lte(500))), search: validate.optional(value) })),
        live: validate.optional(validate.union([validate.boolean(), topic])),
    }),
    validate.strictObject({ write: operation, input: withShape, fields: validate.optional(upTo(field, 100)) }),
    validate.strictObject({ data: validate.unknown() }),
    validate.strictObject({ signal: field }),
]);
const featureShape = validate.strictObject({
    name,
    id: validate.optional(name),
    settings: validate.record(validate.string(), validate.unknown()),
    ports: validate.record(name, binding),
    when: validate.optional(when),
    watch: validate.record(field, effects),
    on: hooks,
    triggers: upTo(trigger, 50),
    access: upTo(grant, 50),
    form: validate.record(field, filled(500)),
});
const blockShape: validate.Schema<Block> = validate.lazy(() => validate.strictObject({
    kind: name,
    id: validate.optional(name),
    props: validate.record(validate.string(), validate.unknown()),
    when: validate.optional(when),
    children: upTo(blockShape, 100),
})) as validate.Schema<Block>;
const screenShape = validate.strictObject({
    name,
    path: matching(pathPattern),
    title: validate.record(validate.string().check(validate.maxLength(35)), filled(120)),
    role: name,
    menu: validate.boolean(),
    icon: validate.optional(validate.string().check(validate.maxLength(128))),
    auth: validate.boolean(),
    access: upTo(grant, 50),
    query: upTo(field, 50),
    signals: upTo(field, 50),
    features: upTo(featureShape, 100),
    blocks: upTo(blockShape, 100),
    on: hooks,
    triggers: upTo(trigger, 50),
    flow: upTo(name, 50),
});

export const whenShape: validate.Schema<When> = when;
export const blockShapeOf: validate.Schema<Block> = blockShape;
export const featureShapeOf: validate.Schema<Feature> = featureShape as validate.Schema<Feature>;
export const screenShapeOf: validate.Schema<Screen> = screenShape as validate.Schema<Screen>;
export const effectShape: validate.Schema<Effect> = effect;
export const platformShape = validate.enum(["web", "mobile", "desktop"]);
export const catalogShape = validate.enum(["countries", "currencies", "languages", "emoji"] satisfies readonly world.Catalog[] as [world.Catalog, ...world.Catalog[]]);
export const surfaceShape = validate.strictObject({
    name,
    role: name,
    platform: platformShape,
    world: upTo(catalogShape, 4),
    locales: validate.array(validate.locale()).check(validate.minLength(1), validate.maxLength(200)),
    locale: validate.locale(),
    screens: upTo(screenShape, 500),
    signals: upTo(field, 100),
});
