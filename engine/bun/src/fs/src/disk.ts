import * as crypto from "engine-crypto";
import * as exception from "engine-exception";
import * as json from "engine-json";
import * as list from "engine-list";
import * as string from "engine-string";
import type { Disk, Entry, EntryKind, Glob, MemoryDisk, Prune, Reason, Stat, Step, Walk, Walked } from "./arch.ts";
import { basename, dirname, glob, join, normalize, resolve, safe, segments } from "./path.ts";

const never: Prune = () => false;
const deepest = 128;
const other: Reason = ["internal", "fs.failed"];
const hosts = new Map<string, Reason>([
    ["ENOENT",         ["not_found", "fs.missing"]],
    ["EACCES",         ["forbidden", "fs.denied"]],
    ["EPERM",          ["forbidden", "fs.denied"]],
    ["EROFS",          ["forbidden", "fs.denied"]],
    ["EEXIST",         ["conflict", "fs.exists"]],
    ["ENOTEMPTY",      ["conflict", "fs.exists"]],
    ["EISDIR",         ["conflict", "fs.kind"]],
    ["ENOTDIR",        ["conflict", "fs.kind"]],
    ["ERR_FS_EISDIR",  ["conflict", "fs.kind"]],
    ["ENOSPC",         ["unavailable", "fs.full"]],
    ["EDQUOT",         ["unavailable", "fs.full"]],
    ["EBUSY",          ["locked", "fs.busy"]],
    ["ENAMETOOLONG",   ["validation", "fs.path"]],
]);

export const disk: exception.Slot<Disk> = exception.slot<Disk>("fs.disk");

function fieldOf ( cause: unknown, key: "code" | "path" ): string {

    const found = typeof cause === "object" && cause !== null ? (cause as Record<string, unknown>)[key] : undefined;

    return typeof found === "string" ? found : "";

}
function failed ( cause: unknown, path: string ): exception.Fault {

    if ( exception.isFault(cause) ) return cause;

    const [code, reason] = hosts.get(fieldOf(cause, "code")) ?? other;

    return exception.fault(code, reason, { message: fieldOf(cause, "path") || path, cause });

}
function clean ( path: string ): string {

    if ( typeof path !== "string" || path === "" || path.includes("\u0000") ) throw exception.fault("validation", "fs.path", { message: "not a path" });

    return normalize(path);

}
function rooted ( path: string ): boolean {

    return segments(path).every(( part ) => part === "..");

}
function holds ( base: string, path: string ): boolean {

    return path === base || path.startsWith(base.endsWith("/") ? base : `${base}/`);

}
function alike ( left: Uint8Array, right: Uint8Array ): boolean {

    if ( left.byteLength !== right.byteLength ) return false;

    for ( let index = 0; index < left.byteLength; index += 1 ) if ( left[index] !== right[index] ) return false;

    return true;

}
function byName ( left: Entry, right: Entry ): number {

    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;

}
async function held<T> ( path: string, work: ( target: Disk, at: string ) => Promise<T>, using?: Disk ): Promise<T> {

    const at = clean(path);
    const target = using ?? disk.get();

    return await exception.rescueAsync(async () => {

        return await work(target, at);

    }, ( cause ) => {

        throw failed(cause, at);

    });

}
async function below ( using: Disk, path: string, prefix: string, level: number, prune: Prune ): Promise<Step[]> {

    const out: Step[] = [];

    for ( const entry of await entriesOn(using, path) ) {

        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

        if ( !prune(entry, relative) ) out.push({ entry, relative, level });

    }

    return out.reverse();

}

