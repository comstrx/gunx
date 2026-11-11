import * as error from "engine-error";
import type { Issue, output, Schema } from "./schema.ts";
import * as zod from "./zod.ts";

type Rule = { check: string; type?: string; format?: string; pattern?: RegExp; minimum?: number; maximum?: number; length?: number; size?: number; value?: unknown; inclusive?: boolean };
type Mark = { _zod: { def: Rule } };
type Stamp = zod.core.$ZodCheck<unknown>;
type Def = {
    type: string;
    format?: string | undefined;
    checks?: Mark[] | undefined;
    innerType?: Schema | undefined;
    in?: Schema | undefined;
    out?: Schema | undefined;
    shape?: Record<string, Schema> | undefined;
    entries?: Record<string, unknown> | undefined;
    values?: readonly unknown[] | undefined;
    options?: Schema[] | undefined;
    items?: Schema[] | undefined;
    element?: Schema | undefined;
    valueType?: Schema | undefined;
    getter?: (() => Schema) | undefined;
};
type Found = { inner: Schema; optional: boolean; nullable: boolean; checks: Mark[]; notes: Facts[] };
type Open = { above?: number; below?: number };

export type Facts = { format?: string; min?: number; max?: number; above?: number; below?: number; step?: number; values?: unknown[]; pattern?: RegExp };

export type Field = {
    name: string;
    kind: string;
    required: boolean;
    optional?: boolean | undefined;
    nullable?: boolean | undefined;
    min?: number | undefined;
    max?: number | undefined;
    above?: number | undefined;
    below?: number | undefined;
    step?: number | undefined;
    options?: string[] | undefined;
    values?: unknown[] | undefined;
    format?: string | undefined;
    pattern?: RegExp | undefined;
    fields?: Field[] | undefined;
    item?: Field | undefined;
    variants?: Field[] | undefined;
};

const hops = 32;
const deep = 8;
const measured = new Set<string>(["number", "int", "bigint", "date"]);
const wholes = new Set<string>(["safeint", "int32", "uint32"]);
const absent = new Set<string>(["optional", "default", "catch", "prefault"]);
const passing = new Set<string>(["readonly", "nonoptional", "nullable"]);
const stamps = new WeakMap<object, Facts>();
const stamped = new Map<string, Stamp>();
const unsaid = "Invalid input";

function pathOf ( issue: Issue ): string {

    return issue.path.length ? issue.path.map(( part ) => (typeof part === "object" ? "*" : String(part))).join(".") : "_";

}
function ruleOf ( issue: Issue ): string {

    switch ( issue.code ) {
        case "invalid_type": return issue.input === undefined || issue.input === null ? "required" : `type:${issue.expected}`;
        case "too_small": return measured.has(issue.origin) ? `${issue.inclusive === false ? "gt" : "min"}:${String(issue.minimum)}` : `min_length:${String(issue.minimum)}`;
        case "too_big": return measured.has(issue.origin) ? `${issue.inclusive === false ? "lt" : "max"}:${String(issue.maximum)}` : `max_length:${String(issue.maximum)}`;
        case "invalid_format": return issue.format === "regex" ? "format" : issue.format;
        case "invalid_value": return "in";
        case "unrecognized_keys": return "unknown";
        case "not_multiple_of": return `step:${String(issue.divisor)}`;
        case "invalid_union": return "invalid";
        case "custom": return issue.message && issue.message !== unsaid ? issue.message : "invalid";
        default: return issue.code;
    }

}
function definition ( inner: Schema ): Def {

    return inner._zod.def as Def;

}
function early ( inner: Schema, depth = 0 ): boolean {

    const def = definition(inner);

    if ( def.type === "transform" || def.type === "unknown" || def.type === "any" ) return true;

    return depth < hops && def.type === "pipe" && def.in !== undefined && early(def.in, depth + 1) && (def.out === undefined || early(def.out, depth + 1));

}
function unwrap ( inner: Schema ): Found {

    const checks: Mark[] = [];
    const notes: Facts[] = [];
    let current = inner;
    let optional = false;
    let nullable = false;
    let firm = false;

    for ( let hop = 0; hop < hops; hop += 1 ) {

        const def = definition(current);
        const rest = def.type === "union" ? (def.options ?? []).filter(( option ) => definition(option).type !== "null") : [];
        let next: Schema | undefined;

        if ( def.checks ) {

            const here: Facts[] = [];

            for ( const check of def.checks ) {

                const note = stamps.get(check);

                if ( note ) here.push(note);

                checks.push(check);

            }

            if ( here.length ) notes.unshift(...here);

        }

        if ( def.type === "nonoptional" ) firm = true;
        if ( def.type === "nullable" && def.innerType ) nullable = true;
        if ( absent.has(def.type) && def.innerType && !firm ) optional = true;

        if ( (absent.has(def.type) || passing.has(def.type)) && def.innerType ) next = def.innerType;
        else if ( def.type === "pipe" && def.in ) next = def.out && early(def.in) ? def.out : def.in;
        else if ( def.type === "lazy" && def.getter ) next = def.getter();
        else if ( def.type === "union" && def.options && rest.length < def.options.length ) {

            nullable = true;
            next = rest.length === 1 ? rest[0] : undefined;

        }

        if ( next === undefined || next === current ) break;

        current = next;

    }

    return { inner: current, optional, nullable, checks, notes };

}
function bound ( value: unknown ): number | undefined {

    if ( typeof value === "number" ) return value;
    if ( typeof value === "bigint" ) return Number(value);

    return value instanceof Date ? value.getTime() : undefined;

}
function ruled ( field: Field, open: Open, rule: Rule ): void {

    const { check, minimum, maximum, inclusive, format } = rule;
    const size = rule.length ?? rule.size;
    const edge = bound(rule.value);

    if ( (check === "min_length" || check === "min_size") && minimum !== undefined ) field.min = minimum;
    else if ( (check === "max_length" || check === "max_size") && maximum !== undefined ) field.max = maximum;
    else if ( (check === "length_equals" || check === "size_equals") && size !== undefined ) {

        field.min = size;
        field.max = size;

    } else if ( check === "greater_than" && edge !== undefined ) {

        if ( inclusive ) field.min = edge;
        else open.above = edge;

    } else if ( check === "less_than" && edge !== undefined ) {

        if ( inclusive ) field.max = edge;
        else open.below = edge;

    } else if ( check === "multiple_of" && edge !== undefined ) field.step = edge;
    else if ( check === "number_format" && format ) field.format = format;
    else if ( check === "string_format" && format === "regex" ) field.pattern = rule.pattern;
    else if ( check === "string_format" && rule.type === "string" && format ) field.format = format;

}
function edged ( field: Field, open: Open ): void {

    const whole = field.kind === "bigint" || field.kind === "date" || (field.format !== undefined && wholes.has(field.format));
    const { above, below } = open;

    if ( above !== undefined && whole ) field.min = Math.max(field.min ?? Number.NEGATIVE_INFINITY, Math.floor(above) + 1);
    else if ( above !== undefined ) field.above = above;

    if ( below !== undefined && whole ) field.max = Math.min(field.max ?? Number.POSITIVE_INFINITY, Math.ceil(below) - 1);
    else if ( below !== undefined ) field.below = below;

}
function describe ( name: string, given: Schema, depth: number ): Field {

    const { inner, optional, nullable, checks, notes } = unwrap(given);
    const def = definition(inner);
    const field: Field = { name, kind: def.type, required: !optional && !nullable };
    const child = def.element ?? def.valueType;
    const open: Open = {};

    if ( optional ) field.optional = true;
    if ( nullable ) field.nullable = true;
    if ( def.format && (def.type === "string" || def.type === "number") ) field.format = def.format;

    for ( const check of checks ) ruled(field, open, check._zod.def);

    edged(field, open);

    if ( def.entries ) field.values = Object.values(def.entries);
    else if ( def.type === "literal" && def.values ) field.values = [...def.values];

    for ( const note of notes ) Object.assign(field, note);

    if ( field.values ) field.options = field.values.map(String);

    if ( depth >= deep ) return field;

    if ( def.type === "object" && def.shape ) field.fields = Object.entries(def.shape).map(( [key, part] ) => describe(key, part, depth + 1));
    else if ( def.type === "tuple" && def.items ) field.fields = def.items.map(( part, at ) => describe(String(at), part, depth + 1));
    else if ( def.type === "union" && def.options ) field.variants = def.options.map(( part ) => describe(name, part, depth + 1));
    else if ( child ) field.item = describe(name, child, depth + 1);

    return field;

}

