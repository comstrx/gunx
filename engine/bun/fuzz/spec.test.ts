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

function outcome ( run: () => string ): string {

    try {

        return run();

    } catch ( caught ) {

        return (caught as { reason?: string }).reason ?? "thrown";

    }

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

        const compiled = spec.compile(spec.plan({ name: "s", role: "r", screens: [spec.screen("home", { path: "/", title: "H" })] }));
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

            const built = spec.plan({ name: "s", role: "r", screens: screens.map(( item ) => spec.screen(item.name, { path: `/${item.pieces.join("/")}`, title: item.name, menu: item.menu })) });
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
    it("a rich surface survives its wire with the same meaning, the wire carries no default, and any damage to it is refused as a spec fault", () => {

        const name = fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/);
        const effect: fc.Arbitrary<spec.Effect> = fc.letrec<{ effect: spec.Effect }>(( tie ) => ({
            effect: fc.oneof(
                { depthSize: "small", maxDepth: 2 },
                name.map(( key ) => spec.set(`signals.${key}`, 1)),
                name.map(( key ) => spec.toggle(`signals.${key}`)),
                name.map(( key ) => spec.clear(`signals.${key}`)),
                name.map(( key ) => spec.emit(`topic.${key}`)),
                fc.tuple(fc.integer({ min: 0, max: 50 }), fc.array(tie("effect"), { maxLength: 2 }), fc.boolean()).map(([ms, effects, latest]) => (latest ? spec.debounce(ms, effects) : spec.after(ms, effects))),
                fc.tuple(name, fc.array(tie("effect"), { maxLength: 2 })).map(([key, effects]) => spec.branch(`signals.${key} = 1`, effects)),
            ),
        })).effect;
        const effects = fc.array(effect, { maxLength: 3 });
        const feature = fc.record({ id: name, size: fc.option(fc.integer(), { nil: undefined }), load: effects, when: fc.boolean() });
        const screen = fc.record({ name, menu: fc.boolean(), auth: fc.boolean(), index: fc.boolean(), query: fc.uniqueArray(name, { maxLength: 2 }), flow: fc.uniqueArray(name, { maxLength: 3 }), wide: fc.boolean(), features: fc.uniqueArray(feature, { maxLength: 3, selector: ( item ) => item.id }), leave: effects, nest: fc.integer({ min: 0, max: 3 }) });

        fc.assert(fc.property(fc.uniqueArray(screen, { minLength: 1, maxLength: 5, selector: ( item ) => item.name }), effects, fc.jsonValue(), fc.nat(), ( screens, enter, junk, pick ) => {

            const made = screens.map(( item ) => spec.screen(item.name, {
                menu: item.menu,
                auth: item.auth,
                index: item.index,
                query: item.query,
                flow: item.flow,
                settings: item.wide ? { width: "wide" } : {},
                on: { leave: item.leave.filter(( one ) => !("after" in one)) },
                layout: [Array.from({ length: item.nest }).reduce<spec.Block>(( inner ) => spec.block("stack", {}, [inner]), spec.block("stack", {}, item.features.map(( one ) => spec.feature("rows", { id: one.id, settings: one.size === undefined ? {} : { size: one.size }, on: { load: one.load }, when: one.when ? "signals.on = 1" : undefined }))))],
            }));
            const compiled = spec.compile(spec.plan({ name: "s", role: "r", screens: made, on: { enter } }));
            const text = JSON.stringify(spec.serialize(compiled));
            const wire = JSON.parse(text) as { screens: Record<string, unknown>[] };
            const revived = spec.revive(wire);

            expect(revived.screens).toEqual(compiled.screens.map(( one ) => ({ ...one, features: one.features.map(( held ) => ({ ...held, manifest: undefined })) })));
            expect(revived.surface.on).toEqual(compiled.surface.on);
            expect(revived.surface.screens.map(( one ) => one.name)).toEqual(compiled.surface.screens.map(( one ) => one.name));
            expect(/"(?:access|query|signals|flow|triggers|params|ids|watches|emits|listens|children|features|blocks)":\[\]|"(?:settings|ports|watch|on|form|props|title|description)":\{\}|"(?:menu|index)":true|"auth":false|"role":"any"/.test(JSON.stringify(wire.screens))).toBe(false);
            expect(JSON.stringify(spec.serialize(revived))).toBe(text);

            const target = wire.screens[pick % wire.screens.length] as Record<string, unknown>;
            const keys = Object.keys(target);
            const key = keys[pick % keys.length] as string;
            const broken = { ...wire, screens: wire.screens.map(( one ) => (one === target ? { ...one, [key]: junk } : one)) };

            expect([`${wire.screens.length} screens`, "spec.revive"]).toContain(outcome(() => `${spec.revive(broken).screens.length} screens`));

            for ( const artifact of [junk, { version: spec.version, entry: "s", surfaces: junk }, { version: spec.version, entry: "s", surfaces: { s: junk } }, { version: spec.version, entry: "s", surfaces: { s: { id: "s", config: {}, messages: {}, brand: {}, links: {}, compiled: junk } } }] ) expect(["booted", "spec.artifact", "spec.revive"]).toContain(outcome(() => (spec.boot(artifact, { sinks: [] }).entry === "s" ? "booted" : "lost")));

        }), { numRuns: 600 });

    });
    it("a name resolves from anywhere in a tree to a surface that carries it, a full address always to itself, and nothing else resolves", () => {

        const name = fc.stringMatching(/^[a-z][a-z0-9]{0,3}$/);
        const leaf = (): spec.Surface => spec.surface({ schema: [spec.screen("home", { path: "/" })] });
        const tree = fc.dictionary(name, fc.oneof(fc.constant("leaf" as const), fc.dictionary(name, fc.oneof(fc.constant("leaf" as const), fc.dictionary(name, fc.constant("leaf" as const), { minKeys: 1, maxKeys: 3 })), { minKeys: 1, maxKeys: 3 })), { minKeys: 1, maxKeys: 4 });
        const grown = ( given: Record<string, unknown> ): spec.Groups => Object.fromEntries(Object.keys(given).map(( key ) => [key, given[key] === "leaf" ? leaf() : grown(given[key] as Record<string, unknown>)]));

        fc.assert(fc.property(tree, fc.array(name, { minLength: 1, maxLength: 3 }), fc.nat(), fc.constantFrom(".", ":"), ( shape, written, pick, mark ) => {

            const made = spec.define(grown(shape));
            const from = made.names[pick % made.names.length] as string;
            const found = spec.locate(made, written.join(mark), from);

            for ( const full of made.names ) {

                expect(spec.locate(made, full).name).toBe(full);
                expect(spec.locate(made, full.replaceAll(".", ":"), full).name).toBe(full);
                expect(spec.locate(made, full.replaceAll(".", ":"), from).name?.endsWith(full)).toBe(true);

            }

            const tail = written.join(".");
            const carrying = made.names.filter(( one ) => one === tail || one.endsWith(`.${tail}`));

            expect(found.name === undefined ? ["surface.unknown", "surface.ambiguous"].includes(found.issue.rule) : carrying.includes(found.name)).toBe(true);
            expect(found.name !== undefined || carrying.length !== 1).toBe(true);

        }), { numRuns: 1500 });

    });

});
