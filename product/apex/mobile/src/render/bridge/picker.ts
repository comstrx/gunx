import * as exception from "engine/exception";
import * as media from "engine/media";
import { AudioModule, createAudioPlayer, getRecordingPermissionsAsync, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Image, Platform } from "react-native";
import { film } from "./camera.ts";

type Maker = typeof AudioModule.AudioRecorder;

const formats: Readonly<Record<media.Format, SaveFormat>> = { jpeg: SaveFormat.JPEG, png: SaveFormat.PNG, webp: SaveFormat.WEBP };
const shown: Readonly<Record<"image" | "video", ImagePicker.MediaType>> = { image: "images", video: "videos" };
const patient = 4000;
const voices: Readonly<Record<string, string>> = { m4a: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg", "3gp": "audio/3gpp" };

function read ( uri: string ): Promise<Blob> {

    if ( Platform.OS === "web" || typeof XMLHttpRequest !== "function" ) return fetch(uri).then(( found ) => found.blob());

    return new Promise(( resolve, reject ) => {

        const call = new XMLHttpRequest();

        call.responseType = "blob";
        call.onload = () => resolve(call.response as Blob);
        call.onerror = () => reject(new Error("the picked file could not be read"));
        call.open("GET", uri, true);
        call.send(null);

    });

}
async function blobOf ( uri: string, type: string, given?: Blob ): Promise<Blob> {

    const found = given ?? await read(uri);

    return found.type === type ? found : found.slice(0, found.size, type);

}
async function pictured ( asset: ImagePicker.ImagePickerAsset, index: number ): Promise<media.Picked> {

    const moving = asset.type === "video" || asset.type === "pairedVideo";
    const type = asset.mimeType ?? (moving ? "video/mp4" : "image/jpeg");
    const blob = await blobOf(asset.uri, type, asset.file);
    const made: media.Picked = { name: asset.fileName ?? (moving ? `video-${index + 1}.mp4` : `photo-${index + 1}.jpg`), type, size: asset.fileSize ?? blob.size, uri: asset.uri, blob, width: asset.width, height: asset.height };

    return typeof asset.duration === "number" && asset.duration > 0 ? { ...made, duration: Platform.OS === "web" ? asset.duration : asset.duration / 1000 } : made;

}
function lasting ( uri: string ): Promise<number | undefined> {

    return new Promise(( resolve ) => {

        const player = createAudioPlayer(uri);
        let open = true;
        const settle = ( found?: number ): void => {

            if ( !open ) return;

            open = false;
            clearTimeout(timer);
            heard.remove();
            player.release();
            resolve(typeof found === "number" && Number.isFinite(found) && found > 0 ? found : undefined);

        };
        const heard = player.addListener("playbackStatusUpdate", ( status ) => {

            if ( status.isLoaded ) settle(status.duration);

        });
        const timer = setTimeout(settle, patient);

        if ( player.isLoaded ) settle(player.duration);

    });

}
async function filed ( asset: DocumentPicker.DocumentPickerAsset ): Promise<media.Picked> {

    const type = asset.mimeType ?? "application/octet-stream";
    const blob = await blobOf(asset.uri, type, asset.file);
    const made: media.Picked = { name: asset.name, type, size: asset.size ?? blob.size, uri: asset.uri, blob };
    const duration = media.kindOf(type) === "audio" || media.kindOf(type) === "video" ? await exception.probeAsync(() => lasting(asset.uri)) : undefined;

    return duration === undefined ? made : { ...made, duration };

}

export const camera = { state: () => ImagePicker.getCameraPermissionsAsync(), ask: () => ImagePicker.requestCameraPermissionsAsync() };
export const photos = { state: () => ImagePicker.getMediaLibraryPermissionsAsync(), ask: () => ImagePicker.requestMediaLibraryPermissionsAsync() };
export const microphone = { state: () => getRecordingPermissionsAsync(), ask: () => requestRecordingPermissionsAsync() };

async function pick ( options: media.Pick = {} ): Promise<media.Picked[]> {

    const many = options.multiple === true;
    const kinds = media.kindsOf(options.accept);
    const seen = kinds.flatMap(( kind ) => (kind === "audio" ? [] : [shown[kind]]));

    if ( options.source === "files" || (kinds.length > 0 && seen.length === 0) ) {

        const named = (options.accept ?? []).filter(( kind ) => kind.includes("/"));
        const found = await DocumentPicker.getDocumentAsync({ type: named.length > 0 ? named : "*/*", multiple: many, copyToCacheDirectory: true });

        return found.canceled ? [] : Promise.all(found.assets.map(filed));

    }

    const longest = typeof options.seconds === "number" && options.seconds > 0 ? { videoMaxDuration: Math.ceil(options.seconds) } : {};
    const asked: ImagePicker.ImagePickerOptions = { mediaTypes: seen.length > 0 ? seen : ["images"], allowsMultipleSelection: many, selectionLimit: many ? Math.max(0, Math.floor(options.limit ?? 0)) : 1, quality: 1, exif: false, ...longest };

    if ( options.source !== "camera" ) {

        const chosen = await ImagePicker.launchImageLibraryAsync(asked);

        return chosen.canceled ? [] : Promise.all(chosen.assets.map(pictured));

    }

    if ( !(await ImagePicker.requestCameraPermissionsAsync()).granted ) return [];

    const shot = await ImagePicker.launchCameraAsync({ ...asked, cameraType: options.facing === "front" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back });

    return shot.canceled ? [] : Promise.all(shot.assets.map(pictured));

}
async function resize ( file: media.Picked, sizing: media.Sizing ): Promise<media.Picked> {

    const size = file.width !== undefined && file.height !== undefined ? { width: file.width, height: file.height } : await Image.getSize(file.uri);
    const plan = media.planned({ width: size.width, height: size.height, type: file.type, name: file.name }, sizing);

    if ( plan.idle ) return { ...file, width: size.width, height: size.height };

    const loaded = ImageManipulator.manipulate(file.uri);
    const framed = plan.crop ? loaded.crop({ originX: plan.crop.x, originY: plan.crop.y, width: plan.crop.width, height: plan.crop.height }) : loaded;
    const made = await (await framed.resize({ width: plan.width, height: plan.height }).renderAsync()).saveAsync({ compress: plan.quality, format: formats[plan.format] });
    const blob = await blobOf(made.uri, plan.type);

    return { name: plan.name, type: plan.type, size: blob.size, uri: made.uri, blob, width: made.width, height: made.height };

}
async function voice ( take: media.Take ): Promise<media.Deck | undefined> {

    const Recorder: Maker | undefined = AudioModule.AudioRecorder ?? (AudioModule as { AudioRecorderWeb?: Maker }).AudioRecorderWeb;

    if ( Recorder === undefined ) return undefined;

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    const wanted = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: take.quality === "low" ? 32_000 : 96_000 };
    const made = new Recorder(Platform.OS === "web" ? { ...wanted, ...wanted.web } : wanted);
    const stamp = Date.now();
    let closing: Promise<media.Picked | undefined> | undefined;
    const ended = async ( keep: boolean ): Promise<media.Picked | undefined> => {

        const clip = await exception.probeAsync(async () => {

            await made.stop();

            const uri = keep ? made.uri : null;
            const extension = uri?.startsWith("blob:") === false ? (/\.([a-z0-9]+)$/i.exec(uri)?.[1]?.toLowerCase() ?? "m4a") : "webm";
            const blob = uri ? await blobOf(uri, voices[extension] ?? "audio/mp4") : undefined;

            return blob && uri ? { name: `voice-${stamp}.${extension}`, type: blob.type, size: blob.size, uri, blob } : undefined;

        });

        made.release();
        exception.quiet(setAudioModeAsync({ allowsRecording: false }));

        return clip;

    };

    await made.prepareToRecordAsync(wanted);

    return {
        start: () => made.record(),
        pause: () => made.pause(),
        resume: () => made.record(),
        stop: () => {

            closing ??= ended(true);

            return closing;

        },
        drop: () => {

            closing ??= ended(false);

        },
    };

}
function link ( file: media.Picked ): media.Link {

    return { url: file.uri, release: () => undefined };

}

export const adapter: media.Adapter = { pick, resize, link, voice, camera: ( take ) => film(take, blobOf) };
