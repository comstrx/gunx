import { describe, expect, test as it } from "bun:test";
import * as stage from "engine/test";
import * as tool from "engine/tool";

function reasonOf ( run: () => unknown ): string {

    try {

        run();

        return "ok";

    } catch ( caught ) {

        return ( caught as { reason?: string } ).reason ?? "thrown";

    }

}
function staged (): ReturnType<typeof stage.tmp> {

    const temp = stage.tmp();

    temp.write("dist/app.js", `${"a".repeat(1199)}\n`);
    temp.write("dist/chunks/one.js", "one\ntwo\nthree");
    temp.write("dist/chunks/two.js", "");
    temp.write("dist/theme.css", "b".repeat(300));
    temp.write("node_modules/pkg/index.js", "vendored\n");

    return temp;

}

describe("tool budget", () => {

    it("measure reads the size, lines and optional gzip of every file a glob matches, once, without node_modules unless named", () => {

        const temp = staged();

        try {

            const measured = tool.measure(temp.path, ["dist/**/*.js", "dist/*.js", "**/*.js"]);

            expect(measured.map(( file ) => [file.path, file.size, file.lines, file.gzip])).toEqual([["dist/app.js", 1200, 1, 0], ["dist/chunks/one.js", 13, 3, 0], ["dist/chunks/two.js", 0, 0, 0]]);
            expect(tool.measure(temp.path, "node_modules/**/*.js").map(( file ) => file.path)).toEqual(["node_modules/pkg/index.js"]);
            expect(tool.measure(temp.path, "dist/app.js", true)[0]?.gzip).toBeGreaterThan(0);
            expect(tool.measure(temp.path, "dist/app.js", true)[0]?.gzip).toBeLessThan(100);

        } finally {

            temp.remove();

        }

    });
    it("a budget reports what it measures and flags each limit it crosses: the total, gzip, any one file's size and lines", async () => {

        const temp = staged();
        const lines: string[] = [];

        try {

            const project = tool.define({ tasks: {
                report: tool.budget({ js: "dist/**/*.js", css: ["dist/*.css"] }),
                fits: tool.budget({ all: { files: ["dist/**/*.js", "dist/*.css"], total: "1.6 kB", each: 1200, gzip: "1 KiB", lines: 3 } }),
                over: tool.budget({ js: { files: "dist/**/*.js", total: "1 kB", each: "1 kB", gzip: 20, lines: 2 } }),
                none: tool.budget({ none: { files: "build/**/*.js", total: 1 } }),
            } });
            const play = ( task: string ): Promise<tool.Outcome> => tool.play(project, [task], { root: temp.path, out: ( line ) => lines.push(line) });

            expect((await play("report")).failed).toBe(false);
            expect(lines).toContain("  js: 3 files, 1.2 kB");
            expect(lines).toContain("  css: 1 file, 300 B");
            expect((await play("fits")).failed).toBe(false);
            expect(lines.some(( line ) => line.startsWith("  all: 4 files, 1.5 kB of 1.6 kB, gzip ") && line.endsWith("of 1 kB, largest dist/app.js 1.2 kB of 1.2 kB, longest dist/chunks/one.js 3 of 3 lines"))).toBe(true);

            const over = await play("over");

            expect(over.flagged.map(( one ) => `${one.rule} ${one.where}`)).toEqual(["budget.total js", "budget.gzip js", "budget.each dist/app.js", "budget.lines dist/chunks/one.js"]);
            expect([over.failed, over.flagged[0]?.message, over.flagged[2]?.message, over.flagged[3]?.message]).toEqual([true, "1.2 kB is 213 B over 1 kB", "1.2 kB is over 1 kB a file", "3 lines, over 2 a file"]);

            const none = await play("none");

            expect([none.failed, none.flagged[0]?.where, none.flagged[0]?.message]).toEqual([true, "none", "build/**/*.js matches no file"]);

        } finally {

            temp.remove();

        }

    });
    it("a budget refuses a glob, a size or a limit it cannot read", () => {

        expect([
            () => tool.budget({}),
            () => tool.budget({ js: [] }),
            () => tool.budget({ js: " " }),
            () => tool.budget({ "two words": "dist/**" }),
            () => tool.budget({ js: { files: "dist/**", total: "lots" } }),
            () => tool.budget({ js: { files: "dist/**", each: -1 } }),
            () => tool.budget({ js: { files: "dist/**", gzip: "2 parsecs" } }),
            () => tool.budget({ js: { files: "dist/**", lines: 1.5 } }),
            () => tool.budget({ js: { files: "dist/**", totl: 1 } as never }),
            () => tool.budget({ js: { files: "dist/**", total: "3.5 MB", each: "1 MiB", gzip: "800kb", lines: 400 } }),
        ].map(reasonOf)).toEqual(["tool.budget", "tool.budget", "tool.budget", "tool.budget", "tool.budget", "tool.budget", "tool.budget", "tool.budget", "tool.budget", "ok"]);

    });

});
