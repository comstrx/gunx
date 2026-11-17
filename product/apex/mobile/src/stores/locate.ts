import type * as device from "engine/device";
import * as geo from "engine/geo";
import * as net from "engine/net";

export type Track = { points: geo.Point[]; meters: number };

const origin = "https://maps.googleapis.com/maps/api/staticmap";
const longest = 80;

export function stretched ( track: Track, position: device.Position ): Track {

    const last = track.points.at(-1);
    const point = { lat: position.lat, lng: position.lng };

    if ( last !== undefined && geo.same(last, point) ) return track;

    return { points: [...track.points, point].slice(-longest), meters: track.meters + (last === undefined ? 0 : geo.distance(last, point)) };

}
export function mapOf ( key: string, at: geo.Point | undefined, track: Track, zoom: number ): string | undefined {

    if ( key === "" || at === undefined ) return undefined;

    return net.withQuery(origin, {
        size: "640x320",
        scale: "2",
        zoom: String(zoom),
        markers: `${at.lat},${at.lng}`,
        ...(track.points.length > 1 ? { path: `weight:4|enc:${geo.encode(track.points)}` } : {}),
        key,
    });

}
