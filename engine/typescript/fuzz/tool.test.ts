import { describe, expect, test as it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as stage from "engine/test";
import * as tool from "engine/tool";
import * as fc from "fast-check";


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
    it("render carries every given value escaped in its own place and never expands what a value carries; a csp always names the api's origin and its socket", () => {

        fc.assert(fc.property(fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/), fc.string(), { minKeys: 1, maxKeys: 6 }), ( values ) => {

            const template = Object.keys(values).map(( key ) => `<i>{{${key}}}</i>`).join("");
            const filled = tool.render(template, values);
            const inner = filled.replace(/<\/?i>/g, "");

            expect(filled).toBe(Object.keys(values).map(( key ) => `<i>${Bun.escapeHTML(values[key] ?? "")}</i>`).join(""));
            expect(/[<>"']/.test(inner)).toBe(false);

        }));
        fc.assert(fc.property(fc.constantFrom("http", "https"), fc.stringMatching(/^[a-z]{1,10}\.test$/), fc.integer({ min: 1, max: 65535 }), ( scheme, host, port ) => {

            const policy = tool.csp(`${scheme}://${host}:${port}/v1`);
            const origin = new URL(`${scheme}://${host}:${port}`).origin;

            expect(policy).toContain(`connect-src 'self' ${origin} ${origin.replace(/^http/, "ws")}`);

        }));

    });

});
