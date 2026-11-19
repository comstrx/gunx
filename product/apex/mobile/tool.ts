import * as tool from "engine/tool";
import { specs } from "./specs/index.ts";
import { part } from "./src/specs/part.ts";

export const project = tool.project({
    specs,
    part,
    paths: {
        spec: ".cache/spec",
        dist: "dist/{role}",
        android: "android",
    },
    tasks: {
        compile: { specs: "{spec}" },
        analyze: {
            layers: {
                framework: { "react-native": ["hooks", "styles", "elements"] },
                bare: ["render/host"],
                only: { "render/bridge": ["app"] },
                outside: [".cache", "messages"],
                layers: ["render/host", "render/bridge", "api", "specs", "styles", "stores", "hooks", "elements", "components", "features", "app"],
                entries: ["app/index.tsx", "specs/part.ts"],
            },
        },
        check: ["compile", { run: "tsc -p ." }, "analyze"],
        lint: { run: "biome ci ." },
        test: ["compile", { run: "bun test ./tests" }],
        build: {
            each: [
                { specs: "{spec}" },
                { run: "expo export --platform android --output-dir {dist}" },
                { budget: { bundle: "{dist}/_expo/static/js/android/*.hbc" } },
            ],
        },
        release: {
            target: { release: true },
            steps: [
                "build",
                { run: "expo prebuild --platform android --no-install", env: { EXPO_NO_GIT_STATUS: "1" } },
                { run: "./gradlew assembleRelease", cwd: "{android}" },
            ],
        },
        dev: ["compile", { run: "expo start", env: { EXPO_NO_TYPESCRIPT_SETUP: "1" } }],
        audit: { run: "bun audit --audit-level=low --ignore GHSA-fc5q-39xc-vjpf" },
        gate: ["check", "lint", "test", "build", "audit"],
    },
});

export default project;

if ( import.meta.main ) process.exitCode = await tool.start(project, Bun.argv.slice(2), import.meta.dir);
