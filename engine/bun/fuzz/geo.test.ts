import { describe, expect, test as it } from "bun:test";
import * as geo from "engine/geo";
import * as fc from "fast-check";

const runs = 4000;
const rad = Math.PI / 180;
const real = ( min: number, max: number, scale = 1e6 ): fc.Arbitrary<number> => fc.integer({ min: Math.round(min * scale), max: Math.round(max * scale) }).map(( value ) => value / scale);
const point = fc.record({ lat: real(-85, 85), lng: real(-179.9, 179.9) });
const anywhere = fc.record({ lat: real(-90, 90), lng: real(-180, 180) });
const nearby = ( center: geo.Point, km: number ): fc.Arbitrary<geo.Point> => fc.tuple(real(0, km * 1000), real(0, 360)).map(([meters, heading]) => geo.destination(center, meters, heading));
const box: fc.Arbitrary<geo.Bounds> = fc.tuple(anywhere, anywhere).map(([a, b]) => ({ south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat), west: a.lng, east: b.lng }));

function cosines ( a: geo.Point, b: geo.Point ): number {

    const inner = Math.sin(a.lat * rad) * Math.sin(b.lat * rad) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);

    return geo.earthRadius * Math.acos(Math.max(-1, Math.min(1, inner)));

}
function within ( found: geo.Bounds, at: geo.Point ): boolean {

    if ( at.lat < found.south || at.lat > found.north ) return false;

    const inside = ( lng: number ): boolean => found.west <= found.east ? lng >= found.west && lng <= found.east : lng >= found.west || lng <= found.east;

    return inside(at.lng) || (Math.abs(at.lng) === 180 && inside(-at.lng));

}

