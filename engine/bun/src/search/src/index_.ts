import * as json from "engine-json";
import * as string from "engine-string";

export type Field<T> = (keyof T & string) | (string & Record<never, never>);
export type Options<T> = {
    fields: readonly Field<T>[];
    key: ( item: T ) => string;
    weights?: Readonly<Record<string, number>> | undefined;
    minLength?: number | undefined;
    stop?: readonly string[] | undefined;
    tokenize?: (( text: string ) => readonly string[]) | undefined;
};
export type Query<T = unknown> = {
    limit?: number | undefined;
    offset?: number | undefined;
    prefix?: boolean | undefined;
    fuzzy?: number | undefined;
    all?: boolean | undefined;
    expansions?: number | undefined;
    filter?: (( item: T ) => boolean) | undefined;
    boost?: (( item: T ) => number) | undefined;
};
export type Hit<T> = { key: string; item: T; score: number; terms: string[] };
export type Index<T> = {
    add: ( item: T ) => void;
    addAll: ( items: Iterable<T> ) => void;
    remove: ( key: string ) => boolean;
    has: ( key: string ) => boolean;
    get: ( key: string ) => T | undefined;
    query: ( text: string, options?: Query<T> ) => Hit<T>[];
    suggest: ( prefix: string, limit?: number ) => string[];
    size: () => number;
    terms: () => number;
    clear: () => void;
};

type Posting = { rows: number[]; weights: number[] };
type Doc<T> = { key: string; item: T; length: number; terms: string[] };

const k1 = 1.2;
const b = 0.75;
const remembered = 512;

export function count ( value: number | undefined, fallback: number ): number {

    return value === undefined || Number.isNaN(value) ? fallback : Math.max(0, Math.trunc(value));

}
function weightOf ( weights: Readonly<Record<string, number>> | undefined, field: string ): number {

    const weight = weights && Object.hasOwn(weights, field) ? weights[field] : 1;

    if ( typeof weight !== "number" || !(weight >= 0) || weight === Number.POSITIVE_INFINITY ) throw new RangeError("not a weight");

    return weight;

}
function textOf ( value: unknown, depth: number ): string {

    if ( typeof value === "string" ) return value;
    if ( typeof value === "number" ) return Number.isFinite(value) ? String(value) : "";
    if ( typeof value === "bigint" ) return String(value);
    if ( Array.isArray(value) && depth < 4 ) return value.map(( one ) => textOf(one, depth + 1)).filter(Boolean).join(" ");

    return "";

}
function editsFor ( term: string, fuzzy: number | undefined ): number {

    const asked = Math.min(3, count(fuzzy, 0));

    return term.length <= 2 ? 0 : term.length <= 5 ? Math.min(asked, 1) : asked;

}
function best<V> ( items: V[], size: number, compare: ( a: V, b: V ) => number ): V[] {

    if ( size <= 0 ) return [];
    if ( size >= items.length || size > 64 ) return items.sort(compare).slice(0, size);

    const out: V[] = [];

    for ( const item of items ) {

        if ( out.length === size && compare(item, out[size - 1] as V) >= 0 ) continue;

        let low = 0;
        let high = out.length;

        while ( low < high ) {

            const middle = (low + high) >> 1;

            if ( compare(out[middle] as V, item) <= 0 ) low = middle + 1;
            else high = middle;

        }

        out.splice(low, 0, item);

        if ( out.length > size ) out.pop();

    }

    return out;

}

export function ordered ( a: string, b: string ): number {

    return a < b ? -1 : a > b ? 1 : 0;

}

