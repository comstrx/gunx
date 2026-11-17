import * as exception from "engine/exception";
import type * as media from "engine/media";
import type { CameraView } from "expo-camera";

export type Look = { facing: "front" | "back"; mode: "picture" | "video"; mute: boolean; quality: "480p" | "720p" | "1080p" };
export type Lens = {
    look: () => Look;
    watch: ( listener: () => void ) => () => void;
    attach: ( view: CameraView | null ) => void;
    ready: () => void;
};
type Shown = ( uri: string, type: string ) => Promise<Blob>;

const patient = 8000;

function sharp ( side: number | undefined ): Look["quality"] {

    return side === undefined || side > 720 ? "1080p" : side > 480 ? "720p" : "480p";

}

export function isLens ( value: unknown ): value is Lens {

    return typeof value === "object" && value !== null && typeof (value as Lens).attach === "function" && typeof (value as Lens).look === "function";

}
export async function film ( take: media.Take, blobOf: Shown ): Promise<media.Deck> {

    const wanted = typeof take.video === "object" ? take.video : {};
    const listeners = new Set<() => void>();
    let look: Look = { facing: wanted.facing ?? "back", mode: "video", mute: take.audio === false, quality: sharp(wanted.side) };
    let view: CameraView | null = null;
    let primed: () => void = () => undefined;
    let waiting = new Promise<void>(( resolve ) => {

        primed = resolve;

    });
    let rolling: Promise<{ uri: string } | undefined> | undefined;
    const prepared = (): Promise<void> => Promise.race([waiting, new Promise<void>(( resolve ) => setTimeout(resolve, patient))]);
    const turned = async ( next: Partial<Look> ): Promise<void> => {

        waiting = new Promise<void>(( resolve ) => {

            primed = resolve;

        });
        look = { ...look, ...next };

        for ( const listener of [...listeners] ) exception.probe(listener);

        await Promise.race([waiting, new Promise<void>(( resolve ) => setTimeout(resolve, 1200))]);

    };
    const lens: Lens = {
        look: () => look,
        watch: ( listener ) => {

            listeners.add(listener);

            return () => {

                listeners.delete(listener);

            };

        },
        attach: ( found ) => {

            view = found;

        },
        ready: () => primed(),
    };
    const ended = async ( keep: boolean ): Promise<media.Picked | undefined> => {

        const held = rolling;

        rolling = undefined;
        exception.probe(() => view?.stopRecording());

        const found = held ? await exception.probeAsync(() => held) : undefined;

        if ( !found || !keep ) return undefined;

        const blob = await blobOf(found.uri, "video/mp4");

        return { name: `clip-${Date.now()}.mp4`, type: "video/mp4", size: blob.size, uri: found.uri, blob };

    };

    return {
        stream: lens,
        start: async () => {

            await prepared();

            if ( look.mode !== "video" ) await turned({ mode: "video" });
            if ( !view ) throw exception.fault("unavailable", "media.record", { message: "media: the camera view is not on the screen" });

            rolling = view.recordAsync(typeof take.seconds === "number" && take.seconds > 0 ? { maxDuration: Math.ceil(take.seconds) + 1 } : {});

        },
        stop: () => ended(true),
        drop: () => void ended(false),
        snap: async () => {

            await prepared();

            if ( look.mode !== "picture" ) await turned({ mode: "picture" });

            const shot = await Promise.race([view?.takePictureAsync({ quality: 0.92 }), new Promise<undefined>(( resolve ) => setTimeout(resolve, patient))]);

            if ( !shot ) return undefined;

            const blob = await blobOf(shot.uri, "image/jpeg");

            return { name: `photo-${Date.now()}.jpg`, type: "image/jpeg", size: blob.size, uri: shot.uri, blob, width: shot.width, height: shot.height };

        },
        flip: async () => {

            await turned({ facing: look.facing === "front" ? "back" : "front" });

            return lens;

        },
    };

}
