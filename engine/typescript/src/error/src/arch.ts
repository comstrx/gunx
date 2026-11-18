export type Code = keyof typeof codes;
export type Errors = Record<string, string[]>;
export type Detail = {
    message?: string | undefined;
    reason?: string | undefined;
    errors?: Errors | undefined;
    status?: number | undefined;
    retryAfter?: number | undefined;
    requestId?: string | undefined;
    cause?: unknown;
};
export type Envelope = {
    data: unknown;
    message: string | null;
    errors: Errors | null;
    code: string;
    reason: string | null;
    meta: Record<string, unknown>;
};
export interface Failure extends Error {
    readonly code: Code;
    readonly status: number;
    readonly reason: string | undefined;
    readonly errors: Errors;
    readonly retryAfter: number | undefined;
    readonly requestId: string | undefined;
    is: ( ...many: readonly Code[] ) => boolean;
    field: ( name: string ) => string | undefined;
    with: ( detail: Detail ) => Failure;
    toJSON: () => Record<string, unknown>;
}

export const codes = {
    ok: 200,
    created: 201,
    accepted: 202,
    bad_request: 400,
    unauthorized: 401,
    forbidden: 403,
    not_found: 404,
    method_not_allowed: 405,
    conflict: 409,
    gone: 410,
    too_large: 413,
    validation: 422,
    locked: 423,
    too_many_requests: 429,
    internal: 500,
    unavailable: 503,
    timeout: 504,
    network: 0,
} as const;
