import { type Bounds, turned } from "./path.ts";
import { deg, type Point, rad, sure } from "./point.ts";

export type Tile = { x: number; y: number; z: number };

const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const mercator = 85.05112878;
const deepest = 22;
const zooms = 22;
const longest = 2_097_152;
const batch = 8192;
const around: readonly (readonly [number, number])[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const letters = table();

function table (): Int8Array {

    const out = new Int8Array(128).fill(-1);

    for ( let at = 0; at < base32.length; at += 1 ) {

        out[base32.charCodeAt(at)] = at;
        out[base32.toUpperCase().charCodeAt(at)] = at;

    }

    return out;

}
function sized ( value: number, low: number, high: number, name: string ): number {

    if ( Number.isNaN(value) ) throw new RangeError(`not a ${name}`);

    return Math.max(low, Math.min(high, Math.trunc(value)));

}
function scaled ( precision: number ): number {

    if ( !Number.isInteger(precision) || precision < 1 || precision > 6 ) throw new RangeError("not a precision");

    return 10 ** precision;

}
function pack ( codes: number[], value: number ): void {

    let shifted = value < 0 ? ~(value << 1) : value << 1;

    while ( shifted >= 0x20 ) {

        codes.push((0x20 | (shifted & 0x1f)) + 63);
        shifted >>= 5;

    }

    codes.push(shifted + 63);

}
function boxed ( hash: string ): Bounds | undefined {

    let south = -90;
    let north = 90;
    let west = -180;
    let east = 180;
    let even = true;

    if ( typeof hash !== "string" || hash === "" || hash.length > deepest ) return undefined;

    for ( let at = 0; at < hash.length; at += 1 ) {

        const code = hash.charCodeAt(at);
        const value = code < 128 ? (letters[code] ?? -1) : -1;

        if ( value === -1 ) return undefined;

        for ( let shift = 4; shift >= 0; shift -= 1 ) {

            const on = ((value >> shift) & 1) === 1;
            const middle = even ? (west + east) / 2 : (south + north) / 2;

            if ( even && on ) west = middle;
            else if ( even ) east = middle;
            else if ( on ) south = middle;
            else north = middle;

            even = !even;

        }

    }

    return { south, west, north, east };

}

export function geohash ( point: Point, precision = 9 ): string {

    const size = sized(precision, 1, 12, "precision");
    const { lat, lng } = sure(point);
    let south = -90;
    let north = 90;
    let west = -180;
    let east = 180;
    let even = true;
    let out = "";

    for ( let at = 0; at < size; at += 1 ) {

        let index = 0;

        for ( let bit = 0; bit < 5; bit += 1 ) {

            const middle = even ? (west + east) / 2 : (south + north) / 2;
            const on = even ? lng >= middle : lat >= middle;

            index = index * 2 + (on ? 1 : 0);

            if ( even && on ) west = middle;
            else if ( even ) east = middle;
            else if ( on ) south = middle;
            else north = middle;

            even = !even;

        }

        out += base32[index] ?? "";

    }

    return out;

}
export function ungeohash ( hash: string ): Point | undefined {

    const box = boxed(hash);

    return box && { lat: (box.south + box.north) / 2, lng: (box.west + box.east) / 2 };

}
export function cell ( hash: string ): Bounds | undefined {

    return boxed(hash);

}
export function neighbors ( hash: string ): string[] {

    const box = boxed(hash);
    const out: string[] = [];

    if ( !box || hash.length > 12 ) return out;

    const tall = box.north - box.south;
    const wide = box.east - box.west;
    const lat = (box.south + box.north) / 2;
    const lng = (box.west + box.east) / 2;
    const own = hash.toLowerCase();

    for ( const [up, right] of around ) {

        const next = lat + up * tall;
        const found = next > 90 || next < -90 ? own : geohash({ lat: next, lng: turned(lng + right * wide) }, hash.length);

        if ( found !== own && !out.includes(found) ) out.push(found);

    }

    return out;

}
export function encode ( path: readonly Point[], precision = 5 ): string {

    const factor = scaled(precision);
    const codes: number[] = [];
    let lastLat = 0;
    let lastLng = 0;
    let out = "";

    for ( const point of path ) {

        const lat = Math.round(sure(point).lat * factor);
        const lng = Math.round(point.lng * factor);

        pack(codes, lat - lastLat);
        pack(codes, lng - lastLng);
        lastLat = lat;
        lastLng = lng;

    }

    for ( let at = 0; at < codes.length; at += batch ) out += String.fromCharCode(...codes.slice(at, at + batch));

    return out;

}
export function decode ( text: string, precision = 5 ): Point[] {

    const factor = scaled(precision);
    const tall = 90 * factor;
    const wide = 180 * factor;
    const out: Point[] = [];
    let at = 0;
    let lat = 0;
    let lng = 0;
    let second = false;

    if ( typeof text !== "string" || text.length > longest ) return [];

    while ( at < text.length ) {

        let result = 0;
        let shift = 0;
        let byte = 0x20;

        while ( byte >= 0x20 ) {

            byte = text.charCodeAt(at) - 63;
            at += 1;

            if ( !(byte >= 0 && byte <= 63) || shift > 25 ) return [];

            result |= (byte & 0x1f) << shift;
            shift += 5;

        }

        const delta = result & 1 ? ~(result >> 1) : result >> 1;

        second = !second;

        if ( second ) {

            lat += delta;

            continue;

        }

        lng += delta;

        if ( !(Math.abs(lat) <= tall && Math.abs(lng) <= wide) ) return [];

        out.push({ lat: lat / factor, lng: lng / factor });

    }

    return second ? [] : out;

}
export function tile ( point: Point, zoom: number ): Tile {

    const z = sized(zoom, 0, zooms, "zoom");
    const scale = 2 ** z;
    const { lat, lng } = sure(point);
    const bent = Math.max(-mercator, Math.min(mercator, lat)) * rad;
    const x = Math.floor(((lng + 180) / 360) * scale);
    const y = Math.floor(((1 - Math.log(Math.tan(bent) + 1 / Math.cos(bent)) / Math.PI) / 2) * scale);

    return { x: Math.max(0, Math.min(scale - 1, x)), y: Math.max(0, Math.min(scale - 1, y)), z };

}
export function untile ( given: Tile ): Bounds {

    const { x, y, z } = given;
    const scale = 2 ** z;
    const lat = ( row: number ): number => Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / scale))) * deg;

    if ( !Number.isInteger(z) || z < 0 || z > zooms || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= scale || y >= scale ) throw new RangeError("not a tile");

    return { south: lat(y + 1), west: (x / scale) * 360 - 180, north: lat(y), east: ((x + 1) / scale) * 360 - 180 };

}
