import type { Box, Format, Pictured, Plan, Sizing } from "./arch.ts";

const kinds: Readonly<Record<Format, string>> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const still: ReadonlySet<string> = new Set(["image/svg+xml", "image/gif"]);
const finest = 0.82;
const widest = 16_384;

function whole ( value: number | undefined ): number | undefined {

    return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.min(widest, Math.floor(value)) : undefined;

}
function formatOf ( type: string ): Format | undefined {

    return type === kinds.png ? "png" : type === kinds.webp ? "webp" : type === kinds.jpeg || type === "image/jpg" ? "jpeg" : undefined;

}
function framed ( width: number, height: number, ratio: number | undefined ): Box | undefined {

    if ( typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0 ) return undefined;

    const wide = Math.min(width, Math.max(1, Math.round(height * ratio)));
    const tall = Math.min(height, Math.max(1, Math.round(wide / ratio)));

    return wide === width && tall === height ? undefined : { x: Math.floor((width - wide) / 2), y: Math.floor((height - tall) / 2), width: wide, height: tall };

}
function renamed ( name: string, format: Format ): string {

    const dot = name.lastIndexOf(".");
    const stem = (dot >= 0 ? name.slice(0, dot) : name).trim() || "image";

    return `${stem}.${format === "jpeg" ? "jpg" : format}`;

}

function grade ( quality: number | undefined ): number {

    return typeof quality === "number" && Number.isFinite(quality) ? Math.min(1, Math.max(0.05, quality)) : finest;

}

export function sizable ( type: string ): boolean {

    return typeof type === "string" && type.startsWith("image/") && !still.has(type);

}
export function planned ( source: Pictured, sizing: Sizing = {} ): Plan {

    const width = whole(source.width) ?? 1;
    const height = whole(source.height) ?? 1;
    const crop = framed(width, height, sizing.ratio);
    const from = crop ?? { x: 0, y: 0, width, height };
    const side = whole(sizing.side);
    const scale = Math.min(1, (whole(sizing.width) ?? side ?? from.width) / from.width, (whole(sizing.height) ?? side ?? from.height) / from.height);
    const kept = formatOf(source.type);
    const format = sizing.format ?? kept ?? "jpeg";
    const made = { width: Math.max(1, Math.round(from.width * scale)), height: Math.max(1, Math.round(from.height * scale)) };
    const quality = grade(sizing.quality);

    return { crop, ...made, format, type: kinds[format], quality, name: renamed(source.name, format), idle: crop === undefined && scale === 1 && format === kept };

}
