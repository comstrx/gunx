import ar from "./messages/ar.json" with { type: "json" };
import en from "./messages/en.json" with { type: "json" };

export const brand = {
    home: import.meta.dirname,
    messages: { ar, en },
} as const;
