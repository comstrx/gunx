import { describe, expect, test as it } from "bun:test";
import * as json from "engine/json";

type Ring = { a: number; self?: Ring };

class Box {

    size = 1;

}

function ring (): Ring {

    const made: Ring = { a: 1 };

    made.self = made;

    return made;

}

describe("json", () => {

    it("guards, safe parse and stable stringify", () => {

        expect(json.isRecord({}) && !json.isRecord([]) && !json.isRecord(null)).toBe(true);
        expect(json.isPlain(Object.create(null)) && !json.isPlain(new Date())).toBe(true);
        expect(json.isScalar(1) && json.isScalar(null) && !json.isScalar(Number.NaN)).toBe(true);
        expect(json.isJson({ a: [1, "b", null, { c: true }] }) && !json.isJson({ a: new Date() })).toBe(true);
        expect([null, undefined, [], {}, "x", 1, true, Number.NaN, () => 0].map(json.kindOf)).toEqual([
            "null", "undefined", "list", "record", "string", "number", "boolean", "other", "other",
        ]);
        expect(json.parse('{"a":1}')).toEqual({ a: 1 });
        expect(json.parse("{bad")).toBeUndefined();
        expect(json.parse('{"__proto__":{"x":1},"a":1}')).toEqual({ a: 1 });
        expect(json.safeKey("constructor")).toBe(false);
        expect(json.stringify({ b: 1, a: { d: 2, c: 3 } }, { stable: true })).toBe('{"a":{"c":3,"d":2},"b":1}');
        expect(json.stringify({ a: 1 }, { pretty: true })).toBe('{\n  "a": 1\n}');
        expect(json.stringify(undefined)).toBe("null");

    });
    it("objects are shaped without mutation", () => {

        const base = { a: 1, b: { c: 2, d: [1, 2] }, e: undefined, f: null, g: "" };

        expect(json.pick(base, ["a", "f"])).toEqual({ a: 1, f: null });
        expect(json.omit(base, ["b", "e"])).toEqual({ a: 1, f: null, g: "" });
        expect(json.compact(base)).toEqual({ a: 1, b: { c: 2, d: [1, 2] }, f: null, g: "" });
        expect(json.prune({ a: { b: null, c: {} }, d: [null, 1], e: "" })).toEqual({ d: [1] });
        expect(json.mapValues({ a: 1, b: 2 }, ( value ) => value * 2)).toEqual({ a: 2, b: 4 });
        expect(json.deepMerge({ a: { b: 1, c: 1 } }, { a: { c: 2 }, d: 3 })).toEqual({ a: { b: 1, c: 2 }, d: 3 });
        expect(json.deepMerge({ a: [1] }, { a: [2] })).toEqual({ a: [2] });
        expect(json.deepMerge({}, { __proto__: { x: 1 } } as Record<string, unknown>)).toEqual({});
        expect(json.pathGet(base, "b.d.1")).toBe(2);
        expect(json.pathGet(base, "b.x.y")).toBeUndefined();
        expect(json.pathGet(base, "a.__proto__")).toBeUndefined();
        expect(json.pathSet(base, "b.c", 9).b.c).toBe(9);
        expect(base.b.c).toBe(2);
        expect(json.pathSet({}, "x.y.z", 1)).toEqual({ x: { y: { z: 1 } } });
        expect(json.pathSet({ a: 1 }, "__proto__.x", 1)).toEqual({ a: 1 });

        const cloned = json.clone(base);

        expect(cloned).toEqual(base);
        expect(cloned.b).not.toBe(base.b);

    });
    it("walk, flatten, diff and equality", () => {

        const seen: string[] = [];

        json.walk({ a: [1, { b: 2 }] }, ( _, path ) => { seen.push(path.join(".")); });
        expect(seen).toEqual(["", "a", "a.0", "a.1", "a.1.b"]);
        expect(json.flatten({ a: { b: 1, c: [1, 2] }, d: {} })).toEqual({ "a.b": 1, "a.c.0": 1, "a.c.1": 2, d: {} });
        expect(json.unflatten({ "a.b": 1, "a.c": 2, x: 3 })).toEqual({ a: { b: 1, c: 2 }, x: 3 });
        expect(json.unflatten({ "__proto__.x": 1 })).toEqual({});
        expect(json.equal({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
        expect(json.equal({ a: 1 }, { a: 1, b: undefined })).toBe(false);
        expect(json.equal(new Date(1), new Date(1))).toBe(true);
        expect(json.diff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })).toEqual([{ path: "b", kind: "changed", from: 2, to: 3 }, { path: "c", kind: "added", from: undefined, to: 4 }]);
        expect(json.has({ a: { b: null } }, "a.b") && !json.has({ a: {} }, "a.b") && json.has({ a: [1] }, "a.0")).toBe(true);
        expect(json.unset({ a: { b: 1, c: 2 } }, "a.b")).toEqual({ a: { c: 2 } });
        expect(json.isEmpty({}) && json.isEmpty([]) && json.isEmpty("") && !json.isEmpty(0)).toBe(true);

    });
    it("key cases, defaults and typed reads", () => {

        expect(json.camelKeys({ first_name: { last_name: [{ x_y: 1 }] } })).toEqual({ firstName: { lastName: [{ xY: 1 }] } });
        expect(json.snakeKeys({ firstName: 1 })).toEqual({ first_name: 1 });
        expect(json.kebabKeys({ firstName: 1 })).toEqual({ "first-name": 1 });
        expect(json.renameKeys({ a: 1, b: 2 }, { a: "z" })).toEqual({ z: 1, b: 2 });
        expect(json.filterKeys({ a: 1, b: 2 }, ( key ) => key === "a")).toEqual({ a: 1 });
        expect(json.filterValues({ a: 1, b: null }, ( value ) => value !== null)).toEqual({ a: 1 });
        expect(json.defaults({ a: undefined, b: 2 }, { a: 1, b: 1, c: 1 })).toEqual({ a: 1, b: 2, c: 1 });
        expect(json.invert({ a: "x", b: 2 })).toEqual({ x: "a", "2": "b" });
        expect(json.keysDeep({ a: { b: 1 }, c: [1] })).toEqual(["a", "a.b", "c"]);
        expect(json.size([1, 2]) + json.size({ a: 1 }) + json.size("abc") + json.size(1)).toBe(6);

        const body = { user: { name: "Ann", age: "30", active: "true", tags: ["a"], meta: { k: 1 } } };

        expect(json.getText(body, "user.name")).toBe("Ann");
        expect(json.getText(body, "user.missing", "-")).toBe("-");
        expect(json.getNumber(body, "user.age")).toBe(30);
        expect(json.getNumber(body, "user.name", 7)).toBe(7);
        expect(json.getBoolean(body, "user.active")).toBe(true);
        expect(json.getList(body, "user.tags")).toEqual(["a"]);
        expect(json.getRecord(body, "user.meta")).toEqual({ k: 1 });
        expect(json.getAt(body, "user.meta.k", 0)).toBe(1);

    });
    it("csv quotes, splits and round trips", () => {

        const rows = [{ a: "x,y", b: 'say "hi"' }, { a: "line\nbreak", b: 1, c: null }];
        const text = json.toCsv(rows);

        expect(text.split("\r\n")[0]).toBe("a,b,c");
        expect(json.fromCsv(text)).toEqual([{ a: "x,y", b: 'say "hi"', c: "" }, { a: "line\nbreak", b: "1", c: "" }]);
        expect(json.fromCsv("\uFEFFa;b\n1;2", { separator: ";" })).toEqual([{ a: "1", b: "2" }]);
        expect(json.fromCsv("1,2\n3,4", { header: false })).toEqual([{ "0": "1", "1": "2" }, { "0": "3", "1": "4" }]);
        expect(json.toCsv([{ a: 1 }], { header: false, columns: ["a", "b"] })).toBe("1,");

    });
    it("keys map at the top level only and paths split on dots keeping brackets", () => {

        expect(json.mapKeys({ a: 1, b: { c: 2 } }, ( key ) => key.toUpperCase())).toEqual({ A: 1, B: { c: 2 } });
        expect(json.pathKeys("a.b[0].c")).toEqual(["a", "b[0]", "c"]);
        expect(json.pathKeys(["x", "y"])).toEqual(["x", "y"]);

    });
    it("stringify is total, parse refuses poison in any spelling", () => {

        const shared = { x: 1 };

        expect(json.stringify(ring())).toBe('{"a":1,"self":"[Circular]"}');
        expect(json.stringify(ring(), { stable: true })).toBe('{"a":1,"self":"[Circular]"}');
        expect(json.stringify({ n: 10n })).toBe('{"n":"10"}');
        expect(json.stringify({ b: 1, at: new Date(0) }, { stable: true })).toBe('{"at":"1970-01-01T00:00:00.000Z","b":1}');
        expect(json.stringify({ b: [{ d: 1, c: 2 }], a: undefined }, { stable: true })).toBe('{"b":[{"c":2,"d":1}]}');
        expect(json.stringify({ b: shared, a: shared }, { stable: true })).toBe('{"a":{"x":1},"b":{"x":1}}');
        expect(json.stringify({ a: 1 }, { pretty: 4 })).toBe('{\n    "a": 1\n}');
        expect(json.stringify(() => 0)).toBe("null");
        expect(json.parse('{"\\u005f_proto__":{"x":1},"a":1}')).toEqual({ a: 1 });
        expect(json.parse('{"a":{"__PROTO__":1,"__proto__":{"x":1}}}')).toEqual({ a: { __PROTO__: 1 } });
        expect(json.parse('"__proto__"')).toBe("__proto__");
        expect(json.parse("")).toBeUndefined();
        expect(json.kindOf(Number.POSITIVE_INFINITY)).toBe("other");
        expect(json.isJson(ring()) || json.isJson([undefined]) || json.isJson(new Box())).toBe(false);
        expect(json.isJson({ a: undefined, b: [shared, shared] })).toBe(true);

    });
    it("clone copies what the host cannot and keeps cycles", () => {

        const date = new Date(5);
        const deep = { list: [1, { at: date }], map: new Map([["k", { v: 1 }]]), set: new Set([1]) };
        const copy = json.clone(deep);
        const wired = { run: () => 1, inner: { a: 1 }, at: date, map: new Map([["k", { v: 1 }]]), set: new Set([{ v: 2 }]), box: new Box() };
        const twin = json.clone(wired);
        const looped = json.clone({ ...ring(), run: () => 1 });

        expect(copy).toEqual(deep);
        expect(copy.map.get("k")).not.toBe(deep.map.get("k"));
        expect(json.clone(5)).toBe(5);
        expect(json.clone(null)).toBeNull();
        expect(twin.run).toBe(wired.run);
        expect(twin.box).toBe(wired.box);
        expect(twin.inner).toEqual({ a: 1 });
        expect(twin.inner).not.toBe(wired.inner);
        expect(twin.at.getTime() === 5 && twin.at !== date).toBe(true);
        expect(twin.map.get("k")).toEqual({ v: 1 });
        expect(twin.map.get("k")).not.toBe(wired.map.get("k"));
        expect([...twin.set]).toEqual([{ v: 2 }]);
        expect(looped.self?.self).toBe(looped.self);
        expect(json.clone(ring()).self?.a).toBe(1);

    });
    it("reads are own-only and flat copies drop a poisoned key", () => {

        const tainted = JSON.parse('{"__proto__":{"admin":true},"a":1,"b":"x"}') as Record<string, unknown>;
        const made = [
            json.omit(tainted, []), json.compact(tainted), json.prune(tainted), json.flatten(tainted),
            json.mapValues(tainted, ( item ) => item), json.filterKeys(tainted, () => true), json.filterValues(tainted, () => true),
        ];

        expect(Object.hasOwn(tainted, "__proto__")).toBe(true);

        for ( const copy of made ) {

            expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
            expect(Object.hasOwn(copy, "__proto__")).toBe(false);
            expect((copy as { admin?: unknown }).admin).toBeUndefined();
            expect((copy as { a?: unknown }).a).toBe(1);

        }

        expect(json.pathGet({ a: {} }, "a.toString")).toBeUndefined();
        expect(json.pathGet({}, "hasOwnProperty")).toBeUndefined();
        expect(json.pathGet([1, 2], "length")).toBeUndefined();
        expect(json.pathGet("abc", "length")).toBeUndefined();
        expect(json.pick({ a: 1 } as { a: number; toString: () => string }, ["toString"])).toEqual({});
        expect(Object.keys(json.renameKeys({ toString: 1, a: 2 }, { a: "b" }))).toEqual(["toString", "b"]);
        expect(json.has({ a: 1 }, "toString") || json.has({}, "__proto__") || json.has({ a: [1] }, "a.1")).toBe(false);
        expect(json.toCsv([{ a: 1 }], { columns: ["a", "toString"], header: false })).toBe("1,");

    });
    it("paths set into lists, update in place and never mutate", () => {

        const base = { a: { n: 1 }, l: [1, 2] };

        expect(json.pathUpdate(base, "a.n", ( item ) => Number(item) + 1)).toEqual({ a: { n: 2 }, l: [1, 2] });
        expect(json.pathUpdate({}, "x.y", ( item ) => item ?? 0)).toEqual({ x: { y: 0 } });
        expect(json.pathUpdate(base, "l", ( item ) => [...(item as number[]), 3]).l).toEqual([1, 2, 3]);
        expect(base).toEqual({ a: { n: 1 }, l: [1, 2] });
        expect(json.pathSet(base, "l.1", 9).l).toEqual([1, 9]);
        expect(json.pathSet(base, "l.2", 9).l).toEqual([1, 2, 9]);
        expect(json.pathSet(base, "l.5", 9)).toBe(base);
        expect(json.pathSet(base, "l.x", 9)).toBe(base);
        expect(json.pathSet({}, "a.0.b", 1)).toEqual({ a: [{ b: 1 }] });
        expect(json.pathSet(base, "", 1)).toBe(base);

    });
    it("walk ends on a cycle and unflatten rebuilds lists", () => {

        const seen: string[] = [];
        const held = { a: { x: 1 }, "a.y": 2 };
        const tree = { a: { b: 1, c: [1, { d: 2 }] }, e: [], f: {}, g: [[1], [2, 3]] };

        json.walk(ring(), ( _, path ) => { seen.push(path.join(".")); });
        expect(seen).toEqual(["", "a", "self"]);
        expect(json.unflatten({ "a.0": 1, "a.1": 2, "b.0.c": 3, "d.1": 4 })).toEqual({ a: [1, 2], b: [{ c: 3 }], d: { "1": 4 } });
        expect(json.unflatten(json.flatten(tree))).toEqual(tree);
        expect(json.unflatten(held)).toEqual({ a: { x: 1, y: 2 } });
        expect(held.a).toEqual({ x: 1 });
        expect(json.unflatten({ "a/b": 1 }, "/")).toEqual({ a: { b: 1 } });
        expect(json.flatten({ a: { b: 1 } }, "/")).toEqual({ "a/b": 1 });
        expect(json.flatten({ at: new Date(3) }).at).toEqual(new Date(3));

    });
    it("equal tells apart what only looks alike", () => {

        const box = new Box();
        const far = ( depth: number, leaf: unknown ): unknown => (depth === 0 ? leaf : [far(depth - 1, leaf)]);

        expect(json.equal(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
        expect(json.equal(new Map([["a", { b: [1] }]]), new Map([["a", { b: [1] }]]))).toBe(true);
        expect(json.equal(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false);
        expect(json.equal(new Set([1, 2]), new Set([2, 1])) && !json.equal(new Set([1]), new Set([2]))).toBe(true);
        expect(json.equal(new Date(1), {}) || json.equal({}, new Date(1)) || json.equal(new Date(1), new Date(2))).toBe(false);
        expect(json.equal(new Date(Number.NaN), new Date(Number.NaN))).toBe(true);
        expect(json.equal(/a/g, /a/g) && !json.equal(/a/g, /a/i)).toBe(true);
        expect(json.equal(new Uint8Array([1, 2]), new Uint8Array([1, 2])) && !json.equal(new Uint8Array([1]), new Uint8Array([2]))).toBe(true);
        expect(json.equal(Number.NaN, Number.NaN) && json.equal([Number.NaN], [Number.NaN]) && json.equal(0, -0)).toBe(true);
        expect(json.equal([1], { "0": 1 }) || json.equal({ a: undefined }, { b: undefined }) || json.equal(null, {}) || json.equal(1, "1")).toBe(false);
        expect(json.equal(new Box(), new Box()) || json.equal(new Box(), { size: 1 }) || json.equal({ size: 1 }, new Box())).toBe(false);
        expect(json.equal(box, box) && json.equal({ box }, { box })).toBe(true);
        expect(json.equal(ring(), ring())).toBe(true);
        expect(json.equal(far(200, { a: 1 }), far(200, { a: 1 })) && !json.equal(far(200, { a: 1 }), far(200, { a: 2 }))).toBe(true);
        expect(json.isEmpty(new Map()) && json.isEmpty(new Set()) && json.isEmpty(null) && !json.isEmpty(new Date()) && !json.isEmpty(new Map([[1, 1]]))).toBe(true);
        expect(json.size(new Map([[1, 1]])) + json.size(new Set([1, 2]))).toBe(3);

    });
    it("patch replays a diff in both directions", () => {

        const from = { a: 1, b: { c: [1, 2, 3], d: "x" }, e: { f: {} }, k: [{ m: 1 }, 2] };
        const to = { a: 2, b: { c: [1, 3], g: null }, h: [{ i: 1 }], k: [5, 2] };
        const changes = json.diff(from, to);

        expect(json.patch(from, changes)).toEqual(to);
        expect(json.patch(to, json.diff(to, from))).toEqual(from);
        expect(from).toEqual({ a: 1, b: { c: [1, 2, 3], d: "x" }, e: { f: {} }, k: [{ m: 1 }, 2] });
        expect(json.diff(from, from)).toEqual([]);
        expect(json.patch(from, [])).toBe(from);
        expect(json.diff({ a: [1, 2] }, { a: [1] })).toEqual([{ path: "a.1", kind: "removed", from: 2, to: undefined }]);
        expect(json.diff({ at: new Date(1) }, { at: new Date(1) })).toEqual([]);
        expect(json.diff({ at: new Date(1) }, { at: new Date(2) }).map(( change ) => change.kind)).toEqual(["changed"]);
        expect(json.diff({ toString: 1 }, { valueOf: 2 }).map(( change ) => `${change.kind} ${change.path}`)).toEqual(["removed toString", "added valueOf"]);
        expect(json.patch({ a: { b: 1 } }, [{ path: "a.b", kind: "removed", from: 1, to: undefined }])).toEqual({});
        expect(json.patch({ a: 1 }, [{ path: "__proto__.x", kind: "added", from: undefined, to: 1 }])).toEqual({ a: 1 });

    });
    it("key cases and prune pass class instances through", () => {

        const date = new Date(7);

        expect(json.camelKeys<{ madeAt: Date }>({ made_at: date }).madeAt).toBe(date);
        expect(json.snakeKeys<{ made_at: Date[] }>({ madeAt: [date] }).made_at[0]).toBe(date);
        expect((json.prune({ at: date, a: null, b: { c: "" } }) as { at: Date }).at).toBe(date);
        expect(json.prune({ at: date, a: null, b: { c: "" } })).toEqual({ at: date });

    });
    it("typed reads take decimal text only and refuse what is not a number", () => {

        const body = { hex: "0x10", spaced: " 12.5 ", blank: "", power: "1e3", bad: Number.NaN, big: 10n, five: 5, off: 0, wide: Number.POSITIVE_INFINITY };

        expect(json.getNumber(body, "hex", 7)).toBe(7);
        expect(json.getNumber(body, "spaced")).toBe(12.5);
        expect(json.getNumber(body, "blank", 3)).toBe(3);
        expect(json.getNumber(body, "power")).toBe(1000);
        expect(json.getNumber(body, "bad", 4)).toBe(4);
        expect(json.getNumber(body, "wide", 4)).toBe(4);
        expect(json.getText(body, "bad", "-")).toBe("-");
        expect(json.getText(body, "wide", "-")).toBe("-");
        expect(json.getText(body, "big")).toBe("10");
        expect(json.getText(body, "five")).toBe("5");
        expect(json.getBoolean(body, "off", true)).toBe(false);
        expect(json.getBoolean(body, "five", true)).toBe(true);
        expect(json.getAt(body, "toString", "none")).toBe("none");

    });
    it("csv guards formulas, reads any separator and keeps a stray quote", () => {

        expect(json.toCsv([{ a: "=1+1", b: "-5", c: 3, d: "@x" }], { guard: true, header: false })).toBe("'=1+1,'-5,3,'@x");
        expect(json.toCsv([{ a: "=1+1" }], { header: false })).toBe("=1+1");
        expect(json.toCsv([{ at: new Date(0), o: { x: 1 }, l: [1, 2], n: null, bad: new Date(Number.NaN) }], { header: false })).toBe('1970-01-01T00:00:00.000Z,"{""x"":1}","[1,2]",,');
        expect(json.toCsv([{ a: "x" }], { separator: "" })).toBe("a\r\nx");
        expect(json.toCsv([{ a: "x;y" }], { separator: ";", header: false })).toBe('"x;y"');
        expect(json.fromCsv("a||b\n1||2|3", { separator: "||" })).toEqual([{ a: "1", b: "2|3" }]);
        expect(json.fromCsv('a,b\n5" pipe,"x""y"\n')).toEqual([{ a: '5" pipe', b: 'x"y' }]);
        expect(json.fromCsv('a\n"open')).toEqual([{ a: "open" }]);
        expect(json.fromCsv("h1,h2\n1,2", { columns: ["a", "b"] })).toEqual([{ a: "1", b: "2" }]);
        expect(json.fromCsv("1,2", { columns: ["a", "b"], header: false })).toEqual([{ a: "1", b: "2" }]);
        expect(json.fromCsv("a,b\r\n1,2\r\n\r\n3,\r\n")).toEqual([{ a: "1", b: "2" }, { a: "3", b: "" }]);
        expect(json.fromCsv("a\r1\r2")).toEqual([{ a: "1" }, { a: "2" }]);
        expect(json.fromCsv("a\n1,2")).toEqual([{ a: "1", "1": "2" }]);
        expect(json.fromCsv("")).toEqual([]);
        expect(json.fromCsv(json.toCsv([{ a: " x ", b: "\r\n", c: '"' }]))).toEqual([{ a: " x ", b: "\r\n", c: '"' }]);

    });
    it("lines carry one value each and skip what does not parse", () => {

        const rows = [{ a: 1 }, [1, "x\ny"], "t", null];
        const text = json.toLines(rows);

        expect(text.split("\n")).toHaveLength(4);
        expect(json.fromLines(text)).toEqual(rows);
        expect(json.fromLines('{"a":1}\r\n\r\n{bad\n2\n')).toEqual([{ a: 1 }, 2]);
        expect(json.fromLines("")).toEqual([]);
        expect(json.toLines([])).toBe("");

    });
});
