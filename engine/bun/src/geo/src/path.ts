import { deg, distance, earthRadius, interpolate, isPoint, type Point, rad } from "./point.ts";

export type Bounds = { south: number; west: number; north: number; east: number };
export type Viewport = { width: number; height: number };
export type Fit = { center: Point; zoom: number; bounds: Bounds };

const mercator = 85.05112878;
const tile = 256;

export function turned ( lng: number ): number {

    return lng > 180 ? lng - 360 : lng < -180 ? lng + 360 : lng;

}
function width ( box: Bounds ): number {

    return box.west <= box.east ? box.east - box.west : box.east - box.west + 360;

}
function projected ( lat: number ): number {

    return Math.log(Math.tan(Math.PI / 4 + (Math.max(-mercator, Math.min(mercator, lat)) * rad) / 2));

}
function tight ( points: readonly Point[] ): Bounds | undefined {

    let south = 90;
    let north = -90;
    let west = 180;
    let east = -180;
    let far = 360;
    let near = 0;
    let farAt = 0;
    let nearAt = 0;
    let seen = false;

    for ( const point of points ) {

        if ( !isPoint(point) ) continue;

        const shifted = point.lng < 0 ? point.lng + 360 : point.lng;

        seen = true;

        if ( point.lat < south ) south = point.lat;
        if ( point.lat > north ) north = point.lat;
        if ( point.lng < west ) west = point.lng;
        if ( point.lng > east ) east = point.lng;
        if ( shifted < far ) {

            far = shifted;
            farAt = point.lng;

        }
        if ( shifted > near ) {

            near = shifted;
            nearAt = point.lng;

        }

    }

    if ( !seen ) return undefined;

    return east - west > 180 && near - far < east - west ? { south, west: farAt, north, east: nearAt } : { south, west, north, east };

}
function grown ( box: Bounds, pad: number ): Bounds {

    if ( pad === 0 ) return box;

    const lat = (pad / earthRadius) * deg;
    const lng = lat / Math.max(0.01, Math.cos(((box.south + box.north) / 2) * rad));
    const whole = !(width(box) + 2 * lng < 360);

    return {
        south: Math.max(-90, box.south - lat),
        west: whole ? -180 : turned(box.west - lng),
        north: Math.min(90, box.north + lat),
        east: whole ? 180 : turned(box.east + lng),
    };

}

