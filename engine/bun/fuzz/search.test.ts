import { describe, expect, test as it } from "bun:test";
import * as search from "engine/search";
import * as string from "engine/string";
import * as fc from "fast-check";

type Doc = { id: string; title: string; body: string; tags: string[] };
type Act = { kind: "add"; doc: Doc } | { kind: "remove"; id: string } | { kind: "clear" };
type Scalar = string | number | boolean | null;
type Row = { a: Scalar; b: Scalar[]; n: { c: Scalar } };

const k1 = 1.2;
const b = 0.75;
const words = ["red", "blue", "shoe", "shoes", "run", "runner", "sport", "tea", "tent", "cairo"] as const;
const word = fc.constantFrom(...words);
const text = fc.array(word, { maxLength: 4 }).map(( parts ) => parts.join(" "));
const doc: fc.Arbitrary<Doc> = fc.record({ id: fc.constantFrom("1", "2", "3", "4", "5", "6"), title: text, body: text, tags: fc.array(word, { maxLength: 2 }) });
const act: fc.Arbitrary<Act> = fc.oneof(
    { weight: 5, arbitrary: fc.record({ kind: fc.constant("add" as const), doc }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("remove" as const), id: fc.constantFrom("1", "2", "3", "4", "5", "6", "9") }) },
    { weight: 1, arbitrary: fc.constant<Act>({ kind: "clear" }) },
);
const scalar: fc.Arbitrary<Scalar> = fc.oneof(fc.constantFrom("Red", "blue", "", "10", "9.5", "x y"), fc.integer({ min: -3, max: 12 }), fc.constant(9.5), fc.boolean(), fc.constant(null));
const row: fc.Arbitrary<Row> = fc.record({ a: scalar, b: fc.array(scalar, { maxLength: 3 }), n: fc.record({ c: scalar }) });
const value = fc.constantFrom("red", "Blue", "", "10", "9.5", "+10", "1e1", "x", "true", "null", "٩");
const operator = fc.constantFrom<search.Operator>(":", "=", "!=", ">", ">=", "<", "<=");
const weights = { title: 2, body: 1, tags: 1.5 };

function termsOf ( one: Doc ): Map<string, number> {

    const counts = new Map<string, number>();

    for ( const [field, weight] of Object.entries(weights) as [keyof typeof weights, number][] ) {

        const raw = field === "tags" ? one.tags.join(" ") : one[field];

        for ( const token of string.tokens(raw) ) counts.set(token, (counts.get(token) ?? 0) + weight);

    }

    return counts;

}
function numeric ( given: string ): number | undefined {

    const trimmed = string.asciiDigits(given.trim());

    if ( !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed) ) return undefined;

    const read = Number(trimmed);

    return Number.isFinite(read) ? read : undefined;

}
function compare ( actual: Scalar, wanted: string ): number | undefined {

    if ( actual === null ) return undefined;

    const number = numeric(wanted);

    if ( typeof actual === "number" ) return number === undefined ? undefined : Math.sign(actual - number);

    const left = typeof actual === "boolean" ? String(actual) : actual;
    const read = number === undefined ? undefined : numeric(left);

    if ( read !== undefined && number !== undefined ) return Math.sign(read - number);

    const folded = string.fold(wanted);
    const own = string.fold(left);

    return own < folded ? -1 : own > folded ? 1 : 0;

}
function holds ( actual: Scalar, operator: search.Operator, wanted: string ): boolean {

    if ( actual === null ) return false;
    if ( operator === ":" ) return string.fold(wanted) !== "" && string.fold(String(actual)).includes(string.fold(wanted));

    const order = compare(actual, wanted);

    if ( operator === "=" || operator === "!=" ) return order === 0;
    if ( operator === ">" ) return order === 1;
    if ( operator === "<" ) return order === -1;
    if ( operator === ">=" ) return (order ?? -1) >= 0;

    return (order ?? 1) <= 0;

}

