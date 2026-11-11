import { createHash } from "node:crypto";
import { type Dirent, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as error from "engine-error";
import * as json from "engine-json";

export type Walked = { path: string; relative: string; size: number };
export type WalkOptions = { extensions?: readonly string[] | undefined; ignore?: readonly string[] | undefined };
export type Member = { name: string; folder: string; description: string; dependencies: string[] };

type Pending = { folder: string; inside: string; level: number };

const skipped: readonly string[] = ["node_modules", ".git", ".next", ".expo", "dist", "build", ".bun", ".cache", ".infra"];
const deepest = 64;
const widest = 64;

function home (): string {

    return join(import.meta.dirname, "..", "..", "..");

}
function listed ( folder: string ): Dirent[] | undefined {

    try {

        return readdirSync(folder, { withFileTypes: true });

    } catch ( caught ) {

        if ( isMissing(caught) ) return undefined;

        throw caught;

    }

}
function textAt ( path: string ): string | undefined {

    try {

        return readFileSync(path, "utf8");

    } catch ( caught ) {

        if ( isMissing(caught) ) return undefined;

        throw caught;

    }

}

export function isMissing ( caught: unknown ): boolean {

    const code = typeof caught === "object" && caught !== null && "code" in caught ? caught.code : undefined;

    return code === "ENOENT" || code === "ENOTDIR";

}
export function byText ( left: string, right: string ): number {

    return left < right ? -1 : left > right ? 1 : 0;

}
export function walk ( root: string, options: WalkOptions = {} ): Walked[] {

    const names = new Set<string>(skipped);
    const paths = new Set<string>();
    const found: Walked[] = [];
    const pending: Pending[] = [{ folder: root, inside: "", level: 0 }];
    const { extensions } = options;

    for ( const item of options.ignore ?? [] ) {

        const trimmed = item.replace(/^(?:\.?\/)+|\/+$/g, "");

        if ( trimmed !== "" ) (trimmed.includes("/") ? paths : names).add(trimmed);

    }

    for ( let next = pending.pop(); next; next = pending.pop() ) {

        const { folder, inside, level } = next;

        if ( level > deepest ) throw error.fault("internal", "tool.depth", { message: `${inside}: folders nest too deep` });

        for ( const entry of listed(folder) ?? [] ) {

            const relative = inside === "" ? entry.name : `${inside}/${entry.name}`;

            if ( names.has(entry.name) || paths.has(relative) ) continue;

            const path = join(folder, entry.name);

            if ( entry.isDirectory() ) {

                pending.push({ folder: path, inside: relative, level: level + 1 });

                continue;

            }

            if ( extensions && !extensions.some(( extension ) => entry.name.endsWith(extension)) ) continue;

            const held = statSync(path, { throwIfNoEntry: false });

            if ( held?.isFile() ) found.push({ path, relative, size: held.size });

        }

    }

    return found.sort(( left, right ) => byText(left.relative, right.relative));

}
export function readJson<T = unknown> ( path: string ): T | undefined {

    const read = error.attemptSync(() => textAt(path));

    if ( !read.ok ) throw error.fault("internal", "tool.json", { message: `${path}: not readable`, cause: read.fault.cause });

    const text = read.value;

    if ( text === undefined ) return undefined;

    const parsed = json.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

    if ( parsed === undefined ) throw error.fault("internal", "tool.json", { message: `${path}: not json` });

    return parsed as T;

}
export function writeJson ( path: string, value: unknown ): boolean {

    const made = error.attemptSync(() => JSON.stringify(value, undefined, 2));

    if ( !made.ok || typeof made.value !== "string" ) throw error.fault("internal", "tool.json", { message: `${path}: the value has no json form`, cause: made.ok ? undefined : made.fault.cause });

    const text = `${made.value}\n`;

    if ( textAt(path) === text ) return false;

    const draft = `${path}.${process.pid}.tmp`;

    mkdirSync(dirname(path), { recursive: true });

    try {

        writeFileSync(draft, text);
        renameSync(draft, path);

    } catch ( caught ) {

        rmSync(draft, { force: true });

        throw caught;

    }

    return true;

}
export function digestOf ( content: string | Uint8Array, length = 16 ): string {

    const size = Number.isInteger(length) ? Math.min(Math.max(length, 1), widest) : 16;

    return createHash("sha256").update(content).digest("hex").slice(0, size);

}
export function hashOf ( path: string, length = 16 ): string {

    return digestOf(readFileSync(path), length);

}
export function sizeOf ( root: string, extensions?: readonly string[] ): number {

    let total = 0;

    for ( const file of walk(root, { extensions }) ) total += file.size;

    return total;

}
export function assets ( engine: string = home() ): string {

    return join(engine, "src", "world", "asset");

}
export function members ( engine: string = home() ): Member[] {

    const source = join(engine, "src");
    const found: Member[] = [];

    for ( const entry of listed(source) ?? [] ) {

        if ( !entry.isDirectory() || entry.name === "engine" ) continue;

        const folder = join(source, entry.name);
        const manifest = readJson(join(folder, "package.json"));

        if ( !json.isRecord(manifest) ) continue;

        found.push({ name: entry.name, folder, description: typeof manifest.description === "string" ? manifest.description : "", dependencies: json.isRecord(manifest.dependencies) ? Object.keys(manifest.dependencies) : [] });

    }

    return found.sort(( left, right ) => byText(left.name, right.name));

}
