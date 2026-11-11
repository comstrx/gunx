import * as adapter from "engine-adapter";
import * as error from "engine-error";
import { meters, turned } from "./path.ts";
import { deg, distance, earthRadius, interpolate, isPoint, type Point, rad, sure } from "./point.ts";

export type Cluster<T extends Point> = { center: Point; count: number; items: T[] };
export type Snapped = { point: Point; index: number; distance: number; fraction: number };
export type Progress = Snapped & { meters: number; total: number; ratio: number };
export type Mode = "car" | "walk" | "bike";
export type Ask = { locale?: string | undefined; signal?: AbortSignal | undefined };
export type Search = Ask & { near?: Point | undefined; limit?: number | undefined };
export type Place = { point: Point; label: string; country?: string | undefined; city?: string | undefined };
export type Geocoder = { search: ( query: string, options?: Search ) => Promise<Place[]>; reverse: ( point: Point, options?: Ask ) => Promise<Place | undefined> };
export type Route = { points: Point[]; meters: number; seconds: number };
export type Router = { route: ( from: Point, to: Point, mode?: Mode, options?: Ask ) => Promise<Route | undefined> };

type Group<T> = { lat: number; lng: number; x: number; y: number; z: number; cell: number; items: T[] };

const shift = 67_108_864;
const finest = 1e-5;
const widest = 50;
const longest = 256;
const modes: readonly string[] = ["car", "walk", "bike"];

export const geocoder: adapter.Port<Geocoder> = adapter.port<Geocoder>("geo.geocoder");
export const router: adapter.Port<Router> = adapter.port<Router>("geo.router");

function placed ( value: unknown ): value is Place {

    if ( typeof value !== "object" || value === null ) return false;

    const { point, label } = value as Record<string, unknown>;

    return isPoint(point) && typeof label === "string";

}
function routed ( value: Route ): boolean {

    return Array.isArray(value.points) && value.points.every(isPoint) && value.meters >= 0 && value.seconds >= 0 && Number.isFinite(value.meters + value.seconds);

}
async function asked<T> ( signal: AbortSignal | undefined, call: () => Promise<T> ): Promise<T> {

    if ( signal?.aborted ) throw error.fault("timeout", "geo.aborted");

    try {

        return await call();

    } catch ( cause ) {

        if ( error.isFault(cause) ) throw cause;

        throw signal?.aborted ? error.fault("timeout", "geo.aborted", { cause }) : error.fault("unavailable", "geo.refused", { cause });

    }

}

