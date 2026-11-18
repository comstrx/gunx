import { expect, test as it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

it("an omitted catalog refuses explicitly and never becomes ready as an empty catalog", async () => {

    const folder = mkdtempSync(join(tmpdir(), "world-omitted-"));

    try {

        const built = await Bun.build({
            entrypoints: [fileURLToPath(import.meta.resolve("engine/world"))],
            outdir: folder,
            target: "bun",
            plugins: [{
                name: "omitted-catalog",
                setup ( bundle ) {

                    bundle.onLoad({ filter: /[/]world[/]data[/](countries|currencies|languages|emojis)\.json$/ }, () => ({ contents: "[]", loader: "json" }));

                },
            }],
        });

        expect(built.success, String(built.logs)).toBe(true);

        const child = Bun.spawn([process.execPath, "--eval", [
            "const world = await import(" + JSON.stringify(built.outputs[0]?.path) + ");",
            "const out = [];",
            "for (const name of ['countries', 'currencies', 'languages', 'emoji']) {",
            "const reasons = [];",
            "for (let at = 0; at < 2; at += 1) reasons.push(await world.load(name).then(() => 'resolved', cause => cause.reason));",
            "out.push([name, reasons, world.loaded(name)]);",
            "}",
            "console.log(JSON.stringify(out));",
        ].join("\n")], { stdout: "pipe", stderr: "pipe" });
        const output = await new Response(child.stdout).text();
        const failure = await new Response(child.stderr).text();

        expect(await child.exited, failure).toBe(0);
        expect(JSON.parse(output)).toEqual(["countries", "currencies", "languages", "emoji"].map(( name ) => [name, ["world.refused", "world.refused"], false]));

    } finally {

        rmSync(folder, { recursive: true, force: true });

    }

});
