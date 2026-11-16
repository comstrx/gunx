import * as tool from "engine/tool";
import { specs } from "./src/specs/surface.ts";

export default tool.define({
    specs,
    tasks: {
        compile: tool.specs(".cache/spec", { settings: ["app"] }),
        analyze: [
            tool.layers({
                layers: ["native", "types", "api", "specs", "stores", "hooks", "styles", "elements", "components", "features", "app"],
                framework: { "react-native": ["hooks", "styles", "elements"] },
                outside: ["specs", ".cache"],
                entries: ["app/index.tsx"],
            }),
            tool.nameless(),
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
        audit: tool.run("bun audit --audit-level=low"),
        gate: ["check", "lint", "test", "build", "audit"],
    },
});
