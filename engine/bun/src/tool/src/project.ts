import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import * as error from "engine-error";
import * as json from "engine-json";
import * as translate from "engine-translate";
import type { Act, Compiled, Context, CopyOptions, Defined, Each, Env, Flagged, Joined, Loose, Needs, Outcome, Planned, Played, Project, Role, Roles, Scope, Step, Steps, Tasks, Vars, View } from "./arch.ts";
import { counted, writeJson, writeText } from "./core.ts";

const projects = new WeakSet<object>();
const nodes = new WeakSet<object>();
const named = /^[a-z][\w:-]{0,63}$/i;
const variable = /^[A-Za-z_][A-Za-z0-9_]*$/;
const parts: readonly string[] = ["specs", "tasks"];
const config = "tool.config.ts";

function isStep ( value: unknown ): value is Step {

    return typeof value === "object" && value !== null && typeof (value as Step).name === "string" && typeof (value as Step).act === "function";

}
function isEach ( value: unknown ): value is Each {

    return typeof value === "object" && value !== null && nodes.has(value) && "each" in value;

}
function isEnv ( value: unknown ): value is Env {

    return typeof value === "object" && value !== null && nodes.has(value) && "env" in value;

}
function isSteps ( value: unknown ): value is Steps {

    if ( typeof value === "string" || typeof value === "function" || isStep(value) || isEach(value) || isEnv(value) ) return true;

    return Array.isArray(value) && value.every(isSteps);

}
function told ( caught: unknown ): string {

    if ( error.is(caught) ) return caught.message || caught.reason || caught.code;

    if ( caught instanceof AggregateError && caught.errors.length ) return [caught.message, ...caught.errors.map(( one ) => String(( one as { message?: unknown } )?.message ?? one))].join("\n    ");

    return caught instanceof Error ? caught.message : String(caught);

}
function defined ( env: Vars ): Record<string, string> {

    return Object.fromEntries(Object.entries(env).filter(( entry ): entry is [string, string] => entry[1] !== undefined));

}
function copiedFile ( source: string, target: string ): boolean {

    const held = statSync(target, { throwIfNoEntry: false });

    if ( held?.isFile() && held.size === statSync(source).size && readFileSync(target).equals(readFileSync(source)) ) return false;

    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);

    return true;

}
function copied ( from: string, to: string, options: CopyOptions ): number {

    const held = statSync(from, { throwIfNoEntry: false });

    if ( held === undefined ) throw error.fault("not_found", "tool.copy", { message: `${from}: nothing to copy` });

    if ( held.isFile() ) return copiedFile(from, to) ? 1 : 0;

    const files = readdirSync(from, { recursive: true, withFileTypes: true }).filter(( entry ) => entry.isFile() && (options.extensions === undefined || options.extensions.some(( extension ) => entry.name.endsWith(extension))));
    const sources = files.map(( entry ) => join(entry.parentPath, entry.name));

    return sources.filter(( source ) => copiedFile(source, join(to, relative(from, source)))).length;

}
function looseOf ( specs: unknown ): Loose | undefined {

    if ( specs === undefined ) return undefined;

    const given = specs as Partial<Loose>;

    if ( !json.isRecord(given.roles) || typeof given.current !== "string" || !Object.hasOwn(given.roles, given.current) || typeof given.compile !== "function" || typeof given.serialize !== "function" ) throw error.fault("internal", "tool.project", { message: "specs name their roles, the current one, compile and serialize, such as spec.roles({ roles, current, compile })" });

    return given as Loose;

}
function shown ( text: string, role: string | undefined ): string {

    return role === undefined ? text : text.replaceAll("{role}", role);

}
function expanded ( text: string, role: string | undefined ): string {

    if ( role === undefined && text.includes("{role}") ) throw error.fault("internal", "tool.path", { message: `${text}: {role} names a role, so the project needs specs` });

    return shown(text, role);

}
function chosen ( specs: Loose | undefined, argv: readonly string[], fixed: readonly string[] | undefined ): string[] {

    if ( specs === undefined ) throw error.fault("internal", "tool.each", { message: "each plays steps per role, so the project needs specs: define({ specs, tasks })" });

    const names = Object.keys(specs.roles);
    const asked = fixed ?? (argv.includes("--all") ? names : argv.filter(( word ) => !word.startsWith("-")));

    for ( const word of asked ) if ( !names.includes(word) ) throw error.fault("not_found", "tool.each", { message: `no role named ${word}; roles: ${names.join(", ")}` });

    return asked.length ? [...new Set(asked)] : [specs.current];

}
function viewOf ( specs: Loose, name: string, views: Map<string, View> ): View {

    const known = views.get(name);

    if ( known !== undefined ) return known;

    const compiled = specs.compile(name);
    const problems = compiled.issues.length;

    if ( problems ) throw error.fault("validation", "tool.specs", { message: `${name}: ${counted(problems, "problem")} in the spec; the specs step shows them` });

    const { config } = specs.roles[name] as Role;
    const locale = compiled.surface.locale;
    const view = { ...compiled, name, settings: config.settings, themes: config.themes, locale, dir: translate.direction(locale) } as View;

    views.set(name, view);

    return view;

}

