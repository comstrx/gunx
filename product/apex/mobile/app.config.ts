import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpoConfig } from "expo/config";

type Carried = { config: { settings: { locale: string; app: { slug: string; scheme: string; package: string; name: string } } } };
type Artifact = { entry: string; surfaces: Readonly<Record<string, Carried>> };

const path = resolve(__dirname, ".cache/spec/current.json");

if ( !existsSync(path) ) throw new Error("compile the spec first: bun run tool compile");

const artifact = JSON.parse(readFileSync(path, "utf8")) as Artifact;
const entry = artifact.surfaces[artifact.entry];

if ( entry === undefined ) throw new Error("the spec artifact carries no entry surface: bun run tool compile");

const { app, locale } = entry.config.settings;
const heard = "The microphone is used only while you record.";

const config: ExpoConfig = {
    name: app.name,
    slug: app.slug,
    scheme: app.scheme,
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    ios: { bundleIdentifier: app.package, supportsTablet: false },
    android: { package: app.package, permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "CAMERA", "POST_NOTIFICATIONS", "RECORD_AUDIO", "VIBRATE"] },
    plugins: [["expo-location", { locationWhenInUsePermission: "Your position is shown on the map while you use the app." }], "expo-notifications", ["expo-image-picker", { photosPermission: "Your photos are opened only when you choose one.", cameraPermission: "The camera is used only when you take a photo or a clip.", microphonePermission: heard }], ["expo-audio", { microphonePermission: heard, enableBackgroundPlayback: false }], ["expo-camera", { cameraPermission: "The camera is used only when you take a photo or a clip.", microphonePermission: heard, recordAudioAndroid: true }], "expo-video"],
    extra: { spec: artifact.entry, locale },
};

export default config;
