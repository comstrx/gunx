import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve, sep } from "node:path";
import * as error from "engine-error";
import * as fs from "engine-fs";
import { byText, isMissing } from "./core.ts";

type Kinded = { isFile: () => boolean; isDirectory: () => boolean; isSymbolicLink: () => boolean };

const unsafe = /[^A-Za-z0-9._-]/g;

function kindOf ( found: Kinded ): fs.EntryKind {

    return found.isFile() ? "file" : found.isDirectory() ? "dir" : found.isSymbolicLink() ? "link" : "other";

}
function guarded ( path: string ): string {

    const full = typeof path === "string" && path !== "" && !path.includes("\u0000") ? resolve(path) : "";
    const here = process.cwd();

    if ( full === "" ) throw error.fault("validation", "fs.path", { message: "not a path" });
    if ( full === parse(full).root || here === full || here.startsWith(full.endsWith(sep) ? full : `${full}${sep}`) ) throw error.fault("forbidden", "fs.root", { message: full });

    return full;

}

export function nodeDisk (): fs.Disk {

    return {
        read: async ( path ) => {

            const found = await readFile(path);

            return found.byteOffset === 0 && found.byteLength === found.buffer.byteLength ? new Uint8Array(found.buffer) : new Uint8Array(found);

        },
        write: async ( path, content, append = false ) => {

            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, content, append ? { flag: "a" } : {});

        },
        list: async ( path ) => {

            const found = await readdir(path, { withFileTypes: true });

            return found.map(( entry ) => ({ name: entry.name, path: join(path, entry.name), kind: kindOf(entry) })).sort(( left, right ) => byText(left.name, right.name));

        },
        stat: async ( path ) => {

            try {

                const found = await stat(path);

                return { size: found.size, modified: found.mtimeMs, kind: kindOf(found) };

            } catch ( caught ) {

                if ( isMissing(caught) ) return undefined;

                throw caught;

            }

        },
        mkdir: async ( path ) => {

            await mkdir(path, { recursive: true });

        },
        remove: async ( path, recursive = false ) => {

            await rm(guarded(path), { recursive, force: true });

        },
        rename: ( from, to ) => rename(from, to),
        copy: ( from, to ) => copyFile(from, to),
        temp: ( prefix ) => mkdtemp(`${tmpdir()}${sep}${String(prefix).replace(unsafe, "").slice(0, 64) || "tmp-"}`),
    };

}
export function bindDisk (): () => void {

    return fs.disk.use(nodeDisk());

}
