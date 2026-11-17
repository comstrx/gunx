import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const account = spec.screen("account", {
    title: { key: "screens.account.title" },
    icon: "user",
    auth: true,
    index: false,
    settings: { width: "reading" },
    layout: [
        stack({ padding: "md", gap: "lg" }, [
            spec.feature("account"),
            spec.feature("notices", { ports: { rows: spec.read("notifications.list", undefined, { live: true }) } }),
            stack({ direction: "row", gap: "sm", wrap: true }, [
                spec.feature("action", { id: "client", settings: { label: "account.openClient", look: "solid" }, on: { success: spec.transfer("client", { to: "/account" }) } }),
            ]),
        ]),
    ],
});
