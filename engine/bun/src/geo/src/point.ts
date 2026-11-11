import * as number from "engine-number";

export type Point = { lat: number; lng: number };
export type MapApp = "google" | "apple" | "waze";
export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export const earthRadius = 6_371_008.8;
export const rad = Math.PI / 180;
export const deg = 180 / Math.PI;

const longest = 96;
const winds: readonly Compass[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const decimal = /^[+-]?\d{1,3}(?:\.\d{1,20})?$/;
const written = /^\s*([+-]?\d{1,3}(?:\.\d{1,20})?)(?:\s*,\s*|\s+)([+-]?\d{1,3}(?:\.\d{1,20})?)\s*$/;

function body ( text: string ): string {

    if ( !text.includes(":") ) return text;

    const uri = text.trim();
    const parts = (uri.slice(4).split(/[;?]/, 1)[0] ?? "").split(",");

    return uri.slice(0, 4).toLowerCase() === "geo:" && (parts.length === 2 || parts.length === 3) ? `${parts[0]},${parts[1]}` : "";

}
function read ( value: unknown ): number {

    if ( typeof value === "number" ) return value;

    return typeof value === "string" && decimal.test(value) ? Number(value) : Number.NaN;

}
function made ( lat: unknown, lng: unknown ): Point | undefined {

    const point = { lat: read(lat), lng: read(lng) };

    return isPoint(point) ? point : undefined;

}
function quoted ( label: string ): string {

    try {

        return encodeURIComponent(label.slice(0, 256));

    } catch {

        return "";

    }

}

export function isPoint ( value: unknown ): value is Point {

    if ( typeof value !== "object" || value === null ) return false;

    const { lat, lng } = value as Record<string, unknown>;

    return typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

}
export function sure<T extends Point> ( point: T ): T {

    if ( !isPoint(point) ) throw new RangeError("not a point");

    return point;

}
export function spot ( point: Point ): string {

    sure(point);

    return `${number.precision(point.lat, 6)},${number.precision(point.lng, 6)}`;

}
export function normalize ( point: Point ): Point {

    if ( !Number.isFinite(point.lat) || !Number.isFinite(point.lng) ) throw new RangeError("not a point");

    return { lat: Math.max(-90, Math.min(90, point.lat)), lng: Math.abs(point.lng) <= 180 ? point.lng : number.wrap(point.lng, -180, 180) };

}
export function round ( point: Point, digits = 6 ): Point {

    return { lat: number.precision(point.lat, digits), lng: number.precision(point.lng, digits) };

}
export function same ( a: Point, b: Point, meters = 1 ): boolean {

    return distance(a, b) <= meters;

}
export function parse ( text: string ): Point | undefined {

    if ( typeof text !== "string" || text.length > longest ) return undefined;

    const found = written.exec(body(text));
    const lat = Number(found?.[1]);
    const lng = Number(found?.[2]);

    return found && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined;

}
export function format ( point: Point, digits = 5 ): string {

    return `${number.precision(point.lat, digits)}, ${number.precision(point.lng, digits)}`;

}
export function toJson ( point: Point ): [number, number] {

    sure(point);

    return [point.lng, point.lat];

}
export function fromJson ( value: unknown ): Point | undefined {

    if ( Array.isArray(value) ) return value.length === 2 || value.length === 3 ? made(value[1], value[0]) : undefined;
    if ( typeof value !== "object" || value === null ) return undefined;

    const { lat, latitude, lng, lon, long, longitude, type, coordinates } = value as Record<string, unknown>;

    if ( type === "Point" ) return Array.isArray(coordinates) ? fromJson(coordinates) : undefined;

    return made(lat ?? latitude, lng ?? lon ?? long ?? longitude);

}
export function distance ( a: Point, b: Point ): number {

    const half = Math.sin((b.lat - a.lat) * rad * 0.5);
    const turn = Math.sin((b.lng - a.lng) * rad * 0.5);
    const h = half * half + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * turn * turn;

    return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));

}
export function bearing ( a: Point, b: Point ): number {

    const lat1 = a.lat * rad;
    const lat2 = b.lat * rad;
    const turn = (b.lng - a.lng) * rad;
    const y = Math.sin(turn) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(turn);

    return (Math.atan2(y, x) * deg + 360) % 360;

}
export function compass ( degrees: number ): Compass {

    if ( !Number.isFinite(degrees) ) throw new RangeError("not a heading");

    return winds[Math.round(number.wrap(degrees, 0, 360) / 45) % 8] ?? "N";

}
export function destination ( from: Point, meters: number, heading: number ): Point {

    if ( !Number.isFinite(meters) ) throw new RangeError("not a distance");
    if ( !Number.isFinite(heading) ) throw new RangeError("not a heading");

    const angular = meters / earthRadius;
    const lat1 = from.lat * rad;
    const theta = heading * rad;
    const sin1 = Math.sin(lat1);
    const cos1 = Math.cos(lat1);
    const sinA = Math.sin(angular);
    const cosA = Math.cos(angular);
    const sin2 = Math.max(-1, Math.min(1, sin1 * cosA + cos1 * sinA * Math.cos(theta)));
    const lng2 = from.lng * rad + Math.atan2(Math.sin(theta) * sinA * cos1, cosA - sin1 * sin2);

    return { lat: Math.asin(sin2) * deg, lng: ((((lng2 * deg + 540) % 360) + 360) % 360) - 180 };

}
export function midpoint ( a: Point, b: Point ): Point {

    return interpolate(a, b, 0.5);

}
export function interpolate ( a: Point, b: Point, fraction: number ): Point {

    const t = fraction > 0 ? Math.min(1, fraction) : 0;

    if ( t === 0 ) return { lat: a.lat, lng: a.lng };
    if ( t === 1 ) return { lat: b.lat, lng: b.lng };

    const lat1 = a.lat * rad;
    const lng1 = a.lng * rad;
    const lat2 = b.lat * rad;
    const lng2 = b.lng * rad;
    const cos1 = Math.cos(lat1);
    const cos2 = Math.cos(lat2);
    const half = Math.sin((lat2 - lat1) / 2);
    const turn = Math.sin((lng2 - lng1) / 2);
    const delta = 2 * Math.asin(Math.min(1, Math.sqrt(half * half + cos1 * cos2 * turn * turn)));

    if ( delta < 1e-9 ) return t < 0.5 ? { lat: a.lat, lng: a.lng } : { lat: b.lat, lng: b.lng };
    if ( Math.PI - delta < 1e-9 ) return destination(a, t * delta * earthRadius, 0);

    const base = Math.sin(delta);
    const A = Math.sin((1 - t) * delta) / base;
    const B = Math.sin(t * delta) / base;
    const x = A * cos1 * Math.cos(lng1) + B * cos2 * Math.cos(lng2);
    const y = A * cos1 * Math.sin(lng1) + B * cos2 * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * deg, lng: Math.atan2(y, x) * deg };

}
export function link ( point: Point, app: MapApp = "google", label?: string ): string {

    const at = spot(point);
    const named = label ? quoted(label) : "";

    if ( app === "apple" ) return `https://maps.apple.com/?ll=${at}${named ? `&q=${named}` : ""}`;
    if ( app === "waze" ) return `https://waze.com/ul?ll=${at}&navigate=yes`;

    return `https://www.google.com/maps/search/?api=1&query=${at}`;

}
export function directions ( to: Point, app: MapApp = "google", from?: Point ): string {

    const end = spot(to);
    const start = from ? spot(from) : "";

    if ( app === "apple" ) return `https://maps.apple.com/?daddr=${end}${start ? `&saddr=${start}` : ""}&dirflg=d`;
    if ( app === "waze" ) return `https://waze.com/ul?ll=${end}&navigate=yes`;

    return `https://www.google.com/maps/dir/?api=1&destination=${end}${start ? `&origin=${start}` : ""}`;

}
