import * as error from "engine-error";
import * as json from "engine-json";
import * as validate from "engine-validate";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Many<T extends validate.Schema = validate.Schema> = { many: T };
export type Endpoint<I extends validate.Schema = validate.Schema, O extends validate.Schema = validate.Schema, M extends boolean = boolean> = {
    method: Method;
    path: string;
    input: I;
    output: O;
    many: M;
    name: string;
    feature: string;
    auth: boolean;
    cache: number;
    permissions: readonly string[];
    idempotent: boolean;
};
export type Facts = { permissions: readonly string[]; auth: boolean; cache: number };
export type Operation = { many: boolean; write: boolean; input: string[]; output: string[] | undefined; permissions: readonly string[]; auth: boolean };
export type Catalogue = Readonly<Record<string, Readonly<Record<string, Endpoint>>>>;
export type Options = Partial<Facts> & { idempotent?: boolean | undefined };
export type Item<O> = O extends Many<infer T> ? T : O extends validate.Schema ? O : never;
export type Define = <const I extends validate.Schema, const O extends validate.Schema | Many>( path: string, input: I, output: O, options?: Options ) => Endpoint<I, Item<O>, O extends Many ? true : false>;
export type Part = { text: string; name: string; rest: boolean };

const methods: readonly Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const literal = /^[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/;
const slot = /^[A-Za-z_][A-Za-z0-9_]*$/;
const featured = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/;
const keyed = /^[A-Za-z_][A-Za-z0-9_]*$/;
const names = new WeakMap<object, Facts>();
const declared = new WeakMap<object, Options>();
const shapes = new WeakMap<object, readonly Part[]>();
const listed = new WeakMap<object, readonly validate.Field[]>();

function wrong ( reason: string, message: string ): error.Fault {

    return error.fault("internal", reason, { message });

}
function scanned ( path: string ): Part[] | string {

    const made: Part[] = [];
    const seen = new Set<string>();
    let from = 0;

    if ( typeof path !== "string" || !path.startsWith("/") ) return "a path starts with /";
    if ( path.length > 512 ) return "a path is at most 512 characters";

    while ( from < path.length ) {

        const open = path.indexOf("{", from);
        const shut = path.indexOf("}", from);

        if ( open === -1 && shut === -1 ) {

            made.push({ text: path.slice(from), name: "", rest: false });

            break;

        }

        if ( open === -1 || (shut !== -1 && shut < open) ) return "a } closes nothing";
        if ( shut === -1 ) return "a { is never closed";

        const inner = path.slice(open + 1, shut);
        const rest = inner.endsWith("*");
        const name = rest ? inner.slice(0, -1) : inner;

        if ( !slot.test(name) || !json.safeKey(name) ) return `{${inner}} is not a parameter name`;
        if ( seen.has(name) ) return `{${name}} is bound twice`;

        seen.add(name);
        made.push({ text: path.slice(from, open), name, rest });
        from = shut + 1;

    }

    const plain = made.map(( part ) => `${part.text}${part.name === "" ? "" : "x"}`).join("");

    if ( !literal.test(plain) ) return "a path holds url path characters only, without a query or a hash";
    if ( plain.includes("//") ) return "a path holds no empty segment";
    if ( plain.split("/").some(( piece ) => piece === "." || piece === "..") ) return "a path holds no dot segment";

    return made;

}
function seconds ( value: unknown, owner: string ): number | undefined {

    if ( value === undefined ) return undefined;
    if ( typeof value !== "number" || !Number.isFinite(value) || value < 0 ) throw wrong("api.cache", `${owner}: a cache is a number of seconds, zero or more`);

    return value;

}
function route ( method: Method ): Define {

    return ( path, input, output, options = {} ) => {

        const parts = scanned(path);

        if ( typeof parts === "string" ) throw wrong("api.path", `${method} ${String(path).slice(0, 120)}: ${parts}`);
        if ( typeof input !== "object" || input === null || typeof output !== "object" || output === null ) throw wrong("api.schema", `${method} ${path}: an endpoint declares an input and an output schema`);

        const made = {
            method,
            path,
            input,
            output: ("many" in output ? output.many : output) as Item<typeof output>,
            many: ("many" in output) as typeof output extends Many ? true : false,
            name: "",
            feature: "",
            auth: options.auth ?? true,
            cache: seconds(options.cache, `${method} ${path}`) ?? 0,
            permissions: options.permissions ?? [],
            idempotent: options.idempotent ?? (method === "GET" || method === "PUT" || method === "DELETE"),
        };

        declared.set(made, options);
        shapes.set(made, parts);

        return made;

    };

}

export const get: Define = route("GET");
export const post: Define = route("POST");
export const put: Define = route("PUT");
export const patch: Define = route("PATCH");
export const del: Define = route("DELETE");

export function many<T extends validate.Schema> ( item: T ): Many<T> {

    return { many: item };

}
export function fieldsOf ( schema: validate.Schema ): readonly validate.Field[] {

    const known = listed.get(schema);

    if ( known ) return known;

    const made = validate.fields(schema);

    listed.set(schema, made);

    return made;

}
export function partsOf ( endpoint: Endpoint ): readonly Part[] {

    const known = shapes.get(endpoint);

    if ( known ) return known;

    const made = scanned(endpoint.path);

    if ( typeof made === "string" ) throw wrong("api.path", `${endpoint.method} ${String(endpoint.path).slice(0, 120)}: ${made}`);

    shapes.set(endpoint, made);

    return made;

}
export function paramsOf ( endpoint: Endpoint ): string[] {

    return partsOf(endpoint).filter(( part ) => part.name !== "").map(( part ) => part.name);

}
export function idOf ( endpoint: Endpoint ): string {

    return endpoint.feature === "" ? endpoint.name : `${endpoint.feature}.${endpoint.name}`;

}
export function feature<const T extends Record<string, Endpoint>> ( name: string, endpoints: T, defaults: Partial<Facts> = {} ): T {

    if ( typeof name !== "string" || name.length > 64 || !featured.test(name) ) throw wrong("api.name", `${String(name).slice(0, 80)}: a feature is named in letters, digits, dashes and dots`);

    const out: Record<string, Endpoint> = {};
    const shared = seconds(defaults.cache, name) ?? 0;
    const granted = defaults.permissions ?? [];

    for ( const key of Object.keys(endpoints) ) {

        const endpoint = endpoints[key];

        if ( !endpoint || !keyed.test(key) || !json.safeKey(key) ) throw wrong("api.name", `${name}.${key.slice(0, 80)}: an endpoint is named as an identifier`);
        if ( !methods.includes(endpoint.method) ) throw wrong("api.method", `${name}.${key}: ${String(endpoint.method)} is not a method`);

        const parts = partsOf(endpoint);
        const fields = fieldsOf(endpoint.input);
        const own = declared.get(endpoint) ?? { auth: endpoint.auth, cache: endpoint.cache, idempotent: endpoint.idempotent };

        for ( const part of parts ) {

            if ( part.name !== "" && !fields.some(( field ) => field.name === part.name) ) throw wrong("api.params", `${name}.${key}: the path parameter {${part.name}} needs an input field`);

        }

        const made: Endpoint = Object.freeze({
            ...endpoint,
            name: key,
            feature: name,
            auth: own.auth ?? defaults.auth ?? true,
            cache: seconds(own.cache, `${name}.${key}`) ?? (endpoint.method === "GET" ? shared : 0),
            permissions: Object.freeze([...new Set([...granted, ...endpoint.permissions])]),
        });

        declared.set(made, own);
        shapes.set(made, parts);
        out[key] = made;

    }

    names.set(out, { permissions: [...granted], auth: defaults.auth ?? true, cache: shared });

    return Object.freeze(out) as T;

}
export function facts ( endpoints: object ): Facts {

    const known = names.get(endpoints);

    return known ? { permissions: [...known.permissions], auth: known.auth, cache: known.cache } : { permissions: [], auth: true, cache: 0 };

}
export function endpoints ( features: Catalogue ): Endpoint[] {

    const made: Endpoint[] = [];

    for ( const group of Object.keys(features) ) {

        const held = features[group];

        for ( const key of Object.keys(held ?? {}) ) {

            const endpoint = held?.[key];

            if ( endpoint ) made.push(endpoint);

        }

    }

    return made;

}
export function find ( features: Catalogue, id: string ): Endpoint | undefined {

    const dot = typeof id === "string" ? id.lastIndexOf(".") : -1;

    if ( dot <= 0 ) return undefined;

    const path = [id.slice(0, dot), id.slice(dot + 1)];

    return json.has(features, path) ? json.pathGet(features, path) as Endpoint : undefined;

}
export function catalogue ( features: Catalogue ): Record<string, Operation> {

    const out: Record<string, Operation> = {};

    for ( const [group, held] of Object.entries(features) ) {

        for ( const [name, endpoint] of Object.entries(held) ) {

            const output = fieldsOf(endpoint.output).map(( field ) => field.name);

            out[`${group}.${name}`] = { many: endpoint.many, write: endpoint.method !== "GET", input: fieldsOf(endpoint.input).map(( field ) => field.name), output: output.length ? output : undefined, permissions: endpoint.permissions, auth: endpoint.auth };

        }

    }

    return out;

}
