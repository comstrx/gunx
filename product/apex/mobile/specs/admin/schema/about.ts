import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const about = spec.screen("about", {
    title: { key: "screens.about.title" },
    icon: "info",
    layout: [
        stack({ padding: "lg", gap: "lg" }, [
            spec.feature("note", { settings: { title: "about.title", body: "about.body" } }),
            stack({ direction: "row", gap: "sm", justify: "end" }, [
                spec.feature("action", { id: "done", settings: { label: "about.close", look: "ghost" }, on: { success: spec.close() } }),
                spec.feature("action", { id: "jump", settings: { label: "about.client" }, on: { success: spec.transfer("client", { refresh: true }) } }),
            ]),
        ]),
    ],
});
