import * as error from "engine-error";
import * as event from "engine-event";
import * as json from "engine-json";
import * as list from "engine-list";
import * as rand from "engine-rand";
import * as state from "engine-state";
import * as validate from "engine-validate";

export type Status = "idle" | "pending" | "done" | "failed";
export type Errors = Readonly<Record<string, string>>;
export type Mode = "change" | "blur" | "submit";
export type Paths = readonly string[] | string;
export type Seat = ( index: number ) => number | undefined;
export type Ask<V> = ( value: unknown, values: V, signal: AbortSignal ) => Promise<string | undefined> | string | undefined;
export type State<V, R> = {
    values: V;
    initial: V;
    touched: readonly string[];
    errors: Errors;
    served: Errors;
    checking: readonly string[];
    status: Status;
    result: R | undefined;
    fault: error.Fault | undefined;
    submits: number;
    attempts: number;
};
export type Moves<V> = {
    put: ( path: string, value: unknown ) => void;
    patch: ( values: Partial<V> ) => void;
    seat: ( path: string, items: readonly unknown[], seat: Seat ) => void;
    touch: ( path: string ) => void;
    fail: ( errors: Errors ) => void;
    forgive: ( path?: string ) => void;
    reset: ( values?: V ) => void;
    rebase: ( values?: V ) => void;
};
export type Field = {
    readonly path: string;
    get: <T = unknown>() => T;
    set: ( value: unknown ) => void;
    touch: () => void;
    reset: () => void;
    error: () => string | undefined;
    touched: () => boolean;
    dirty: () => boolean;
    checking: () => boolean;
};
export type Rows = {
    items: <T = unknown>() => T[];
    length: () => number;
    push: ( ...values: readonly unknown[] ) => void;
    insert: ( index: number, ...values: readonly unknown[] ) => void;
    replace: ( index: number, value: unknown ) => void;
    remove: ( index: number ) => void;
    move: ( from: number, to: number ) => void;
    swap: ( a: number, b: number ) => void;
    clear: () => void;
};
export type Watcher<V> = ( values: V, changed: string ) => void;
export type Options<V extends object, O, R> = {
    schema: validate.Schema<O>;
    initial: V;
    submit: ( value: O, key: string, signal: AbortSignal ) => Promise<R>;
    fallback?: string | undefined;
    mode?: Mode | undefined;
    recheck?: Mode | undefined;
    rebase?: boolean | undefined;
    verify?: Readonly<Record<string, Ask<V>>> | undefined;
    watch?: Readonly<Record<string, Watcher<V>>> | undefined;
};
export type Form<V extends object, O, R> = {
    state: state.Instance<State<V, R>, Moves<V>>;
    field: ( path: string ) => Field;
    rows: ( path: string ) => Rows;
    watch: ( paths: Paths, watcher: Watcher<V> ) => () => void;
    set: ( path: string, value: unknown ) => void;
    patch: ( values: Partial<V> ) => void;
    touch: ( path: string ) => void;
    fail: ( errors: Errors ) => void;
    forgive: ( path?: string ) => void;
    check: ( paths?: Paths ) => O | undefined;
    verify: ( path: string, ask?: Ask<V> ) => Promise<boolean>;
    submit: () => Promise<R | undefined>;
    abort: () => void;
    reset: ( values?: V ) => void;
    rebase: ( values?: V ) => void;
    status: () => Status;
    fault: () => error.Fault | undefined;
    dirty: ( path?: string ) => boolean;
    changes: () => Partial<V>;
    valid: ( paths?: Paths ) => boolean;
    values: () => V;
    errors: () => Errors;
};

type Found<O> = { ok: boolean; value: O | undefined; issues: Errors };
type Flight<V> = { controller: AbortController; ask: Ask<V>; value: unknown; done: Promise<boolean> };
type Clean<V> = { ask: Ask<V>; value: unknown };

export const root = "_form";

const most = 1024;
const deepest = 64;

