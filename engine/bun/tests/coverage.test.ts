import { expect, test as it } from "bun:test";
import { inspect, inventory } from "./coverage.ts";

const name = "src/sample/src/work.ts";
const good = `SF:${name}\nLF:10\nLH:10\nFNF:2\nFNH:2\nend_of_record\n`;

it("coverage refuses empty, truncated, duplicated, impossible and omitted-source reports", () => {

    expect(inspect(good, [name]).failed).toBe(false);

    for ( const report of ["", good.replace("end_of_record\n", ""), good + good, good.replace("FNH:2", "FNH:3"), good.replace("LH:10", "LH:-1"), good.replace("LF:10\n", ""), good.replace("LF:10", "LF:NaN"), good.replace("LH:10", "LH:6")] ) expect(inspect(report, [name]).failed).toBe(true);

    expect(inspect(good, [name, "src/sample/src/missing.ts"]).issues).toContain("missing source: src/sample/src/missing.ts");
    expect(inspect(good, []).failed).toBe(true);

});
it("coverage inventories executable sources while excluding erased types and facade reexports", async () => {

    const files = await inventory();

    expect(files).toContain("src/cache/src/box.ts");
    expect(files).toContain("src/crypto/src/digest.ts");
    expect(files).not.toContain("src/cache/src/arch.ts");
    expect(files).not.toContain("src/engine/src/index.ts");
    expect(files.length).toBeGreaterThan(150);

}, 15000);
