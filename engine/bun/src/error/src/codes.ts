import type { Code } from "./arch.ts";
import { codes } from "./arch.ts";

const aliases: readonly (readonly [number, Code])[] = [[408, "timeout"], [412, "conflict"], [502, "unavailable"]];
const byStatus = new Map<number, Code>([...Object.entries(codes).map(([code, status]) => [status, code as Code] as const), ...aliases]);

export const messages: Record<Code, string> = {
    ok: "OK",
    created: "Created",
    accepted: "Accepted",
    bad_request: "The request is malformed",
    unauthorized: "Authentication is required",
    forbidden: "This action is not allowed",
    not_found: "The resource was not found",
    method_not_allowed: "The method is not allowed",
    conflict: "The request conflicts with the current state",
    gone: "The resource is gone",
    too_large: "The payload is too large",
    validation: "The given data is invalid",
    locked: "The resource is locked",
    too_many_requests: "Too many requests",
    internal: "Something went wrong",
    unavailable: "The service is unavailable",
    timeout: "The request timed out",
    network: "The network is unreachable",
};

export function isCode ( value: unknown ): value is Code {

    return typeof value === "string" && Object.hasOwn(codes, value);

}
export function codeOf ( status: number ): Code {

    return byStatus.get(status) ?? (status >= 500 ? "internal" : status >= 400 ? "bad_request" : "ok");

}
