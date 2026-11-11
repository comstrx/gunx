import * as date from "engine-date";
import * as error from "engine-error";
import * as value from "engine-value";
import { format, stamp } from "./check.ts";
import { currency, email, flag, hexColor, integer, ip, key, locale, numeric, otp, phone, slug, timezone, url } from "./field.ts";
import type { Check, Schema } from "./schema.ts";
import * as zod from "./zod.ts";

type Rule = { name: string; args: string[]; text: string };
type Loose = Schema & { check: ( ...checks: Check[] ) => Schema };
type Row = Record<string, unknown>;
type Test = ( given: unknown ) => boolean;
type Raw = { name: string; test: ( text: string ) => boolean };
type Presence = { must: string | undefined; prohibited: boolean; filled: boolean; nullable: boolean; raws: Raw[] };
type Built = { schema: Schema; plain: Schema; cross: Rule[]; found: Rule[] };
type Cross = { test: ( row: Row ) => boolean; message: string };
type Pending = { name: string; rule: Rule };
type Order = ( own: number, other: number ) => boolean;

export type Rules = string | readonly string[];
export type Book = Record<string, Rules>;

const many = 64;
const numberShape = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const wholeShape = /^\d{1,9}$/;
const digitShape = /^\d+$/;
const decimalShape = /^[+-]?\d+(?:\.(\d+))?$/;
const slashShape = /^\/([\s\S]*)\/([a-z]*)$/;
const modeShape = /^[imsu]*$/;
const reserved = new Set<string>(["__proto__", "constructor", "prototype"]);
const whole = new Set<string>(["regex", "not_regex"]);
const flags = new Set<string>(["required", "nullable", "filled", "prohibited"]);
const texts = new Set<string>(["digits", "digits_between", "min_digits", "max_digits", "decimal"]);
const argued = new Set<string>(["email", "url", "otp", "array", "multiple_of"]);
const valued = new Set<string>(["required_if", "required_unless", "prohibited_if", "prohibited_unless", "accepted_if", "declined_if"]);
const noted = new Set<string>([
    "bail", "sometimes", "present", "present_if", "present_unless", "present_with", "present_with_all", "missing", "missing_if", "missing_unless", "missing_with", "missing_with_all", "exclude", "exclude_if", "exclude_unless", "exclude_with",
    "exclude_without", "date_format",
]);
const moments: ReadonlyMap<string, () => number> = new Map<string, () => number>([
    ["now", () => date.now()],
    ["today", () => date.today().getTime()],
    ["tomorrow", () => date.tomorrow().getTime()],
    ["yesterday", () => date.yesterday().getTime()],
]);
const orders: ReadonlyMap<string, Order> = new Map<string, Order>([
    ["after", ( own, other ) => own > other],
    ["after_or_equal", ( own, other ) => own >= other],
    ["before", ( own, other ) => own < other],
    ["before_or_equal", ( own, other ) => own <= other],
    ["date_equals", ( own, other ) => own === other],
]);
const compares: ReadonlyMap<string, Order> = new Map<string, Order>([
    ["gt", ( own, other ) => own > other],
    ["gte", ( own, other ) => own >= other],
    ["lt", ( own, other ) => own < other],
    ["lte", ( own, other ) => own <= other],
]);
const numbered: ReadonlyMap<string, ( low: number, high: number ) => Check[]> = new Map<string, ( low: number, high: number ) => Check[]>([
    ["min", ( low ) => [zod.gte(low)]],
    ["max", ( low ) => [zod.lte(low)]],
    ["size", ( low ) => [zod.gte(low), zod.lte(low)]],
    ["between", ( low, high ) => [zod.gte(low), zod.lte(high)]],
    ["gt", ( low ) => [zod.gt(low)]],
    ["gte", ( low ) => [zod.gte(low)]],
    ["lt", ( low ) => [zod.lt(low)]],
    ["lte", ( low ) => [zod.lte(low)]],
    ["multiple_of", ( low ) => [zod.multipleOf(low)]],
]);
const counted: ReadonlyMap<string, ( low: number, high: number ) => [number, number]> = new Map<string, ( low: number, high: number ) => [number, number]>([
    ["min", ( low ) => [Math.ceil(low), Number.POSITIVE_INFINITY]],
    ["max", ( low ) => [0, Math.floor(low)]],
    ["size", ( low ) => [Math.ceil(low), Math.floor(low)]],
    ["between", ( low, high ) => [Math.ceil(low), Math.floor(high)]],
    ["gt", ( low ) => [Math.floor(low) + 1, Number.POSITIVE_INFINITY]],
    ["gte", ( low ) => [Math.ceil(low), Number.POSITIVE_INFINITY]],
    ["lt", ( low ) => [0, Math.ceil(low) - 1]],
    ["lte", ( low ) => [0, Math.floor(low)]],
]);
const crossing: ReadonlyMap<string, readonly [number, number]> = new Map<string, readonly [number, number]>([
    ["confirmed", [0, 1]],
    ["same", [1, 1]],
    ["different", [1, 1]],
    ["in_array", [1, 1]],
    ["prohibits", [1, many]],
    ["required_if", [2, many]],
    ["required_unless", [2, many]],
    ["required_with", [1, many]],
    ["required_with_all", [1, many]],
    ["required_without", [1, many]],
    ["required_without_all", [1, many]],
    ["required_if_accepted", [1, 1]],
    ["required_if_declined", [1, 1]],
    ["prohibited_if", [2, many]],
    ["prohibited_unless", [2, many]],
    ["prohibited_if_accepted", [1, 1]],
    ["prohibited_if_declined", [1, 1]],
    ["accepted_if", [2, many]],
    ["declined_if", [2, many]],
]);
const makers: ReadonlyMap<string, ( rule: Rule ) => Schema> = new Map<string, ( rule: Rule ) => Schema>([
    ["email", () => email()],
    ["url", ( rule ) => linked(rule)],
    ["phone", () => phone()],
    ["slug", () => slug()],
    ["key", () => key()],
    ["otp", ( rule ) => coded(rule)],
    ["currency", () => currency()],
    ["locale", () => locale()],
    ["timezone", () => timezone()],
    ["hex_color", () => hexColor()],
    ["uuid", () => zod.uuid()],
    ["ulid", () => zod.ulid()],
    ["ipv4", () => zod.ipv4()],
    ["ipv6", () => zod.ipv6()],
    ["mac", () => zod.mac()],
    ["ip", () => ip()],
    ["date", () => zod.string().check(zod.trim(), zod.refine(( word ) => date.from(word) !== undefined, "date"), format("date"))],
    ["integer", () => integer()],
    ["numeric", () => numeric()],
    ["number", () => numeric()],
    ["multiple_of", () => numeric()],
    ["boolean", () => flag()],
    ["accepted", () => flag()],
    ["declined", () => flag()],
    ["array", ( rule ) => shaped(rule)],
    ["list", () => zod.array(zod.unknown())],
    ["object", () => zod.record(zod.string(), zod.unknown())],
    ["map", () => zod.record(zod.string(), zod.unknown())],
    ["string", () => zod.string().check(zod.trim())],
]);

