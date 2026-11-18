import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const login = spec.screen("login", {
    title: { key: "screens.login.title" },
    icon: "key",
    auth: "guest",
    menu: false,
    index: false,
    settings: { width: "reading" },
    layout: [
        stack({ padding: "md", gap: "lg" }, [
            spec.feature("account"),
            stack({ direction: "row", gap: "sm", wrap: true }, [
                spec.feature("action", { id: "back", settings: { label: "account.back", look: "ghost" }, on: { success: spec.navigate("/") } }),
            ]),
        ]),
    ],
});
