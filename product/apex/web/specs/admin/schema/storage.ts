import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const storage = spec.screen("storage", {
    title: { key: "screens.storage.title" },
    icon: "box",
    settings: { width: "reading", shield: true },
    layout: [
        stack({ padding: "md", gap: "lg" }, [
            spec.feature("vault", { settings: { seconds: 3 } }),
        ]),
    ],
});
