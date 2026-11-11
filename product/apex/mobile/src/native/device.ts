import type * as device from "engine/device";
import { AccessibilityInfo, Appearance, Dimensions, I18nManager, Platform } from "react-native";

type Listener = ( info: device.Info ) => void;

function info (): device.Info {

    const { width, height, scale } = Dimensions.get("window");

    return {
        ...unknown,
        platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
        os: Platform.OS,
        version: String(Platform.Version),
        mobile: true,
        touch: true,
        scheme: Appearance.getColorScheme() === "dark" ? "dark" : "light",
        width,
        height,
        pixelRatio: scale,
        orientation: height >= width ? "portrait" : "landscape",
        language: I18nManager.isRTL ? "ar" : "en",
        languages: [I18nManager.isRTL ? "ar" : "en"],
    };

}
const unknown: device.Info = {
    platform: "android", os: "android", version: "", browser: "", model: "", mobile: true, touch: true, pointer: "coarse", language: "en", languages: ["en"], timeZone: "UTC", online: true,
    network: "unknown", reducedMotion: false, contrast: "normal", scheme: "light", width: 0, height: 0, pixelRatio: 1, orientation: "portrait", insets: { top: 0, right: 0, bottom: 0, left: 0 },
    standalone: true, visible: true, focused: true,
};

export const adapter: device.Adapter = {
    info,
    watch: ( what, listener: Listener ) => {

        if ( what === "scheme" ) {

            const sub = Appearance.addChangeListener(() => listener(info()));

            return () => sub.remove();

        }

        if ( what === "size" ) {

            const sub = Dimensions.addEventListener("change", () => listener(info()));

            return () => sub.remove();

        }

        if ( what === "motion" ) {

            const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", () => listener(info()));

            return () => sub.remove();

        }

        return () => undefined;

    },
    vibrate: () => false,
};
