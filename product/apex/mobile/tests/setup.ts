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

const native = await import("../src/native/index.ts");

native.boot();
