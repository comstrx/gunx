import { describe, expect, test as it } from "bun:test";
import * as auth from "engine/auth";
import * as cache from "engine/cache";
import * as error from "engine/error";
import * as fc from "fast-check";

type User = { id: string };
type Act = { kind: "begin"; refresh: boolean; ttl: number } | { kind: "end" } | { kind: "move"; ms: number } | { kind: "token" } | { kind: "renew" } | { kind: "answer"; ok: boolean; final: boolean };
type Model = { access: string | null; refresh: string | null; expires: number | undefined; pending: boolean };

const runs = 400;
const names = ["a", "b", "a.b", "a.c", "a.b.c", "b.c", "x"] as const;
const ability = fc.constantFrom(...names, "*", "a.*", "a.b.*", "b.*");
const user: User = { id: "u" };
const act: fc.Arbitrary<Act> = fc.oneof(
    { weight: 2, arbitrary: fc.record({ kind: fc.constant("begin" as const), refresh: fc.boolean(), ttl: fc.constantFrom(0, 10, 100, 10_000) }) },
    { weight: 1, arbitrary: fc.constant<Act>({ kind: "end" }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant("move" as const), ms: fc.constantFrom(5, 50, 500) }) },
    { weight: 4, arbitrary: fc.constant<Act>({ kind: "token" }) },
    { weight: 1, arbitrary: fc.constant<Act>({ kind: "renew" }) },
    { weight: 4, arbitrary: fc.record({ kind: fc.constant("answer" as const), ok: fc.boolean(), final: fc.boolean() }) },
);

function covers ( held: string, wanted: string ): boolean {

    if ( held === "*" || held === wanted ) return true;

    return held.endsWith(".*") && wanted.startsWith(held.slice(0, -1));

}
function tick (): Promise<void> {

    return new Promise(( done ) => setTimeout(done, 0));

}

describe("fuzz auth", () => {

    it("granted, missing, can, authorize, hasRole and expand agree with the covering rule", () => {

        fc.assert(fc.property(fc.array(ability, { maxLength: 4 }), fc.array(fc.constantFrom(...names), { maxLength: 4 }), fc.constantFrom<auth.Mode>("all", "any"), fc.array(fc.constantFrom("staff", "admin", "guest"), { maxLength: 3 }), fc.array(fc.constantFrom("staff", "admin", "guest"), { maxLength: 3 }), ( held, required, mode, roles, wanted ) => {

            const has = ( one: string ): boolean => held.some(( own ) => covers(own, one));
            const missing = required.filter(( one ) => !has(one));
            const granted = mode === "all" ? missing.length === 0 : required.some(has);
            const holder = { abilities: held, roles };

            expect(auth.granted(held, required, mode)).toBe(granted);
            expect(auth.missing(held, required)).toEqual(missing);
            expect(auth.can(holder, required, mode)).toBe(required.length === 0 || granted);
            expect(auth.can(null, required, mode)).toBe(required.length === 0);

            try {

                auth.authorize(holder, required, mode);
                expect(required.length === 0 || granted).toBe(true);

            } catch ( failure ) {

                expect(error.is(failure) && failure.code === "forbidden" && failure.reason === "auth.denied").toBe(true);
                expect(error.is(failure) ? failure.errors : {}).toEqual({ abilities: missing });
                expect(required.length === 0 || granted).toBe(false);

            }

            expect(auth.hasRole(holder, wanted, "any")).toBe(wanted.some(( role ) => roles.includes(role)));
            expect(auth.hasRole(holder, wanted, "all")).toBe(wanted.every(( role ) => roles.includes(role)));
            expect(auth.expand(held, [...names])).toEqual([...names].filter(has).sort());

        }), { numRuns: 3000 });

    });
    it("a session follows its token model through sign-ins, clock moves, renewals, answers and sign-outs", async () => {

        await fc.assert(fc.asyncProperty(fc.array(act, { maxLength: 18 }), fc.constantFrom(0, 30), async ( acts, skew ) => {

            let at = 1_000_000;
            let serial = 0;
            const answers: (( tokens: auth.Tokens ) => void)[] = [];
            const refusals: (( cause: unknown ) => void)[] = [];
            const made = auth.session<User>({ name: "model", box: cache.open({ storage: cache.memory() }), now: () => at, skew, renew: ( _, signal ) => new Promise(( resolve, reject ) => {

                answers.push(resolve);
                refusals.push(reject);
                signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });

            }) });
            const model: Model = { access: null, refresh: null, expires: undefined, pending: false };
            const fresh = (): boolean => model.expires === undefined || model.expires - skew > at;
            const outstanding: Promise<unknown>[] = [];

            for ( const step of acts ) {

                if ( step.kind === "begin" ) {

                    serial += 1;
                    made.begin({ access: `a${serial}`, refresh: step.refresh ? `r${serial}` : undefined, expires: at + step.ttl }, user);
                    model.access = `a${serial}`;
                    model.refresh = step.refresh ? `r${serial}` : null;
                    model.expires = at + step.ttl;
                    model.pending = false;

                } else if ( step.kind === "end" ) {

                    made.end();
                    model.access = null;
                    model.refresh = null;
                    model.expires = undefined;
                    model.pending = false;

                } else if ( step.kind === "move" ) {

                    at += step.ms;

                } else if ( step.kind === "token" || step.kind === "renew" ) {

                    const before = answers.length;
                    const asked = step.kind === "token" ? made.token() : made.renew();

                    outstanding.push(asked.catch(() => undefined));
                    await tick();

                    if ( model.access === null ) {

                        expect(await asked).toBeNull();

                    } else if ( step.kind === "token" && fresh() ) {

                        expect(await asked).toBe(model.access);

                    } else if ( model.refresh === null ) {

                        expect(await asked).toBeNull();
                        model.access = null;
                        model.expires = undefined;

                    } else if ( model.pending ) {

                        expect(answers.length).toBe(before);

                    } else {

                        expect(answers.length).toBe(before + 1);
                        model.pending = true;

                    }

                } else if ( model.pending ) {

                    serial += 1;

                    if ( step.ok ) {

                        answers[answers.length - 1]?.({ access: `n${serial}`, expires: at + 1000 });
                        model.access = `n${serial}`;
                        model.expires = at + 1000;

                    } else {

                        refusals[refusals.length - 1]?.(error.fault(step.final ? "unauthorized" : "unavailable", "x"));

                        if ( step.final ) {

                            model.access = null;
                            model.refresh = null;
                            model.expires = undefined;

                        }

                    }

                    model.pending = false;
                    await tick();

                }

                const held = made.state.getState().tokens;

                expect(held?.access ?? null).toBe(model.access);
                expect(held?.refresh ?? null).toBe(model.refresh);
                expect(made.signed()).toBe(model.access !== null);

            }

            for ( const answer of answers ) answer({ access: "late" });

            await Promise.all(outstanding);

        }), { numRuns: runs });

    });

});
