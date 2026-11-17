import type * as device from "engine/device";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as ScreenCapture from "expo-screen-capture";
import { AccessibilityInfo, Appearance, Dimensions, I18nManager, Linking, Platform, Share, Vibration } from "react-native";
import { camera, microphone, photos } from "./picker.ts";

type Listener = ( info: device.Info ) => void;
type Answered = { granted: boolean; canAskAgain: boolean };

const precise: Readonly<Record<device.Accuracy, Location.Accuracy>> = { low: Location.Accuracy.Low, balanced: Location.Accuracy.Balanced, high: Location.Accuracy.High };
const channel = "notices";
let shown = false;
let guards = 0;
let calm = false;

function spoken (): { language: string; timeZone: string } {

    try {

        const told = new Intl.DateTimeFormat().resolvedOptions();

        return { language: told.locale, timeZone: told.timeZone };

    } catch {

        return { language: I18nManager.isRTL ? "ar" : "en", timeZone: "UTC" };

    }

}
function grantOf ( answered: Answered ): device.Grant {

    return answered.granted ? "granted" : answered.canAskAgain ? "prompt" : "denied";

}
function placed ( found: Location.LocationObject ): device.Position {

    const { latitude, longitude, accuracy, altitude, speed, heading } = found.coords;

    return { lat: latitude, lng: longitude, accuracy: accuracy ?? 0, altitude: altitude ?? undefined, speed: speed ?? undefined, heading: heading ?? undefined, at: found.timestamp };

}
async function ready (): Promise<void> {

    if ( shown ) return;

    shown = true;
    Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });

    if ( Platform.OS === "android" ) await Notifications.setNotificationChannelAsync(channel, { name: channel, importance: Notifications.AndroidImportance.DEFAULT });

}

void AccessibilityInfo.isReduceMotionEnabled().then(( found ) => {

    calm = found;

}).catch(() => undefined);
AccessibilityInfo.addEventListener("reduceMotionChanged", ( found ) => {

    calm = found;

});

function info (): device.Info {

    const { width, height, scale } = Dimensions.get("window");

    return {
        ...unknown,
        platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
        os: Platform.OS,
        version: String(Platform.Version),
        mobile: true,
        touch: true,
        reducedMotion: calm,
        scheme: Appearance.getColorScheme() === "dark" ? "dark" : "light",
        width,
        height,
        pixelRatio: scale,
        orientation: height >= width ? "portrait" : "landscape",
        language: spoken().language,
        languages: [spoken().language],
        timeZone: spoken().timeZone,
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
    state: async ( permission ) => {

        if ( permission === "location" ) return grantOf(await Location.getForegroundPermissionsAsync());
        if ( permission === "notifications" ) return grantOf(await Notifications.getPermissionsAsync());
        if ( permission === "camera" ) return grantOf(await camera.state());
        if ( permission === "photos" ) return grantOf(await photos.state());
        if ( permission === "microphone" ) return grantOf(await microphone.state());

        return permission === "clipboard" ? "granted" : "unsupported";

    },
    ask: async ( permission ) => {

        if ( permission === "location" ) return grantOf(await Location.requestForegroundPermissionsAsync());
        if ( permission === "notifications" ) return grantOf(await Notifications.requestPermissionsAsync());
        if ( permission === "camera" ) return grantOf(await camera.ask());
        if ( permission === "photos" ) return grantOf(await photos.ask());
        if ( permission === "microphone" ) return grantOf(await microphone.ask());

        return permission === "clipboard" ? "granted" : "unsupported";

    },
    position: async ( options = {} ) => placed(await Location.getCurrentPositionAsync({ accuracy: precise[options.accuracy ?? "balanced"] })),
    follow: ( options, listener ) => {

        let live = true;
        const watching = Location.watchPositionAsync({ accuracy: precise[options.accuracy ?? "balanced"], distanceInterval: 1, timeInterval: 1000 }, ( found ) => {

            if ( live ) listener(placed(found));

        });

        return () => {

            live = false;
            void watching.then(( held ) => held.remove(), () => undefined);

        };

    },
    copy: ( text ) => Clipboard.setStringAsync(text),
    paste: () => Clipboard.getStringAsync(),
    share: async ( data ) => (await Share.share({ message: [data.text, data.url].filter(Boolean).join("\n"), title: data.title })).action !== Share.dismissedAction,
    vibrate: ( pattern ) => {

        Vibration.vibrate(typeof pattern === "number" ? pattern : [...pattern]);

        return true;

    },
    haptic: ( kind ) => {

        if ( kind === "selection" ) void Haptics.selectionAsync();
        else if ( kind === "success" || kind === "warning" || kind === "error" ) void Haptics.notificationAsync(kind === "success" ? Haptics.NotificationFeedbackType.Success : kind === "warning" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error);
        else void Haptics.impactAsync(kind === "light" ? Haptics.ImpactFeedbackStyle.Light : kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);

        return true;

    },
    notify: async ( notice ) => {

        if ( !(await Notifications.getPermissionsAsync()).granted ) return false;

        await ready();
        await Notifications.scheduleNotificationAsync({ content: { title: notice.title, body: notice.body ?? null, data: notice.data ?? {} }, trigger: Platform.OS === "android" ? { channelId: channel } : null });

        return true;

    },
    open: async ( target ) => {

        await Linking.openURL(target);

        return true;

    },
    shield: async () => {

        guards += 1;

        const key = `shield-${guards}`;

        await ScreenCapture.preventScreenCaptureAsync(key);

        return () => void ScreenCapture.allowScreenCaptureAsync(key).catch(() => undefined);

    },
    links: ( listener ) => {

        let live = true;
        const held = Linking.addEventListener("url", ( event ) => listener(event.url));

        void Linking.getInitialURL().then(( first ) => {

            if ( live && typeof first === "string" && first !== "" ) listener(first);

        }, () => undefined);

        return () => {

            live = false;
            held.remove();

        };

    },
};
