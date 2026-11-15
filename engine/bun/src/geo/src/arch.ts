import type * as device from "engine-device";

export type Point = { lat: number; lng: number };
export type MapApp = "google" | "apple" | "waze";
export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type Bounds = { south: number; west: number; north: number; east: number };
export type Viewport = { width: number; height: number };
export type Fit = { center: Point; zoom: number; bounds: Bounds };
export type Tile = { x: number; y: number; z: number };
export type Locate = device.Follow & {
    within?: number | undefined;
    radius?: number | undefined;
    minMeters?: number | undefined;
    minMs?: number | undefined;
    signal?: AbortSignal | undefined;
};
export type Near<T extends Point> = { item: T; distance: number };
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
export type Group<T> = { lat: number; lng: number; x: number; y: number; z: number; cell: number; items: T[] };
