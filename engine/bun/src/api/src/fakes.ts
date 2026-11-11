import * as error from "engine-error";
import * as fake from "engine-fake";
import * as json from "engine-json";
import * as list from "engine-list";
import * as validate from "engine-validate";
import { type Catalogue, type Endpoint, endpoints, fieldsOf, idOf, type Part, partsOf } from "./contract.ts";
import { envelope } from "./envelope.ts";
import { type Route, type Routes, type Stub, stub } from "./stub.ts";
import { house, type Wire } from "./wire.ts";

export type Bound = Readonly<Record<string, string | number>>;
export type FakeOptions = fake.Options & { seed?: fake.Seed | undefined; rows?: number | undefined; wire?: Wire | undefined; latency?: number | undefined };
export type Fakes = Stub & { routes: Routes; rows: ( endpoint: Endpoint, params?: Bound ) => json.Dictionary[] };

type Asked = string | string[] | undefined;
type Place = { shape: string; key: string; scope: readonly string[]; name: ( params: Bound ) => string };
type Kind = { source: Endpoint; held: boolean; count: number; columns: ReadonlyMap<string, validate.Field>; uniques: readonly string[]; boxed: boolean };

const reserved: ReadonlySet<string> = new Set(["page", "limit", "sort", "search", "q"]);
const digits = /^\d{1,9}$/;
const action = /^\/[^/]+\/?$/;
const most = 10_000;
const scopes = 256;
const turns = 8;
const settled = new WeakMap<object, boolean>();

function trimmed ( path: string ): string {

    let end = path.length;

    while ( end > 1 && path.charCodeAt(end - 1) === 47 ) end -= 1;

    return path.slice(0, end);

}
function filled ( part: Part, params: Bound ): string {

    if ( part.name === "" ) return part.text;

    return `${part.text}${Object.hasOwn(params, part.name) ? String(params[part.name]) : `{${part.name}}`}`;

}
function spot ( parts: readonly Part[], key: string ): Place {

    return {
        key,
        scope: parts.filter(( part ) => part.name !== "").map(( part ) => part.name),
        shape: trimmed(parts.map(( part ) => `${part.text}${part.name === "" ? "" : "{}"}`).join("")),
        name: ( params ) => trimmed(parts.map(( part ) => filled(part, params)).join("")),
    };

}
function own ( endpoint: Endpoint ): Place {

    const parts = partsOf(endpoint);
    const last = parts[parts.length - 1];

    if ( !last || last.name === "" || endpoint.many ) return spot(parts, "");

    return spot([...parts.slice(0, -1), { text: last.text, name: "", rest: false }], last.name);

}
function above ( endpoint: Endpoint ): Place | undefined {

    const parts = partsOf(endpoint);
    const last = parts[parts.length - 1];
    const before = parts[parts.length - 2];

    if ( !last || !before || last.name !== "" || before.name === "" || !action.test(last.text) ) return undefined;

    return spot([...parts.slice(0, -2), { text: before.text, name: "", rest: false }], before.name);

}
function rankOf ( endpoint: Endpoint ): number {

    return endpoint.method !== "GET" ? 0 : endpoint.many ? 2 : 1;

}
function first ( value: Asked ): string | undefined {

    return Array.isArray(value) ? value[0] : value;

}
function whole ( value: Asked, fallback: number, high: number ): number {

    const text = first(value);

    return text === undefined || !digits.test(text) ? fallback : Math.min(high, Math.max(1, Number(text)));

}
function cast ( field: validate.Field, value: string | number ): unknown {

    const text = String(value);

    if ( field.kind === "number" ) return text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : undefined;
    if ( field.kind === "boolean" ) return text === "true" ? true : text === "false" ? false : undefined;

    return text;

}
function columnOf ( kind: Kind, key: string ): string {

    return key === "" ? "" : kind.columns.has(key) ? key : kind.columns.has("id") ? "id" : "";

}
function chosen ( given: json.Dictionary, names: Iterable<string> ): json.Dictionary {

    const made: json.Dictionary = {};

    for ( const name of names ) {

        if ( json.safeKey(name) && Object.hasOwn(given, name) && given[name] !== undefined ) made[name] = given[name];

    }

    return made;

}
function holds ( row: json.Dictionary, needle: string ): boolean {

    for ( const key of Object.keys(row) ) {

        const value = row[key];

        if ( (typeof value === "string" || typeof value === "number") && String(value).toLowerCase().includes(needle) ) return true;

    }

    return false;

}
function highest ( held: readonly json.Dictionary[], column: string ): number {

    let top = 0;

    for ( const row of held ) {

        const value = row[column];

        if ( typeof value === "number" && value > top ) top = value;

    }

    return Math.floor(top);

}
function taken ( held: readonly json.Dictionary[], column: string, value: unknown ): boolean {

    return value !== undefined && held.some(( row ) => String(row[column]) === String(value));

}
function locate ( kind: Kind, place: Place, held: readonly json.Dictionary[], params: Bound ): number {

    const column = columnOf(kind, place.key);
    const field = kind.columns.get(column);
    const wanted = field && Object.hasOwn(params, place.key) ? cast(field, params[place.key] ?? "") : undefined;

    return wanted === undefined ? -1 : held.findIndex(( row ) => String(row[column]) === String(wanted));

}
function settles ( schema: validate.Schema, value: unknown ): boolean {

    const known = settled.get(schema);

    if ( known !== undefined ) return known;

    const made = validate.check(schema, value).ok;

    settled.set(schema, made);

    return made;

}
function merged ( schema: validate.Schema, base: json.Dictionary, changes: json.Dictionary ): json.Dictionary {

    const next = { ...base, ...changes };

    if ( Object.keys(changes).length === 0 || !settles(schema, base) ) return next;

    const checked = validate.check(schema, next, "fakes.row");

    if ( !checked.ok ) throw checked.fault;

    return next;

}
function missing ( cause: unknown ): error.Fault {

    return error.fault("not_found", "fakes.missing", { cause });

}

