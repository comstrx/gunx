export type Direction = "rtl" | "ltr";
export type PadSide = "start" | "end" | "both";
export type MaskKind = "email" | "phone" | "name" | "card" | "text";
export type MaskOptions = { kind?: MaskKind | undefined; keep?: number | undefined; keepEnd?: number | undefined; mark?: string | undefined };
export type Closest<T> = { item: T; distance: number; similarity: number } | undefined;
