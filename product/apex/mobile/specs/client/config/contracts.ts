import * as spec from "engine/spec";

export const contracts = {
    baseUrl: spec.pick({
        dev: spec.pick({ web: "http://localhost:8100", desktop: "http://localhost:8100", mobile: "http://10.0.2.2:8100" }),
        release: "https://api.acme.example",
    }),
    realtime: true,
    wire: {
        timeout: 6000,
        retries: { read: 2 },
    },
    live: {
        path: "/live",
        channel: "{feature}",
        events: { created: "{feature}.created", updated: "{feature}.updated", deleted: "{feature}.deleted" },
    },
};
