import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as geo from "engine/geo";

const cairo = { lat: 30.0444, lng: 31.2357 };
const riyadh = { lat: 24.7136, lng: 46.6753 };

describe("geo", () => {

    it("points measure, move and format", () => {

        expect(Math.round(geo.distance(cairo, riyadh) / 1000)).toBe(1634);
        expect(Math.round(geo.bearing(cairo, riyadh))).toBe(108);
        expect(geo.distance(cairo, cairo)).toBe(0);

        const moved = geo.destination(cairo, 1000, 90);

        expect(Math.round(geo.distance(cairo, moved))).toBe(1000);
        expect(Math.round(geo.bearing(cairo, moved))).toBe(90);
        expect(Math.abs(geo.distance(cairo, geo.midpoint(cairo, riyadh)) - geo.distance(riyadh, geo.midpoint(cairo, riyadh)))).toBeLessThan(1);
        expect(geo.interpolate(cairo, riyadh, 0)).toEqual(cairo);
        expect(geo.round(geo.interpolate(cairo, riyadh, 1), 4)).toEqual(riyadh);
        expect(geo.isPoint({ lat: 1, lng: 2 }) && !geo.isPoint({ lat: 91, lng: 0 }) && !geo.isPoint("x")).toBe(true);
        expect(geo.parse(" 30.0444 , 31.2357 ")).toEqual(cairo);
        expect(geo.parse("x")).toBeUndefined();
        expect(geo.format(cairo, 2)).toBe("30.04, 31.24");
        expect(geo.same(cairo, { lat: 30.044401, lng: 31.2357 })).toBe(true);
        expect(geo.link(cairo)).toBe("https://www.google.com/maps/search/?api=1&query=30.0444,31.2357");
        expect(geo.link(cairo, "apple", "Cairo")).toBe("https://maps.apple.com/?ll=30.0444,31.2357&q=Cairo");
        expect(geo.link(cairo, "waze")).toContain("waze.com");
        expect(geo.destination({ lat: 0, lng: 179.9 }, 50_000, 90).lng).toBeLessThan(-179);

    });
    it("paths, bounds, polygons and simplification", () => {

        const path = [cairo, { lat: 27, lng: 38 }, riyadh];

        expect(Math.round(geo.length(path) / 1000)).toBe(1647);
        expect(geo.round(geo.along(path, 0) ?? cairo, 4)).toEqual(cairo);
        expect(geo.along(path, 10_000_000)).toEqual(riyadh);
        expect(geo.along([], 1)).toBeUndefined();

        const box = geo.bounds(path);

        expect(box).toEqual({ south: 24.7136, west: 31.2357, north: 30.0444, east: 46.6753 });
        expect(geo.bounds([])).toBeUndefined();
        expect(geo.bounds([cairo], 1000)?.north).toBeGreaterThan(cairo.lat);
        expect(geo.round(geo.center(box ?? { south: 0, west: 0, north: 0, east: 0 }), 4)).toEqual({ lat: 27.379, lng: 38.9555 });

        const fitted = geo.fit(path, { width: 800, height: 600 });

        expect(fitted?.zoom).toBe(6);
        expect(geo.fit([cairo], { width: 800, height: 600 })?.zoom).toBe(16);
        expect(geo.fit([], { width: 1, height: 1 })).toBeUndefined();

        const square = [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 10, lng: 10 }, { lat: 10, lng: 0 }];

        expect(geo.inside({ lat: 5, lng: 5 }, square) && !geo.inside({ lat: 15, lng: 5 }, square)).toBe(true);
        expect(geo.nearest(cairo, [riyadh, { lat: 30.05, lng: 31.24 }])?.item.lat).toBe(30.05);
        expect(geo.nearest(cairo, [])).toBeUndefined();

        const noisy = [{ lat: 0, lng: 0 }, { lat: 0.00001, lng: 1 }, { lat: 0, lng: 2 }, { lat: 1, lng: 3 }];

        expect(geo.simplify(noisy, 10)).toEqual([{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }, { lat: 1, lng: 3 }]);
        expect(geo.simplify([cairo], 1)).toEqual([cairo]);

    });
    it("geohash, polyline and tiles encode and decode", () => {

        expect(geo.geohash(cairo, 6)).toBe("stq4yv");
        expect(geo.geohash(cairo, 12)).toHaveLength(12);

        const back = geo.ungeohash("stq4yv");

        expect(geo.distance(cairo, back ?? cairo)).toBeLessThan(1000);
        expect(geo.ungeohash("")).toBeUndefined();
        expect(geo.ungeohash("a!")).toBeUndefined();

        const encoded = geo.encode([{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]);

        expect(encoded).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
        expect(geo.decode(encoded)).toEqual([{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]);
        expect(geo.decode("")).toEqual([]);
        expect(geo.tile(cairo, 10)).toEqual({ x: 600, y: 422, z: 10 });
        expect(geo.tile({ lat: 89, lng: 179.99 }, 1)).toEqual({ x: 1, y: 0, z: 1 });

    });
    it("locating a device answers the first position, falls back to following and times out", async () => {

        const cairoAt = { ...cairo, accuracy: 5, at: 1 };
        const known = { position: async () => cairoAt, follow: () => () => undefined };

        expect(await geo.locate(known)).toEqual(cairoAt);

        let stopped = 0;
        const slow = { position: async () => undefined, follow: ( _: unknown, listener: ( position: typeof cairoAt ) => void ) => { setTimeout(() => listener({ ...riyadh, accuracy: 9, at: 2 }), 1); return () => { stopped += 1; }; } };

        expect((await geo.locate(slow)).lat).toBe(riyadh.lat);
        expect(stopped).toBe(1);

        const never = { position: async () => { throw new Error("no"); }, follow: () => () => undefined };

        await expect(geo.locate(never, { within: 5 })).rejects.toMatchObject({ code: "timeout", reason: "geo.locate" });

        const samples: { lat: number; lng: number; accuracy: number; at: number }[] = [];
        let push: (( position: { lat: number; lng: number; accuracy: number; at: number } ) => void) | undefined;
        const unit = { follow: ( _: unknown, listener: typeof push ) => { push = listener; return () => undefined; } };
        const stop = geo.follow(unit, { minMeters: 50, minMs: 10 }, ( position ) => { samples.push(position); });

        push?.({ ...cairo, accuracy: 1, at: 0 });
        push?.({ ...cairo, accuracy: 1, at: 5 });
        push?.({ ...geo.destination(cairo, 10, 0), accuracy: 1, at: 20 });
        push?.({ ...geo.destination(cairo, 100, 0), accuracy: 1, at: 30 });
        expect(samples.map(( sample ) => sample.at)).toEqual([0, 30]);
        stop();
        expect(geo.near(cairo, [riyadh, geo.destination(cairo, 500, 90), geo.destination(cairo, 100, 0)], 1000).map(( found ) => Math.round(found.distance))).toEqual([100, 500]);

    });
    it("the earth radius is the IUGG mean radius in metres", () => {

        expect(geo.earthRadius).toBe(6_371_008.8);

    });
    it("centroids, clusters and snapping are geometric, and the geocoder and router are ports", async () => {

        const middle = geo.centroid([cairo, riyadh]);

        expect(middle && Math.round(geo.distance(middle, geo.midpoint(cairo, riyadh)))).toBe(0);
        expect(geo.centroid([])).toBeUndefined();

        const spots = [cairo, geo.destination(cairo, 50, 90), geo.destination(cairo, 60, 180), riyadh];
        const clusters = geo.cluster(spots, 500);

        expect(clusters.map(( found ) => found.count)).toEqual([3, 1]);
        expect(clusters[0]?.items).toHaveLength(3);

        const path = [cairo, geo.destination(cairo, 1000, 90), geo.destination(cairo, 2000, 90)];
        const beside = geo.destination(geo.destination(cairo, 1500, 90), 100, 0);
        const snapped = geo.snap(beside, path);

        expect(snapped?.index).toBe(1);
        expect(snapped && Math.round(snapped.distance)).toBe(100);
        expect(snapped && Math.round(snapped.fraction * 100)).toBe(50);
        expect(geo.snap(cairo, [])).toBeUndefined();
        expect(geo.snap(cairo, [riyadh])?.index).toBe(0);
        await expect(geo.geocode("Cairo")).rejects.toMatchObject({ code: "unavailable" });

        const stop = geo.geocoder.use({ search: async ( query ) => [{ point: cairo, label: query }], reverse: async () => ({ point: cairo, label: "Cairo", country: "EG" }) });

        expect((await geo.geocode("Tahrir"))[0]?.label).toBe("Tahrir");
        expect((await geo.reverse(cairo))?.country).toBe("EG");
        stop();

        const unroute = geo.router.use({ route: async ( from, to ) => ({ points: [from, to], meters: geo.distance(from, to), seconds: 60 }) });

        expect((await geo.route(cairo, riyadh))?.points).toHaveLength(2);
        unroute();

    });
    it("doors: distances, headings, precisions, zooms, modes, limits and points are checked before any arithmetic", () => {

        const told = ( run: () => unknown ): string => {

            try {

                run();

                return "ok";

            } catch ( failure ) {

                return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);

            }

        };

        expect([told(() => geo.destination(cairo, Number.NaN, 0)), told(() => geo.destination(cairo, Number.POSITIVE_INFINITY, 0)), told(() => geo.destination(cairo, 1, Number.NaN)), told(() => geo.compass(Number.NaN)), told(() => geo.bounds([cairo], -1)), told(() => geo.bounds([cairo], Number.NaN)), told(() => geo.around(cairo, -1)), told(() => geo.simplify([cairo, riyadh, cairo], -5)), told(() => geo.cluster([cairo], Number.NaN)), told(() => geo.near(cairo, [], -1)), told(() => geo.fit([cairo], { width: 1, height: 1 }, 18, -1))]).toEqual(["RangeError: not a distance", "RangeError: not a distance", "RangeError: not a heading", "RangeError: not a heading", "RangeError: not a distance", "RangeError: not a distance", "RangeError: not a distance", "RangeError: not a distance", "RangeError: not a distance", "RangeError: not a distance", "RangeError: not a distance"]);
        expect([told(() => geo.geohash(cairo, Number.NaN)), told(() => geo.geohash({ lat: Number.NaN, lng: 0 })), told(() => geo.geohash({ lat: 91, lng: 0 })), geo.geohash(cairo, 2.7).length, geo.geohash(cairo, 99).length, geo.geohash(cairo, -3).length, told(() => geo.encode([cairo], 9)), told(() => geo.encode([cairo], 0)), told(() => geo.encode([cairo], Number.NaN)), told(() => geo.encode([{ lat: Number.NaN, lng: 0 }])), told(() => geo.decode("x", 7)), told(() => geo.tile(cairo, Number.NaN)), geo.tile(cairo, 99).z, geo.tile(cairo, -1).z, told(() => geo.tile({ lat: 1, lng: 181 }, 1))]).toEqual(["RangeError: not a precision", "RangeError: not a point", "RangeError: not a point", 2, 12, 1, "RangeError: not a precision", "RangeError: not a precision", "RangeError: not a precision", "RangeError: not a point", "RangeError: not a precision", "RangeError: not a zoom", 22, 0, "RangeError: not a point"]);
        expect([told(() => geo.untile({ x: 0, y: 0, z: 23 })), told(() => geo.untile({ x: 2, y: 0, z: 1 })), told(() => geo.untile({ x: 0.5, y: 0, z: 1 })), told(() => geo.untile({ x: -1, y: 0, z: 1 })), told(() => geo.link({ lat: "1&evil=1" as unknown as number, lng: 5 })), told(() => geo.link({ lat: Number.NaN, lng: 5 })), told(() => geo.normalize({ lat: Number.NaN, lng: 0 })), told(() => geo.toJson({ lat: 1, lng: 181 }))]).toEqual(["RangeError: not a tile", "RangeError: not a tile", "RangeError: not a tile", "RangeError: not a tile", "RangeError: not a point", "RangeError: not a point", "RangeError: not a point", "RangeError: not a point"]);
        expect([geo.normalize({ lat: 95, lng: 190 }), geo.normalize({ lat: -95, lng: -190 }), geo.normalize({ lat: 1, lng: 180 }), geo.normalize({ lat: 1, lng: 540 })]).toEqual([{ lat: 90, lng: -170 }, { lat: -90, lng: 170 }, { lat: 1, lng: 180 }, { lat: 1, lng: -180 }]);
        expect([geo.bounds([{ lat: 0, lng: -5e-324 }, { lat: 0, lng: -1e-323 }]), geo.bounds([{ lat: 0, lng: 170 }, { lat: 0, lng: -170 }]), geo.bounds([{ lat: 0, lng: 90 }, { lat: 0, lng: -90 }])]).toEqual([{ south: 0, west: -1e-323, north: 0, east: -5e-324 }, { south: 0, west: 170, north: 0, east: -170 }, { south: 0, west: -90, north: 0, east: 90 }]);
        expect([geo.compass(0), geo.compass(22.4), geo.compass(22.5), geo.compass(359.9), geo.compass(-45), geo.compass(720 + 90), geo.compass(Number.POSITIVE_INFINITY === 1 ? 0 : 202.5)]).toEqual(["N", "N", "NE", "N", "NW", "E", "SW"]);
        expect([geo.parse("+30.5,-31.5"), geo.parse("geo:30.5,31.25,100;u=10?q=x"), geo.parse("GEO:1,2"), geo.parse("geo:1"), geo.parse("1,2,3"), geo.parse("91,0"), geo.parse("0,181"), geo.parse(`1,${"2".repeat(100)}`), geo.parse("1.5 2.5"), geo.parse("1e2,3"), geo.parse(5 as unknown as string)]).toEqual([{ lat: 30.5, lng: -31.5 }, { lat: 30.5, lng: 31.25 }, { lat: 1, lng: 2 }, undefined, undefined, undefined, undefined, undefined, { lat: 1.5, lng: 2.5 }, undefined, undefined]);
        expect([geo.fromJson([31.2, 30.0]), geo.fromJson([31.2, 30.0, 12]), geo.fromJson([1]), geo.fromJson({ latitude: "30.5", longitude: "31.5" }), geo.fromJson({ lat: 1, lon: 2 }), geo.fromJson({ lat: 1, long: 2 }), geo.fromJson({ type: "Point", coordinates: [2, 1] }), geo.fromJson({ type: "Point", coordinates: "x" }), geo.fromJson({ lat: "1e1", lng: 0 }), geo.fromJson({ lat: "0x10", lng: 0 }), geo.fromJson(null), geo.fromJson("1,2"), geo.toJson(cairo)]).toEqual([{ lat: 30, lng: 31.2 }, { lat: 30, lng: 31.2 }, undefined, { lat: 30.5, lng: 31.5 }, { lat: 1, lng: 2 }, { lat: 1, lng: 2 }, { lat: 1, lng: 2 }, undefined, undefined, undefined, undefined, undefined, [31.2357, 30.0444]]);
        expect([geo.link(cairo, "google", "Tahrir Square"), geo.link(cairo, "apple", "a b&c"), geo.directions(riyadh), geo.directions(riyadh, "apple", cairo), geo.directions(riyadh, "waze"), geo.directions(riyadh, "google", cairo)]).toEqual(["https://www.google.com/maps/search/?api=1&query=30.0444,31.2357", "https://maps.apple.com/?ll=30.0444,31.2357&q=a%20b%26c", "https://www.google.com/maps/dir/?api=1&destination=24.7136,46.6753", "https://maps.apple.com/?daddr=24.7136,46.6753&saddr=30.0444,31.2357&dirflg=d", "https://waze.com/ul?ll=24.7136,46.6753&navigate=yes", "https://www.google.com/maps/dir/?api=1&destination=24.7136,46.6753&origin=30.0444,31.2357"]);

    });
    it("the antimeridian and the poles: boxes wrap, centres and fits follow, interpolation routes over the pole, aggregates skip junk", () => {

        const wrapped = geo.bounds([{ lat: 0, lng: 170 }, { lat: 1, lng: -170 }, { lat: 2, lng: 179 }]);

        expect(wrapped).toEqual({ south: 0, west: 170, north: 2, east: -170 });
        expect(geo.center(wrapped as geo.Bounds)).toEqual({ lat: 1, lng: 180 });
        expect([geo.contains(wrapped as geo.Bounds, { lat: 1, lng: 179 }), geo.contains(wrapped as geo.Bounds, { lat: 1, lng: -175 }), geo.contains(wrapped as geo.Bounds, { lat: 1, lng: 0 }), geo.contains(wrapped as geo.Bounds, { lat: 3, lng: 179 })]).toEqual([true, true, false, false]);
        expect([geo.overlaps(wrapped as geo.Bounds, { south: 0, west: -179, north: 1, east: -178 }), geo.overlaps(wrapped as geo.Bounds, { south: 0, west: 0, north: 1, east: 10 }), geo.overlaps({ south: 0, west: 0, north: 1, east: 10 }, wrapped as geo.Bounds), geo.overlaps(wrapped as geo.Bounds, { south: 5, west: 175, north: 6, east: 176 }), geo.overlaps({ south: 0, west: 10, north: 1, east: 20 }, { south: 0, west: 20, north: 1, east: 30 }), geo.overlaps({ south: 0, west: 10, north: 1, east: 20 }, { south: 2, west: 10, north: 3, east: 20 })]).toEqual([true, false, false, false, true, false]);
        expect(geo.bounds([{ lat: 0, lng: 1e-9 }, { lat: 0, lng: -180 }])).toEqual({ south: 0, west: 1e-9, north: 0, east: -180 });
        expect(geo.bounds([{ lat: 0, lng: 180 }, { lat: 0, lng: -170 }])).toEqual({ south: 0, west: 180, north: 0, east: -170 });
        expect(geo.contains(geo.bounds([{ lat: 0, lng: 180 }, { lat: 0, lng: -180 }, { lat: 0, lng: 1e-9 }]) as geo.Bounds, { lat: 0, lng: -180 })).toBe(true);
        expect([geo.contains({ south: 0, west: 180, north: 0, east: 180 }, { lat: 0, lng: -180 }), geo.contains({ south: 0, west: -180, north: 0, east: -170 }, { lat: 0, lng: 180 }), geo.contains({ south: 0, west: 170, north: 0, east: -170 }, { lat: 0, lng: 180 }), geo.contains({ south: 0, west: 0, north: 0, east: 10 }, { lat: 0, lng: 180 })]).toEqual([true, true, true, false]);
        expect(geo.fit([{ lat: 0, lng: 170 }, { lat: 0, lng: -170 }], { width: 800, height: 600 })?.zoom).toBe(5);
        expect(geo.fit([{ lat: -60, lng: 0 }, { lat: 60, lng: 0 }], { width: 800, height: 600 })?.zoom).toBe(2);
        expect([geo.fit([cairo, cairo], { width: 800, height: 600 })?.zoom, geo.fit([cairo], { width: 800, height: 600 }, Number.NaN)?.zoom, geo.fit([cairo], { width: 800, height: 600 }, 3)?.zoom, geo.fit([cairo, riyadh], { width: 0, height: 0 })?.zoom, geo.fit([cairo, riyadh], { width: 800, height: 600 }, 4)?.zoom]).toEqual([16, 16, 3, 1, 4]);
        expect(geo.round(geo.fit([cairo, riyadh], { width: 800, height: 600 })?.center ?? cairo, 3)).toEqual({ lat: 27.411, lng: 38.956 });
        expect(geo.round(geo.interpolate({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }, 0.25), 4)).toEqual({ lat: 45, lng: 0 });
        expect(geo.round(geo.interpolate({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }, 0.5), 4).lat).toBe(90);
        expect([geo.interpolate(cairo, riyadh, Number.NaN), geo.interpolate(cairo, riyadh, -1), geo.interpolate(cairo, riyadh, 2)]).toEqual([cairo, cairo, riyadh]);
        expect(geo.round(geo.interpolate({ lat: 0, lng: 170 }, { lat: 0, lng: -170 }, 0.5), 4)).toEqual({ lat: 0, lng: 180 });
        expect(geo.round(geo.midpoint({ lat: 0, lng: 170 }, { lat: 0, lng: -170 }), 4).lng).toBe(180);
        expect([geo.bounds([{ lat: Number.NaN, lng: 1 }, cairo]), geo.round(geo.centroid([{ lat: Number.NaN, lng: 1 }, cairo]) ?? riyadh, 6), geo.cluster([{ lat: Number.NaN, lng: 1 }, cairo], 100).length, geo.nearest(cairo, [{ lat: Number.NaN, lng: 1 }, riyadh])?.item, geo.bounds([{ lat: Number.NaN, lng: 1 }])]).toEqual([{ south: cairo.lat, west: cairo.lng, north: cairo.lat, east: cairo.lng }, cairo, 1, riyadh, undefined]);
        expect(Math.abs(geo.round(geo.centroid([{ lat: 0, lng: 170 }, { lat: 0, lng: -170 }]) ?? cairo, 4).lng)).toBe(180);
        expect([geo.around({ lat: 89.9, lng: 0 }, 100_000), geo.around({ lat: 0, lng: 179.99 }, 10_000).east < 0, geo.around(cairo, 0)]).toEqual([{ south: expect.closeTo(89.0, 1), west: -180, north: 90, east: 180 }, true, { south: cairo.lat, west: cairo.lng, north: cairo.lat, east: cairo.lng }]);
        expect(geo.bounds([cairo], 100_000_000)).toEqual({ south: -90, west: -180, north: 90, east: 180 });
        expect(geo.round(geo.destination({ lat: 89.99, lng: 0 }, 5000, 0), 2).lat).toBeLessThanOrEqual(90);

    });
    it("codes: cells contain their point, neighbours ring a cell, polylines refuse what they cannot read, tiles round trip", () => {

        const cell = geo.cell("stq4yv") as geo.Bounds;

        expect(geo.contains(cell, cairo)).toBe(true);
        expect(geo.contains(cell, geo.ungeohash("stq4yv") as geo.Point)).toBe(true);
        expect([geo.cell(""), geo.cell("a!"), geo.cell("x".repeat(23)), geo.cell("STQ4YV")]).toEqual([undefined, undefined, undefined, cell]);
        expect(geo.neighbors("stq4yv")).toHaveLength(8);
        expect(new Set(geo.neighbors("stq4yv")).size).toBe(8);

        for ( const next of geo.neighbors("stq4yv") ) {

            const other = geo.cell(next) as geo.Bounds;

            expect([next, Math.abs(other.north - other.south - (cell.north - cell.south)) < 1e-9, geo.overlaps({ south: cell.south - 1e-9, west: cell.west - 1e-9, north: cell.north + 1e-9, east: cell.east + 1e-9 }, other)]).toEqual([next, true, true]);

        }

        expect([geo.neighbors(""), geo.neighbors("x".repeat(13)), geo.neighbors("s").length, new Set(geo.neighbors("s")).size, geo.neighbors("u").includes("s")]).toEqual([[], [], expect.any(Number), expect.any(Number), true]);
        expect(geo.neighbors("upb").length).toBeGreaterThanOrEqual(5);
        expect(geo.ungeohash("x".repeat(23))).toBeUndefined();
        expect([geo.decode("_p~iF~ps|U_ulLnnqC_mqNvxq`"), geo.decode("_p~iF~ps|U_ulLnnqC_mqNvxq`@ "), geo.decode("_p~iF\u0001"), geo.decode("_p~iF"), geo.decode(" "), geo.decode("x".repeat(2_097_153)), geo.decode("~~~~~~~~~~~~~~~~")]).toEqual([[], [], [], [], [], [], []]);
        expect(geo.decode(geo.encode([{ lat: 90, lng: 180 }, { lat: -90, lng: -180 }], 6), 6)).toEqual([{ lat: 90, lng: 180 }, { lat: -90, lng: -180 }]);
        expect(geo.decode(geo.encode([{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }]))).toEqual([{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }]);
        expect(geo.encode([])).toBe("");
        expect(geo.decode(geo.encode([cairo], 1), 1)).toEqual([{ lat: 30, lng: 31.2 }]);
        expect(geo.untile(geo.tile(cairo, 10))).toEqual(expect.objectContaining({ south: expect.any(Number) }));
        expect(geo.contains(geo.untile(geo.tile(cairo, 10)), cairo)).toBe(true);
        expect([geo.untile({ x: 0, y: 0, z: 0 }), geo.tile({ lat: 85.0511, lng: -180 }, 0), geo.tile({ lat: -89, lng: 180 }, 3)]).toEqual([{ south: expect.closeTo(-85.0511, 3), west: -180, north: expect.closeTo(85.0511, 3), east: 180 }, { x: 0, y: 0, z: 0 }, { x: 7, y: 7, z: 3 }]);

    });
    it("paths: length, along, snap and progress agree, simplify keeps the ends and a subset, clusters cover every point", () => {

        const path = [cairo, geo.destination(cairo, 1000, 90), geo.destination(cairo, 2000, 90), geo.destination(cairo, 3000, 90)];
        const total = geo.length(path);

        expect(Math.round(total)).toBe(3000);
        expect(geo.round(geo.along(path, 1500) ?? cairo, 6)).toEqual(geo.round(geo.destination(cairo, 1500, 90), 6));
        expect([geo.along(path, Number.NaN), geo.along(path, -5), geo.along([cairo], 10), geo.along([cairo, cairo], 10)]).toEqual([cairo, cairo, cairo, cairo]);

        const beside = geo.destination(geo.destination(cairo, 1500, 90), 100, 0);
        const moved = geo.progress(beside, path) as geo.Progress;

        expect([moved.index, Math.round(moved.meters), Math.round(moved.total), Math.round(moved.ratio * 100), Math.round(moved.distance)]).toEqual([1, 1500, 3000, 50, 100]);
        expect([geo.progress(cairo, []), geo.progress(cairo, [riyadh])?.ratio, geo.progress(geo.destination(cairo, 9000, 90), path)?.ratio]).toEqual([undefined, 0, 1]);
        expect(geo.snap({ lat: 0, lng: 179.5 }, [{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }])?.fraction).toBeCloseTo(0.25, 2);

        const line = Array.from({ length: 200 }, ( _, at ) => geo.destination(cairo, at * 50, 90 + Math.sin(at) * 0.05));
        const simpler = geo.simplify(line, 30);

        expect([simpler[0], simpler.at(-1), simpler.length < line.length, simpler.every(( point ) => line.includes(point))]).toEqual([line[0], line.at(-1), true, true]);
        expect(geo.simplify(line, 0)).toEqual(line);
        expect(geo.simplify([cairo, riyadh], 10)).toEqual([cairo, riyadh]);

        const spots = Array.from({ length: 300 }, ( _, at ) => geo.destination(cairo, (at % 10) * 20, (at * 37) % 360)).concat(Array.from({ length: 50 }, ( _, at ) => geo.destination(riyadh, at * 3, at)));
        const grouped = geo.cluster(spots, 500);

        expect([grouped.length, grouped.reduce(( sum, group ) => sum + group.count, 0), grouped[0]?.count, grouped[1]?.count]).toEqual([2, 350, 300, 50]);

        for ( const group of grouped ) for ( const item of group.items ) expect(geo.distance(group.center, item) <= 500 * 2).toBe(true);

        const wide = geo.cluster(spots, 5_000_000);

        expect([wide.length, wide[0]?.count]).toEqual([1, 350]);
        expect(geo.cluster([], 10)).toEqual([]);
        expect(geo.cluster([{ lat: 0, lng: 179.99 }, { lat: 0, lng: -179.99 }], 5000).length).toBe(1);
        expect(geo.round(geo.cluster([{ lat: 0, lng: 179.99 }, { lat: 0, lng: -179.99 }], 5000)[0]?.center ?? cairo, 3).lng).toBe(180);
        expect([geo.near(cairo, spots, 50).length > 0, geo.near(cairo, spots, 50, 3).length, geo.near(cairo, spots, 50, Number.NaN).length > 3, geo.near(cairo, spots, 50, -1).length, geo.near(cairo, spots, 50, 2.9).length]).toEqual([true, 3, true, 0, 2]);
        expect(geo.near(cairo, spots, 50).every(( one, at, all ) => at === 0 || (all[at - 1]?.distance ?? 0) <= one.distance)).toBe(true);
        expect(geo.inside({ lat: 5, lng: 5 }, [cairo, riyadh])).toBe(false);
        expect(Math.round(geo.area([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }]) / 1e6)).toBe(12364);
        expect([geo.area([cairo, riyadh]), geo.area([])]).toEqual([0, 0]);

    });
    it("providers: refusals, junk rows, limits, signals and modes are handled before the surfaces see them", async () => {

        const calls: unknown[] = [];
        const stop = geo.geocoder.use({ search: async ( query, options ) => {

            calls.push([query, options?.limit]);

            if ( query === "null" ) return null as unknown as geo.Place[];
            if ( query === "throw" ) throw new Error("down");
            if ( query === "fault" ) throw error.fault("too_many_requests", "quota");

            return [{ point: cairo, label: "ok" }, { point: { lat: 99, lng: 0 }, label: "far" }, { label: "no point" }, "junk", { point: riyadh, label: "second" }] as unknown as geo.Place[];

        }, reverse: async ( point ) => (point.lat === 0 ? ("junk" as unknown as geo.Place) : { point, label: "here" }) });

        expect((await geo.geocode("Cairo")).map(( place ) => place.label)).toEqual(["ok", "second"]);
        expect([(await geo.geocode("Cairo", { limit: 1 })).length, (await geo.geocode("Cairo", { limit: 999 })).length, (await geo.geocode("Cairo", { limit: -5 })).length, await geo.geocode(""), await geo.geocode("   "), await geo.geocode("x".repeat(257)), await geo.geocode(5 as unknown as string)]).toEqual([1, 2, 1, [], [], [], []]);
        expect(calls.map(( call ) => (call as unknown[])[1])).toEqual([undefined, 1, 50, 1]);
        expect([await geo.geocode("null").then(() => "list", ( cause: unknown ) => (error.is(cause) ? cause.reason : "?")), await geo.geocode("throw").then(() => "list", ( cause: unknown ) => (error.is(cause) ? cause.reason : "?")), await geo.geocode("fault").then(() => "list", ( cause: unknown ) => (error.is(cause) ? cause.code : "?")), await geo.geocode("x", { signal: AbortSignal.abort() }).then(() => "list", ( cause: unknown ) => (error.is(cause) ? cause.reason : "?")), await geo.geocode("x", { near: { lat: 99, lng: 0 } }).then(() => "list", ( cause: unknown ) => (cause instanceof RangeError ? cause.message : "?"))]).toEqual(["geo.refused", "geo.refused", "too_many_requests", "geo.aborted", "not a point"]);
        expect([await geo.reverse({ lat: 0, lng: 0 }), (await geo.reverse(cairo))?.label, await geo.reverse({ lat: 91, lng: 0 }).then(() => "place", ( cause: unknown ) => (cause instanceof RangeError ? cause.message : "?"))]).toEqual([undefined, "here", "not a point"]);
        stop();

        const unroute = geo.router.use({ route: async ( from, to, mode ) => (mode === "walk" ? undefined : mode === "bike" ? ({ points: [from, { lat: 99, lng: 0 }], meters: 1, seconds: 1 } as geo.Route) : { points: [from, to], meters: Number.NaN, seconds: 1 }) });

        expect([await geo.route(cairo, riyadh, "walk"), await geo.route(cairo, riyadh, "bike").then(() => "route", ( cause: unknown ) => (error.is(cause) ? cause.reason : "?")), await geo.route(cairo, riyadh).then(() => "route", ( cause: unknown ) => (error.is(cause) ? cause.reason : "?")), await geo.route(cairo, riyadh, "fly" as geo.Mode).then(() => "route", ( cause: unknown ) => (cause instanceof RangeError ? cause.message : "?")), await geo.route(cairo, { lat: 91, lng: 0 }).then(() => "route", ( cause: unknown ) => (cause instanceof RangeError ? cause.message : "?"))]).toEqual([undefined, "geo.refused", "geo.refused", "not a mode", "not a point"]);
        unroute();

    });
    it("locating waits for an accurate fix, releases a device that answers at once, aborts and reports a throwing device", async () => {

        const rough = { ...cairo, accuracy: 500, at: 1 };
        const sharp = { ...cairo, accuracy: 5, at: 2 };
        let stops = 0;
        const unit = { position: async () => rough, follow: ( _: unknown, listener: ( position: typeof rough ) => void ) => {

            listener(rough);
            setTimeout(() => listener(sharp), 2);

            return () => { stops += 1; };

        } };

        expect([await geo.locate(unit, { radius: 10 }), stops]).toEqual([sharp, 1]);
        expect([await geo.locate(unit), stops]).toEqual([rough, 1]);

        const instant = { position: async () => undefined, follow: ( _: unknown, listener: ( position: typeof rough ) => void ) => { listener(sharp); return () => { stops += 1; }; } };

        expect([await geo.locate(instant), stops]).toEqual([sharp, 2]);

        const junk = { position: async () => ({ lat: Number.NaN, lng: 0, accuracy: 1, at: 1 }), follow: () => () => undefined };

        await expect(geo.locate(junk, { within: 5 })).rejects.toMatchObject({ reason: "geo.locate" });

        const controller = new AbortController();
        const pending = geo.locate({ position: () => new Promise(() => undefined), follow: () => () => undefined }, { signal: controller.signal });

        controller.abort();
        await expect(pending).rejects.toMatchObject({ reason: "geo.aborted" });
        await expect(geo.locate({ position: async () => undefined, follow: () => { throw new Error("no gps"); } })).rejects.toMatchObject({ reason: "geo.refused" });
        await expect(geo.locate({ position: async () => undefined, follow: () => { throw error.fault("forbidden", "denied"); } })).rejects.toMatchObject({ reason: "denied" });
        await expect(geo.locate({ position: async () => undefined, follow: () => () => undefined }, { signal: AbortSignal.abort() })).rejects.toMatchObject({ reason: "geo.aborted" });

        const samples: number[] = [];
        let push: (( position: typeof rough ) => void) | undefined;
        let released = 0;
        const stop = geo.follow({ follow: ( _: unknown, listener: typeof push ) => { push = listener; return () => { released += 1; }; } }, { radius: 50, signal: controller.signal }, ( position ) => { samples.push(position.at); });

        expect(released).toBe(1);
        push?.(sharp);
        expect(samples).toEqual([]);

        const again = new AbortController();
        const end = geo.follow({ follow: ( _: unknown, listener: typeof push ) => { push = listener; return () => { released += 1; }; } }, { radius: 50, signal: again.signal }, ( position ) => { samples.push(position.at); });

        push?.(rough);
        push?.(sharp);
        push?.({ lat: Number.NaN, lng: 0, accuracy: 1, at: 3 });
        push?.({ ...cairo, accuracy: 1, at: 1 });
        expect(samples).toEqual([2, 1]);
        again.abort();
        end();
        end();
        push?.(sharp);
        expect([released, samples]).toEqual([2, [2, 1]]);
        stop();

    });
    it("edges: near-antipodal distances stay finite, long or odd text is refused, polar rings dedupe", () => {

        const far = geo.distance({ lat: -89.26, lng: -180 }, { lat: 89.26, lng: 0 });

        expect([Number.isFinite(far), Math.abs(far - 20_015_114.44) < 1]).toEqual([true, true]);
        expect([geo.parse("geo:1,2,3,4"), geo.parse("geo:1,2,3"), geo.parse(`1,${"0".repeat(300)}`), geo.parse("1,0"), geo.fromJson([1, 2, 3, 4]), geo.fromJson([1, 2, 3])]).toEqual([undefined, { lat: 1, lng: 2 }, undefined, { lat: 1, lng: 0 }, undefined, { lat: 2, lng: 1 }]);
        expect([geo.decode("_ouce@?"), geo.decode("_p~iF"), geo.decode("_p~iF~ps|U"), geo.decode("_p~iF~ps|U_p~iF"), geo.decode("?".repeat(2_097_154))]).toEqual([[], [], [{ lat: 38.5, lng: -120.2 }], [], []]);

        const ring = geo.neighbors(geo.geohash({ lat: 89.9, lng: 0 }, 2));

        expect([ring.length, new Set(ring).size, ring.includes(geo.geohash({ lat: 89.9, lng: 0 }, 2))]).toEqual([5, 5, false]);
        expect([geo.simplify([], 0), geo.simplify([cairo], 0), geo.simplify([cairo, riyadh], 0)]).toEqual([[], [cairo], [cairo, riyadh]]);

        const wrapped = geo.snap({ lat: 0, lng: 179.9 }, [{ lat: 0, lng: -179.9 }, { lat: 1, lng: -179.9 }]) as geo.Snapped;

        expect([wrapped.index, wrapped.fraction, Math.round(wrapped.distance)]).toEqual([0, 0, 22239]);

        const slanted = geo.snap({ lat: 0.5, lng: 179.9 }, [{ lat: 0, lng: -179.9 }, { lat: 1, lng: -179.5 }]) as geo.Snapped;

        expect([slanted.index, Math.round(slanted.fraction * 100), Math.round(slanted.distance / 1000)]).toEqual([0, 36, 41]);

        const cities = [cairo, riyadh, { lat: 21.4858, lng: 39.1925 }, { lat: 25.2048, lng: 55.2708 }, { lat: 31.2001, lng: 29.9187 }, { lat: 33.8938, lng: 35.5018 }, { lat: 41.0082, lng: 28.9784 }, { lat: -33.8688, lng: 151.2093 }, { lat: 35.6762, lng: 139.6503 }, { lat: 51.5074, lng: -0.1278 }];

        expect(geo.cluster(cities, 500_000).map(( group ) => group.count)).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1]);
        expect(geo.cluster(cities, 1_500_000).map(( group ) => [group.count, geo.round(group.center, 2)])).toEqual([[5, { lat: 31.59, lng: 33.15 }], [2, { lat: 25.02, lng: 50.96 }], [1, { lat: -33.87, lng: 151.21 }], [1, { lat: 35.68, lng: 139.65 }], [1, { lat: 51.51, lng: -0.13 }]]);

        const seen: number[] = [];
        let push: (( position: { lat: number; lng: number; accuracy: number; at: number } ) => void) | undefined;
        const stop = geo.follow({ follow: ( _: unknown, listener: typeof push ) => { push = listener; return () => undefined; } }, { minMs: 10 }, ( position ) => { seen.push(position.at); });

        push?.({ ...cairo, accuracy: 1, at: 0 });
        push?.({ ...geo.destination(cairo, 1000, 0), accuracy: 1, at: 5 });
        push?.({ ...geo.destination(cairo, 2000, 0), accuracy: 1, at: 10 });
        stop();
        expect(seen).toEqual([0, 10]);

    });
});
