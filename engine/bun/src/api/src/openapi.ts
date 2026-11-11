import * as error from "engine-error";
import * as json from "engine-json";
import * as validate from "engine-validate";
import { type Catalogue, type Endpoint, fieldsOf, paramsOf, partsOf } from "./contract.ts";
import { envelope, type Meta, refusal } from "./envelope.ts";
import { house, type Paths, type Wire } from "./wire.ts";

export type Info = { title: string; version: string; description?: string | undefined; servers?: readonly string[] | undefined; wire?: Wire | undefined };
export type TransportIssue = { feature: string; name: string; rule: string; message: string };
export type Features = Catalogue;

type Node = { type: "object"; properties: Record<string, unknown>; required?: string[] };
type Parameter = { name: string; in: "path" | "query" | "header"; required: boolean; schema?: unknown; content?: unknown };
type Split = { parameters: Parameter[]; body: Record<string, unknown> | undefined; needed: boolean };
type Frame = { data: unknown; many: boolean; failed: boolean };

const inner = "#/$defs/";
const home = "#/components/schemas/";
const unnamed = /[^A-Za-z0-9._-]/g;
const lost: ReadonlySet<string> = new Set(["map", "set", "file", "custom", "symbol", "function", "promise"]);

function whole ( value: number, least: number ): number {

    return Number.isFinite(value) ? Math.max(least, Math.floor(value)) : least;

}
function unfit ( field: validate.Field ): boolean {

    if ( lost.has(field.kind) ) return true;

    return (field.item ? unfit(field.item) : false) || (field.fields ?? []).some(unfit) || (field.variants ?? []).some(unfit);

}
function templated ( endpoint: Endpoint, erased: boolean ): string {

    return partsOf(endpoint).map(( part ) => `${part.text}${part.name === "" ? "" : erased ? "{}" : `{${part.name}}`}`).join("");

}
function named ( name: string ): string {

    return name.replace(unnamed, "_");

}
function lifted ( schema: validate.Schema, io: "input" | "output", owner: string, shared: Record<string, unknown> ): Record<string, unknown> {

    const made = validate.toJSONSchema(schema, { io });
    const defs = json.isRecord(made.$defs) ? made.$defs : {};
    const seen = { rooted: false };

    function aimed ( target: string ): string {

        if ( target === "#" ) {

            seen.rooted = true;

            return `${home}${owner}`;

        }

        return target.startsWith(inner) ? `${home}${owner}.${named(target.slice(inner.length))}` : target;

    }
    function moved ( value: unknown ): unknown {

        if ( Array.isArray(value) ) return value.map(moved);

        return json.isRecord(value) ? linked(value) : value;

    }
    function linked ( value: json.Dictionary ): Record<string, unknown> {

        return Object.fromEntries(Object.keys(value).map(( key ) => {

            const held = value[key];

            return [key, key === "$ref" && typeof held === "string" ? aimed(held) : moved(held)];

        }));

    }

    const root = linked(json.omit(made, ["$schema", "$defs"]));

    for ( const name of Object.keys(defs) ) shared[`${owner}.${named(name)}`] = moved(defs[name]);

    if ( seen.rooted ) shared[owner] = root;

    return root;

}
function framed ( paths: Paths, frame: Frame ): Node {

    const root: Node = { type: "object", properties: {} };
    const nodes = new Map<string, Node>();

    function place ( path: string, schema: unknown, needed = false ): void {

        const keys = path.split(".");
        const last = keys.pop() ?? "";
        let at = root;
        let trail = "";

        if ( last === "" || !json.safeKey(last) || !keys.every(json.safeKey) ) return;

        for ( const key of keys ) {

            trail = `${trail}.${key}`;

            const next: Node = nodes.get(trail) ?? { type: "object", properties: {} };

            nodes.set(trail, next);
            at.properties[key] = next;

            if ( needed && !(at.required ?? []).includes(key) ) at.required = [...(at.required ?? []), key];

            at = next;

        }

        at.properties[last] = schema;

        if ( needed ) at.required = [...(at.required ?? []), last];

    }

    place(paths.data, frame.data, true);
    place(paths.code, { type: "string" }, true);
    place(paths.message, { type: frame.failed ? "string" : ["string", "null"] });
    place(paths.errors, { type: ["object", "null"], additionalProperties: { type: "array", items: { type: "string" } } });
    place(paths.reason, { type: ["string", "null"] });
    place(paths.requestId, { type: "string" });

    if ( frame.failed ) place(paths.retryAfter, { type: "number", minimum: 0 });

    if ( frame.many ) {

        place(paths.page, { type: "integer", minimum: 0 });
        place(paths.limit, { type: "integer", minimum: 0 });
        place(paths.total, { type: "integer", minimum: 0 });
        place(paths.pages, { type: "integer", minimum: 0 });

    }

    return root;

}
function split ( endpoint: Endpoint, root: Record<string, unknown>, wire: Wire ): Split {

    const names = paramsOf(endpoint);
    const shape = json.isRecord(root.properties) ? root.properties : undefined;
    const properties = shape ?? {};
    const required = Array.isArray(root.required) ? root.required.filter(( name ): name is string => typeof name === "string") : [];
    const bodiless = endpoint.method === "GET" || endpoint.method === "DELETE";
    const parameters: Parameter[] = names.map(( name ) => ({ name, in: "path", required: true, schema: Object.hasOwn(properties, name) ? properties[name] : { type: "string" } }));

    if ( !endpoint.idempotent && !wire.idempotent.includes(endpoint.method) ) parameters.push({ name: wire.headers.idempotency, in: "header", required: false, schema: { type: "string", minLength: 1, maxLength: 255 } });

    if ( bodiless ) {

        for ( const key of Object.keys(properties) ) {

            const schema = properties[key];
            const nested = json.isRecord(schema) && (schema.type === "object" || json.isRecord(schema.properties));

            if ( names.includes(key) ) continue;

            parameters.push(nested ? { name: key, in: "query", required: required.includes(key), content: { "application/json": { schema } } } : { name: key, in: "query", required: required.includes(key), schema });

        }

        return { parameters, body: undefined, needed: false };

    }

    if ( !shape ) return { parameters, body: Object.keys(root).length ? root : undefined, needed: false };

    const rest = Object.fromEntries(Object.keys(shape).filter(( key ) => !names.includes(key)).map(( key ) => [key, shape[key]]));
    const needs = required.filter(( name ) => !names.includes(name));
    const open = root.additionalProperties !== undefined && root.additionalProperties !== false;

    if ( Object.keys(rest).length === 0 && !open ) return { parameters, body: undefined, needed: false };

    return { parameters, body: { ...json.omit(root, ["required"]), properties: rest, ...(needs.length ? { required: needs } : {}) }, needed: needs.length > 0 };

}
function guarded ( wire: Wire ): { name: string; scheme: Record<string, unknown> } {

    const { name, prefix } = wire.headers.auth;

    if ( name === "authorization" && (prefix ?? "").trim().toLowerCase() === "bearer" ) return { name: "bearer", scheme: { type: "http", scheme: "bearer" } };

    return { name: "key", scheme: { type: "apiKey", in: "header", name } };

}

