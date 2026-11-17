import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const board = spec.screen("board", {
    path: "/",
    title: { key: "screens.board.title" },
    icon: "route",
    layout: [
        stack({ align: "center", justify: "center", padding: "md", gap: "lg", height: "screen" }, [
            spec.feature("note", { settings: { title: "courier.title", body: "courier.body" } }),
            spec.feature("hello", { settings: { tone: "formal" } }),
            spec.feature("note", { id: "sent", when: "signals.sent = true", settings: { title: "courier.sent" } }),
            stack({ direction: "row", gap: "sm", justify: "center", width: "auto", wrap: true }, [
                spec.feature("action", { id: "ping", settings: { label: "courier.ping", look: "solid" }, on: { success: [spec.set("signals.sent", true), spec.debounce(1500, spec.clear("signals.sent"))] } }),
                spec.feature("action", { id: "client", settings: { label: "courier.client", look: "soft" }, on: { success: spec.transfer("client", { with: { from: "courier" } }) } }),
                spec.feature("action", { id: "vendor", settings: { label: "courier.vendor", look: "ghost" }, on: { success: spec.transfer("vendor", { refresh: true }) } }),
            ]),
        ]),
    ],
});
