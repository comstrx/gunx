import { describe, expect, test as it } from "bun:test";
import * as error from "engine/error";
import * as fs from "engine/fs";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 16, 0, 0, 0, 9]);
const encoder = new TextEncoder();

function made ( body: ConstructorParameters<typeof File>[0][number], name: string, type: string ): File {

    return new File([body], name, { type });

}
function filled ( size: number, parts: readonly (readonly [number, string | readonly number[]])[] ): Uint8Array<ArrayBuffer> {

    const out = new Uint8Array(size);

    for ( const [at, part] of parts ) out.set(typeof part === "string" ? encoder.encode(part) : part, at);

    return out;

}
function photo ( span: number, segments: number, width: number, height: number ): Uint8Array<ArrayBuffer> {

    const frame = 2 + segments * (2 + span);
    const out = new Uint8Array(frame + 19);
    const view = new DataView(out.buffer);

    out.set([0xff, 0xd8]);

    for ( let at = 0; at < segments; at += 1 ) {

        out.set([0xff, 0xe2], 2 + at * (2 + span));
        view.setUint16(4 + at * (2 + span), span);

    }

    out.set([0xff, 0xc0, 0, 17, 8], frame);
    view.setUint16(frame + 5, height);
    view.setUint16(frame + 7, width);

    return out;

}
async function refusal ( run: () => unknown ): Promise<unknown> {

    try {

        await run();

    } catch ( failure ) {

        return failure instanceof error.Fault ? [failure.code, failure.reason, failure.errors] : failure;

    }

    return undefined;

}
async function told ( run: () => unknown ): Promise<string> {

    const out = await refusal(run);

    return Array.isArray(out) ? `${out[0]}/${out[1]}` : out === undefined ? "ok" : String(out);

}
function hosted ( code: string, path?: string ): Error {

    return Object.assign(new Error(`host ${code}`), { code }, path === undefined ? {} : { path });

}

