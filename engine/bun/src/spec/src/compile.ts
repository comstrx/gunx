import * as auth from "engine-auth";
import * as error from "engine-error";
import * as event from "engine-event";
import * as json from "engine-json";
import * as list from "engine-list";
import * as parse from "engine-parse";
import * as string from "engine-string";
import * as validate from "engine-validate";
import { isBuilt } from "./define.ts";
import type { Binding, Block, Catalogue, Effect, Feature, Manifest, Screen, Surface, Trigger, Value, When } from "./shapes.ts";
import { blockShapeOf, featureShapeOf, namePattern, namespaces, pathPattern, screenShapeOf, surfaceShape } from "./shapes.ts";
import { isReference, pathsOf, referencePath } from "./when.ts";

export type Issue = { path: string; rule: string; message: string; near?: string | undefined; fix?: string | undefined };
export type Edge = { from: string; to: string };
export type CompiledFeature = Feature & { id: string; manifest: Manifest | undefined };
export type CompiledScreen = Omit<Screen, "features"> & { features: CompiledFeature[]; params: string[]; kinds: string[]; depth: number; ids: string[]; watches: Edge[]; emits: string[]; listens: string[] };
export type Compiled = {
    surface: Surface;
    screens: CompiledScreen[];
    byName: Record<string, CompiledScreen>;
    features: string[];
    kinds: string[];
    topics: { emitted: string[]; consumed: string[] };
    issues: Issue[];
};
export type Options = {
    kinds?: readonly string[] | undefined;
    blocks?: Readonly<Record<string, validate.Schema>> | undefined;
    features?: readonly string[] | Readonly<Record<string, Manifest>> | undefined;
    catalogue?: Catalogue | undefined;
    topics?: readonly string[] | undefined;
    texts?: readonly string[] | undefined;
    grants?: readonly string[] | undefined;
    maxDepth?: number | undefined;
};

type Shared = {
    surface: Surface;
    options: Options;
    issues: Issue[];
    manifests: Readonly<Record<string, Manifest>> | undefined;
    paths: ReadonlySet<string>;
    texts: ReadonlySet<string> | undefined;
    kinds: readonly string[] | undefined;
};
type Scope = {
    at: string;
    issues: Issue[];
    shared: Shared;
    params: Set<string>;
    query: Set<string>;
    signals: Set<string>;
    fields: Set<string>;
    ids: Set<string>;
    actions: Set<string>;
    features: Set<string>;
    emitted: Set<string>;
    listened: Set<string>;
    watches: Edge[];
    inTrigger: boolean;
    steps: Set<string>;
    forms: Map<string, readonly string[]>;
};
type Ranked = { screen: CompiledScreen; fixed: boolean; pieces: string[] };

const roots: ReadonlySet<string> = new Set(namespaces);
const writable: ReadonlySet<string> = new Set(["form", "signals", "query"]);
const flowing: readonly string[] = ["step", "index", "first", "last", "done"];
const slotted = /\{([a-z][a-z0-9_]*)\}/g;
const deepest = 64;

