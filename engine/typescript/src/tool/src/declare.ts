import * as exception from "engine-exception";
import * as json from "engine-json";
import * as spec from "engine-spec";
import type { Declaration, Described, Project, Steps, View } from "./arch.ts";
import { budget } from "./budget.ts";
import { define, each, env, option, step, target } from "./project.ts";
import { bundle, call, copy, css, emit, fonts, layers, page, run, script, specs, spoken, styles, theme } from "./steps.ts";

const kinds: Readonly<Record<string, readonly string[]>> = {
    run: ["env", "cwd"],
    copy: [],
    emit: [],
    specs: [],
    theme: [],
    styles: [],
    fonts: [],
    call: [],
    script: [],
    bundle: [],
    css: [],
    page: [],
    spoken: [],
    budget: [],
    layers: [],
    step: ["act"],
    each: ["roles"],
    target: ["steps"],
    option: ["on", "off"],
    env: ["steps"],
};
const holds: readonly string[] = ["specs", "part", "seeds", "assets", "paths", "steps", "tasks"];

function refused ( at: string, message: string ): exception.Fault {

    return exception.fault("internal", "tool.project", { message: `${at}: ${message}` });

}
function nearby ( word: string, known: readonly string[] ): string {

    const near = spec.nearest(word, known);

    return near === undefined ? `known: ${known.join(", ")}` : `did you mean ${near}?`;

}
function fields ( value: unknown, at: string, needed: readonly string[] ): Record<string, unknown> {

    if ( !json.isRecord(value) ) throw refused(at, `an object with ${needed.join(", ")}`);

    for ( const name of needed ) if ( value[name] === undefined ) throw refused(`${at}.${name}`, "missing");

    return value;

}
function text ( value: unknown, at: string ): string {

    if ( typeof value !== "string" || value.trim() === "" ) throw refused(at, "a text");

    return value;

}
function made ( kind: string, given: Record<string, unknown>, at: string ): Steps<never> {

    const value = given[kind];
    const here = `${at}.${kind}`;

    switch ( kind ) {

        case "run": return run(text(value, here), { env: given.env as never, cwd: given.cwd as never });
        case "copy": { const { from, to, ...options } = fields(value, here, ["from", "to"]); return copy(text(from, `${here}.from`), text(to, `${here}.to`), options); }
        case "emit": { const { to, content } = fields(value, here, ["to"]); return emit(text(to, `${here}.to`), content); }
        case "specs": return specs(text(value, here));
        case "theme": return theme(text(value, here));
        case "styles": { const { into, imports } = fields(value, here, ["into", "imports"]); return styles(text(into, `${here}.into`), imports as readonly string[]); }
        case "fonts": { const { into, ...options } = fields(value, here, ["into"]); return fonts(text(into, `${here}.into`), options); }
        case "call": { const { module, name, to } = fields(value, here, ["module", "name", "to"]); return call(text(module, `${here}.module`), text(name, `${here}.name`), text(to, `${here}.to`)); }
        case "script": { const { from, to } = fields(value, here, ["from", "to"]); return script(text(from, `${here}.from`), text(to, `${here}.to`)); }
        case "bundle": { const { from, to, ...options } = fields(value, here, ["from", "to"]); return bundle(from as string | readonly string[], text(to, `${here}.to`), options); }
        case "css": { const { from, to, processor } = fields(value, here, ["from", "to", "processor"]); return css(text(from, `${here}.from`), text(to, `${here}.to`), processor as never); }
        case "page": { const { from, to, values, sources } = fields(value, here, ["from", "to"]); return page(text(from, `${here}.from`), text(to, `${here}.to`), (values ?? {}) as never, (sources ?? {}) as never); }
        case "spoken": return spoken(text(value, here));
        case "budget": return budget(fields(value, here, []) as never);
        case "layers": return layers(fields(value, here, []) as never);
        case "step": return step(text(value, here), given.act as never);
        case "each": return each(read(value, here) as never, given.roles as never);
        case "target": return target(fields(value, here, []), read(given.steps, `${at}.steps`) as never);
        case "option": return option(text(value, here), read(given.on, `${at}.on`) as never, (given.off === undefined ? undefined : read(given.off, `${at}.off`)) as never);
        default: return env(fields(value, here, []) as never, read(given.steps, `${at}.steps`) as never);

    }

}
function read ( value: unknown, at: string ): Steps<never> {

    if ( typeof value === "string" ) return text(value, at);
    if ( Array.isArray(value) ) {

        const listed: Steps<never>[] = [];

        for ( const [index, one] of value.entries() ) listed.push(read(one, `${at}[${index}]`));

        return listed;

    }
    if ( !json.isRecord(value) ) throw refused(at, "a step is an object such as { run: \"tsc -p .\" }, a name, or a list of them");

    const keys = Object.keys(value);
    const kind = keys.find(( key ) => Object.hasOwn(kinds, key));

    if ( kind === undefined ) throw refused(at, `no step kind among ${keys.join(", ") || "no keys"}; ${nearby(keys[0] ?? "", Object.keys(kinds))}`);

    const allowed = [kind, ...(kinds[kind] ?? [])];

    for ( const key of keys ) if ( !allowed.includes(key) ) throw refused(`${at}.${key}`, `${kind} takes ${allowed.join(", ")}; ${nearby(key, allowed)}`);

    return made(kind, value, at);

}
function table ( value: unknown, at: string ): Record<string, Steps<never>> {

    if ( value === undefined ) return {};
    if ( !json.isRecord(value) ) throw refused(at, "an object of named steps");

    return Object.fromEntries(Object.entries(value).map(([name, held]) => [name, read(held, `${at}.${name}`)]));

}

export function project<D extends object> ( declared: Described<D> ): Project<View<D>>;
export function project ( declared: Declaration<undefined> ): Project<undefined>;
export function project ( declared: Declaration<never> & { specs?: unknown; part?: unknown; seeds?: unknown; assets?: unknown } ): Project<never> {

    if ( !json.isRecord(declared) ) throw refused("project", "a project is { specs, part, seeds, assets, paths, steps, tasks }");

    for ( const key of Object.keys(declared) ) if ( !holds.includes(key) ) throw refused(key, `a project holds ${holds.join(", ")}; ${nearby(key, holds)}`);

    const { specs: owned, part, paths, seeds, assets } = declared;
    const steps = table(declared.steps, "steps");
    const tasks = table(declared.tasks, "tasks");

    return define({ ...(owned === undefined ? {} : { specs: owned }), ...(part === undefined ? {} : { part }), ...(paths === undefined ? {} : { paths }), ...(seeds === undefined ? {} : { seeds }), ...(assets === undefined ? {} : { assets }), steps, tasks } as never);

}

