import { describe, expect, test as it } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { closureOf } from "./record.ts";
import recorded from "./size.json" with { type: "json" };

const budgets = recorded as Record<string, number | null>;
const members = readdirSync(resolve(import.meta.dir, "..", "src"), { withFileTypes: true }).filter(( entry ) => entry.isDirectory() && entry.name !== "engine").map(( entry ) => entry.name).sort();
const shape = '({ name: door.string().check(door.minLength(1), door.maxLength(80)), age: door.number(), kind: door.optional(door.enum(["a", "b"])) })';
const given = 'JSON.parse(globalThis.name || "{}")';

async function weigh ( text: string ): Promise<number> {

    const entry = resolve(import.meta.dir, "typical.entry.ts");
    const built = await Bun.build({ entrypoints: [entry], files: { [entry]: text }, target: "browser", minify: true, throw: false });

    if ( !built.success ) throw new Error(built.logs.map(( log ) => log.message).join("; "));

    return built.outputs.reduce(( sum, output ) => sum + output.size, 0);

}

describe("size", () => {

    it("every member has a recorded browser closure budget", () => {

        expect(Object.keys(budgets).sort()).toEqual(members);

    });
    it("no member's minified browser closure grew past its record", async () => {

        const grown: string[] = [];

        for ( const [member, budget] of Object.entries(budgets) ) {

            if ( budget === null ) continue;

            const size = await closureOf(member);

            if ( size > budget ) grown.push(`${member}: ${size} > ${budget} (record it: bun run record)`);

        }

        expect(grown).toEqual([]);

    });
    it("a typical schema checked through validate ships within 20 KB, and the door adds nothing to zod", async () => {

        const direct = await weigh(`import * as door from "zod/mini";\nconsole.log(door.object${shape}.safeParse(${given}));\n`);
        const through = await weigh(`import * as door from "engine-validate";\nconsole.log(door.object${shape}.safeParse(${given}));\n`);
        const checked = await weigh(`import * as door from "engine-validate";\nconsole.log(door.check(door.object${shape}, ${given}));\n`);

        expect(through - direct).toBeLessThanOrEqual(64);
        expect(checked).toBeLessThanOrEqual(20_000);
        expect(checked).toBeGreaterThan(direct);

    });
    it("compile costs nothing until it is called, and its whole compiler within 56 KB when it is", async () => {

        const checked = await weigh(`import * as door from "engine-validate";\nconsole.log(door.check(door.object${shape}, ${given}));\n`);
        const compiled = await weigh(`import * as door from "engine-validate";\nconsole.log(door.check(door.compile(door.object${shape}), ${given}));\n`);

        expect(checked).toBeLessThanOrEqual(20_000);
        expect(compiled).toBeGreaterThan(checked);
        expect(compiled).toBeLessThanOrEqual(56_000);

    });

});
