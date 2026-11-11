import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as form from "engine/form";
import * as validate from "engine/validate";
import * as fc from "fast-check";

type Values = { name: string; qty: number; tags: string[]; address: { city: string } };
type Output = validate.infer<typeof schema>;
type RowAct =
    | { kind: "push"; values: string[] }
    | { kind: "insert"; at: number; values: string[] }
    | { kind: "replace"; at: number; value: string }
    | { kind: "remove"; at: number }
    | { kind: "move"; from: number; to: number }
    | { kind: "swap"; a: number; b: number }
    | { kind: "clear" }
    | { kind: "mark"; at: number };
type Edit = { kind: "set"; path: "name" | "qty" | "address.city"; value: unknown } | { kind: "touch"; path: "name" | "qty" | "address.city" } | { kind: "submit" } | { kind: "reset" } | { kind: "rebase" };
type Walk = { kind: "next" } | { kind: "back" } | { kind: "go"; to: number };

const schema = validate.strictObject({
    name: validate.string().check(validate.minLength(2)),
    qty: validate.int().check(validate.gte(1)),
    tags: validate.array(validate.string()).check(validate.maxLength(3)),
    address: validate.strictObject({ city: validate.string().check(validate.minLength(1)) }),
});
const initial: Values = { name: "", qty: 1, tags: [], address: { city: "" } };
const runs = 400;
const word = fc.constantFrom("", "A", "Ann", "Bob");
const rowAct: fc.Arbitrary<RowAct> = fc.oneof(
    fc.record({ kind: fc.constant("push" as const), values: fc.array(word, { maxLength: 3 }) }),
    fc.record({ kind: fc.constant("insert" as const), at: fc.integer({ min: -2, max: 6 }), values: fc.array(word, { maxLength: 2 }) }),
    fc.record({ kind: fc.constant("replace" as const), at: fc.integer({ min: -1, max: 5 }), value: word }),
    fc.record({ kind: fc.constant("remove" as const), at: fc.integer({ min: -1, max: 5 }) }),
    fc.record({ kind: fc.constant("move" as const), from: fc.integer({ min: -1, max: 5 }), to: fc.integer({ min: -1, max: 5 }) }),
    fc.record({ kind: fc.constant("swap" as const), a: fc.integer({ min: -1, max: 5 }), b: fc.integer({ min: -1, max: 5 }) }),
    fc.constant<RowAct>({ kind: "clear" }),
    fc.record({ kind: fc.constant("mark" as const), at: fc.integer({ min: 0, max: 4 }) }),
);
const path = fc.constantFrom<"name" | "qty" | "address.city">("name", "qty", "address.city");
const edit: fc.Arbitrary<Edit> = fc.oneof(
    { weight: 5, arbitrary: fc.record({ kind: fc.constant("set" as const), path, value: fc.oneof(word, fc.integer({ min: -1, max: 3 }), fc.constant(1.5)) }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant("touch" as const), path }) },
    { weight: 2, arbitrary: fc.constant<Edit>({ kind: "submit" }) },
    { weight: 1, arbitrary: fc.constant<Edit>({ kind: "reset" }) },
    { weight: 1, arbitrary: fc.constant<Edit>({ kind: "rebase" }) },
);
const walk: fc.Arbitrary<Walk> = fc.oneof(fc.constant<Walk>({ kind: "next" }), fc.constant<Walk>({ kind: "back" }), fc.record({ kind: fc.constant("go" as const), to: fc.oneof(fc.integer({ min: -3, max: 6 }), fc.constant(Number.NaN), fc.constant(2.7)) }));

