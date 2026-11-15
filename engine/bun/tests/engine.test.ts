import { describe, expect, test as it } from "bun:test";
import { resolve } from "node:path";
import * as engine from "engine";
import * as disk from "engine/fs";
import * as ranking from "engine/list";

describe("engine composition", () => {

    it("the facade and member doors share one port while composed work retains its adapter", async () => {

        const original = disk.disk.peek();
        const first = disk.memoryDisk();
        const second = disk.memoryDisk();
        const values = [{ id: "a", score: 2 }, { id: "b", score: 1 }, { id: "c", score: 1 }];

        expect(engine.fs.disk).toBe(disk.disk);
        expect(engine.list.best).toBe(ranking.best);

        await disk.disk.with(first, async () => {

            await engine.fs.writeJson("/ranked.json", engine.list.best(values, ( a, b ) => a.score - b.score, 2));

            const changed = await engine.fs.edit("/ranked.json", async ( text ) => {

                await disk.disk.with(second, async () => {

                    await disk.writeJson("/ranked.json", ["independent"]);
                    expect(await engine.fs.readJson("/ranked.json")).toEqual(["independent"]);

                });

                return text;

            });

            expect(changed).toBe(false);
            expect(await disk.readJson("/ranked.json")).toEqual([values[1], values[2]]);

        });

        expect(disk.disk.peek()).toBe(original);
        expect(first.files.size).toBe(1);
        expect(second.files.size).toBe(1);
        expect(values.map(( row ) => row.id)).toEqual(["a", "b", "c"]);

    });
    it("the complete browser facade excludes hosted tooling while retaining portable namespaces", async () => {

        const entry = resolve(import.meta.dir, "facade.runtime.entry.ts");
        const built = await Bun.build({
            entrypoints: [entry],
            files: { [entry]: 'import * as engine from "engine"; globalThis.runtimeEngine = engine;' },
            target: "browser",
            minify: true,
            splitting: true,
            throw: false,
        });

        expect(built.success, built.logs.map(( log ) => log.message).join("; ")).toBe(true);

        const texts = await Promise.all(built.outputs.map(( output ) => output.text()));
        const body = texts.join("\n");

        expect(body.includes("bun:jsc") || body.includes("node:fs") || body.includes("node:child_process")).toBe(false);
        expect(Object.hasOwn(engine, "test") && Object.hasOwn(engine, "tool")).toBe(true);

        const path = resolve(import.meta.dir, "../src/engine/src/runtime.ts");
        const portable: Record<string, unknown> = await import(path);

        expect(Object.keys(portable).sort()).toEqual(Object.keys(engine).filter(( name ) => name !== "test" && name !== "tool").sort());

    });
    it("state consumers resolve without a renderer dependency and refuse an unbound hook explicitly", async () => {

        const entry = resolve(import.meta.dir, "headless.entry.ts");
        const built = await Bun.build({
            entrypoints: [entry],
            files: { [entry]: 'import * as state from "engine/state"; import * as auth from "engine/auth"; import * as form from "engine/form"; import * as spec from "engine/spec"; globalThis.headless = {state,auth,form,spec};' },
            target: "browser",
            minify: true,
            splitting: true,
            plugins: [{
                name: "headless",
                setup ( build ) {

                    build.onResolve({ filter: /^react(?:[/]|$)/ }, () => { throw new Error("renderer leaked into portable capabilities"); });

                },
            }],
            throw: false,
        });

        expect(built.success, built.logs.map(( log ) => log.message).join("; ")).toBe(true);

        const bound = engine.state.bind({ get: () => 7, watch: () => () => undefined });

        expect(bound.select(( value ) => value)).toBe(7);
        expect(() => bound.useState()).toThrow("a state binding needs a surface renderer");

    });
    it("a selected facade capability ships the same browser code as its member door", async () => {

        const entry = resolve(import.meta.dir, "facade.entry.ts");
        const body = 'console.log(list.best(JSON.parse(globalThis.name || "[]"), ( a, b ) => a - b, 3));';
        const sizes: number[] = [];

        for ( const head of ['import { list } from "engine";', 'import * as list from "engine/list";'] ) {

            const built = await Bun.build({
                entrypoints: [entry],
                files: { [entry]: head + body },
                target: "browser",
                minify: true,
                throw: false,
            });

            expect(built.success, built.logs.map(( log ) => log.message).join("; ")).toBe(true);
            expect(built.outputs.length).toBe(1);
            sizes.push(built.outputs.reduce(( sum, output ) => sum + output.size, 0));

        }

        expect(sizes[0]).toBe(sizes[1]);
        expect(sizes[0]).toBeLessThan(2000);

    });

});
