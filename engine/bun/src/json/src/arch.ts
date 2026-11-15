export type Dictionary = Record<string, unknown>;
export type Kind = "null" | "boolean" | "number" | "string" | "list" | "record" | "undefined" | "other";
export type StringifyOptions = { pretty?: boolean | number | undefined; stable?: boolean | undefined };
export type CsvOptions = {
    separator?: string | undefined;
    header?: boolean | undefined;
    columns?: readonly string[] | undefined;
    guard?: boolean | undefined;
};
export type Visit = ( value: unknown, path: string[] ) => void;
export type Change = { path: string; kind: "added" | "removed" | "changed"; from: unknown; to: unknown };
export type Pairs = Map<object, Set<object>>;