export function fakes ( features: Catalogue, options: FakeOptions = {} ): Fakes {

    const { seed = "engine", rows = 25, wire = house, latency = 0 } = options;
    const size = Number.isFinite(rows) ? Math.min(most, Math.max(0, Math.floor(rows))) : 25;
    const maker = fake.create(seed, json.omit(options, ["seed", "rows", "wire", "latency"]));
    const every = endpoints(features);
    const read = new Set(every.filter(( endpoint ) => endpoint.method === "GET").map(( endpoint ) => own(endpoint).shape));
    const places = new Map<Endpoint, Place>();
    const kinds = new Map<string, Kind>();
    const tables = new Map<string, json.Dictionary[]>();
    const queue: string[] = [];
    const routes: Routes = {};
    let serial = 0;

    function placeOf ( endpoint: Endpoint ): Place {

        const known = places.get(endpoint);

        if ( known ) return known;

        const made = own(endpoint);

        places.set(endpoint, made);

        return made;

    }
    function kindOf ( endpoint: Endpoint ): Kind {

        const place = placeOf(endpoint);
        const known = kinds.get(place.shape);

        if ( known ) return known;

        const group = every.filter(( other ) => places.get(other)?.shape === place.shape);
        const members = group.length ? group : [endpoint];
        const source = members.reduce(( best, other ) => (rankOf(other) > rankOf(best) ? other : best));
        const columns = new Map(fieldsOf(source.output).map(( field ) => [field.name, field] as const));
        const keys = members.map(( other ) => placeOf(other).key).filter(( key ) => key !== "");
        const uniques = [...new Set([...keys.filter(( key ) => columns.has(key)), ...(columns.has("id") ? ["id"] : [])])];
        const made: Kind = { source, held: source.method === "GET", count: source.many || keys.length ? size : Math.min(size, 1), columns, uniques, boxed: false };

        kinds.set(place.shape, made);

        return made;

    }
    function drawn ( stream: fake.Faker, kind: Kind, forced: fake.Overrides | undefined ): json.Dictionary {

        const made: unknown = stream.from(kind.source.output, forced);

        if ( json.isRecord(made) ) return made;

        kind.boxed = true;

        return { value: made };

    }
    function pinned ( kind: Kind, place: Place, params: Bound ): fake.Overrides | undefined {

        const made: Record<string, unknown> = {};

        for ( const name of place.scope ) {

            const field = kind.columns.get(name);
            const value = field && Object.hasOwn(params, name) ? cast(field, params[name] ?? "") : undefined;

            if ( value !== undefined ) made[name] = value;

        }

        return Object.keys(made).length ? made : undefined;

    }
    function table ( endpoint: Endpoint, params: Bound = {} ): json.Dictionary[] {

        const place = placeOf(endpoint);
        const name = place.name(params);
        const known = tables.get(name);

        if ( known ) return known;

        const kind = kindOf(endpoint);
        const stream = maker.fork(name);
        const forced = pinned(kind, place, params);
        const seen = kind.uniques.map(() => new Set<string>());
        const made: json.Dictionary[] = [];
        const clashes = ( row: json.Dictionary ): boolean => kind.uniques.some(( column, at ) => row[column] !== undefined && seen[at]?.has(String(row[column])) === true);

        try {

            for ( let at = 0; at < kind.count; at += 1 ) {

                let row = drawn(stream, kind, forced);

                for ( let turn = 0; turn < turns && clashes(row); turn += 1 ) row = drawn(stream, kind, forced);

                for ( const [index, column] of kind.uniques.entries() ) seen[index]?.add(String(row[column]));

                made.push(row);

            }

        } catch ( caught ) {

            throw forced === undefined ? caught : missing(caught);

        }

        tables.set(name, made);

        if ( place.scope.length ) {

            queue.push(name);

            const old = queue.length > scopes ? queue.shift() : undefined;

            if ( old !== undefined ) tables.delete(old);

        }

        return made;

    }
    function tagged ( kind: Kind, place: Place, params: Bound, row: json.Dictionary ): string {

        const column = columnOf(kind, place.key) || (kind.uniques[0] ?? "");

        return `${place.name(params)}/${column === "" ? "" : String(row[column])}`;

    }
    function fitted ( endpoint: Endpoint, kind: Kind, row: json.Dictionary, tag: string ): unknown {

        if ( endpoint.output === kind.source.output ) return kind.boxed ? row.value : row;

        const made: unknown = maker.fork(`${idOf(endpoint)} ${tag}`).from(endpoint.output);

        return json.isRecord(made) ? { ...made, ...chosen(row, Object.keys(made)) } : made;

    }
    function absent ( endpoint: Endpoint, place: Place, params: Bound, given: json.Dictionary ): unknown {

        const fields = new Map(fieldsOf(endpoint.output).map(( field ) => [field.name, field] as const));
        const column = place.key === "" ? "" : fields.has(place.key) ? place.key : fields.has("id") ? "id" : "";
        const named: Record<string, string | number> = column === "" ? { ...params } : { ...params, [column]: params[place.key] ?? "" };
        const forced: Record<string, unknown> = {};
        let made: unknown;

        for ( const key of Object.keys(named) ) {

            const field = fields.get(key);

            if ( !field ) continue;

            const value = cast(field, named[key] ?? "");

            if ( value === undefined ) throw missing(undefined);

            forced[key] = value;

        }

        try {

            made = maker.fork(`${idOf(endpoint)} ${place.name(params)}/${String(params[place.key] ?? "")}`).from(endpoint.output, forced);

        } catch ( caught ) {

            throw Object.keys(forced).length ? missing(caught) : caught;

        }

        return json.isRecord(made) ? merged(endpoint.output, made, json.omit(chosen(given, fields.keys()), Object.keys(forced))) : made;

    }
    function added ( kind: Kind, place: Place, held: json.Dictionary[], params: Bound, sent: json.Dictionary ): json.Dictionary {

        serial += 1;

        const stream = maker.fork(`${place.name(params)} +${String(serial)}`);
        const forced = pinned(kind, place, params);
        const row = merged(kind.source.output, drawn(stream, kind, forced), json.omit(sent, [...place.scope]));

        for ( const column of kind.uniques ) {

            if ( Object.hasOwn(sent, column) ) {

                if ( taken(held, column, row[column]) ) throw error.fault("conflict", "fakes.taken", { errors: { [column]: ["the value is taken"] } });

                continue;

            }

            if ( typeof row[column] === "number" ) {

                const next = highest(held, column) + 1;

                if ( validate.check(kind.source.output, { ...row, [column]: next }).ok ) {

                    row[column] = next;

                    continue;

                }

            }

            for ( let turn = 0; turn < turns && taken(held, column, row[column]); turn += 1 ) row[column] = drawn(stream, kind, forced)[column];

        }

        if ( kind.held ) {

            if ( held.length >= most ) held.shift();

            held.push(row);

        }

        return row;

    }

    const page = ( endpoint: Endpoint ): Route => ({ params, query }) => {

        const kind = kindOf(endpoint);
        const held = table(endpoint, params);
        const filters = Object.keys(query).filter(( key ) => !reserved.has(key) && kind.columns.has(key));
        const needle = (first(query.q) ?? first(query.search) ?? "").trim().toLowerCase();
        const kept = filters.length || needle !== "" ? held.filter(( row ) => filters.every(( key ) => [query[key] ?? []].flat().includes(String(row[key]))) && (needle === "" || holds(row, needle))) : held;
        const orders = [query.sort ?? []].flat().flatMap(( part ) => part.split(",")).flatMap(( part ): list.Order<json.Dictionary>[] => {

            const text = part.trim();
            const down = text.startsWith("-");
            const key = down || text.startsWith("+") ? text.slice(1) : text;

            return kind.columns.has(key) ? [{ by: key, direction: down ? "desc" : "asc" }] : [];

        });
        const all = orders.length ? list.sortByMany(kept, orders) : kept;
        const current = whole(query.page, 1, 1_000_000);
        const limit = whole(query.limit, 20, 100);
        const slice = all.slice((current - 1) * limit, current * limit);

        return envelope(kind.boxed ? slice.map(( row ) => row.value) : slice, { page: current, limit, total: all.length, pages: Math.max(1, Math.ceil(all.length / limit)) }, wire.envelope, wire.ok);

    };
    const one = ( endpoint: Endpoint ): Route => ({ params }) => {

        const place = placeOf(endpoint);
        const kind = kindOf(endpoint);
        const held = table(endpoint, params);
        const row = held[place.key === "" ? 0 : locate(kind, place, held, params)];

        return row ? fitted(endpoint, kind, row, tagged(kind, place, params, row)) : absent(endpoint, place, params, {});

    };
    const write = ( endpoint: Endpoint ): Route => ({ params, body }) => {

        const place = placeOf(endpoint);
        const kind = kindOf(endpoint);
        const held = table(endpoint, params);
        const given = json.isRecord(body) ? body : {};
        const sent = chosen(given, kind.columns.keys());

        if ( place.key === "" && endpoint.method === "POST" ) {

            const made = added(kind, place, held, params, sent);

            return fitted(endpoint, kind, made, tagged(kind, place, params, made));

        }

        const at = place.key === "" ? 0 : locate(kind, place, held, params);
        const row = held[at];

        if ( !row ) return absent(endpoint, place, params, given);

        const tag = tagged(kind, place, params, row);

        if ( endpoint.method === "DELETE" ) {

            if ( place.key !== "" ) held.splice(at, 1);

            return fitted(endpoint, kind, row, tag);

        }

        Object.assign(row, merged(kind.source.output, row, json.omit(sent, [...kind.uniques, ...place.scope])));

        return fitted(endpoint, kind, row, tag);

    };

    for ( const endpoint of every ) {

        const mine = own(endpoint);
        const lifted = endpoint.method === "GET" || read.has(mine.shape) ? undefined : above(endpoint);

        places.set(endpoint, lifted && read.has(lifted.shape) ? lifted : mine);

    }

    for ( const endpoint of every ) routes[`${endpoint.method} ${endpoint.path}`] = endpoint.method === "GET" ? (endpoint.many ? page(endpoint) : one(endpoint)) : write(endpoint);

    const made = stub(routes, wire);

    made.latency(latency);

    return {
        ...made,
        routes,
        rows: table,
        reset: () => {

            made.reset();
            tables.clear();
            queue.length = 0;
            serial = 0;

        },
    };

}
export function sample<T extends validate.Schema> ( schema: T, seed: fake.Seed = "engine", overrides?: fake.Overrides ): validate.infer<T> {

    return fake.create(seed).from(schema, overrides);

}
