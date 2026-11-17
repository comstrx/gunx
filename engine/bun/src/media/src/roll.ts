import type * as device from "engine-device";
import * as exception from "engine-exception";
import type { Adapter, Deck, Host, Picked, Recorder, Take } from "./arch.ts";

const voices: readonly [string, string][] = [["audio/webm;codecs=opus", "webm"], ["audio/mp4", "m4a"], ["audio/ogg;codecs=opus", "ogg"]];
const films: readonly [string, string][] = [["video/webm;codecs=vp9,opus", "webm"], ["video/webm;codecs=vp8,opus", "webm"], ["video/webm", "webm"], ["video/mp4", "mp4"]];
const patient = 4000;
const slice = 1000;

export function recorder ( host: Host, page: NonNullable<Host["document"]> ): Pick<Adapter, "voice" | "camera"> {

    const rolled = ( Maker: NonNullable<Host["MediaRecorder"]>, stream: unknown, take: Take, filmed: boolean ): { made: Recorder; end: ( keep: boolean ) => Promise<Picked | undefined> } => {

        const [wanted, extension] = (filmed ? films : voices).find(([type]) => Maker.isTypeSupported?.(type) === true) ?? ["", "webm"];
        const lean = take.quality === "low";
        const made = new Maker(stream, { ...(wanted === "" ? {} : { mimeType: wanted }), audioBitsPerSecond: lean ? 32_000 : 96_000, ...(filmed ? { videoBitsPerSecond: lean ? 600_000 : 2_500_000 } : {}) });
        const chunks: Blob[] = [];
        const stamp = Date.now();
        let kept = true;
        const halt = (): void => {

            if ( made.state !== "inactive" ) made.stop();

        };
        const done = new Promise<Picked | undefined>(( resolve ) => {

            made.ondataavailable = ( event ) => {

                if ( event.data.size > 0 ) chunks.push(event.data);

            };
            made.onstop = () => {

                const type = (made.mimeType || wanted || (filmed ? "video/webm" : "audio/webm")).split(";")[0] ?? "audio/webm";
                const blob = kept && chunks.length > 0 ? new Blob(chunks, { type }) : undefined;

                resolve(blob ? { name: `${filmed ? "clip" : "voice"}-${stamp}.${extension}`, type, size: blob.size, uri: "", blob } : undefined);

            };
            made.onerror = () => {

                kept = false;
                halt();

            };

        });

        made.start(slice);

        return {
            made,
            end: ( keep ) => {

                kept = kept && keep;
                halt();

                return done;

            },
        };

    };
    const voice = async ( take: Take, unit: device.Device ): Promise<Deck | undefined> => {

        const Maker = host.MediaRecorder;
        const line = Maker ? await unit.capture({ audio: true }) : undefined;

        if ( !Maker || !line ) return undefined;

        let roll: ReturnType<typeof rolled> | undefined;
        const ended = async ( keep: boolean ): Promise<Picked | undefined> => {

            const clip = roll ? await roll.end(keep) : undefined;

            line.stop();

            return clip;

        };

        return {
            stream: line.stream,
            start: () => {

                roll ??= rolled(Maker, line.stream, take, false);

            },
            pause: () => roll?.made.pause?.(),
            resume: () => roll?.made.resume?.(),
            stop: () => ended(true),
            drop: () => void ended(false),
        };

    };
    const shot = async ( stream: unknown ): Promise<Picked | undefined> => {

        const view = host.createImageBitmap && host.OffscreenCanvas ? exception.probe(() => page.createElement?.("video")) : undefined;

        if ( !view || !host.createImageBitmap || !host.OffscreenCanvas ) return undefined;

        view.muted = true;
        view.srcObject = stream;
        await new Promise<void>(( resolve ) => {

            const timer = setTimeout(resolve, patient);

            view.onloadeddata = () => {

                clearTimeout(timer);
                resolve();

            };
            void exception.probeAsync(() => view.play?.());

        });

        const bitmap = await exception.probeAsync(() => host.createImageBitmap?.(view));

        view.onloadeddata = null;
        view.srcObject = null;

        if ( !bitmap ) return undefined;

        const { width, height } = bitmap;
        const canvas = new host.OffscreenCanvas(width, height);
        const brush = canvas.getContext("2d");

        brush?.drawImage(bitmap, 0, 0, width, height, 0, 0, width, height);
        bitmap.close?.();

        const blob = brush ? await exception.probeAsync(() => canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 })) : undefined;

        return blob ? { name: `photo-${Date.now()}.jpg`, type: "image/jpeg", size: blob.size, uri: "", blob, width, height } : undefined;

    };
    const camera = async ( take: Take, unit: device.Device ): Promise<Deck | undefined> => {

        const Maker = host.MediaRecorder;
        const wanted = typeof take.video === "object" ? take.video : {};
        let front = wanted.facing === "front";
        const opened = (): Promise<device.Stream | undefined> => unit.capture({ video: { facing: front ? "user" : "environment", side: wanted.side }, audio: take.audio !== false });
        let line = await opened();
        let roll: ReturnType<typeof rolled> | undefined;

        if ( !line ) return undefined;

        const ended = async ( keep: boolean ): Promise<Picked | undefined> => {

            const clip = roll ? await roll.end(keep) : undefined;

            line?.stop();

            return clip;

        };
        const deck: Deck = {
            stream: line.stream,
            start: () => {

                if ( !Maker || !line ) throw exception.fault("unavailable", "media.record", { message: "media: this browser cannot record" });

                roll ??= rolled(Maker, line.stream, take, true);

            },
            pause: () => roll?.made.pause?.(),
            resume: () => roll?.made.resume?.(),
            stop: () => ended(true),
            drop: () => void ended(false),
            snap: () => (line ? shot(line.stream) : Promise.resolve(undefined)),
            flip: async () => {

                if ( roll ) return deck.stream;

                line?.stop();
                front = !front;
                line = await opened();

                if ( !line ) {

                    front = !front;
                    line = await opened();

                }

                deck.stream = line?.stream;

                return deck.stream;

            },
        };

        return deck;

    };

    return { voice: host.MediaRecorder ? voice : undefined, camera: page.createElement ? camera : undefined };

}
