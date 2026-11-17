import { describe, expect, test as it } from "bun:test";
import * as media from "engine/media";
import * as fc from "fast-check";

const runs = 10_000;

describe("fuzz media", () => {

    it("a sizing plan never grows an image, never leaves the picture or the asked box, keeps the asked shape within a pixel, and is the same plan when asked twice", () => {

        const side = fc.oneof(fc.integer({ min: 1, max: 12_000 }), fc.constantFrom(Number.NaN, 0, -3, Number.POSITIVE_INFINITY, 0.4));
        const wish = fc.option(fc.oneof(fc.integer({ min: 1, max: 5000 }), fc.constantFrom(Number.NaN, 0, -1, 0.5)), { nil: undefined });
        const sizing: fc.Arbitrary<media.Sizing> = fc.record({ side: wish, width: wish, height: wish, ratio: fc.option(fc.oneof(fc.double({ min: 0.05, max: 20, noNaN: true }), fc.constantFrom(Number.NaN, 0, -2)), { nil: undefined }), format: fc.option(fc.constantFrom("jpeg", "png", "webp"), { nil: undefined }), quality: fc.option(fc.double({ min: -1, max: 2, noNaN: true }), { nil: undefined }) });
        const source: fc.Arbitrary<media.Pictured> = fc.record({ width: side, height: side, type: fc.constantFrom("image/jpeg", "image/png", "image/webp", "image/heic", ""), name: fc.string({ maxLength: 12 }) });

        fc.assert(
            fc.property(source, sizing, ( from, asked ) => {

                const plan = media.planned(from, asked);
                const wide = Number.isFinite(from.width) && from.width >= 1 ? Math.min(16_384, Math.floor(from.width)) : 1;
                const tall = Number.isFinite(from.height) && from.height >= 1 ? Math.min(16_384, Math.floor(from.height)) : 1;
                const box = plan.crop ?? { x: 0, y: 0, width: wide, height: tall };
                const most = ( given: number | undefined ): number => (typeof given === "number" && Number.isFinite(given) && given >= 1 ? Math.floor(given) : Number.POSITIVE_INFINITY);
                const cap = most(asked.side);

                expect(plan).toEqual(media.planned(from, asked));
                expect([box.x >= 0, box.y >= 0, box.x + box.width <= wide, box.y + box.height <= tall, box.width >= 1, box.height >= 1]).toEqual([true, true, true, true, true, true]);
                expect([plan.width >= 1, plan.height >= 1, plan.width <= box.width, plan.height <= box.height]).toEqual([true, true, true, true]);
                expect([plan.width <= Math.max(1, Math.min(most(asked.width), most(asked.width) === Number.POSITIVE_INFINITY ? cap : Number.POSITIVE_INFINITY)), plan.height <= Math.max(1, Math.min(most(asked.height), most(asked.height) === Number.POSITIVE_INFINITY ? cap : Number.POSITIVE_INFINITY))]).toEqual([true, true]);
                expect(Math.abs(plan.width * box.height - plan.height * box.width) <= Math.max(box.width, box.height)).toBe(true);
                expect([plan.quality >= 0.05 && plan.quality <= 1, plan.name.endsWith(plan.format === "jpeg" ? ".jpg" : `.${plan.format}`), plan.type === `image/${plan.format}`]).toEqual([true, true, true]);

                if ( plan.idle ) expect([plan.crop, plan.width, plan.height]).toEqual([undefined, wide, tall]);

            }),
            { numRuns: runs },
        );

    });
    it("an accept list names only the kinds it carries, each once and in one order", () => {

        const part = fc.constantFrom("image/*", "image/png", "video/*", "video/mp4", "audio/*", "audio/mpeg", "application/pdf", ".pdf", "", "IMAGE/JPEG", "text/plain");

        fc.assert(
            fc.property(fc.array(part, { maxLength: 8 }), ( accept ) => {

                const kinds = media.kindsOf(accept);
                const named = new Set(accept.map(( one ) => media.kindOf(one)).filter(( kind ) => kind !== undefined));

                expect(kinds).toEqual((["image", "video", "audio"] as const).filter(( kind ) => named.has(kind)));
                expect(kinds.every(( kind ) => accept.some(( one ) => one.toLowerCase().startsWith(`${kind}/`)))).toBe(true);

            }),
            { numRuns: 2_000 },
        );

    });

});