export function memoryDisk (): MemoryDisk {

    const files = new Map<string, Uint8Array>();
    const folders = new Set<string>(["/"]);
    const stamps = new Map<string, number>();
    let serial = 0;
    const keyOf = ( path: string ): string => resolve("/", path);
    const kindOf = ( key: string ): EntryKind | undefined => (files.has(key) ? "file" : folders.has(key) ? "dir" : undefined);
    const missing = ( key: string ): exception.Fault => exception.fault("not_found", "fs.missing", { message: key });
    const clash = ( key: string, reason = "fs.kind" ): exception.Fault => exception.fault("conflict", reason, { message: key });
    const under = ( key: string ): string[] => [...files.keys(), ...folders].filter(( item ) => item !== key && holds(key, item));
    const drop = ( key: string ): void => {

        files.delete(key);
        folders.delete(key);
        stamps.delete(key);

    };
    const put = ( key: string, bytes?: Uint8Array ): void => {

        if ( bytes ) files.set(key, bytes);
        else folders.add(key);

        stamps.set(key, Date.now());

    };
    const grow = ( key: string ): void => {

        const chain: string[] = [];

        for ( let current = key; !folders.has(current); current = dirname(current) ) {

            if ( files.has(current) ) throw clash(current);

            chain.push(current);

        }

        for ( const made of chain ) put(made);

    };

    return {
        files,
        read: async ( path ) => {

            const key = keyOf(path);
            const found = files.get(key);

            if ( !found ) throw folders.has(key) ? clash(key) : missing(key);

            return found.slice();

        },
        write: async ( path, content, append = false ) => {

            const key = keyOf(path);
            const bytes = typeof content === "string" ? string.bytes(content) : content;
            const previous = append ? files.get(key) : undefined;
            const next = new Uint8Array((previous?.byteLength ?? 0) + bytes.byteLength);

            if ( folders.has(key) ) throw clash(key);

            grow(dirname(key));

            if ( previous ) next.set(previous);

            next.set(bytes, previous?.byteLength ?? 0);
            put(key, next);

        },
        list: async ( path ) => {

            const key = keyOf(path);
            const names = new Set<string>();

            if ( !folders.has(key) ) throw files.has(key) ? clash(key) : missing(key);

            for ( const item of under(key) ) names.add(item.slice(key === "/" ? 1 : key.length + 1).split("/")[0] ?? "");

            return [...names].sort().map(( name ): Entry => ({ name, path: join(key, name), kind: kindOf(join(key, name)) ?? "dir" }));

        },
        stat: async ( path ) => {

            const key = keyOf(path);
            const kind = kindOf(key);

            return kind ? { size: files.get(key)?.byteLength ?? 0, modified: stamps.get(key) ?? 0, kind } : undefined;

        },
        mkdir: async ( path ) => grow(keyOf(path)),
        remove: async ( path, recursive = false ) => {

            const key = keyOf(path);
            const inner = under(key);

            if ( inner.length && !recursive ) throw clash(key, "fs.exists");

            for ( const item of inner ) drop(item);

            if ( key !== "/" ) drop(key);

        },
        rename: async ( from, to ) => {

            const source = keyOf(from);
            const target = keyOf(to);
            const kind = kindOf(source);

            if ( !kind ) throw missing(source);
            if ( source === target ) return;
            if ( holds(source, target) ) throw clash(target, "fs.inside");
            if ( kind === "file" ? folders.has(target) : files.has(target) ) throw clash(target);
            if ( kind === "dir" && under(target).length ) throw clash(target, "fs.exists");

            grow(dirname(target));

            for ( const item of [source, ...under(source)] ) {

                const found = files.get(item);

                drop(item);
                put(target + item.slice(source.length), found);

            }

        },
        copy: async ( from, to ) => {

            const source = keyOf(from);
            const target = keyOf(to);
            const found = files.get(source);

            if ( !found ) throw folders.has(source) ? clash(source) : missing(source);
            if ( folders.has(target) ) throw clash(target);

            grow(dirname(target));
            put(target, found.slice());

        },
        temp: async ( prefix ) => {

            let key = "";

            do {

                serial += 1;
                key = keyOf(`/tmp/${prefix}${serial}`);

            } while ( kindOf(key) );

            grow(key);

            return key;

        },
    };

}
function readOn ( using: Disk, path: string ): Promise<Uint8Array> {

    return held(path, ( target, at ) => target.read(at), using);

}

export async function read ( path: string ): Promise<Uint8Array> {

    return held(path, ( target, at ) => target.read(at));

}

export async function text ( path: string ): Promise<string> {

    return string.utf8(await read(path));

}
export async function lines ( path: string ): Promise<string[]> {

    const found = string.lines(await text(path));

    if ( found[found.length - 1] === "" ) found.pop();

    return found;

}
export async function readJson<T = unknown> ( path: string ): Promise<T> {

    const parsed = json.parse(await text(path));

    if ( parsed === undefined ) throw exception.fault("validation", "fs.json", { message: `${path}: not json` });

    return parsed as T;

}
export async function write ( path: string, content: Uint8Array | string ): Promise<void> {

    await held(path, async ( target, at ) => {

        await target.mkdir(dirname(at));
        await target.write(at, content);

    });

}
export async function append ( path: string, content: Uint8Array | string ): Promise<void> {

    await held(path, async ( target, at ) => {

        await target.mkdir(dirname(at));
        await target.write(at, content, true);

    });

}
function writeAtomicOn ( using: Disk, path: string, content: Uint8Array | string ): Promise<void> {

    return held(path, async ( target, at ) => {

        const draft = join(dirname(at), `.${basename(at)}.${crypto.nonce(6)}.tmp`);

        await target.mkdir(dirname(at));

        await exception.rescueAsync(async () => {

            await target.write(draft, content);
            await target.rename(draft, at);

        }, async ( cause ) => {

            await exception.probeAsync(() => target.remove(draft));

            throw cause;

        });

    }, using);

}

