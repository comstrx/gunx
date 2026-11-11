import { describe, expect, test as it } from "bun:test";
import * as spec from "engine/spec";
import * as validate from "engine/validate";
import * as fc from "fast-check";

const runs = 5_000;
const context = { ...spec.empty(), form: { a: 1, b: "x", c: [1, 2], d: null } };
const paths = ["form.a", "form.b", "form.c", "form.d", "form.zz"] as const;
const values: Record<string, unknown> = { "form.a": 1, "form.b": "x", "form.c": [1, 2], "form.d": null, "form.zz": undefined };

type Tree = { kind: "test"; path: string; op: string; value: number | string } | { kind: "all"; parts: Tree[] } | { kind: "any"; parts: Tree[] } | { kind: "not"; part: Tree };

const leaf: fc.Arbitrary<Tree> = fc.record({ kind: fc.constant("test" as const), path: fc.constantFrom(...paths), op: fc.constantFrom("=", "!=", ">", "<", ">=", "<=", " in ", " has "), value: fc.oneof(fc.integer({ min: -3, max: 3 }), fc.constantFrom("x", "y", "zz")) });
const tree: fc.Arbitrary<Tree> = fc.letrec<{ tree: Tree }>(( tie ) => ({ tree: fc.oneof({ depthSize: "small", maxDepth: 3 }, leaf, fc.record({ kind: fc.constant("all" as const), parts: fc.array(tie("tree"), { minLength: 2, maxLength: 3 }) }), fc.record({ kind: fc.constant("any" as const), parts: fc.array(tie("tree"), { minLength: 2, maxLength: 3 }) }), fc.record({ kind: fc.constant("not" as const), part: tie("tree") })) })).tree;

function same ( actual: unknown, wanted: number | string ): boolean {

    if ( actual === wanted ) return true;
    if ( typeof wanted === "number" ) return typeof actual === "string" && actual.trim() !== "" && Number(actual) === wanted;

    return typeof actual === "number" && String(actual) === wanted;

}
function judge ( node: Tree ): boolean {

    if ( node.kind === "all" ) return node.parts.every(judge);
    if ( node.kind === "any" ) return node.parts.some(judge);
    if ( node.kind === "not" ) return !judge(node.part);

    const actual = values[node.path];
    const amount = typeof actual === "number" ? actual : typeof actual === "string" && actual.trim() !== "" ? Number(actual) : Number.NaN;

    if ( node.op === "=" ) return same(actual, node.value);
    if ( node.op === "!=" ) return !same(actual, node.value);
    if ( node.op === " in " ) return same(actual, node.value);
    if ( node.op === " has " ) return Array.isArray(actual) ? actual.some(( item ) => same(item, node.value)) : typeof actual === "string" && actual.includes(String(node.value));
    if ( typeof node.value !== "number" ) return false;
    if ( Number.isNaN(amount) ) return false;
    if ( node.op === ">" ) return amount > node.value;
    if ( node.op === "<" ) return amount < node.value;
    if ( node.op === ">=" ) return amount >= node.value;

    return amount <= node.value;

}
function print ( node: Tree ): string {

    if ( node.kind === "test" ) return `${node.path}${node.op}${typeof node.value === "string" ? `'${node.value}'` : String(node.value)}`;
    if ( node.kind === "not" ) return `!(${print(node.part)})`;

    return `(${node.parts.map(print).join(node.kind === "all" ? " & " : " | ")})`;

}

