import * as error from "engine-error";
import * as json from "engine-json";
import * as number from "engine-number";
import * as string from "engine-string";
import { accepts, agrees, essence, mime, sniff, sniffable } from "./mime.ts";
import { safe } from "./path.ts";

export type Limits = { maxBytes: number; maxFiles: number; types?: readonly string[] | undefined; maxPixels?: number | undefined };
export type FileRef = { uri: string; name: string; type: string; size?: number | undefined };
export type Part = Blob | FileRef | string | number | boolean | bigint | Date;
export type Size = { width: number; height: number; type: string; orientation?: number | undefined };
export type Seen = { type: string; size: number; name: string; width?: number | undefined; height?: number | undefined };
export type Slice = { index: number; start: number; end: number; blob: Blob };

export const limits: Readonly<Limits> = Object.freeze({ maxBytes: 10_485_760, maxFiles: 10 });

const unknown = "application/octet-stream";
const most = 10_000;
const reach = 65_536;
const boxes = new Set<string>(["image/heic", "image/heif", "image/avif"]);
const raster = new Set<string>(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/x-icon", ...boxes]);

function nameOf ( file: Blob | FileRef ): string {

    return "name" in file && typeof file.name === "string" ? file.name : "";

}
function hexOf ( code: number | undefined ): number {

    if ( code === undefined ) return -1;
    if ( code >= 48 && code <= 57 ) return code - 48;
    if ( code >= 97 && code <= 102 ) return code - 87;

    return code >= 65 && code <= 70 ? code - 55 : -1;

}
function unescaped ( text: string ): Uint8Array {

    const plain = string.bytes(text);
    const out = new Uint8Array(plain.length);
    let size = 0;

    if ( !text.includes("%") ) return plain;

    for ( let at = 0; at < plain.length; at += 1 ) {

        const high = hexOf(plain[at + 1]);
        const low = hexOf(plain[at + 2]);

        if ( plain[at] === 0x25 && high !== -1 && low !== -1 ) {

            out[size] = (high << 4) | low;
            at += 2;

        } else out[size] = plain[at] ?? 0;

        size += 1;

    }

    return out.slice(0, size);

}
function sized ( type: string, width: number, height: number, orientation?: number ): Size | undefined {

    if ( !(width > 0 && height > 0) ) return undefined;

    const turned = orientation !== undefined && orientation >= 5;
    const size: Size = { width: turned ? height : width, height: turned ? width : height, type };

    return orientation === undefined ? size : { ...size, orientation };

}
function tagged ( data: Uint8Array, at: number, word: string ): boolean {

    for ( let index = 0; index < word.length; index += 1 ) if ( data[at + index] !== word.charCodeAt(index) ) return false;

    return true;

}
function oriented ( data: Uint8Array, view: DataView, at: number ): number | undefined {

    const base = at + 10;

    if ( base + 8 > data.length || !tagged(data, at + 4, "Exif") ) return undefined;

    const order = view.getUint16(base);
    const little = order === 0x4949;
    const first = base + view.getUint32(base + 4, little);

    if ( (!little && order !== 0x4d4d) || first + 2 > data.length ) return undefined;

    const count = Math.min(view.getUint16(first, little), 64);

    for ( let index = 0; index < count; index += 1 ) {

        const entry = first + 2 + index * 12;

        if ( entry + 12 > data.length ) return undefined;

        if ( view.getUint16(entry, little) === 0x0112 ) {

            const found = view.getUint16(entry + 8, little);

            return found >= 1 && found <= 8 ? found : undefined;

        }

    }

    return undefined;

}
function jpeg ( data: Uint8Array, view: DataView, type: string ): Size | undefined {

    let turned: number | undefined;
    let at = 2;

    while ( at + 4 <= data.length ) {

        const marker = data[at + 1] ?? 0;

        if ( data[at] !== 0xff || marker === 0xd9 || marker === 0xda ) return undefined;

        if ( marker === 0xff ) at += 1;
        else if ( marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8) ) at += 2;
        else {

            const length = view.getUint16(at + 2);

            if ( length < 2 ) return undefined;
            if ( marker === 0xe1 && turned === undefined ) turned = oriented(data, view, at);
            if ( marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc ) return at + 9 > data.length ? undefined : sized(type, view.getUint16(at + 7), view.getUint16(at + 5), turned);

            at += 2 + length;

        }

    }

    return undefined;

}
function boxed ( data: Uint8Array, view: DataView, type: string ): Size | undefined {

    let best: Size | undefined;

    for ( let at = 12; at + 16 <= data.length; at += 1 ) {

        if ( data[at] !== 0x69 || !tagged(data, at, "ispe") ) continue;

        const found = sized(type, view.getUint32(at + 8), view.getUint32(at + 12));

        if ( found && (!best || found.width * found.height > best.width * best.height) ) best = found;

    }

    return best;

}
function webp ( data: Uint8Array, view: DataView, type: string ): Size | undefined {

    if ( data.length < 30 ) return undefined;

    if ( tagged(data, 12, "VP8 ") ) return sized(type, view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if ( tagged(data, 12, "VP8X") ) return sized(type, 1 + (data[24] ?? 0) + ((data[25] ?? 0) << 8) + ((data[26] ?? 0) << 16), 1 + (data[27] ?? 0) + ((data[28] ?? 0) << 8) + ((data[29] ?? 0) << 16));
    if ( !tagged(data, 12, "VP8L") ) return undefined;

    const bits = view.getUint32(21, true);

    return sized(type, (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);

}
function weighed ( file: Blob | FileRef, bounds: Limits, field: string ): void {

    const size = file.size;

    if ( size !== undefined && !(size >= 0 && size <= bounds.maxBytes) ) throw error.fault("validation", "file.size", { errors: { [field]: [`max:${bounds.maxBytes}`] }, message: `${field}: larger than ${number.bytes(bounds.maxBytes)}` });

}
function attach ( data: FormData, key: string, item: unknown, bounds: Limits, count: { files: number } ): void {

    if ( item === null || item === undefined || typeof item === "function" || typeof item === "symbol" ) return;

    if ( item instanceof Blob || isRef(item) ) {

        count.files += 1;

        if ( count.files > bounds.maxFiles ) throw error.fault("validation", "file.count", { errors: { [key]: [`max_files:${bounds.maxFiles}`] } });

        check(item, bounds, key);

        const name = safe(nameOf(item), "");
        const made = item instanceof Blob ? item : (toBlob(item.uri) ?? (item as unknown as Blob));

        if ( name !== "" && made instanceof Blob ) data.append(key, made, name);
        else data.append(key, made);

        return;

    }

    if ( item instanceof Date ) {

        if ( !Number.isNaN(item.getTime()) ) data.append(key, item.toISOString());

        return;

    }

    data.append(key, typeof item === "object" ? json.stringify(item) : String(item));

}

export function isRef ( value: unknown ): value is FileRef {

    if ( !json.isRecord(value) || typeof value.uri !== "string" || typeof value.name !== "string" || typeof value.type !== "string" ) return false;

    return value.size === undefined || (typeof value.size === "number" && Number.isFinite(value.size) && value.size >= 0);

}
export function typeOf ( file: Blob | FileRef, head?: Uint8Array ): string {

    const stated = essence(file.type) || mime(nameOf(file));
    const found = head ? sniff(head) : undefined;

    if ( found === undefined ) return head && sniffable(stated) ? unknown : stated;

    return stated === unknown || !agrees(stated, found) ? found : stated;

}
export function check ( file: Blob | FileRef, bounds: Limits = limits, field = "file" ): void {

    const type = typeOf(file);

    weighed(file, bounds, field);

    if ( !accepts(type, bounds.types, nameOf(file)) ) throw error.fault("validation", "file.type", { errors: { [field]: ["type"] }, message: `${field}: ${type} is not accepted` });

}
export function formData ( value: Record<string, unknown>, bounds: Limits = limits ): FormData {

    const data = new FormData();
    const count = { files: 0 };

    for ( const [key, item] of Object.entries(value) ) {

        if ( Array.isArray(item) ) for ( const entry of item ) attach(data, `${key}[]`, entry, bounds, count);
        else attach(data, key, item, bounds, count);

    }

    return data;

}
export function dataUri ( type: string, base64: string ): string {

    return `data:${type};base64,${base64}`;

}
export function parseDataUri ( uri: string, max: number = limits.maxBytes ): { type: string; bytes: Uint8Array } | undefined {

    const hash = uri.indexOf("#");
    const whole = hash === -1 ? uri : uri.slice(0, hash);
    const comma = whole.indexOf(",");

    if ( comma === -1 || whole.slice(0, 5).toLowerCase() !== "data:" || whole.length - comma > max * 3 + 8 ) return undefined;

    const head = whole.slice(5, comma).split(";").map(( part ) => part.trim());
    const type = essence(head[0] ?? "") || "text/plain";
    const body = whole.slice(comma + 1);

    if ( head.length < 2 || (head[head.length - 1] ?? "").toLowerCase() !== "base64" ) {

        const bytes = unescaped(body);

        return bytes.length > max ? undefined : { type, bytes };

    }

    const clean = (body.includes("%") ? string.utf8(unescaped(body)) : body).replace(/[\t\n\f\r ]+/g, "");
    const bare = clean.replace(/={1,2}$/, "");

    if ( /[^A-Za-z0-9+/_-]/.test(bare) || bare.length % 4 === 1 || Math.floor((bare.length * 3) / 4) > max ) return undefined;

    return { type, bytes: string.fromBase64(bare) };

}
export function toBlob ( uri: string, name?: string ): Blob | undefined {

    const parsed = parseDataUri(uri);

    if ( !parsed ) return undefined;

    const parts = [new Uint8Array(parsed.bytes)];

    return name !== undefined && typeof File === "function" ? new File(parts, safe(name), { type: parsed.type }) : new Blob(parts, { type: parsed.type });

}
export async function bytes ( blob: Blob ): Promise<Uint8Array> {

    return new Uint8Array(await blob.arrayBuffer());

}
export async function head ( blob: Blob, size = 4100 ): Promise<Uint8Array> {

    return new Uint8Array(await blob.slice(0, size).arrayBuffer());

}
export async function text ( blob: Blob ): Promise<string> {

    return blob.text();

}
export async function toDataUri ( blob: Blob ): Promise<string> {

    return dataUri(essence(blob.type) || unknown, string.base64(await bytes(blob)));

}
export function slices ( blob: Blob, size: number ): Slice[] {

    const out: Slice[] = [];

    if ( !(Number.isInteger(size) && size > 0) || blob.size / size > most ) throw new RangeError("not a size");

    for ( let start = 0; start < blob.size; start += size ) {

        const end = Math.min(blob.size, start + size);

        out.push({ index: out.length, start, end, blob: blob.slice(start, end, blob.type) });

    }

    return out;

}
export function imageSize ( data: Uint8Array ): Size | undefined {

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const type = sniff(data);

    if ( type === "image/png" ) return data.length >= 24 && tagged(data, 12, "IHDR") ? sized(type, view.getUint32(16), view.getUint32(20)) : undefined;
    if ( type === "image/gif" ) return data.length >= 10 ? sized(type, view.getUint16(6, true), view.getUint16(8, true)) : undefined;
    if ( type === "image/bmp" ) return data.length >= 26 ? sized(type, Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true))) : undefined;
    if ( type === "image/x-icon" ) return data.length >= 8 ? sized(type, data[6] || 256, data[7] || 256) : undefined;
    if ( type === "image/webp" ) return webp(data, view, type);
    if ( type === "image/jpeg" ) return jpeg(data, view, type);

    return type === "image/heic" || type === "image/heif" || type === "image/avif" ? boxed(data, view, type) : undefined;

}
export async function inspect ( file: Blob, bounds: Limits = limits, field = "file" ): Promise<Seen> {

    weighed(file, bounds, field);

    const first = await head(file);
    const found = sniff(first);

    if ( found === undefined ) check(file, bounds, field);

    const type = typeOf(file, first);
    const far = found !== undefined && first.length < file.size && (found === "image/jpeg" || boxes.has(found));
    const name = nameOf(file);
    const vouched = found === undefined && type === typeOf(file) && !sniffable(mime(name));
    let size = far && found !== "image/jpeg" ? undefined : imageSize(first);

    for ( let wide = reach, read = first.length; far && size === undefined && read < file.size; read = wide, wide *= 4 ) size = imageSize(await head(file, wide));

    if ( !accepts(type, bounds.types, vouched ? name : undefined) ) throw error.fault("validation", "file.content", { errors: { [field]: ["type"] }, message: `${field}: the content is ${type}` });
    if ( bounds.maxPixels !== undefined && (size ? !(size.width * size.height <= bounds.maxPixels) : found !== undefined && raster.has(found)) ) throw error.fault("validation", "file.pixels", { errors: { [field]: [`max_pixels:${bounds.maxPixels}`] } });

    return { type, size: file.size, name: safe(name, ""), ...(size ? { width: size.width, height: size.height } : {}) };

}
export function human ( size: number ): string {

    return number.bytes(size);

}
