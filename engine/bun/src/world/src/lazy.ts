import * as error from "engine-error";

export type Catalog = "countries" | "currencies" | "languages" | "emoji";
export type Slot<T> = { get: () => T; ready: () => boolean; load: () => Promise<T>; fill: ( value: T ) => void };

export const catalogs: readonly Catalog[] = ["countries", "currencies", "languages", "emoji"];

export function word ( value: unknown ): string {

    return typeof value === "string" ? value : "";

}
export function baseOf ( code: string ): string {

    const text = word(code).trim();
    const dash = text.indexOf("-");
    const under = text.indexOf("_");
    const end = dash === -1 ? under : under === -1 ? dash : Math.min(dash, under);

    return (end === -1 ? text : text.slice(0, end)).toLowerCase();

}
export function rootOf ( folder: string ): string {

    let end = folder.length;

    while ( end > 0 && folder.charCodeAt(end - 1) === 47 ) end -= 1;

    return end === folder.length ? folder : folder.slice(0, end);

}
export function slot<T> ( name: Catalog, read: () => Promise<T> ): Slot<T> {

    let value: T | undefined;
    let loading: Promise<T> | undefined;

    return {
        get: () => {

            if ( value === undefined ) throw error.fault("unavailable", "world.unloaded", { message: `world: load("${name}") before reading it`, errors: { catalog: [name] } });

            return value;

        },
        ready: () => value !== undefined,
        load: () => {

            if ( loading ) return loading;

            const asked: Promise<T> = Promise.resolve().then(read).then(
                ( found ) => {

                    if ( loading !== asked && value !== undefined ) return value;

                    value = found;

                    return found;

                },
                ( cause: unknown ) => {

                    if ( loading === asked ) loading = undefined;

                    throw error.fault("unavailable", "world.refused", { message: `world: the ${name} catalog did not load`, cause, errors: { catalog: [name] } });

                },
            );

            loading = asked;

            return asked;

        },
        fill: ( given ) => {

            value = given;
            loading = Promise.resolve(given);

        },
    };

}
export function live<T extends object> ( read: () => T ): T {

    return new Proxy({} as T, {
        get: ( _, key ) => Reflect.get(read(), key),
        has: ( _, key ) => Reflect.has(read(), key),
        ownKeys: () => Reflect.ownKeys(read()),
        getOwnPropertyDescriptor: ( _, key ) => {

            const found = Reflect.getOwnPropertyDescriptor(read(), key);

            return found ? { ...found, configurable: true } : undefined;

        },
    });

}
export function once<T> ( make: () => T ): () => T {

    let made: T | undefined;
    let done = false;

    return () => {

        if ( done ) return made as T;

        made = make();
        done = true;

        return made;

    };

}
export function over<S, T> ( read: () => S, make: ( source: S ) => T ): () => T {

    let from: S | undefined;
    let made: T | undefined;
    let done = false;

    return () => {

        const source = read();

        if ( done && source === from ) return made as T;

        made = make(source);
        from = source;
        done = true;

        return made;

    };

}
