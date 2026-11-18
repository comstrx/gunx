import { describe, expect, test as it } from "bun:test";
import * as device from "engine/device";
import * as exception from "engine/exception";
import * as media from "engine/media";

type Page = NonNullable<media.Host["document"]>;
type Browser = NonNullable<media.Host["navigator"]>;
type Made = ReturnType<NonNullable<Page["createElement"]>>;
type Input = Extract<Made, { accept: string }>;
type Player = Exclude<Made, Input>;
type Recorder = InstanceType<NonNullable<media.Host["MediaRecorder"]>>;
type Rig = { host: media.Host; page: Page; browser: Browser; calls: string[] };
type Unit = {
    pick: ( options?: media.Pick ) => Promise<media.Picked[]>;
    resize: ( file: media.Picked, sizing: media.Sizing ) => Promise<media.Picked>;
    size: ( file: media.Picked ) => Promise<media.Facts>;
    can: ( capability: media.Capability ) => boolean;
};

function element ( make: ( tag: string ) => Made ): NonNullable<Page["createElement"]> {

    return make as never;

}
function rig (): Rig {

    const page: Page = {};
    const browser: Browser = {};

    return { host: { document: page, navigator: browser }, page, browser, calls: [] };

}
function bound ( adapter: media.Adapter ): Unit {

    return {
        pick: ( options ) => media.port.with(adapter, () => media.pick(options)),
        resize: ( file, sizing ) => media.port.with(adapter, () => media.resize(file, sizing)),
        size: ( file ) => media.port.with(adapter, () => media.size(file)),
        can: ( capability ) => media.port.with(adapter, () => media.can(capability)),
    };

}
function web ( given: media.Host ): Unit {

    return bound(media.webAdapter(given) ?? {});

}

