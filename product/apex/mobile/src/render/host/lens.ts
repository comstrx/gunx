import type { CameraView } from "expo-camera";

export type Look = { facing: "front" | "back"; mode: "picture" | "video"; mute: boolean; quality: "480p" | "720p" | "1080p" };
export type Lens = {
    look: () => Look;
    watch: ( listener: () => void ) => () => void;
    attach: ( view: CameraView | null ) => void;
    ready: () => void;
};

export function isLens ( value: unknown ): value is Lens {

    return typeof value === "object" && value !== null && typeof (value as Lens).attach === "function" && typeof (value as Lens).look === "function";

}
