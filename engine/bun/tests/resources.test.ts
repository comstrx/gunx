import { expect, test as it } from "bun:test";

it("pretty cyclic serialization stays below an isolated 512 MiB RSS ceiling", async () => {

    const entry = JSON.stringify(import.meta.resolve("engine/json"));
    const code = `import * as json from ${entry}; const value = { id: 1 }; value.self = value; const text = json.stringify(value, { pretty: true }); console.log(JSON.stringify({ text, rss: process.memoryUsage().rss }));`;
    const child = Bun.spawn([process.execPath, "--eval", code], { stdout: "pipe", stderr: "pipe" });
    const [output, failure, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);

    expect(status, failure).toBe(0);

    const measured = JSON.parse(output) as { text: string; rss: number };

    expect(JSON.parse(measured.text)).toEqual({ id: 1, self: "[Circular]" });
    expect(measured.rss).toBeGreaterThan(0);
    expect(measured.rss).toBeLessThan(512 * 1024 * 1024);

});