describe("fuzz search", () => {

    it("queries parse without throwing, highlights keep every character and hit segments carry a needle", () => {

        fc.assert(fc.property(fc.string({ maxLength: 80 }), fc.string({ maxLength: 20 }), ( given, query ) => {

            search.parse(given);

            const segments = search.highlight(given, query);
            const needles = string.tokens(query).map(( needle ) => needle.replace(/ς/g, "σ"));

            expect(segments.map(( segment ) => segment.text).join("")).toBe(given);

            for ( const segment of segments ) if ( segment.hit ) expect(needles.some(( needle ) => string.fold(segment.text).replace(/ς/g, "σ").includes(needle))).toBe(true);

            if ( segments.length > 1 ) for ( let at = 1; at < segments.length; at += 1 ) expect(segments[at]?.hit).not.toBe(segments[at - 1]?.hit);

        }), { numRuns: 4000 });

    });
    it("an index scores exact queries like a bm25 reference over whatever it holds after adds, replacements, removals and clears", () => {

        fc.assert(fc.property(fc.array(act, { minLength: 1, maxLength: 12 }), fc.array(word, { minLength: 1, maxLength: 3 }), fc.boolean(), ( acts, asked, all ) => {

            const made = search.index<Doc>({ fields: ["title", "body", "tags"], key: ( one ) => one.id, weights });
            const held = new Map<string, Doc>();

            for ( const step of acts ) {

                if ( step.kind === "add" ) {

                    made.add(step.doc);
                    held.set(step.doc.id, step.doc);

                } else if ( step.kind === "remove" ) {

                    expect(made.remove(step.id)).toBe(held.delete(step.id));

                } else {

                    made.clear();
                    held.clear();

                }

                expect(made.size()).toBe(held.size);
                expect(made.terms()).toBe(new Set([...held.values()].flatMap(( one ) => [...termsOf(one).keys()])).size);

            }

            for ( const [id, one] of held ) expect([made.has(id), made.get(id)]).toEqual([true, one]);

            const docs = [...held.values()].map(( one ) => ({ one, terms: termsOf(one) }));
            const total = docs.reduce(( sum, { terms } ) => sum + [...terms.values()].reduce(( inner, weight ) => inner + weight, 0), 0);
            const average = Math.max(1, total / Math.max(1, docs.length));
            const wanted = [...new Set(asked)];
            const expected = docs.flatMap(({ one, terms }) => {

                const length = [...terms.values()].reduce(( sum, weight ) => sum + weight, 0);
                let score = 0;
                let matched = 0;

                for ( const term of wanted ) {

                    const weight = terms.get(term);

                    if ( weight === undefined ) continue;

                    const rows = docs.filter(( other ) => other.terms.has(term)).length;
                    const idf = Math.log(1 + (docs.length - rows + 0.5) / (rows + 0.5));
                    const tf = (weight * (k1 + 1)) / (weight + k1 * (1 - b + (b * length) / average));

                    score += idf * tf;
                    matched += 1;

                }

                if ( matched === 0 || (all && matched < wanted.length) ) return [];

                return [{ key: one.id, score: Math.round(score * 1000) / 1000, terms: wanted.filter(( term ) => terms.has(term)).sort() }];

            }).sort(( x, y ) => y.score - x.score || (x.key < y.key ? -1 : 1));
            const hits = made.query(asked.join(" "), { prefix: false, all, limit: 100 });

            expect(hits.map(( hit ) => [hit.key, hit.score, hit.terms])).toEqual(expected.map(( hit ) => [hit.key, hit.score, hit.terms]));

            for ( const hit of hits ) expect(hit.item).toBe(held.get(hit.key) as Doc);

            const prefixed = made.query(asked.join(" "), { limit: 100 });

            for ( const hit of hits ) expect(prefixed.some(( other ) => other.key === hit.key)).toBe(true);

            expect(prefixed.length).toBeGreaterThanOrEqual(hits.length);

        }), { numRuns: 1500 });

    });
    it("filters agree with a scalar reference across operators, negation, lists and nested paths", () => {

        fc.assert(fc.property(fc.array(row, { maxLength: 6 }), fc.constantFrom("a", "b", "n.c", "missing"), operator, value, fc.boolean(), ( rows, field, given, wanted, negated ) => {

            const filters: search.Filter[] = [{ field, operator: given, value: wanted, negated }];
            const read = ( one: Row ): Scalar[] => (field === "a" ? [one.a] : field === "b" ? one.b : field === "n.c" ? [one.n.c] : []);
            const expected = rows.filter(( one ) => {

                const matched = read(one).some(( actual ) => holds(actual, given, wanted));

                return matched !== ((given === "!=") !== negated);

            });

            expect(search.filter(rows, filters)).toEqual(expected);
            expect(rows.filter(search.matcher(filters))).toEqual(expected);

            const parsed = search.parse(`${negated ? "-" : ""}${field}${given}${wanted}`);

            if ( wanted !== "" && !wanted.includes(" ") ) expect(parsed.filters).toEqual(filters);

        }), { numRuns: 4000 });

    });
    it("facets count what a map counts, and suggestions come in row-count then text order", () => {

        fc.assert(fc.property(fc.array(row, { maxLength: 8 }), fc.constantFrom("a", "b", "n.c"), fc.integer({ min: -1, max: 6 }), ( rows, field, limit ) => {

            const counts = new Map<string, number>();

            for ( const one of rows ) {

                const values = field === "a" ? [one.a] : field === "b" ? one.b : [one.n.c];
                const seen = new Set<string>();

                for ( const actual of values ) {

                    const label = actual === null ? "" : String(actual);

                    if ( label === "" || seen.has(label) ) continue;

                    seen.add(label);
                    counts.set(label, (counts.get(label) ?? 0) + 1);

                }

            }

            const expected = [...counts].map(([label, total]) => ({ value: label, count: total })).sort(( x, y ) => y.count - x.count || (x.value < y.value ? -1 : x.value > y.value ? 1 : 0)).slice(0, Math.max(0, limit));

            expect(search.facets(rows, field, limit)).toEqual(expected);

        }), { numRuns: 3000 });
        fc.assert(fc.property(fc.array(doc, { maxLength: 8 }), fc.constantFrom("t", "s", "r", "c", "b", "z", ""), fc.integer({ min: 0, max: 5 }), ( docs, prefix, limit ) => {

            const made = search.index<Doc>({ fields: ["title", "body", "tags"], key: ( one ) => one.id, weights });
            const held = new Map<string, Doc>();

            for ( const one of docs ) {

                made.add(one);
                held.set(one.id, one);

            }

            const rows = new Map<string, number>();

            for ( const one of held.values() ) for ( const term of termsOf(one).keys() ) rows.set(term, (rows.get(term) ?? 0) + 1);

            const expected = prefix === "" ? [] : [...rows].filter(([term]) => term.startsWith(prefix)).sort(( x, y ) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, limit).map(([term]) => term);

            expect(made.suggest(prefix, limit)).toEqual(expected);

        }), { numRuns: 1500 });

    });

});
