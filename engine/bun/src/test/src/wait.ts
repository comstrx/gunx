import * as error from "engine-error";
import * as log from "engine-log";

export type Logs = { logger: log.Logger; entries: log.Entry[]; messages: () => string[]; clear: () => void };

const longest = 2_147_483_647;

function span ( value: number | undefined, fallback: number ): number {

    return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(0, value), longest) : fallback;

}

export function tick ( ms = 0 ): Promise<void> {

    return new Promise(( resolve ) => setTimeout(resolve, span(ms, 0)));

}
export function until<T> ( check: () => T | Promise<T>, options: { timeout?: number | undefined; every?: number | undefined; message?: string | undefined } = {} ): Promise<T> {

    const limit = span(options.timeout, 2000);
    const every = span(options.every, 5);
    const late = error.fault("timeout", "test.until", { message: options.message ?? `until: not met within ${limit}ms` });

    return new Promise<T>(( resolve, reject ) => {

        let done = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const close = (): boolean => {

            if ( done ) return false;

            done = true;
            clearTimeout(deadline);
            clearTimeout(timer);

            return true;

        };
        const attempt = (): void => {

            Promise.resolve().then(check).then(( value ) => {

                if ( done ) return;

                if ( !value ) timer = setTimeout(attempt, every);
                else if ( close() ) resolve(value);

            }, ( caught: unknown ) => {

                if ( close() ) reject(caught);

            });

        };
        const deadline = setTimeout(() => {

            if ( close() ) reject(late);

        }, limit);

        attempt();

    });

}
export function logs ( level: log.Level = "debug" ): Logs {

    const memory = log.memorySink(1000);
    const logger = log.create({ name: "test", level, sinks: [memory], redact: false });

    return { logger, entries: memory.entries, messages: () => memory.entries.map(( entry ) => entry.message), clear: memory.clear };

}
