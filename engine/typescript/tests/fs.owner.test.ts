import { describe, expect, test as it } from "bun:test";
import * as fs from "engine/fs";

describe("filesystem adapter ownership", () => {

    it("copy keeps the selected disk throughout a recursive operation", async () => {

        const first = fs.memoryDisk();
        const second = fs.memoryDisk();

        await first.write("/source/first", "first");
        await second.write("/source/second", "second");

        let restore: (() => void) | undefined;
        const target: fs.Disk = { ...first, stat: async ( path ) => { restore ??= fs.disk.use(second); return first.stat(path); } };

        await fs.disk.with(target, async () => {

            try {

                await fs.copy("/source", "/copied");
                expect(new TextDecoder().decode(await first.read("/copied/first"))).toBe("first");
                expect(await second.stat("/copied")).toBeUndefined();

            } finally {

                restore?.();

            }

        });

    });
    for ( const operation of ["move", "update", "size", "same"] as const ) {

        it(`${operation} stays on its original disk after a stat rebinds the port`, async () => {

            const first = fs.memoryDisk();
            const second = fs.memoryDisk();

            await first.write("/source/first", "first");
            await first.write("/same", "first");
            await second.write("/source/first", "second");
            await second.write("/same", "different");

            let restore: (() => void) | undefined;
            const target: fs.Disk = {
                ...first,
                stat: async ( path ) => { restore ??= fs.disk.use(second); return first.stat(path); },
                rename: operation === "move" ? async () => { throw Object.assign(new Error("cross device"), { code: "EXDEV" }); } : first.rename,
            };

            await fs.disk.with(target, async () => {

                try {

                    const operations = {
                        move: async () => {

                            await fs.move("/source", "/copied");

                            return [await first.stat("/source"), new TextDecoder().decode(await first.read("/copied/first"))];

                        },
                        update: async () => [await fs.update("/source/first", "new"), new TextDecoder().decode(await first.read("/source/first"))],
                        size: () => fs.size("/source"),
                        same: () => fs.same("/source/first", "/same"),
                    };
                    const expected = { move: [undefined, "first"], update: [true, "new"], size: 5, same: true };

                    expect(await operations[operation]()).toEqual(expected[operation]);
                    expect(new TextDecoder().decode(await second.read("/source/first"))).toBe("second");

                } finally {

                    restore?.();

                }

            });

        });

    }
    it("edit commits on its original disk after an asynchronous callback changes the binding", async () => {

        const first = fs.memoryDisk();
        const second = fs.memoryDisk();
        let restore: (() => void) | undefined;

        await first.write("/file", "first");
        await second.write("/file", "second");
        await fs.disk.with(first, async () => {

            try {

                expect(await fs.edit("/file", async ( text ) => {

                    restore = fs.disk.use(second);
                    await Promise.resolve();

                    return text.toUpperCase();

                })).toBe(true);
                expect(new TextDecoder().decode(await first.read("/file"))).toBe("FIRST");
                expect(new TextDecoder().decode(await second.read("/file"))).toBe("second");

            } finally {

                restore?.();

            }

        });

    });
    it("withTemp cleans up on the acquiring disk even when work changes the binding", async () => {

        const first = fs.memoryDisk();
        const second = fs.memoryDisk();
        let restore: (() => void) | undefined;
        let path = "";

        await fs.disk.with(first, async () => {

            try {

                await fs.withTemp(async ( folder ) => {

                    path = folder;
                    await second.write(fs.join(folder, "keep"), "second");
                    restore = fs.disk.use(second);

                });
                expect(await first.stat(path)).toBeUndefined();
                expect(new TextDecoder().decode(await second.read(fs.join(path, "keep")))).toBe("second");

            } finally {

                restore?.();

            }

        });

    });
});
