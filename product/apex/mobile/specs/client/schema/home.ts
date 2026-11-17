import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const home = spec.screen("home", {
    path: "/",
    title: { key: "screens.home.title" },
    icon: "bag",
    layout: [
        stack({ align: "center", justify: "center", padding: "md", gap: "lg", height: "screen" }, [
            spec.feature("note", { settings: { title: "store.title", body: "store.body" } }),
            spec.feature("note", { id: "back", when: "signals.from", settings: { title: "store.back", body: "store.backBody" } }),
            spec.feature("note", { id: "details", when: "signals.more = true", settings: { title: "store.details", body: "store.detailsBody" } }),
            spec.feature("hello", { settings: { tone: "plain" } }),
            stack({ direction: "row", gap: "sm", justify: "center", width: "auto", wrap: true }, [
                spec.feature("action", { id: "more", settings: { label: "store.more", look: "solid" }, on: { success: spec.toggle("signals.more") } }),
                spec.feature("action", { id: "courier", settings: { label: "store.courier", look: "soft" }, on: { success: spec.transfer("courier") } }),
                spec.feature("action", { id: "vendor", settings: { label: "store.vendor", look: "soft" }, on: { success: spec.transfer("vendor") } }),
                spec.feature("action", { id: "admin", settings: { label: "store.admin", look: "ghost" }, on: { success: spec.transfer("acme:admin", { to: "/about" }) } }),
            ]),
        ]),
    ],
});
