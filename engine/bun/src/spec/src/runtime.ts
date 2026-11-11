import * as auth from "engine-auth";
import * as error from "engine-error";
import * as event from "engine-event";
import * as json from "engine-json";
import * as parse from "engine-parse";
import * as string from "engine-string";
import * as validate from "engine-validate";
import { type Compiled, type CompiledFeature, type CompiledScreen, screenOf } from "./compile.ts";
import { type Block, type Effect, namespaces, type Screen, type Trigger } from "./shapes.ts";
import { type Context, empty, evaluate, type Flow, resolve, resolveAll, type Translate } from "./when.ts";

export type Matched = { screen: CompiledScreen; params: Record<string, string> };
export type MenuItem = { name: string; path: string; title: string; icon: string | undefined; active: boolean };
export type Handler = ( input: json.Dictionary, runtime: Runtime ) => unknown | Promise<unknown>;
export type Navigate = ( path: string ) => void;
export type Readable<T> = { getState: () => T; subscribe: ( listener: ( state: T, previous: T ) => void ) => () => void };
export type Visibility = { hidden: Set<string>; disabled: Set<string> };
export type Mounted = { screen: CompiledScreen; unmount: () => Promise<void> };
export type Confirm = ( key: string, context: Context ) => Promise<boolean> | boolean;
export type Queue = ( action: string, input: json.Dictionary ) => Promise<unknown> | unknown;
export type Rulebook = ( form: Record<string, string> ) => validate.Schema;
export type RuntimeOptions = {
    bus?: event.Bus | undefined;
    navigate?: Navigate | undefined;
    handlers?: Readonly<Record<string, Handler>> | undefined;
    context?: Partial<Context> | undefined;
    translate?: Translate | undefined;
    confirm?: Confirm | undefined;
    queue?: Queue | undefined;
    rulebook?: Rulebook | undefined;
    fail?: (( fault: error.Fault, where: string ) => void) | undefined;
};
export type Runtime = {
    readonly compiled: Compiled;
    readonly bus: event.Bus;
    readonly state: Readable<Context>;
    readonly view: Readable<Visibility>;
    get: ( path: string ) => unknown;
    set: ( path: string, value: unknown ) => void;
    patch: ( values: Partial<Context> ) => void;
    handle: ( action: string, handler: Handler ) => () => void;
    run: ( effects: readonly Effect[] ) => Promise<void>;
    act: ( feature: string, action: string, input?: json.Dictionary ) => Promise<unknown>;
    mount: ( name: string, route?: { params?: Record<string, string> | undefined; query?: Record<string, string | string[]> | undefined } ) => Promise<Mounted>;
    visible: ( id: string ) => boolean;
    enabled: ( id: string ) => boolean;
    placed: ( screen: string, feature: string ) => CompiledFeature | undefined;
    settings: ( screen: string, feature: string ) => json.Dictionary;
    allowed: ( id: string ) => boolean;
    opens: ( screen: string ) => boolean;
    flow: () => Flow;
    errors: ( feature: string, fields?: readonly string[] ) => error.Errors | undefined;
};

type Space = (typeof namespaces)[number];
type Index = { ids: Map<string, CompiledFeature>; names: Map<string, CompiledFeature>; blocks: Map<string, Block>; settings: json.Dictionary };
type Routes = { fixed: Map<string, CompiledScreen>; moving: CompiledScreen[]; menu: CompiledScreen[] };
type Chain = { live: () => boolean; seen: () => Context };
type Stage = { screen: CompiledScreen; index: Index; live: boolean; stops: (() => void)[]; left: Promise<void> | undefined; chain: Chain };
type Watcher = { keys: string[]; head: Space; effects: readonly Effect[]; where: string };
type Hook = { effects: readonly Effect[]; where: string };

const roots: ReadonlySet<string> = new Set(namespaces);
const indexes = new WeakMap<CompiledScreen, Index>();
const tables = new WeakMap<Compiled, Routes>();
const nothing: json.Dictionary = Object.freeze({});
const deepest = 64;

