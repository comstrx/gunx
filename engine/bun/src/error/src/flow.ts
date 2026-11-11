import * as json from "engine-json";
import { type Code, type Errors, Fault, is, isFault, of, poison } from "./fault.ts";

export type Result<T> = { ok: true; value: T } | { ok: false; fault: Fault };
export type Arms<R> = { readonly [K in Code]?: ( fault: Fault ) => R } & { readonly else: ( fault: Fault ) => R };

export function unreachable ( value: unknown ): boolean {

    return is(value, "network", "timeout", "unavailable");

}
export function transient ( value: unknown ): boolean {

    return unreachable(value) || is(value, "too_many_requests", "locked") || (isFault(value) && value.status >= 500);

}
export function settled ( value: unknown ): boolean {

    return is(value, "not_found", "forbidden", "unauthorized", "gone", "method_not_allowed");

}
export function retryable ( value: unknown ): boolean {

    return transient(value) && !settled(value);

}
export function assert ( condition: unknown, code: Code = "bad_request", reason?: string, message?: string ): asserts condition {

    if ( !condition ) throw new Fault(code, { reason, message });

}
export async function attempt<T> ( work: () => Promise<T> | T, code: Code = "internal" ): Promise<Result<T>> {

    try {

        return { ok: true, value: await work() };

    } catch ( caught ) {

        return { ok: false, fault: of(caught, code) };

    }

}
export function attemptSync<T> ( work: () => T, code: Code = "internal" ): Result<T> {

    try {

        return { ok: true, value: work() };

    } catch ( caught ) {

        return { ok: false, fault: of(caught, code) };

    }

}
export function unwrap<T> ( result: Result<T> ): T {

    if ( result.ok ) return result.value;

    throw result.fault;

}
export function match<R> ( value: unknown, arms: Arms<R> ): R {

    const found = of(value);
    const arm = Object.hasOwn(arms, found.code) ? arms[found.code] : undefined;

    return (arm ?? arms.else)(found);

}
export function chainOf ( value: unknown, limit = 8 ): unknown[] {

    const chain: unknown[] = [];
    let cursor: unknown = value;

    while ( cursor !== undefined && chain.length < limit && !chain.includes(cursor) ) {

        chain.push(cursor);
        cursor = cursor instanceof Error ? cursor.cause : undefined;

    }

    return chain;

}
export function rootOf ( value: unknown ): unknown {

    const chain = chainOf(value);

    return chain[chain.length - 1];

}
export function describe ( value: unknown, depth = 0 ): json.Dictionary {

    if ( !(value instanceof Error) ) return { message: typeof value === "object" && value !== null ? json.stringify(value) : String(value) };

    const tag = (value as { code?: unknown }).code;
    const facts: json.Dictionary = { name: value.name, message: value.message, code: typeof tag === "string" || typeof tag === "number" ? tag : undefined };

    if ( isFault(value) ) Object.assign(facts, { status: value.status, reason: value.reason, errors: Object.keys(value.errors).length ? value.errors : undefined, retryAfter: value.retryAfter, requestId: value.requestId });
    if ( depth < 3 && value.cause !== undefined ) facts.cause = describe(value.cause, depth + 1);

    return json.compact(facts);

}
export function reference ( value: unknown ): string | undefined {

    if ( !isFault(value) || !value.requestId ) return undefined;

    return `REQ-${value.requestId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`;

}
export function formErrors ( value: unknown, fallback: string ): Record<string, string> {

    if ( !isFault(value) ) return { _form: fallback };

    const fields = Object.entries(value.errors).filter(([path]) => path !== poison).map(([path, found]) => [path === "_" ? "_form" : path, found[0] ?? fallback] as const);

    return fields.length ? Object.fromEntries(fields) : { _form: value.message || fallback };

}
export function statusOf ( value: unknown ): number {

    return of(value).status;

}
export function merge ( ...many: readonly (Errors | undefined)[] ): Errors {

    const out = new Map<string, string[]>();

    for ( const errors of many ) for ( const [field, rules] of Object.entries(errors ?? {}) ) if ( field !== poison ) out.set(field, [...new Set([...(out.get(field) ?? []), ...rules])]);

    return Object.fromEntries(out);

}
export function withField ( value: unknown, field: string, rule: string ): Fault {

    const failure = of(value, "validation");

    return failure.with({ errors: merge(failure.errors, { [field]: [rule] }) });

}