describe("fuzz spec", () => {

    it("conditions parse from any text, evaluate without throwing and stay valid shapes", () => {

        fc.assert(fc.property(fc.string({ maxLength: 60 }), ( text ) => {

            const made = spec.when(text);

            expect(typeof spec.evaluate(made, context)).toBe("boolean");
            spec.pathsOf(made);

        }), { numRuns: runs });
        fc.assert(fc.property(fc.constantFrom(...paths), fc.constantFrom("=", "!=", ">", "<", ">=", "<=", " in ", " has ", " like "), fc.oneof(fc.integer({ min: -5, max: 5 }), fc.stringMatching(/^[a-z]{1,4}$/)), ( path, operator, value ) => {

            const made = spec.when(`${path}${operator}${String(value)}`);

            expect(validate.check(spec.whenShape, made).ok).toBe(true);
            expect(typeof spec.evaluate(made, context)).toBe("boolean");

        }), { numRuns: runs });

    });
    it("a printed condition tree parses back and evaluates exactly as a plain model", () => {

        fc.assert(fc.property(tree, ( node ) => {

            const text = print(node);
            const made = spec.when(text);

            expect(validate.check(spec.whenShape, made).ok).toBe(true);
            expect(spec.evaluate(made, context)).toBe(judge(node));
            expect(spec.evaluate(spec.not(made), context)).toBe(!judge(node));
            expect(spec.evaluate(spec.when(made), context)).toBe(judge(node));

        }), { numRuns: runs });

    });
    it("the runtime stores and reads back any json under any safe namespaced path, and refuses the rest", () => {

        const compiled = spec.compile(spec.surface({ name: "s", role: "r", screens: [spec.screen({ name: "home", path: "/", title: "H" })] }));
        const made = spec.runtime(compiled);
        const key = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);

        fc.assert(fc.property(fc.constantFrom("form", "signals", "query", "device", "settings", "event", "params"), fc.array(key, { minLength: 1, maxLength: 4 }), fc.jsonValue({ maxDepth: 2 }), ( head, keys, value ) => {

            const path = [head, ...keys].join(".");
            const held = head === "params" ? (typeof value === "string" ? value : "x") : head === "query" && keys.length === 1 ? (typeof value === "string" ? value : "y") : value;

            made.set(path, held);
            expect(made.get(path)).toEqual(held as never);
            expect(Object.hasOwn(made.get(head) as object, keys[0] as string)).toBe(true);
            made.set(head, undefined);
            expect(made.get(head)).toEqual({});

        }), { numRuns: 2000 });
        fc.assert(fc.property(fc.oneof(fc.string({ maxLength: 20 }), fc.constantFrom(".form.a", "form..a", "form.", "..", ".", "signals.a..b")).filter(( text ) => !/^(?:params|query|signals|form|user|device|settings|locale|event|flow)(?:\.[^.]+)*$/.test(text)), ( path ) => {

            expect(() => made.set(path, 1)).toThrow();

        }), { numRuns: 2000 });

    });
    it("every screen path matches itself with its own parameters, fixed paths beat moving ones, and serialize revives the same screens", () => {

        const name = fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/);
        const piece = fc.oneof(fc.stringMatching(/^[a-z][a-z0-9-]{0,5}$/), fc.stringMatching(/^[a-z][a-z0-9]{0,3}$/).map(( key ) => `{${key}}`));
        const screen = fc.record({ name, pieces: fc.array(piece, { maxLength: 3 }), menu: fc.boolean() });

        fc.assert(fc.property(fc.uniqueArray(screen, { minLength: 1, maxLength: 6, selector: ( item ) => item.name }), ( screens ) => {

            const built = spec.surface({ name: "s", role: "r", screens: screens.map(( item ) => spec.screen({ name: item.name, path: `/${item.pieces.join("/")}`, title: item.name, menu: item.menu })) });
            const compiled = spec.compile(built);

            expect(compiled.issues.every(( issue ) => issue.rule === "path.taken" || issue.rule === "path.param")).toBe(true);

            for ( const found of compiled.screens ) {

                const filled = found.path.replace(/\{[a-z0-9]+\}/g, "v");
                const hit = spec.match(compiled, filled);

                expect(hit).toBeDefined();
                expect(hit?.screen.path === found.path || compiled.screens.indexOf(hit?.screen as spec.CompiledScreen) < compiled.screens.indexOf(found)).toBe(true);
                expect(Object.keys(hit?.params ?? {}).sort()).toEqual([...new Set(hit?.screen.params)].sort());

            }

            const fixed = compiled.screens.filter(( found ) => found.params.length === 0 && !found.path.includes("*"));

            expect(compiled.screens.slice(0, fixed.length)).toEqual(fixed);
            expect(spec.revive(JSON.parse(JSON.stringify(spec.serialize(compiled)))).screens).toEqual(compiled.screens);
            expect(spec.menuOf(compiled, "en").map(( item ) => item.name)).toEqual(screens.filter(( item ) => item.menu && !item.pieces.some(( part ) => part.startsWith("{"))).map(( item ) => item.name));

        }), { numRuns: 1000 });

    });

});
