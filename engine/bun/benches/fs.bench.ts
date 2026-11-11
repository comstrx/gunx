import * as fs from "engine/fs";
import { bench, do_not_optimize, run } from "mitata";

const encoder = new TextEncoder();
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 16, 0, 0, 0, 9]);
const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 16, 0, 9, 0]);
const pdf = encoder.encode("%PDF-1.7\n1 0 obj\n");
const page = encoder.encode(`<!DOCTYPE html><html><head><title>a</title></head><body>${"<p>text</p>".repeat(300)}</body></html>`);
const prose = encoder.encode("plain words and nothing else. ".repeat(140));
const noise = new Uint8Array(65_536).map(( _, at ) => (at * 131 + 7) % 251);
const near = photo(64, 2, 640, 480);
const far = photo(4000, 3, 640, 480);
const base = btoa(String.fromCharCode(...png));
const small = fs.dataUri("image/png", base);
const large = fs.dataUri("text/plain", btoa("a".repeat(48_000)));
const escaped = "data:text/plain;charset=utf-8,hello%20world%21%20and%20more%20text#top";
const picture = new File([png], "photo.png", { type: "image/png" });
const distant = new File([far], "photo.jpg", { type: "image/jpeg" });
const forged = new File([page], "photo.png", { type: "image/png" });
const heavy = new Blob([noise]);
const ref: fs.FileRef = { uri: small, name: "photo.png", type: "image/png", size: png.byteLength };
const images: fs.Limits = { maxBytes: 1_048_576, maxFiles: 4, types: ["image/*"], maxPixels: 4_000_000 };
const tight: fs.Limits = { maxBytes: 16, maxFiles: 1, types: [".pdf"] };
const fields = { title: "an order", count: 3, paid: true, at: new Date(0), tags: ["a", "b", "c"], owner: { id: 7, name: "a" }, file: picture, proof: ref };
const deep = `${"../".repeat(64)}${"a/./b//".repeat(64)}c.txt`;
const marked = `${String.fromCharCode(0x202e).repeat(100)}con${".".repeat(300)}`;
const taken = new Set(Array.from({ length: 200 }, ( _, at ) => (at === 0 ? "docs/a.txt" : `docs/a (${at + 1}).txt`)));
const sources = ["src/features/orders/index.tsx", "src/features/orders/hooks/use-orders.ts", "src/features/billing/index.tsx", "src/shared/ui/button.tsx"];
const matcher = fs.glob("src/**/*.{ts,tsx}");
const listed = fs.glob(["src/**/*.ts", "src/**/*.tsx", "!**/*.test.ts", "!**/node_modules/**"]);
const loose = fs.glob("SRC/**/*.TSX", { insensitive: true });
const stars = "a".repeat(256);
const disk = fs.memoryDisk();
const note = "one line\nanother line\nand a third\n".repeat(40);
let turn = 0;

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
function refused ( work: () => unknown ): unknown {

    try {

        return work();

    } catch ( failure ) {

        return failure;

    }

}
async function declined ( work: () => Promise<unknown> ): Promise<unknown> {

    try {

        return await work();

    } catch ( failure ) {

        return failure;

    }

}

fs.disk.use(disk);

for ( let at = 0; at < 120; at += 1 ) await fs.write(`/app/src/feature-${at % 12}/part-${at}.ts`, `export const part = ${at};\n`);

await fs.write("/app/notes.txt", note);
await fs.write("/app/twin.txt", note);
await fs.write("/app/other.txt", `${note}!`);
await fs.writeJson("/app/package.json", { name: "app", version: "1.0.0", scripts: { build: "build", test: "test" }, files: ["src"] });
await fs.ensure("/app/void");

