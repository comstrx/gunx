import * as spec from "engine/spec";

const stack = spec.kind("stack");

export const offers = spec.screen("offers", {
    title: { key: "screens.offers.title" },
    description: { key: "screens.offers.description" },
    icon: "tag",
    settings: { width: "reading" },
    layout: [
        stack({ align: "stretch", justify: "center", padding: "md", gap: "lg", height: "screen" }, [
            spec.feature("note", { settings: { title: "offers.title", body: "offers.body" } }),
        ]),
    ],
});
