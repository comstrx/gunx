export type Params = Record<string, string>;
export type Fallback = string | (( key: string ) => string);
export type Route = { names: string[]; matcher: RegExp };
export type Arrays = "brackets" | "repeat";
export type QueryValue = string | string[];
export type Query = Record<string, QueryValue>;
export type QueryInput = Record<string, string | number | boolean | null | undefined | readonly (string | number | boolean)[]>;
export type Semver = { major: number; minor: number; patch: number; prerelease: string; build: string };
export type Table = readonly (readonly [string, number])[];