export async function writeAtomic ( path: string, content: Uint8Array | string ): Promise<void> {

    const at = clean(path);

    return writeAtomicOn(disk.get(), at, content);

}

export async function writeJson ( path: string, value: unknown, pretty = true ): Promise<void> {

    await write(path, `${json.stringify(value, { pretty })}\n`);

}
async function updateOn ( using: Disk, path: string, content: Uint8Array | string ): Promise<boolean> {

    const next = typeof content === "string" ? string.bytes(content) : content;
    const found = await statOn(using, path);

    if ( found?.kind === "file" && found.size === next.byteLength && alike(await readOn(using, path), next) ) return false;

    await writeAtomicOn(using, path, next);

    return true;

}

export async function update ( path: string, content: Uint8Array | string ): Promise<boolean> {

    const at = clean(path);

    return updateOn(disk.get(), at, content);

}

async function editOn ( using: Disk, path: string, change: ( text: string ) => string | Promise<string> ): Promise<boolean> {

    return updateOn(using, path, await change((await statOn(using, path))?.kind === "file" ? string.utf8(await readOn(using, path)) : ""));

}

export async function edit ( path: string, change: ( text: string ) => string | Promise<string> ): Promise<boolean> {

    const at = clean(path);

    return editOn(disk.get(), at, change);

}

function statOn ( using: Disk, path: string ): Promise<Stat | undefined> {

    return held(path, ( target, at ) => target.stat(at), using);

}

export async function stat ( path: string ): Promise<Stat | undefined> {

    return held(path, ( target, at ) => target.stat(at));

}

export async function exists ( path: string ): Promise<boolean> {

    return (await stat(path)) !== undefined;

}
export async function isFile ( path: string ): Promise<boolean> {

    return (await stat(path))?.kind === "file";

}
export async function isDir ( path: string ): Promise<boolean> {

    return (await stat(path))?.kind === "dir";

}
function removeOn ( using: Disk, path: string ): Promise<void> {

    return held(path, async ( target, at ) => {

        if ( rooted(at) ) throw exception.fault("forbidden", "fs.root", { message: at });

        await target.remove(at, true);

    }, using);

}

export async function remove ( path: string ): Promise<void> {

    const at = clean(path);

    return removeOn(disk.get(), at);

}

function copyOn ( using: Disk, from: string, to: string ): Promise<void> {

    const source = clean(from);

    return held(to, async ( target, at ) => {

        const found = await target.stat(source);

        if ( !found ) throw exception.fault("not_found", "fs.missing", { message: source });
        if ( source === at ) return;

        if ( found.kind !== "dir" ) {

            await target.mkdir(dirname(at));
            await target.copy(source, at);

            return;

        }

        if ( holds(source, at) ) throw exception.fault("conflict", "fs.inside", { message: at });

        const tree = await walkOn(using, source);

        await target.mkdir(at);

        for ( const entry of tree ) {

            if ( entry.kind === "dir" ) await target.mkdir(join(at, entry.relative));
            else await target.copy(entry.path, join(at, entry.relative));

        }

    }, using);

}

export async function copy ( from: string, to: string ): Promise<void> {

    const source = clean(from);
    const target = clean(to);

    return copyOn(disk.get(), source, target);

}

function moveOn ( using: Disk, from: string, to: string ): Promise<void> {

    const source = clean(from);

    return held(to, async ( target, at ) => {

        if ( rooted(source) ) throw exception.fault("forbidden", "fs.root", { message: source });

        const found = await target.stat(source);

        if ( !found ) throw exception.fault("not_found", "fs.missing", { message: source });
        if ( found.kind === "dir" && source !== at && holds(source, at) ) throw exception.fault("conflict", "fs.inside", { message: at });

        await target.mkdir(dirname(at));

        await exception.rescueAsync(async () => {

            await target.rename(source, at);

        }, async ( cause ) => {

            if ( fieldOf(cause, "code") !== "EXDEV" ) throw cause;

            await copyOn(using, source, at);
            await target.remove(source, true);

        });

    }, using);

}

export async function move ( from: string, to: string ): Promise<void> {

    const source = clean(from);
    const target = clean(to);

    return moveOn(disk.get(), source, target);

}

