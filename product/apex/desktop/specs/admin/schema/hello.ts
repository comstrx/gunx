import * as spec from "engine/spec";

export const hello = spec.screen({
    name: "hello",
    path: "/",
    title: { ar: "أهلاً", en: "Hello" },
    icon: "wave",
    role: "admin",
    features: [
        spec.feature("hello", { tone: "warm" }, {
            on: { load: [spec.set("signals.visits", 1)] },
            triggers: [spec.trigger("hello.greeted", [spec.set("signals.greeted", true)])],
        }),
    ],
    blocks: [spec.block("stack", { align: "center", justify: "center", padding: "md", height: "screen" }, [spec.block("feature", { name: "hello" })])],
});
