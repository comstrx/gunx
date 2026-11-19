import * as spec from "engine/spec";

export const contracts = {
    baseUrl: spec.pick({
        dev: spec.pick({ web: "http://localhost:8100", desktop: "http://localhost:8100", mobile: "http://10.0.2.2:8100" }),
        release: "https://api.acme.example",
    }),
    realtime: false,
    media: ["https://maps.googleapis.com"],
    maps: { key: process.env.GOOGLE_MAPS_KEY ?? "" },
};
