import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as form from "engine/form";
import * as validate from "engine/validate";

type Values = { name: string; email: string; qty: number; tags: string[]; address: { city: string } };
type Output = validate.infer<typeof schema>;
type Made<R = number> = form.Form<Values, Output, R>;

const schema = validate.strictObject({
    name: validate.string().check(validate.minLength(2)),
    email: validate.email(),
    qty: validate.int().check(validate.gte(1)),
    tags: validate.array(validate.string()).check(validate.maxLength(3)),
    address: validate.strictObject({ city: validate.string().check(validate.minLength(1)) }),
});
const initial: Values = { name: "", email: "", qty: 1, tags: [], address: { city: "" } };

function told ( run: () => unknown ): string {

    try {

        run();

        return "ok";

    } catch ( failure ) {

        if ( error.is(failure) ) return `${failure.code}/${failure.reason}`;

        return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

    }

}
function tick ( ms = 0 ): Promise<void> {

    return new Promise(( done ) => setTimeout(done, ms));

}
function define<R = number> ( extra: Partial<form.Options<Values, Output, R>> = {} ): Made<R> {

    return form.define<Values, Output, R>({ schema, initial, submit: async ( value ) => value.qty as unknown as R, ...extra });

}
function filled ( made: Made<unknown> ): void {

    made.set("name", "Ann");
    made.set("email", "ann@example.com");
    made.set("address.city", "Cairo");

}