export async function ensure ( path: string ): Promise<string> {

    return held(path, async ( target, at ) => {

        await target.mkdir(at);

        return at;

    });

}
export async function empty ( path: string ): Promise<void> {

    await held(path, async ( target, at ) => {

        const found = await target.stat(at);

        if ( rooted(at) ) throw exception.fault("forbidden", "fs.root", { message: at });
        if ( found && found.kind !== "dir" ) throw exception.fault("conflict", "fs.kind", { message: at });

        if ( found ) for ( const entry of await target.list(at) ) await target.remove(join(at, entry.name), true);
        else await target.mkdir(at);

    });

}
async function tempOn ( using: Disk, prefix = "engine-" ): Promise<string> {

    const name = safe(prefix, "engine-", 64);

    return await exception.rescueAsync(async () => {

        return await using.temp(name);

    }, ( cause ) => {

        throw failed(cause, name);

    });

}

export async function temp ( prefix = "engine-" ): Promise<string> {

    return tempOn(disk.get(), prefix);

}

async function withTempOn<T> ( using: Disk, work: ( path: string ) => T | Promise<T>, prefix = "engine-" ): Promise<T> {

    const path = await tempOn(using, prefix);

    return await exception.rescueAsync(async () => {

        const out = await work(path);

        await removeOn(using, path);

        return out;

    }, async ( cause ) => {

        await exception.probeAsync(() => removeOn(using, path));

        throw cause;

    });

}

export async function withTemp<T> ( work: ( path: string ) => T | Promise<T>, prefix = "engine-" ): Promise<T> {

    return withTempOn(disk.get(), work, prefix);

}

function entriesOn ( using: Disk, path: string ): Promise<Entry[]> {

    return held(path, async ( target, at ) => (await target.list(at)).map(( entry ): Entry => ({ name: entry.name, path: join(at, entry.name), kind: entry.kind })).sort(byName), using);

}

export async function entries ( path: string ): Promise<Entry[]> {

    const at = clean(path);

    return entriesOn(disk.get(), at);

}

async function walkOn ( using: Disk, path: string, options: Prune | Walk = {} ): Promise<Walked[]> {

    const given: Walk = typeof options === "function" ? { prune: options } : options;
    const { prune = never, depth = deepest } = given;
    const found: Walked[] = [];
    const stack = await below(using, path, "", 1, prune);

    for ( let step = stack.pop(); step; step = stack.pop() ) {

        found.push({ ...step.entry, relative: step.relative });

        if ( step.entry.kind === "dir" && step.level < depth ) for ( const next of await below(using, step.entry.path, step.relative, step.level + 1, prune) ) stack.push(next);

    }

    return found;

}

export async function walk ( path: string, options: Prune | Walk = {} ): Promise<Walked[]> {

    const at = clean(path);

    return walkOn(disk.get(), at, options);

}

export async function files ( path: string, options: Prune | Walk = {} ): Promise<Walked[]> {

    return (await walk(path, options)).filter(( entry ) => entry.kind === "file");

}
export async function find ( path: string, pattern: string | readonly string[], options: Prune | (Walk & Glob) = {} ): Promise<Walked[]> {

    const wanted = glob(pattern, typeof options === "function" ? {} : options);

    return (await files(path, options)).filter(( entry ) => wanted(entry.relative));

}
async function sizeOn ( using: Disk, path: string ): Promise<number> {

    const found = await statOn(using, path);

    if ( !found ) throw exception.fault("not_found", "fs.missing", { message: path });
    if ( found.kind !== "dir" ) return found.size;

    const sizes = await list.mapAsync((await walkOn(using, path)).filter(( entry ) => entry.kind === "file"), async ( entry ) => (await statOn(using, entry.path))?.size ?? 0, { lanes: 8 });

    return sizes.reduce(( total, next ) => total + next, 0);

}

export async function size ( path: string ): Promise<number> {

    const at = clean(path);

    return sizeOn(disk.get(), at);

}

export async function digest ( path: string, algorithm: crypto.Algorithm = "SHA-256" ): Promise<string> {

    return crypto.hash(await read(path), algorithm);

}
async function sameOn ( using: Disk, left: string, right: string ): Promise<boolean> {

    const [a, b] = await Promise.all([statOn(using, left), statOn(using, right)]);

    if ( !a || !b || a.kind === "dir" || b.kind === "dir" || a.size !== b.size ) return false;

    const [x, y] = await Promise.all([readOn(using, left), readOn(using, right)]);

    return alike(x, y);

}

export async function same ( left: string, right: string ): Promise<boolean> {

    const first = clean(left);
    const second = clean(right);

    return sameOn(disk.get(), first, second);

}
