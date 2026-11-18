import * as tool from "engine/tool";
import { specs } from "./specs/index.ts";
import { part } from "./src/specs/part.ts";

export default tool.define({
    specs,
    part,
    deploy: ( env ) => ({ contracts: { maps: { key: env.GOOGLE_MAPS_KEY ?? "" }, ...(env.API_URL ? { baseUrl: env.API_URL } : {}) } }),
    tasks: {
        compile: tool.specs(".cache/spec"),
        analyze: [
            tool.layers({
                layers: ["render/host", "render/bridge", "api", "specs", "styles", "stores", "hooks", "elements", "components", "features", "app"],
                framework: { "react-native": ["hooks", "styles", "elements"] },
                bare: ["render/host"],
                only: { "render/bridge": ["app"] },
                outside: [".cache"],
                entries: ["app/index.tsx", "specs/part.ts"],
            }),
        ],
        check: ["compile", tool.run("tsc -p ."), "analyze"],
        lint: tool.run("biome ci ."),
        test: tool.run("bun test ./tests"),
        build: ["compile", tool.run("expo export --platform android --output-dir dist/client"), tool.budget({ bundle: "dist/client/_expo/static/js/android/*.hbc" })],
        release: tool.env({ ENGINE_ENV: "production" }, [
            "build",
            tool.run("expo prebuild --platform android --no-install", { env: { EXPO_NO_GIT_STATUS: "1" } }),
            tool.run("./gradlew assembleRelease", { cwd: "android" }),
        ]),
        start: ["compile", tool.run("expo start", { env: { EXPO_NO_TYPESCRIPT_SETUP: "1" } })],
        audit: tool.run("bun audit --audit-level=low --ignore GHSA-fc5q-39xc-vjpf"),
        gate: ["check", "lint", "test", "build", "audit"],
    },
});
