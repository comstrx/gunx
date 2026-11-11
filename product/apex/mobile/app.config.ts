import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpoConfig } from "expo/config";

type Compiled = { surface: { name: string; locale: string }; app: { slug: string; scheme: string; package: string; name: string } };

const path = resolve(__dirname, ".cache/spec/client.json");

if ( !existsSync(path) ) throw new Error("compile the spec first: bun tools/compile.ts");

const compiled = JSON.parse(readFileSync(path, "utf8")) as Compiled;

const config: ExpoConfig = {
    name: compiled.app.name,
    slug: compiled.app.slug,
    scheme: compiled.app.scheme,
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    ios: { bundleIdentifier: compiled.app.package, supportsTablet: false },
    android: { package: compiled.app.package },
    extra: { spec: compiled.surface.name, locale: compiled.surface.locale },
};

export default config;
