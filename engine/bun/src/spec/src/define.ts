import type { Binding, Block, BlockOptions, Carry, Effect, Effects, Feature, FeatureOptions, Flow, Hooks, Input, Keyed, Kind, Listing, Moves, Piece, Plan, PlanOptions, Reactions, Reference, Screen, ScreenOptions, Trigger, Value, When, Wording } from "./arch.ts";
import { when as parseWhen } from "./when.ts";

export const built: unique symbol = Symbol.for("engine.spec.built");

const hooks: ReadonlySet<string> = new Set(["load", "leave", "submit", "success", "failure", "change"]);
const moves: ReadonlySet<string> = new Set(["enter", "leave"]);

function brand<T extends object> ( made: T ): T {

    Object.defineProperty(made, built, { value: true, enumerable: false });

    return made;

}
function judged ( given: When | string | undefined ): When | undefined {

    return given === undefined ? undefined : parseWhen(given);

}
function many ( given: Effects | undefined ): Effect[] {

    return given === undefined ? [] : Array.isArray(given) ? [...given] as Effect[] : [given as Effect];

}
function reacting<H> ( given: Reactions | undefined, listed: readonly Trigger[] | undefined, known: ReadonlySet<string> ): { on: H; triggers: Trigger[] } {

    const on: Record<string, Effect[]> = {};
    const triggers: Trigger[] = [...(listed ?? [])];

    for ( const key of Object.keys(given ?? {}) ) {

        const effects = given?.[key];

        if ( effects === undefined ) continue;

        if ( known.has(key) ) on[key] = many(effects);
        else triggers.push({ on: key, do: many(effects) });

    }

    return { on: on as H, triggers };

}
function keyOf ( given: Wording | undefined ): string | undefined {

    return typeof given === "object" && given !== null && Object.keys(given).length === 1 && typeof given.key === "string" ? given.key : undefined;

}
function worded ( given: Wording | undefined ): Record<string, string> {

    if ( typeof given === "string" ) return { en: given };

    return given === undefined || keyOf(given) !== undefined ? {} : given as Record<string, string>;

}
function keyed ( title: Wording | undefined, description: Wording | undefined ): Keyed {

    const made: Keyed = {};
    const [first, second] = [keyOf(title), keyOf(description)];

    if ( first !== undefined ) made.title = first;
    if ( second !== undefined ) made.description = second;

    return made;

}
function watching ( given: Record<string, Effects> | undefined ): Record<string, Effect[]> {

    return Object.fromEntries(Object.keys(given ?? {}).map(( path ) => [path, many(given?.[path])]));

}
function isFeature ( piece: Piece ): piece is Feature {

    return !("kind" in piece);

}
function placed ( pieces: readonly Piece[], found: Feature[] ): Block[] {

    return pieces.map(( piece ) => {

        if ( !isFeature(piece) ) return piece.children.some(isFeature) || piece.children.length > 0 ? brand({ ...piece, children: placed(piece.children, found) }) : piece;

        const name = piece.id ?? piece.name;

        if ( !found.some(( one ) => (one.id ?? one.name) === name) ) found.push(piece);

        return brand({ kind: "feature", id: undefined, props: { name }, when: undefined, children: [] });

    });

}
function pathOf ( name: string ): string {

    return `/${String(name).replaceAll(".", "/").replaceAll("_", "-")}`;

}