function define<R = Output> ( extra: Partial<form.Options<Values, Output, R>> = {} ): form.Form<Values, Output, R> {

    return form.define<Values, Output, R>({ schema, initial, submit: async ( value ) => value as unknown as R, ...extra });

}
function inside ( length: number, ...indexes: readonly number[] ): boolean {

    return indexes.every(( index ) => Number.isInteger(index) && index >= 0 && index < length);

}
function issues ( values: Values ): Set<string> {

    const found = validate.check(schema, values);

    return new Set(found.ok ? [] : Object.keys(error.formErrors(found.fault, "invalid")));

}
function pathOf ( values: Values, at: "name" | "qty" | "address.city" ): unknown {

    return at === "address.city" ? values.address.city : values[at];

}
function withPath ( values: Values, at: "name" | "qty" | "address.city", value: unknown ): Values {

    if ( at === "address.city" ) return { ...values, address: { city: value as string } };

    return { ...values, [at]: value };

}

describe("fuzz form", () => {

    it("any values either check into the schema's output or leave errors, never an exception", async () => {

        const loose = validate.object({ name: validate.string().check(validate.minLength(1), validate.maxLength(20)), age: validate.int().check(validate.gte(0), validate.lte(150)) });

        await fc.assert(fc.asyncProperty(fc.string({ maxLength: 30 }), fc.oneof(fc.integer({ min: -5, max: 200 }), fc.double({ noNaN: true })), async ( name, age ) => {

            const made = form.define({ schema: loose, initial: { name, age }, submit: async ( value ) => value });
            const checked = made.check();
            const sent = await made.submit();
            const outcome = checked ? { checked, sent, errors: 0 } : { checked, sent, errors: Object.keys(made.errors()).length > 0 ? "some" : 0 };

            expect(outcome).toEqual(checked ? { checked: { name, age }, sent: { name, age }, errors: 0 } : { checked: undefined, sent: undefined, errors: "some" });

        }), { numRuns: 1500 });

    });
    it("rows follow an array model and carry every item's error and touched mark along with it", () => {

        fc.assert(fc.property(fc.array(rowAct, { maxLength: 14 }), ( acts ) => {

            const made = define({ mode: "submit" });
            const rows = made.rows("tags");
            let items: string[] = [];
            let marks = new Map<string, number>();
            let touchedAt = new Set<number>();
            let stamp = 0;
            const remap = ( seat: ( index: number ) => number | undefined ): void => {

                const next = new Map<string, number>();
                const moved = new Set<number>();

                for ( const [tag, index] of marks ) {

                    const to = seat(index);

                    if ( to !== undefined ) next.set(tag, to);

                }

                for ( const index of touchedAt ) {

                    const to = seat(index);

                    if ( to !== undefined ) moved.add(to);

                }

                marks = next;
                touchedAt = moved;

            };

            for ( const act of acts ) {

                const length = items.length;

                if ( act.kind === "push" ) {

                    rows.push(...act.values);
                    items = [...items, ...act.values];

                } else if ( act.kind === "insert" ) {

                    const at = Math.min(Math.max(0, Math.trunc(act.at) || 0), length);

                    rows.insert(act.at, ...act.values);

                    if ( act.values.length ) {

                        items = [...items.slice(0, at), ...act.values, ...items.slice(at)];
                        remap(( index ) => (index >= at ? index + act.values.length : index));

                    }

                } else if ( act.kind === "replace" ) {

                    rows.replace(act.at, act.value);

                    if ( inside(length, act.at) && items[act.at] !== act.value ) {

                        items = items.map(( item, index ) => (index === act.at ? act.value : item));

                        for ( const [tag, index] of [...marks] ) if ( index === act.at ) marks.delete(tag);

                    }

                } else if ( act.kind === "remove" ) {

                    rows.remove(act.at);

                    if ( inside(length, act.at) ) {

                        items = items.filter(( _, index ) => index !== act.at);
                        remap(( index ) => (index === act.at ? undefined : index > act.at ? index - 1 : index));

                    }

                } else if ( act.kind === "move" ) {

                    rows.move(act.from, act.to);

                    if ( inside(length, act.from, act.to) && act.from !== act.to ) {

                        const copy = [...items];
                        const [taken] = copy.splice(act.from, 1);

                        copy.splice(act.to, 0, taken as string);
                        items = copy;

                        const step = act.from < act.to ? -1 : 1;
                        const [low, high] = act.from < act.to ? [act.from, act.to] : [act.to, act.from];

                        remap(( index ) => (index === act.from ? act.to : index >= low && index <= high ? index + step : index));

                    }

                } else if ( act.kind === "swap" ) {

                    rows.swap(act.a, act.b);

                    if ( inside(length, act.a, act.b) && act.a !== act.b ) {

                        const copy = [...items];

                        [copy[act.a], copy[act.b]] = [copy[act.b] as string, copy[act.a] as string];
                        items = copy;
                        remap(( index ) => (index === act.a ? act.b : index === act.b ? act.a : index));

                    }

                } else if ( act.kind === "clear" ) {

                    rows.clear();
                    items = [];
                    marks = new Map();
                    touchedAt = new Set();

                } else if ( inside(length, act.at) ) {

                    stamp += 1;

                    const tag = `e${stamp}`;

                    made.touch(`tags.${act.at}`);
                    made.fail({ [`tags.${act.at}`]: tag });

                    for ( const [other, index] of [...marks] ) if ( index === act.at ) marks.delete(other);

                    marks.set(tag, act.at);
                    touchedAt.add(act.at);

                }

                expect(made.values().tags).toEqual(items);
                expect(rows.length()).toBe(items.length);

                const errors = Object.entries(made.errors()).filter(([key]) => key.startsWith("tags.")).map(([key, tag]) => [tag, Number(key.slice(5))]).sort();
                const touched = made.state.getState().touched.filter(( key ) => key.startsWith("tags.")).map(( key ) => Number(key.slice(5))).sort(( a, b ) => a - b);

                expect(errors).toEqual([...marks.entries()].sort());
                expect(touched).toEqual([...touchedAt].sort(( a, b ) => a - b));

            }

        }), { numRuns: runs });

    });
    it("values, dirtiness and changes follow a model through sets, touches, submits, resets and rebases, and shown errors obey the mode", async () => {

        await fc.assert(fc.asyncProperty(fc.array(edit, { maxLength: 16 }), fc.constantFrom<form.Mode>("change", "blur", "submit"), fc.constantFrom<form.Mode>("change", "blur", "submit"), async ( edits, mode, recheck ) => {

            const made = define({ mode, recheck });
            let values = initial;
            let base = initial;
            let touched = new Set<string>();
            let attempts = 0;

            for ( const step of edits ) {

                if ( step.kind === "set" ) {

                    made.set(step.path, step.value);

                    if ( !Object.is(pathOf(values, step.path), step.value) ) values = withPath(values, step.path, step.value);

                } else if ( step.kind === "touch" ) {

                    made.touch(step.path);
                    touched.add(step.path);

                } else if ( step.kind === "submit" ) {

                    const sent = await made.submit();
                    const wrong = issues(values);

                    attempts += 1;

                    if ( wrong.size === 0 ) {

                        expect(sent).toEqual(validate.check(schema, values).ok ? (validate.check(schema, values) as { value: Output }).value : undefined);
                        expect(made.status()).toBe("done");

                    } else {

                        expect(sent).toBeUndefined();
                        expect(made.status()).toBe("failed");

                        for ( const key of wrong ) touched.add(key);

                    }

                } else if ( step.kind === "reset" ) {

                    made.reset();
                    values = base;
                    touched = new Set();
                    attempts = 0;

                } else {

                    made.rebase();
                    base = values;

                }

                const wrong = issues(values);
                const shown = Object.keys(made.errors());
                const live = attempts > 0 ? recheck : mode;

                expect(made.values()).toEqual(values);
                expect(made.dirty()).toBe(JSON.stringify(values) !== JSON.stringify(base));
                expect(new Set(made.state.getState().touched)).toEqual(touched);

                for ( const key of shown ) expect(wrong.has(key)).toBe(true);

                if ( live === "change" && step.kind !== "submit" && step.kind !== "touch" ) for ( const key of wrong ) if ( touched.has(key) && key !== "_form" ) expect(shown).toContain(key);
                if ( step.kind === "touch" && live !== "submit" ) for ( const key of wrong ) if ( touched.has(key) && key !== "_form" ) expect(shown).toContain(key);

            }

        }), { numRuns: runs });

    });
    it("the idempotency key survives a failure of the same payload and changes with the payload or after a success", async () => {

        await fc.assert(fc.asyncProperty(fc.array(fc.tuple(fc.boolean(), fc.boolean()), { minLength: 1, maxLength: 8 }), async ( turns ) => {

            const keys: string[] = [];
            let failing = true;
            let qty = 1;
            const made = define<number>({ submit: async ( value, key ) => {

                keys.push(key);

                if ( failing ) throw error.fault("unavailable", "down");

                return value.qty;

            } });

            made.set("name", "Ann");
            made.set("address.city", "Cairo");

            let last: { key: string; qty: number; failed: boolean } | undefined;

            for ( const [fail, change] of turns ) {

                failing = fail;

                if ( change ) {

                    qty += 1;
                    made.set("qty", qty);

                }

                const sent = await made.submit();
                const key = keys[keys.length - 1] as string;

                expect(sent).toBe(fail ? undefined : qty);

                if ( last && last.failed && last.qty === qty ) expect(key).toBe(last.key);
                else if ( last ) expect(key).not.toBe(last.key);

                last = { key, qty, failed: fail };

            }

            expect(new Set(keys).size).toBeLessThanOrEqual(keys.length);

        }), { numRuns: runs });

    });
    it("watchers hear exactly the covered changes, once each", () => {

        const watched = fc.constantFrom("*", "qty", "address", "address.city", "name", "tags");

        fc.assert(fc.property(fc.array(watched, { minLength: 1, maxLength: 3 }), fc.array(fc.record({ kind: fc.constant("set" as const), path, value: fc.oneof(word, fc.integer({ min: 0, max: 3 })) }), { maxLength: 10 }), ( paths, sets ) => {

            const made = define();
            const heard: string[] = [];
            const stop = made.watch(paths, ( _, changed ) => { heard.push(changed); });
            const expected: string[] = [];
            let values = initial;

            for ( const step of sets ) {

                made.set(step.path, step.value);

                if ( Object.is(pathOf(values, step.path), step.value) ) continue;

                values = withPath(values, step.path, step.value);

                if ( paths.some(( one ) => one === "*" || one === step.path || step.path.startsWith(`${one}.`) || one.startsWith(`${step.path}.`)) ) expected.push(step.path);

            }

            expect(heard).toEqual(expected);
            stop();
            made.set("qty", 99);
            expect(heard).toEqual(expected);

        }), { numRuns: runs });

    });
    it("a stepper clamps every move into 0..total and only advances over a valid step", () => {

        fc.assert(fc.property(fc.array(walk, { maxLength: 12 }), fc.boolean(), ( walks, filled ) => {

            const made = define();

            if ( filled ) {

                made.set("name", "Ann");
                made.set("address.city", "Cairo");

            }

            const plan = [["name"], ["qty", "tags"], ["address.city"]];
            const steps = form.stepper(made, plan);
            let index = 0;

            for ( const move of walks ) {

                if ( move.kind === "next" ) {

                    const fields = index < plan.length ? plan[index] as string[] : [];
                    const wanted = index >= plan.length - 1 ? [...fields, "_form"] : fields;
                    const wrong = issues(made.values());
                    const ok = !wanted.some(( field ) => wrong.has(field) || [...wrong].some(( key ) => key.startsWith(`${field}.`)));

                    expect(steps.next()).toBe(ok);

                    if ( ok ) index = Math.min(plan.length, index + 1);

                } else if ( move.kind === "back" ) {

                    steps.back();
                    index = Math.max(0, index - 1);

                } else {

                    steps.go(move.to);
                    index = Math.max(0, Math.min(plan.length, Math.trunc(move.to) || 0));

                }

                expect(steps.state()).toEqual({ index, total: 3, fields: plan[index] ?? [], first: index <= 0, last: index >= 2, done: index >= 3 });

            }

        }), { numRuns: runs });

    });

});