describe("form", () => {

    it("fields read and write nested paths, validation follows the mode and submit keeps one key until it succeeds", async () => {

        const keys: string[] = [];
        let fail = true;
        const made = form.define<Values, validate.infer<typeof schema>, { id: number }>({
            schema,
            initial,
            mode: "blur",
            submit: async ( value, key ) => {

                keys.push(key);

                if ( fail ) throw error.fault("validation", "taken", { errors: { email: ["taken"] } });

                return { id: value.qty };

            },
        });
        const name = made.field("name");
        const city = made.field("address.city");

        expect(made.dirty()).toBe(false);
        name.set("A");
        expect(name.get()).toBe("A");
        expect(name.error()).toBeUndefined();
        name.touch();
        expect(name.error()).toBe("min_length:2");
        expect(name.touched() && name.dirty()).toBe(true);
        expect(made.errors()).toEqual({ name: "min_length:2" });
        name.set("Ann");
        name.touch();
        expect(name.error()).toBeUndefined();
        city.set("Cairo");
        expect(made.values().address.city).toBe("Cairo");
        expect(made.valid()).toBe(false);
        expect(await made.submit()).toBeUndefined();
        expect(made.state.getState().status).toBe("failed");
        expect(made.errors().email).toBe("email");
        made.field("email").set("Ann@Example.com");
        expect(made.check()).toMatchObject({ email: "ann@example.com" });
        expect(await made.submit()).toBeUndefined();
        expect(made.errors()).toEqual({ email: "taken" });
        fail = false;
        expect(await made.submit()).toEqual({ id: 1 });
        expect(keys).toHaveLength(2);
        expect(keys[0]).toBe(keys[1]);
        expect(made.state.getState().submits).toBe(2);
        expect(await made.submit()).toEqual({ id: 1 });
        expect(keys[2]).not.toBe(keys[0]);
        made.reset();
        expect(made.values()).toEqual(initial);
        expect(made.state.getState().touched).toEqual([]);

    });
    it("change mode validates as you type, rows move, watchers fire for covered paths", () => {

        const changes: string[] = [];
        const made = form.define<Values, validate.infer<typeof schema>, void>({
            schema,
            initial,
            mode: "change",
            submit: async () => undefined,
            watch: { "qty, tags": ( _, changed ) => { changes.push(changed); } },
        });
        const qty = made.field("qty");

        qty.set(0);
        expect(qty.error()).toBeUndefined();
        qty.touch();
        qty.set(-1);
        expect(qty.error()).toBe("min:1");
        qty.set(3);
        expect(qty.error()).toBeUndefined();

        const tags = made.rows("tags");

        tags.push("a");
        tags.push("b");
        tags.push("c");
        tags.move(0, 2);
        expect(made.values().tags).toEqual(["b", "c", "a"]);
        tags.remove(1);
        expect(made.values().tags).toEqual(["b", "a"]);
        expect(tags.length()).toBe(2);

        const stop = made.watch("address", ( values ) => { changes.push(`address:${values.address.city}`); });

        made.field("address.city").set("Giza");
        stop();
        made.field("address.city").set("Cairo");
        made.state.getState().patch({ name: "Zed" });
        expect(made.values().name).toBe("Zed");
        made.state.getState().fail({ _form: "boom" });
        expect(made.errors()._form).toBe("boom");
        made.state.getState().forgive("_form");
        expect(made.errors()).toEqual({});
        expect(changes).toEqual(["qty", "qty", "qty", "tags", "tags", "tags", "tags", "tags", "address:Giza"]);

    });
    it("a stepper walks the form's fields in steps and refuses to advance over errors", () => {

        const made = form.define({ schema, initial: { name: "", email: "", qty: 1, tags: [], address: { city: "" } }, submit: async ( value ) => value });
        const steps = form.stepper(made, [["name", "email"], ["qty", "tags"], ["address.city"]]);
        const seen: number[] = [];
        const stop = steps.watch(( state ) => { seen.push(state.index); });

        expect(steps.state()).toEqual({ index: 0, total: 3, fields: ["name", "email"], first: true, last: false, done: false });
        expect(steps.next()).toBe(false);
        expect(Object.keys(made.errors()).sort()).toEqual(["email", "name"]);
        made.field("name").set("Ann");
        made.field("email").set("ann@example.com");
        expect(steps.next()).toBe(true);
        expect(steps.index()).toBe(1);
        expect(steps.fields()).toEqual(["qty", "tags"]);
        steps.go(2);
        expect(steps.last()).toBe(true);
        steps.back();
        expect(steps.index()).toBe(1);
        steps.go(9);
        expect(steps.done()).toBe(true);
        stop();
        expect(seen).toEqual([1, 2, 1, 3]);

    });
    it("rows move their errors and touched marks with the items and ignore indexes outside the list", () => {

        const made = define({ mode: "change" });
        const rows = made.rows("tags");

        expect(made.rows("tags")).toBe(rows);
        rows.push("a", "b", "c", "d");
        made.touch("tags.1");
        made.touch("tags.3");
        made.state.getState().fail({ "tags.1": "bad one", "tags.3": "bad three", tags: "too many" });
        expect(made.errors()).toEqual({ tags: "too many", "tags.1": "bad one", "tags.3": "bad three" });
        rows.move(1, 3);
        expect(made.values().tags).toEqual(["a", "c", "d", "b"]);
        expect(made.errors()).toEqual({ tags: "max_length:3", "tags.3": "bad one", "tags.2": "bad three" });
        expect(made.state.getState().touched).toEqual(["tags.3", "tags.2"]);
        rows.remove(0);
        expect([made.values().tags, made.errors()]).toEqual([["c", "d", "b"], { "tags.2": "bad one", "tags.1": "bad three" }]);
        rows.insert(0, "z");
        expect([made.values().tags, made.errors()]).toEqual([["z", "c", "d", "b"], { tags: "max_length:3", "tags.3": "bad one", "tags.2": "bad three" }]);
        rows.swap(2, 3);
        expect([made.values().tags, made.errors()["tags.2"], made.errors()["tags.3"]]).toEqual([["z", "c", "b", "d"], "bad one", "bad three"]);
        rows.remove(3);
        expect([made.values().tags, made.errors()]).toEqual([["z", "c", "b"], { "tags.2": "bad one" }]);
        rows.replace(2, "B");
        expect([made.values().tags, made.errors()]).toEqual([["z", "c", "B"], {}]);
        rows.replace(9, "nope");
        rows.remove(-1);
        rows.remove(1.5);
        rows.move(0, 9);
        rows.move(1, 1);
        rows.swap(0, 0);
        rows.swap(0, 7);
        rows.push();
        rows.insert(1);
        expect(made.values().tags).toEqual(["z", "c", "B"]);
        rows.insert(Number.NaN, "n");
        rows.insert(99, "end");
        rows.insert(-5, "start");
        expect(made.values().tags).toEqual(["start", "n", "z", "c", "B", "end"]);
        expect([rows.length(), rows.items<string>()[0]]).toEqual([6, "start"]);
        rows.clear();
        rows.clear();
        expect([made.values().tags, rows.length(), made.state.getState().touched]).toEqual([[], 0, []]);
        expect(made.rows("name").items()).toEqual([]);

    });
    it("watchers hear covered paths once per change, survive a throwing peer, drop mid-delivery and refuse to loop", () => {

        const heard: string[] = [];
        const made = define({ watch: { "qty, address": ( _, changed ) => { heard.push(`declared:${changed}`); } } });
        let stopSecond: (() => void) | undefined;
        const stopFirst = made.watch("*", ( _, changed ) => {

            heard.push(`star:${changed}`);
            stopSecond?.();

        });

        stopSecond = made.watch("address.city", ( _, changed ) => { heard.push(`city:${changed}`); });
        made.set("address.city", "Giza");
        expect(heard).toEqual(["declared:address.city", "star:address.city"]);
        made.set("address.city", "Giza");
        made.patch({ qty: 1, name: "Ann" });
        expect(heard.slice(2)).toEqual(["star:name"]);
        made.patch({ qty: 2, name: "Bob" });
        expect(heard.slice(3)).toEqual(["declared:qty", "star:qty", "star:name"]);
        stopFirst();

        const stopThrower = made.watch("qty", () => { throw new Error("boom"); });
        const seen: string[] = [];
        const stopLater = made.watch("qty", () => { seen.push("later"); });

        expect(() => made.set("qty", 3)).toThrow("boom");
        expect([seen, made.values().qty]).toEqual([["later"], 3]);
        stopThrower();
        stopLater();
        const stopLoop = made.watch("qty", () => { made.set("qty", made.values().qty + 1); });

        expect(told(() => made.set("qty", 10))).toBe("internal/form.loop");
        expect(made.values().qty).toBeGreaterThan(10);
        stopLoop();
        heard.length = 0;
        made.reset();
        expect(heard).toEqual(["declared:*"]);

    });
    it("prototype paths and unsafe patch keys change nothing, and the initial object is never mutated", () => {

        const made = define();
        const before = JSON.stringify(initial);

        made.set("__proto__.polluted", 1);
        made.set("constructor.prototype.polluted", 1);
        made.patch({ __proto__: { polluted: 1 } } as unknown as Partial<Values>);
        made.patch(JSON.parse('{"__proto__": {"polluted": 1}, "constructor": 1}') as Partial<Values>);
        expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
        expect([made.values(), made.field("__proto__").get(), made.field("__proto__").error(), made.dirty()]).toEqual([initial, undefined, undefined, false]);
        made.set("address.city", "Giza");
        made.rows("tags").push("x");
        made.field("name").set("Ann");
        expect([JSON.stringify(initial), made.dirty(), made.dirty("qty"), made.dirty("address.city")]).toEqual([before, true, false, true]);
        expect(made.changes()).toEqual({ name: "Ann", tags: ["x"], address: { city: "Giza" } });
        made.rebase();
        expect([made.dirty(), made.changes(), made.state.getState().initial.name]).toEqual([false, {}, "Ann"]);
        made.set("qty", 2);
        made.field("qty").reset();
        made.field("qty").reset();
        expect([made.values().qty, made.dirty()]).toEqual([1, false]);
        made.reset({ ...initial, name: "Zed" });
        expect([made.values().name, made.state.getState().initial.name, made.dirty()]).toEqual(["Zed", "Zed", false]);
        expect(made.field("name")).toBe(made.field("name"));

    });
    it("verify asks the declared question on touch, skips invalid or already-refused paths, joins, caches, and aborts on edits", async () => {

        const asked: string[] = [];
        let answer: string | undefined = "taken";
        const made = define({ verify: { name: async ( value, values, signal ) => {

            asked.push(`${String(value)}/${values.qty}`);
            await tick(2);

            return signal.aborted ? "late" : answer;

        } } });
        const name = made.field("name");

        name.set("A");
        name.touch();
        await tick(5);
        expect([asked, name.error(), name.checking()]).toEqual([[], "min_length:2", false]);
        name.set("Ann");
        name.touch();
        expect([name.checking(), made.state.getState().checking]).toEqual([true, ["name"]]);
        name.touch();
        await tick(5);
        expect([asked, name.error(), made.state.getState().served, name.checking()]).toEqual([["Ann/1"], "taken", { name: "taken" }, false]);
        expect(await made.verify("name")).toBe(false);
        expect(asked).toHaveLength(1);
        name.set("Bob");
        answer = undefined;

        const first = made.verify("name");
        const joined = made.verify("name");

        expect(first).toBe(joined);
        expect([await first, asked.length, name.error()]).toEqual([true, 2, undefined]);
        expect([await made.verify("name"), asked.length]).toEqual([true, 2]);
        name.set("Cat");

        const racing = made.verify("name");

        name.set("Dog");
        expect([await racing, name.checking()]).toEqual([false, false]);
        name.touch();
        expect(name.checking()).toBe(true);
        await tick(5);
        expect([asked.slice(2), name.error(), name.checking()]).toEqual([["Cat/1", "Dog/1"], undefined, false]);
        name.set("Eve");
        made.touch("name");
        made.reset();
        await tick(5);
        expect([made.state.getState().checking, made.errors()]).toEqual([[], {}]);
        expect(await made.verify("qty")).toBe(true);
        expect(await made.verify("qty", () => "no")).toBe(false);
        expect(made.errors()).toEqual({ qty: "no" });
        expect(await made.verify("qty", () => "no")).toBe(false);
        made.set("qty", 2);
        expect(await made.verify("qty", () => undefined)).toBe(true);
        expect(await made.verify("qty", () => { throw new Error("net"); })).toBe(false);
        expect([made.errors(), made.fault(), made.state.getState().checking]).toEqual([{}, undefined, []]);

        const halted = define({ verify: { name: () => new Promise<string | undefined>(() => undefined) } });

        filled(halted);

        const stuck = halted.verify("name");

        expect(halted.state.getState().checking).toEqual(["name"]);
        await halted.submit();
        expect([await stuck, halted.state.getState().checking, halted.status()]).toEqual([false, [], "done"]);

    });
    it("submit joins one flight, abort settles it and keeps the key for the same payload, reset drops a late answer", async () => {

        const keys: string[] = [];
        const releases: (( value: number ) => void)[] = [];
        const aborted: number[] = [];
        const made = define({ submit: ( _, key, signal ) => new Promise<number>(( resolve, reject ) => {

            keys.push(key);
            releases.push(resolve);
            signal.addEventListener("abort", () => {

                aborted.push(keys.length);
                reject(new Error("aborted"));

            }, { once: true });

        }) });

        filled(made);

        const first = made.submit();
        const joined = made.submit();

        expect(first).toBe(joined);
        await tick();
        expect([keys.length, made.status(), made.state.getState().submits]).toEqual([1, "pending", 1]);
        made.abort();
        made.abort();
        expect([await first, made.status(), aborted]).toEqual([undefined, "idle", [1]]);

        const again = made.submit();

        await tick();
        expect([keys.length, keys[1] === keys[0]]).toEqual([2, true]);
        releases[1]?.(7);
        expect([await again, made.status(), made.state.getState().result]).toEqual([7, "done", 7]);
        made.set("qty", 2);

        const changed = made.submit();

        await tick();
        expect(keys[2] === keys[1]).toBe(false);
        made.reset();
        expect([made.status(), aborted.length, made.values()]).toEqual(["idle", 2, initial]);
        releases[2]?.(9);
        expect([await changed, made.status(), made.state.getState().result]).toEqual([undefined, "idle", undefined]);
        filled(made);

        const late = made.submit();

        await tick();
        made.abort();
        releases[3]?.(11);
        expect([await late, made.status()]).toEqual([undefined, "idle"]);

        const sameKey = made.submit();

        await tick();
        expect(keys[4] === keys[3]).toBe(true);
        releases[4]?.(1);
        await sameKey;

        const fresh = made.submit();

        await tick();
        expect(keys[5] === keys[4]).toBe(false);
        releases[5]?.(1);
        await fresh;
        expect(made.state.getState().submits).toBe(6);

    });
    it("a failed submit keeps the fault and its field errors beside the root until the next send, counts attempts and halts asks", async () => {

        let answer: unknown = error.fault("validation", "taken", { errors: { email: ["taken"], "address.city": ["unknown"] } });
        const made = define({ submit: async () => {

            if ( answer !== undefined ) throw answer;

            return 1;

        } });

        expect(await made.submit()).toBeUndefined();
        expect([made.status(), made.state.getState().attempts, made.state.getState().submits, made.fault()]).toEqual(["failed", 1, 0, undefined]);
        expect(Object.keys(made.errors()).sort()).toEqual(["address.city", "email", "name"]);
        filled(made);
        expect(made.errors()).toEqual({});
        expect(await made.submit()).toBeUndefined();
        expect([made.status(), made.state.getState().attempts, made.state.getState().submits, made.fault()?.code, made.fault()?.reason]).toEqual(["failed", 2, 1, "validation", "taken"]);
        expect(made.errors()).toEqual({ email: "taken", "address.city": "unknown" });
        made.set("address.city", "Giza");
        expect(made.errors()).toEqual({ email: "taken" });
        answer = error.fault("unavailable", "down");
        made.set("email", "bob@example.com");
        expect(await made.submit()).toBeUndefined();
        expect<unknown[]>([made.fault()?.code, made.errors()]).toEqual(["unavailable", { _form: made.fault()?.message }]);
        made.forgive();
        expect(made.errors()).toEqual({});
        answer = new TypeError("broken");
        expect(await made.submit()).toBeUndefined();
        expect([made.fault()?.code, made.errors()._form]).toEqual(["internal", made.fault()?.message]);
        answer = error.fault("validation", "bad", { message: "" });
        expect(await made.submit()).toBeUndefined();
        expect(made.errors()).toEqual({ _form: "invalid" });
        answer = undefined;
        expect(await made.submit()).toBe(1);
        expect([made.status(), made.fault(), made.errors(), made.state.getState().attempts]).toEqual(["done", undefined, {}, 6]);

        const named = define({ fallback: "server" });

        filled(named);
        named.fail({ _form: "boom", name: "bad" });
        expect([named.status(), named.errors()]).toEqual(["failed", { _form: "boom", name: "bad" }]);
        named.forgive("name");
        expect(named.errors()).toEqual({ _form: "boom" });
        named.set("name", "Bo");
        expect(named.errors()).toEqual({});

    });
    it("errors appear by mode and recheck: blur waits for a touch, change validates as typed, submit waits for a send", async () => {

        const table: [form.Mode, form.Mode | undefined, string, string, string, string][] = [
            ["blur", undefined, "-", "min_length:2", "min_length:2", "min_length:2"],
            ["blur", "change", "-", "min_length:2", "min_length:2", "min_length:2"],
            ["blur", "blur", "-", "min_length:2", "-", "min_length:2"],
            ["blur", "submit", "-", "min_length:2", "-", "-"],
            ["change", undefined, "-", "min_length:2", "min_length:2", "min_length:2"],
            ["change", "submit", "-", "min_length:2", "-", "-"],
            ["submit", undefined, "-", "-", "min_length:2", "min_length:2"],
            ["submit", "blur", "-", "-", "-", "min_length:2"],
            ["submit", "submit", "-", "-", "-", "-"],
        ];

        for ( const [mode, recheck, typed, touched, retyped, retouched] of table ) {

            const made = define({ mode, recheck });
            const name = made.field("name");
            const shown = (): string => name.error() ?? "-";

            name.set("A");

            const seen = [shown()];

            name.touch();
            seen.push(shown());
            await made.submit();
            name.set("Ann");
            expect([mode, recheck, shown()]).toEqual([mode, recheck, "-"]);
            name.set("B");
            seen.push(shown());
            name.touch();
            seen.push(shown());
            expect([mode, recheck, ...seen]).toEqual([mode, recheck, typed, touched, retyped, retouched]);

        }

        const made = define({ mode: "change" });

        made.set("name", "A");
        expect(made.errors()).toEqual({});
        made.touch("name");
        made.touch("name");
        expect([made.errors(), made.state.getState().touched]).toEqual([{ name: "min_length:2" }, ["name"]]);
        made.set("name", "Ann");
        expect([made.errors(), made.status()]).toEqual([{}, "idle"]);
        made.set("name", "Ann");
        expect(made.check(["email"])).toBeUndefined();
        expect([made.errors(), made.state.getState().touched]).toEqual([{ email: "email" }, ["name", "email"]]);
        expect([made.valid("name"), made.valid(["email"]), made.valid()]).toEqual([true, false, false]);
        made.forgive("email");
        expect(made.check()).toBeUndefined();
        expect(Object.keys(made.errors()).sort()).toEqual(["address.city", "email"]);
        filled(made);
        expect(made.check()).toEqual({ name: "Ann", email: "ann@example.com", qty: 1, tags: [], address: { city: "Cairo" } });

    });
    it("a stepper clamps its index, reveals the errors of the step it checks, and walks an empty plan to done", () => {

        const made = define();
        const steps = form.stepper(made, [["name", "email"], ["qty", "tags"], ["address.city"]]);
        const seen: form.StepState[] = [];
        const stop = steps.watch(( current ) => { seen.push(current); });

        steps.go(Number.NaN);
        steps.go(-4);
        steps.go(1.9);
        expect([steps.index(), steps.total(), seen.length]).toEqual([1, 3, 1]);
        steps.go(Number.POSITIVE_INFINITY);
        expect([steps.index(), steps.done(), steps.last(), steps.fields()]).toEqual([3, true, true, []]);
        steps.back();
        steps.back();
        steps.back();
        steps.back();
        expect([steps.index(), steps.first()]).toEqual([0, true]);
        expect([steps.valid(), Object.keys(made.errors()).sort(), [...made.state.getState().touched].sort()]).toEqual([false, ["email", "name"], ["email", "name"]]);
        made.set("name", "Ann");
        made.set("email", "ann@example.com");
        expect([steps.next(), steps.index(), made.errors()]).toEqual([true, 1, {}]);
        expect([steps.next(), steps.index()]).toEqual([true, 2]);
        made.fail({ _form: "server said no" });
        expect([steps.valid(), steps.next(), steps.index()]).toEqual([false, false, 2]);
        made.forgive();
        made.set("address.city", "Cairo");
        expect([steps.next(), steps.done(), steps.next(), steps.index()]).toEqual([true, true, true, 3]);
        stop();
        expect(seen.map(( state ) => state.index)).toEqual([1, 3, 2, 1, 0, 1, 2, 3]);

        const empty = form.stepper(made, []);

        expect([empty.state(), empty.next(), empty.valid(), empty.total()]).toEqual([{ index: 0, total: 0, fields: [], first: true, last: true, done: true }, true, true, 0]);

    });
    it("survivors: handle cache rolls over, non-index keys under a list stay put, same-path watchers drop mid-delivery, reset forgets the key", async () => {

        const made = define();
        const first = made.field("p0");

        for ( let at = 1; at <= 1024; at += 1 ) made.field(`p${at}`);

        expect([made.field("p0") === first, first.get(), made.field("p0").path]).toEqual([false, undefined, "p0"]);

        const rows = made.rows("tags");

        rows.push("a", "b");
        made.fail({ "tags.meta": "x", "tags.1": "y", "tags.1.deep": "z", "tags.01": "w" });
        rows.insert(0, "z");
        expect(made.errors()).toEqual({ "tags.meta": "x", "tags.2": "y", "tags.2.deep": "z", "tags.01": "w" });

        const heard: string[] = [];
        let stopSecond: (() => void) | undefined;

        made.watch("qty", () => {

            heard.push("first");
            stopSecond?.();

        });
        stopSecond = made.watch("qty", () => { heard.push("second"); });
        made.set("qty", 5);
        expect(heard).toEqual(["first"]);

        const keys: string[] = [];
        let failing = true;
        const keyed = define({ submit: async ( _, key ) => {

            keys.push(key);

            if ( failing ) throw error.fault("unavailable", "down");

            return 1;

        } });

        filled(keyed);
        await keyed.submit();
        keyed.reset();
        filled(keyed);
        failing = false;
        await keyed.submit();
        expect([keys.length, keys[0] === keys[1]]).toEqual([2, false]);

    });
    it("survivors: a clean field reset is a no-op, changes compare by value, and a root issue blocks only the last step", () => {

        const made = define();
        let fired = 0;

        made.watch("*", () => { fired += 1; });
        made.field("qty").reset();
        made.field("tags").reset();
        expect(fired).toBe(0);
        made.set("tags", []);
        made.set("address", { city: "" });
        expect([fired, made.values().tags === initial.tags, made.changes(), made.dirty()]).toEqual([2, false, {}, false]);

        const rooted = form.define({
            schema: validate.object({ a: validate.string().check(validate.minLength(1)), b: validate.string().check(validate.minLength(1)) }).check(validate.refine(( value: { a: string; b: string } ) => value.a !== value.b, "same")),
            initial: { a: "x", b: "x" },
            submit: async ( value ) => value,
        });
        const steps = form.stepper(rooted, [["a"], ["b"]]);

        expect([steps.next(), steps.index(), rooted.errors()]).toEqual([true, 1, {}]);
        expect([steps.next(), steps.index(), rooted.errors()]).toEqual([false, 1, { _form: "same" }]);
        rooted.set("b", "y");
        expect([steps.next(), steps.done()]).toEqual([true, true]);

    });
});
