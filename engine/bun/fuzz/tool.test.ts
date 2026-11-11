import { describe, expect, test as it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as stage from "engine/test";
import * as tool from "engine/tool";
import * as fc from "fast-check";

const name = fc.stringMatching(/^[a-z]{1,3}$/);
const surface = fc.dictionary(name, fc.uniqueArray(name, { maxLength: 5 }), { maxKeys: 5 });

function rings ( size: number, edges: ReadonlySet<string> ): string[][] {

    const reach = Array.from({ length: size }, ( _, from ) => Array.from({ length: size }, ( _, to ) => from !== to && edges.has(`${from}>${to}`)));

    for ( let middle = 0; middle < size; middle += 1 ) for ( let from = 0; from < size; from += 1 ) for ( let to = 0; to < size; to += 1 ) if ( reach[from]?.[middle] && reach[middle]?.[to] ) (reach[from] as boolean[])[to] = true;

    const seen = new Set<number>();
    const found: string[][] = [];

    for ( let node = 0; node < size; node += 1 ) {

        if ( seen.has(node) ) continue;

        const ring = [node, ...Array.from({ length: size }, ( _, other ) => other).filter(( other ) => other !== node && reach[node]?.[other] && reach[other]?.[node])];

        for ( const member of ring ) seen.add(member);

        if ( ring.length > 1 ) found.push(ring.map(( member ) => `api/f${member}.ts`).sort());

    }

    return found.sort(( left, right ) => ((left[0] ?? "") < (right[0] ?? "") ? -1 : 1));

}

describe("fuzz tool", () => {

    it("an api diff is exactly the set difference of the dotted names, and its kind follows removals then additions", () => {

        fc.assert(fc.property(surface, surface, ( before, after ) => {

            const was = new Set(Object.entries(before).flatMap(([member, list]) => list.map(( item ) => `${member}.${item}`)));
            const now = new Set(Object.entries(after).flatMap(([member, list]) => list.map(( item ) => `${member}.${item}`)));
            const change = tool.apiDiff(before, after);

            expect(change.added).toEqual([...now].filter(( item ) => !was.has(item)).sort());
            expect(change.removed).toEqual([...was].filter(( item ) => !now.has(item)).sort());
            expect(change.kind).toBe(change.removed.length ? "major" : change.added.length ? "minor" : "none");
            expect(tool.apiDiff(after, before).added).toEqual(change.removed);
            expect(tool.describeChange(change, []).split("\n")).toHaveLength(1 + change.added.length + change.removed.length);

        }), { numRuns: 3000 });

    });
    it("growth names only members sized on both sides that changed, sorted by the size of the change then the name", () => {

        const sizes = fc.dictionary(name, fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null }), { maxKeys: 8 });

        fc.assert(fc.property(sizes, sizes, ( before, after ) => {

            const grown = tool.sizeDiff(before, after);

            for ( const growth of grown ) expect<unknown[]>([growth.before, growth.after, growth.delta]).toEqual([before[growth.member], after[growth.member], (after[growth.member] as number) - (before[growth.member] as number)]);

            expect(grown.map(( growth ) => growth.member).sort()).toEqual(Object.keys(after).filter(( member ) => typeof after[member] === "number" && typeof before[member] === "number" && Object.hasOwn(before, member) && after[member] !== before[member]).sort());
            expect(grown.every(( growth, at ) => at === 0 || Math.abs((grown[at - 1] as tool.Growth).delta) > Math.abs(growth.delta) || (Math.abs((grown[at - 1] as tool.Growth).delta) === Math.abs(growth.delta) && (grown[at - 1] as tool.Growth).member < growth.member))).toBe(true);

        }), { numRuns: 3000 });

    });
    it("digests are deterministic, clamp their length and shorten by prefix", () => {

        fc.assert(fc.property(fc.string({ maxLength: 64 }), fc.integer({ min: -5, max: 80 }), ( text, length ) => {

            const made = tool.digestOf(text, length);

            expect(made.length).toBe(Math.min(Math.max(length, 1), 64));
            expect(tool.digestOf(text, 64).startsWith(made)).toBe(true);
            expect(tool.digestOf(new TextEncoder().encode(text), length)).toBe(made);

        }), { numRuns: 2000 });

    });
    it("the analyzer finds exactly the import cycles of a value graph, ignores type edges, and reports runtime imports on their true lines while skipping commented ones", () => {

        const temp = stage.tmp("engine-tool-fuzz-");
        const src = join(temp.path, "src");
        const graph = fc.integer({ min: 1, max: 6 }).chain(( size ) => fc.tuple(fc.constant(size), fc.uniqueArray(fc.tuple(fc.integer({ min: 0, max: size - 1 }), fc.integer({ min: 0, max: size - 1 }), fc.boolean()), { maxLength: 12, selector: ([from, to]) => `${from}>${to}` }), fc.array(fc.constantFrom("code", "comment", "block", "runtime", "hidden"), { maxLength: 6 })));

        try {

            fc.assert(fc.property(graph, ([size, links, noise]) => {

                rmSync(src, { recursive: true, force: true });
                mkdirSync(join(src, "api"), { recursive: true });

                const values = new Set<string>();
                const expected: number[] = [];

                for ( let node = 0; node < size; node += 1 ) {

                    const lines: string[] = [];

                    for ( const [from, to, typed] of links ) {

                        if ( from !== node ) continue;

                        lines.push(`import ${typed ? "type " : ""}{ v${to} } from "./f${to}.ts";`);

                        if ( !typed && from !== to ) values.add(`${from}>${to}`);

                    }

                    if ( node === 0 ) {

                        for ( const kind of noise ) {

                            if ( kind === "code" ) lines.push("export const x = 1;");
                            else if ( kind === "comment" ) lines.push('// import gone from "node:os";');
                            else if ( kind === "block" ) lines.push("/*", 'import gone from "node:path";', "*/");
                            else if ( kind === "hidden" ) lines.push('   // const late = await import("node:zlib");');
                            else {

                                lines.push('import { readFileSync } from "node:fs";');
                                expected.push(lines.length);

                            }

                        }

                    }

                    lines.push(`export const v${node} = ${node};`);
                    writeFileSync(join(src, "api", `f${node}.ts`), `${lines.join("\n")}\n`);

                }

                const result = tool.analyze({ root: temp.path, layers: ["api"] });

                expect(result.cycles).toEqual(rings(size, values));
                expect(result.issues.filter(( issue ) => issue.rule === "runtime").map(( issue ) => `${issue.file}:${issue.line}`)).toEqual(expected.map(( line ) => `api/f0.ts:${line}`));
                expect(result.issues.filter(( issue ) => issue.rule !== "runtime")).toEqual([]);

            }), { numRuns: 150 });

        } finally {

            temp.remove();

        }

    });

});