function own<T> ( held: Readonly<Record<string, T>> | undefined, key: string ): T | undefined {

    return held !== undefined && Object.hasOwn(held, key) ? held[key] : undefined;

}
function named ( value: unknown ): value is string {

    return typeof value === "string" && value.length <= 64 && namePattern.test(value) && value.split(".").every(json.safeKey);

}
function texts ( value: unknown ): value is string[] {

    return Array.isArray(value) && value.every(( item ) => typeof item === "string");

}
function manifestsOf ( given: Options["features"] ): Readonly<Record<string, Manifest>> | undefined {

    if ( given === undefined ) return undefined;
    if ( !Array.isArray(given) ) return given as Readonly<Record<string, Manifest>>;

    const made: Record<string, Manifest> = {};

    for ( const name of given as readonly string[] ) {

        if ( json.safeKey(name) ) made[name] = { name };

    }

    return made;

}
function told ( issues: Issue[], path: string, rule: string, message: string, near?: string | undefined, fix?: string | undefined ): void {

    const issue: Issue = { path, rule, message };

    if ( near !== undefined ) issue.near = near;
    if ( fix !== undefined ) issue.fix = fix;

    issues.push(issue);

}
function textIssue ( scope: Scope, key: string, at: string ): void {

    const known = scope.shared.texts;

    if ( known && !known.has(key) ) told(scope.issues, at, "text.unknown", `${key}: no message carries this key`, nearest(key, known), "add the key to brand/messages in every locale");

}
function grantIssue ( scope: Scope, wanted: string, at: string, rule: string ): void {

    const grants = scope.shared.options.grants;

    if ( grants && !auth.granted(grants, [wanted]) ) told(scope.issues, at, rule, `${wanted}: the role grants no such ability`, nearest(wanted, grants), "declare the ability in the role's grants");

}
function measured ( blocks: readonly Block[], kinds: Set<string>, ids: string[], level: number ): number {

    let depth = blocks.length === 0 ? level : level + 1;

    for ( const found of blocks ) {

        kinds.add(found.kind);

        if ( found.id ) ids.push(found.id);
        if ( level < deepest ) depth = Math.max(depth, measured(found.children, kinds, ids, level + 1));

    }

    return depth;

}
function repeated ( items: readonly string[] ): string[] {

    const seen = new Set<string>();
    const twice = new Set<string>();

    for ( const item of items ) {

        if ( seen.has(item) ) twice.add(item);

        seen.add(item);

    }

    return [...twice];

}
function pathIssue ( scope: Scope, path: string, at: string, rule: string ): void {

    const dot = path.indexOf(".");
    const head = dot === -1 ? path : path.slice(0, dot);
    const rest = dot === -1 ? "" : path.slice(dot + 1);
    const next = rest.indexOf(".");
    const key = next === -1 ? rest : rest.slice(0, next);

    if ( !roots.has(head) ) {

        told(scope.issues, at, rule, `${path}: a path starts with one of ${namespaces.join(", ")}`);

        return;

    }

    if ( head === "event" && !scope.inTrigger ) told(scope.issues, at, "event.outside", `${path}: the event payload is read only inside a trigger`);
    if ( key === "" ) return;
    if ( head === "params" && !scope.params.has(key) ) told(scope.issues, at, rule, `${path}: the screen path has no {${key}}`);
    if ( head === "query" && !scope.query.has(key) ) told(scope.issues, at, rule, `${path}: the screen declares no query ${key}`);
    if ( head === "signals" && !scope.signals.has(key) ) told(scope.issues, at, rule, `${path}: no feature or screen declares the signal ${key}`, nearest(key, scope.signals), "declare the signal on the screen, the feature manifest, or set it in an effect");
    if ( head === "flow" && !flowing.includes(key) ) told(scope.issues, at, rule, `${path}: flow has step, index, first, last and done`, nearest(key, flowing));
    if ( head === "form" && scope.fields.size > 0 && !scope.fields.has(key) ) told(scope.issues, at, rule, `${path}: no feature on this screen exposes the field ${key}`);

}
function writeIssue ( scope: Scope, path: string, at: string, source: string | undefined ): void {

    const dot = path.indexOf(".");
    const head = dot === -1 ? path : path.slice(0, dot);

    if ( roots.has(head) && !writable.has(head) ) told(scope.issues, at, "effect.path", `${path}: an effect writes ${[...writable].join(", ")}`);
    else pathIssue(scope, path, at, "effect.path");

    if ( source ) scope.watches.push({ from: source, to: path });

}
function valueIssues ( scope: Scope, value: Value, at: string ): void {

    if ( !isReference(value) ) return;

    if ( "text" in value ) textIssue(scope, value.text, at);
    else pathIssue(scope, referencePath(value), at, "ref.unknown");

}
function inputIssues ( scope: Scope, input: Readonly<Record<string, Value>> | undefined, at: string ): void {

    if ( !input ) return;

    for ( const key of Object.keys(input) ) valueIssues(scope, input[key] as Value, at);

}
function cansOf ( given: When, out: string[] = [] ): string[] {

    if ( typeof given === "boolean" ) return out;

    if ( "all" in given ) for ( const part of given.all ) cansOf(part, out);
    else if ( "any" in given ) for ( const part of given.any ) cansOf(part, out);
    else if ( "not" in given ) cansOf(given.not, out);
    else if ( given.can !== undefined ) out.push(given.can);

    return out;

}
function whenIssues ( scope: Scope, given: When | undefined, at: string ): void {

    if ( given === undefined || typeof given === "boolean" ) return;

    for ( const path of pathsOf(given) ) pathIssue(scope, path, at, "when.path");
    for ( const wanted of cansOf(given) ) grantIssue(scope, wanted, at, "when.grant");

}
function targetIssue ( scope: Scope, target: string, at: string ): void {

    if ( !scope.ids.has(target) && !scope.features.has(target) ) told(scope.issues, at, "effect.target", `${target}: no block or feature on this screen carries this id`, nearest(target, [...scope.ids, ...scope.features]), "give the block an id or name the feature");

}
function answered ( shared: Shared, target: string ): boolean {

    if ( shared.paths.has(target) ) return true;

    try {

        const probe = parse.fill(target, Object.fromEntries(parse.templateKeys(target).map(( key ) => [key, "x"])));

        return shared.surface.screens.some(( found ) => parse.match(found.path, probe) !== undefined);

    } catch {

        return false;

    }

}
function effectIssues ( scope: Scope, effects: readonly Effect[], at: string, source: string | undefined ): void {

    for ( const [index, effect] of effects.entries() ) {

        const here = `${at}[${index}]`;

        if ( "set" in effect ) {

            writeIssue(scope, effect.set, here, source);
            valueIssues(scope, effect.to, here);

        } else if ( "clear" in effect ) writeIssue(scope, effect.clear, here, source);
        else if ( "show" in effect ) targetIssue(scope, effect.show, here);
        else if ( "hide" in effect ) targetIssue(scope, effect.hide, here);
        else if ( "enable" in effect ) targetIssue(scope, effect.enable, here);
        else if ( "disable" in effect ) targetIssue(scope, effect.disable, here);
        else if ( "emit" in effect ) {

            scope.emitted.add(effect.emit);
            inputIssues(scope, effect.with, here);

        } else if ( "call" in effect ) {

            if ( !scope.actions.has(effect.call) ) told(scope.issues, here, "effect.action", `${effect.call}: no feature on this screen handles this action`, nearest(effect.call, scope.actions), "list the action in the feature manifest");

            inputIssues(scope, effect.with, here);

        } else if ( "refresh" in effect ) {

            if ( !scope.features.has(effect.refresh) ) told(scope.issues, here, "effect.feature", `${effect.refresh}: not a feature of this screen`, nearest(effect.refresh, scope.features));

        } else if ( "step" in effect ) {

            if ( scope.steps.size === 0 ) told(scope.issues, here, "flow.none", `${effect.step}: this screen declares no flow`, undefined, "give the screen flow: [...steps]");
            else if ( effect.step !== "next" && effect.step !== "back" && !scope.steps.has(effect.step) ) told(scope.issues, here, "flow.step", `${effect.step}: not a step of this flow`, nearest(effect.step, scope.steps), "use next, back or a declared step");

        } else if ( "navigate" in effect ) {

            const mark = effect.navigate.indexOf("?");
            const target = mark === -1 ? effect.navigate : effect.navigate.slice(0, mark);

            if ( !answered(scope.shared, target) ) told(scope.issues, here, "effect.screen", `${effect.navigate}: no screen answers this path`, nearest(target, scope.shared.paths));

            inputIssues(scope, effect.with, here);

        } else {

            if ( "confirm" in effect ) textIssue(scope, effect.confirm, here);
            else if ( "check" in effect ) {

                const known = scope.forms.get(effect.check);

                if ( !known ) told(scope.issues, here, "check.form", `${effect.check}: no feature on this screen declares a form`, nearest(effect.check, scope.forms.keys()), "give the feature form: { field: rules }");

                for ( const field of known ? effect.fields ?? [] : [] ) {

                    if ( !known?.includes(field) ) told(scope.issues, here, "check.field", `${field}: not a field of the ${effect.check} form`, nearest(field, known ?? []), "name a field the form declares");

                }

            } else whenIssues(scope, effect.when, here);

            effectIssues(scope, effect.do, `${here}.do`, source);
            effectIssues(scope, effect.else ?? [], `${here}.else`, source);

        }

    }

}
function hookIssues ( scope: Scope, hooks: Readonly<Record<string, readonly Effect[] | undefined>>, at: string ): void {

    for ( const hook of Object.keys(hooks) ) effectIssues(scope, hooks[hook] ?? [], `${at}.on.${hook}`, undefined);

}
function triggerIssues ( scope: Scope, triggers: readonly Trigger[], at: string ): void {

    scope.inTrigger = true;

    for ( const [index, trigger] of triggers.entries() ) {

        scope.listened.add(trigger.on);
        whenIssues(scope, trigger.when, `${at}[${index}].when`);
        effectIssues(scope, trigger.do, `${at}[${index}].do`, undefined);

    }

    scope.inTrigger = false;

}
function listingIssues ( scope: Scope, binding: Extract<Binding, { read: string }>, facts: Catalogue[string] | undefined, at: string ): void {

    const listing = binding.list;

    if ( listing ) {

        const known = facts?.output;
        const sort = listing.sort?.startsWith("-") ? listing.sort.slice(1) : listing.sort;

        if ( facts && !facts.many ) told(scope.issues, at, "port.list", `${binding.read}: answers one row, a listing wants a list`);
        if ( sort && known && !known.includes(sort) ) told(scope.issues, at, "port.list", `${binding.read}: cannot sort by ${sort}`, nearest(sort, known));

        for ( const field of Object.keys(listing.filter ?? {}) ) {

            if ( known && !known.includes(field) ) told(scope.issues, at, "port.list", `${binding.read}: cannot filter by ${field}`, nearest(field, known));

            valueIssues(scope, listing.filter?.[field] as Value, at);

        }

        if ( listing.page !== undefined ) valueIssues(scope, listing.page, at);
        if ( listing.search !== undefined ) valueIssues(scope, listing.search, at);

    }

    if ( binding.live !== undefined && binding.live !== false ) scope.listened.add(typeof binding.live === "string" ? binding.live : `${binding.read.split(".")[0] ?? binding.read}.*`);

}
function bindingIssues ( scope: Scope, feature: Feature, manifest: Manifest | undefined, at: string ): void {

    const catalogue = scope.shared.options.catalogue;
    const ports = manifest?.ports ?? {};

    for ( const name of Object.keys(ports) ) {

        if ( ports[name]?.required !== false && !Object.hasOwn(feature.ports, name) ) told(scope.issues, at, "port.unbound", `${feature.name}: the port ${name} needs a binding`);

    }

    for ( const name of Object.keys(feature.ports) ) {

        const binding = feature.ports[name] as Binding;
        const here = `${at}.ports.${name}`;
        const port = own(ports, name);

        if ( manifest?.ports && !port ) {

            told(scope.issues, here, "port.unknown", `${feature.name}: no port named ${name}`, nearest(name, Object.keys(ports)));

            continue;

        }

        if ( "signal" in binding ) {

            pathIssue(scope, `signals.${binding.signal}`, here, "port.signal");

            continue;

        }

        if ( "data" in binding ) {

            if ( port?.kind === "write" ) told(scope.issues, here, "port.kind", `${name}: a write port cannot bind inline data`);
            if ( port?.kind === "list" && !Array.isArray(binding.data) ) told(scope.issues, here, "port.kind", `${name}: a list port wants an array`);

            continue;

        }

        const operation = "read" in binding ? binding.read : binding.write;
        const facts = own(catalogue, operation);

        inputIssues(scope, binding.input, here);

        if ( catalogue && !facts ) {

            told(scope.issues, here, "port.operation", `${operation}: not in the catalogue`, nearest(operation, Object.keys(catalogue)), "define the endpoint in api/<feature>.ts");

            continue;

        }

        if ( "read" in binding ) listingIssues(scope, binding, facts, here);
        if ( !facts ) continue;

        const strangers = Object.keys(binding.input ?? {}).filter(( key ) => !facts.input.includes(key));

        if ( strangers.length ) told(scope.issues, here, "port.input", `${operation}: takes no ${strangers.join(", ")}`);
        if ( "read" in binding && facts.write ) told(scope.issues, here, "port.kind", `${operation}: is a write, bound as a read`);
        if ( "write" in binding && !facts.write ) told(scope.issues, here, "port.kind", `${operation}: is a read, bound as a write`);
        if ( port?.kind === "list" && !facts.many ) told(scope.issues, here, "port.kind", `${name}: wants a list; ${operation} answers one row`);
        if ( port?.kind === "one" && facts.many ) told(scope.issues, here, "port.kind", `${name}: wants one row; ${operation} answers a list`);
        if ( port?.kind === "write" && "read" in binding ) told(scope.issues, here, "port.kind", `${name}: takes a write, not a read`);

        const wanted = [...(port?.fields ?? []), ...("write" in binding ? binding.fields ?? [] : [])];
        const known = "write" in binding ? facts.input : facts.output;
        const lacking = known ? wanted.filter(( field ) => !known.includes(field)) : [];

        if ( lacking.length ) told(scope.issues, here, "port.fields", `${operation}: lacks ${lacking.join(", ")}`);

    }

}
function cycleOf ( edges: readonly Edge[] ): string[] {

    const graph = new Map<string, Set<string>>();
    const state = new Map<string, number>();
    const trail: string[] = [];

    for ( const edge of edges ) {

        const known = graph.get(edge.from);

        if ( known ) known.add(edge.to);
        else graph.set(edge.from, new Set([edge.to]));

    }

    function visit ( node: string ): string[] {

        if ( state.get(node) === 1 ) return [...trail.slice(trail.indexOf(node)), node];
        if ( state.get(node) === 2 ) return [];

        state.set(node, 1);
        trail.push(node);

        for ( const next of [...(graph.get(node) ?? [])].sort() ) {

            const found = visit(next);

            if ( found.length ) return found;

        }

        trail.pop();
        state.set(node, 2);

        return [];

    }

    for ( const node of [...graph.keys()].sort() ) {

        const found = visit(node);

        if ( found.length ) return found;

    }

    return [];

}
function written ( effects: readonly Effect[], out: Set<string> ): void {

    for ( const effect of effects ) {

        if ( "set" in effect && effect.set.startsWith("signals.") ) out.add(effect.set.slice(8).split(".")[0] ?? "");
        if ( "check" in effect ) out.add("errors");

        if ( "do" in effect ) {

            written(effect.do, out);
            written(effect.else ?? [], out);

        }

    }

}
function writtenSignals ( found: Screen ): Set<string> {

    const out = new Set<string>(["failure"]);

    for ( const effects of Object.values(found.on) ) written(effects ?? [], out);
    for ( const trigger of found.triggers ) written(trigger.do, out);

    for ( const feature of found.features ) {

        for ( const effects of Object.values(feature.watch) ) written(effects, out);
        for ( const effects of Object.values(feature.on) ) written(effects ?? [], out);
        for ( const trigger of feature.triggers ) written(trigger.do, out);

    }

    return out;

}
function blockIssues ( scope: Scope, blocks: readonly Block[], at: string, level: number ): void {

    const schemas = scope.shared.options.blocks;

    for ( const [index, block] of blocks.entries() ) {

        const here = `${at}.blocks[${index}]`;
        const schema = own(schemas, block.kind);
        const checked = schema ? validate.check(schema, block.props, "spec.block") : undefined;

        if ( checked && !checked.ok ) {

            for ( const field of Object.keys(checked.fault.errors) ) told(scope.issues, here, "block.props", `block ${block.kind}: ${field} ${(checked.fault.errors[field] ?? []).join(",")}`);

        }

        if ( block.kind === "feature" && typeof block.props.name === "string" && !scope.features.has(block.props.name) ) told(scope.issues, here, "block.feature", `block feature: ${block.props.name} is not a feature of the screen`);

        whenIssues(scope, block.when, `${here}.when`);

        if ( level < deepest ) blockIssues(scope, block.children, here, level + 1);

    }

}
function compileScreen ( found: Screen, shared: Shared ): CompiledScreen {

    const { surface, options, issues } = shared;
    const at = `screens.${found.name}`;
    const params = parse.templateKeys(found.path);
    const features: CompiledFeature[] = found.features.map(( feature ) => ({ ...feature, id: feature.id ?? feature.name, manifest: own(shared.manifests, feature.name) }));
    const kinds = new Set<string>();
    const blockIds: string[] = [];
    const depth = measured(found.blocks, kinds, blockIds, 0);
    const allIds = [...blockIds, ...features.map(( feature ) => feature.id)];
    const scope: Scope = {
        at,
        issues,
        shared,
        params: new Set(params),
        query: new Set(found.query),
        signals: new Set([...surface.signals, ...found.signals, ...writtenSignals(found)]),
        fields: new Set(),
        ids: new Set(allIds),
        actions: new Set(),
        features: new Set(),
        emitted: new Set(),
        listened: new Set(),
        watches: [],
        inTrigger: false,
        steps: new Set(found.flow),
        forms: new Map(),
    };

    for ( const feature of features ) {

        const fields = Object.keys(feature.form);

        scope.features.add(feature.name).add(feature.id);

        for ( const signal of feature.manifest?.signals ?? [] ) scope.signals.add(signal);
        for ( const field of feature.manifest?.fields ?? [] ) scope.fields.add(field);
        for ( const field of fields ) scope.fields.add(field);
        for ( const action of feature.manifest?.actions ?? [] ) scope.actions.add(`${feature.name}.${action}`).add(`${feature.id}.${action}`);
        for ( const topic of feature.manifest?.emits ?? [] ) scope.emitted.add(topic);

        if ( fields.length > 0 && !scope.forms.has(feature.name) ) scope.forms.set(feature.name, fields);
        if ( fields.length > 0 && !scope.forms.has(feature.id) ) scope.forms.set(feature.id, fields);

    }

    const sorted = [...kinds].sort();
    const missing = surface.locales.filter(( code ) => typeof own(found.title, code) !== "string" || found.title[code] === "");

    if ( options.maxDepth !== undefined && depth > options.maxDepth ) told(issues, at, "depth", `blocks nest ${depth} deep, limit ${options.maxDepth}`);
    if ( missing.length ) told(issues, at, "locale.missing", `title misses a locale: ${missing.join(", ")}`);
    if ( found.role !== "any" && found.role !== surface.role ) told(issues, at, "role", `screen role ${found.role} is not the surface role ${surface.role}`);

    for ( const id of repeated(allIds) ) told(issues, at, "id.duplicate", `duplicate id ${id}`);

    for ( const kind of sorted ) {

        if ( shared.kinds && !shared.kinds.includes(kind) ) told(issues, at, "block.kind", `unknown block kind: ${kind}`, nearest(kind, shared.kinds), "declare the kind in the surface's blocks");

    }

    for ( const step of repeated(found.flow) ) told(issues, at, "flow.duplicate", `duplicate step ${step}`);
    for ( const key of repeated([...found.path.matchAll(slotted)].map(( hit ) => hit[1] ?? "")) ) told(issues, at, "path.param", `{${key}} is bound twice in ${found.path}`);
    for ( const wanted of found.access ) grantIssue(scope, wanted, at, "access.grant");

    blockIssues(scope, found.blocks, at, 0);

    for ( const [index, feature] of features.entries() ) {

        const here = `${at}.features[${index}]`;

        if ( shared.manifests && !feature.manifest ) told(issues, here, "feature.unknown", `unknown feature: ${feature.name}`, nearest(feature.name, Object.keys(shared.manifests)), "register the feature in features/index.ts and api/index.ts");

        for ( const wanted of feature.access ) grantIssue(scope, wanted, here, "access.grant");

        for ( const field of Object.keys(feature.form) ) {

            try {

                validate.rules(feature.form[field] as string);

            } catch ( caught ) {

                told(issues, `${here}.form.${field}`, "form.rule", `${field}: ${error.messageOf(caught)}`);

            }

        }

        if ( feature.manifest?.settings ) {

            const checked = validate.check(feature.manifest.settings, feature.settings, "spec.settings");

            if ( !checked.ok ) {

                for ( const field of Object.keys(checked.fault.errors) ) told(issues, here, "feature.settings", `${feature.name}: ${field} ${(checked.fault.errors[field] ?? []).join(",")}`);

            }

        }

        bindingIssues(scope, feature, feature.manifest, here);
        whenIssues(scope, feature.when, `${here}.when`);

        for ( const path of Object.keys(feature.watch) ) {

            pathIssue(scope, path, `${here}.watch.${path}`, "watch.path");
            effectIssues(scope, feature.watch[path] ?? [], `${here}.watch.${path}`, path);

        }

        hookIssues(scope, feature.on, here);
        triggerIssues(scope, feature.triggers, `${here}.triggers`);

    }

    hookIssues(scope, found.on, at);
    triggerIssues(scope, found.triggers, `${at}.triggers`);

    const cycle = cycleOf(scope.watches);

    if ( cycle.length ) told(issues, at, "watch.cycle", `watch cycle: ${cycle.join(" → ")}`);

    return { ...found, features, params, kinds: sorted, depth, ids: [...scope.ids].sort(), watches: scope.watches, emits: [...scope.emitted].sort(), listens: [...scope.listened].sort() };

}
function trusted<T extends object> ( given: T, shape: validate.Schema<T>, reason: string ): T {

    if ( isBuilt(given) ) return given;

    const checked = validate.check(shape, given, reason);

    if ( !checked.ok ) throw checked.fault;

    return checked.value;

}
function rawIssues ( screen: Screen, issues: Issue[] ): boolean {

    const at = `screens.${screen.name}`;
    let clean = true;

    function refuse ( where: string, shape: validate.Schema<object>, value: object, fits: boolean ): void {

        const checked = isBuilt(value) ? undefined : validate.check(shape, value, "spec.shape");

        if ( checked === undefined && fits ) return;
        if ( checked?.ok ) return;

        clean = false;

        if ( checked === undefined ) told(issues, where, "shape", "name: lowercase letters, digits, dots, dashes and underscores, from a letter");
        else for ( const field of Object.keys(checked.fault.errors) ) told(issues, where, "shape", `${field} ${(checked.fault.errors[field] ?? []).join(",")}`);

    }
    function walk ( blocks: readonly Block[], where: string, level: number ): void {

        for ( const [index, block] of blocks.entries() ) {

            refuse(`${where}.blocks[${index}]`, blockShapeOf as validate.Schema<object>, block, named(block.kind) && (block.id === undefined || named(block.id)) && Array.isArray(block.children));

            if ( level < deepest && Array.isArray(block.children) ) walk(block.children, `${where}.blocks[${index}]`, level + 1);

        }

    }

    refuse(at, screenShapeOf as validate.Schema<object>, screen, named(screen.name) && typeof screen.path === "string" && screen.path.length <= 256 && pathPattern.test(screen.path));

    for ( const [index, feature] of (screen.features ?? []).entries() ) refuse(`${at}.features[${index}]`, featureShapeOf as validate.Schema<object>, feature, named(feature.name) && (feature.id === undefined || named(feature.id)));

    walk(screen.blocks ?? [], at, 0);

    return clean;

}
function weight ( piece: string ): number {

    return piece === "*" ? 2 : piece.startsWith("{") ? 1 : 0;

}
function ahead ( left: Ranked, right: Ranked ): number {

    if ( left.fixed !== right.fixed ) return left.fixed ? -1 : 1;
    if ( left.pieces.length !== right.pieces.length ) return right.pieces.length - left.pieces.length;

    for ( let at = 0; at < left.pieces.length; at += 1 ) {

        const mine = left.pieces[at] as string;
        const theirs = right.pieces[at] as string;

        if ( mine !== theirs ) return weight(mine) - weight(theirs) || (mine < theirs ? -1 : 1);

    }

    return 0;

}
function blocksFit ( value: unknown, level: number ): boolean {

    return Array.isArray(value) && level <= deepest && value.every(( block ) => json.isRecord(block) && typeof block.kind === "string" && json.isRecord(block.props) && blocksFit(block.children, level + 1));

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
function lines ( label: string, items: readonly string[] ): string[] {

    return items.length ? [`${label}: ${items.join(", ")}`] : [];

}
function counted ( hooks: Readonly<Record<string, readonly Effect[] | undefined>> ): string[] {

    return Object.keys(hooks).filter(( hook ) => hooks[hook]?.length).map(( hook ) => `${hook}(${hooks[hook]?.length ?? 0})`);

}
function bound ( binding: Binding ): string {

    if ( "read" in binding ) return `read ${binding.read}${binding.live ? " live" : ""}${binding.list ? " listing" : ""}`;
    if ( "write" in binding ) return `write ${binding.write}`;

    return "data" in binding ? "data" : `signal ${binding.signal}`;

}
function blockLines ( blocks: readonly Block[], depth: number, out: string[] ): string[] {

    for ( const block of blocks ) {

        out.push(`${"  ".repeat(depth)}- ${block.kind}${block.id ? ` #${block.id}` : ""}${block.kind === "feature" ? ` → ${String(block.props.name)}` : ""}${block.when !== undefined ? " (when)" : ""}`);

        if ( depth <= deepest ) blockLines(block.children, depth + 1, out);

    }

    return out;

}

export function nearest ( given: string, known: Iterable<string> ): string | undefined {

    return string.closest([...known], given, ( item ) => item, 0.5)?.item;

}
export function screenOf ( compiled: Compiled, name: string ): CompiledScreen | undefined {

    return typeof name === "string" ? own(compiled.byName, name) : undefined;

}
export function compile ( given: Surface, options: Options = {} ): Compiled {

    const surface = trusted(given, surfaceShape as unknown as validate.Schema<Surface>, "spec.surface");
    const issues: Issue[] = [];
    const shared: Shared = {
        surface,
        options,
        issues,
        manifests: manifestsOf(options.features),
        paths: new Set(surface.screens.map(( found ) => found.path)),
        texts: options.texts ? new Set(options.texts) : undefined,
        kinds: options.kinds ?? (options.blocks ? Object.keys(options.blocks) : undefined),
    };
    const seenPaths = new Map<string, string>();
    const seenNames = new Set<string>();
    const ranked: Ranked[] = [];

    for ( const found of surface.screens ) {

        const at = `screens.${found.name}`;

        if ( seenNames.has(found.name) ) told(issues, at, "screen.duplicate", "duplicate screen name");
        if ( seenPaths.has(found.path) ) told(issues, at, "path.taken", `path already used by ${seenPaths.get(found.path)}`);

        seenNames.add(found.name);
        seenPaths.set(found.path, found.name);

        const screen: CompiledScreen = rawIssues(found, issues) ? compileScreen(found, shared) : { ...found, features: [], params: [], kinds: [], depth: 0, ids: [], watches: [], emits: [], listens: [] };
        const path = String(screen.path);

        ranked.push({ screen, fixed: screen.params.length === 0 && !path.includes("*"), pieces: path.split("/").filter(Boolean) });

    }

    const emitted = list.unique([...ranked.flatMap(( found ) => found.screen.emits), ...(options.topics ?? [])]).sort();
    const consumed = list.unique(ranked.flatMap(( found ) => found.screen.listens)).sort();

    for ( const topic of consumed ) {

        if ( !emitted.some(( known ) => event.matches(topic, known) || event.matches(known, topic)) ) told(issues, "topics", "trigger.topic", `${topic}: nothing emits this topic`, nearest(topic, emitted), "emit it from a feature manifest or an effect, or list it in topics");

    }

    const ordered = ranked.sort(ahead).map(( found ) => found.screen);
    const byName: Record<string, CompiledScreen> = {};

    for ( const found of ordered ) {

        if ( json.safeKey(found.name) ) byName[found.name] = found;

    }

    return {
        surface,
        screens: ordered,
        byName,
        features: list.unique(ordered.flatMap(( found ) => found.features.map(( feature ) => feature.name))).sort(),
        kinds: list.unique(ordered.flatMap(( found ) => found.kinds)).sort(),
        topics: { emitted, consumed },
        issues,
    };

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
export function explain ( compiled: Compiled, name: string ): string {

    const screen = screenOf(compiled, name);

    if ( !screen ) throw error.fault("not_found", "spec.screen", { errors: { screen: [String(name).slice(0, 80)] } });

    const out: string[] = [
        `${screen.name} ${screen.path} · role ${screen.role} · ${screen.menu ? "in the menu" : "off the menu"} · ${screen.auth ? "needs a session" : "open"}`,
        ...lines("access", screen.access),
        ...lines("params", screen.params),
        ...lines("query", screen.query),
        ...lines("signals", screen.signals),
        ...lines("flow", screen.flow),
        ...lines("emits", screen.emits),
        ...lines("listens", screen.listens),
        ...lines("watches", screen.watches.map(( edge ) => `${edge.from} → ${edge.to}`)),
        "blocks:",
        ...blockLines(screen.blocks, 1, []),
    ];

    for ( const feature of screen.features ) {

        out.push(`feature ${feature.name}${feature.id !== feature.name ? ` #${feature.id}` : ""}${feature.when !== undefined ? " (when)" : ""}`);
        out.push(...lines("  settings", Object.keys(feature.settings).map(( key ) => `${key}=${json.stringify(feature.settings[key])}`)));
        out.push(...lines("  ports", Object.keys(feature.ports).map(( port ) => `${port} ← ${bound(feature.ports[port] as Binding)}`)));
        out.push(...lines("  form", Object.keys(feature.form).map(( field ) => `${field}: ${feature.form[field]}`)));
        out.push(...lines("  watch", Object.keys(feature.watch)));
        out.push(...lines("  on", counted(feature.on)));
        out.push(...lines("  triggers", feature.triggers.map(( trigger ) => trigger.on)));
        out.push(...lines("  access", feature.access));

    }

    out.push(...lines("on", counted(screen.on)));
    out.push(...lines("triggers", screen.triggers.map(( trigger ) => trigger.on)));

    return `${out.join("\n")}\n`;

}