function refuse ( text: string, what: "rule" | "field" = "rule" ): never {

    throw error.fault("internal", "validate.rule", { message: `not a ${what}: ${text}`, errors: { [what]: [text] } });

}
function split ( given: Rules ): Rule[] {

    const parts: readonly unknown[] = typeof given === "string" ? given.split("|") : Array.isArray(given) ? given : refuse(String(given));
    const found: Rule[] = [];

    for ( const part of parts ) {

        if ( typeof part !== "string" ) return refuse(String(part));

        const text = part.trim();
        const at = text.indexOf(":");
        const name = at === -1 ? text : text.slice(0, at).trim();
        const rest = at === -1 ? undefined : text.slice(at + 1);

        if ( text === "" ) continue;
        if ( name === "" ) return refuse(text);

        found.push({ name, text, args: rest === undefined ? [] : whole.has(name) ? [rest] : rest.split(",").map(( arg ) => arg.trim()) });

    }

    return found;

}
function listed ( rule: Rule, least: number, most = least ): string[] {

    if ( rule.args.length < least || rule.args.length > most || rule.args.some(( arg ) => arg === "") ) refuse(rule.text);

    return rule.args;

}
function spans ( rule: Rule, least: number, most = least ): number[] {

    return listed(rule, least, most).map(( text ) => (wholeShape.test(text) ? Number(text) : refuse(rule.text)));

}
function amounts ( rule: Rule, least: number, most = least ): number[] {

    return listed(rule, least, most).map(( text ) => (numberShape.test(text) ? Number(text) : refuse(rule.text)));

}
function sole ( rule: Rule, test: Test ): Test {

    if ( rule.args.length ) refuse(rule.text);

    return test;

}
function isRow ( given: unknown ): given is Row {

    if ( typeof given !== "object" || given === null ) return false;

    const proto: unknown = Object.getPrototypeOf(given);

    return proto === null || proto === Object.prototype;

}
function blank ( given: unknown ): boolean {

    return given === undefined || given === null || (typeof given === "string" && given.trim() === "");

}
function empty ( given: unknown ): boolean {

    if ( blank(given) ) return true;
    if ( Array.isArray(given) ) return given.length === 0;

    return isRow(given) && Object.keys(given).length === 0;

}
function scalar ( given: unknown ): string | undefined {

    return typeof given === "string" || typeof given === "number" || typeof given === "boolean" || typeof given === "bigint" ? String(given) : undefined;

}
function timeOf ( given: unknown ): number | undefined {

    return given instanceof Date || typeof given === "string" || typeof given === "number" ? date.from(given)?.getTime() : undefined;

}
function kindOf ( schema: Schema ): string {

    const def = schema._zod.def as { type: string; out?: Schema | undefined };

    return def.type === "pipe" && def.out ? kindOf(def.out) : def.type;

}
function held ( schema: Schema, ...checks: Check[] ): Schema {

    return checks.length ? (schema as Loose).check(...checks) : schema;

}
function told ( schema: Schema, test: Test, message: string ): Schema {

    return held(schema, zod.refine(test, message));

}
function linked ( rule: Rule ): Schema {

    const [only, other] = listed(rule, 0, 2);

    if ( rule.args.some(( arg ) => arg !== "http" && arg !== "https") || only === other ) return only === undefined ? url() : refuse(rule.text);

    return only === undefined || other !== undefined ? url() : told(url(), ( word ) => String(word).toLowerCase().startsWith(`${only}:`), "url");

}
function coded ( rule: Rule ): Schema {

    const [length = 6] = spans(rule, 0, 1);

    return length >= 1 && length <= 12 ? otp(length) : refuse(rule.text);

}
function shaped ( rule: Rule ): Schema {

    const keys = new Set(listed(rule, 0, many));

    return keys.size ? told(zod.record(zod.string(), zod.unknown()), ( given ) => isRow(given) && Object.keys(given).every(( name ) => keys.has(name)), "array") : zod.array(zod.unknown());

}
function pattern ( rule: Rule ): RegExp {

    const source = rule.args[0] ?? "";
    const cut = slashShape.exec(source);
    const mode = (cut?.[2] ?? "").replace(/[gy]/g, "");

    if ( source === "" || !modeShape.test(mode) ) return refuse(rule.text);

    try {

        return new RegExp(cut?.[1] ?? source, mode);

    } catch {

        return refuse(rule.text);

    }

}
function matched ( rule: Rule, wanted: boolean ): Test {

    const shape = pattern(rule);

    return ( given ) => {

        const word = scalar(given);

        return word !== undefined && shape.test(word) === wanted;

    };

}
function facts ( rule: Rule ): Check[] {

    if ( rule.name === "in" || rule.name === "enum" ) return [stamp({ values: listed(rule, 1, many) })];

    return rule.name === "regex" ? [stamp({ pattern: pattern(rule) })] : [];

}
function among ( rule: Rule, wanted: boolean ): Test {

    const set = new Set(listed(rule, 1, many));

    return ( given ) => (Array.isArray(given) ? given : [given]).every(( item ) => {

        const word = scalar(item);

        return (word !== undefined && set.has(word)) === wanted;

    });

}
function worded ( rule: Rule, test: ( word: string, part: string ) => boolean, wanted: boolean ): Test {

    const parts = listed(rule, 1, many);

    return ( given ) => {

        const word = scalar(given);

        return word !== undefined && parts.some(( part ) => test(word, part)) === wanted;

    };

}
function holding ( rule: Rule, wanted: boolean ): Test {

    const parts = listed(rule, 1, many);

    return ( given ) => {

        const words = Array.isArray(given) ? given.map(scalar) : undefined;
        const word = scalar(given);
        const has = ( part: string ): boolean => (words ? words.includes(part) : (word?.includes(part) ?? false));

        if ( words === undefined && word === undefined ) return false;

        return wanted ? parts.every(has) : !parts.some(has);

    };

}
function lettered ( rule: Rule, wide: RegExp, narrow: RegExp ): Test {

    const [mode] = listed(rule, 0, 1);
    const shape = mode === undefined ? wide : mode === "ascii" ? narrow : refuse(rule.text);

    return ( given ) => {

        const word = scalar(given);

        return word !== undefined && shape.test(word);

    };

}
function keyed ( rule: Rule, every: boolean ): Test {

    const keys = listed(rule, 1, many);

    return ( given ) => {

        if ( typeof given !== "object" || given === null ) return false;

        return every ? keys.every(( name ) => Object.hasOwn(given, name)) : keys.some(( name ) => Object.hasOwn(given, name));

    };

}
function distinct ( rule: Rule ): Test {

    const modes = new Set(listed(rule, 0, 2));
    const strict = modes.delete("strict");
    const folded = modes.delete("ignore_case");

    if ( modes.size ) refuse(rule.text);

    return ( given ) => {

        const seen = new Set<string>();

        if ( !Array.isArray(given) ) return false;

        for ( const item of given ) {

            const word = scalar(item);
            const mark = word === undefined ? undefined : `${strict ? typeof item : ""}:${folded ? word.toLowerCase() : word}`;

            if ( mark === undefined ) continue;
            if ( seen.has(mark) ) return false;

            seen.add(mark);

        }

        return true;

    };

}
function ascii ( given: unknown ): boolean {

    const word = scalar(given);

    if ( word === undefined ) return false;

    for ( let index = 0; index < word.length; index += 1 ) {

        if ( word.charCodeAt(index) > 127 ) return false;

    }

    return true;

}
function parses ( given: unknown ): boolean {

    if ( typeof given !== "string" ) return false;

    try {

        JSON.parse(given);

        return true;

    } catch {

        return false;

    }

}
function cased ( given: unknown, lower: boolean ): boolean {

    const word = scalar(given);

    return word !== undefined && word === (lower ? word.toLowerCase() : word.toUpperCase());

}
function tested ( rule: Rule ): Test | undefined {

    switch ( rule.name ) {
        case "in":
        case "enum": return among(rule, true);
        case "not_in": return among(rule, false);
        case "starts_with": return worded(rule, ( word, part ) => word.startsWith(part), true);
        case "ends_with": return worded(rule, ( word, part ) => word.endsWith(part), true);
        case "doesnt_start_with": return worded(rule, ( word, part ) => word.startsWith(part), false);
        case "doesnt_end_with": return worded(rule, ( word, part ) => word.endsWith(part), false);
        case "contains": return holding(rule, true);
        case "doesnt_contain": return holding(rule, false);
        case "alpha": return lettered(rule, /^[\p{L}\p{M}]+$/u, /^[a-z]+$/i);
        case "alpha_num": return lettered(rule, /^[\p{L}\p{M}\p{N}]+$/u, /^[a-z0-9]+$/i);
        case "alpha_dash": return lettered(rule, /^[\p{L}\p{M}\p{N}_-]+$/u, /^[a-z0-9_-]+$/i);
        case "ascii": return sole(rule, ascii);
        case "lowercase": return sole(rule, ( given ) => cased(given, true));
        case "uppercase": return sole(rule, ( given ) => cased(given, false));
        case "regex": return matched(rule, true);
        case "not_regex": return matched(rule, false);
        case "distinct": return distinct(rule);
        case "json": return sole(rule, parses);
        case "required_array_keys": return keyed(rule, true);
        case "in_array_keys": return keyed(rule, false);
        case "accepted": return sole(rule, ( given ) => given === true);
        case "declined": return sole(rule, ( given ) => given === false);
        default: return undefined;
    }

}
function texted ( rule: Rule ): Raw["test"] {

    const pair = rule.name === "digits_between";
    const [low = 0, high = low] = spans(rule, pair ? 2 : 1, pair || rule.name === "decimal" ? 2 : 1);

    if ( low > high || (high < 1 && rule.name !== "decimal" && rule.name !== "min_digits") ) return refuse(rule.text);

    switch ( rule.name ) {
        case "digits": return ( text ) => digitShape.test(text) && text.length === low;
        case "digits_between": return ( text ) => digitShape.test(text) && text.length >= low && text.length <= high;
        case "min_digits": return ( text ) => digitShape.test(text) && text.length >= low;
        case "max_digits": return ( text ) => digitShape.test(text) && text.length <= low;
        default: return ( text ) => {

            const cut = decimalShape.exec(text);
            const places = cut ? (cut[1]?.length ?? 0) : -1;

            return places >= low && places <= high;

        };
    }

}
function sized ( schema: Schema, kind: string, rule: Rule ): Schema {

    const pair = rule.name === "between";
    const [low = 0, high = low] = amounts(rule, pair ? 2 : 1);
    const [least, most] = counted.get(rule.name)?.(low, high) ?? [0, Number.POSITIVE_INFINITY];
    const size = ( given: unknown ): number => (isRow(given) ? Object.keys(given).length : Number.NaN);

    if ( low > high || (kind !== "number" && most < Math.max(0, least)) ) return refuse(rule.text);
    if ( kind === "number" ) return rule.name === "multiple_of" && !(low > 0) ? refuse(rule.text) : held(schema, ...(numbered.get(rule.name)?.(low, high) ?? []));
    if ( kind === "boolean" || rule.name === "multiple_of" ) return refuse(rule.text);

    if ( kind === "record" ) {

        const lower = least > 0 ? told(schema, ( given ) => size(given) >= least, `min_length:${least}`) : schema;

        return Number.isFinite(most) ? told(lower, ( given ) => size(given) <= most, `max_length:${most}`) : lower;

    }

    if ( least === most ) return held(schema, zod.length(least));

    return held(schema, ...(least > 0 ? [zod.minLength(least)] : []), ...(Number.isFinite(most) ? [zod.maxLength(most)] : []));

}
function bound ( rule: Rule ): (() => number) | undefined {

    const [word = ""] = listed(rule, 1);
    const moment = moments.get(word);
    const at = moment ? undefined : date.from(word)?.getTime();

    return moment ?? (at === undefined ? undefined : () => at);

}
function referred ( rule: Rule, name = "" ): string[] {

    const [least, most] = crossing.get(rule.name) ?? [1, 1];
    const args = listed(rule, least, most);

    if ( rule.name === "confirmed" ) return [args[0] ?? `${name}_confirmation`];
    if ( rule.name === "in_array" ) return args.map(( arg ) => arg.replace(/\.\*$/, ""));

    return valued.has(rule.name) ? args.slice(0, 1) : args;

}
function front ( plan: Presence ): Schema {

    return zod.transform(( given: unknown, context ) => {

        const failed = ( message: string ): undefined => {

            context.issues.push({ code: "custom", message, input: given, continue: true });

            return undefined;

        };

        if ( plan.prohibited ) return empty(given) ? undefined : failed("prohibited");
        if ( plan.must !== undefined && empty(given) ) return failed(plan.must);
        if ( plan.filled && given !== undefined && empty(given) ) return failed("filled");
        if ( blank(given) ) return given === null && plan.nullable ? null : undefined;

        const text = typeof given === "string" ? given.trim() : typeof given === "number" ? String(given) : undefined;
        const broken = plan.raws.find(( raw ) => text === undefined || !raw.test(text));

        return broken ? failed(broken.name) : given;

    });

}
function present ( base: Schema, plan: Presence ): Schema {

    const gate = front(plan);

    if ( plan.must !== undefined && !plan.prohibited ) return zod.pipe(gate, base);

    return zod.optional(zod.pipe(gate, plan.nullable ? zod.nullish(base) : zod.optional(base)));

}
function build ( given: Rules ): Built {

    const found = split(given);
    const named = new Map(found.map(( rule ) => [rule.name, rule]));
    const cross: Rule[] = [];
    const raws: Raw[] = [];
    let plain: Schema | undefined;

    for ( const [name, make] of makers ) {

        const rule = named.get(name);

        if ( rule === undefined ) continue;
        if ( rule.args.length && !argued.has(name) ) return refuse(rule.text);

        const made = make(rule);

        plain ??= made;

    }

    plain ??= zod.string().check(zod.trim());

    const kind = kindOf(plain);
    let base = plain;

    for ( const rule of found ) {

        const { name } = rule;
        const test = texts.has(name) ? undefined : tested(rule);
        const order = orders.get(name);

        if ( flags.has(name) && rule.args.length ) return refuse(rule.text);

        if ( texts.has(name) ) raws.push({ name, test: texted(rule) });
        else if ( test ) base = held(told(base, test, name === "regex" ? "format" : name === "enum" ? "in" : name), ...facts(rule));
        else if ( numbered.has(name) ) {

            if ( compares.has(name) && rule.args.length === 1 && !numberShape.test(rule.args[0] ?? "") ) cross.push(rule);
            else base = sized(base, kind, rule);

        } else if ( order ) {

            const at = bound(rule);

            if ( at === undefined ) cross.push(rule);
            else base = told(base, ( given ) => order(timeOf(given) ?? Number.NaN, at()), name);

        } else if ( crossing.has(name) ) cross.push(rule);
        else if ( !flags.has(name) && !noted.has(name) && !makers.has(name) ) return refuse(rule.text);

    }

    for ( const rule of cross ) referred(rule);

    const must = named.has("required") ? "required" : named.has("accepted") ? "accepted" : named.has("declined") ? "declined" : undefined;

    return { schema: present(base, { must, prohibited: named.has("prohibited"), filled: named.has("filled"), nullable: named.has("nullable"), raws }), plain, cross, found };

}
function pick ( row: Row, name: string ): unknown {

    return Object.hasOwn(row, name) ? row[name] : undefined;

}
function measured ( given: unknown ): readonly [string, number] | undefined {

    if ( typeof given === "number" ) return ["number", given];
    if ( typeof given === "string" ) return ["string", given.length];
    if ( Array.isArray(given) ) return ["array", given.length];

    return isRow(given) ? ["row", Object.keys(given).length] : undefined;

}
function within ( list: unknown, given: unknown ): boolean {

    const word = scalar(given);

    return word !== undefined && Array.isArray(list) && list.some(( item ) => scalar(item) === word);

}
function triggered ( rule: Rule ): ( row: Row ) => boolean {

    const [first = "", ...rest] = rule.args;
    const wanted = new Set(rest);
    const word = ( row: Row ): string => {

        const found = pick(row, first);

        return found === undefined || found === null ? "null" : (scalar(found) ?? "");

    };

    switch ( rule.name ) {
        case "required_if":
        case "prohibited_if":
        case "accepted_if":
        case "declined_if": return ( row ) => wanted.has(word(row));
        case "required_unless":
        case "prohibited_unless": return ( row ) => !wanted.has(word(row));
        case "required_with": return ( row ) => rule.args.some(( other ) => !empty(pick(row, other)));
        case "required_with_all": return ( row ) => rule.args.every(( other ) => !empty(pick(row, other)));
        case "required_without": return ( row ) => rule.args.some(( other ) => empty(pick(row, other)));
        case "required_without_all": return ( row ) => rule.args.every(( other ) => empty(pick(row, other)));
        case "required_if_accepted":
        case "prohibited_if_accepted": return ( row ) => value.boolean(pick(row, first)) === true;
        default: return ( row ) => value.boolean(pick(row, first)) === false;
    }

}
function crossed ( name: string, rule: Rule, plain: Schema | undefined ): Cross {

    const others = referred(rule, name);
    const [first = ""] = others;
    const order = orders.get(rule.name);
    const compare = compares.get(rule.name);
    const message = rule.name;
    const own = ( row: Row ): unknown => pick(row, name);
    const idle = ( row: Row ): boolean => own(row) === undefined || own(row) === null;
    const normal = ( given: unknown ): unknown => {

        const parsed = plain?.safeParse(given);

        return parsed?.success ? parsed.data : given;

    };
    const weighed = ( row: Row ): boolean => {

        const left = measured(own(row));
        const right = measured(pick(row, first));

        return left !== undefined && right !== undefined && left[0] === right[0] && (compare?.(left[1], right[1]) ?? false);

    };

    if ( order ) return { message, test: ( row ) => idle(row) || order(timeOf(own(row)) ?? Number.NaN, timeOf(pick(row, first)) ?? Number.NaN) };
    if ( compare ) return { message, test: ( row ) => idle(row) || weighed(row) };

    switch ( rule.name ) {
        case "confirmed": return { message, test: ( row ) => idle(row) || own(row) === normal(pick(row, first)) };
        case "same": return { message, test: ( row ) => idle(row) || own(row) === pick(row, first) };
        case "different": return { message, test: ( row ) => idle(row) || own(row) !== pick(row, first) };
        case "in_array": return { message, test: ( row ) => idle(row) || within(pick(row, first), own(row)) };
        case "prohibits": return { message, test: ( row ) => empty(own(row)) || others.every(( other ) => empty(pick(row, other))) };
        default: {

            const on = triggered(rule);
            const word = ["required", "prohibited", "accepted"].find(( prefix ) => rule.name.startsWith(prefix)) ?? "declined";
            const met = ( row: Row ): boolean => (word === "required" ? !empty(own(row)) : word === "prohibited" ? empty(own(row)) : value.boolean(own(row)) === (word === "accepted"));

            return { message: word, test: ( row ) => !on(row) || met(row) };

        }
    }

}

