import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const enroll = spec.screen("enroll", {
    title: { key: "screens.enroll.title" },
    icon: "door",
    settings: { width: "reading" },
    layout: [
        stack({ padding: "md", gap: "lg" }, [
            spec.feature("note", { settings: { title: "enroll.title", body: "enroll.body" } }),
            stack({ direction: "row", gap: "sm", wrap: true }, [
                spec.feature("action", { id: "as-client", settings: { label: "enroll.client", look: "solid" }, on: { success: spec.transfer("client", { to: "/login" }) } }),
                spec.feature("action", { id: "as-courier", settings: { label: "enroll.courier", look: "soft" }, on: { success: spec.transfer("courier", { to: "/login" }) } }),
            ]),
        ]),
    ],
});
