import { describe, expect, test as it } from "bun:test";
import * as device from "engine/device";
import * as geo from "engine/geo";
import * as media from "engine/media";
import * as rand from "engine/rand";
import * as world from "engine/world";
import { Appearance } from "react-native";
import { adapter } from "../src/render/bridge/device.ts";
import { adapter as picker } from "../src/render/bridge/picker.ts";
import { source } from "../src/render/bridge/random.ts";
import { storage } from "../src/render/bridge/storage.ts";
import { isLens } from "../src/render/host/lens.ts";
import { scheme } from "../src/stores/scheme.ts";

device.port.use(adapter);
media.port.use(picker);

describe("bridge", () => {

    it("the theme follows the phone's appearance through the device, with no binding of its own", () => {

        expect([world.appearance.bound(), scheme().getState().system]).toEqual([false, "light"]);
        Appearance.setColorScheme("dark");
        expect(scheme().getState().system).toBe("dark");
        Appearance.setColorScheme("light");
        expect(scheme().getState().system).toBe("light");

    });
    it("boot binds the phone's randomness, the facts the engine reads are whole, and the storage takes its writes in turn", async () => {

        const order: string[] = [];
        const slow = storage.lock?.("k", async () => {

            await new Promise(( resolve ) => setTimeout(resolve, 5));
            order.push("first");

        });
        const quick = storage.lock?.("k", async () => {

            order.push("second");

        });

        expect([rand.engine.bound(), rand.engine.get() === source, /^[0-9a-f-]{36}$/.test(rand.uuid()), rand.trace().length > 0]).toEqual([true, true, true, true]);
        expect([adapter.info().pointer, adapter.info().contrast, adapter.info().touch]).toEqual(["coarse", "normal", true]);
        await Promise.all([slow, quick]);
        expect(order).toEqual(["first", "second"]);

    });
    it("the phone answers the device contract: a permission is asked before it is granted, a position and a followed path arrive as points, the clipboard holds what was copied, and a notice waits for its permission", async () => {

        const unit = device.create(adapter);
        const before = [await unit.state("location"), await unit.state("notifications"), await unit.state("clipboard"), await unit.state("contacts")];
        const refused = await unit.notify({ title: "early" });
        const asked = [await unit.ask("location"), await unit.ask("notifications")];
        const found = await geo.locate(unit, { accuracy: "high" });
        const path: number[] = [];
        const stop = geo.follow(unit, { accuracy: "high" }, ( position ) => { path.push(position.lat); });

        await new Promise(( resolve ) => { setTimeout(resolve, 5); });
        stop();

        expect([before, refused, asked]).toEqual([["prompt", "prompt", "granted", "unsupported"], false, ["granted", "granted"]]);
        expect([found.lat, found.lng, found.accuracy, path, unit.info().timeZone !== "", unit.info().language !== ""]).toEqual([30.0444, 31.2357, 9, [30.0454, 30.0464], true, true]);
        expect([await unit.copy("hello"), await unit.paste(), await unit.notify({ title: "now", body: "ready" }), unit.haptic("success"), unit.can("vibrate"), media.can("pick"), unit.can("follow")]).toEqual([true, "hello", true, true, true, true, true]);

    });
    it("the phone picks from the library, the camera and the files, and sizes a photo by the engine's plan before it leaves the device", async () => {

        const unit = device.create(adapter);
        const picker = await import("expo-image-picker") as unknown as { asked: [string, Record<string, unknown>][] };
        const papers = await import("expo-document-picker") as unknown as { asked: Record<string, unknown>[] };
        const worked = await import("expo-image-manipulator") as unknown as { steps: unknown[] };
        const from = [picker.asked.length, papers.asked.length] as const;
        const [photo] = await media.pick({ source: "library", image: { side: 512, ratio: 1, quality: 0.8 } });
        const many = await media.pick({ source: "library", multiple: true, limit: 5 });
        const shot = await media.pick({ source: "camera", facing: "front" });
        const [paper] = await media.pick({ source: "files", accept: ["application/pdf", ".pdf"] });

        expect([photo?.name, photo?.type, photo?.width, photo?.height, photo?.blob?.type, photo?.blob?.size]).toEqual(["a.jpg", "image/jpeg", 512, 512, "image/jpeg", 5]);
        expect(worked.steps).toEqual([["load", "data:image/jpeg"], ["crop", { originX: 500, originY: 0, width: 3000, height: 3000 }], ["resize", { width: 512, height: 512 }], ["save", { compress: 0.8, format: "jpeg" }]]);
        expect([many.map(( one ) => [one.name, one.width, one.size]), shot, await unit.state("camera")]).toEqual([[["a.jpg", 4000, 9_000_000], ["b.jpg", 3000, 9_000_000]], [], "granted"]);
        expect(picker.asked.slice(from[0], from[0] + 3).map(([kind, options]) => [kind, options.allowsMultipleSelection, options.selectionLimit, options.quality, options.cameraType])).toEqual([["library", false, 1, 1, undefined], ["library", true, 5, 1, undefined], ["camera", false, 1, 1, "front"]]);
        expect([paper?.name, paper?.type, paper?.size, paper?.blob?.size, papers.asked.slice(from[1], from[1] + 1)]).toEqual(["terms.pdf", "application/octet-stream", 4, 4, [{ type: ["application/pdf"], multiple: false, copyToCacheDirectory: true }]]);

    });
    it("the phone picks clips and sounds by what was accepted, and records a voice until it is stopped, cancelled or out of time", async () => {

        const unit = device.create(adapter);
        const picker = await import("expo-image-picker") as unknown as { asked: [string, Record<string, unknown>][] };
        const papers = await import("expo-document-picker") as unknown as { asked: Record<string, unknown>[] };
        const audio = await import("expo-audio") as unknown as { log: unknown[] };
        const from = [picker.asked.length, papers.asked.length] as const;
        const [clip] = await media.pick({ source: "library", accept: ["video/*"] });
        const [film] = await media.pick({ source: "camera", accept: ["video/*"], seconds: 14.2 });
        const [mixed] = await media.pick({ source: "library", accept: ["image/*", "video/*"] });
        const [sound] = await media.pick({ source: "library", accept: ["audio/*"] });

        expect([clip?.name, clip?.type, clip?.width, clip?.height, clip?.duration, clip?.blob?.type]).toEqual(["c.mp4", "video/mp4", 1920, 1080, 12.5, "video/mp4"]);
        expect([film?.name, film?.type, film?.duration, film?.height, mixed?.name, mixed?.duration, sound?.name, sound?.type, sound?.duration]).toEqual(["video-1.mp4", "video/mp4", 3, 1280, "a.jpg", undefined, "s.mp3", "audio/mpeg", 2.5]);
        expect(picker.asked.slice(from[0], from[0] + 3).map(([kind, options]) => [kind, options.mediaTypes, options.videoMaxDuration])).toEqual([["library", ["videos"], undefined], ["camera", ["videos"], 15], ["library", ["images", "videos"], undefined]]);
        expect(papers.asked.slice(from[1], from[1] + 1)).toEqual([{ type: ["audio/*"], multiple: false, copyToCacheDirectory: true }]);

        audio.log.length = 0;

        const before = await unit.state("microphone");
        const first = media.record({ quality: "low" });

        await first.start();

        const paused = [first.pause(), first.phase(), first.resume(), first.phase()];
        const voice = await first.stop();

        expect([before, await unit.state("microphone"), media.can("voice"), paused]).toEqual(["prompt", "granted", true, [true, "paused", true, "live"]]);
        expect([voice?.type, voice?.name.startsWith("voice-"), voice?.name.endsWith(".m4a"), voice?.blob?.size, typeof voice?.duration, await first.done === voice]).toEqual(["audio/mp4", true, true, 5, "number", true]);
        expect(audio.log.splice(0)).toEqual([["mode", { allowsRecording: true, playsInSilentMode: true }], ["made", 1, 32_000, ".m4a"], ["prepare", 32_000], "record", "pause", "record", "stop", "release", ["mode", { allowsRecording: false }]]);

        const second = media.record();

        await second.start();
        second.drop();
        expect([await second.done, await second.stop(), second.phase()]).toEqual([undefined, undefined, "done"]);
        await Promise.resolve();

        const third = media.record({ seconds: 0.01 });

        await third.start();
        expect([(await third.done)?.type, third.elapsed() >= 0.01]).toEqual(["audio/mp4", true]);

        expect([media.can("camera"), media.can("link"), media.link({ name: "a.m4a", type: "audio/mp4", size: 1, uri: "file:///a.m4a" }).url]).toEqual([true, true, "file:///a.m4a"]);

    });

    it("the phone films through the camera view the preview shows: it waits for the view, records a clip, snaps a still, flips the lens and frees the camera", async () => {

        const calls: unknown[] = [];
        let landed: (( found: { uri: string } ) => void) | undefined;
        const view = {
            recordAsync: ( options: unknown ) => {

                calls.push(["record", options]);

                return new Promise<{ uri: string }>(( resolve ) => { landed = resolve; });

            },
            stopRecording: () => {

                calls.push("stop");
                landed?.({ uri: "data:video/mp4;base64,Y2xpcA==" });

            },
            takePictureAsync: async ( options: unknown ) => {

                calls.push(["shot", options]);

                return { uri: "data:image/jpeg;base64,cGhvdG8=", width: 1200, height: 1600 };

            },
        };
        const take = media.record({ video: { facing: "front", side: 720 }, audio: false, seconds: 9 });

        await take.open();

        const lens = take.stream();

        if ( !isLens(lens) ) throw new Error("the stream is not a lens");

        const looks: string[] = [];
        const unwatch = lens.watch(() => { looks.push(`${lens.look().facing}/${lens.look().mode}`); lens.ready(); });

        expect([take.phase(), lens.look()]).toEqual(["ready", { facing: "front", mode: "video", mute: true, quality: "720p" }]);
        lens.attach(view as never);
        lens.ready();

        const photo = await take.snap();

        expect([photo?.type, photo?.width, photo?.height, photo?.blob?.size, photo?.name.endsWith(".jpg"), lens.look().mode]).toEqual(["image/jpeg", 1200, 1600, 5, true, "picture"]);
        expect([await take.flip(), lens.look().facing]).toEqual([true, "back"]);
        await take.start();
        expect([take.phase(), lens.look().mode]).toEqual(["live", "video"]);

        const clip = await take.stop();

        unwatch();
        expect([clip?.type, clip?.name.startsWith("clip-"), clip?.name.endsWith(".mp4"), clip?.blob?.size, typeof clip?.duration, take.phase()]).toEqual(["video/mp4", true, true, 4, "number", "done"]);
        expect([looks, calls]).toEqual([["front/picture", "back/picture", "back/video"], [["shot", { quality: 0.92 }], ["record", { maxDuration: 10 }], "stop"]]);

    });
    it("the phone raises a shield over the screen and lowers the same one, each on its own", async () => {

        const unit = device.create(adapter);
        const guard = await import("expo-screen-capture") as unknown as { held: string[] };
        const first = await unit.shield();
        const second = await unit.shield();

        expect([unit.can("shield"), guard.held.length]).toEqual([true, 2]);
        first?.();
        await Promise.resolve();
        expect(guard.held.length).toBe(1);
        second?.();
        await Promise.resolve();
        expect(guard.held).toEqual([]);

    });

});
