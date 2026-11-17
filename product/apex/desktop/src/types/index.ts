export type Locale = string;
export type Direction = "rtl" | "ltr";
export type Preferences = { locale: Locale; chosen: boolean };
export type Status = "idle" | "pending" | "done" | "failed";
