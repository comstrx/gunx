import * as crypto from "engine-crypto";
import * as date from "engine-date";
import * as error from "engine-error";
import * as json from "engine-json";
import * as state from "engine-state";
import type { Renew, Renewing, Session, SessionMoves, SessionOptions, Signed, Tokens } from "./arch.ts";

const final = new Set<error.Code>(["bad_request", "unauthorized", "forbidden", "not_found", "gone", "validation"]);

function sound ( tokens: unknown ): tokens is Tokens {

    if ( !json.isRecord(tokens) || typeof tokens.access !== "string" || tokens.access === "" ) return false;
    if ( tokens.refresh !== undefined && typeof tokens.refresh !== "string" ) return false;

    return tokens.expires === undefined || (typeof tokens.expires === "number" && Number.isFinite(tokens.expires));

}
function held ( tokens: Tokens ): Tokens {

    if ( !sound(tokens) ) throw error.fault("internal", "auth.tokens");

    return { ...withExpiry(tokens) };

}
export function expiryOf ( token: string ): number | undefined {

    const exp = crypto.decodeToken(token)?.exp;

    return typeof exp === "number" ? exp * 1000 : undefined;

}
export function withExpiry ( tokens: Tokens ): Tokens {

    if ( tokens.expires !== undefined ) return tokens;

    const expires = expiryOf(tokens.access);

    return expires === undefined ? tokens : { ...tokens, expires };

}
export function session<U> ( options: SessionOptions ): Session<U> {

    const { name, box, renew, skew = 30_000, now = date.now } = options;

    if ( !Number.isFinite(skew) || skew < 0 ) throw new RangeError("not a duration");

    let revision = 0;
    let flight: Promise<string | null> | undefined;
    let renewing: Renewing | undefined;
    const invalidate = (): void => {

        revision += 1;
        flight = undefined;

        const gone = renewing;

        renewing = undefined;
        gone?.controller.abort();

    };
    const kept = state.define<Signed<U>, SessionMoves<U>>({
        name,
        initial: { tokens: null, user: null, since: null },
        persist: {
            box,
            keys: ["tokens", "user", "since"],
            sync: options.sync ?? true,
            version: options.version,
            fail: options.fail,
            accept: ( saved ) => {

                if ( saved.tokens === null || saved.tokens === undefined ) return { tokens: null, user: null, since: null };

                return sound(saved.tokens) ? { tokens: saved.tokens, user: saved.user ?? null, since: typeof saved.since === "number" ? saved.since : null } : undefined;

            },
        },
        actions: ( set ) => ({
            begin: ( tokens, user ) => {

                const owned = held(tokens);
                const since = now();

                invalidate();
                set({ tokens: owned, user, since });

            },
            end: () => {

                invalidate();
                set({ tokens: null, user: null, since: null });

            },
            renewed: ( tokens ) => set(( current ) => ({ tokens: held({ ...tokens, refresh: tokens.refresh ?? current.tokens?.refresh }) })),
            update: ( user ) => set({ user }),
        }),
    }).create();
    const fresh = ( tokens: Tokens ): boolean => tokens.expires === undefined || tokens.expires - skew > now();
    const current = (): string | null => {

        const { tokens } = kept.getState();

        return tokens && fresh(tokens) ? tokens.access : null;

    };
    const exchange = async ( used: string, turn: number ): Promise<string | null> => {

        await kept.reload();

        const owned = kept.getState().tokens;

        if ( turn !== revision || !owned || owned.refresh !== used ) return current();

        const controller = new AbortController();
        const moved = (): boolean => turn !== revision || kept.getState().tokens !== owned;

        renewing = { controller, tokens: owned };

        try {

            const next = await (renew as Renew)(used, controller.signal);

            if ( moved() ) return current();

            renewing = undefined;
            kept.getState().renewed(next);

            const written = kept.getState().tokens;

            await kept.flush();

            return turn !== revision || kept.getState().tokens !== written ? current() : next.access;

        } catch ( thrown ) {

            const fault = error.of(thrown);

            if ( moved() ) return current();
            if ( final.has(fault.code) ) kept.getState().end();

            throw fault;

        } finally {

            if ( renewing?.controller === controller ) renewing = undefined;

        }

    };
    const refresh = ( tokens: Tokens ): Promise<string | null> => {

        const used = tokens.refresh;

        if ( !renew || !used ) {

            kept.getState().end();

            return Promise.resolve(null);

        }

        const lock = box.storage.lock;
        const turn = revision;

        return lock === undefined ? exchange(used, turn) : lock(`${kept.key}.renew`, () => exchange(used, turn));

    };
    const renewal = ( tokens: Tokens ): Promise<string | null> => {

        if ( flight ) return flight;

        const mine: Promise<string | null> = refresh(tokens).finally(() => {

            if ( flight === mine ) flight = undefined;

        });

        flight = mine;

        return mine;

    };

    kept.subscribe(( next ) => {

        if ( !renewing || next.tokens === renewing.tokens ) return;

        renewing.controller.abort();
        renewing = undefined;
        flight = undefined;

    });

    return {
        state: kept,
        begin: ( tokens, user ) => kept.getState().begin(tokens, user),
        end: () => kept.getState().end(),
        update: ( user ) => kept.getState().update(user),
        signed: () => kept.getState().tokens !== null,
        user: () => kept.getState().user,
        hydrate: () => kept.hydrate(),
        flush: () => kept.flush(),
        expiresIn: () => {

            const expires = kept.getState().tokens?.expires;

            return expires === undefined ? undefined : Math.max(0, expires - now());

        },
        token: () => {

            const { tokens } = kept.getState();

            if ( !tokens ) return Promise.resolve(null);

            return fresh(tokens) ? Promise.resolve(tokens.access) : renewal(tokens);

        },
        renew: () => {

            const { tokens } = kept.getState();

            return tokens ? renewal(tokens) : Promise.resolve(null);

        },
        watch: ( listener ) => kept.subscribe(( next, last ) => {

            if ( (next.tokens === null) !== (last.tokens === null) || !json.equal(next.user, last.user) ) listener(next.tokens === null ? null : next.user);

        }),
    };

}