export function meters ( value: number ): number {

    if ( !(value >= 0) ) throw new RangeError("not a distance");

    return value;

}
export function bounds ( points: readonly Point[], padMeters = 0 ): Bounds | undefined {

    const box = tight(points);

    return box && grown(box, meters(padMeters));

}
export function around ( point: Point, radiusMeters: number ): Bounds {

    const angular = meters(radiusMeters) / earthRadius;
    const lat = angular * deg;
    const reach = Math.sin(angular) / Math.cos(point.lat * rad);
    const polar = !(point.lat + lat < 90 && point.lat - lat > -90 && reach < 1);
    const lng = polar ? 180 : Math.asin(reach) * deg;

    if ( !isPoint(point) ) throw new RangeError("not a point");

    return {
        south: Math.max(-90, point.lat - lat),
        west: polar ? -180 : turned(point.lng - lng),
        north: Math.min(90, point.lat + lat),
        east: polar ? 180 : turned(point.lng + lng),
    };

}
export function center ( box: Bounds ): Point {

    const lat = (box.south + box.north) / 2;

    return { lat, lng: box.west <= box.east ? (box.west + box.east) / 2 : turned(box.west + width(box) / 2) };

}
export function contains ( box: Bounds, point: Point ): boolean {

    if ( !(point.lat >= box.south && point.lat <= box.north) ) return false;

    const lng = point.lng;
    const twin = lng === 180 ? -180 : lng === -180 ? 180 : lng;

    return box.west <= box.east ? (lng >= box.west && lng <= box.east) || (twin >= box.west && twin <= box.east) : lng >= box.west || lng <= box.east || twin >= box.west || twin <= box.east;

}
export function overlaps ( a: Bounds, b: Bounds ): boolean {

    if ( !(a.south <= b.north && b.south <= a.north) ) return false;
    if ( a.west > a.east ) return b.west > b.east || b.east >= a.west || b.west <= a.east;
    if ( b.west > b.east ) return a.east >= b.west || a.west <= b.east;

    return a.west <= b.east && b.west <= a.east;

}
export function fit ( points: readonly Point[], viewport: Viewport, maxZoom = 18, padMeters = 50 ): Fit | undefined {

    const exact = tight(points);

    if ( !exact ) return undefined;

    const box = grown(exact, meters(padMeters));
    const ceiling = Number.isNaN(maxZoom) ? 18 : Math.max(1, maxZoom);
    const top = projected(box.north);
    const bottom = projected(box.south);
    const middle = { lat: (2 * Math.atan(Math.exp((top + bottom) / 2)) - Math.PI / 2) * deg, lng: center(box).lng };

    if ( exact.south === exact.north && exact.west === exact.east ) return { center: center(box), zoom: Math.min(16, ceiling), bounds: box };

    const tall = Math.log2(viewport.height / tile / Math.max(1e-9, (top - bottom) / (2 * Math.PI)));
    const broad = Math.log2(viewport.width / tile / Math.max(1e-9, width(box) / 360));
    const zoom = Math.floor(Math.min(tall, broad));

    return { center: middle, zoom: zoom >= 1 ? Math.min(zoom, ceiling) : 1, bounds: box };

}
export function inside ( point: Point, polygon: readonly Point[] ): boolean {

    let hit = false;

    if ( polygon.length < 3 ) return false;

    for ( let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1 ) {

        const a = polygon[i] as Point;
        const b = polygon[j] as Point;

        if ( a.lat > point.lat !== b.lat > point.lat && point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng ) hit = !hit;

    }

    return hit;

}
export function area ( polygon: readonly Point[] ): number {

    const size = polygon.length;
    let total = 0;

    if ( size < 3 ) return 0;

    for ( let index = 0; index < size; index += 1 ) {

        const before = polygon[(index + size - 1) % size] as Point;
        const here = polygon[index] as Point;
        const after = polygon[(index + 1) % size] as Point;

        total += turned(after.lng - before.lng) * rad * Math.sin(here.lat * rad);

    }

    return Math.abs((total * earthRadius * earthRadius) / 2);

}
export function length ( path: readonly Point[] ): number {

    let total = 0;

    for ( let index = 1; index < path.length; index += 1 ) total += distance(path[index - 1] as Point, path[index] as Point);

    return total;

}
export function along ( path: readonly Point[], distanceMeters: number ): Point | undefined {

    const last = path[path.length - 1];
    let remaining = Number.isNaN(distanceMeters) ? 0 : Math.max(0, distanceMeters);

    if ( !last ) return undefined;

    for ( let index = 1; index < path.length; index += 1 ) {

        const from = path[index - 1] as Point;
        const to = path[index] as Point;
        const leg = distance(from, to);

        if ( remaining <= leg ) return leg === 0 ? { lat: from.lat, lng: from.lng } : interpolate(from, to, remaining / leg);

        remaining -= leg;

    }

    return { lat: last.lat, lng: last.lng };

}
export function nearest<T extends Point> ( point: Point, candidates: readonly T[] ): { item: T; distance: number } | undefined {

    const lat = point.lat * rad;
    const lng = point.lng * rad;
    const cos = Math.cos(lat);
    let best: T | undefined;
    let least = Number.POSITIVE_INFINITY;

    for ( const item of candidates ) {

        const half = Math.sin((item.lat * rad - lat) * 0.5);
        const turn = Math.sin((item.lng * rad - lng) * 0.5);
        const h = half * half + cos * Math.cos(item.lat * rad) * turn * turn;

        if ( !(h < least) ) continue;

        least = h;
        best = item;

    }

    return best && { item: best, distance: distance(point, best) };

}
export function simplify ( path: readonly Point[], toleranceMeters = 10 ): Point[] {

    const size = path.length;
    const tolerance = (meters(toleranceMeters) / earthRadius) * deg;
    const limit = tolerance * tolerance;
    const keep = new Uint8Array(size);
    const stack: number[] = [0, size - 1];
    const out: Point[] = [];

    if ( size < 3 ) return [...path];

    keep[0] = 1;
    keep[size - 1] = 1;

    while ( stack.length > 0 ) {

        const last = stack.pop() ?? 0;
        const first = stack.pop() ?? 0;
        const a = path[first] as Point;
        const b = path[last] as Point;
        const scale = Math.cos(((a.lat + b.lat) / 2) * rad);
        const dx = turned(b.lng - a.lng) * scale;
        const dy = b.lat - a.lat;
        const span = dx * dx + dy * dy;
        let farthest = limit;
        let at = -1;

        for ( let index = first + 1; index < last; index += 1 ) {

            const point = path[index] as Point;
            const px = turned(point.lng - a.lng) * scale;
            const py = point.lat - a.lat;
            const t = span === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / span));
            const gx = px - t * dx;
            const gy = py - t * dy;
            const gap = gx * gx + gy * gy;

            if ( !(gap > farthest) ) continue;

            farthest = gap;
            at = index;

        }

        if ( at !== -1 ) {

            keep[at] = 1;
            stack.push(first, at, at, last);

        }

    }

    for ( let index = 0; index < size; index += 1 ) if ( keep[index] === 1 ) out.push(path[index] as Point);

    return out;

}