describe("media", () => {

    it("a sizing plan crops to the ratio from the centre, fits inside the asked box, never grows an image, and rests when nothing would change", () => {

        const photo = { width: 4000, height: 3000, type: "image/jpeg", name: "IMG 01.JPEG" };
        const plan = ( source: media.Pictured, sizing?: media.Sizing ): unknown[] => { const made = media.planned(source, sizing); return [made.crop, made.width, made.height, made.format, made.name, made.idle]; };

        expect(plan(photo)).toEqual([undefined, 4000, 3000, "jpeg", "IMG 01.jpg", true]);
        expect(plan(photo, { side: 512 })).toEqual([undefined, 512, 384, "jpeg", "IMG 01.jpg", false]);
        expect(plan(photo, { side: 512, ratio: 1 })).toEqual([{ x: 500, y: 0, width: 3000, height: 3000 }, 512, 512, "jpeg", "IMG 01.jpg", false]);
        expect(plan({ ...photo, width: 3000, height: 4000 }, { ratio: 16 / 9, width: 1280 })).toEqual([{ x: 0, y: 1156, width: 3000, height: 1688 }, 1280, 720, "jpeg", "IMG 01.jpg", false]);
        expect(plan(photo, { width: 1000, height: 300 })).toEqual([undefined, 400, 300, "jpeg", "IMG 01.jpg", false]);
        expect(plan({ width: 200, height: 100, type: "image/png", name: "logo.png" }, { side: 512, ratio: 2 })).toEqual([undefined, 200, 100, "png", "logo.png", true]);
        expect(plan({ width: 200, height: 100, type: "image/png", name: "logo.png" }, { format: "webp" })).toEqual([undefined, 200, 100, "webp", "logo.webp", false]);
        expect(plan({ width: 90, height: 90, type: "image/heic", name: ".heic" }, {})).toEqual([undefined, 90, 90, "jpeg", "image.jpg", false]);
        expect(plan({ width: Number.NaN, height: -4, type: "image/jpeg", name: "" }, { side: -1, ratio: Number.NaN, quality: 9 })).toEqual([undefined, 1, 1, "jpeg", "image.jpg", true]);
        expect([media.planned(photo, { quality: 0.5 }).quality, media.planned(photo, { quality: 0 }).quality, media.planned(photo).quality, media.planned(photo, { format: "png" }).type]).toEqual([0.5, 0.05, 0.82, "image/png"]);
        expect(["image/jpeg", "image/heic", "image/svg+xml", "image/gif", "application/pdf", ""].map(media.sizable)).toEqual([true, true, false, false, false, false]);

    });
    it("an accept list names the kinds of media it asks for, in one order, and nothing else", () => {

        expect([media.kindOf("image/png"), media.kindOf("VIDEO/mp4"), media.kindOf("audio/*"), media.kindOf("application/pdf"), media.kindOf(".pdf"), media.kindOf("")]).toEqual(["image", "video", "audio", undefined, undefined, undefined]);
        expect([media.kindsOf(undefined), media.kindsOf([]), media.kindsOf([".pdf", "application/pdf"])]).toEqual([[], [], []]);
        expect([media.kindsOf(["audio/*", "image/png", "image/*"]), media.kindsOf(["video/mp4", "audio/mpeg", "image/webp"])]).toEqual([["image", "audio"], ["image", "video", "audio"]]);

    });
    it("pick keeps at most the asked count and sizes every image through the adapter; other files, a failed sizing and a device that cannot size keep the original", async () => {

        const files: media.Picked[] = [{ name: "a.jpg", type: "image/jpeg", size: 9, uri: "a" }, { name: "b.pdf", type: "application/pdf", size: 8, uri: "b" }, { name: "c.png", type: "image/png", size: 7, uri: "c" }, { name: "d.png", type: "image/png", size: 6, uri: "d" }];
        const sized: string[] = [];
        const unit = bound({
            pick: async () => files,
            resize: async ( file, sizing ) => {

                sized.push(`${file.name}:${sizing.side}`);

                if ( file.name === "c.png" ) throw new Error("decode");

                return { ...file, name: `small-${file.name}`, size: 1 };

            },
        });

        expect((await unit.pick({ multiple: true, limit: 3, image: { side: 64 } })).map(( one ) => one.name)).toEqual(["small-a.jpg", "b.pdf", "c.png"]);
        expect(sized).toEqual(["a.jpg:64", "c.png:64"]);
        expect([(await unit.pick({ limit: 0 })).length, (await unit.pick()).length, unit.can("resize"), (await unit.resize(files[1] as media.Picked, {})) === files[1]]).toEqual([4, 4, true, true]);

        const plain = bound({ pick: async () => files });

        expect([(await plain.pick({ image: { side: 64 } })).map(( one ) => one.name), plain.can("resize")]).toEqual([["a.jpg", "b.pdf", "c.png", "d.png"], false]);

    });
    it("the browser sizes an image on a canvas: it draws the planned crop into the planned box, paints white under a jpeg, and hands back the original when nothing changes or the canvas is missing", async () => {

        const r = rig();
        const drawn: unknown[] = [];
        const source = new File(["0123456789"], "shot.png", { type: "image/png" });
        const picked: media.Picked = { name: source.name, type: source.type, size: source.size, uri: "", blob: source };
        let brushes = true;

        r.host.createImageBitmap = async ( _, options ) => {

            drawn.push(["bitmap", options?.imageOrientation]);

            const bitmap = { width: 400, height: 200, close: () => { drawn.push("closed"); bitmap.width = 0; bitmap.height = 0; } };

            return bitmap;

        };
        r.host.OffscreenCanvas = class {

            constructor ( readonly width: number, readonly height: number ) {

                drawn.push(["canvas", width, height]);

            }
            getContext () {

                return brushes ? { fillStyle: "", fillRect: ( ...box: number[] ) => { drawn.push(["fill", ...box]); }, drawImage: ( _: unknown, ...box: number[] ) => { drawn.push(["draw", ...box]); } } : null;

            }
            async convertToBlob ( options?: { type?: string; quality?: number } ) {

                drawn.push(["blob", options?.type, options?.quality]);

                return new Blob(["abc"], { type: options?.type ?? "" });

            }

        };

        const unit = web(r.host);
        const small = await unit.resize(picked, { side: 100, ratio: 1, format: "jpeg", quality: 0.7 });

        expect([small.name, small.type, small.size, small.width, small.height, small.blob instanceof Blob, unit.can("resize")]).toEqual(["shot.jpg", "image/jpeg", 3, 100, 100, true, true]);
        expect(drawn.splice(0)).toEqual([["bitmap", "from-image"], ["canvas", 100, 100], ["fill", 0, 0, 100, 100], ["draw", 100, 0, 200, 200, 0, 0, 100, 100], "closed", ["blob", "image/jpeg", 0.7]]);

        const same = await unit.resize(picked, { side: 4000 });

        expect([same.blob === source, same.width, same.height, drawn.splice(0)]).toEqual([true, 400, 200, [["bitmap", "from-image"], "closed"]]);

        const lossless = await unit.resize(picked, { side: 200 });

        expect([lossless.name, lossless.type, drawn.splice(0).some(( step ) => Array.isArray(step) && step[0] === "fill")]).toEqual(["shot.png", "image/png", false]);

        brushes = false;

        expect([(await unit.resize(picked, { side: 100 })).blob === source, (await unit.resize({ ...picked, blob: undefined }, { side: 100 })).uri]).toEqual([true, ""]);

        delete r.host.OffscreenCanvas;

        expect([web(r.host).can("resize"), (await web(r.host).resize(picked, { side: 100 })) === picked]).toEqual([false, true]);

    });
    it("pick shapes the file input, reads what was chosen and answers nothing on cancel, refusal or no gesture", async () => {

        const r = rig();
        const took = (): string[] => r.calls.splice(0);
        const made: Input[] = [];
        const chosen = [new File(["ab"], "a.png", { type: "image/png" }), new File(["abc"], "b.pdf", { type: "application/pdf" })];
        let files: File[] | null = chosen;
        let click = "change";
        let broken = false;

        r.page.createElement = element(( tag ) => {

            const input: Input = {
                type: "", accept: "", multiple: false, capture: "", onchange: null, oncancel: null, files,
                click: () => {

                    r.calls.push("click");

                    if ( click === "throw" ) throw new Error("no gesture");
                    if ( click === "change" ) input.onchange?.();
                    if ( click === "cancel" ) input.oncancel?.();

                },
            };

            r.calls.push(`make:${tag}`);

            if ( broken ) throw new Error("detached");

            made.push(input);

            return input;

        });

        const unit = web(r.host);
        const shape = (): unknown[] => { const last = made.at(-1); return [last?.type, last?.accept, last?.multiple, last?.capture]; };

        expect(await unit.pick()).toEqual([{ name: "a.png", type: "image/png", size: 2, uri: "", blob: chosen[0] }, { name: "b.pdf", type: "application/pdf", size: 3, uri: "", blob: chosen[1] }]);
        expect([shape(), took()]).toEqual([["file", "image/*", false, ""], ["make:input", "click"]]);
        expect([(await unit.pick({ source: "files" })).length, shape()]).toEqual([2, ["file", "", false, ""]]);
        expect([(await unit.pick({ source: "library", multiple: true })).length, shape()]).toEqual([2, ["file", "image/*", true, ""]]);
        expect([(await unit.pick({ source: "camera" })).length, shape()]).toEqual([2, ["file", "image/*", false, "environment"]]);
        expect([(await unit.pick({ source: "camera", facing: "front", accept: ["video/*"] })).length, shape()]).toEqual([2, ["file", "video/*", false, "user"]]);
        expect([(await unit.pick({ source: "files", accept: ["image/png", ".pdf"] })).length, shape()]).toEqual([2, ["file", "image/png,.pdf", false, ""]]);
        expect([(await unit.pick({ accept: [] })).length, shape()]).toEqual([2, ["file", "", false, ""]]);
        took();
        click = "cancel";
        expect([await unit.pick(), took()]).toEqual([[], ["make:input", "click"]]);
        click = "throw";
        expect([await unit.pick(), took()]).toEqual([[], ["make:input", "click"]]);
        click = "change";
        files = null;
        expect([await unit.pick(), took()]).toEqual([[], ["make:input", "click"]]);
        files = [];
        expect([await unit.pick(), took()]).toEqual([[], ["make:input", "click"]]);
        files = chosen;
        r.browser.userActivation = { isActive: false };
        expect([await unit.pick(), took()]).toEqual([[], []]);
        r.browser.userActivation = { isActive: true };
        expect([(await unit.pick()).length, took()]).toEqual([2, ["make:input", "click"]]);
        r.browser.userActivation = {};
        expect([(await unit.pick()).length, took()]).toEqual([2, ["make:input", "click"]]);
        broken = true;
        expect([await unit.pick(), took()]).toEqual([[], ["make:input"]]);
        expect([await web({ navigator: {}, document: {} }).pick(), web({ navigator: {}, document: {} }).can("pick"), unit.can("pick")]).toEqual([[], false, true]);

    });
    it("a picked clip or sound is measured from its metadata; an unreadable one, a page without object links and every other file stay as they were", async () => {

        const r = rig();
        const seen: string[] = [];
        const clip = new File(["abcd"], "c.mp4", { type: "video/mp4" });
        const sound = new File(["abc"], "s.mp3", { type: "audio/mpeg" });
        const still = new File(["ab"], "a.png", { type: "image/png" });
        let facts: [number, number, number] | undefined = [12.5, 1280, 720];

        r.page.createElement = element(( tag ) => {

            if ( tag === "input" ) {

                const input: Input = { type: "", accept: "", multiple: false, capture: "", onchange: null, oncancel: null, files: [clip, sound, still], click: () => input.onchange?.() };

                return input;

            }

            const player: Player = {
                preload: "", duration: Number.NaN, videoWidth: 0, videoHeight: 0, onloadedmetadata: null, onerror: null,
                get src () { return ""; },
                set src ( url: string ) {

                    seen.push(`${tag}:${url}`);

                    if ( url === "" ) return;
                    if ( facts === undefined ) { player.onerror?.(); return; }

                    [player.duration, player.videoWidth, player.videoHeight] = url.endsWith("4") ? facts : [facts[0], 0, 0];
                    player.onloadedmetadata?.();

                },
            };

            return player;

        });
        r.host.URL = { createObjectURL: ( blob ) => `blob:${blob.size}`, revokeObjectURL: ( url ) => { seen.push(`drop:${url}`); } };

        const bare = { name: "c.mp4", type: "video/mp4", size: 4, uri: "", blob: clip };
        const found = await web(r.host).pick({ accept: ["video/*", "audio/*", "image/*"], multiple: true });

        expect(found).toEqual([{ ...bare, duration: 12.5, width: 1280, height: 720 }, { name: "s.mp3", type: "audio/mpeg", size: 3, uri: "", blob: sound, duration: 12.5 }, { name: "a.png", type: "image/png", size: 2, uri: "", blob: still }]);
        expect(seen.splice(0)).toEqual(["video:blob:4", "video:", "drop:blob:4", "video:blob:3", "video:", "drop:blob:3"]);
        facts = undefined;
        expect((await web(r.host).pick())[0]).toEqual(bare);
        expect(seen.splice(0, 3)).toEqual(["video:blob:4", "video:", "drop:blob:4"]);
        facts = [Number.POSITIVE_INFINITY, 0, 0];
        expect((await web(r.host).pick())[0]).toEqual(bare);
        delete r.host.URL;
        seen.length = 0;
        expect([(await web(r.host).pick())[0], seen]).toEqual([bare, []]);

    });
    it("a voice opens the microphone once the device allows it, records, pauses, resumes and stops into a clip; a drop, a failure or a refusal leaves nothing", async () => {

        const r = rig();
        const log: unknown[] = [];
        let supported = ["audio/mp4"];
        let grant: device.Grant = "granted";
        let last: Recorder | undefined;
        const unit: device.Adapter = {
            info: () => device.unknownInfo(),
            watch: () => () => undefined,
            state: () => grant,
            ask: async () => grant,
            capture: async ( options ) => {

                log.push(["capture", options]);

                return { stream: "line", stop: () => { log.push("freed"); } };

            },
        };

        r.host.MediaRecorder = class {

            static isTypeSupported = ( type: string ): boolean => supported.includes(type);
            state = "inactive";
            mimeType: string;
            ondataavailable: Recorder["ondataavailable"] = null;
            onstop: Recorder["onstop"] = null;
            onerror: Recorder["onerror"] = null;

            constructor ( line: unknown, options?: { mimeType?: string; audioBitsPerSecond?: number; videoBitsPerSecond?: number } ) {

                this.mimeType = options?.mimeType ?? "";
                last = this;
                log.push(["made", line, options]);

            }
            start (): void { this.state = "recording"; }
            pause (): void { this.state = "paused"; log.push("paused"); }
            resume (): void { this.state = "recording"; log.push("resumed"); }
            stop (): void {

                this.state = "inactive";
                this.ondataavailable?.({ data: new Blob(["voice"]) });
                this.ondataavailable?.({ data: new Blob([]) });
                this.onstop?.();

            }

        };

        const made = media.webAdapter(r.host) ?? {};

        await device.port.with(unit, () => media.port.with(made, async () => {

            const first = media.record({ quality: "low" });
            const seen: string[] = [];
            const unwatch = first.watch(() => { seen.push(first.phase()); });

            expect([first.phase(), first.stream(), first.pause(), first.resume(), await first.snap(), await first.flip(), media.can("voice"), media.can("camera")]).toEqual(["idle", undefined, false, false, undefined, false, true, false]);
            await first.open();
            await first.open();
            expect([first.phase(), first.stream(), log.splice(0)]).toEqual(["ready", "line", [["capture", { audio: true }]]]);
            await first.start();
            await first.start();
            expect([first.phase(), first.resume(), first.pause(), first.phase(), first.pause(), first.resume(), first.phase(), await first.snap()]).toEqual(["live", false, true, "paused", false, true, "live", undefined]);

            const clip = await first.stop();

            unwatch();
            expect([clip?.type, clip?.size, clip?.name.startsWith("voice-"), clip?.name.endsWith(".m4a"), clip?.blob?.type, typeof clip?.duration, first.elapsed() === clip?.duration, first.phase(), await first.done === clip, await first.stop() === clip, first.stream()]).toEqual(["audio/mp4", 5, true, true, "audio/mp4", "number", true, "done", true, true, undefined]);
            expect([seen, log.splice(0)]).toEqual([["ready", "live", "paused", "live", "done"], [["made", "line", { mimeType: "audio/mp4", audioBitsPerSecond: 32_000 }], "paused", "resumed", "freed"]]);

            supported = [];

            const timed = media.record({ seconds: 0.01 });

            await timed.start();

            const short = await timed.done;

            expect([short?.type, short?.name.endsWith(".webm"), last?.state, timed.phase(), log.splice(0).at(-1)]).toEqual(["audio/webm", true, "inactive", "done", "freed"]);

            const ready = media.record();

            await ready.open();
            ready.drop();
            expect([await ready.done, await ready.stop(), ready.phase(), log.splice(0)]).toEqual([undefined, undefined, "done", [["capture", { audio: true }], "freed"]]);

            const broken = media.record();

            await broken.start();
            last?.onerror?.();
            expect([await broken.stop(), log.splice(0).at(-1)]).toEqual([undefined, "freed"]);

            const early = media.record();

            early.drop();
            await early.start();
            expect([early.phase(), await early.done, log.splice(0)]).toEqual(["done", undefined, []]);

            grant = "denied";

            const refused = media.record();
            const denied = await exception.attempt(() => refused.start());

            grant = "granted";
            expect([denied.ok ? undefined : [denied.fault.code, denied.fault.reason], refused.phase(), log.splice(0)]).toEqual([["forbidden", "device.microphone.denied"], "idle", []]);
            await refused.start();
            expect([refused.phase(), await refused.stop() !== undefined]).toEqual(["live", true]);

        }));

        delete r.host.MediaRecorder;

        const bare = await device.port.with(unit, () => media.port.with(media.webAdapter(r.host) ?? {}, async () => [media.can("voice"), await exception.attempt(() => media.record().start())] as const));

        expect([bare[0], bare[1].ok ? undefined : [bare[1].fault.code, bare[1].fault.reason]]).toEqual([false, ["unavailable", "media.record"]]);

    });
    it("a camera take opens the lens, flips it, snaps a still, records a clip, and frees the camera every way out", async () => {

        const r = rig();
        const log: unknown[] = [];
        let grant: device.Grant = "granted";
        let lines = 0;
        const unit: device.Adapter = {
            info: () => device.unknownInfo(),
            watch: () => () => undefined,
            state: () => grant,
            ask: async () => grant,
            capture: async ( options ) => {

                lines += 1;
                log.push(["capture", options]);

                const name = `line-${lines}`;

                return { stream: name, stop: () => { log.push(`freed ${name}`); } };

            },
        };

        r.page.createElement = element(( tag ) => {

            const view: Player = {
                preload: "", duration: Number.NaN, videoWidth: 0, videoHeight: 0, onloadedmetadata: null, onloadeddata: null, onerror: null, src: "",
                play: () => { view.onloadeddata?.(); },
            };

            log.push(`make:${tag}`);

            return view;

        });
        r.host.createImageBitmap = async () => ({ width: 640, height: 480, close: () => undefined });
        r.host.OffscreenCanvas = class {

            readonly size: readonly [number, number];

            constructor ( width: number, height: number ) { this.size = [width, height]; }
            getContext (): ReturnType<InstanceType<NonNullable<media.Host["OffscreenCanvas"]>>["getContext"]> { return { fillStyle: "", fillRect: () => undefined, drawImage: () => undefined }; }
            async convertToBlob ( options?: { type?: string } ): Promise<Blob> { return new Blob([`${this.size[0]}x${this.size[1]}`], { type: options?.type ?? "image/png" }); }

        };
        r.host.MediaRecorder = class {

            static isTypeSupported = ( type: string ): boolean => type === "video/webm";
            state = "inactive";
            mimeType: string;
            ondataavailable: Recorder["ondataavailable"] = null;
            onstop: Recorder["onstop"] = null;
            onerror: Recorder["onerror"] = null;

            constructor ( line: unknown, options?: { mimeType?: string; videoBitsPerSecond?: number } ) {

                this.mimeType = options?.mimeType ?? "";
                log.push(["made", line, options?.videoBitsPerSecond]);

            }
            start (): void { this.state = "recording"; }
            stop (): void {

                this.state = "inactive";
                this.ondataavailable?.({ data: new Blob(["film"]) });
                this.onstop?.();

            }

        };

        await device.port.with(unit, () => media.port.with(media.webAdapter(r.host) ?? {}, async () => {

            const take = media.record({ video: { facing: "front", side: 720 }, seconds: 5 });

            expect([media.can("camera"), take.phase()]).toEqual([true, "idle"]);
            await take.open();
            expect([take.phase(), take.stream(), log.splice(0)]).toEqual(["ready", "line-1", [["capture", { video: { facing: "user", side: 720 }, audio: true }]]]);

            const photo = await take.snap();
            const small = await take.snap({ side: 64 });

            expect([photo?.type, photo?.width, photo?.height, photo?.name.startsWith("photo-"), photo?.name.endsWith(".jpg"), await photo?.blob?.text()]).toEqual(["image/jpeg", 640, 480, true, true, "640x480"]);
            expect([small?.width, small?.height, await small?.blob?.text(), log.splice(0)]).toEqual([64, 48, "64x48", ["make:video", "make:video"]]);
            expect([await take.flip(), take.stream(), take.phase(), log.splice(0)]).toEqual([true, "line-2", "ready", ["freed line-1", ["capture", { video: { facing: "environment", side: 720 }, audio: true }]]]);
            await take.start();
            expect([take.phase(), await take.flip(), take.stream(), take.elapsed() >= 0]).toEqual(["live", false, "line-2", true]);

            const clip = await take.stop();

            expect([clip?.type, clip?.name.startsWith("clip-"), clip?.name.endsWith(".webm"), clip?.size, take.phase(), await take.snap(), log.splice(0)]).toEqual(["video/webm", true, true, 4, "done", undefined, [["made", "line-2", 2_500_000], "freed line-2"]]);

            const silent = media.record({ video: true, audio: false, quality: "low" });

            await silent.start();
            silent.drop();
            expect([await silent.done, silent.phase(), log.splice(0)]).toEqual([undefined, "done", [["capture", { video: { facing: "environment", side: undefined }, audio: false }], ["made", "line-3", 600_000], "freed line-3"]]);

            grant = "denied";

            const refused = await exception.attempt(() => media.record({ video: true }).open());

            expect([refused.ok ? undefined : [refused.fault.code, refused.fault.reason], log.splice(0)]).toEqual([["forbidden", "device.camera.denied"], []]);

        }));

    });
    it("a link plays a blob through an object address and releases it; a file with no blob, or a page without object links, plays from its own address", () => {

        const r = rig();
        const seen: string[] = [];
        const held: media.Picked = { name: "a.webm", type: "video/webm", size: 3, uri: "", blob: new Blob(["abc"]) };
        const filed: media.Picked = { name: "b.mp4", type: "video/mp4", size: 3, uri: "file:///b.mp4" };

        r.host.URL = { createObjectURL: ( blob ) => `blob:${blob.size}`, revokeObjectURL: ( url ) => { seen.push(url); } };

        const made = media.webAdapter(r.host) ?? {};
        const [first, second, third, fourth] = [media.port.with(made, () => media.link(held)), media.port.with(made, () => media.link(filed)), media.port.with({}, () => media.link(filed)), media.port.with({}, () => media.link(held))];

        first.release();
        second.release();
        third.release();
        expect([first.url, second.url, third.url, fourth.url, seen]).toEqual(["blob:3", "file:///b.mp4", "file:///b.mp4", "", ["blob:3"]]);

    });
    it("a file is sized from its picture or its metadata, and keeps what it already knows when the page cannot read it", async () => {

        const r = rig();
        const still: media.Picked = { name: "a.png", type: "image/png", size: 2, uri: "", blob: new File(["ab"], "a.png", { type: "image/png" }) };
        const known: media.Picked = { name: "b.png", type: "image/png", size: 2, uri: "b", width: 10, height: 20 };

        r.host.createImageBitmap = async () => ({ width: 640, height: 480, close: () => undefined });

        expect([await web(r.host).size(still), await web(r.host).size(known), await bound({}).size(known), await bound({}).size(still), bound({}).can("size")]).toEqual([{ width: 640, height: 480, duration: undefined }, { width: 10, height: 20, duration: undefined }, { width: 10, height: 20, duration: undefined }, { width: undefined, height: undefined, duration: undefined }, false]);

    });

});