export function issuesOf ( failure: readonly Issue[] ): error.Errors {

    const out: error.Errors = Object.create(null);
    const told = ( name: string, rule: string ): void => {

        const found = out[name] ?? [];

        if ( !found.includes(rule) ) found.push(rule);

        out[name] = found;

    };

    for ( const issue of failure ) {

        const path = pathOf(issue);

        if ( issue.code === "unrecognized_keys" ) for ( const key of issue.keys ) told(issue.path.length ? `${path}.${key}` : key, "unknown");
        else told(path, ruleOf(issue));

    }

    return { ...out };

}
export function check<T extends Schema> ( schema: T, payload: unknown, reason = "validation" ): error.Result<output<T>> {

    const result = schema.safeParse(payload, { reportInput: true });

    if ( result.success ) return { ok: true, value: result.data };

    return { ok: false, fault: error.fault("validation", reason, { errors: issuesOf(result.error.issues) }) };

}
export async function checkAsync<T extends Schema> ( schema: T, payload: unknown, reason = "validation" ): Promise<error.Result<output<T>>> {

    const result = await schema.safeParseAsync(payload, { reportInput: true });

    if ( result.success ) return { ok: true, value: result.data };

    return { ok: false, fault: error.fault("validation", reason, { errors: issuesOf(result.error.issues) }) };

}
export function assert<T extends Schema> ( schema: T, payload: unknown, reason = "validation" ): output<T> {

    const result = check(schema, payload, reason);

    if ( !result.ok ) throw result.fault;

    return result.value;

}
export async function assertAsync<T extends Schema> ( schema: T, payload: unknown, reason = "validation" ): Promise<output<T>> {

    const result = await checkAsync(schema, payload, reason);

    if ( !result.ok ) throw result.fault;

    return result.value;

}
export function stamp ( facts: Facts ): Stamp {

    const made = zod.check<unknown>(() => undefined);

    stamps.set(made, facts);

    return made;

}
export function format ( name: string, size?: number ): Stamp {

    if ( name === "" || (size !== undefined && !(Number.isInteger(size) && size >= 0)) ) throw new RangeError("not a format");

    const id = `${name}:${size ?? ""}`;
    const made = stamped.get(id) ?? stamp(size === undefined ? { format: name } : { format: name, min: size, max: size });

    stamped.set(id, made);

    return made;

}
export function field ( schema: Schema, name = "" ): Field {

    return describe(name, schema, 0);

}
export function fields ( schema: Schema ): Field[] {

    const found = field(schema);

    return found.kind === "object" ? (found.fields ?? []) : [];

}