export function answer<T> ( data: T, meta: Meta = {}, paths: Paths = house.envelope, ok = house.ok ): json.Dictionary {

    return envelope(data, meta, paths, ok);

}
export function refuse ( failure: unknown, meta: Meta = {}, paths: Paths = house.envelope ): json.Dictionary {

    return refusal(error.of(failure), meta, paths);

}
export function paged<T> ( rows: readonly T[], page: { page: number; limit: number; total: number }, paths: Paths = house.envelope, ok = house.ok ): json.Dictionary {

    const limit = whole(page.limit, 0);
    const total = whole(page.total, 0);

    return envelope(rows, { page: whole(page.page, 1), limit, total, pages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1 }, paths, ok);

}
export function transportIssues ( features: Features ): TransportIssue[] {

    const out: TransportIssue[] = [];
    const routes = new Map<string, string>();
    const shapes = new Map<string, string>();

    for ( const [feature, held] of Object.entries(features) ) {

        for ( const [name, endpoint] of Object.entries(held) ) {

            const told = ( rule: string, message: string ): void => {

                out.push({ feature, name, rule, message });

            };
            const route = `${endpoint.method} ${endpoint.path}`;
            const shape = `${endpoint.method} ${templated(endpoint, true)}`;
            const taken = routes.get(route);
            const alike = shapes.get(shape);
            const params = paramsOf(endpoint);
            const bodiless = endpoint.method === "GET" || endpoint.method === "DELETE";

            if ( taken ) told("route.taken", `${route} already answers ${taken}`);
            else if ( alike ) told("route.ambiguous", `${route} answers the same addresses as ${alike}`);

            if ( !taken ) routes.set(route, `${feature}.${name}`);
            if ( !alike ) shapes.set(shape, `${feature}.${name}`);

            if ( endpoint.many && endpoint.method !== "GET" ) told("many.method", "a list answers a GET");
            if ( endpoint.cache > 0 && endpoint.method !== "GET" ) told("cache.method", "only a GET is cached");

            for ( const field of fieldsOf(endpoint.input) ) {

                const bound = params.includes(field.name);

                if ( bound && !field.required ) told("param.optional", `the path parameter {${field.name}} is sent on every call`);
                if ( !bound && unfit(field) ) told(bodiless ? "query.shape" : "body.shape", `the field ${field.name} has no ${bodiless ? "text" : "json"} form`);

            }

        }

    }

    return out;

}
export function openapi ( features: Features, info: Info ): json.Dictionary {

    const wire = info.wire ?? house;
    const auth = guarded(wire);
    const paths: Record<string, Record<string, unknown>> = {};
    const shared: Record<string, unknown> = { Refusal: framed(wire.envelope, { data: { type: "null" }, many: false, failed: true }) };

    for ( const [feature, held] of Object.entries(features) ) {

        for ( const [name, endpoint] of Object.entries(held) ) {

            const id = `${feature}.${name}`;
            const template = templated(endpoint, false);
            const output = lifted(endpoint.output, "output", `${id}.output`, shared);
            const { parameters, body, needed } = split(endpoint, lifted(endpoint.input, "input", `${id}.input`, shared), wire);
            const operation: Record<string, unknown> = {
                operationId: id,
                tags: [feature],
                security: endpoint.auth ? [{ [auth.name]: [...endpoint.permissions] }] : [],
                parameters,
                responses: {
                    "200": { description: "ok", content: { "application/json": { schema: framed(wire.envelope, { data: endpoint.many ? { type: "array", items: output } : output, many: endpoint.many, failed: false }) } } },
                    default: { description: "refused", content: { "application/json": { schema: { $ref: `${home}Refusal` } } } },
                },
            };

            if ( body ) operation.requestBody = { required: needed, content: { "application/json": { schema: body } } };

            paths[template] = { ...(paths[template] ?? {}), [endpoint.method.toLowerCase()]: operation };

        }

    }

    return json.compact({
        openapi: "3.1.0",
        info: json.compact({ title: info.title, version: info.version, description: info.description }),
        servers: info.servers?.length ? info.servers.map(( url ) => ({ url })) : undefined,
        paths,
        components: { securitySchemes: { [auth.name]: auth.scheme }, schemas: shared },
    });

}
