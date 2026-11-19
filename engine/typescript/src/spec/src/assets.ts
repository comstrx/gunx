import * as exception from "engine-exception";
import * as json from "engine-json";
import type { Assets, Placed } from "./arch.ts";

const extension = /\.[A-Za-z0-9]+$/;

function refused ( message: string ): exception.Fault {

    return exception.fault("internal", "spec.assets", { message });

}
function walked ( table: unknown, trail: readonly string[], into: Map<string, { trail: readonly string[]; file: string }> ): void {

    const at = trail.join(".");

    if ( typeof table === "string" ) {

        if ( table === "" || table.split("/").includes("..") || table.startsWith("/") ) throw refused(`${at}: a file is a path inside its folder, such as images/logo.svg`);

        into.set(at, { trail, file: table });

        return;

    }

    if ( !json.isRecord(table) ) throw refused(`${at}: a table of names and files, such as { logo: "images/logo.svg" }`);

    for ( const [name, value] of Object.entries(table) ) {

        if ( !json.safeKey(name) || name === "" || name.includes("/") ) throw refused(`${at}.${name}: a plain name`);

        walked(value, [...trail, name], into);

    }

}
function leaves ( given: Assets ): Map<string, { trail: readonly string[]; file: string }> {

    const { home: _home, ...tables } = given;
    const into = new Map<string, { trail: readonly string[]; file: string }>();

    walked(tables, [], into);

    return into;

}

export function assets ( given: unknown, at = "assets" ): Assets {

    if ( given === undefined ) return Object.freeze({});
    if ( !json.isRecord(given) ) throw refused(`${at}: the files a role or the seeds offer, such as { home: import.meta.dirname, images: { logo: "images/logo.svg" } }`);
    if ( given.home !== undefined && (typeof given.home !== "string" || given.home === "") ) throw refused(`${at}.home: the folder that holds these files, such as import.meta.dirname`);

    const named = leaves(given);

    if ( named.size > 0 && given.home === undefined ) throw refused(`${at}.home: name the folder of these files, such as import.meta.dirname`);

    return Object.freeze({ ...given });

}
export function filed ( layers: readonly { readonly given: Assets; readonly at: string }[], id: string, served = "" ): { files: Placed[]; urls: Record<string, string> } {

    const chosen = new Map<string, { from: string; at: string; trail: readonly string[] }>();

    for ( const { given, at } of layers ) {

        const home = typeof given.home === "string" ? given.home.replace(/\/+$/, "") : "";

        for ( const [key, { trail, file }] of leaves(given) ) chosen.set(key, { from: `${home}/${file}`, at: `${at}.${key}`, trail });

    }

    const files: Placed[] = [...chosen].map(([key, { from, at, trail }]) => {

        const parts = [...trail];
        const name = parts.at(-1) ?? key;
        const kept = extension.test(name) ? "" : (extension.exec(from)?.[0] ?? "");

        return { key, from, at, to: [...parts.slice(0, -1), `${name}${kept}`].join("/") };

    });
    const urls = Object.fromEntries(files.map(( file ) => [file.key, `${served.replace(/\/+$/, "")}/${id}/${file.to}`]));

    return { files, urls };

}