describe("fuzz geo", () => {

    it("distance agrees with the law of cosines, destination and bearing invert it, interpolation stays on the arc", () => {

        fc.assert(fc.property(point, point, real(0, 1), ( a, b, t ) => {

            const gap = geo.distance(a, b);

            expect(Math.abs(gap - cosines(a, b)) <= Math.max(1, gap * 1e-6)).toBe(true);
            expect(geo.distance(b, a)).toBeCloseTo(gap, 6);

            const between = geo.interpolate(a, b, t);

            if ( gap > 1 && gap < 19_000_000 ) {

                expect(Math.abs(geo.distance(a, between) + geo.distance(between, b) - gap) <= Math.max(1, gap * 1e-6)).toBe(true);
                expect(Math.abs(geo.distance(a, between) - t * gap) <= Math.max(1, gap * 1e-6)).toBe(true);

            }

            expect(geo.isPoint(between)).toBe(true);
            expect(geo.isPoint(geo.midpoint(a, b))).toBe(true);

        }), { numRuns: runs });
        fc.assert(fc.property(point, real(1, 5_000_000), real(0, 359.9), ( from, meters, heading ) => {

            const to = geo.destination(from, meters, heading);

            expect(geo.isPoint(to)).toBe(true);
            expect(Math.abs(geo.distance(from, to) - meters) <= Math.max(1, meters * 1e-6)).toBe(true);

            if ( meters > 1000 && Math.abs(from.lat) < 80 ) {

                const back = geo.bearing(from, to);

                expect(Math.min(Math.abs(back - heading), 360 - Math.abs(back - heading)) < 0.01).toBe(true);

            }

            expect(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]).toContain(geo.compass(heading));

        }), { numRuns: runs });

    });
    it("bounds hold every point and nothing tighter, centres fall inside, around holds a disc, contains and overlaps agree with a scan", () => {

        fc.assert(fc.property(fc.array(anywhere, { minLength: 1, maxLength: 12 }), real(0, 2_000_000), ( points, pad ) => {

            const tight = geo.bounds(points) as geo.Bounds;
            const padded = geo.bounds(points, pad) as geo.Bounds;

            for ( const one of points ) expect([one, within(tight, one), within(padded, one)]).toEqual([one, true, true]);

            const south = Math.min(...points.map(( one ) => one.lat));
            const north = Math.max(...points.map(( one ) => one.lat));

            expect([tight.south, tight.north]).toEqual([south, north]);
            expect(points.some(( one ) => one.lng === tight.west) && points.some(( one ) => one.lng === tight.east)).toBe(true);
            expect(within(tight, geo.center(tight))).toBe(true);
            expect(geo.overlaps(tight, padded) && geo.overlaps(padded, tight)).toBe(true);

            const middle = geo.centroid(points) as geo.Point;

            expect(geo.isPoint(middle)).toBe(true);

        }), { numRuns: runs });
        fc.assert(fc.property(point, real(1, 3_000_000), real(0, 360), ( center, radius, heading ) => {

            const disc = geo.around(center, radius);
            const edge = geo.destination(center, radius * 0.999, heading);
            const above = geo.destination(center, radius * 2 + 1000, 0);

            expect([within(disc, center), within(disc, edge)]).toEqual([true, true]);

            if ( center.lat + ((radius * 2 + 1000) / geo.earthRadius) * (180 / Math.PI) < 90 ) expect(within(disc, above)).toBe(false);

        }), { numRuns: runs });
        fc.assert(fc.property(box, box, fc.array(anywhere, { maxLength: 6 }), ( a, b, probes ) => {

            for ( const probe of probes ) expect([probe, geo.contains(a, probe)]).toEqual([probe, within(a, probe)]);

            const shared = probes.some(( probe ) => within(a, probe) && within(b, probe));

            if ( shared ) expect(geo.overlaps(a, b) && geo.overlaps(b, a)).toBe(true);

            expect(geo.overlaps(a, b)).toBe(geo.overlaps(b, a));
            expect(geo.overlaps(a, a)).toBe(true);

        }), { numRuns: runs });

    });
    it("geohash cells hold their point and ring their neighbours, polylines and tiles round trip at every precision and zoom", () => {

        fc.assert(fc.property(anywhere, fc.integer({ min: 1, max: 12 }), ( at, precision ) => {

            const hash = geo.geohash(at, precision);
            const cell = geo.cell(hash) as geo.Bounds;

            expect(hash.length).toBe(precision);
            expect(within(cell, at)).toBe(true);
            expect(within(cell, geo.ungeohash(hash) as geo.Point)).toBe(true);
            expect(geo.geohash(geo.ungeohash(hash) as geo.Point, precision)).toBe(hash);
            expect(hash.startsWith(geo.geohash(at, Math.max(1, precision - 1)))).toBe(true);

            const ring = geo.neighbors(hash);

            expect(new Set(ring).size).toBe(ring.length);

            for ( const next of ring ) {

                const other = geo.cell(next) as geo.Bounds;

                expect([next, other !== undefined, next !== hash, Math.abs(other.north - other.south - (cell.north - cell.south)) < 1e-9]).toEqual([next, true, true, true]);

            }

        }), { numRuns: runs });
        fc.assert(fc.property(fc.array(anywhere, { maxLength: 8 }), fc.integer({ min: 1, max: 6 }), ( path, precision ) => {

            const encoded = geo.encode(path, precision);
            const decoded = geo.decode(encoded, precision);
            const factor = 10 ** precision;

            expect(decoded.length).toBe(path.length);

            for ( let at = 0; at < path.length; at += 1 ) {

                const given = path[at] as geo.Point;
                const back = decoded[at] as geo.Point;

                expect(Math.abs(back.lat - Math.round(given.lat * factor) / factor) < 1e-9 && Math.abs(back.lng - Math.round(given.lng * factor) / factor) < 1e-9).toBe(true);

            }

            for ( let cut = 1; cut < encoded.length; cut += Math.max(1, Math.floor(encoded.length / 5)) ) {

                const partial = geo.decode(encoded.slice(0, cut), precision);

                expect(partial.length <= decoded.length).toBe(true);

            }

        }), { numRuns: runs });
        fc.assert(fc.property(anywhere, fc.integer({ min: 0, max: 22 }), ( at, zoom ) => {

            const found = geo.tile(at, zoom);
            const area = geo.untile(found);
            const bent = Math.max(-85.05112878, Math.min(85.05112878, at.lat));

            expect([found.z, found.x >= 0 && found.x < 2 ** zoom, found.y >= 0 && found.y < 2 ** zoom]).toEqual([zoom, true, true]);
            expect(area.south - 1e-6 <= bent && bent <= area.north + 1e-6 && area.west - 1e-6 <= at.lng && at.lng <= area.east + 1e-6).toBe(true);

            if ( zoom > 0 ) expect(geo.tile(geo.center(area), zoom)).toEqual(found);

        }), { numRuns: runs });

    });
    it("snap lands on the path no farther than any vertex, along walks its distance, simplify keeps a subset with the ends, clusters cover every point", () => {

        fc.assert(fc.property(nearby({ lat: 30, lng: 31 }, 50).chain(( start ) => fc.tuple(fc.constant(start), fc.array(nearby(start, 20), { minLength: 1, maxLength: 8 }), nearby(start, 30), real(0, 100_000), real(0, 2000))), ( [start, rest, probe, walk, tolerance] ) => {

            const path = [start, ...rest].filter(( one, at, all ) => all.slice(0, at).every(( other ) => geo.distance(one, other) > 1));

            const snapped = geo.snap(probe, path) as geo.Snapped;
            const total = geo.length(path);
            const slack = 1 + (total * total) / (8 * geo.earthRadius);

            expect(snapped.index >= 0 && snapped.index < Math.max(1, path.length - 1)).toBe(true);
            expect(snapped.fraction >= 0 && snapped.fraction <= 1).toBe(true);

            for ( const vertex of path ) expect(snapped.distance <= geo.distance(probe, vertex) + slack).toBe(true);

            const moved = geo.progress(probe, path) as geo.Progress;

            expect([moved.meters >= 0 && moved.meters <= total + 1, Math.abs(moved.total - total) < 1e-6, moved.ratio >= 0 && moved.ratio <= 1]).toEqual([true, true, true]);

            const landed = geo.along(path, walk) as geo.Point;

            expect(geo.isPoint(landed)).toBe(true);

            if ( walk >= total ) expect(landed).toEqual(path[path.length - 1] as geo.Point);
            else {

                const back = geo.progress(landed, path) as geo.Progress;

                expect(back.distance <= slack).toBe(true);

                if ( Math.abs(back.meters - walk) > Math.max(2, walk * 1e-3) + slack ) expect(geo.distance(landed, geo.along(path, back.meters) as geo.Point) <= slack).toBe(true);

            }

            const simpler = geo.simplify(path, tolerance);

            expect([simpler[0], simpler[simpler.length - 1], simpler.every(( one ) => path.includes(one)), simpler.length <= path.length]).toEqual([path[0], path[path.length - 1], true, true]);

            let cursor = 0;

            for ( const kept of simpler ) {

                const found = path.indexOf(kept, cursor);

                expect(found >= cursor).toBe(true);
                cursor = found + 1;

            }

        }), { numRuns: 1500 });
        fc.assert(fc.property(fc.array(nearby({ lat: 30, lng: 31 }, 30), { maxLength: 40 }), real(1, 20_000), real(0, 40_000), ( points, radius, reach ) => {

            const grouped = geo.cluster(points, radius);

            expect(grouped.reduce(( sum, group ) => sum + group.count, 0)).toBe(points.length);
            expect(new Set(grouped.flatMap(( group ) => group.items)).size).toBe(points.length);

            for ( const group of grouped ) {

                expect(geo.isPoint(group.center)).toBe(true);
                expect(group.count).toBe(group.items.length);

                for ( const item of group.items ) expect(geo.distance(group.center, item) <= radius * 2 + 1).toBe(true);

            }

            for ( let at = 1; at < grouped.length; at += 1 ) expect((grouped[at - 1]?.count ?? 0) >= (grouped[at]?.count ?? 0)).toBe(true);

            const from = { lat: 30, lng: 31 };
            const found = geo.near(from, points, reach);
            const brute = points.filter(( one ) => geo.distance(from, one) <= reach).length;

            expect(found.length).toBe(brute);

            for ( let at = 1; at < found.length; at += 1 ) expect((found[at - 1]?.distance ?? 0) <= (found[at]?.distance ?? 0)).toBe(true);

            const closest = geo.nearest(from, points);

            if ( points.length > 0 ) expect(closest?.distance).toBeCloseTo(Math.min(...points.map(( one ) => geo.distance(from, one))), 6);
            else expect(closest).toBeUndefined();

        }), { numRuns: 1500 });

    });
    it("parse, format, json and links round trip every point and refuse what is not one", () => {

        fc.assert(fc.property(anywhere, fc.string({ maxLength: 30 }), ( at, junk ) => {

            const rounded = geo.round(at, 6);

            expect(geo.parse(geo.format(rounded, 6))).toEqual(rounded);
            expect(geo.fromJson(geo.toJson(at))).toEqual(at);
            expect(geo.fromJson({ lat: at.lat, lng: at.lng })).toEqual(at);
            expect(geo.parse(junk) === undefined || geo.isPoint(geo.parse(junk))).toBe(true);
            expect(geo.fromJson(junk)).toBeUndefined();
            expect(geo.link(at).startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
            expect(geo.link(at, "apple", junk).includes("\n") || geo.link(at, "apple", junk).includes(" ")).toBe(false);
            expect(() => geo.link({ lat: at.lat, lng: junk as unknown as number })).toThrow(new RangeError("not a point"));

        }), { numRuns: runs });

    });

});