function isSpace ( key: string ): key is Space {

    return roots.has(key);

}
function fits ( key: Space, value: unknown ): boolean {

    if ( key === "locale" ) return typeof value === "string";
    if ( key === "user" ) return value === null || json.isRecord(value);
    if ( key !== "flow" ) return json.isRecord(value);

    return json.isRecord(value) && typeof value.step === "string" && Number.isInteger(value.index) && typeof value.first === "boolean" && typeof value.last === "boolean" && typeof value.done === "boolean";

}
function refused ( path: unknown ): error.Fault {

    const label = typeof path === "string" ? path.slice(0, 120) : "";

    return error.fault("internal", "spec.path", { message: `${label}: not a context path`, errors: { path: [label] } });

}
function absent ( name: unknown ): error.Fault {

    const label = typeof name === "string" ? name.slice(0, 120) : "";

    return error.fault("not_found", "spec.screen", { message: `${label}: no such screen`, errors: { screen: [label] } });

}
function absorbed ( base: Context, given: Partial<Context> | undefined ): Context {

    if ( given === undefined ) return base;
    if ( !json.isRecord(given) ) throw refused("");

    const source: json.Dictionary = given;
    const made: json.Dictionary = { ...base };

    for ( const key of Object.keys(source) ) {

        const value = source[key];

        if ( value === undefined ) continue;
        if ( !isSpace(key) || !fits(key, value) ) throw refused(key);

        made[key] = value;

    }

    return made as Context;

}
function cleaned ( path: string ): string {

    let end = path.length;
    let from = 0;

    for ( let at = 0; at < path.length; at += 1 ) {

        const code = path.charCodeAt(at);

        if ( code !== 63 && code !== 35 ) continue;

        end = at;

        break;

    }

    while ( from < end && path.charCodeAt(from) === 47 ) from += 1;
    while ( end > from && path.charCodeAt(end - 1) === 47 ) end -= 1;

    return `/${path.slice(from, end)}`;

}
function moves ( path: string ): boolean {

    return path.includes("{") || path.includes("*");

}
function tabled ( compiled: Compiled ): Routes {

    const known = tables.get(compiled);

    if ( known ) return known;

    const made: Routes = { fixed: new Map(), moving: [], menu: [] };
    const listed = new Set<CompiledScreen>();

    for ( const screen of compiled.screens ) {

        if ( moves(screen.path) ) made.moving.push(screen);
        else if ( !made.fixed.has(screen.path) ) made.fixed.set(screen.path, screen);

    }

    for ( const declared of compiled.surface.screens ) {

        const screen = screenOf(compiled, declared.name);

        if ( !screen || listed.has(screen) || screen.menu !== true || moves(screen.path) ) continue;

        listed.add(screen);
        made.menu.push(screen);

    }

    tables.set(compiled, made);

    return made;

}
function indexed ( screen: CompiledScreen ): Index {

    const known = indexes.get(screen);

    if ( known ) return known;

    const made: Index = { ids: new Map(), names: new Map(), blocks: new Map(), settings: {} };
    const pending: Block[] = [...screen.blocks];

    for ( const feature of screen.features ) {

        if ( !made.ids.has(feature.id) ) made.ids.set(feature.id, feature);
        if ( !made.names.has(feature.name) ) made.names.set(feature.name, feature);

    }

    for ( const feature of [...made.ids.values()].sort(( left, right ) => left.id.length - right.id.length) ) made.settings = json.pathSet(made.settings, feature.id, json.clone(feature.settings));

    for ( let at = 0; at < pending.length; at += 1 ) {

        const block = pending[at];

        if ( !block ) continue;
        if ( block.id !== undefined && !made.blocks.has(block.id) ) made.blocks.set(block.id, block);

        for ( const child of block.children ) pending.push(child);

    }

    indexes.set(screen, made);

    return made;

}
function placedIn ( index: Index, key: string ): CompiledFeature | undefined {

    return index.ids.get(key) ?? index.names.get(key);

}
function copied ( given: unknown ): Record<string, string> {

    const made: Record<string, string> = {};

    if ( !json.isRecord(given) ) return made;

    for ( const key of Object.keys(given) ) {

        const value = given[key];

        if ( json.safeKey(key) && typeof value === "string" ) made[key] = value;

    }

    return made;

}
function queried ( given: unknown ): Record<string, string | string[]> {

    const made: Record<string, string | string[]> = {};

    if ( !json.isRecord(given) ) return made;

    for ( const key of Object.keys(given) ) {

        const value = given[key];

        if ( !json.safeKey(key) ) continue;

        if ( typeof value === "string" ) made[key] = value;
        else if ( Array.isArray(value) ) made[key] = value.filter(( item ): item is string => typeof item === "string");

    }

    return made;

}
function worded ( value: unknown ): string {

    if ( typeof value === "string" ) return value;

    return (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean" ? String(value) : "";

}
function filled ( pattern: string, values: json.Dictionary ): string {

    const params: Record<string, string> = {};
    const rest: Record<string, string> = {};

    for ( const key of parse.placeholders(pattern) ) {

        const text = worded(Object.hasOwn(values, key) ? values[key] : undefined);

        if ( text === "" ) throw error.fault("internal", "spec.navigate", { message: `${pattern}: {${key}} has no value`, errors: { [key]: ["required"] } });

        params[key] = text;

    }

    for ( const key of Object.keys(values) ) {

        const text = Object.hasOwn(params, key) ? "" : worded(values[key]);

        if ( text !== "" ) rest[key] = text;

    }

    try {

        const path = parse.fill(pattern, params);
        const extra = parse.queryString(rest);

        return extra === "" ? path : `${path}${path.includes("?") ? "&" : "?"}${extra}`;

    } catch ( caught ) {

        throw error.fault("internal", "spec.navigate", { message: `${pattern}: ${error.of(caught).message}` });

    }

}
function resource ( operation: string ): string {

    const dot = operation.indexOf(".");

    return dot === -1 ? operation : operation.slice(0, dot);

}
function flowOf ( steps: readonly string[], index: number ): Flow {

    return { step: steps[index] ?? "", index, first: index <= 0, last: index >= steps.length - 1, done: index >= steps.length };

}
function blank (): Visibility {

    return { hidden: new Set(), disabled: new Set() };

}
function settled (): Promise<void> {

    return Promise.resolve();

}
function readable<T> ( signal: event.Signal<T> ): Readable<T> {

    return { getState: signal.get, subscribe: ( listener ) => signal.watch(listener) };

}

export function match ( compiled: Compiled, path: string ): Matched | undefined {

    if ( typeof path !== "string" ) return undefined;

    const routes = tabled(compiled);
    const clean = cleaned(path);
    const fixed = routes.fixed.get(clean);

    if ( fixed ) return { screen: fixed, params: {} };

    for ( const screen of routes.moving ) {

        const params = parse.match(screen.path, clean);

        if ( params ) return { screen, params };

    }

    return undefined;

}
export function titleOf ( screen: Pick<Screen, "name" | "title">, locale: string, fallback = "en" ): string {

    const titles: json.Dictionary = json.isRecord(screen.title) ? screen.title : {};
    let tag = typeof locale === "string" ? locale : "";

    while ( tag !== "" ) {

        const found = Object.hasOwn(titles, tag) ? titles[tag] : undefined;
        const dash = tag.lastIndexOf("-");

        if ( typeof found === "string" && found !== "" ) return found;

        tag = dash === -1 ? "" : tag.slice(0, dash);

    }

    for ( const key of [fallback, ...Object.keys(titles)] ) {

        const found = Object.hasOwn(titles, key) ? titles[key] : undefined;

        if ( typeof found === "string" && found !== "" ) return found;

    }

    return string.title(screen.name);

}
export function menuOf ( compiled: Compiled, locale: string, current = "/" ): MenuItem[] {

    const at = cleaned(typeof current === "string" ? current : "/");

    return tabled(compiled).menu.map(( screen ) => ({
        name: screen.name,
        path: screen.path,
        title: titleOf(screen, locale, compiled.surface.locale),
        icon: screen.icon,
        active: screen.path === "/" ? at === "/" : at === screen.path || at.startsWith(`${screen.path}/`),
    }));

}
export function featuresOf ( compiled: Compiled, name: string ): Record<string, unknown> {

    const screen = screenOf(compiled, name);
    const made: Record<string, unknown> = {};

    if ( !screen ) throw absent(name);

    for ( const feature of screen.features ) {

        if ( json.safeKey(feature.id) && !Object.hasOwn(made, feature.id) ) made[feature.id] = json.clone(feature.settings);

    }

    return made;

}
export function runtime ( compiled: Compiled, options: RuntimeOptions = {} ): Runtime {

    const bus = options.bus ?? event.bus();
    const state = event.signal<Context>(absorbed(empty(), options.context), json.equal);
    const view = event.signal<Visibility>(blank());
    const handlers = new Map<string, Handler>();
    const books = new WeakMap<CompiledFeature, validate.Schema>();
    const loose: Chain = { live: () => true, seen: state.get };
    const { translate, rulebook } = options;
    let active: Stage | undefined;
    let lease = 0;
    let holder: unknown;
    let held: readonly string[] = [];

    function abilities (): readonly string[] {

        const user = state.get().user;

        if ( user === holder ) return held;

        const found = user?.abilities;

        holder = user;
        held = Array.isArray(found) ? found.filter(( item ): item is string => typeof item === "string") : [];

        return held;

    }
    function may ( required: readonly string[] ): boolean {

        return required.length === 0 || auth.granted(abilities(), required);

    }
    function bookOf ( feature: CompiledFeature ): validate.Schema | undefined {

        const known = books.get(feature);

        if ( known || !rulebook || Object.keys(feature.form).length === 0 ) return known;

        const book = rulebook(feature.form);

        books.set(feature, book);

        return book;

    }
    function write ( path: string, value: unknown ): void {

        if ( typeof path !== "string" ) throw refused(path);

        const keys = json.pathKeys(path);
        const head = keys[0];

        if ( head === undefined || !isSpace(head) || keys.length > deepest || !keys.every(json.safeKey) || (head === "locale" && keys.length > 1) ) throw refused(path);
        if ( path.split(".").length !== keys.length ) throw refused(path);

        const previous = state.get();
        const item = value === undefined && keys.length === 1 ? empty()[head] : value;
        const next = item === undefined ? (json.unset(previous, keys) as Context) : json.pathSet(previous, keys, item);

        if ( !fits(head, next[head]) ) throw refused(path);

        state.set(next);

    }
    function toggle ( kind: keyof Visibility, id: string, on: boolean ): void {

        const current = view.get();

        if ( current[kind].has(id) === on ) return;

        const next: Visibility = { hidden: new Set(current.hidden), disabled: new Set(current.disabled) };

        if ( on ) next[kind].add(id);
        else next[kind].delete(id);

        view.set(next);

    }
    function told ( fault: error.Fault, where: string ): void {

        error.attemptSync(() => options.fail?.(fault, where));

    }
    function marked ( caught: unknown, where: string ): void {

        const noted = error.attemptSync(() => write("signals.failure", error.describe(caught)));

        if ( !noted.ok ) told(noted.fault, where);

    }
    function failed ( caught: unknown, where: string ): void {

        marked(caught, where);
        told(error.of(caught), where);

    }
    function settle ( work: Promise<unknown>, where: string ): void {

        void work.catch(( caught: unknown ) => failed(caught, where));

    }
    function keyed ( feature: string, action: string ): string {

        const exact = `${feature}.${action}`;
        const found = handlers.has(exact) || !active ? undefined : placedIn(active.index, feature);

        if ( !found ) return exact;
        if ( handlers.has(`${found.id}.${action}`) ) return `${found.id}.${action}`;

        return handlers.has(`${found.name}.${action}`) ? `${found.name}.${action}` : exact;

    }
    function named ( action: string ): string {

        const dot = action.lastIndexOf(".");

        return dot === -1 ? action : keyed(action.slice(0, dot), action.slice(dot + 1));

    }
    async function invoke ( action: string, input: json.Dictionary ): Promise<unknown> {

        const handler = handlers.get(action);
        const label = action.slice(0, 120);

        if ( !handler ) throw error.fault("not_found", "spec.action", { message: `${label}: no handler is registered`, errors: { action: [label] } });

        return handler(input, made);

    }
    function stepped ( to: string ): Flow {

        const steps = active?.screen.flow ?? [];
        const at = state.get().flow.index;
        const index = to === "next" ? Math.min(steps.length, at + 1) : to === "back" ? Math.max(0, at - 1) : steps.indexOf(to);

        if ( steps.length === 0 || index < 0 ) throw error.fault("not_found", "spec.step", { message: `${String(to).slice(0, 120)}: no such step on this screen`, errors: { step: [String(to).slice(0, 120)] } });

        return flowOf(steps, index);

    }
    function errors ( feature: string, fields?: readonly string[] ): error.Errors | undefined {

        const found = active ? placedIn(active.index, feature) : undefined;
        const book = found ? bookOf(found) : undefined;

        if ( !found || !book ) return undefined;

        const checked = validate.check(book, state.get().form, `${found.name}.form`);

        if ( checked.ok ) return {};
        if ( fields === undefined ) return checked.fault.errors;

        const narrowed: error.Errors = {};

        for ( const field of fields ) {

            const lines = json.safeKey(field) && Object.hasOwn(checked.fault.errors, field) ? checked.fault.errors[field] : undefined;

            if ( lines ) narrowed[field] = lines;

        }

        return narrowed;

    }
    async function perform ( effects: readonly Effect[], chain: Chain, depth: number ): Promise<void> {

        if ( depth > deepest ) throw error.fault("internal", "spec.depth", { message: "effects nest too deep" });

        for ( const effect of effects ) {

            if ( !chain.live() ) return;
            if ( !json.isRecord(effect) ) throw error.fault("internal", "spec.effect", { message: "an effect is an object" });

            if ( "set" in effect ) write(effect.set, resolve(effect.to, chain.seen(), translate));
            else if ( "clear" in effect ) write(effect.clear, undefined);
            else if ( "show" in effect ) toggle("hidden", effect.show, false);
            else if ( "hide" in effect ) toggle("hidden", effect.hide, true);
            else if ( "enable" in effect ) toggle("disabled", effect.enable, false);
            else if ( "disable" in effect ) toggle("disabled", effect.disable, true);
            else if ( "emit" in effect ) bus.publish(effect.emit, resolveAll(effect.with, chain.seen(), translate));
            else if ( "call" in effect ) {

                const input = resolveAll(effect.with, chain.seen(), translate);

                if ( effect.queue === true && options.queue && state.get().device.online === false ) await options.queue(effect.call, input);
                else await invoke(named(effect.call), input);

            } else if ( "step" in effect ) write("flow", stepped(effect.step));
            else if ( "confirm" in effect ) {

                const agreed = options.confirm ? (await options.confirm(effect.confirm, chain.seen())) === true : false;

                await perform(agreed ? effect.do : (effect.else ?? []), chain, depth + 1);

            } else if ( "check" in effect ) {

                const found = errors(effect.check, effect.fields);

                if ( found && Object.keys(found).length === 0 ) {

                    if ( state.get().signals.errors !== undefined ) write("signals.errors", undefined);

                    await perform(effect.do, chain, depth + 1);

                } else {

                    if ( found ) write("signals.errors", found);

                    await perform(effect.else ?? [], chain, depth + 1);

                }

            } else if ( "refresh" in effect ) await invoke(keyed(effect.refresh, "refresh"), {});
            else if ( "navigate" in effect ) options.navigate?.(filled(effect.navigate, resolveAll(effect.with, chain.seen(), translate)));
            else if ( "when" in effect ) await perform(evaluate(effect.when, chain.seen()) ? effect.do : (effect.else ?? []), chain, depth + 1);
            else throw error.fault("internal", "spec.effect", { message: "an effect names what it does" });

        }

    }
    async function hooked ( effects: readonly Effect[] | undefined, chain: Chain, where: string ): Promise<void> {

        if ( effects === undefined || effects.length === 0 ) return;

        try {

            await perform(effects, chain, 0);

        } catch ( caught ) {

            failed(caught, where);

        }

    }
    function wired ( stage: Stage, triggers: readonly Trigger[], where: string ): void {

        for ( const trigger of triggers ) {

            const label = `${where}.${trigger.on}`;

            stage.stops.push(bus.subscribe(trigger.on, ( payload ) => {

                if ( !stage.live ) return;

                const carried: json.Dictionary = json.isRecord(payload) ? payload : { value: payload };
                const seen = (): Context => {

                    const now = state.get();

                    return now.event === carried ? now : { ...now, event: carried };

                };

                try {

                    write("event", carried);

                    if ( evaluate(trigger.when, state.get()) ) settle(perform(trigger.do, { live: stage.chain.live, seen }, 0), label);

                } catch ( caught ) {

                    failed(caught, label);

                }

            }));

        }

    }
    function fed ( stage: Stage ): void {

        for ( const feature of stage.screen.features ) {

            const topics = new Set<string>();

            for ( const key of Object.keys(feature.ports) ) {

                const binding = feature.ports[key];

                if ( !binding || !("read" in binding) || binding.live === undefined || binding.live === false ) continue;

                topics.add(typeof binding.live === "string" ? binding.live : `${resource(binding.read)}.*`);

            }

            for ( const topic of topics ) {

                stage.stops.push(bus.subscribe(topic, () => {

                    const action = keyed(feature.id, "refresh");

                    if ( stage.live && handlers.has(action) ) settle(invoke(action, {}), `${feature.id}.live`);

                }));

            }

        }

    }
    function watched ( stage: Stage ): void {

        const watchers: Watcher[] = [];
        const changes: Hook[] = [];

        for ( const feature of stage.screen.features ) {

            for ( const path of Object.keys(feature.watch) ) {

                const keys = json.pathKeys(path);
                const head = keys[0];
                const effects = feature.watch[path];

                if ( head !== undefined && isSpace(head) && effects?.length ) watchers.push({ keys, head, effects, where: `${feature.id}.watch.${path}` });

            }

            if ( feature.on.change?.length ) changes.push({ effects: feature.on.change, where: `${feature.id}.change` });

        }

        if ( stage.screen.on.change?.length ) changes.push({ effects: stage.screen.on.change, where: `${stage.screen.name}.change` });
        if ( watchers.length === 0 && changes.length === 0 ) return;

        stage.stops.push(state.watch(( next, previous ) => {

            if ( !stage.live ) return;

            for ( const watcher of watchers ) {

                if ( next[watcher.head] === previous[watcher.head] || json.equal(json.pathGet(next, watcher.keys), json.pathGet(previous, watcher.keys)) ) continue;

                settle(perform(watcher.effects, stage.chain, 0), watcher.where);

            }

            if ( next.form === previous.form || json.equal(next.form, previous.form) ) return;

            for ( const hook of changes ) settle(perform(hook.effects, stage.chain, 0), hook.where);

        }));

    }
    async function departed ( stage: Stage ): Promise<void> {

        try {

            for ( const feature of stage.screen.features ) await hooked(feature.on.leave, loose, `${feature.id}.leave`);

            await hooked(stage.screen.on.leave, loose, `${stage.screen.name}.leave`);

        } finally {

            if ( active === stage ) active = undefined;

        }

    }
    function retire ( stage: Stage ): Promise<void> {

        if ( stage.left ) return stage.left;

        stage.live = false;

        for ( const stop of stage.stops ) error.attemptSync(stop);

        stage.stops.length = 0;
        stage.left = departed(stage);

        return stage.left;

    }
    async function mount ( name: string, route: { params?: Record<string, string> | undefined; query?: Record<string, string | string[]> | undefined } = {} ): Promise<Mounted> {

        const screen = screenOf(compiled, name);

        if ( !screen ) throw absent(name);

        lease += 1;

        const ticket = lease;
        const index = indexed(screen);
        const stage: Stage = { screen, index, live: true, stops: [], left: undefined, chain: { live: () => stage.live, seen: state.get } };

        if ( active ) await retire(active);
        if ( ticket !== lease ) return { screen, unmount: settled };

        active = stage;

        try {

            view.set(blank());
            state.set({ ...state.get(), params: copied(route.params), query: queried(route.query), form: {}, settings: index.settings, flow: flowOf(screen.flow, screen.flow.length ? 0 : -1) });
            wired(stage, screen.triggers, screen.name);

            for ( const feature of screen.features ) wired(stage, feature.triggers, feature.id);

            fed(stage);
            watched(stage);

        } catch ( caught ) {

            await retire(stage);

            throw caught;

        }

        await hooked(screen.on.load, stage.chain, `${screen.name}.load`);

        for ( const feature of screen.features ) await hooked(feature.on.load, stage.chain, `${feature.id}.load`);

        return { screen, unmount: () => retire(stage) };

    }
    async function act ( feature: string, action: string, input: json.Dictionary = {} ): Promise<unknown> {

        if ( typeof feature !== "string" || typeof action !== "string" ) throw error.fault("not_found", "spec.action", { message: "an action is named by its feature and its verb" });

        const stage = active;
        const found = stage ? placedIn(stage.index, feature) : undefined;
        const chain = stage ? stage.chain : loose;
        const where = `${feature}.${action}`.slice(0, 120);
        let result: unknown;

        await perform(found?.on.submit ?? [], chain, 0);
        await perform(stage?.screen.on.submit ?? [], chain, 0);

        try {

            result = await invoke(keyed(feature, action), json.isRecord(input) ? input : {});

        } catch ( caught ) {

            marked(caught, where);
            await hooked(found?.on.failure, chain, `${where}.failure`);
            await hooked(stage?.screen.on.failure, chain, `${where}.failure`);

            throw caught;

        }

        await hooked(found?.on.success, chain, `${where}.success`);
        await hooked(stage?.screen.on.success, chain, `${where}.success`);

        return result;

    }
    function visible ( id: string ): boolean {

        if ( view.get().hidden.has(id) ) return false;
        if ( !active ) return true;

        const context = state.get();
        const feature = active.index.ids.get(id);

        if ( feature ) return evaluate(feature.when, context);

        const block = active.index.blocks.get(id);

        if ( block ) return evaluate(block.when, context);

        return evaluate(active.index.names.get(id)?.when, context);

    }
    function allowed ( id: string ): boolean {

        if ( !active ) return true;

        const feature = placedIn(active.index, id);

        return may(feature ? feature.access : active.screen.access);

    }
    function opens ( name: string ): boolean {

        const screen = screenOf(compiled, name);

        return screen !== undefined && !(screen.auth === true && state.get().user === null) && may(screen.access);

    }
    function placed ( name: string, feature: string ): CompiledFeature | undefined {

        const screen = screenOf(compiled, name);

        return screen && typeof feature === "string" ? placedIn(indexed(screen), feature) : undefined;

    }

    const made: Runtime = {
        compiled,
        bus,
        state: readable(state),
        view: readable(view),
        get: ( path ) => (typeof path === "string" ? json.pathGet(state.get(), path) : undefined),
        set: write,
        patch: ( values ) => state.set(absorbed(state.get(), values)),
        handle: ( action, handler ) => {

            if ( typeof action !== "string" || action === "" || typeof handler !== "function" ) throw error.fault("internal", "spec.handler", { message: "a handler is a function under an action name" });

            handlers.set(action, handler);

            return () => {

                if ( handlers.get(action) === handler ) handlers.delete(action);

            };

        },
        run: ( effects ) => perform(effects, loose, 0),
        act,
        mount,
        visible,
        enabled: ( id ) => !view.get().disabled.has(id),
        placed,
        settings: ( name, feature ) => placed(name, feature)?.settings ?? nothing,
        allowed,
        opens,
        flow: () => state.get().flow,
        errors,
    };

    if ( !rulebook ) {

        for ( const screen of compiled.screens ) {

            for ( const feature of screen.features ) {

                if ( Object.keys(feature.form).length > 0 ) throw error.fault("internal", "spec.rulebook", { message: `${feature.name}: a form needs the runtime's rulebook option`, errors: { feature: [feature.name] } });

            }

        }

    }

    for ( const key of Object.keys(options.handlers ?? {}) ) {

        const handler = options.handlers?.[key];

        if ( typeof handler === "function" ) handlers.set(key, handler);

    }

    return made;

}