export function centroid ( points: readonly Point[] ): Point | undefined {

    let x = 0;
    let y = 0;
    let z = 0;
    let count = 0;

    for ( const point of points ) {

        if ( !isPoint(point) ) continue;

        const lat = point.lat * rad;
        const lng = point.lng * rad;
        const cos = Math.cos(lat);

        x += cos * Math.cos(lng);
        y += cos * Math.sin(lng);
        z += Math.sin(lat);
        count += 1;

    }

    return count === 0 ? undefined : { lat: Math.atan2(z, Math.hypot(x, y)) * deg, lng: Math.atan2(y, x) * deg };

}
export function cluster<T extends Point> ( points: readonly T[], radiusMeters: number ): Cluster<T>[] {

    const radius = meters(radiusMeters);
    const step = Math.max((radius / earthRadius) * deg, finest);
    const gridded = step <= 1;
    const rows = Math.ceil(180 / step);
    const groups: Group<T>[] = [];
    const cells = new Map<number, number[]>();
    const widths = new Map<number, number>();
    const rowOf = ( lat: number ): number => Math.min(rows - 1, Math.floor((lat + 90) / step));
    const colOf = ( lng: number, cols: number ): number => Math.min(cols - 1, Math.floor(((lng + 180) / 360) * cols));
    const colsOf = ( row: number ): number => {

        const known = widths.get(row);

        if ( known !== undefined ) return known;

        const edge = Math.min(90, Math.abs((row + 0.5) * step - 90) + 1.5 * step);
        const reach = Math.sin((step * rad) / 2) / Math.cos(edge * rad);
        const made = reach < 1 ? Math.max(1, Math.floor(360 / (2 * Math.asin(reach) * deg))) : 1;

        widths.set(row, made);

        return made;

    };
    const scan = ( point: Point ): number => {

        for ( let index = 0; index < groups.length; index += 1 ) if ( distance(groups[index] as Point, point) <= radius ) return index;

        return -1;

    };
    const find = ( point: Point ): number => {

        const row = rowOf(point.lat);
        let best = -1;

        for ( let near = Math.max(0, row - 1); near <= Math.min(rows - 1, row + 1); near += 1 ) {

            const cols = colsOf(near);
            const col = colOf(point.lng, cols);
            const span = Math.min(3, cols);

            for ( let turn = 0; turn < span; turn += 1 ) {

                const held = cells.get(near * shift + (cols <= 3 ? turn : (col + turn - 1 + cols) % cols));

                if ( !held ) continue;

                for ( const index of held ) if ( (best === -1 || index < best) && distance(groups[index] as Point, point) <= radius ) best = index;

            }

        }

        return best;

    };
    const place = ( index: number, group: Group<T> ): void => {

        const row = rowOf(group.lat);
        const cell = row * shift + colOf(group.lng, colsOf(row));
        const old = cells.get(group.cell);
        const next = cells.get(cell);

        if ( cell === group.cell ) return;

        if ( old ) {

            old[old.indexOf(index)] = old[old.length - 1] ?? index;
            old.length -= 1;

            if ( old.length === 0 ) cells.delete(group.cell);

        }

        if ( next ) next.push(index);
        else cells.set(cell, [index]);

        group.cell = cell;

    };

    for ( const point of points ) {

        if ( !isPoint(point) ) continue;

        const lat = point.lat * rad;
        const lng = point.lng * rad;
        const cos = Math.cos(lat);
        const index = gridded ? find(point) : scan(point);
        const group: Group<T> = groups[index] ?? { lat: point.lat, lng: point.lng, x: 0, y: 0, z: 0, cell: -1, items: [] };

        group.x += cos * Math.cos(lng);
        group.y += cos * Math.sin(lng);
        group.z += Math.sin(lat);
        group.items.push(point);

        if ( group.items.length > 1 ) {

            group.lat = Math.atan2(group.z, Math.hypot(group.x, group.y)) * deg;
            group.lng = Math.atan2(group.y, group.x) * deg;

        } else groups.push(group);

        if ( gridded ) place(index === -1 ? groups.length - 1 : index, group);

    }

    return groups.map(( group ) => ({ center: { lat: group.lat, lng: group.lng }, count: group.items.length, items: group.items })).sort(( a, b ) => b.count - a.count);

}
export function snap ( point: Point, path: readonly Point[] ): Snapped | undefined {

    const first = path[0];
    const scale = Math.cos(point.lat * rad);
    let least = Number.POSITIVE_INFINITY;
    let index = -1;
    let fraction = 0;

    if ( !first ) return undefined;
    if ( path.length === 1 ) return { point: { lat: first.lat, lng: first.lng }, index: 0, distance: distance(point, first), fraction: 0 };

    for ( let at = 1; at < path.length; at += 1 ) {

        const a = path[at - 1] as Point;
        const b = path[at] as Point;
        const ax = turned(a.lng - point.lng) * scale;
        const ay = a.lat - point.lat;
        const dx = turned(b.lng - a.lng) * scale;
        const dy = b.lat - a.lat;
        const span = dx * dx + dy * dy;
        const t = span === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / span));
        const gx = ax + t * dx;
        const gy = ay + t * dy;
        const gap = gx * gx + gy * gy;

        if ( !(gap < least) ) continue;

        least = gap;
        index = at - 1;
        fraction = t;

    }

    if ( index === -1 ) return undefined;

    const found = interpolate(path[index] as Point, path[index + 1] as Point, fraction);

    return { point: found, index, distance: distance(point, found), fraction };

}
export function progress ( point: Point, path: readonly Point[] ): Progress | undefined {

    const found = snap(point, path);
    let before = 0;
    let total = 0;

    if ( !found ) return undefined;

    for ( let at = 1; at < path.length; at += 1 ) {

        const leg = distance(path[at - 1] as Point, path[at] as Point);

        if ( at <= found.index ) before += leg;

        total += leg;

    }

    const done = before + distance(path[found.index] as Point, found.point);

    return { ...found, meters: done, total, ratio: total > 0 ? Math.min(1, done / total) : 0 };

}
export async function geocode ( query: string, options: Search = {} ): Promise<Place[]> {

    const provider = geocoder.get();
    const text = typeof query === "string" ? query.trim() : "";
    const limit = options.limit === undefined ? undefined : Math.max(1, Math.min(widest, Math.trunc(options.limit) || 1));

    if ( options.near !== undefined ) sure(options.near);
    if ( text === "" || text.length > longest ) return [];

    const found: unknown = await asked(options.signal, () => provider.search(text, { ...options, limit }));

    if ( !Array.isArray(found) ) throw error.fault("unavailable", "geo.refused", { message: "geo: the geocoder did not answer a list" });

    return found.filter(placed).slice(0, limit ?? widest);

}
export async function reverse ( point: Point, options: Ask = {} ): Promise<Place | undefined> {

    const provider = geocoder.get();
    const at = sure({ lat: point.lat, lng: point.lng });
    const found: unknown = await asked(options.signal, () => provider.reverse(at, options));

    return placed(found) ? found : undefined;

}
export async function route ( from: Point, to: Point, mode: Mode = "car", options: Ask = {} ): Promise<Route | undefined> {

    const provider = router.get();
    const start = sure({ lat: from.lat, lng: from.lng });
    const end = sure({ lat: to.lat, lng: to.lng });

    if ( !modes.includes(mode) ) throw new RangeError("not a mode");

    const found = await asked(options.signal, () => provider.route(start, end, mode, options));

    if ( found === undefined || found === null ) return undefined;
    if ( !routed(found) ) throw error.fault("unavailable", "geo.refused", { message: "geo: the router answered an unsound route" });

    return found;

}