describe("fs", () => {

    it("paths normalize, join, relate, parse and match globs", () => {

        expect(fs.normalize("/a/./b/../c//d/")).toBe("/a/c/d");
        expect(fs.normalize("a/../../b")).toBe("../b");
        expect(fs.normalize("")).toBe(".");
        expect(fs.normalize("a\\b\\c")).toBe("a/b/c");
        expect(fs.join("a", "", "b/", "/c")).toBe("a/b/c");
        expect(fs.resolve("/root", "x", "/abs", "y")).toBe("/abs/y");
        expect(fs.segments("/a/b/c")).toEqual(["a", "b", "c"]);
        expect(fs.basename("/a/b/c.txt")).toBe("c.txt");
        expect(fs.basename("/a/b/c.txt", ".txt")).toBe("c");
        expect(fs.dirname("/a/b/c.txt")).toBe("/a/b");
        expect(fs.dirname("c.txt")).toBe(".");
        expect(fs.dirname("/c")).toBe("/");
        expect(fs.extension("x/y.tar.GZ")).toBe("gz");
        expect(fs.extension(".env")).toBe("");
        expect(fs.stem("/a/b.min.js")).toBe("b.min");
        expect(fs.withExtension("/a/b.ts", "js")).toBe("/a/b.js");
        expect(fs.withExtension("b.ts", ".js")).toBe("b.js");
        expect(fs.relative("/a/b/c", "/a/d")).toBe("../../d");
        expect(fs.relative("/a", "/a")).toBe(".");
        expect(fs.within("/srv", "x/y") && fs.within("/srv", "/srv") && !fs.within("/srv", "../etc")).toBe(true);
        expect(fs.parse("/a/b.txt")).toEqual({ dir: "/a", base: "b.txt", name: "b", ext: "txt" });
        expect(fs.format({ dir: "/a", name: "b", ext: "txt" })).toBe("/a/b.txt");
        expect(fs.format({ base: "c" })).toBe("c");
        expect(fs.common(["/a/b/c", "/a/b/d", "/a/b"])).toBe("/a/b");
        expect(fs.common([])).toBe("");
        expect(fs.matches("src/a/b.ts", "src/**/*.ts") && fs.matches("src/b.ts", "src/**/*.ts") && !fs.matches("src/b.js", "src/**/*.ts")).toBe(true);
        expect(fs.matches("a.test.ts", ["*.spec.ts", "*.{test,bench}.ts"]) && fs.matches("x/y", "x/?")).toBe(true);
        expect(fs.safe("  ../my: file?.txt ")).toBe("my- file-.txt");
        expect(fs.safe("\u0000\u0001")).toBe("file");
        expect(fs.separator).toBe("/");

    });
    it("mime types resolve both ways, kinds group, accept rules and signatures sniff", () => {

        expect(fs.mime("photo.JPG")).toBe("image/jpeg");
        expect(fs.mime("x.unknownext")).toBe("application/octet-stream");
        expect(fs.extensionOf("image/jpeg")).toBe("jpg");
        expect(fs.extensionOf("text/plain; charset=utf-8")).toBe("txt");
        expect(fs.extensionOf("x/y")).toBe("");
        expect(fs.kind("image/png")).toBe("image");
        expect(fs.kind("text/csv")).toBe("data");
        expect(fs.kind("application/pdf")).toBe("document");
        expect(fs.kind("application/zip")).toBe("archive");
        expect(fs.kind("font/woff2")).toBe("font");
        expect(fs.kind("application/wasm")).toBe("other");
        expect(fs.accepts("image/png", ["image/*"]) && fs.accepts("image/png", [".png"]) && fs.accepts("x", undefined) && !fs.accepts("image/png", ["video/*", ".jpg"])).toBe(true);
        expect(fs.sniff(png)).toBe("image/png");
        expect(fs.sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
        expect(fs.sniff(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
        expect(fs.sniff(new Uint8Array([1, 2, 3]))).toBeUndefined();

    });
    it("blobs and refs check limits, build form data, read data uris and sizes", async () => {

        const file = new File([png], "a.png", { type: "image/png" });
        const ref = { uri: "file:///a.jpg", name: "a.jpg", type: "image/jpeg", size: 10 };

        expect(fs.isRef(ref) && !fs.isRef({ uri: 1 })).toBe(true);
        expect(() => fs.check(file, { maxBytes: 10, maxFiles: 1 })).toThrow(error.Fault);
        expect(() => fs.check(ref, { maxBytes: 100, maxFiles: 1, types: ["image/png"] }, "photo")).toThrow(error.Fault);
        fs.check(file, { maxBytes: 100, maxFiles: 1, types: ["image/*"] });

        const data = fs.formData({ name: "x", tags: ["a", "b"], file, refs: [ref], nested: { a: 1 }, skipped: null }, { maxBytes: 1000, maxFiles: 3 });

        expect(data.get("name")).toBe("x");
        expect(data.getAll("tags[]")).toEqual(["a", "b"]);
        expect(data.get("file")).toBeInstanceOf(Blob);
        expect(data.get("nested")).toBe('{"a":1}');
        expect(data.has("skipped")).toBe(false);
        expect(() => fs.formData({ files: [file, file] }, { maxBytes: 1000, maxFiles: 1 })).toThrow(error.Fault);
        expect(fs.dataUri("text/plain", "aGk=")).toBe("data:text/plain;base64,aGk=");
        expect(fs.parseDataUri("data:text/plain;base64,aGk=")).toEqual({ type: "text/plain", bytes: new Uint8Array([104, 105]) });
        expect(fs.parseDataUri("data:,hi%20there")?.bytes).toEqual(new TextEncoder().encode("hi there"));
        expect(fs.parseDataUri("nope")).toBeUndefined();
        expect(await fs.bytes(file)).toEqual(png);
        expect(await fs.blobText(new Blob(["hey"]))).toBe("hey");
        expect(await fs.toDataUri(new Blob(["hi"], { type: "image/png" }))).toBe("data:image/png;base64,aGk=");
        expect(fs.typeOf(file)).toBe("image/png");
        expect(fs.typeOf({ uri: "", name: "x.pdf", type: "" })).toBe("application/pdf");
        expect(fs.typeOf({ uri: "", name: "x", type: "" }, png)).toBe("image/png");
        expect(fs.imageSize(png)).toEqual({ width: 16, height: 9, type: "image/png" });
        expect(fs.imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 3, 0, 2, 0]))).toEqual({ width: 3, height: 2, type: "image/gif" });
        expect(fs.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 20, 0, 30, 3, 1, 34, 0, 2, 17, 1, 3, 17, 1]))).toEqual({ width: 30, height: 20, type: "image/jpeg" });
        expect(fs.imageSize(new Uint8Array([1, 2]))).toBeUndefined();
        expect(fs.human(2048)).toContain("2");
        expect(fs.limits.maxFiles).toBe(10);

    });
    it("the disk port runs every file verb over any disk", async () => {

        const disk = fs.memoryDisk();

        await fs.disk.with(disk, async () => {

            await fs.write("/app/a/one.txt", "one");
            await fs.writeJson("/app/a/two.json", { b: 1 });
            await fs.append("/app/a/one.txt", "+");
            expect(await fs.text("/app/a/one.txt")).toBe("one+");
            expect(await fs.readJson("/app/a/two.json")).toEqual({ b: 1 });
            expect(await fs.exists("/app/a/one.txt") && (await fs.exists("/app/a")) && (await fs.isDir("/app/a")) && !(await fs.isDir("/app/a/one.txt")) && !(await fs.exists("/app/nope"))).toBe(true);
            expect((await fs.stat("/app/a/one.txt"))?.size).toBe(4);
            expect(await fs.stat("/nope")).toBeUndefined();
            await fs.copy("/app/a/one.txt", "/app/b/copy.txt");
            await fs.move("/app/a/two.json", "/app/b/moved.json");
            expect((await fs.entries("/app/b")).map(( entry ) => `${entry.kind}:${entry.name}`)).toEqual(["file:copy.txt", "file:moved.json"]);
            expect((await fs.walk("/app")).map(( entry ) => entry.relative)).toEqual(["a", "a/one.txt", "b", "b/copy.txt", "b/moved.json"]);
            expect((await fs.files("/app", ( entry ) => entry.name === "b")).map(( entry ) => entry.relative)).toEqual(["a/one.txt"]);
            expect((await fs.find("/app", "**/*.json")).map(( entry ) => entry.relative)).toEqual(["b/moved.json"]);
            expect(await fs.size("/app")).toBe(4 + 4 + 13);
            expect(await fs.digest("/app/a/one.txt")).toHaveLength(64);
            expect(await fs.same("/app/a/one.txt", "/app/b/copy.txt") && !(await fs.same("/app/a/one.txt", "/app/b/moved.json")) && !(await fs.same("/app/a/one.txt", "/nope"))).toBe(true);
            await fs.ensure("/app/c");
            expect(await fs.isDir("/app/c")).toBe(true);
            await fs.empty("/app/b");
            expect(await fs.entries("/app/b")).toEqual([]);
            expect((await fs.temp("x-")).startsWith("/tmp/x-")).toBe(true);
            await fs.remove("/app");
            expect(await fs.stat("/app/a/one.txt")).toBeUndefined();
            await expect(fs.read("/gone")).rejects.toMatchObject({ code: "not_found" });
            await expect(fs.move("/gone", "/x")).rejects.toMatchObject({ code: "not_found" });
            await fs.write("/raw", "{");
            await expect(fs.readJson("/raw")).rejects.toMatchObject({ code: "validation" });

        });

        expect(() => fs.disk.get()).toThrow(error.Fault);

    });
    it("absolute paths are told apart from relative ones", () => {

        expect(fs.isAbsolute("/var/x")).toBe(true);
        expect(fs.isAbsolute("var/x") || fs.isAbsolute("./x") || fs.isAbsolute("")).toBe(false);

    });
    it("a relative path whose first name is shaped like a drive stays relative through every verb", () => {

        const shaped = ["./C:", "a/../C:", "./C:/x", "x/../c:/y/..", ".\\Z:\\x"];

        expect(shaped.map(fs.normalize)).toEqual(["./C:", "./C:", "./C:/x", "./c:", "./Z:/x"]);
        expect(shaped.map(( path ) => fs.normalize(fs.normalize(path)))).toEqual(shaped.map(fs.normalize));
        expect(shaped.map(( path ) => fs.isAbsolute(fs.normalize(path)))).toEqual([false, false, false, false, false]);
        expect(shaped.map(fs.segments)).toEqual([["C:"], ["C:"], ["C:", "x"], ["c:"], ["Z:", "x"]]);
        expect([fs.join(".", "C:"), fs.join("a", "..", "C:", "x"), fs.join("C:", "x"), fs.join("", "C:")]).toEqual(["./C:", "./C:/x", "C:/x", "C:/"]);
        expect([fs.dirname("./C:/x"), fs.dirname("./C:/x/y"), fs.dirname("./C:"), fs.ancestors("./C:/x/y")]).toEqual(["./C:", "./C:/x", ".", ["./C:/x", "./C:", "."]]);
        expect([fs.relative(".", "./C:"), fs.relative("/a", "/a/C:"), fs.relative("x", "./C:/y"), fs.relative("./C:", "./C:/y")]).toEqual(["./C:", "./C:", "../C:/y", "y"]);
        expect([fs.common(["./C:/a", "./C:/b"]), fs.common(["./C:/a", "C:/a"])]).toEqual(["./C:", ""]);
        expect([fs.format(fs.parse("./C:")), fs.format({ base: "C:" }), fs.format(fs.parse("./C:/x")), fs.format(fs.parse("C:/x"))]).toEqual(["./C:", "./C:", "./C:/x", "C:/x"]);
        expect([fs.inside(".", "./C:"), fs.inside(".", "C:"), fs.inside("/base", "./C:"), fs.inside("./C:", "x"), fs.inside("./C:", "C:/x"), fs.inside("a", "../C:")]).toEqual(["./C:", undefined, "/base/C:", "./C:/x", undefined, undefined]);
        expect([fs.resolve(".", "./C:"), fs.resolve("a", "..", "C:"), fs.resolve("a", "C:")]).toEqual(["./C:", "C:/", "C:/"]);
        expect([fs.matches("./C:", "*"), fs.matches(fs.normalize("./C:"), "*"), fs.matches("./C:/x", "C:/*"), fs.matches("C:/x", "C:/*")]).toEqual([true, true, true, false]);
        expect([fs.unique("./C:", ["./C:"]), fs.parse("./C:/x.TXT")]).toEqual(["C: (2)", { dir: "./C:", base: "x.TXT", name: "x", ext: "txt" }]);

    });

    it("a base made of parent steps holds only what sits under it, never a step further up", () => {

        expect([fs.inside("..", "x"), fs.inside("..", "x/y"), fs.inside("..", "."), fs.inside("../..", "x"), fs.inside("../a", "b")]).toEqual(["../x", "../x/y", "..", "../../x", "../a/b"]);
        expect([fs.inside("..", "../x"), fs.inside("..", ".."), fs.inside("..", "../.."), fs.inside("../..", "../x"), fs.inside("..", "x/../.."), fs.inside("../a", "../../b"), fs.inside("..", "/x")]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
        expect([fs.within("..", "../x"), fs.within("..", "x"), fs.within("a/..", "../x"), fs.within(".", "../x"), fs.within("/..", "../x"), fs.within("C:/..", "../x")]).toEqual([false, true, false, false, true, true]);

    });

    it("an empty base resolves like the folder it stands in, never like the root", () => {

        expect([fs.resolve("", "x"), fs.resolve("", ""), fs.resolve("", "/x"), fs.resolve("", "..", "x"), fs.resolve("a", ""), fs.resolve("", "C:/x")]).toEqual(["x", ".", "/x", "../x", "a", "C:/x"]);
        expect([fs.resolve(""), fs.resolve("."), fs.resolve("/"), fs.resolve("/", "x")]).toEqual([".", ".", "/", "/x"]);
        expect([fs.inside("", "x"), fs.inside("", "/x"), fs.inside("", "../x"), fs.inside("", "")]).toEqual(["x", undefined, undefined, "."]);

    });

    it("a new name, stem or ending never leaves its folder", () => {

        expect([fs.withName("uploads/a.png", "b.jpg"), fs.withName("a.png", "b"), fs.withName("/a.png", "b"), fs.withName("C:/x/y", "z"), fs.withName("../a", "b")]).toEqual(["uploads/b.jpg", "b", "/b", "C:/x/z", "../b"]);
        expect([fs.withStem("uploads/a.png", "b"), fs.withStem("uploads/a", "b"), fs.withStem("uploads/.env", "b"), fs.withStem("a.tar.gz", "b"), fs.withStem("uploads/a.png", "b.c")]).toEqual(["uploads/b.png", "uploads/b", "uploads/b", "b.gz", "uploads/b.c.png"]);
        expect([fs.withExtension("uploads/a", "txt"), fs.withExtension("uploads/a.tar.gz", "zip"), fs.withExtension("uploads/a.png", ""), fs.withExtension("uploads/a.png", "..."), fs.withExtension(".env", "txt"), fs.withExtension("a.png", "tar.gz")]).toEqual(["uploads/a.txt", "uploads/a.tar.zip", "uploads/a", "uploads/a", ".env.txt", "a.tar.gz"]);

        for ( const name of ["../../etc/passwd", "..", ".", "", "x/y", "b\\c", "a\u0000"] ) {

            expect(() => fs.withName("uploads/a.png", name)).toThrow(new RangeError("not a name"));
            expect(() => fs.withStem("uploads/a.png", name)).toThrow(new RangeError("not a name"));
            expect(() => fs.withStem("uploads/a", name)).toThrow(new RangeError("not a name"));

        }

        expect([fs.withName("a.png", "C:"), fs.withStem("a", "c:"), fs.withStem("a.png", "C:"), fs.withName("./C:/a", "b"), fs.withExtension("./C:/a", "x")]).toEqual(["./C:", "./c:", "C:.png", "./C:/b", "./C:/a.x"]);
        expect([fs.withName("a.png", "C:"), fs.withName("./C:/a", "b")].map(fs.isAbsolute)).toEqual([false, false]);
        expect([fs.withName("a.png", "C:x"), fs.withName("x/a", "1:"), fs.withExtension("C:x", "")]).toEqual(["C:x", "x/1:", "C:x"]);
        expect(() => fs.withExtension("uploads/a.png", "x/../../y")).toThrow(new RangeError("not a name"));
        expect(() => fs.withExtension("uploads/a.png", "\\y")).toThrow(new RangeError("not a name"));

    });
    it("normalize collapses dots, separators, drives and shares without ever climbing a root", () => {

        expect(["/..", "/../a", "./", "a/..", "a//b\\\\c/", "C:/..", "..", "../../a/.."].map(fs.normalize)).toEqual(["/", "/a", ".", ".", "a/b/c", "C:/", "..", "../.."]);
        expect([fs.normalize("c:\\a\\..\\b"), fs.normalize("C:"), fs.normalize("C:x"), fs.normalize("\\\\server\\share\\x")]).toEqual(["c:/b", "C:/", "C:x", "/server/share/x"]);
        expect(["C:/x", "C:\\x", "C:", "\\\\server", "\\x", "1:/x", "ab:/x", "C:x"].map(fs.isAbsolute)).toEqual([true, true, true, true, true, false, false, false]);
        expect([fs.join(), fs.join("", ""), fs.join("/", "a"), fs.join("a", "../.."), fs.join("a", "/b")]).toEqual([".", ".", "/a", "..", "a/b"]);
        expect([fs.resolve("a", "b"), fs.resolve("/a", "../b"), fs.resolve("/a", "C:/b", "c"), fs.resolve("a"), fs.resolve("/a", "\\b")]).toEqual(["a/b", "/b", "C:/b/c", "a", "/b"]);
        expect([fs.depth("a/b/c"), fs.depth("/"), fs.depth(""), fs.depth("../a"), fs.depth("/a/./b/..")]).toEqual([3, 0, 0, 2, 1]);
        expect(fs.segments("//server/share")).toEqual(["server", "share"]);

    });
    it("names, endings, parents and ancestors read every edge the same way", () => {

        expect([fs.extension("a."), fs.extension("a..b"), fs.extension(".."), fs.extension("a/b.c/d"), fs.extension("/")]).toEqual(["", "b", "", "", ""]);
        expect([fs.stem(".env"), fs.stem("a."), fs.stem(".."), fs.stem("/"), fs.stem("a/b.c/d")]).toEqual([".env", "a", "..", "", "d"]);
        expect([fs.basename("/"), fs.basename(""), fs.basename("a/b/"), fs.basename("a/b.txt", ".txt"), fs.basename(".txt", ".txt"), fs.basename("a/b.txt", "txt"), fs.basename("a/b.txt", "")]).toEqual(["", "", "b", "b", ".txt", "b.", "b.txt"]);
        expect([fs.dirname("/"), fs.dirname(""), fs.dirname("a/b/"), fs.dirname("../a"), fs.dirname("C:/a")]).toEqual(["/", ".", "a", "..", "C:/"]);
        expect([fs.ancestors("a/b/c"), fs.ancestors("/a/b"), fs.ancestors("/"), fs.ancestors(""), fs.ancestors("../a")]).toEqual([["a/b", "a", "."], ["/a", "/"], [], [], ["..", "."]]);
        expect([fs.parse("..a"), fs.parse("a."), fs.parse(".a.b"), fs.parse("a/.."), fs.parse("/a/b/"), fs.parse("x.TAR.GZ")]).toEqual([
            { dir: ".", base: "..a", name: ".", ext: "a" },
            { dir: ".", base: "a.", name: "a", ext: "" },
            { dir: ".", base: ".a.b", name: ".a", ext: "b" },
            { dir: ".", base: "", name: "", ext: "" },
            { dir: "/a", base: "b", name: "b", ext: "" },
            { dir: ".", base: "x.TAR.GZ", name: "x.TAR", ext: "gz" },
        ]);
        expect([fs.format(fs.parse("/a/b.TXT")), fs.format(fs.parse("/")), fs.format(fs.parse("")), fs.format({ dir: "/a", name: "b", ext: ".c" }), fs.format({ name: "b", ext: "c" }), fs.format({}), fs.format({ dir: "a/..", base: "x" })]).toEqual(["/a/b.TXT", "/", "", "/a/b.c", "b.c", "", "x"]);
        expect([fs.hidden(".a"), fs.hidden("a/.b/c"), fs.hidden(".."), fs.hidden("."), fs.hidden("a/.b/")]).toEqual([true, false, false, false, true]);

    });
    it("relative, inside, within and common never mix roots or escape a base", () => {

        expect([fs.relative("../a", "b"), fs.relative("a/b", "a/c/d"), fs.relative("/a", "C:/b"), fs.relative("/a/b", "/a/b"), fs.relative("", "")]).toEqual(["../../b", "../c/d", "C:/b", ".", "."]);
        expect([fs.inside("/a", "b/../c"), fs.inside("/a", "../a/b"), fs.inside("/a", "/a"), fs.inside("/", "x"), fs.inside("", "x")]).toEqual(["/a/c", "/a/b", "/a", "/x", "x"]);
        expect([fs.inside("/a", "../ab"), fs.inside("", "../x"), fs.inside("a", "/a/b"), fs.inside("/a", "b\u0000")]).toEqual([undefined, undefined, undefined, undefined]);
        expect(fs.inside("..", "x")).toBe("../x");
        expect([fs.within("C:/a", "c:/a/b"), fs.within("/a", "/ab"), fs.within("/a", "/a/../a/b"), fs.within("a", "a/../../a"), fs.within("a", "../b")]).toEqual([false, false, true, true, false]);
        expect([fs.common(["/a/b", "/a/c"]), fs.common(["a/b", "c"]), fs.common(["/a", "b"]), fs.common(["/a", "/b"]), fs.common(["a/b/c"]), fs.common(["C:/a/b", "C:/a/c"])]).toEqual(["/a", "", "", "/", "a/b/c", "C:/a"]);

    });
    it("unique counts past every taken name and keeps the ending", () => {

        expect(fs.unique("a.txt", [])).toBe("a.txt");
        expect(fs.unique("a.txt", ["a.txt"])).toBe("a (2).txt");
        expect(fs.unique("a (2).txt", ["a (2).txt", "a (3).txt"])).toBe("a (4).txt");
        expect(fs.unique("d/a", new Set(["d/a", "d/a (2)"]))).toBe("d/a (3)");
        expect(fs.unique(".env", [".env"])).toBe(".env (2)");
        expect(fs.unique("a.tar.gz", ["a.tar.gz"])).toBe("a.tar (2).gz");
        expect(fs.unique("a (999999999).txt", ["a (999999999).txt"])).toBe("a (1000000000).txt");
        expect(fs.unique("a (x).txt", ["a (x).txt"])).toBe("a (x) (2).txt");
        expect([fs.unique("x.Y.", ["x.Y."]), fs.unique("a.", ["a.", "a (2)."]), fs.unique("...", ["..."])]).toEqual(["x.Y (2).", "a (3).", ".. (2)."]);
        expect(fs.extension(fs.unique("x.Y.", ["x.Y."]))).toBe(fs.extension("x.Y."));

    });
    it("safe turns any text into one bounded, portable file name", () => {

        expect(["com9.txt", "LPT9", "com10.txt", "lpt", "nul.tar.gz", "aux"].map(( name ) => fs.safe(name))).toEqual(["_com9.txt", "_LPT9", "com10.txt", "lpt", "_nul.tar.gz", "_aux"]);
        expect([fs.safe("../../etc/passwd"), fs.safe("CON"), fs.safe("con.txt"), fs.safe(".env"), fs.safe("rf‮"), fs.safe("a".repeat(400)).length, fs.safe("..."), fs.safe(""), fs.safe("ab.exe"), fs.safe("a  b.txt"), fs.safe("COM1.tar.gz"), fs.safe("a.b c")]).toEqual(["etc-passwd", "_CON", "_con.txt", "env", "rf", 255, "file", "file", "ab.exe", "a b.txt", "_COM1.tar.gz", "a.b c"]);
        expect([fs.safe("conx.txt", "file", 7), fs.safe("😀😀😀", "file", 9), fs.safe("aux", "file", 2), fs.safe("nul.txt", "file", 6)]).toEqual(["co.txt", "😀😀", "au", "nu.txt"]);
        expect(fs.safe("\u0000\u0001", "upload")).toBe("upload");

        const encoder = new TextEncoder();

        for ( const name of [`${"a".repeat(300)}.png`, `${"ع".repeat(200)}.pdf`, "😀".repeat(100), `x.${"y".repeat(300)}`, `con${".".repeat(300)}`, " . ".repeat(100)] ) {

            const out = fs.safe(name);

            expect(encoder.encode(out).length).toBeLessThanOrEqual(255);
            expect(out).not.toBe("");
            expect(out.isWellFormed()).toBe(true);
            expect([...out].some(( letter ) => '\\/:*?"<>|'.includes(letter) || letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127)).toBe(false);
            expect(/^[. ]|[. ]$/.test(out)).toBe(false);
            expect(fs.safe(out)).toBe(out);

        }

        expect(fs.safe(`${"a".repeat(300)}.png`).endsWith(".png")).toBe(true);

    });
    it("globs match whole paths with segments, classes, braces, escapes and negation", () => {

        const asked: [string, string, fs.Glob?][] = [
            [".a", "*"],
            [".a", "*", { dot: false }],
            ["a/.b/c", "**/c", { dot: false }],
            ["a/b", "**"],
            ["", "**"],
            ["/a", "a"],
            ["/a", "/a"],
            ["/a", "**/a"],
            ["a", "/a"],
            ["x", "[!y]"],
            ["y", "[!y]"],
            ["x", "[]"],
        ];

        expect(asked.map(([path, pattern, options]) => fs.matches(path, pattern, options))).toEqual([true, false, false, true, true, false, true, true, false, true, false, false]);
        expect([fs.matches("{a}", "{a}"), fs.matches("a", "{a}"), fs.matches("a,b", "{a\\,b}"), fs.matches("[", "["), fs.matches("]", "[]]"), fs.matches("x", "[!]"), fs.matches("*", "\\*"), fs.matches("a", "\\*"), fs.matches("a/b", "a\\/b")]).toEqual([true, false, false, true, true, false, true, false, true]);
        expect([fs.matches("😀", "?"), fs.matches("😀", "[😀-😂]"), fs.matches("ab", "?"), fs.matches("b", "[a-c]"), fs.matches("d", "[a-c]"), fs.matches("b", "[z-a]"), fs.matches("-", "[a-]")]).toEqual([true, true, false, true, false, false, true]);
        expect([fs.matches("a/b/c", "a/**"), fs.matches("a", "a/**"), fs.matches("ab", "a/**"), fs.matches("a/b", "a**b"), fs.matches("axb", "a**b"), fs.matches("a/b", "*"), fs.matches("a/b", "*/*")]).toEqual([true, true, false, false, true, false, true]);
        expect([fs.matches("a", "!a"), fs.matches("b", "!a"), fs.matches("a", "!!a"), fs.matches("!a", "!!a")]).toEqual([false, true, true, false]);
        expect([fs.matches("a.ts", []), fs.matches("a.ts", ["*.js", "*.ts"]), fs.matches("a.ts", ["*.ts", "!a.ts"]), fs.matches("b.ts", ["*.ts", "!a.ts"])]).toEqual([false, true, false, true]);
        expect([fs.matches("A.TS", "*.ts"), fs.matches("A.TS", "*.ts", { insensitive: true }), fs.matches("İ", "İ", { insensitive: true }), fs.matches("İ", "[İ]", { insensitive: true }), fs.matches("ß", "SS", { insensitive: true }), fs.matches("ß", "[A-Z]", { insensitive: true }), fs.matches("q", "[A-Z]", { insensitive: true })]).toEqual([false, true, true, true, false, false, true]);
        expect(() => fs.glob("{a,b}".repeat(10))).toThrow(new RangeError("not a glob"));
        expect(() => fs.glob("a".repeat(1025))).toThrow(new RangeError("not a glob"));
        expect(() => fs.glob(`${"{a,b,c}".repeat(3)}{a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s}`)).toThrow(new RangeError("not a glob"));
        expect(fs.glob("{a,b}".repeat(9))("a".repeat(9))).toBe(true);

    });
    it("one cached matcher never answers for another pattern list or option set", () => {

        expect(fs.matches("a", ["a", "b"])).toBe(true);
        expect(fs.matches("a", "a\nb")).toBe(false);
        expect(fs.matches("a\nb", "a\nb")).toBe(true);
        expect(fs.matches("A", "a", { insensitive: true })).toBe(true);
        expect(fs.matches("A", "a")).toBe(false);
        expect(fs.matches(".a", "*", { dot: false })).toBe(false);
        expect(fs.matches(".a", "*")).toBe(true);

        for ( let at = 0; at < 600; at += 1 ) expect(fs.matches(`f${at}.ts`, `f${at}.*`)).toBe(true);

        expect(fs.matches("f0.ts", "f0.*") && !fs.matches("f1.ts", "f0.*")).toBe(true);

    });
    it("a type text is one well-formed essence or nothing", () => {

        expect([" Text/HTML ; charset=x", "image/jpg", "image/pjpeg", "application/x-zip-compressed", "audio/mp3", "image/vnd.microsoft.icon", "text/xml", "IMAGE/SVG+XML;x"].map(fs.essence)).toEqual(["text/html", "image/jpeg", "image/jpeg", "application/zip", "audio/mpeg", "image/x-icon", "application/xml", "image/svg+xml"]);
        expect(["", ";", "image/", "/png", "png", "image/ png", "image/png/x", "image/*", "x/y z", "é/x"].map(fs.essence).join("|")).toBe("|||||||||");
        expect([`text/${String.fromCharCode(0x212a)}ind`, `${String.fromCharCode(0x212a)}/x`, `text/${String.fromCharCode(0x17f)}vg`, "text/Kind"].map(fs.essence)).toEqual(["", "", "", "text/kind"]);
        expect([fs.mime("a.JPG"), fs.mime("png"), fs.mime(".png"), fs.mime("a."), fs.mime(""), fs.mime("a.tar.gz"), fs.mime("a/b.c/d")]).toEqual(["image/jpeg", "image/png", "image/png", "application/octet-stream", "application/octet-stream", "application/gzip", "application/octet-stream"]);
        expect([fs.extensionOf("image/jpeg"), fs.extensionOf("IMAGE/JPG"), fs.extensionOf("nope/nope"), fs.extensionOf("image/"), fs.extensionOf("jpeg")]).toEqual(["jpg", "jpg", "", "", ""]);
        expect(["image/png", "video/mp4", "audio/ogg", "font/woff2", "application/pdf", "application/json", "text/css", "application/zip", "application/wasm", "", "image/svg+xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/ld+json", "text/csv", "image/", "application/vnd.ms-fontobject"].map(fs.kind)).toEqual(["image", "video", "audio", "font", "document", "data", "text", "archive", "other", "other", "image", "document", "data", "data", "other", "font"]);
        expect(["image/png", "video/mp4", "audio/mpeg", "application/pdf", "text/plain", "TEXT/PLAIN; charset=utf-8"].map(fs.inert)).toEqual([true, true, true, true, true, true]);
        expect(["image/svg+xml", "IMAGE/SVG+XML;x", "text/html", "application/xhtml+xml", "text/javascript", "", "image/", "image/ png", "image/png/x", "image/*"].map(fs.inert).includes(true)).toBe(false);
        expect(["text/x", "application/json", "application/ld+json", "image/svg+xml", "application/javascript", "application/xml", "text/csv"].map(fs.isText).includes(false)).toBe(false);
        expect(["application/octet-stream", "", "image/png", "application/pdf", "text/"].map(fs.isText).includes(true)).toBe(false);
        expect(["image/png", "IMAGE/JPG; q=1", "image/webp", "image/gif", "font/woff2", "application/gzip", "video/webm", "application/x-rar-compressed"].map(fs.sniffable).includes(false)).toBe(false);
        expect(["image/bmp", "image/svg+xml", "image/heic", "application/pdf", "application/zip", "video/mp4", "text/plain", "", "image/"].map(fs.sniffable).includes(true)).toBe(false);

    });
    it("accept rules read types, families, endings and aliases and nothing malformed", () => {

        expect([
            fs.accepts("image/png", ["image/*"]),
            fs.accepts("image/png", ["IMAGE/PNG"]),
            fs.accepts("image/png", [".png"]),
            fs.accepts("", [".png"], "a.PNG"),
            fs.accepts("image/png", []),
            fs.accepts("image/png", undefined),
            fs.accepts("image/jpg", ["image/jpeg"]),
            fs.accepts("image/jpeg", [".jpg"]),
            fs.accepts("image/jpeg", [".jpeg"]),
            fs.accepts("x/y", ["*"]),
            fs.accepts("x/y", ["*/*"]),
            fs.accepts("image/png", [" image/* "]),
            fs.accepts("text/plain", [".png"], "a.b.png"),
            fs.accepts("image/png", ["image/png; q=1"]),
            fs.accepts("image/png", ["video/*", "image/png"]),
        ].includes(false)).toBe(false);
        expect([
            fs.accepts("", ["image/*"]),
            fs.accepts("image/png", ["/*"]),
            fs.accepts("image/png", ["."]),
            fs.accepts("image/png", [""]),
            fs.accepts("imagex/png", ["image/*"]),
            fs.accepts("image/", ["image/*"]),
            fs.accepts("image/", ["image/"]),
            fs.accepts("image", ["image/*"]),
            fs.accepts("image/*", ["image/*"]),
            fs.accepts("image/png", ["video/*", ".jpg"]),
            fs.accepts("text/plain", [".png"], ".png"),
            fs.accepts("text/plain", [".png"], "png"),
        ].includes(true)).toBe(false);
        expect([
            fs.agrees("", "image/png"),
            fs.agrees("application/octet-stream", "image/png"),
            fs.agrees("image/png", "image/png"),
            fs.agrees("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"),
            fs.agrees("application/java-archive", "application/zip"),
            fs.agrees("image/svg+xml", "application/xml"),
            fs.agrees("application/xhtml+xml", "application/xml"),
            fs.agrees("audio/mp4", "video/mp4"),
            fs.agrees("image/jpg", "image/jpeg"),
            fs.agrees("image/heic", "image/heif"),
            fs.agrees("text/html", "application/xml"),
            fs.agrees("text/markdown", "text/html"),
        ].includes(false)).toBe(false);
        expect([fs.agrees("image/png", "image/gif"), fs.agrees("image/avif", "image/heic"), fs.agrees("image/png", "application/zip"), fs.agrees("application/pdf", "text/html"), fs.agrees("image/png", "text/html"), fs.agrees("video/mp4", "audio/mp4")].includes(true)).toBe(false);

    });
    it("sniff reads every signature it knows and guesses nothing else", () => {

        const signed: [number[], string | undefined][] = [
            [[0x25, 0x50, 0x44, 0x46], "application/pdf"],
            [[0x1f, 0x8b], "application/gzip"],
            [[0, 0x61, 0x73, 0x6d], "application/wasm"],
            [[0x77, 0x4f, 0x46, 0x32], "font/woff2"],
            [[0x77, 0x4f, 0x46, 0x46], "font/woff"],
            [[0x4f, 0x54, 0x54, 0x4f], "font/otf"],
            [[0, 1, 0, 0, 0], "font/ttf"],
            [[0, 0, 1, 0], "image/x-icon"],
            [[0x49, 0x49, 0x2a, 0], "image/tiff"],
            [[0x4d, 0x4d, 0, 0x2a], "image/tiff"],
            [[0x4f, 0x67, 0x67, 0x53], "audio/ogg"],
            [[0x66, 0x4c, 0x61, 0x43], "audio/flac"],
            [[0x49, 0x44, 0x33], "audio/mpeg"],
            [[0xff, 0xfb, 0x90, 0], "audio/mpeg"],
            [[0xff, 0xf1, 0x50, 0x80], undefined],
            [[0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], "application/vnd.rar"],
            [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], "application/x-7z-compressed"],
            [[0x42, 0x5a, 0x68], "application/x-bzip2"],
            [[0xfd, 0x37, 0x7a, 0x58, 0x5a, 0], "application/x-xz"],
            [[0x28, 0xb5, 0x2f, 0xfd], "application/zstd"],
            [[0x50, 0x4b, 3, 4], "application/zip"],
            [[0x89, 0x50, 0x4e], undefined],
            [[0xff, 0xd8], undefined],
            [[], undefined],
        ];
        const box = ( brand: string, others = "" ): Uint8Array => filled(64, [[0, [0, 0, 0, 24]], [4, `ftyp${brand}`], [16, others]]);
        const riff = ( form: string ): Uint8Array => filled(12, [[0, "RIFF"], [8, form]]);
        const film = ( type: string ): Uint8Array => filled(64, [[0, [0x1a, 0x45, 0xdf, 0xa3]], [24, type]]);
        const pack = ( inner: string ): Uint8Array => filled(200, [[0, [0x50, 0x4b, 3, 4]], [30, inner]]);
        const book = ( type: string ): Uint8Array => filled(200, [[0, [0x50, 0x4b, 3, 4]], [18, [type.length]], [26, [8]], [30, `mimetype${type}`]]);
        const office = "application/vnd.openxmlformats-officedocument.";

        for ( const [bytes, type] of signed ) expect(fs.sniff(new Uint8Array(bytes))).toBe(type);

        expect([box("heic"), box("mif1", "avif"), box("mif1", "heic"), box("mif1"), box("avif"), box("qt  "), box("M4A "), box("M4V "), box("3gp4"), box("isom"), box("mp42"), box("zzzz")].map(fs.sniff)).toEqual(["image/heic", "image/avif", "image/heic", "image/heif", "image/avif", "video/quicktime", "audio/mp4", "video/x-m4v", "video/3gpp", "video/mp4", "video/mp4", undefined]);
        expect([riff("WEBP"), riff("WAVE"), riff("AVI "), riff("ZZZZ"), filled(512, [[257, "ustar"]]), film("webm"), film("matroska")].map(fs.sniff)).toEqual(["image/webp", "audio/wav", "video/x-msvideo", undefined, "application/x-tar", "video/webm", "video/x-matroska"]);
        expect([pack("x"), pack("[Content_Types].xml word/"), pack("[Content_Types].xml xl/"), pack("[Content_Types].xml ppt/"), pack("[Content_Types].xml")].map(fs.sniff)).toEqual(["application/zip", `${office}wordprocessingml.document`, `${office}spreadsheetml.sheet`, `${office}presentationml.presentation`, "application/zip"]);
        expect([book("application/epub+zip"), book("application/vnd.oasis.opendocument.text"), book("application/vnd.android.package-archive")].map(fs.sniff)).toEqual(["application/epub+zip", "application/vnd.oasis.opendocument.text", "application/vnd.android.package-archive"]);
        expect([book("image/png"), book("text/html"), book("image/svg+xml"), book("application/pdf"), book("nope/nope")].map(fs.sniff)).toEqual(["application/zip", "application/zip", "application/zip", "application/zip", "application/zip"]);

    });
    it("markup is told from text by its opening tag alone", () => {

        const pages = ["<div><script>alert(1)</script>", "<a href=x>", "<!-- c --><script>", `${" ".repeat(300)}<script>alert(1)</script>`, "\f<html>", "﻿<html>", "<script>", "<h1>x", "<p>x", "<b>", "<table>", "<style>", "<title >", "<br/>", "<font>", "<body>", "<head>", "<iframe src=x>", "<div\n class=x>", "<DIV>", "<!DOCTYPE HTML>", "<!-- x --><svg/>"];
        const plain = ["<img src=x onerror=alert(1)>", "<bodyx>", "<p:sld xmlns:p='x'>", "<a-scene>", "<b:Sources>", "<html", "<!doctypehtml>", "hello", "", " ", "x<html>", `${" ".repeat(5000)}<script>`];

        expect(pages.map(( text ) => fs.sniff(encoder.encode(text))).filter(( type ) => type !== "text/html")).toEqual([]);
        expect(plain.map(( text ) => fs.sniff(encoder.encode(text))).filter(( type ) => type !== undefined)).toEqual([]);
        expect(["<svg xmlns='http://www.w3.org/2000/svg'/>", "<?xml version='1.0'?><svg/>", "<!DOCTYPE svg PUBLIC '-//W3C//DTD SVG 1.1//EN' 'x'><svg/>", "<SVG>", "<?xml version='1.0'?><root/>", "<?xml version='1.0'?>"].map(( text ) => fs.sniff(encoder.encode(text)))).toEqual(["image/svg+xml", "image/svg+xml", "image/svg+xml", "image/svg+xml", "application/xml", "application/xml"]);

    });
    it("inspect believes the bytes over the declared type and the name", async () => {

        const images = { ...fs.limits, types: ["image/*"] };
        const named = { ...fs.limits, types: [".png"] };
        const refused = ["validation", "file.content", { file: ["type"] }];
        const book = ( type: string ): Uint8Array<ArrayBuffer> => filled(200, [[0, [0x50, 0x4b, 3, 4]], [18, [type.length]], [26, [8]], [30, `mimetype${type}`]]);

        expect(await refusal(() => fs.inspect(made("<div><script>alert(1)</script>", "a.png", "image/png"), images))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("<script>alert(1)</script>", "a.png", "image/png"), images))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("hello", "a.png", "image/png"), images))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("hello", "a.jpg", ""), images))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("", "a.png", "image/png"), images))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("%PDF-1.7", "a.png", "image/png"), images))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made(book("image/png"), "a.png", "image/png"), images))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("<div>", "a.pdf", "application/pdf"), { ...fs.limits, types: [".pdf"] }))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made(book("application/pdf"), "a.pdf", "application/pdf"), { ...fs.limits, types: [".pdf"] }))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("<img src=x onerror=alert(1)>", "a.png", "text/plain"), named))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("hello", "a.png", "application/octet-stream"), named))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("hello", "a.png", ""), named))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made("hello", "a.png", "image/png"), images, "avatar"))).toEqual(["validation", "file.content", { avatar: ["type"] }]);
        expect(await fs.inspect(made("hello", "a.png", "image/png"), images).catch(( failure: unknown ) => failure)).toMatchObject({ status: 422, message: "file: the content is application/octet-stream" });
        expect(await fs.inspect(made("GIF89a\u0001\u0000\u0001\u0000", "a.png", "image/png"), images)).toEqual({ type: "image/gif", size: 10, name: "a.png", width: 1, height: 1 });
        expect(await fs.inspect(made(png, "a.png", "image/png"), named)).toEqual({ type: "image/png", size: 24, name: "a.png", width: 16, height: 9 });
        expect(await fs.inspect(made(png, "photo", ""), images)).toEqual({ type: "image/png", size: 24, name: "photo", width: 16, height: 9 });
        expect(await fs.inspect(made(png, "a.png", "application/octet-stream"), images)).toMatchObject({ type: "image/png", width: 16 });
        expect(await fs.inspect(made("GIF89a\u0001\u0000\u0001\u0000", "a.txt", "text/plain"), images)).toMatchObject({ type: "image/gif", name: "a.txt" });
        expect(await refusal(() => fs.inspect(made("hello", "a.txt", "text/plain"), images))).toEqual(["validation", "file.type", { file: ["type"] }]);
        expect(await refusal(() => fs.inspect(made("GIF89a\u0001\u0000\u0001\u0000", "a.txt", "text/plain"), { ...fs.limits, types: ["text/plain"] }))).toEqual(refused);
        expect(await refusal(() => fs.inspect(made(png, "a.png", "image/png"), { maxBytes: 23, maxFiles: 1, types: ["image/*"] }))).toEqual(["validation", "file.size", { file: ["max:23"] }]);
        expect(await fs.inspect(made(png, "../x y?.png", "image/png"))).toMatchObject({ name: "x y-.png" });
        expect(await fs.inspect(new Blob([png], { type: "image/png" }))).toEqual({ type: "image/png", size: 24, name: "", width: 16, height: 9 });
        expect((await fs.inspect(made("<svg xmlns='http://www.w3.org/2000/svg'/>", "a.svg", "image/svg+xml"), images)).type).toBe("image/svg+xml");
        expect((await fs.inspect(made("<!-- x --><svg/>", "a.svg", "image/svg+xml"), images)).type).toBe("image/svg+xml");
        expect((await fs.inspect(made("<html>\n# notes", "a.md", "text/markdown"), { ...fs.limits, types: [".md"] })).type).toBe("text/markdown");
        expect((await fs.inspect(made("hello", "a.txt", "text/plain"), { ...fs.limits, types: [".txt"] })).type).toBe("text/plain");
        expect((await fs.inspect(made("hello", "a.weird", "application/octet-stream"), { ...fs.limits, types: [".weird"] })).type).toBe("application/octet-stream");
        expect((await fs.inspect(made(book("application/epub+zip"), "a.epub", "application/epub+zip"), { ...fs.limits, types: [".epub"] })).type).toBe("application/epub+zip");
        expect((await fs.inspect(made("hello", "a.png", "image/png"))).type).toBe("application/octet-stream");

    });
    it("typeOf reads the declared type, then the name, then the bytes", () => {

        expect([fs.typeOf(made("x", "a.PNG", "")), fs.typeOf(made("x", "noext", "")), fs.typeOf(made("x", "a.png", "IMAGE/PNG; q=1")), fs.typeOf({ uri: "u", name: "a.jpeg", type: "" })]).toEqual(["image/png", "application/octet-stream", "image/png", "image/jpeg"]);
        expect([fs.typeOf(made("x", "a.png", "image/")), fs.typeOf(made("x", "a.txt", "bad type")), fs.typeOf({ uri: "", name: "a.pdf", type: "pdf" }), fs.typeOf({ uri: "", name: "a", type: "*/*" })]).toEqual(["image/png", "text/plain", "application/pdf", "application/octet-stream"]);
        expect([fs.typeOf(made("x", "a.txt", "text/plain"), encoder.encode("GIF89a")), fs.typeOf(made("x", "a.png", "image/png"), encoder.encode("hello")), fs.typeOf(made("x", "a.png", "image/png"), new Uint8Array(0)), fs.typeOf(made("x", "a.png", "image/png"), png), fs.typeOf(made("x", "a.docx", ""), new Uint8Array([0x50, 0x4b, 3, 4])), fs.typeOf(made("x", "a.txt", "text/plain"), encoder.encode("<html>"))]).toEqual(["image/gif", "application/octet-stream", "application/octet-stream", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);

    });
    it("inspect measures a picture wherever its size sits and refuses one it cannot measure", async () => {

        const bounded = { ...fs.limits, maxPixels: 1_000_000 };
        const over = ["validation", "file.pixels", { file: ["max_pixels:1000000"] }];
        const boxed = ( padding: number, width: number, height: number ): Uint8Array<ArrayBuffer> => {

            const out = filled(24 + padding + 20, [[0, [0, 0, 0, 24]], [4, "ftypheic"], [24 + padding + 4, "ispe"]]);
            const view = new DataView(out.buffer);

            view.setUint32(24 + padding + 12, width);
            view.setUint32(24 + padding + 16, height);

            return out;

        };

        expect(await fs.inspect(made(photo(1000, 0, 640, 480), "a.jpg", "image/jpeg"), bounded)).toEqual({ type: "image/jpeg", size: 21, name: "a.jpg", width: 640, height: 480 });
        expect(await fs.inspect(made(photo(5000, 1, 640, 480), "a.jpg", "image/jpeg"), bounded)).toEqual({ type: "image/jpeg", size: 5023, name: "a.jpg", width: 640, height: 480 });
        expect(await fs.inspect(made(photo(5000, 3, 640, 480), "a.jpg", "image/jpeg"))).toMatchObject({ size: 15_027, width: 640, height: 480 });
        expect(await fs.inspect(made(photo(60_000, 1, 640, 480), "a.jpg", "image/jpeg"), bounded)).toMatchObject({ size: 60_023, width: 640, height: 480 });
        expect(await fs.inspect(made(photo(60_000, 3, 1000, 1000), "a.jpg", "image/jpeg"), bounded)).toMatchObject({ size: 180_027, width: 1000, height: 1000 });
        expect(await refusal(() => fs.inspect(made(photo(60_000, 3, 1001, 1000), "a.jpg", "image/jpeg"), bounded))).toEqual(over);
        expect(await refusal(() => fs.inspect(made(photo(1000, 0, 30_000, 30_000), "a.jpg", "image/jpeg"), bounded))).toEqual(over);
        expect(await refusal(() => fs.inspect(made(photo(5000, 1, 30_000, 30_000), "a.jpg", "image/jpeg"), bounded))).toEqual(over);
        expect(await refusal(() => fs.inspect(made(photo(60_000, 3, 640, 480).slice(0, 100_000), "a.jpg", "image/jpeg"), bounded))).toEqual(over);
        expect(await fs.inspect(made(photo(60_000, 3, 640, 480).slice(0, 100_000), "a.jpg", "image/jpeg"))).toEqual({ type: "image/jpeg", size: 100_000, name: "a.jpg" });
        expect(await fs.inspect(made(boxed(0, 640, 480), "a.heic", "image/heic"), bounded)).toEqual({ type: "image/heic", size: 44, name: "a.heic", width: 640, height: 480 });
        expect(await fs.inspect(made(boxed(5000, 640, 480), "a.heic", "image/heic"), bounded)).toMatchObject({ width: 640, height: 480 });
        expect(await fs.inspect(made(boxed(100_000, 640, 480), "a.heic", "image/heic"), bounded)).toMatchObject({ width: 640, height: 480 });
        expect(await refusal(() => fs.inspect(made(boxed(100_000, 2000, 2000), "a.heic", "image/heic"), bounded))).toEqual(over);
        expect(await refusal(() => fs.inspect(made(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 4, 67, 103, 66, 73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "a.png", "image/png"), { ...fs.limits, maxPixels: 100 }))).toEqual(["validation", "file.pixels", { file: ["max_pixels:100"] }]);
        expect(await refusal(() => fs.inspect(made(png, "a.png", "image/png"), { ...fs.limits, maxPixels: 143 }, "cover"))).toEqual(["validation", "file.pixels", { cover: ["max_pixels:143"] }]);
        expect(await fs.inspect(made(png, "a.png", "image/png"), { ...fs.limits, maxPixels: 144 })).toMatchObject({ width: 16, height: 9 });
        expect(await fs.inspect(made("hello", "a.txt", "text/plain"), bounded)).toEqual({ type: "text/plain", size: 5, name: "a.txt" });
        expect(await fs.inspect(made("<svg xmlns='http://www.w3.org/2000/svg'/>", "a.svg", "image/svg+xml"), bounded)).toMatchObject({ type: "image/svg+xml" });

    });
    it("check refuses a size, a count or a type with the rule that broke", async () => {

        expect(await refusal(() => fs.check(made("x", "a.png", "image/png"), { maxBytes: 0, maxFiles: 1 }, "f"))).toEqual(["validation", "file.size", { f: ["max:0"] }]);
        expect(await refusal(() => fs.check(made("abc", "a.txt", "text/plain"), { maxBytes: 2, maxFiles: 1 }))).toEqual(["validation", "file.size", { file: ["max:2"] }]);
        expect(await refusal(() => fs.check(made("ab", "a.txt", "text/plain"), { maxBytes: 2, maxFiles: 1 }))).toBeUndefined();
        expect(await refusal(() => fs.check({ uri: "u", name: "a.png", type: "", size: Number.NaN }))).toEqual(["validation", "file.size", { file: ["max:10485760"] }]);
        expect(await refusal(() => fs.check({ uri: "u", name: "a.png", type: "", size: -1 }))).toEqual(["validation", "file.size", { file: ["max:10485760"] }]);
        expect(await refusal(() => fs.check({ uri: "u", name: "a.png", type: "" }))).toBeUndefined();
        expect(await refusal(() => fs.check(made("x", "a.txt", "text/plain"), { maxBytes: 10, maxFiles: 1, types: ["image/*"] }, "f"))).toEqual(["validation", "file.type", { f: ["type"] }]);
        expect(await refusal(() => fs.check({ uri: "u", name: "a.png", type: "" }, { maxBytes: 10, maxFiles: 1, types: [".png"] }))).toBeUndefined();
        expect(await refusal(() => fs.formData({ f: made("x", "a.png", "image/png") }, { maxBytes: 0, maxFiles: 1 }))).toEqual(["validation", "file.size", { f: ["max:0"] }]);
        expect(await refusal(() => fs.formData({ f: [made("x", "a.txt", "text/plain"), made("y", "b.txt", "text/plain")] }, { maxBytes: 10, maxFiles: 1 }))).toEqual(["validation", "file.count", { "f[]": ["max_files:1"] }]);
        expect(await refusal(() => fs.formData({ a: made("x", "a.txt", "text/plain"), b: made("y", "b.txt", "text/plain") }, { maxBytes: 10, maxFiles: 1 }))).toEqual(["validation", "file.count", { b: ["max_files:1"] }]);
        expect(await refusal(() => fs.formData({ f: made("x", "a.txt", "text/plain") }, { maxBytes: 10, maxFiles: 1, types: ["image/*"] }))).toEqual(["validation", "file.type", { f: ["type"] }]);
        expect(await fs.inspect(made("abc", "a.txt", "text/plain"), { maxBytes: 2, maxFiles: 1 }).catch(( failure: unknown ) => failure)).toMatchObject({ code: "validation", reason: "file.size", status: 422 });

    });
    it("form data carries every value as text and every file under a safe name", async () => {

        const data = fs.formData({ a: "text", b: 1, c: true, d: "", e: 10n, f: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)), g: new Date(Number.NaN), h: null, i: undefined, j: () => 1, k: Symbol("k"), l: { z: 1, a: [1, 2] }, m: [1, true, "two", null, new Date(0), { a: 1 }, [3, 4]], q: 0, r: false });
        const sent = fs.formData({ n: made("hi", "../a b?.txt", "text/plain"), o: [made("x", "x.png", "image/png")], p: { uri: "data:text/plain;base64,eW8=", name: '../b".txt', type: "text/plain" } });
        const wire = await new Response(sent).text();
        const held = sent.get("p");

        expect([...data.entries()]).toEqual([["a", "text"], ["b", "1"], ["c", "true"], ["d", ""], ["e", "10"], ["f", "2026-01-02T03:04:05.000Z"], ["l", '{"z":1,"a":[1,2]}'], ["m[]", "1"], ["m[]", "true"], ["m[]", "two"], ["m[]", "1970-01-01T00:00:00.000Z"], ["m[]", '{"a":1}'], ["m[]", "[3,4]"], ["q", "0"], ["r", "false"]]);
        expect(wire.split("\r\n").filter(( line ) => line.startsWith("Content-Disposition"))).toEqual(['Content-Disposition: form-data; name="n"; filename="a b-.txt"', 'Content-Disposition: form-data; name="o[]"; filename="x.png"', 'Content-Disposition: form-data; name="p"; filename="b-.txt"']);
        expect(wire).toContain("\r\n\r\nhi\r\n");
        expect(wire).toContain("\r\n\r\nyo\r\n");
        expect(held instanceof Blob ? [held.size, await held.text()] : held).toEqual([2, "yo"]);
        expect([...fs.formData({}).keys()]).toEqual([]);
        expect([...fs.formData({ list: [] }).keys()]).toEqual([]);
        expect(await refusal(() => fs.formData({ a: made("x", "a.txt", "text/plain") }, { maxBytes: 10, maxFiles: 0 }))).toEqual(["validation", "file.count", { a: ["max_files:0"] }]);
        expect(await refusal(() => fs.formData({ a: [made("x", "a.txt", "text/plain"), "plain", made("x", "b.txt", "text/plain"), made("x", "c.txt", "text/plain")] }, { maxBytes: 10, maxFiles: 2 }))).toEqual(["validation", "file.count", { "a[]": ["max_files:2"] }]);
        expect(await refusal(() => fs.formData({ a: { uri: "u", name: "a.png", type: "image/png", size: 11 } }, { maxBytes: 10, maxFiles: 1 }))).toEqual(["validation", "file.size", { a: ["max:10"] }]);
        expect(await refusal(() => fs.formData({ a: { uri: "u", name: "a.exe", type: "" } }, { maxBytes: 10, maxFiles: 1, types: ["image/*", ".pdf"] }))).toEqual(["validation", "file.type", { a: ["type"] }]);

    });
    it("a data uri is read by the fetch rules and never past its cap", async () => {

        const hello = encoder.encode("hello");
        const read = ( uri: string, max?: number ): unknown => {

            const found = fs.parseDataUri(uri, max);

            return found ? [found.type, [...found.bytes]] : undefined;

        };

        expect(read("data:,hello")).toEqual(["text/plain", [...hello]]);
        expect(read("data:text/plain,a%20b%zz%4")).toEqual(["text/plain", [97, 32, 98, 37, 122, 122, 37, 52]]);
        expect(read("data:text/plain;charset=utf-8,%E2%9C%93")).toEqual(["text/plain", [226, 156, 147]]);
        expect(read("data:,%00%ff")).toEqual(["text/plain", [0, 255]]);
        expect(read("data:,é")).toEqual(["text/plain", [195, 169]]);
        expect(read("data:,")).toEqual(["text/plain", []]);
        expect(["data:;base64,aGVsbG8=", "data:;base64,aGVsbG8", "data:;base64,aGV sbG8=\n", "data:;base64,aGVsbG8==", "data:;base64,aGVsbG8%3D"].map(( uri ) => read(uri))).toEqual(Array.from({ length: 5 }, () => ["text/plain", [...hello]]));
        expect(["data:;base64,_-8", "data:;base64,/+8=", "data:;base64,%2F%2B8%3D"].map(( uri ) => read(uri))).toEqual(Array.from({ length: 3 }, () => ["text/plain", [255, 239]]));
        expect(read("data:;base64,")).toEqual(["text/plain", []]);
        expect(["data:;base64,aGVsbG8===", "data:;base64,a", "data:;base64,aG=Vs", "data:;base64,aGk%ff", "data:;base64,aGk%zz", "data:;base64,aGk*", "data:text/plain", "dat:text/plain,abc", "data", "", "data:text/plain#x,abc"].map(( uri ) => read(uri))).toEqual(Array.from({ length: 11 }, () => undefined));
        expect(["data:image/png;BASE64,iVBORw==", "data:IMAGE/PNG ; base64,iVBORw==", "DATA:image/x-png;base64,iVBORw==", "data:image/png;name=a.png;base64,iVBORw=="].map(( uri ) => read(uri))).toEqual(Array.from({ length: 4 }, () => ["image/png", [137, 80, 78, 71]]));
        expect(read("data:bad type;base64,aGk=")).toEqual(["text/plain", [104, 105]]);
        expect(read("data:base64,aGk=")).toEqual(["text/plain", [97, 71, 107, 61]]);
        expect(read("data:text/html;base64;charset=x,aGk=")).toEqual(["text/html", [97, 71, 107, 61]]);
        expect(read("data:text/plain,abc#frag")).toEqual(["text/plain", [97, 98, 99]]);
        expect(read("data:text/plain;base64,aGk=#frag")).toEqual(["text/plain", [104, 105]]);
        expect(read("data:,a%23b#c")).toEqual(["text/plain", [97, 35, 98]]);
        expect([read(`data:,${"%41".repeat(4)}`, 4), read(`data:,${"%41".repeat(5)}`, 4), read("data:,abcd", 4), read("data:,abcde", 4)]).toEqual([["text/plain", [65, 65, 65, 65]], undefined, ["text/plain", [97, 98, 99, 100]], undefined]);
        expect([read("data:;base64,YWJjZA==", 4), read("data:;base64,YWJjZA", 4), read("data:;base64,YWJjZGU=", 4), read("data:;base64,YWJj", 3), read("data:;base64,YWJj", 2)]).toEqual([["text/plain", [97, 98, 99, 100]], ["text/plain", [97, 98, 99, 100]], undefined, ["text/plain", [97, 98, 99]], undefined]);
        expect([read("data:,", 0), read("data:;base64,", 0), read("data:,a", 0), read("data:;base64,YQ==", 0)]).toEqual([["text/plain", []], ["text/plain", []], undefined, undefined]);
        expect(fs.dataUri("image/png", "iVBORw==")).toBe("data:image/png;base64,iVBORw==");
        expect([await fs.toDataUri(made("hi", "a.txt", "text/plain")), await fs.toDataUri(new Blob(["hi"])), await fs.toDataUri(new Blob(["hi"], { type: "TEXT/Plain;charset=utf-8" })), await fs.toDataUri(new Blob([]))]).toEqual(["data:text/plain;base64,aGk=", "data:application/octet-stream;base64,aGk=", "data:text/plain;base64,aGk=", "data:application/octet-stream;base64,"]);
        expect(read(await fs.toDataUri(new Blob([png], { type: "image/png" })))).toEqual(["image/png", [...png]]);

    });
    it("a data uri becomes a blob or a safely named file, and a blob slices, heads and reads whole", async () => {

        const blob = fs.toBlob("data:image/png;base64,iVBORw==");
        const named = fs.toBlob("data:image/png;base64,iVBORw==", "../a b?.png");
        const bare = fs.toBlob("data:,hi", "");
        const whole = new Blob([encoder.encode("abcdefghij")], { type: "image/png" });

        expect([blob instanceof File, blob?.type, blob?.size, blob ? [...(await fs.bytes(blob))] : []]).toEqual([false, "image/png", 4, [137, 80, 78, 71]]);
        expect([named instanceof File && named.name, named?.type, named?.size]).toEqual(["a b-.png", "image/png", 4]);
        expect([bare instanceof File && bare.name, bare ? await fs.blobText(bare) : ""]).toEqual(["file", "hi"]);
        expect([fs.toBlob("nope"), fs.toBlob("data:;base64,a"), fs.toBlob("", "a.png")]).toEqual([undefined, undefined, undefined]);
        expect(fs.slices(whole, 4).map(( one ) => [one.index, one.start, one.end, one.blob.size, one.blob.type])).toEqual([[0, 0, 4, 4, "image/png"], [1, 4, 8, 4, "image/png"], [2, 8, 10, 2, "image/png"]]);
        expect(fs.slices(whole, 5).map(( one ) => [one.index, one.start, one.end])).toEqual([[0, 0, 5], [1, 5, 10]]);
        expect(fs.slices(whole, 100).map(( one ) => [one.index, one.start, one.end])).toEqual([[0, 0, 10]]);
        expect(fs.slices(new Blob([]), 4)).toEqual([]);
        expect(await Promise.all(fs.slices(whole, 3).map(( one ) => one.blob.text()))).toEqual(["abc", "def", "ghi", "j"]);
        expect(fs.slices(new Blob([new Uint8Array(10_000)]), 1)).toHaveLength(10_000);

        for ( const size of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY] ) expect(() => fs.slices(whole, size)).toThrow(new RangeError("not a size"));

        expect(() => fs.slices(new Blob([new Uint8Array(10_001)]), 1)).toThrow(new RangeError("not a size"));
        expect([(await fs.head(new Blob([new Uint8Array(5000)]))).length, (await fs.head(whole, 2)).length, (await fs.head(new Blob([]))).length, [...(await fs.head(whole, 3))]]).toEqual([4100, 2, 0, [97, 98, 99]]);
        expect([[...(await fs.bytes(new Blob(["hi"])))], await fs.blobText(new Blob(["é"])), (await fs.bytes(new Blob([]))).length]).toEqual([[104, 105], "é", 0]);
        expect([0, 1, 1023, 1024, 1536, 1_048_576, 10_485_760, 1_073_741_824].map(( size ) => fs.human(size))).toEqual(["0 B", "1 B", "1023 B", "1 KB", "1.5 KB", "1 MB", "10 MB", "1 GB"]);
        expect([{ uri: "u", name: "n", type: "t" }, { uri: "u", name: "n", type: "t", size: 0 }, Object.assign(Object.create(null), { uri: "u", name: "n", type: "t" }), { uri: "u", name: "n", type: "t", size: -1 }, { uri: "u", name: "n", type: "t", size: Number.NaN }, { uri: "u", name: "n", type: "t", size: "1" }, { uri: "u", name: "n" }, { uri: 1, name: "n", type: "t" }, null, "x", [], new Blob([])].map(( one ) => fs.isRef(one))).toEqual([true, true, true, false, false, false, false, false, false, false, false, false]);

    });
    it("imageSize reads every raster header it knows, turned by its orientation, and nothing short or empty", () => {

        const turned = ( little: boolean, orientation: number ): Uint8Array<ArrayBuffer> => {

            const pair = ( value: number ): number[] => (little ? [value & 255, value >> 8] : [value >> 8, value & 255]);
            const quad = ( value: number ): number[] => (little ? [...pair(value), 0, 0] : [0, 0, ...pair(value)]);

            return filled(57, [[0, [0xff, 0xd8, 0xff, 0xe1, 0, 34]], [6, "Exif"], [12, little ? "II" : "MM"], [14, pair(42)], [16, quad(8)], [20, pair(1)], [22, pair(0x0112)], [24, pair(3)], [26, quad(1)], [30, pair(orientation)], [38, [0xff, 0xc0, 0, 17, 8, 1, 224, 2, 128]]]);

        };
        const riff = ( kind: string, parts: readonly (readonly [number, readonly number[]])[] ): Uint8Array<ArrayBuffer> => filled(30, [[0, "RIFF"], [8, "WEBP"], [12, kind], ...parts]);
        const boxes = filled(64, [[0, [0, 0, 0, 24]], [4, "ftypheic"], [28, "ispe"], [36, [0, 0, 0, 160, 0, 0, 0, 120]], [48, "ispe"], [56, [0, 0, 2, 128, 0, 0, 1, 224]]]);

        expect(fs.imageSize(filled(26, [[0, "BM"], [18, [200, 0, 0, 0]], [22, [0x9c, 0xff, 0xff, 0xff]]]))).toEqual({ width: 200, height: 100, type: "image/bmp" });
        expect(fs.imageSize(filled(25, [[0, "BM"], [18, [200, 0, 0, 0]], [22, [100, 0, 0]]]))).toBeUndefined();
        expect(fs.imageSize(new Uint8Array([0, 0, 1, 0, 1, 0, 16, 0]))).toEqual({ width: 16, height: 256, type: "image/x-icon" });
        expect(fs.imageSize(new Uint8Array([0, 0, 1, 0, 1, 0, 16]))).toBeUndefined();
        expect(fs.imageSize(riff("VP8 ", [[26, [0x40, 0xc1]], [28, [0xf0, 0]]]))).toEqual({ width: 320, height: 240, type: "image/webp" });
        expect(fs.imageSize(riff("VP8X", [[24, [0x3f, 1, 0]], [27, [0xef, 0, 0]]]))).toEqual({ width: 320, height: 240, type: "image/webp" });
        expect(fs.imageSize(riff("VP8L", [[20, [0x2f, 0x3f, 0xc1, 0x3b, 0]]]))).toEqual({ width: 320, height: 240, type: "image/webp" });
        expect(fs.imageSize(riff("VP8Z", []))).toBeUndefined();
        expect(fs.imageSize(riff("VP8 ", []))).toBeUndefined();
        expect(fs.imageSize(riff("VP8X", [[24, [0x3f, 1, 0]]]).slice(0, 29))).toBeUndefined();
        expect(fs.imageSize(boxes)).toEqual({ width: 640, height: 480, type: "image/heic" });
        expect(fs.imageSize(boxes.slice(0, 44))).toEqual({ width: 160, height: 120, type: "image/heic" });
        expect(fs.imageSize(boxes.slice(0, 43))).toBeUndefined();
        expect(fs.imageSize(turned(false, 6))).toEqual({ width: 480, height: 640, type: "image/jpeg", orientation: 6 });
        expect(fs.imageSize(turned(true, 8))).toEqual({ width: 480, height: 640, type: "image/jpeg", orientation: 8 });
        expect(fs.imageSize(turned(true, 3))).toEqual({ width: 640, height: 480, type: "image/jpeg", orientation: 3 });
        expect(fs.imageSize(turned(false, 1))).toEqual({ width: 640, height: 480, type: "image/jpeg", orientation: 1 });
        expect(fs.imageSize(turned(false, 9))).toEqual({ width: 640, height: 480, type: "image/jpeg" });
        expect(fs.imageSize(turned(false, 0))).toEqual({ width: 640, height: 480, type: "image/jpeg" });
        expect(fs.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc4, 0, 4, 0, 0, 0xff, 0xff, 0xc2, 0, 17, 8, 0, 20, 0, 30]))).toEqual({ width: 30, height: 20, type: "image/jpeg" });
        expect(fs.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc4, 0, 4, 0, 0, 0xff, 0xff, 0xc2, 0, 17, 8, 0, 20, 0]))).toBeUndefined();
        expect(fs.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xc0, 0, 17, 8, 0, 20, 0, 30]))).toBeUndefined();
        expect(fs.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 0xff, 0xc0, 0, 17, 8, 0, 20, 0, 30]))).toBeUndefined();
        expect(fs.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 0, 0, 30]))).toBeUndefined();
        expect(fs.imageSize(new Uint8Array([9, 9, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 3, 0, 2, 0]).subarray(2))).toEqual({ width: 3, height: 2, type: "image/gif" });
        expect(fs.imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 2, 0]))).toBeUndefined();
        expect(fs.imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 3, 0, 2]))).toBeUndefined();
        expect(fs.imageSize(png.slice(0, 23))).toBeUndefined();
        expect(fs.imageSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 68, 65, 84, 0, 0, 0, 16, 0, 0, 0, 9]))).toBeUndefined();
        expect([new Uint8Array(0), encoder.encode("hello"), encoder.encode("%PDF-1.7"), encoder.encode("<svg width='10' height='10'/>")].map(( data ) => fs.imageSize(data))).toEqual([undefined, undefined, undefined, undefined]);

    });
    it("a removal or an emptying never reaches a root, and a refused one leaves the tree whole", async () => {

        await fs.disk.with(fs.memoryDisk(), async () => {

            await fs.write("/app/a.txt", "one");
            await fs.write("/app/sub/b.txt", "two");

            for ( const path of ["/", ".", "..", "//", "/..", "a/..", "./", "C:/", "C:", "../..", "/app/.."] ) expect([path, await told(() => fs.remove(path))]).toEqual([path, "forbidden/fs.root"]);
            for ( const path of ["/", ".", "a/..", "C:/"] ) expect([path, await told(() => fs.empty(path))]).toEqual([path, "forbidden/fs.root"]);
            for ( const path of ["", "a\u0000b"] ) expect([path, await told(() => fs.remove(path)), await told(() => fs.empty(path))]).toEqual([path, "validation/fs.path", "validation/fs.path"]);

            expect((await fs.walk("/")).map(( entry ) => entry.path)).toEqual(["/app", "/app/a.txt", "/app/sub", "/app/sub/b.txt"]);
            expect([await told(() => fs.remove("/never")), await told(() => fs.empty("/app/a.txt"))]).toEqual(["ok", "conflict/fs.kind"]);
            await fs.empty("/fresh/deep");
            expect(await fs.isDir("/fresh/deep")).toBe(true);
            await fs.empty("/app");
            expect([await fs.isDir("/app"), await fs.entries("/app")]).toEqual([true, []]);
            await fs.remove("/app/../fresh");
            expect((await fs.entries("/")).map(( entry ) => entry.name)).toEqual(["app"]);

        });

        const lenient: fs.Disk = { ...fs.memoryDisk(), list: async () => [] };

        await fs.disk.with(lenient, async () => {

            await fs.write("/a.txt", "one");
            expect([await told(() => fs.empty("/a.txt")), await fs.text("/a.txt")]).toEqual(["conflict/fs.kind", "one"]);

        });

    });

    it("move and copy refuse a root, a folder into itself and a missing source before they make anything", async () => {

        const moves: readonly (readonly [string, string, string])[] = [
            ["/", "/x", "forbidden/fs.root"],
            [".", "/x", "forbidden/fs.root"],
            ["/app", "/", "conflict/fs.exists"],
            ["/app", "/app/sub/in", "conflict/fs.inside"],
            ["/app", "/app/far/in/x", "conflict/fs.inside"],
            ["/app", "/app/a.txt/in", "conflict/fs.inside"],
            ["/app/a.txt", "/app/a.txt/in", "conflict/fs.kind"],
            ["/missing", "/new/dir/x", "not_found/fs.missing"],
            ["/app/a.txt", "/j", "conflict/fs.kind"],
            ["/j", "/bin", "conflict/fs.kind"],
            ["", "/x", "validation/fs.path"],
            ["/x", "", "validation/fs.path"],
            ["/app/a.txt", "/app/a.txt", "ok"],
        ];
        const copies: readonly (readonly [string, string, string])[] = [
            ["/app", "/app/sub/in", "conflict/fs.inside"],
            ["/", "/q", "conflict/fs.inside"],
            ["/app/a.txt", "/app/a.txt", "ok"],
            ["/app/sub", "/app/a.txt", "conflict/fs.kind"],
            ["/app/a.txt", "/app/sub", "conflict/fs.kind"],
            ["/app/a.txt", "/", "conflict/fs.kind"],
            ["/missing", "/made/dir/x", "not_found/fs.missing"],
            ["", "/x", "validation/fs.path"],
            ["/x", "", "validation/fs.path"],
            ["/app/sub", "/copy", "ok"],
        ];

        await fs.disk.with(fs.memoryDisk(), async () => {

            await fs.write("/app/a.txt", "one");
            await fs.write("/app/sub/b.txt", "two");
            await fs.write("/j/p.json", "{}");
            await fs.write("/bin", new Uint8Array([0, 255, 1]));
            await fs.write("/held", "old");

            for ( const [from, to, answer] of moves ) expect([from, to, await told(() => fs.move(from, to))]).toEqual([from, to, answer]);
            for ( const [from, to, answer] of copies ) expect([from, to, await told(() => fs.copy(from, to))]).toEqual([from, to, answer]);

            expect([await fs.exists("/new"), await fs.exists("/made"), await fs.exists("/x"), await fs.exists("/q"), await fs.text("/app/a.txt")]).toEqual([false, false, false, false, "one"]);
            expect([await fs.exists("/app/far"), (await fs.entries("/app")).map(( entry ) => entry.name)]).toEqual([false, ["a.txt", "sub"]]);
            expect([(await fs.walk("/copy")).map(( entry ) => entry.relative), await fs.text("/copy/b.txt")]).toEqual([["b.txt"], "two"]);
            await fs.write("/copy/b.txt", "new");
            expect(await fs.text("/app/sub/b.txt")).toBe("two");
            await fs.move("/bin", "/held");
            expect([[...(await fs.read("/held"))], await fs.exists("/bin")]).toEqual([[0, 255, 1], false]);
            await fs.move("/app/sub", "/far/away/sub");
            expect([(await fs.walk("/far")).map(( entry ) => entry.relative), await fs.exists("/app/sub")]).toEqual([["away", "away/sub", "away/sub/b.txt"], false]);

        });

    });

    it("walk, files and find list a tree in name order, pruned, bounded and never through a link", async () => {

        const inner = fs.memoryDisk();
        const disk: fs.Disk = { ...inner, list: async ( path ) => (await inner.list(path)).map(( entry ) => (entry.name === "link" ? { ...entry, kind: "link" as const } : entry.name === "odd" ? { ...entry, kind: "other" as const } : entry)) };
        const names = ( found: readonly { relative: string }[] ): string[] => found.map(( entry ) => entry.relative);

        await fs.disk.with(disk, async () => {

            for ( const path of ["/r/link/in.txt", "/r/odd", "/r/b/B.txt", "/r/b/a.txt", "/r/.hidden/h.txt", "/r/a.txt"] ) await fs.write(path, "x");

            expect((await fs.walk("/r")).map(( entry ) => `${entry.kind}:${entry.relative}`)).toEqual(["dir:.hidden", "file:.hidden/h.txt", "file:a.txt", "dir:b", "file:b/B.txt", "file:b/a.txt", "link:link", "other:odd"]);
            expect((await fs.entries("/r")).map(( entry ) => `${entry.kind}:${entry.path}`)).toEqual(["dir:/r/.hidden", "file:/r/a.txt", "dir:/r/b", "link:/r/link", "other:/r/odd"]);
            expect((await fs.walk("/r")).map(( entry ) => [entry.name, entry.path])).toContainEqual(["B.txt", "/r/b/B.txt"]);
            expect(names(await fs.files("/r"))).toEqual([".hidden/h.txt", "a.txt", "b/B.txt", "b/a.txt"]);
            expect(names(await fs.walk("/r", ( entry, relative ) => entry.name.startsWith(".") || relative === "b/a.txt"))).toEqual(["a.txt", "b", "b/B.txt", "link", "odd"]);
            expect(names(await fs.walk("/r", { prune: ( entry ) => entry.kind === "dir", depth: 9 }))).toEqual(["a.txt", "link", "odd"]);
            expect(names(await fs.find("/r", "**/*.txt"))).toEqual([".hidden/h.txt", "a.txt", "b/B.txt", "b/a.txt"]);
            expect(names(await fs.find("/r", "**/*.txt", { dot: false }))).toEqual(["a.txt", "b/B.txt", "b/a.txt"]);
            expect(names(await fs.find("/r", ["**/*.txt", "!b/**"], ( entry ) => entry.name === ".hidden"))).toEqual(["a.txt"]);
            expect(names(await fs.find("/r", "B/*.TXT", { insensitive: true, depth: 2 }))).toEqual(["b/B.txt", "b/a.txt"]);
            expect(names(await fs.find("/r", "B/*.TXT"))).toEqual([]);
            expect(names(await fs.find("/r", "**/*.txt", { depth: 1 }))).toEqual(["a.txt"]);
            expect(await fs.size("/r")).toBe(4);

            for ( const [depth, seen] of [[0, 5], [1, 5], [2, 8], [-1, 5], [Number.NaN, 5], [Number.POSITIVE_INFINITY, 8], [300, 8]] as const ) expect([depth, (await fs.walk("/r", { depth })).length]).toEqual([depth, seen]);

            expect([await told(() => fs.walk("/r/a.txt")), await told(() => fs.walk("/none")), await told(() => fs.files("/none")), await told(() => fs.find("/none", "*")), await told(() => fs.entries("/none")), await told(() => fs.entries("/r/a.txt"))]).toEqual(["conflict/fs.kind", "not_found/fs.missing", "not_found/fs.missing", "not_found/fs.missing", "not_found/fs.missing", "conflict/fs.kind"]);

        });

    });

    it("text, lines and json read one file the same way and refuse what is not json", async () => {

        await fs.disk.with(fs.memoryDisk(), async () => {

            await fs.write("rel/../x.txt", "abc");
            await fs.write("/l/a", "a\r\nb\rc\n\n");
            await fs.write("/l/b", "");
            await fs.write("/l/c", "\n");
            await fs.write("/bin", new Uint8Array([0, 255, 1]));
            await fs.writeJson("/j/p.json", { b: 1, a: [1, { c: 2 }] });
            await fs.writeJson("/j/c.json", { b: 1, a: [1] }, false);
            await fs.write("/j/null.json", "null");
            await fs.write("/j/bad.json", "{bad");
            await fs.write("/j/none.json", "");
            await fs.write("/j/bom.json", "\ufeff{\"a\":1}");

            expect([await fs.text("/x.txt"), await fs.lines("/l/a"), await fs.lines("/l/b"), await fs.lines("/l/c"), [...(await fs.read("/bin"))]]).toEqual(["abc", ["a", "b", "c", ""], [], [""], [0, 255, 1]]);
            expect((await fs.text("/j/p.json")).split("\n")).toEqual(["{", "  \"b\": 1,", "  \"a\": [", "    1,", "    {", "      \"c\": 2", "    }", "  ]", "}", ""]);
            expect(await fs.text("/j/c.json")).toBe("{\"b\":1,\"a\":[1]}\n");
            expect([await fs.readJson("/j/null.json"), await fs.readJson("/j/bom.json"), await fs.readJson("/j/p.json")]).toEqual([null, { a: 1 }, { b: 1, a: [1, { c: 2 }] }]);
            expect([await told(() => fs.readJson("/j/bad.json")), await told(() => fs.readJson("/j/none.json")), await told(() => fs.readJson("/j/gone.json")), await told(() => fs.readJson("/j")), await told(() => fs.lines("/gone")), await told(() => fs.text("/j"))]).toEqual(["validation/fs.json", "validation/fs.json", "not_found/fs.missing", "conflict/fs.kind", "not_found/fs.missing", "conflict/fs.kind"]);

        });

    });
    it("writeAtomic, update, edit and append replace a file whole or leave it as it was", async () => {

        const inner = fs.memoryDisk();
        const draft = /\.[A-Za-z0-9_-]{4,}\.tmp/g;
        const seen: string[] = [];
        const removed: string[] = [];
        const disk: fs.Disk = {
            ...inner,
            write: async ( path, content, append ) => {

                seen.push(path.replace(draft, ".N.tmp"));
                await inner.write(path, content, append);

            },
            rename: async ( from, to ) => {

                seen.push(`${from.replace(draft, ".N.tmp")} -> ${to}`);
                await inner.rename(from, to);

            },
        };
        const stuck: fs.Disk = {
            ...inner,
            rename: async () => {

                throw hosted("EACCES");

            },
            remove: async ( path, recursive ) => {

                removed.push(path.replace(draft, ".N.tmp"));
                await inner.remove(path, recursive);

            },
        };

        await fs.disk.with(disk, async () => {

            await fs.writeAtomic("/deep/dir/a.txt", "one");
            expect(seen).toEqual(["/deep/dir/.a.txt.N.tmp", "/deep/dir/.a.txt.N.tmp -> /deep/dir/a.txt"]);
            expect([await fs.update("/deep/dir/a.txt", "one"), await fs.update("/deep/dir/a.txt", "two"), await fs.update("/deep/new/x", ""), await fs.update("/deep/new/x", ""), await told(() => fs.update("/deep/dir", "x"))]).toEqual([false, true, true, false, "conflict/fs.kind"]);
            expect([await fs.edit("/deep/e.txt", ( text ) => `${text}!`), await fs.text("/deep/e.txt"), await fs.edit("/deep/e.txt", ( text ) => text), await fs.edit("/deep/e.txt", async ( text ) => `${text}?`), await fs.text("/deep/e.txt")]).toEqual([true, "!", false, true, "!?"]);
            await fs.append("/deep/log", "a");
            await fs.append("/deep/log", "b");
            expect([await fs.text("/deep/log"), await fs.text("/deep/dir/a.txt")]).toEqual(["ab", "two"]);
            expect([await told(() => fs.append("/deep/dir", "x")), await told(() => fs.writeAtomic("/deep/dir", "x")), await told(() => fs.writeAtomic("/", "x")), await told(() => fs.write("/", "x")), await told(() => fs.write("/deep/dir", "x")), await told(() => fs.write("/deep/dir/a.txt/in", "x"))]).toEqual(Array.from({ length: 6 }, () => "conflict/fs.kind"));
            expect((await fs.walk("/")).map(( entry ) => entry.path)).toEqual(["/deep", "/deep/dir", "/deep/dir/a.txt", "/deep/e.txt", "/deep/log", "/deep/new", "/deep/new/x"]);
            expect(seen.filter(( path ) => path.endsWith(".tmp")).every(( path ) => fs.dirname(path) === "/deep" || fs.dirname(path) === "/deep/dir" || fs.dirname(path) === "/deep/new" || fs.dirname(path) === "/")).toBe(true);

        });
        await fs.disk.with(stuck, async () => {

            expect(await told(() => fs.writeAtomic("/d/a.txt", "one"))).toBe("forbidden/fs.denied");
            expect([removed, await fs.entries("/d"), await fs.text("/deep/dir/a.txt")]).toEqual([["/d/.a.txt.N.tmp"], [], "two"]);
            expect(await told(() => fs.writeAtomic("/deep/dir/a.txt", "three"))).toBe("forbidden/fs.denied");
            expect([await fs.text("/deep/dir/a.txt"), (await fs.entries("/deep/dir")).map(( entry ) => entry.name)]).toEqual(["two", ["a.txt"]]);

        });

    });

    it("same, size and digest read content, and stat tells a file from a folder from nothing", async () => {

        await fs.disk.with(fs.memoryDisk(), async () => {

            await fs.write("/app/a.txt", "abc");
            await fs.write("/app/sub/b.txt", "two");
            await fs.write("/app/sub/c.txt", "abc");
            await fs.write("/app/sub/d.txt", "abd");

            const file = await fs.stat("/app/a.txt");
            const folder = await fs.stat("/app");

            expect([await fs.same("/app/a.txt", "/app/a.txt"), await fs.same("/app/a.txt", "/app/sub/c.txt"), await fs.same("/app/a.txt", "/app/sub/d.txt"), await fs.same("/app/a.txt", "/app/sub/b.txt"), await fs.same("/app", "/app"), await fs.same("/nope", "/nope"), await fs.same("/app/a.txt", "/nope")]).toEqual([true, true, false, false, false, false, false]);
            expect([await fs.size("/app/sub"), await fs.size("/app"), await fs.size("/app/a.txt"), await told(() => fs.size("/nope"))]).toEqual([9, 12, 3, "not_found/fs.missing"]);
            expect([await fs.digest("/app/a.txt"), await fs.digest("/app/sub/c.txt"), await fs.digest("/app/a.txt", "SHA-1")]).toEqual(["ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "a9993e364706816aba3e25717850c26c9cd0d89d"]);
            expect([await told(() => fs.digest("/nope")), await told(() => fs.digest("/app"))]).toEqual(["not_found/fs.missing", "conflict/fs.kind"]);
            expect([file?.kind, file?.size, typeof file?.modified, folder?.kind, folder?.size, await fs.stat("/nope")]).toEqual(["file", 3, "number", "dir", 0, undefined]);
            expect([await fs.isFile("/app"), await fs.isDir("/app"), await fs.isFile("/app/a.txt"), await fs.isDir("/app/a.txt"), await fs.exists("/app"), await fs.exists("/nope"), await fs.isDir("/nope"), await fs.isFile("/nope")]).toEqual([false, true, true, false, true, false, false, false]);
            expect([await told(() => fs.read("/app")), await told(() => fs.read("/nope")), await told(() => fs.ensure("/app/a.txt/x")), await fs.ensure("/made//x/../y/"), await fs.ensure("/"), await fs.ensure("/app"), await fs.isDir("/made/y")]).toEqual(["conflict/fs.kind", "not_found/fs.missing", "conflict/fs.kind", "/made/y", "/", "/app", true]);

        });

    });

    it("temp folders stay under the temp root, and withTemp removes its folder on return and on throw", async () => {

        const kept: string[] = [];

        await fs.disk.with(fs.memoryDisk(), async () => {

            expect([await fs.temp(), await fs.temp("up-"), await fs.temp("../../etc/x-"), await fs.temp(""), await fs.temp("a/b"), (await fs.temp("x".repeat(200))).length]).toEqual(["/tmp/engine-1", "/tmp/up-2", "/tmp/etc-x-3", "/tmp/engine-4", "/tmp/a-b5", 70]);
            expect(await fs.withTemp(async ( path ) => {

                await fs.write(fs.join(path, "f"), "x");

                return [path, await fs.isDir(path), await fs.text(fs.join(path, "f"))];

            }, "w-")).toEqual(["/tmp/w-7", true, "x"]);
            expect(await fs.exists("/tmp/w-7")).toBe(false);
            expect(await refusal(() => fs.withTemp(async ( path ) => {

                kept.push(path);
                await fs.write(fs.join(path, "f"), "x");

                throw new RangeError("boom");

            }))).toBeInstanceOf(RangeError);
            expect([kept, await fs.exists("/tmp/engine-8"), (await fs.entries("/tmp")).length]).toEqual([["/tmp/engine-8"], false, 6]);

        });

    });

    it("a host failure becomes one fault by its code, and a fault passes through untouched", async () => {

        const mine = error.fault("locked", "mine", { message: "kept" });
        const table: readonly (readonly [string, string, string])[] = [
            ["ENOENT", "not_found", "fs.missing"],
            ["EACCES", "forbidden", "fs.denied"],
            ["EPERM", "forbidden", "fs.denied"],
            ["EROFS", "forbidden", "fs.denied"],
            ["EEXIST", "conflict", "fs.exists"],
            ["ENOTEMPTY", "conflict", "fs.exists"],
            ["EISDIR", "conflict", "fs.kind"],
            ["ENOTDIR", "conflict", "fs.kind"],
            ["ERR_FS_EISDIR", "conflict", "fs.kind"],
            ["ENOSPC", "unavailable", "fs.full"],
            ["EDQUOT", "unavailable", "fs.full"],
            ["EBUSY", "locked", "fs.busy"],
            ["ENAMETOOLONG", "validation", "fs.path"],
            ["EIO", "internal", "fs.failed"],
            ["", "internal", "fs.failed"],
        ];
        const failing = ( thrown: unknown ): fs.Disk => ({
            ...fs.memoryDisk(),
            read: async () => {

                throw thrown;

            },
        });
        const read = async ( thrown: unknown ): Promise<unknown> => {

            const failure = await fs.disk.with(failing(thrown), () => fs.read("/a/../x")).catch(( caught: unknown ) => caught);

            return failure instanceof error.Fault ? [failure.code, failure.reason, failure.message, failure.cause === thrown] : failure;

        };

        for ( const [code, kind, reason] of table ) expect([code, await read(hosted(code))]).toEqual([code, [kind, reason, "/x", true]]);

        expect(await read(hosted("EACCES", "/secret"))).toEqual(["forbidden", "fs.denied", "/secret", true]);
        expect(await read("text")).toEqual(["internal", "fs.failed", "/x", true]);
        expect(await read(null)).toEqual(["internal", "fs.failed", "/x", true]);
        expect(await read({ code: 7 })).toEqual(["internal", "fs.failed", "/x", true]);
        expect(await fs.disk.with(failing(mine), () => fs.read("/x")).catch(( caught: unknown ) => caught)).toBe(mine);
        expect(await told(() => fs.disk.with({
            ...fs.memoryDisk(),
            read: () => {

                throw hosted("EBUSY");

            },
        }, () => fs.read("/x")))).toBe("locked/fs.busy");
        expect(await told(() => fs.disk.with({
            ...fs.memoryDisk(),
            temp: async () => {

                throw hosted("EACCES");

            },
        }, () => fs.temp("a")))).toBe("forbidden/fs.denied");

    });

    it("a move across devices falls back to a copy and a removal", async () => {

        const disk: fs.Disk = {
            ...fs.memoryDisk(),
            rename: async () => {

                throw hosted("EXDEV");

            },
        };

        await fs.disk.with(disk, async () => {

            await fs.write("/a/one.txt", "one");
            await fs.write("/a/deep/two.txt", "two");
            await fs.move("/a", "/b/c");
            expect([(await fs.walk("/")).map(( entry ) => entry.path), await fs.text("/b/c/deep/two.txt")]).toEqual([["/b", "/b/c", "/b/c/deep", "/b/c/deep/two.txt", "/b/c/one.txt"], "two"]);
            await fs.move("/b/c/one.txt", "/z.txt");
            expect([(await fs.walk("/")).map(( entry ) => entry.path), await fs.text("/z.txt")]).toEqual([["/b", "/b/c", "/b/c/deep", "/b/c/deep/two.txt", "/z.txt"], "one"]);

        });

    });

    it("the memory disk hands out copies, and an unbound port refuses every verb", async () => {

        const disk = fs.memoryDisk();
        const bytes = new Uint8Array([1, 2, 3]);
        const undo = fs.disk.use(disk);

        try {

            await fs.write("/held", bytes);
            bytes[0] = 9;

            const back = await fs.read("/held");

            back[1] = 9;
            expect([[...(await fs.read("/held"))], [...back], [...disk.files.keys()]]).toEqual([[1, 2, 3], [1, 9, 3], ["/held"]]);

        } finally {

            undo();

        }

        expect<unknown[]>(await Promise.all([told(() => fs.read("/held")), told(() => fs.temp()), told(() => fs.walk("/")), told(() => fs.remove("/held")), told(() => fs.exists("/held")), told(() => fs.stat("/held")), told(() => fs.write("/held", "x"))])).toEqual(Array.from({ length: 7 }, () => "unavailable/fs.disk.unbound"));
        expect([...disk.files.keys()]).toEqual(["/held"]);
        expect(() => fs.disk.get()).toThrow(error.Fault);

        const bare = fs.memoryDisk();

        await bare.write("/a/b.txt", "one");
        await bare.remove("/", true);
        expect([(await bare.stat("/"))?.kind, await bare.list("/"), await bare.stat("/a")]).toEqual(["dir", [], undefined]);
        await bare.write("/c.txt", "two");
        expect((await bare.list("/")).map(( entry ) => entry.name)).toEqual(["c.txt"]);

    });

    it("every verb refuses an empty or unreadable path before the disk is asked to change anything", async () => {

        const touched: string[] = [];
        const disk = new Proxy(fs.memoryDisk(), {
            get: ( target, key, receiver ) => {

                touched.push(String(key));

                return Reflect.get(target, key, receiver);

            },
        });

        await fs.disk.with(disk, async () => {

            touched.length = 0;

            for ( const path of ["", "a\u0000b", 1 as unknown as string] ) {

                const verbs: readonly (() => unknown)[] = [
                    () => fs.read(path), () => fs.text(path), () => fs.lines(path), () => fs.readJson(path), () => fs.write(path, "x"), () => fs.writeJson(path, 1), () => fs.writeAtomic(path, "x"), () => fs.append(path, "x"), () => fs.update(path, "x"), () => fs.edit(path, ( text ) => text),
                    () => fs.stat(path), () => fs.exists(path), () => fs.isFile(path), () => fs.isDir(path), () => fs.entries(path), () => fs.ensure(path), () => fs.empty(path), () => fs.remove(path), () => fs.walk(path), () => fs.files(path), () => fs.find(path, "*"), () => fs.size(path), () => fs.digest(path),
                    () => fs.same(path, "/x"), () => fs.same("/x", path), () => fs.copy(path, "/x"), () => fs.copy("/x", path), () => fs.move(path, "/x"), () => fs.move("/x", path),
                ];

                for ( const [at, verb] of verbs.entries() ) expect([at, await told(verb)]).toEqual([at, "validation/fs.path"]);

            }

            expect([...new Set(touched)]).toEqual(["stat"]);

        });

    });
});
