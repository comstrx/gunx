import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const gear = spec.screen("gear", {
    path: "/device",
    title: { key: "screens.gear.title" },
    icon: "chip",
    settings: { width: "reading" },
    layout: [
        stack({ padding: "md", gap: "lg" }, [
            spec.feature("probe"),
            spec.feature("locate", { settings: { accuracy: "high", zoom: 16, every: 5 } }),
        ]),
    ],
});