bench("fs.normalize", () => do_not_optimize(fs.normalize("/a/./b/../c//d/e.txt")));
bench("fs.normalize.clean", () => do_not_optimize(fs.normalize("src/features/orders/index.tsx")));
bench("fs.normalize.drive", () => do_not_optimize(fs.normalize("C:\\Users\\a\\..\\b\\c.txt")));
bench("fs.normalize.deep", () => do_not_optimize(fs.normalize(deep)));
bench("fs.isAbsolute", () => do_not_optimize(fs.isAbsolute("/app/src/index.ts")));
bench("fs.join", () => do_not_optimize(fs.join("/app", "src", "../lib", "index.ts")));
bench("fs.resolve", () => do_not_optimize(fs.resolve("/app/src", "../lib", "index.ts")));
bench("fs.resolve.rooted", () => do_not_optimize(fs.resolve("/app/src", "/etc", "hosts")));
bench("fs.segments", () => do_not_optimize(fs.segments("/app/src/features/orders/index.tsx")));
bench("fs.depth", () => do_not_optimize(fs.depth("/app/src/features/orders/index.tsx")));
bench("fs.basename", () => do_not_optimize(fs.basename("/app/src/index.test.ts")));
bench("fs.basename.ending", () => do_not_optimize(fs.basename("/app/src/index.test.ts", ".ts")));
bench("fs.dirname", () => do_not_optimize(fs.dirname("/app/src/index.test.ts")));
bench("fs.ancestors", () => do_not_optimize(fs.ancestors("/app/src/features/orders/index.tsx")));
bench("fs.extension", () => do_not_optimize(fs.extension("/app/src/archive.tar.gz")));
bench("fs.stem", () => do_not_optimize(fs.stem("/app/src/archive.tar.gz")));
bench("fs.hidden", () => do_not_optimize(fs.hidden("/app/.cache/spec/current.json")));
bench("fs.withName", () => do_not_optimize(fs.withName("/app/src/index.ts", "main.ts")));
bench("fs.withName.refused", () => do_not_optimize(refused(() => fs.withName("/app/src/index.ts", "../../etc/passwd"))));
bench("fs.withStem", () => do_not_optimize(fs.withStem("/app/src/index.ts", "main")));
bench("fs.withExtension", () => do_not_optimize(fs.withExtension("/app/src/index.ts", ".js")));
bench("fs.relative", () => do_not_optimize(fs.relative("/app/src/features/orders", "/app/src/shared/ui/button.tsx")));
bench("fs.inside", () => do_not_optimize(fs.inside("/app/uploads", "users/7/photo.png")));
bench("fs.inside.escape", () => do_not_optimize(fs.inside("/app/uploads", "users/../../../etc/passwd")));
bench("fs.within", () => do_not_optimize(fs.within("/app/uploads", "/app/uploads/users/7/photo.png")));
bench("fs.parse", () => do_not_optimize(fs.parse("/app/src/archive.tar.gz")));
bench("fs.format", () => do_not_optimize(fs.format({ dir: "/app/src", name: "archive.tar", ext: ".gz" })));
bench("fs.common", () => do_not_optimize(fs.common(sources)));
bench("fs.unique.free", () => do_not_optimize(fs.unique("docs/b.txt", taken)));
bench("fs.unique.crowded", () => do_not_optimize(fs.unique("docs/a.txt", taken)));
bench("fs.safe", () => do_not_optimize(fs.safe("Quarterly report (final).pdf")));
bench("fs.safe.hostile", () => do_not_optimize(fs.safe("../../etc/passwd\u0000<script>.png")));
bench("fs.safe.reserved", () => do_not_optimize(fs.safe("COM1.tar.gz")));
bench("fs.safe.long", () => do_not_optimize(fs.safe(`${"a".repeat(400)}.jpeg`)));
bench("fs.safe.marked", () => do_not_optimize(fs.safe(marked)));
bench("fs.glob.cached", () => do_not_optimize(fs.glob("src/**/*.{ts,tsx}")));
bench("fs.glob.fresh", () => {

    turn = (turn + 1) % 4096;

    return do_not_optimize(fs.glob(`src/${turn}/**/*.{ts,tsx}`));

});
bench("fs.glob.braces", () => {

    turn = (turn + 1) % 4096;

    return do_not_optimize(fs.glob(`${turn}/${"{a,b}".repeat(8)}`));

});
bench("fs.matcher", () => do_not_optimize(matcher("src/features/orders/index.tsx")));
bench("fs.matcher.miss", () => do_not_optimize(matcher("src/features/orders/index.css")));
bench("fs.matcher.list", () => do_not_optimize(listed("src/features/orders/hooks/use-orders.ts")));
bench("fs.matcher.negated", () => do_not_optimize(listed("src/features/orders/index.test.ts")));
bench("fs.matcher.insensitive", () => do_not_optimize(loose("src/features/orders/index.tsx")));
bench("fs.matches", () => do_not_optimize(fs.matches("src/features/orders/index.tsx", "src/**/*.{ts,tsx}")));
bench("fs.matches.class", () => do_not_optimize(fs.matches("part-7.ts", "part-[0-9].[jt]s")));
bench("fs.matches.stars", () => do_not_optimize(fs.matches(stars, "*a*a*a*a*a*b")));
bench("fs.matches.globstars", () => do_not_optimize(fs.matches(`${"a/".repeat(40)}x`, "**/a/**/a/**/b")));
bench("fs.essence", () => do_not_optimize(fs.essence("image/png")));
bench("fs.essence.params", () => do_not_optimize(fs.essence("Text/HTML; charset=utf-8")));
bench("fs.essence.alias", () => do_not_optimize(fs.essence("image/jpg")));
bench("fs.essence.malformed", () => do_not_optimize(fs.essence("not a type")));
bench("fs.mime", () => do_not_optimize(fs.mime("photo.JPG")));
bench("fs.mime.unknown", () => do_not_optimize(fs.mime("archive.unknown")));
bench("fs.extensionOf", () => do_not_optimize(fs.extensionOf("image/jpeg")));
bench("fs.kind", () => do_not_optimize(fs.kind("application/pdf")));
bench("fs.isText", () => do_not_optimize(fs.isText("application/json")));
bench("fs.inert", () => do_not_optimize(fs.inert("image/svg+xml")));
bench("fs.accepts", () => do_not_optimize(fs.accepts("image/png", ["image/*", ".pdf"])));
bench("fs.accepts.ending", () => do_not_optimize(fs.accepts("", ["image/*", ".pdf"], "report.PDF")));
bench("fs.accepts.miss", () => do_not_optimize(fs.accepts("video/mp4", ["image/*", ".pdf", "text/plain"], "clip.mp4")));
bench("fs.agrees", () => do_not_optimize(fs.agrees("image/jpeg", "image/jpeg")));
bench("fs.sniffable", () => do_not_optimize(fs.sniffable("image/png")));
bench("fs.sniff.png", () => do_not_optimize(fs.sniff(png)));
bench("fs.sniff.jpeg", () => do_not_optimize(fs.sniff(near)));
bench("fs.sniff.pdf", () => do_not_optimize(fs.sniff(pdf)));
bench("fs.sniff.markup", () => do_not_optimize(fs.sniff(page)));
bench("fs.sniff.prose", () => do_not_optimize(fs.sniff(prose)));
bench("fs.sniff.noise", () => do_not_optimize(fs.sniff(noise)));
bench("fs.imageSize.png", () => do_not_optimize(fs.imageSize(png)));
bench("fs.imageSize.gif", () => do_not_optimize(fs.imageSize(gif)));
bench("fs.imageSize.jpeg", () => do_not_optimize(fs.imageSize(near)));
bench("fs.imageSize.jpeg.far", () => do_not_optimize(fs.imageSize(far)));
bench("fs.imageSize.none", () => do_not_optimize(fs.imageSize(noise)));
bench("fs.isRef", () => do_not_optimize(fs.isRef(ref)));
bench("fs.typeOf", () => do_not_optimize(fs.typeOf(picture)));
bench("fs.typeOf.ref", () => do_not_optimize(fs.typeOf(ref)));
bench("fs.typeOf.head", () => do_not_optimize(fs.typeOf(forged, page)));
bench("fs.check", () => do_not_optimize(fs.check(picture, images)));
bench("fs.check.refused", () => do_not_optimize(refused(() => fs.check(picture, tight))));
bench("fs.formData", () => do_not_optimize(fs.formData(fields)));
bench("fs.dataUri", () => do_not_optimize(fs.dataUri("image/png", base)));
bench("fs.parseDataUri", () => do_not_optimize(fs.parseDataUri(small)));
bench("fs.parseDataUri.large", () => do_not_optimize(fs.parseDataUri(large)));
bench("fs.parseDataUri.escaped", () => do_not_optimize(fs.parseDataUri(escaped)));
bench("fs.parseDataUri.capped", () => do_not_optimize(fs.parseDataUri(large, 1024)));
bench("fs.toBlob", () => do_not_optimize(fs.toBlob(small, "photo.png")));
bench("fs.slices", () => do_not_optimize(fs.slices(heavy, 4096)));
bench("fs.human", () => do_not_optimize(fs.human(10_485_760)));
bench("fs.bytes", async () => do_not_optimize(await fs.bytes(picture)));
bench("fs.head", async () => do_not_optimize(await fs.head(heavy)));
bench("fs.blobText", async () => do_not_optimize(await fs.blobText(forged)));
bench("fs.toDataUri", async () => do_not_optimize(await fs.toDataUri(picture)));
bench("fs.inspect", async () => do_not_optimize(await fs.inspect(picture, images)));
bench("fs.inspect.far", async () => do_not_optimize(await fs.inspect(distant, images)));
bench("fs.inspect.forged", async () => do_not_optimize(await declined(() => fs.inspect(forged, images))));
bench("fs.read", async () => do_not_optimize(await fs.read("/app/notes.txt")));
bench("fs.text", async () => do_not_optimize(await fs.text("/app/notes.txt")));
bench("fs.lines", async () => do_not_optimize(await fs.lines("/app/notes.txt")));
bench("fs.readJson", async () => do_not_optimize(await fs.readJson("/app/package.json")));
bench("fs.write", async () => do_not_optimize(await fs.write("/app/out/written.txt", note)));
bench("fs.append", async () => {

    await fs.write("/app/out/log.txt", "one\n");

    return do_not_optimize(await fs.append("/app/out/log.txt", "two\n"));

});
bench("fs.writeAtomic", async () => do_not_optimize(await fs.writeAtomic("/app/out/atomic.txt", note)));
bench("fs.writeJson", async () => do_not_optimize(await fs.writeJson("/app/out/data.json", fields.owner)));
bench("fs.update.same", async () => do_not_optimize(await fs.update("/app/notes.txt", note)));
bench("fs.update.changed", async () => {

    turn = (turn + 1) % 4096;

    return do_not_optimize(await fs.update("/app/out/turn.txt", `turn ${turn}`));

});
bench("fs.edit.same", async () => do_not_optimize(await fs.edit("/app/notes.txt", ( held ) => held)));
bench("fs.stat", async () => do_not_optimize(await fs.stat("/app/notes.txt")));
bench("fs.stat.missing", async () => do_not_optimize(await fs.stat("/app/never.txt")));
bench("fs.exists", async () => do_not_optimize(await fs.exists("/app/notes.txt")));
bench("fs.isFile", async () => do_not_optimize(await fs.isFile("/app/notes.txt")));
bench("fs.isDir", async () => do_not_optimize(await fs.isDir("/app/src")));
bench("fs.entries", async () => do_not_optimize(await fs.entries("/app/src")));
bench("fs.walk", async () => do_not_optimize(await fs.walk("/app/src")));
bench("fs.walk.shallow", async () => do_not_optimize(await fs.walk("/app", { depth: 1 })));
bench("fs.walk.pruned", async () => do_not_optimize(await fs.walk("/app", ( entry ) => entry.name === "src")));
bench("fs.files", async () => do_not_optimize(await fs.files("/app/src/feature-0")));
bench("fs.find", async () => do_not_optimize(await fs.find("/app/src", "**/part-1*.ts")));
bench("fs.size", async () => do_not_optimize(await fs.size("/app/src/feature-0")));
bench("fs.digest", async () => do_not_optimize(await fs.digest("/app/notes.txt")));
bench("fs.same", async () => do_not_optimize(await fs.same("/app/notes.txt", "/app/twin.txt")));
bench("fs.same.differs", async () => do_not_optimize(await fs.same("/app/notes.txt", "/app/other.txt")));
bench("fs.ensure", async () => do_not_optimize(await fs.ensure("/app/out/made/deep")));
bench("fs.empty", async () => do_not_optimize(await fs.empty("/app/void")));
bench("fs.copy", async () => do_not_optimize(await fs.copy("/app/notes.txt", "/app/out/copied.txt")));
bench("fs.copy.tree", async () => do_not_optimize(await fs.copy("/app/src/feature-0", "/app/out/feature-0")));
bench("fs.move", async () => {

    await fs.move("/app/twin.txt", "/app/out/moved.txt");

    return do_not_optimize(await fs.move("/app/out/moved.txt", "/app/twin.txt"));

});
bench("fs.move.inside", async () => do_not_optimize(await declined(() => fs.move("/app/src", "/app/src/feature-0/in"))));
bench("fs.remove", async () => {

    await fs.write("/app/out/gone/a.txt", "a");

    return do_not_optimize(await fs.remove("/app/out/gone"));

});
bench("fs.remove.missing", async () => do_not_optimize(await fs.remove("/app/never")));
bench("fs.remove.root", async () => do_not_optimize(await declined(() => fs.remove("/"))));
bench("fs.withTemp", async () => do_not_optimize(await fs.withTemp(( path ) => path)));
bench("fs.read.refused", async () => do_not_optimize(await declined(() => fs.read(""))));

await run();
