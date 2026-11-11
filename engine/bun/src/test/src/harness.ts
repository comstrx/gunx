import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import * as error from "engine-error";

export type Env = { restore: () => void };
export type Temp = { path: string; file: ( name: string ) => string; write: ( name: string, content: string | Uint8Array ) => string; remove: () => void };
export type Spy<A extends unknown[], R> = (( ...args: A ) => R) & { calls: A[]; results: R[]; failures: unknown[]; reset: () => void };

type Layer = { value: unknown };
type Stack<T> = { base: T; layers: Layer[] };

const unsafe = /[^A-Za-z0-9._-]/g;
const variable = /^[^=\0]+$/;
const envs = new Map<string, Stack<string | undefined>>();
const patches = new Map<string, Stack<PropertyDescriptor | undefined>>();

function put ( key: string, value: unknown ): void {

    if ( typeof value === "string" ) process.env[key] = value;
    else Reflect.deleteProperty(process.env, key);

}
function peeled<T> ( stacks: Map<string, Stack<T>>, key: string, layer: Layer ): Stack<T> | undefined {

    const stack = stacks.get(key);
    const at = stack ? stack.layers.indexOf(layer) : -1;

    if ( !stack || at === -1 ) return undefined;

    stack.layers.splice(at, 1);

    if ( stack.layers.length === 0 ) stacks.delete(key);

    return stack;

}
function inside ( root: string, name: string ): string {

    const made = typeof name === "string" && !name.includes("\0") ? resolve(root, name) : root;

    if ( !made.startsWith(`${root}${sep}`) ) throw error.fault("internal", "test.path", { message: `${String(name).slice(0, 120)}: not a file inside the folder` });

    return made;

}
function sealed ( held: PropertyDescriptor | undefined ): boolean {

    return held !== undefined && !held.configurable && !held.writable;

}
function place ( key: string, value: unknown, held: PropertyDescriptor | undefined ): void {

    if ( held && !held.configurable ) {

        if ( !Reflect.set(globalThis, key, value) ) throw error.fault("internal", "test.global", { message: `${key}: the global is not writable` });

        return;

    }

    if ( value === undefined ) {

        Reflect.deleteProperty(globalThis, key);

        if ( !(key in globalThis) ) return;

    }

    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true, enumerable: held?.enumerable ?? true });

}
function back ( key: string, held: PropertyDescriptor | undefined ): void {

    if ( held === undefined ) Reflect.deleteProperty(globalThis, key);
    else if ( held.configurable ) Object.defineProperty(globalThis, key, held);
    else Reflect.set(globalThis, key, held.value);

}

export function env ( values: Record<string, string | undefined> ): Env {

    const mine: [string, Layer][] = [];
    const keys = Object.keys(values);

    for ( const key of keys ) {

        const value = values[key];

        if ( !variable.test(key) || (value !== undefined && typeof value !== "string") ) throw error.fault("internal", "test.env", { message: `${key.slice(0, 120)}: not an environment variable` });

    }

    for ( const key of keys ) {

        const stack = envs.get(key) ?? { base: process.env[key], layers: [] };
        const layer: Layer = { value: values[key] };

        stack.layers.push(layer);
        envs.set(key, stack);
        mine.push([key, layer]);
        put(key, layer.value);

    }

    return {
        restore: () => {

            for ( const [key, layer] of mine.reverse() ) {

                const stack = peeled(envs, key, layer);

                if ( stack ) put(key, stack.layers.length === 0 ? stack.base : stack.layers.at(-1)?.value);

            }

            mine.length = 0;

        },
    };

}
export function tmp ( prefix = "engine-" ): Temp {

    const path = resolve(mkdtempSync(`${tmpdir()}${sep}${String(prefix).replace(unsafe, "").slice(0, 64) || "engine-"}`));

    return {
        path,
        file: ( name ) => inside(path, name),
        write: ( name, content ) => {

            const target = inside(path, name);

            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, content);

            return target;

        },
        remove: () => rmSync(path, { recursive: true, force: true }),
    };

}
export function globals ( patch: Record<string, unknown> ): () => void {

    const mine: [string, Layer][] = [];
    const keys = Object.keys(patch);
    const undo = (): void => {

        for ( const [key, layer] of mine.reverse() ) {

            const stack = peeled(patches, key, layer);
            const top = stack?.layers.at(-1);

            if ( stack && top ) place(key, top.value, Object.getOwnPropertyDescriptor(globalThis, key));
            else if ( stack ) back(key, stack.base);

        }

        mine.length = 0;

    };

    for ( const key of keys ) {

        if ( sealed(Object.getOwnPropertyDescriptor(globalThis, key)) ) throw error.fault("internal", "test.global", { message: `${key}: the global is sealed` });

    }

    try {

        for ( const key of keys ) {

            const held = Object.getOwnPropertyDescriptor(globalThis, key);
            const stack = patches.get(key) ?? { base: held, layers: [] };
            const layer: Layer = { value: patch[key] };

            place(key, layer.value, held);
            stack.layers.push(layer);
            patches.set(key, stack);
            mine.push([key, layer]);

        }

    } catch ( caught ) {

        undo();

        throw caught;

    }

    return undo;

}
export function spy<A extends unknown[], R> ( implementation: ( ...args: A ) => R = (() => undefined) as ( ...args: A ) => R ): Spy<A, R> {

    const made = function ( this: unknown, ...args: A ): R {

        made.calls.push(args);

        try {

            const result = implementation.apply(this, args);

            made.results.push(result);

            return result;

        } catch ( caught ) {

            made.failures.push(caught);

            throw caught;

        }

    } as Spy<A, R>;

    made.calls = [];
    made.results = [];
    made.failures = [];
    made.reset = () => {

        made.calls.length = 0;
        made.results.length = 0;
        made.failures.length = 0;

    };

    return made;

}
