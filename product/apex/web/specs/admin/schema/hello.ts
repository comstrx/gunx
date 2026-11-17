import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const hello = spec.screen("hello", {
    path: "/",
    title: { key: "screens.hello.title" },
    icon: "wave",
    layout: [
        stack({ align: "center", justify: "center", padding: "md", gap: "lg", height: "screen" }, [
            spec.feature("hello", { settings: { tone: "warm" }, on: { load: spec.set("signals.visits", 1), "hello.greeted": spec.set("signals.greeted", true) } }),
            stack({ direction: "row", gap: "sm", justify: "center", width: "auto" }, [
                spec.feature("action", { id: "peek", settings: { label: "about.open", look: "soft" }, on: { success: spec.open("/about", { size: "md" }) } }),
                spec.feature("action", { id: "leave", settings: { label: "about.client", look: "ghost" }, on: { success: spec.transfer("client") } }),
            ]),
        ]),
    ],
});
