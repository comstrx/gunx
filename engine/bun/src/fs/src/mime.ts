export type Kind = "image" | "video" | "audio" | "document" | "archive" | "text" | "font" | "data" | "other";

const unknown = "application/octet-stream";
const mimes = new Map<string, string>(Object.entries({
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon", heic: "image/heic", heif: "image/heif",
    bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", apng: "image/apng", jxl: "image/jxl",
    mp4: "video/mp4", m4v: "video/x-m4v", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo", "3gp": "video/3gpp", ogv: "video/ogg",
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/opus", aac: "audio/aac", flac: "audio/flac", weba: "audio/webm", mid: "audio/midi",
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation", rtf: "application/rtf", epub: "application/epub+zip",
    json: "application/json", map: "application/json", ndjson: "application/x-ndjson", jsonl: "application/x-ndjson", geojson: "application/geo+json", webmanifest: "application/manifest+json",
    xml: "application/xml", csv: "text/csv", tsv: "text/tab-separated-values", yaml: "application/yaml", yml: "application/yaml", toml: "application/toml", sql: "application/sql",
    txt: "text/plain", log: "text/plain", md: "text/markdown", html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript", ts: "text/typescript",
    ics: "text/calendar", vcf: "text/vcard", vtt: "text/vtt", m3u8: "application/vnd.apple.mpegurl",
    woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
    zip: "application/zip", gz: "application/gzip", tar: "application/x-tar", rar: "application/vnd.rar", "7z": "application/x-7z-compressed", bz2: "application/x-bzip2", xz: "application/x-xz", zst: "application/zstd",
    wasm: "application/wasm", apk: "application/vnd.android.package-archive", bin: unknown,
}));
const aliases = new Map<string, string>([
    ["image/jpg", "image/jpeg"], ["image/pjpeg", "image/jpeg"], ["image/x-png", "image/png"], ["image/vnd.microsoft.icon", "image/x-icon"], ["image/x-ms-bmp", "image/bmp"],
    ["audio/mp3", "audio/mpeg"], ["audio/x-wav", "audio/wav"], ["audio/wave", "audio/wav"], ["audio/x-m4a", "audio/mp4"], ["audio/x-flac", "audio/flac"], ["application/ogg", "audio/ogg"],
    ["application/x-zip-compressed", "application/zip"], ["application/x-gzip", "application/gzip"], ["application/x-rar-compressed", "application/vnd.rar"], ["application/x-pdf", "application/pdf"],
    ["application/javascript", "text/javascript"], ["application/x-javascript", "text/javascript"], ["text/xml", "application/xml"], ["text/json", "application/json"], ["application/csv", "text/csv"],
    ["text/x-markdown", "text/markdown"], ["text/yaml", "application/yaml"], ["application/x-yaml", "application/yaml"],
]);
const extensions = new Map<string, string>();
const signatures: readonly (readonly [number, readonly number[], string])[] = [
    [0, [0x89, 0x50, 0x4e, 0x47], "image/png"],
    [0, [0xff, 0xd8, 0xff], "image/jpeg"],
    [0, [0x47, 0x49, 0x46, 0x38], "image/gif"],
    [0, [0x25, 0x50, 0x44, 0x46], "application/pdf"],
    [0, [0x1f, 0x8b], "application/gzip"],
    [0, [0x00, 0x61, 0x73, 0x6d], "application/wasm"],
    [0, [0x77, 0x4f, 0x46, 0x32], "font/woff2"],
    [0, [0x77, 0x4f, 0x46, 0x46], "font/woff"],
    [0, [0x4f, 0x54, 0x54, 0x4f], "font/otf"],
    [0, [0x00, 0x01, 0x00, 0x00, 0x00], "font/ttf"],
    [0, [0x00, 0x00, 0x01, 0x00], "image/x-icon"],
    [0, [0x49, 0x49, 0x2a, 0x00], "image/tiff"],
    [0, [0x4d, 0x4d, 0x00, 0x2a], "image/tiff"],
    [0, [0x4f, 0x67, 0x67, 0x53], "audio/ogg"],
    [0, [0x66, 0x4c, 0x61, 0x43], "audio/flac"],
    [0, [0x49, 0x44, 0x33], "audio/mpeg"],
    [0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], "application/vnd.rar"],
    [0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], "application/x-7z-compressed"],
    [0, [0x42, 0x5a, 0x68], "application/x-bzip2"],
    [0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], "application/x-xz"],
    [0, [0x28, 0xb5, 0x2f, 0xfd], "application/zstd"],
    [257, [0x75, 0x73, 0x74, 0x61, 0x72], "application/x-tar"],
];
const brands = new Map<string, string>([
    ["heic", "image/heic"], ["heix", "image/heic"], ["hevc", "image/heic"], ["hevx", "image/heic"], ["heim", "image/heic"], ["heis", "image/heic"], ["mif1", "image/heif"], ["msf1", "image/heif"],
    ["avif", "image/avif"], ["avis", "image/avif"], ["qt  ", "video/quicktime"], ["M4A ", "audio/mp4"], ["M4B ", "audio/mp4"], ["M4V ", "video/x-m4v"],
]);
const containers = new Map<string, readonly string[]>([
    ["application/zip", ["officedocument", "opendocument", "epub+zip", "package-archive", "java-archive"]],
    ["application/xml", ["+xml"]],
    ["video/mp4", ["audio/mp4", "video/x-m4v", "video/3gpp", "video/quicktime"]],
    ["audio/ogg", ["video/ogg", "audio/opus"]],
    ["video/x-matroska", ["video/webm", "audio/webm"]],
    ["video/webm", ["audio/webm"]],
    ["image/heif", ["image/heic", "image/avif"]],
    ["image/heic", ["image/heif"]],
]);
const data = new Set<string>(["application/json", "application/xml", "application/x-ndjson", "application/yaml", "application/toml", "application/sql", "text/csv", "text/tab-separated-values"]);
const archives = new Set<string>(["application/zip", "application/gzip", "application/x-tar", "application/vnd.rar", "application/x-7z-compressed", "application/x-bzip2", "application/x-xz", "application/zstd"]);
const documents = new Set<string>(["application/pdf", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/rtf", "application/epub+zip"]);
const bound = new Set<string>([
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/x-icon", "font/woff", "font/woff2", "application/wasm", "application/gzip", "application/vnd.rar", "application/x-7z-compressed",
    "application/x-bzip2", "application/x-xz", "audio/ogg", "video/ogg", "video/webm", "audio/webm", "video/x-matroska",
]);
const header = 1445;
const shaped = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
const opening = /^<(?:!doctype html|html|head|script|iframe|h1|div|font|table|a|style|title|b|body|br|p)(?=[\t\n\f\r />])/;

for ( const [extension, type] of mimes ) if ( !extensions.has(type) ) extensions.set(type, extension);

function ascii ( bytes: Uint8Array, from: number, size: number ): string {

    const end = Math.min(bytes.length, from + size);
    let out = "";

    for ( let at = from; at < end; at += 1 ) out += String.fromCharCode(bytes[at] ?? 0);

    return out;

}
function starts ( bytes: Uint8Array, at: number, signature: readonly number[] ): boolean {

    if ( bytes.length < at + signature.length ) return false;

    for ( let index = 0; index < signature.length; index += 1 ) if ( bytes[at + index] !== signature[index] ) return false;

    return true;

}
function carried ( type: string, inside: string ): boolean {

    return (containers.get(inside) ?? []).some(( part ) => type.includes(part));

}
function boxed ( bytes: Uint8Array ): string | undefined {

    const brand = ascii(bytes, 8, 4);
    const found = brands.get(brand);
    const others = ascii(bytes, 16, 48);

    if ( found === "image/heif" ) return others.includes("avif") ? "image/avif" : others.includes("heic") || others.includes("heix") ? "image/heic" : found;
    if ( found ) return found;
    if ( brand.startsWith("3g") ) return "video/3gpp";

    return /^(?:iso|mp4|avc|dash|mmp4|MSNV|f4v)/.test(brand) ? "video/mp4" : undefined;

}
function packed ( bytes: Uint8Array ): string {

    const name = (bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8);
    const extra = (bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8);
    const stated = ascii(bytes, 30, 8) === "mimetype" ? ascii(bytes, 30 + name + extra, Math.min((bytes[18] ?? 0) | ((bytes[19] ?? 0) << 8), 96)) : "";
    const head = ascii(bytes, 0, 4096);

    if ( extensions.has(stated) && carried(stated, "application/zip") ) return stated;
    if ( !head.includes("[Content_Types].xml") ) return "application/zip";

    return mimes.get(head.includes("word/") ? "docx" : head.includes("xl/") ? "xlsx" : head.includes("ppt/") ? "pptx" : "zip") ?? "application/zip";

}
function blank ( byte: number | undefined ): boolean {

    return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d;

}
function marked ( bytes: Uint8Array ): string | undefined {

    let at = starts(bytes, 0, [0xef, 0xbb, 0xbf]) ? 3 : 0;

    while ( at < header && blank(bytes[at]) ) at += 1;

    if ( bytes[at] !== 0x3c ) return undefined;

    const head = ascii(bytes, at, 1024).toLowerCase();

    if ( head.startsWith("<svg") || ((head.startsWith("<?xml") || head.startsWith("<!doctype svg")) && head.includes("<svg")) ) return "image/svg+xml";
    if ( head.startsWith("<!--") || opening.test(head) ) return "text/html";

    return head.startsWith("<?xml") ? "application/xml" : undefined;

}

export function essence ( type: string ): string {

    const stated = (type.split(";")[0] ?? "").trim();

    if ( !shaped.test(stated) ) return "";

    const clean = stated.toLowerCase();

    return aliases.get(clean) ?? clean;

}
export function mime ( name: string ): string {

    const at = name.lastIndexOf(".");

    return mimes.get((at === -1 ? name : name.slice(at + 1)).toLowerCase()) ?? unknown;

}
export function extensionOf ( type: string ): string {

    return extensions.get(essence(type)) ?? "";

}
export function kind ( type: string ): Kind {

    const clean = essence(type);

    if ( clean.startsWith("image/") ) return "image";
    if ( clean.startsWith("video/") ) return "video";
    if ( clean.startsWith("audio/") ) return "audio";
    if ( clean.startsWith("font/") || clean === "application/vnd.ms-fontobject" ) return "font";
    if ( documents.has(clean) || clean.includes("officedocument") || clean.includes("opendocument") ) return "document";
    if ( data.has(clean) || clean.endsWith("+json") || clean.endsWith("+xml") ) return "data";
    if ( clean.startsWith("text/") ) return "text";

    return archives.has(clean) ? "archive" : "other";

}
export function isText ( type: string ): boolean {

    const clean = essence(type);

    return clean.startsWith("text/") || data.has(clean) || clean.endsWith("+json") || clean.endsWith("+xml");

}
export function inert ( type: string ): boolean {

    const clean = essence(type);

    if ( clean === "image/svg+xml" ) return false;

    return clean.startsWith("image/") || clean.startsWith("audio/") || clean.startsWith("video/") || clean === "application/pdf" || clean === "text/plain";

}
export function accepts ( type: string, allowed: readonly string[] | undefined, name?: string ): boolean {

    if ( !allowed || allowed.length === 0 ) return true;

    const clean = essence(type);
    const at = name === undefined ? -1 : name.lastIndexOf(".");
    const ending = name !== undefined && at > 0 ? name.slice(at + 1).toLowerCase() : "";

    return allowed.some(( rule ) => {

        const wanted = rule.trim().toLowerCase();

        if ( wanted === "*" || wanted === "*/*" ) return true;
        if ( wanted.startsWith(".") ) return wanted.length > 1 && (ending === wanted.slice(1) || (clean !== "" && (extensions.get(clean) === wanted.slice(1) || mimes.get(wanted.slice(1)) === clean)));
        if ( wanted.endsWith("/*") ) return wanted.length > 2 && clean.startsWith(wanted.slice(0, -1));

        return clean !== "" && clean === essence(wanted);

    });

}
export function agrees ( declared: string, found: string ): boolean {

    const stated = essence(declared);
    const seen = essence(found);

    return stated === "" || stated === unknown || stated === seen || (isText(stated) && isText(seen)) || carried(stated, seen);

}
export function sniffable ( type: string ): boolean {

    return bound.has(essence(type));

}
export function sniff ( bytes: Uint8Array ): string | undefined {

    for ( const [at, signature, type] of signatures ) if ( starts(bytes, at, signature) ) return type;

    if ( starts(bytes, 0, [0x50, 0x4b, 0x03, 0x04]) ) return packed(bytes);
    if ( starts(bytes, 4, [0x66, 0x74, 0x79, 0x70]) && bytes.length >= 12 ) return boxed(bytes);
    if ( starts(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]) ) return ascii(bytes, 4, 60).includes("webm") ? "video/webm" : "video/x-matroska";
    if ( starts(bytes, 0, [0x42, 0x4d]) && bytes.length >= 26 && starts(bytes, 6, [0, 0, 0, 0]) ) return "image/bmp";
    if ( bytes.length >= 4 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xf6) === 0xf2 ) return "audio/mpeg";

    if ( starts(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12 ) {

        const form = ascii(bytes, 8, 4);

        return form === "WEBP" ? "image/webp" : form === "WAVE" ? "audio/wav" : form === "AVI " ? "video/x-msvideo" : undefined;

    }

    return marked(bytes);

}