export function rules ( given: Rules ): Schema {

    return build(given).schema;

}
export function rulebook ( book: Book, extra: Book = {} ): Schema {

    const shape: Record<string, Schema> = {};
    const plains = new Map<string, Schema>();
    const lent = new Set<string>();
    const pending: Pending[] = [];

    for ( const [name, given] of Object.entries(book) ) {

        if ( name === "" || reserved.has(name) ) refuse(name, "field");

        const built = build(given);

        shape[name] = built.schema;
        plains.set(name, built.plain);
        pending.push(...built.cross.map(( rule ) => ({ name, rule })));

    }

    for ( const [name, given] of Object.entries(extra) ) {

        const built = build(given);
        const stray = built.found.find(( rule ) => !built.cross.includes(rule));

        if ( !plains.has(name) ) refuse(name, "field");
        if ( stray ) refuse(stray.text);

        pending.push(...built.cross.map(( rule ) => ({ name, rule })));

    }

    for ( const { name, rule } of pending ) {

        const others = referred(rule, name);
        const [twin = ""] = others;

        if ( rule.name === "confirmed" && rule.args.length === 0 && !Object.hasOwn(shape, twin) ) {

            shape[twin] = zod.optional(zod.unknown());
            lent.add(twin);

        }

        for ( const other of others ) if ( !Object.hasOwn(shape, other) ) refuse(other, "field");

    }

    return held(zod.strictObject(shape), ...pending.map(({ name, rule }) => {

        const { test, message } = crossed(name, rule, lent.has(referred(rule, name)[0] ?? "") ? plains.get(name) : undefined);

        return zod.refine(( given: unknown ) => !isRow(given) || test(given), { error: message, path: [name] });

    }));

}