function kept<T> ( map: Map<string, T>, path: string, make: () => T ): T {

    const known = map.get(path);

    if ( known !== undefined ) return known;
    if ( map.size >= most ) map.clear();

    const made = make();

    map.set(path, made);

    return made;

}
function own<T> ( map: Readonly<Record<string, T>>, path: string ): T | undefined {

    return Object.hasOwn(map, path) ? map[path] : undefined;

}
function many ( paths: Paths ): readonly string[] {

    return typeof paths === "string" ? [paths] : paths;

}
function under ( path: string, parent: string ): boolean {

    return path === parent || path.startsWith(`${parent}.`);

}
function related ( one: string, other: string ): boolean {

    return under(one, other) || under(other, one);

}
function covers ( watched: string, changed: string ): boolean {

    return watched === "*" || changed === "*" || related(watched, changed);

}
function sift ( errors: Errors, keep: ( path: string ) => boolean ): Errors {

    return Object.fromEntries(Object.entries(errors).filter(([path]) => keep(path)));

}
function shown ( errors: Errors, paths: readonly string[] ): Errors {

    return sift(errors, ( path ) => paths.some(( seen ) => related(path, seen)));

}
function cleared ( errors: Errors, paths: readonly string[] ): Errors {

    return sift(errors, ( path ) => path !== root && !paths.some(( edited ) => under(path, edited)));

}
function seated ( key: string, path: string, seat: Seat ): string | undefined {

    if ( !key.startsWith(`${path}.`) ) return key;

    const [head = "", ...tail] = key.slice(path.length + 1).split(".");

    if ( !/^(?:0|[1-9]\d*)$/.test(head) ) return key;

    const to = seat(Number(head));

    return to === undefined ? undefined : [path, String(to), ...tail].join(".");

}
export function define<V extends object, O, R> ( options: Options<V, O, R> ): Form<V, O, R> {

    const { schema, submit, fallback = "invalid", mode = "blur", recheck = "change" } = options;
    const asks: Readonly<Record<string, Ask<V>>> = options.verify ?? {};
    const watchers = new Map<string, Set<Watcher<V>>>();
    const flights = new Map<string, Flight<V>>();
    const clean = new Map<string, Clean<V>>();
    const fields = new Map<string, Field>();
    const tables = new Map<string, Rows>();
    let key: string | undefined;
    let sent: O | undefined;
    let run = 0;
    let sending: AbortController | undefined;
    let flight: Promise<R | undefined> | undefined;
    let depth = 0;
    const after = (): Mode => (held.getState().attempts > 0 ? recheck : mode);
    const fire = ( changed: readonly string[] ): void => {

        let thrown: { cause: unknown } | undefined;

        if ( depth >= deepest ) throw error.fault("internal", "form.loop", { message: `watchers of ${changed.join(", ")} keep changing the form` });

        depth += 1;

        try {

            for ( const path of changed ) {

                const called = new Set<Watcher<V>>();

                for ( const [watched, set] of [...watchers] ) {

                    if ( !covers(watched, path) ) continue;

                    for ( const watcher of [...set] ) {

                        if ( called.has(watcher) || !set.has(watcher) ) continue;

                        called.add(watcher);

                        try {

                            watcher(held.getState().values, path);

                        } catch ( cause ) {

                            if ( !thrown ) thrown = { cause };

                        }

                    }

                }

            }

        } finally {

            depth -= 1;

        }

        if ( thrown ) throw thrown.cause;

    };
    const halt = ( hit: ( path: string ) => boolean ): boolean => {

        let found = false;

        for ( const [path, running] of [...flights] ) {

            if ( !hit(path) ) continue;

            flights.delete(path);
            running.controller.abort();
            found = true;

        }

        return found;

    };
    const read = (): Found<O> => {

        const found = validate.check(schema, held.getState().values);

        return found.ok ? { ok: true, value: found.value, issues: {} } : { ok: false, value: undefined, issues: error.formErrors(found.fault, fallback) };

    };
    const probe = ( reveal: readonly string[] | "all" | "touched" ): O | undefined => {

        const current = held.getState();
        const found = read();
        const seen = reveal === "all" ? found.issues : shown(found.issues, reveal === "touched" ? current.touched : [...current.touched, ...reveal]);
        const touched = reveal === "touched" ? current.touched : list.unique([...current.touched, ...Object.keys(seen).filter(( path ) => path !== root)]);
        const errors = { ...seen, ...current.served };

        if ( touched.length !== current.touched.length || !json.equal(errors, current.errors) ) held.setState({ errors, touched });

        return found.value;

    };
    const edit = ( changed: readonly string[], next: ( current: State<V, R> ) => Partial<State<V, R>> ): void => {

        const current = held.getState();
        const halted = halt(( path ) => changed.some(( edited ) => related(path, edited)));

        held.setState({ status: current.status === "pending" ? "pending" : "idle", ...(halted ? { checking: [...flights.keys()] } : {}), ...next(current) });

        if ( after() === "change" ) probe("touched");

        fire(changed);

    };
    const put = ( path: string, value: unknown ): void => {

        const before = held.getState().values;

        if ( Object.is(json.pathGet(before, path), value) ) return;

        const values = json.pathSet(before as json.Dictionary, path, value) as V;

        if ( values !== before ) edit([path], ( current ) => ({ values, errors: cleared(current.errors, [path]), served: cleared(current.served, [path]) }));

    };
    const patch = ( values: Partial<V> ): void => {

        const next: json.Dictionary = { ...(held.getState().values as json.Dictionary) };
        const changed: string[] = [];

        for ( const [name, value] of Object.entries(values) ) {

            if ( !json.safeKey(name) || Object.is(json.pathGet(next, [name]), value) ) continue;

            next[name] = value;
            changed.push(name);

        }

        if ( changed.length ) edit(changed, ( current ) => ({ values: next as V, errors: cleared(current.errors, changed), served: cleared(current.served, changed) }));

    };
    const seat = ( path: string, items: readonly unknown[], to: Seat ): void => {

        const before = held.getState().values;
        const values = json.pathSet(before as json.Dictionary, path, [...items]) as V;
        const moved = ( errors: Errors ): Errors => {

            const out: Record<string, string> = {};

            for ( const [from, message] of Object.entries(cleared(errors, [])) ) {

                const at = from === path ? undefined : seated(from, path, to);

                if ( at !== undefined ) out[at] = message;

            }

            return out;

        };

        if ( values === before ) return;

        edit([path], ( current ) => ({
            values,
            touched: list.unique(current.touched.flatMap(( seen ) => seated(seen, path, to) ?? [])),
            errors: moved(current.errors),
            served: moved(current.served),
        }));

    };
    const verify = ( path: string, ask: Ask<V> | undefined = own(asks, path) ): Promise<boolean> => {

        const { values, served } = held.getState();
        const value = json.pathGet(values, path);
        const known = clean.get(path);
        const running = flights.get(path);

        if ( !ask ) return Promise.resolve(true);
        if ( own(served, path) !== undefined || Object.keys(shown(read().issues, [path])).length ) return Promise.resolve(false);
        if ( known && known.ask === ask && Object.is(known.value, value) ) return Promise.resolve(true);
        if ( running && running.ask === ask && Object.is(running.value, value) ) return running.done;

        const controller = new AbortController();
        const mine = (): boolean => flights.get(path)?.controller === controller;
        const done = event.race(Promise.resolve().then(() => ask(value, values, controller.signal)), controller.signal).then(( message ) => {

            if ( !mine() ) return false;

            flights.delete(path);

            const current = held.getState();

            if ( message ) held.setState({ checking: [...flights.keys()], errors: { ...current.errors, [path]: message }, served: { ...current.served, [path]: message } });
            else held.setState({ checking: [...flights.keys()] });

            if ( !message ) clean.set(path, { ask, value });

            return !message;

        }, () => {

            if ( !mine() ) return false;

            flights.delete(path);
            held.setState({ checking: [...flights.keys()] });

            return false;

        });

        running?.controller.abort();
        flights.set(path, { controller, ask, value, done });
        held.setState({ checking: [...flights.keys()] });

        return done;

    };
    const touch = ( path: string ): void => {

        const current = held.getState();

        if ( !current.touched.includes(path) ) held.setState({ touched: [...current.touched, path] });
        if ( after() !== "submit" ) probe("touched");
        if ( Object.hasOwn(asks, path) ) void verify(path);

    };
    const fail = ( errors: Errors ): void => {

        const current = held.getState();

        held.setState({ errors: { ...current.errors, ...errors }, served: { ...current.served, ...errors }, status: "failed" });

    };
    const forgive = ( path?: string ): void => {

        const current = held.getState();
        const left = ( errors: Errors ): Errors => (path === undefined ? {} : sift(errors, ( found ) => !under(found, path)));

        held.setState({ errors: left(current.errors), served: left(current.served) });

    };
    const abort = (): void => {

        if ( !sending ) return;

        run += 1;
        sending.abort();
        sending = undefined;
        flight = undefined;
        held.setState({ status: "idle" });

    };
    const reset = ( values?: V ): void => {

        const initial = values ?? held.getState().initial;

        key = undefined;
        sent = undefined;
        run += 1;
        sending?.abort();
        sending = undefined;
        flight = undefined;
        halt(() => true);
        clean.clear();
        held.setState({ values: initial, initial, touched: [], errors: {}, served: {}, checking: [], status: "idle", result: undefined, fault: undefined, attempts: 0 });
        fire(["*"]);

    };
    const rebase = ( values?: V ): void => held.setState({ initial: values ?? held.getState().values });
    const dirty = ( path?: string ): boolean => {

        const { values, initial } = held.getState();

        return path === undefined ? !json.equal(values, initial) : !json.equal(json.pathGet(values, path), json.pathGet(initial, path));

    };
    const send = async (): Promise<R | undefined> => {

        const value = probe("all");
        const attempts = held.getState().attempts + 1;

        if ( value === undefined ) {

            held.setState({ status: "failed", attempts });

            return undefined;

        }

        const controller = new AbortController();
        const using = key !== undefined && json.equal(sent, value) ? key : rand.ulid();
        const taken = held.getState().values;
        const turn = run + 1;

        key = using;
        sent = value;
        run = turn;
        sending = controller;
        halt(() => true);
        held.setState({ status: "pending", errors: {}, served: {}, checking: [], fault: undefined, attempts, submits: held.getState().submits + 1 });

        try {

            const result = await event.race(Promise.resolve().then(() => submit(value, using, controller.signal)), controller.signal);

            if ( turn !== run ) return undefined;

            key = undefined;
            sent = undefined;
            held.setState({ status: "done", result, ...(options.rebase ? { initial: taken } : {}) });

            return result;

        } catch ( thrown ) {

            if ( turn !== run ) return undefined;

            const fault = error.of(thrown);
            const errors = error.formErrors(fault, fallback);
            const current = held.getState();

            held.setState({ errors: { ...current.errors, ...errors }, served: { ...current.served, ...errors }, status: "failed", fault });

            return undefined;

        } finally {

            if ( sending === controller ) sending = undefined;

        }

    };
    const held: state.Instance<State<V, R>, Moves<V>> = state.define<State<V, R>, Moves<V>>({
        name: "form",
        initial: { values: options.initial, initial: options.initial, touched: [], errors: {}, served: {}, checking: [], status: "idle", result: undefined, fault: undefined, submits: 0, attempts: 0 },
        actions: () => ({ put, patch, seat, touch, fail, forgive, reset, rebase }),
    }).create();
    const field = ( path: string ): Field => kept(fields, path, () => ({
        path,
        get: <T>() => json.pathGet(held.getState().values, path) as T,
        set: ( value ) => put(path, value),
        touch: () => touch(path),
        reset: () => {

            const { values, initial } = held.getState();
            const first = json.pathGet(initial, path);

            if ( Object.is(json.pathGet(values, path), first) && !held.getState().touched.some(( seen ) => under(seen, path)) ) return;

            const restored = json.pathSet(values as json.Dictionary, path, first) as V;

            edit([path], ( current ) => ({
                values: restored,
                touched: current.touched.filter(( seen ) => !under(seen, path)),
                errors: cleared(current.errors, [path]),
                served: cleared(current.served, [path]),
            }));

        },
        error: () => own(held.getState().errors, path),
        touched: () => held.getState().touched.includes(path),
        dirty: () => dirty(path),
        checking: () => held.getState().checking.includes(path),
    }));
    const rows = ( path: string ): Rows => kept(tables, path, () => {

        const items = (): unknown[] => {

            const found = json.pathGet(held.getState().values, path);

            return Array.isArray(found) ? found : [];

        };
        const inside = ( ...indexes: readonly number[] ): boolean => indexes.every(( index ) => Number.isInteger(index) && index >= 0 && index < items().length);

        return {
            items: <T>() => items() as T[],
            length: () => items().length,
            push: ( ...values ) => {

                if ( values.length ) seat(path, [...items(), ...values], ( seen ) => seen);

            },
            insert: ( index, ...values ) => {

                const at = Math.min(Math.max(0, Math.trunc(index) || 0), items().length);

                if ( values.length ) seat(path, list.insertAt(items(), at, ...values), ( seen ) => (seen >= at ? seen + values.length : seen));

            },
            replace: ( index, value ) => {

                if ( inside(index) ) put(`${path}.${index}`, value);

            },
            remove: ( index ) => {

                if ( inside(index) ) seat(path, list.removeAt(items(), index), ( seen ) => (seen === index ? undefined : seen > index ? seen - 1 : seen));

            },
            move: ( from, to ) => {

                if ( !inside(from, to) || from === to ) return;

                const step = from < to ? -1 : 1;
                const [low, high] = from < to ? [from, to] : [to, from];

                seat(path, list.move(items(), from, to), ( seen ) => (seen === from ? to : seen >= low && seen <= high ? seen + step : seen));

            },
            swap: ( a, b ) => {

                if ( inside(a, b) && a !== b ) seat(path, list.swap(items(), a, b), ( seen ) => (seen === a ? b : seen === b ? a : seen));

            },
            clear: () => {

                if ( items().length ) seat(path, [], () => undefined);

            },
        };

    });
    const form: Form<V, O, R> = {
        state: held,
        field,
        rows,
        set: put,
        patch,
        touch,
        fail,
        forgive,
        verify,
        abort,
        reset,
        rebase,
        dirty,
        values: () => held.getState().values,
        errors: () => held.getState().errors,
        status: () => held.getState().status,
        fault: () => held.getState().fault,
        changes: () => {

            const { values, initial } = held.getState();

            return Object.fromEntries(Object.entries(values).filter(([name, value]) => !json.equal(value, json.pathGet(initial, [name])))) as Partial<V>;

        },
        valid: ( paths ) => {

            const found = read();

            return paths === undefined ? found.ok : Object.keys(shown(found.issues, many(paths))).length === 0;

        },
        check: ( paths ) => probe(paths === undefined ? "all" : many(paths)),
        watch: ( paths, watcher ) => {

            const wanted = many(paths);

            for ( const path of wanted ) {

                const set = watchers.get(path) ?? new Set<Watcher<V>>();

                set.add(watcher);
                watchers.set(path, set);

            }

            return () => {

                for ( const path of wanted ) {

                    const set = watchers.get(path);

                    set?.delete(watcher);

                    if ( set?.size === 0 ) watchers.delete(path);

                }

            };

        },
        submit: () => {

            if ( flight ) return flight;

            const mine: Promise<R | undefined> = send().finally(() => {

                if ( flight === mine ) flight = undefined;

            });

            flight = mine;

            return mine;

        },
    };

    for ( const [paths, watcher] of Object.entries(options.watch ?? {}) ) form.watch(paths.split(",").map(( path ) => path.trim()), watcher);

    return form;

}
