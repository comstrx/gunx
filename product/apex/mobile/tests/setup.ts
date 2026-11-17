import { mock } from "bun:test";

mock.module("react-native", () => {

    const web = require("react-native-web") as Record<string, unknown>;
    const sensing = new Set<() => void>();
    let sensed: "light" | "dark" = "light";
    const Appearance = {
        getColorScheme: () => sensed,
        setColorScheme: ( next: "light" | "dark" ) => {

            sensed = next;

            for ( const told of sensing ) told();

        },
        addChangeListener: ( told: () => void ) => {

            sensing.add(told);

            return { remove: () => sensing.delete(told) };

        },
    };

    return { ...web, Appearance, I18nManager: { isRTL: false }, Platform: { OS: "android", Version: 35 }, Modal: ( props: { visible?: boolean; children?: unknown } ) => (props.visible ? props.children : null) };

});
mock.module("expo-status-bar", () => ({ StatusBar: () => null }));
mock.module("expo-secure-store", () => {

    const kept = new Map<string, string>();

    return {
        getItemAsync: async ( key: string ) => kept.get(key) ?? null,
        setItemAsync: async ( key: string, value: string ) => { kept.set(key, value); },
        deleteItemAsync: async ( key: string ) => { kept.delete(key); },
    };

});
mock.module("expo-clipboard", () => {

    let held = "";

    return { setStringAsync: async ( text: string ) => { held = text; return true; }, getStringAsync: async () => held };

});
mock.module("expo-haptics", () => ({
    selectionAsync: async () => undefined,
    impactAsync: async () => undefined,
    notificationAsync: async () => undefined,
    NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
    ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
mock.module("expo-location", () => {

    const answered = { granted: false, canAskAgain: true };
    const at = ( step: number ) => ({ coords: { latitude: 30.0444 + step / 1000, longitude: 31.2357, accuracy: 9, altitude: null, speed: null, heading: null }, timestamp: 1_700_000_000_000 + step });

    return {
        Accuracy: { Low: 2, Balanced: 3, High: 4 },
        getForegroundPermissionsAsync: async () => ({ ...answered }),
        requestForegroundPermissionsAsync: async () => { answered.granted = true; return { ...answered }; },
        getCurrentPositionAsync: async () => at(0),
        watchPositionAsync: async ( _: unknown, told: ( found: ReturnType<typeof at> ) => void ) => {

            told(at(1));
            told(at(2));

            return { remove: () => undefined };

        },
    };

});
mock.module("expo-notifications", () => {

    const answered = { granted: false, canAskAgain: true };
    const sent: unknown[] = [];

    return {
        sent,
        AndroidImportance: { DEFAULT: 3 },
        getPermissionsAsync: async () => ({ ...answered }),
        requestPermissionsAsync: async () => { answered.granted = true; return { ...answered }; },
        setNotificationHandler: () => undefined,
        setNotificationChannelAsync: async () => undefined,
        scheduleNotificationAsync: async ( request: unknown ) => { sent.push(request); return "id"; },
    };

});
mock.module("expo-image-picker", () => {

    const answered = { granted: false, canAskAgain: true };
    const asked: unknown[] = [];
    const file = ( name: string, width: number, height: number ) => ({ uri: `data:image/jpeg;base64,${btoa(name)}`, width, height, fileName: name, fileSize: 9_000_000, mimeType: "image/jpeg" });
    const clip = { uri: "data:video/mp4;base64,Y2xpcA==", width: 1920, height: 1080, fileName: "c.mp4", fileSize: 4, mimeType: "video/mp4", type: "video", duration: 12_500 };

    return {
        asked,
        CameraType: { back: "back", front: "front" },
        getCameraPermissionsAsync: async () => ({ ...answered }),
        requestCameraPermissionsAsync: async () => { answered.granted = true; return { ...answered }; },
        getMediaLibraryPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
        requestMediaLibraryPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
        launchImageLibraryAsync: async ( options: { allowsMultipleSelection?: boolean; mediaTypes?: string[] } ) => { asked.push(["library", options]); return { canceled: false, assets: options.mediaTypes?.join() === "videos" ? [clip] : options.allowsMultipleSelection ? [file("a.jpg", 4000, 3000), file("b.jpg", 3000, 4000)] : [file("a.jpg", 4000, 3000)] }; },
        launchCameraAsync: async ( options: { mediaTypes?: string[] } ) => { asked.push(["camera", options]); return options.mediaTypes?.join() === "videos" ? { canceled: false, assets: [{ uri: clip.uri, width: 720, height: 1280, type: "video", duration: 3000 }] } : { canceled: true, assets: null }; },
    };

});
mock.module("expo-document-picker", () => {

    const asked: unknown[] = [];

    return { asked, getDocumentAsync: async ( options: unknown ) => { asked.push(options); return { canceled: false, assets: (options as { type?: string[] }).type?.join() === "audio/*" ? [{ name: "s.mp3", uri: "data:audio/mpeg;base64,c291bmQ=", size: 5, mimeType: "audio/mpeg", lastModified: 0 }] : [{ name: "terms.pdf", uri: "data:application/pdf;base64,JVBERg==", size: 4, lastModified: 0 }] }; } };

});
mock.module("expo-audio", () => {

    const answered = { granted: false, canAskAgain: true };
    const log: unknown[] = [];

    return {
        log,
        RecordingPresets: { HIGH_QUALITY: { extension: ".m4a", sampleRate: 44_100, numberOfChannels: 2, bitRate: 128_000 } },
        getRecordingPermissionsAsync: async () => ({ ...answered }),
        requestRecordingPermissionsAsync: async () => { answered.granted = true; return { ...answered }; },
        setAudioModeAsync: async ( mode: unknown ) => { log.push(["mode", mode]); },
        createAudioPlayer: ( uri: string ) => {

            const sound = uri.startsWith("data:audio/");

            return {
                isLoaded: false,
                duration: 0,
                release: () => { log.push("played"); },
                addListener: ( _: string, heard: ( status: { isLoaded: boolean; duration: number } ) => void ) => {

                    if ( sound ) queueMicrotask(() => heard({ isLoaded: true, duration: 2.5 }));

                    return { remove: () => undefined };

                },
            };

        },
        AudioModule: {
            AudioRecorder: class {

                uri: string | null = null;

                constructor ( options: { numberOfChannels: number; bitRate: number; extension: string } ) { log.push(["made", options.numberOfChannels, options.bitRate, options.extension]); }
                async prepareToRecordAsync ( options?: { bitRate: number } ): Promise<void> { log.push(["prepare", options?.bitRate]); }
                record (): void { log.push("record"); }
                pause (): void { log.push("pause"); }
                async stop (): Promise<void> { log.push("stop"); this.uri = "data:audio/mp4;base64,dm9pY2U="; }
                release (): void { log.push("release"); }

            },
        },
    };

});
mock.module("expo-camera", () => ({ CameraView: () => null }));
mock.module("expo-video", () => ({ VideoView: () => null, useVideoPlayer: () => ({}) }));
mock.module("expo-screen-capture", () => {

    const held: string[] = [];

    return { held, preventScreenCaptureAsync: async ( key: string ) => { held.push(key); }, allowScreenCaptureAsync: async ( key: string ) => { held.splice(held.indexOf(key), 1); } };

});
mock.module("expo-image-manipulator", () => {

    const steps: unknown[] = [];
    const context = {
        crop: ( box: unknown ) => { steps.push(["crop", box]); return context; },
        resize: ( size: { width: number; height: number } ) => { steps.push(["resize", size]); return { renderAsync: async () => ({ saveAsync: async ( options: unknown ) => { steps.push(["save", options]); return { uri: "data:image/jpeg;base64,c21hbGw=", ...size }; } }) }; },
    };

    return { steps, SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" }, ImageManipulator: { manipulate: ( uri: string ) => { steps.push(["load", uri.slice(0, 15)]); return context; } } };

});
mock.module("expo-crypto", () => ({
    getRandomValues: ( data: Uint8Array ) => crypto.getRandomValues(data),
    randomUUID: () => crypto.randomUUID(),
}));
mock.module("react-native-safe-area-context", () => {

    const { View } = require("react-native-web");

    return { SafeAreaProvider: View, SafeAreaView: View };

});
mock.module("@react-native-async-storage/async-storage", () => {

    const saved = new Map<string, string>();

    return {
        default: {
            getItem: async ( key: string ) => saved.get(key) ?? null,
            setItem: async ( key: string, value: string ) => {

                saved.set(key, value);

            },
            removeItem: async ( key: string ) => {

                saved.delete(key);

            },
            getAllKeys: async () => [...saved.keys()],
        },
    };

});

const host = await import("../src/host/index.ts");

host.boot();