export function define<R extends Roles, C extends Compiled> ( project: Defined<R, C> ): Project<View<R, C>>;
export function define ( project: { tasks: Tasks<undefined> } ): Project<undefined>;
export function define ( project: { specs?: unknown; tasks: unknown } ): Project<never> {

    if ( !json.isRecord(project) ) throw error.fault("internal", "tool.project", { message: "a project is { tasks } or { specs, tasks }" });

    for ( const key of Object.keys(project) ) if ( !parts.includes(key) ) throw error.fault("internal", "tool.project", { message: `${key}: a project holds ${parts.join(" and ")}` });

    const { tasks } = project;

    if ( !json.isRecord(tasks) ) throw error.fault("internal", "tool.project", { message: "tasks are an object of named steps, such as { build: [...] }" });

    for ( const [name, steps] of Object.entries(tasks) ) {

        if ( !named.test(name) ) throw error.fault("internal", "tool.project", { message: `${name}: a task name is a word, such as build or check:all` });
        if ( !isSteps(steps) ) throw error.fault("internal", "tool.project", { message: `${name}: a task is a step, a function, each, env, another task's name or a list of them` });

    }

    const made: Project<never> = Object.freeze({ tasks: Object.freeze({ ...tasks }) as Tasks<never>, specs: looseOf(project.specs) });

    projects.add(made);

    return made;

}
export function isProject ( value: unknown ): value is Project<never> {

    return typeof value === "object" && value !== null && projects.has(value);

}
export function step<V = unknown> ( name: string, act: Act<V> ): Step<V> {

    if ( typeof name !== "string" || name.trim() === "" || typeof act !== "function" ) throw error.fault("internal", "tool.step", { message: "a step has a name and an act" });

    return Object.freeze({ name, act });

}
export function each<S extends Steps<never>> ( steps: S, roles?: readonly string[] ): Each<Joined<Needs<S>>> {

    if ( !isSteps(steps) ) throw error.fault("internal", "tool.each", { message: "each plays steps for every chosen role" });
    if ( roles !== undefined && (!Array.isArray(roles) || roles.length === 0 || !roles.every(( role ) => typeof role === "string" && role !== "")) ) throw error.fault("internal", "tool.each", { message: "each names the roles it plays, or plays the ones the arguments choose" });

    const made = Object.freeze({ each: steps, roles: roles === undefined ? undefined : Object.freeze([...roles]) }) as Each<Joined<Needs<S>>>;

    nodes.add(made);

    return made;

}
export function env<S extends Steps<never>> ( vars: Vars, steps: S ): Env<Joined<Needs<S>>> {

    if ( !json.isRecord(vars) || Object.keys(vars).length === 0 || !Object.entries(vars).every(([name, value]) => variable.test(name) && (value === undefined || typeof value === "string")) ) throw error.fault("internal", "tool.env", { message: "env sets named variables to text, such as { ENGINE_ENV: \"production\" }" });
    if ( !isSteps(steps) ) throw error.fault("internal", "tool.env", { message: "env plays steps under its variables" });

    const made = Object.freeze({ env: Object.freeze({ ...vars }), steps }) as Env<Joined<Needs<S>>>;

    nodes.add(made);

    return made;

}
export async function play ( project: Project<never>, names: readonly string[], given: Played ): Promise<Outcome> {

    const root = resolve(given.root);
    const argv = [...(given.argv ?? [])];
    const out = given.out ?? (( line: string ) => { process.stdout.write(`${line}\n`); });
    const bin = join(root, "node_modules", ".bin");
    const { specs } = project;
    const flagged: Flagged[] = [];
    let steps = 0;
    let written = 0;

    const scopeOf = ( task: string, name: string, said: string[], context: Context ): Scope<never> => {

        const expand = ( text: string ): string => expanded(text, context.role);
        const at = ( path: string ): string => {

            const text = expand(path);

            return isAbsolute(text) ? text : resolve(root, text);

        };
        const into = ( path: string ): string => {

            const target = at(path);
            const within = relative(root, target);

            if ( within === "" || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within) ) throw error.fault("forbidden", "tool.path", { message: `${path}: a step writes inside the project, never the project itself or beyond it` });

            return target;

        };

        return {
            root,
            argv,
            env: context.env,
            specs,
            get role (): never {

                return (specs === undefined || context.role === undefined ? undefined : viewOf(specs, context.role, context.views)) as never;

            },
            at,
            into,
            expand,
            emit: ( path, content ) => {

                const target = into(path);
                const changed = typeof content === "string" ? writeText(target, content) : writeJson(target, content);

                if ( changed ) written += 1;

                return changed;

            },
            copy: ( from, to, options = {} ) => {

                const target = into(to);

                if ( options.clean ) rmSync(target, { recursive: true, force: true });

                const count = copied(at(from), target, options);

                written += count;

                return count;

            },
            run: async ( command, options = {} ) => {

                const vars = { ...defined(context.env), ...defined(options.env ?? {}) };

                vars.PATH = [bin, vars.PATH].filter(Boolean).join(delimiter);

                await Bun.$`${{ raw: expand(command) }}`.cwd(at(options.cwd ?? ".")).env(vars);

            },
            say: ( text ) => { said.push(String(text)); },
            flag: ( where, message, rule = "issue" ) => { flagged.push({ task, step: name, where: String(where), message: String(message), rule: String(rule) }); },
        };

    };
    const perform = async ( value: Steps<never>, task: string, trail: readonly string[], context: Context ): Promise<boolean> => {

        if ( typeof value === "string" ) {

            const found = project.tasks[value];

            if ( found === undefined ) throw error.fault("not_found", "tool.task", { message: `${task}: no task named ${value}` });
            if ( trail.includes(value) ) throw error.fault("conflict", "tool.task", { message: `a task cycle: ${[...trail, value].join(" → ")}` });

            return perform(found, value, [...trail, value], context);

        }

        if ( Array.isArray(value) ) {

            for ( const one of value ) if ( !(await perform(one, task, trail, context)) ) return false;

            return true;

        }

        if ( isEach(value) ) {

            for ( const role of chosen(specs, argv, value.roles) ) if ( !(await perform(value.each, task, trail, { ...context, role })) ) return false;

            return true;

        }

        if ( isEnv(value) ) {

            const saved = Object.fromEntries(Object.keys(value.env).map(( name ) => [name, process.env[name]]));
            const apply = ( vars: Vars ): void => {

                for ( const [name, text] of Object.entries(vars) ) {

                    if ( text === undefined ) delete process.env[name];
                    else process.env[name] = text;

                }

            };

            apply(value.env);

            try {

                return await perform(value.steps, task, trail, { role: context.role, env: { ...context.env, ...value.env }, views: new Map() });

            } finally {

                apply(saved);

            }

        }

        const current = typeof value === "function" ? { name: value.name || "step", act: value } : value as Step<never>;
        const name = shown(current.name, context.role);
        const said: string[] = [];
        const before = flagged.length;

        try {

            const more = await current.act(scopeOf(task, name, said, context));

            if ( more !== undefined && more !== null ) {

                if ( !isSteps(more) ) throw error.fault("internal", "tool.step", { message: `${name}: a step returns nothing or more steps` });

                for ( const line of said ) out(`  ${line}`);

                return perform(more as Steps<never>, task, trail, context);

            }

        } catch ( caught ) {

            steps += 1;
            out(`✗ ${task} › ${name}`);
            for ( const line of said ) out(`  ${line}`);
            out(`  ${told(caught)}`);
            flagged.push({ task, step: name, where: name, message: told(caught), rule: "failed" });

            return false;

        }

        steps += 1;
        out(`${flagged.length > before ? "✗" : "✓"} ${task} › ${name}`);
        for ( const line of said ) out(`  ${line}`);
        for ( const one of flagged.slice(before) ) out(`  ${one.where}  ${one.message} (${one.rule})`);

        return true;

    };
    const start: Context = { role: specs?.current, env: { ...process.env, ...(given.env ?? {}) }, views: new Map() };

    for ( const name of names ) {

        if ( project.tasks[name] === undefined ) throw error.fault("not_found", "tool.task", { message: `no task named ${name}; tasks: ${Object.keys(project.tasks).join(", ")}` });
        if ( !(await perform(name, name, [], start)) ) break;

    }

    return { tasks: [...names], steps, written, flagged, failed: flagged.length > 0 };

}
export function plan ( project: Project<never>, names: readonly string[], argv: readonly string[] = [] ): Planned {

    const { specs } = project;
    const lines: string[] = [];
    let steps = 0;

    const draw = ( value: Steps<never>, trail: readonly string[], role: string | undefined, depth: number ): void => {

        const pad = "  ".repeat(depth);

        if ( typeof value === "string" ) {

            const found = project.tasks[value];

            if ( found === undefined ) throw error.fault("not_found", "tool.task", { message: `${trail.at(-1) ?? value}: no task named ${value}` });
            if ( trail.includes(value) ) throw error.fault("conflict", "tool.task", { message: `a task cycle: ${[...trail, value].join(" → ")}` });

            lines.push(`${pad}${value}`);
            draw(found, [...trail, value], role, depth + 1);

            return;

        }

        if ( Array.isArray(value) ) {

            for ( const one of value ) draw(one, trail, role, depth);

            return;

        }

        if ( isEach(value) ) {

            for ( const name of chosen(specs, argv, value.roles) ) {

                lines.push(`${pad}role ${name}`);
                draw(value.each, trail, name, depth + 1);

            }

            return;

        }

        if ( isEnv(value) ) {

            lines.push(`${pad}env ${Object.entries(value.env).map(([name, text]) => (text === undefined ? `-${name}` : `${name}=${text}`)).join(" ")}`);
            draw(value.steps, trail, role, depth + 1);

            return;

        }

        steps += 1;
        lines.push(`${pad}${shown(typeof value === "function" ? value.name || "step" : (value as Step<never>).name, role)}`);

    };

    for ( const name of names ) {

        if ( project.tasks[name] === undefined ) throw error.fault("not_found", "tool.task", { message: `no task named ${name}; tasks: ${Object.keys(project.tasks).join(", ")}` });

        lines.push(name);
        draw(project.tasks[name] as Steps<never>, [name], specs?.current, 1);

    }

    return { lines, steps };

}
export async function main ( argv: readonly string[], cwd: string = process.cwd() ): Promise<number> {

    const out = ( line: string ): void => { process.stdout.write(`${line}\n`); };
    const asked = argv.filter(( word ) => word !== "--plan");
    const planning = asked.length !== argv.length;
    const pointed = asked.indexOf("--config");
    const file = pointed === -1 ? config : asked.splice(pointed, 2)[1] ?? config;
    const path = resolve(cwd, file);
    let project: unknown;

    try {

        project = (await import(pathToFileURL(path).href) as { default?: unknown }).default;

    } catch ( caught ) {

        out(`tool: ${relative(cwd, path) || file} did not load: ${told(caught)}`);

        return 1;

    }

    if ( !isProject(project) ) {

        out(`tool: ${relative(cwd, path) || file} exports no project; write export default tool.define({ tasks })`);

        return 1;

    }

    const split = asked.indexOf("--");
    const leading = split === -1 ? asked : asked.slice(0, split);
    const count = leading.findIndex(( word ) => project.tasks[word] === undefined);
    const names = count === -1 ? leading : leading.slice(0, count);
    const rest = [...(count === -1 ? [] : leading.slice(count)), ...(split === -1 ? [] : asked.slice(split + 1))];

    if ( names.length === 0 ) {

        out(asked.length ? `tool: no task named ${asked[0]}` : "tool <task...> [arguments] [--plan]");
        out(`tasks: ${Object.keys(project.tasks).join(", ")}`);

        return asked.length ? 1 : 0;

    }

    try {

        if ( planning ) {

            const planned = plan(project, names, rest);

            for ( const line of planned.lines ) out(line);
            out(`${counted(planned.steps, "step")} planned`);

            return 0;

        }

        const outcome = await play(project, names, { root: cwd, argv: rest, out });

        out(`${outcome.failed ? "✗" : "✓"} ${names.join(" ")}: ${counted(outcome.steps, "step")}, ${counted(outcome.written, "file")} written, ${counted(outcome.flagged.length, "issue")}`);

        return outcome.failed ? 1 : 0;

    } catch ( caught ) {

        out(`tool: ${told(caught)}`);

        return 1;

    }

}
