import { describe, expect, test as it } from "bun:test";
import * as geo from "engine/geo";
import { mapOf, stretched, type Track } from "../src/stores/locate.ts";

describe("locate", () => {

    it("a track grows by each new position, measures what was travelled, and a map is drawn only with a key and a position", () => {

        const at = ( lat: number, lng: number ) => ({ lat, lng, accuracy: 5, at: 0 });
        const empty: Track = { points: [], meters: 0 };
        const one = stretched(empty, at(30.0444, 31.2357));
        const same = stretched(one, at(30.0444, 31.2357));
        const two = stretched(one, at(30.0465, 31.2379));
        const long = Array.from({ length: 200 }, ( _, step ) => at(30 + step / 1000, 31)).reduce(stretched, empty);
        const drawn = new URL(mapOf("k-1", two.points[1], two, 16) ?? "http://none");

        expect([one.points.length, one.meters, same === one, two.points.length, Math.round(two.meters), Math.round(geo.distance(one.points[0] as geo.Point, two.points[1] as geo.Point))]).toEqual([1, 0, true, 2, 315, 315]);
        expect([long.points.length, Math.round(long.meters / 1000)]).toEqual([80, 22]);
        expect([drawn.origin + drawn.pathname, drawn.searchParams.get("key"), drawn.searchParams.get("markers"), drawn.searchParams.get("zoom"), drawn.searchParams.get("path")?.startsWith("weight:4|enc:")]).toEqual(["https://maps.googleapis.com/maps/api/staticmap", "k-1", "30.0465,31.2379", "16", true]);
        expect([mapOf("", two.points[1], two, 16), mapOf("k-1", undefined, two, 16), new URL(mapOf("k-1", one.points[0], one, 12) ?? "http://none").searchParams.has("path")]).toEqual([undefined, undefined, false]);

    });

});