export function isBuilt ( value: unknown ): boolean {

    return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[built] === true;

}
export function block ( kind: string, props: Record<string, unknown> = {}, children: readonly Piece[] = [], options: BlockOptions = {} ): Block {

    return brand({ kind, id: options.id, props, when: judged(options.when), children: children as Block[] });

}
export function kind ( name: string ): Kind {

    return ( first?: Record<string, unknown> | readonly Piece[], second?: readonly Piece[] | BlockOptions, third?: BlockOptions ): Block => {

        if ( Array.isArray(first) ) return block(name, {}, first as readonly Piece[], second as BlockOptions | undefined);

        return block(name, first as Record<string, unknown> | undefined, second as readonly Piece[] | undefined, third);

    };

}
export function feature ( name: string, options: FeatureOptions = {} ): Feature {

    return brand({
        name,
        id: options.id,
        settings: options.settings ?? {},
        ports: options.ports ?? {},
        when: judged(options.when),
        watch: watching(options.watch),
        ...reacting<Hooks>(options.on, options.triggers, hooks),
        access: options.access ?? [],
        form: options.form ?? {},
    });

}
export function screen ( name: string, given: ScreenOptions = {} ): Screen {

    const features: Feature[] = [...(given.features ?? [])];
    const blocks = placed([...(given.layout ?? []), ...(given.blocks ?? [])], features);

    return brand({
        name,
        path: given.path ?? pathOf(name),
        title: worded(given.title),
        description: worded(given.description),
        texts: keyed(given.title, given.description),
        role: given.role ?? "any",
        menu: given.menu ?? true,
        index: given.index ?? true,
        icon: given.icon,
        auth: given.auth === true,
        guest: given.auth === "guest",
        access: given.access ?? [],
        query: given.query ?? [],
        signals: given.signals ?? [],
        settings: given.settings ?? {},
        features,
        blocks,
        ...reacting<Hooks>(given.on, given.triggers, hooks),
        flow: given.flow ?? [],
    });

}
export function voiced ( screen: Screen, said: Pick<Screen, "title" | "description"> ): Screen {

    return brand({ ...screen, ...said, texts: {} });

}
export function plan ( given: PlanOptions ): Plan {

    return brand({
        name: given.name,
        role: given.role,
        platform: given.platform ?? "web",
        world: given.world ?? [],
        locales: given.locales ?? ["en"],
        locale: given.locale ?? given.locales?.[0] ?? "en",
        ...(given.address === undefined ? {} : { address: given.address }),
        screens: given.screens,
        signals: given.signals ?? [],
        ...reacting<Moves>(given.on, given.triggers, moves),
    });

}
export function when ( text: string | When ): When {

    return parseWhen(text);

}
export function all ( ...conditions: readonly (When | string)[] ): When {

    return { all: conditions.map(parseWhen) };

}
export function any ( ...conditions: readonly (When | string)[] ): When {

    return { any: conditions.map(parseWhen) };

}
export function not ( condition: When | string ): When {

    const made = parseWhen(condition);

    return typeof made === "boolean" ? !made : { not: made };

}
export function can ( ability: string ): When {

    return { is: "user.abilities", can: ability };

}
export function read ( operation: string, input?: Input, options: { list?: Listing | undefined; live?: boolean | string | undefined } = {} ): Binding {

    const made: { read: string; input?: Input; list?: Listing; live?: boolean | string } = { read: operation };

    if ( input ) made.input = input;
    if ( options.list ) made.list = options.list;
    if ( options.live !== undefined ) made.live = options.live;

    return made;

}
export function write ( operation: string, input?: Input, fields?: string[] ): Binding {

    const made: { write: string; input?: Input; fields?: string[] } = { write: operation };

    if ( input ) made.input = input;
    if ( fields ) made.fields = fields;

    return made;

}
export function data ( value: unknown ): Binding {

    return { data: value };

}
export function signal ( name: string ): Binding {

    return { signal: name };

}
export function param ( name: string ): Reference {

    return { param: name };

}
export function query ( name: string ): Reference {

    return { query: name };

}
export function form ( name: string ): Reference {

    return { form: name };

}
export function user ( name: string ): Reference {

    return { user: name };

}
export function setting ( name: string ): Reference {

    return { setting: name };

}
export function text ( key: string ): Reference {

    return { text: key };

}
export function from ( path: string ): Reference {

    return { path };

}
export function fromSignal ( name: string ): Reference {

    return { signal: name };

}
export function fromEvent ( name: string ): Reference {

    return { path: `event.${name}` };

}
export function fromDevice ( name: string ): Reference {

    return { path: `device.${name}` };

}
export function fromFlow ( name: keyof Flow ): Reference {

    return { path: `flow.${name}` };

}
export function set ( path: string, to: Value ): Effect {

    return { set: path, to };

}
export function clear ( path: string ): Effect {

    return { clear: path };

}
export function show ( target: string ): Effect {

    return { show: target };

}
export function hide ( target: string ): Effect {

    return { hide: target };

}
export function enable ( target: string ): Effect {

    return { enable: target };

}
export function disable ( target: string ): Effect {

    return { disable: target };

}
export function emit ( topic: string, payload?: Input ): Effect {

    return payload ? { emit: topic, with: payload } : { emit: topic };

}
export function call ( action: string, input?: Input ): Effect {

    return input ? { call: action, with: input } : { call: action };

}
export function queued ( action: string, input?: Input ): Effect {

    return input ? { call: action, with: input, queue: true } : { call: action, queue: true };

}
export function refresh ( featureName: string ): Effect {

    return { refresh: featureName };

}
export function navigate ( path: string, input?: Input ): Effect {

    return input ? { navigate: path, with: input } : { navigate: path };

}
export function transfer ( name: string, options: { to?: string | undefined; with?: Input | undefined; refresh?: boolean | undefined; carry?: Carry | undefined } = {} ): Effect {

    const names = Object.keys(options.carry ?? {}).filter(( key ) => key !== "inherit" && options.carry?.[key] === true);

    return {
        transfer: name,
        ...(options.to === undefined ? {} : { to: options.to }),
        ...(options.with === undefined ? {} : { with: options.with }),
        ...(options.refresh === undefined ? {} : { reload: options.refresh }),
        ...(names.length === 0 ? {} : { carry: names }),
        ...(options.carry?.inherit === false ? { inherit: false } : {}),
    };

}
export function open ( path: string, options: { with?: Input | undefined; [prop: string]: unknown } = {} ): Effect {

    const { with: input, ...props } = options;

    return { open: path, ...(input === undefined ? {} : { with: input }), ...(Object.keys(props).length === 0 ? {} : { props }) };

}
export function close ( which: "top" | "all" = "top" ): Effect {

    return { close: which };

}
export function toggle ( path: string ): Effect {

    return { toggle: path };

}
export function after ( ms: number, effects: Effects ): Effect {

    return { after: ms, do: many(effects) };

}
export function debounce ( ms: number, effects: Effects ): Effect {

    return { after: ms, do: many(effects), latest: true };

}
export function step ( to: "next" | "back" | string ): Effect {

    return { step: to };

}
export function branch ( condition: When | string, effects: Effects, otherwise?: Effects ): Effect {

    return otherwise ? { when: parseWhen(condition), do: many(effects), else: many(otherwise) } : { when: parseWhen(condition), do: many(effects) };

}
export function confirm ( key: string, run: Effects, otherwise?: Effects ): Effect {

    return otherwise ? { confirm: key, do: many(run), else: many(otherwise) } : { confirm: key, do: many(run) };

}
export function check ( featureName: string, run: Effects, otherwise?: Effects, fields?: string[] ): Effect {

    return { check: featureName, do: many(run), ...(otherwise ? { else: many(otherwise) } : {}), ...(fields ? { fields } : {}) };

}
export function trigger ( on: string, effects: Effects, condition?: When | string ): Trigger {

    return condition === undefined ? { on, do: many(effects) } : { on, do: many(effects), when: parseWhen(condition) };

}