export function tokenize ( text: string, minLength = 1 ): string[] {

    return string.tokens(text).filter(( token ) => token.length >= minLength);

}
export function index<T> ( options: Options<T> ): Index<T> {

    const { key } = options;
    const least = Math.max(1, count(options.minLength, 1));
    const read = options.tokenize ?? string.tokens;
    const stop = new Set((options.stop ?? []).flatMap(( word ) => [...read(word)]));
    const fields = options.fields.map(( field ) => ({ field, weight: weightOf(options.weights, field) })).filter(( one ) => one.weight > 0);
    const slots: (Doc<T> | undefined)[] = [];
    const free: number[] = [];
    const places = new Map<string, number>();
    const postings = new Map<string, Posting>();
    const nearby = new Map<string, string[]>();
    let sorted: string[] | undefined;
    let totalLength = 0;
    let score = new Float64Array(0);
    let stamp = new Int32Array(0);
    let matched = new Int32Array(0);
    const stale = (): void => {

        sorted = undefined;
        nearby.clear();

    };
    const cut = ( text: string ): string[] => read(text).filter(( token ) => token.length >= least && !stop.has(token));
    const termsOf = ( item: T ): Map<string, number> => {

        const counts = new Map<string, number>();

        for ( const { field, weight } of fields ) {

            for ( const token of cut(textOf(json.pathGet(item, field), 0)) ) counts.set(token, (counts.get(token) ?? 0) + weight);

        }

        return counts;

    };
    const vocabulary = (): string[] => {

        if ( !sorted ) sorted = [...postings.keys()].sort();

        return sorted;

    };
    const span = ( term: string ): [number, number] => {

        const all = vocabulary();
        const edge = ( inside: boolean ): number => {

            let low = 0;
            let high = all.length;

            while ( low < high ) {

                const middle = (low + high) >> 1;
                const candidate = all[middle] ?? "";

                if ( candidate < term || (inside && candidate.startsWith(term)) ) low = middle + 1;
                else high = middle;

            }

            return low;

        };

        return [edge(false), edge(true)];

    };
    const near = ( term: string, edits: number ): readonly string[] => {

        const name = `${edits}:${term}`;
        const known = nearby.get(name);

        if ( known ) return known;

        const out: string[] = [];

        for ( const candidate of vocabulary() ) {

            if ( candidate !== term && Math.abs(candidate.length - term.length) <= edits * 2 && string.distance(candidate, term, edits) <= edits ) out.push(candidate);

        }

        if ( nearby.size >= remembered ) nearby.clear();

        nearby.set(name, out);

        return out;

    };
    const expand = ( term: string, prefix: boolean, edits: number, cap: number ): readonly string[] => {

        const [low, high] = prefix ? span(term) : [0, 0];
        const out = prefix ? vocabulary().slice(low, Math.min(high, low + cap)) : postings.has(term) ? [term] : [];

        if ( edits === 0 ) return out;

        for ( const candidate of near(term, edits) ) {

            if ( out.length >= cap ) break;
            if ( !prefix || !candidate.startsWith(term) ) out.push(candidate);

        }

        return out;

    };
    const made: Index<T> = {
        size: () => places.size,
        terms: () => postings.size,
        has: ( id ) => places.has(id),
        get: ( id ) => slots[places.get(id) ?? -1]?.item,
        clear: () => {

            slots.length = 0;
            free.length = 0;
            places.clear();
            postings.clear();
            totalLength = 0;
            stale();

        },
        add: ( item ) => {

            const id = key(item);

            if ( typeof id !== "string" || id === "" ) throw new TypeError("not a key");

            made.remove(id);

            const counts = termsOf(item);
            const slot = free.pop() ?? slots.length;
            let length = 0;

            for ( const [term, weight] of counts ) {

                let posting = postings.get(term);

                if ( !posting ) {

                    posting = { rows: [], weights: [] };
                    postings.set(term, posting);
                    stale();

                }

                posting.rows.push(slot);
                posting.weights.push(weight);
                length += weight;

            }

            slots[slot] = { key: id, item, length, terms: [...counts.keys()] };
            places.set(id, slot);
            totalLength += length;

        },
        addAll: ( items ) => {

            for ( const item of items ) made.add(item);

        },
        remove: ( id ) => {

            const slot = places.get(id) ?? -1;
            const doc = slots[slot];

            if ( !doc ) return false;

            for ( const term of doc.terms ) {

                const posting = postings.get(term);

                if ( !posting ) continue;

                const at = posting.rows.indexOf(slot);
                const last = posting.rows.length - 1;

                if ( at < 0 ) continue;

                posting.rows[at] = posting.rows[last] ?? slot;
                posting.weights[at] = posting.weights[last] ?? 0;
                posting.rows.length = last;
                posting.weights.length = last;

                if ( last > 0 ) continue;

                postings.delete(term);
                stale();

            }

            slots[slot] = undefined;
            free.push(slot);
            places.delete(id);
            totalLength = places.size === 0 ? 0 : totalLength - doc.length;

            return true;

        },
        suggest: ( prefix, limit = 10 ) => {

            const typed = read(prefix);
            const last = typed[typed.length - 1] ?? "";

            if ( last === "" ) return [];

            const [low, high] = span(last);
            const found = vocabulary().slice(low, high).map(( term ) => ({ term, rows: postings.get(term)?.rows.length ?? 0 }));

            return best(found, count(limit, 10), ( x, y ) => y.rows - x.rows || ordered(x.term, y.term)).map(( one ) => one.term);

        },
        query: ( text, given = {} ) => {

            const limit = count(given.limit, 20);
            const offset = count(given.offset, 0);
            const cap = Math.max(1, count(given.expansions, Number.POSITIVE_INFINITY));
            const prefix = given.prefix ?? true;
            const wanted = [...new Set(cut(text))];

            if ( wanted.length === 0 || places.size === 0 || limit === 0 ) return [];

            if ( stamp.length < slots.length ) {

                const room = slots.length + (slots.length >> 1) + 16;

                score = new Float64Array(room);
                stamp = new Int32Array(room);
                matched = new Int32Array(room);

            }

            const average = Math.max(1, totalLength / places.size);
            const used = new Set<string>();
            const touched: number[] = [];

            for ( let turn = 0; turn < wanted.length; turn += 1 ) {

                const term = wanted[turn] ?? "";
                const mark = turn + 1;

                for ( const candidate of expand(term, prefix, editsFor(term, given.fuzzy), cap) ) {

                    const posting = postings.get(candidate);

                    if ( !posting ) continue;

                    const { rows, weights } = posting;
                    const idf = Math.log(1 + (places.size - rows.length + 0.5) / (rows.length + 0.5));
                    const exact = candidate === term ? 1 : 0.6;

                    used.add(candidate);

                    for ( let at = 0; at < rows.length; at += 1 ) {

                        const slot = rows[at] ?? 0;
                        const weight = weights[at] ?? 0;
                        const tf = (weight * (k1 + 1)) / (weight + k1 * (1 - b + (b * (slots[slot]?.length ?? 0)) / average));
                        const seen = stamp[slot] ?? 0;

                        score[slot] = (score[slot] ?? 0) + idf * tf * exact;

                        if ( seen === mark ) continue;
                        if ( seen === 0 ) touched.push(slot);

                        stamp[slot] = mark;
                        matched[slot] = (matched[slot] ?? 0) + 1;

                    }

                }

            }

            const kept: number[] = [];
            const totals: number[] = [];

            for ( const slot of touched ) {

                const total = score[slot] ?? 0;
                const terms = matched[slot] ?? 0;

                score[slot] = 0;
                stamp[slot] = 0;
                matched[slot] = 0;

                if ( given.all && terms < wanted.length ) continue;

                kept.push(slot);
                totals.push(total);

            }

            const order: number[] = [];

            for ( let at = 0; at < kept.length; at += 1 ) {

                const doc = slots[kept[at] ?? -1];

                if ( !doc || (given.filter && !given.filter(doc.item)) ) continue;

                const lift = given.boost ? given.boost(doc.item) : 1;

                if ( lift !== 1 && lift >= 0 && lift < Number.POSITIVE_INFINITY ) totals[at] = (totals[at] ?? 0) * lift;

                order.push(at);

            }

            const keyOf = ( at: number ): string => slots[kept[at] ?? -1]?.key ?? "";

            return best(order, offset + limit, ( x, y ) => (totals[y] ?? 0) - (totals[x] ?? 0) || ordered(keyOf(x), keyOf(y)))
                .slice(offset)
                .flatMap(( at ) => {

                    const doc = slots[kept[at] ?? -1];

                    return doc ? [{ key: doc.key, item: doc.item, score: Math.round((totals[at] ?? 0) * 1000) / 1000, terms: doc.terms.filter(( term ) => used.has(term)).sort() }] : [];

                });

        },
    };

    return made;

}
