import { byText } from "./core.ts";

export type Surface = Readonly<Record<string, readonly string[]>>;
export type Sizes = Readonly<Record<string, number | null>>;
export type Change = { kind: "none" | "minor" | "major"; added: string[]; removed: string[] };
export type Growth = { member: string; before: number; after: number; delta: number };

function names ( surface: Surface ): Set<string> {

    const found = new Set<string>();

    for ( const member of Object.keys(surface) ) {

        const list: unknown = surface[member];

        if ( !Array.isArray(list) ) continue;

        for ( const name of list ) {

            if ( typeof name === "string" ) found.add(`${member}.${name}`);

        }

    }

    return found;

}

export function apiDiff ( before: Surface, after: Surface ): Change {

    const was = names(before);
    const now = names(after);
    const added = [...now].filter(( name ) => !was.has(name)).sort(byText);
    const removed = [...was].filter(( name ) => !now.has(name)).sort(byText);

    return { kind: removed.length ? "major" : added.length ? "minor" : "none", added, removed };

}
export function sizeDiff ( before: Sizes, after: Sizes ): Growth[] {

    const grown: Growth[] = [];

    for ( const member of Object.keys(after) ) {

        const size = after[member];
        const was = Object.hasOwn(before, member) ? before[member] : undefined;

        if ( typeof size !== "number" || typeof was !== "number" || size === was ) continue;

        grown.push({ member, before: was, after: size, delta: size - was });

    }

    return grown.sort(( left, right ) => Math.abs(right.delta) - Math.abs(left.delta) || byText(left.member, right.member));

}
export function describeChange ( change: Change, growth: readonly Growth[] ): string {

    const lines = [`api: ${change.kind}`];

    for ( const name of change.removed ) lines.push(`- ${name}`);

    for ( const name of change.added ) lines.push(`+ ${name}`);

    for ( const { member, before, after, delta } of growth ) lines.push(`${delta > 0 ? "↑" : "↓"} ${member} ${before} → ${after} (${delta > 0 ? "+" : ""}${delta})`);

    return lines.join("\n");

}
