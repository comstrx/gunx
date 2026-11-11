from collections.abc import AsyncIterator, Awaitable
from engine.crypto import crypto
from engine.date import date
from engine.error import Code, Fault
from engine.fs import Change, Image, Picture, dir, encrypt, file, image, pack, path, watch
from io import BytesIO
from pathlib import Path
from PIL import Image as Pil
from typing import BinaryIO
import asyncio, gzip, os, pytest, struct, sys, tarfile, zipfile, zlib

CHUNK = 1024 * 1024
RED   = (200, 30, 30)
BLUE  = (30, 30, 200)

async def refused ( job: Awaitable[object], reason: str, code: Code | None = None ) -> Fault:

    with pytest.raises(Fault) as caught: await job

    assert caught.value.reason == reason and (code is None or caught.value.code is code), caught.value.reason

    return caught.value

async def file_of ( target: Path, data: bytes ) -> Path:

    await file.write(target, data)

    return target

def held ( folder: Path, pattern: str = "*" ) -> list[str]:

    return sorted(item.name for item in folder.glob(pattern))

def picture ( width: int = 800, height: int = 600, format_: str = "PNG", **options: object ) -> bytes:

    raw = Pil.new("RGB", (width, height), RED)

    raw.paste(BLUE, (0, 0, width // 2, height))

    out = BytesIO()

    raw.save(out, format=format_, **options)

    return out.getvalue()

def forged ( width: int, height: int ) -> bytes:

    head = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    body = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", len(head)) + b"IHDR" + head + struct.pack(">I", zlib.crc32(b"IHDR" + head))

    return body + struct.pack(">I", 0) + b"IDAT" + struct.pack(">I", zlib.crc32(b"IDAT"))

def test_path_shapes_names_without_touching_the_disk ( monkeypatch: pytest.MonkeyPatch ) -> None:

    monkeypatch.setenv("FS_LAB", "/lab")

    assert path.join("a", "b", "c.txt") == Path("a/b/c.txt") and path.posix(Path("a") / "b") == "a/b"
    assert path.name("/x/Photo.JPG") == "Photo.JPG" and path.stem("/x/Photo.JPG") == "Photo" and path.ext("/x/Photo.JPG") == "jpg"
    assert path.ext("noext") == "" and path.ext("a.tar.GZ") == "gz" and path.ext(".env") == ""
    assert path.parent("/a/b/c") == Path("/a/b") and path.parts("/a/b") == ("/", "a", "b")
    assert path.depth("/a/b/c") == 3 and path.depth("a/b") == 2 and path.depth("/") == 0
    assert path.ancestors("/a/b") == [Path("/a"), Path("/")]
    assert path.common("/a/b/c", "/a/b/d") == Path("/a/b") and path.common("/a", "/b") == Path("/") and path.common() is None
    assert path.rel("/a/b/c.txt", "/a") == Path("b/c.txt") and path.rel("/a", "/a") == Path()
    assert path.set_name("/a/b.txt", "c.md") == Path("/a/c.md") and path.set_stem("/a/b.txt", "c") == Path("/a/c.txt")
    assert path.set_ext("/a/b.txt", "md") == Path("/a/b.md") and path.set_ext("/a/b.txt", ".md") == Path("/a/b.md")
    assert path.set_ext("/a/b.txt", "") == Path("/a/b")
    assert path.is_abs("/a") and not path.is_abs("a") and path.is_root("/") and not path.is_root("/a") and not path.is_root("a")
    assert path.is_hidden("/a/.env") and not path.is_hidden("/.a/env")
    assert path.is_under("/a/b/c", "/a/b") and path.is_under("/a/b", "/a/b")
    assert not path.is_under("/a/bc", "/a/b") and not path.is_under("/a/b/../c", "/a/b")
    assert path.has_ext("a.JPG", "jpg", ".png") and not path.has_ext("a.gif", "jpg") and not path.has_ext("a")
    assert path.match("Photo.JPG", "*.jpg") and path.match("/x/y/a.md", "a.*") and not path.match("a.md", "*.txt")
    assert path.mime("a.json") == "application/json" and path.mime("weird.zzz") == "application/octet-stream"
    assert path.fix("/a/b/../c/./d") == Path("/a/c/d") and path.fix("~/x") == Path.home() / "x"
    assert path.fix("rel") == Path.cwd() / "rel" and path.fix("$FS_LAB/x/../y") == Path("/lab/y")
    assert path.home() == Path.home() and path.cwd() == Path.cwd() and path.temp_root().is_dir()

    with pytest.raises(Fault) as out: path.rel("/a/b", "/a/b/c")

    assert out.value.code is Code.FORBIDDEN and out.value.reason == "fs.escape"

    assert path.safe("../../etc/pass wd;rm.txt") == "pass_wd_rm.txt" and path.safe("...") == "file" and path.safe("") == "file"
    assert path.safe("a" * 300) == "a" * 128 and path.safe("x" * 300, 10) == "x" * 10 and path.safe("مرحبا.txt") == "مرحبا.txt"
    assert path.is_safe("a.txt") and not path.is_safe("..") and not path.is_safe("a/b") and not path.is_safe("") and not path.is_safe("a" * 129)

    hostile = (
        "../../etc/passwd", "a\x00b.txt", "..", ".", "/", "\\..\\..\\win.ini", "a\nb\r.txt", "  spaced  ", ".hidden", "~root",
        "a" * 127 + "._b", "." * 200 + "x", "$(rm -rf).sh", "-rf", "con\x1b[31m.txt", "\udcff.bin", "x/../../y",
    )

    for name in hostile:

        made = path.safe(name)

        assert path.is_safe(made) and path.safe(made) == made and "/" not in made and "\x00" not in made, name

async def test_path_probes_and_facts ( tmp_path: Path ) -> None:

    doc, folder, alias, ghost = tmp_path / "doc.txt", tmp_path / "folder", tmp_path / "alias", tmp_path / "ghost"

    await file.write(doc, "hello")
    await dir.make(folder)

    assert await path.size(doc) == 5 and await path.size(tmp_path) == 5 and await path.size(folder) == 0

    await path.link(doc, alias)
    await path.link(ghost, tmp_path / "dangling")

    assert await path.has(doc) and await path.has(folder) and await path.has(alias) and not await path.has(ghost)
    assert await path.has(tmp_path / "dangling") and not await file.has(tmp_path / "dangling")
    assert [await path.kind(item) for item in (doc, folder, alias, ghost)] == ["file", "dir", "link", "missing"]
    assert await path.is_file(doc) and await path.is_dir(folder) and await path.is_link(alias) and not await path.is_link(doc)
    assert await path.readlink(alias) == doc and await path.same(doc, alias)
    assert not await path.same(doc, folder) and not await path.same(doc, ghost)
    assert await path.resolve(folder / ".." / "alias") == doc.resolve()

    info = await path.get(doc)

    assert (info.kind, info.size, info.name(), info.suffix(), info.links) == ("file", 5, "doc.txt", "txt", 1)
    assert info.dump()["mode"] == "0o600" and info.owner == os.getuid() and info.inode == doc.stat().st_ino
    assert date.between(info.modified, date.now()) >= 0 and (await path.get(folder)).kind == "dir" and (await path.get(alias)).kind == "link"

    past = date.before(3600)

    assert await path.set(doc, mode=0o640, modified=past) == doc and (await path.get(doc)).dump()["mode"] == "0o640"
    assert abs((await path.modified(doc)).timestamp() - past.timestamp()) < 0.01 and 3599 <= await path.age(doc) <= 3700
    assert await path.changed(doc, date.before(7200)) and not await path.changed(doc, date.now())
    assert await path.can(doc) and await path.can(doc, "rw") and not await path.can(doc, "x")
    assert not await path.can(ghost) and await path.can(folder, "rwx")
    assert await path.which("sh") is not None and await path.which("no-such-tool-zz") is None

    disk = await path.disk(tmp_path)

    assert disk["total"] > 0 and disk["total"] >= disk["used"] and 0 <= disk["percent"] <= 100

    lost = (
        path.get(ghost), path.set(ghost, mode=0o600), path.size(ghost), path.modified(ghost), path.age(ghost),
        path.changed(ghost, past), path.readlink(ghost), path.hash(ghost), path.disk(ghost), path.copy(ghost, tmp_path / "c"),
        path.move(ghost, tmp_path / "m"), path.link(ghost, tmp_path / "h", hard=True), path.backup(ghost),
        path.temp(near=ghost),
    )

    for job in lost: await refused(job, "fs.missing", Code.NOT_FOUND)

    await refused(path.readlink(doc), "fs.failed", Code.INTERNAL)
    await refused(path.hash(doc, "zzz"), "crypto.algorithm")

    assert not await path.remove(ghost) and not await path.has(tmp_path / "c") and not await path.has(tmp_path / "m")

async def test_path_survives_hostile_names ( tmp_path: Path ) -> None:

    null, long = tmp_path / "a\x00b", tmp_path / ("a" * 300)

    assert not await path.has(null) and await path.kind(null) == "missing" and not await path.can(null)
    assert not await path.same(null, tmp_path) and not await path.inside(tmp_path, "a\x00b") and not await path.remove(null)

    named = (
        path.get(null), path.size(null), path.resolve(null), path.under(tmp_path, "a\x00b"), path.hash(null),
        file.read(null), file.write(null, "x"), file.append(null, "x"), file.put(null, "x"), file.make(null),
        dir.make(null), dir.files(null), dir.walk(null), anext(file.stream(null)), path.temp(prefix="a\x00"),
    )

    for job in named: await refused(job, "fs.name", Code.BAD_REQUEST)

    await refused(file.write(long, "x"), "fs.failed", Code.INTERNAL)
    await refused(file.read(long), "fs.failed", Code.INTERNAL)

    edge = tmp_path / ("n" * 255)

    assert await file.write(edge, "x") == 1 and await file.read_text(edge) == "x" and await file.remove(edge)
    assert held(tmp_path) == []

async def test_path_confines_to_a_root ( tmp_path: Path ) -> None:

    root, outside = tmp_path / "root", tmp_path / "outside"

    await file.write(root / "in" / "a.txt", "a")
    await file.write(outside / "secret.txt", "s")
    await path.link(outside, root / "door")
    await path.link(outside / "secret.txt", root / "in" / "leak.txt")

    assert await path.under(root, "in/a.txt") == (root / "in" / "a.txt").resolve() and await path.under(root, "") == root.resolve()
    assert await path.under(root, root / "in") == (root / "in").resolve()
    assert await path.under(root, "new/deep/file") == root.resolve() / "new" / "deep" / "file"
    assert await path.inside(root, "in/a.txt") and await path.inside(root, "in/../in/a.txt") and await path.inside(root, ".")

    hostile = (
        "../outside/secret.txt", "in/../../outside", "/etc/passwd", "door/secret.txt", "in/leak.txt", str(outside), "door",
        "..", "in/../..", "door/../outside",
    )

    for name in hostile:

        assert not await path.inside(root, name), name

        fault = await refused(path.under(root, name), "fs.escape", Code.FORBIDDEN)

        assert fault.errors == { "path": [name[:64]] }

    assert (await refused(path.under(root, "../" + "x" * 200), "fs.escape")).errors == { "path": [("../" + "x" * 200)[:64]] }

async def test_path_moves_copies_links_and_removes ( tmp_path: Path ) -> None:

    first, second = tmp_path / "x" / "y" / "a.md", tmp_path / "x" / "y" / "b.txt"

    await file.write(first, "a")

    assert await path.copy(first, second) == second and await file.read_text(second) == "a"
    assert await path.copy(tmp_path / "x", tmp_path / "copy") == tmp_path / "copy"
    assert await file.read_text(tmp_path / "copy" / "y" / "a.md") == "a"
    assert len(await path.hash(first)) == 64 and await path.hash(first) == await path.hash(second)
    assert await path.hash(first, "sha256") != await path.hash(first)
    assert await path.hash(tmp_path / "x") == await path.hash(tmp_path / "copy")

    await file.write(tmp_path / "copy" / "y" / "a.md", "b")

    assert await path.hash(tmp_path / "x") != await path.hash(tmp_path / "copy")
    assert await path.move(tmp_path / "copy" / "y" / "a.md", tmp_path / "copy" / "y" / "z.md") == tmp_path / "copy" / "y" / "z.md"
    assert await file.write(tmp_path / "copy" / "y" / "z.md", "a") == 1
    assert await path.hash(tmp_path / "x") != await path.hash(tmp_path / "copy")

    moved = tmp_path / "deep" / "new" / "moved.txt"

    assert await path.move(second, moved) == moved and not await path.has(second) and await file.read_text(moved) == "a"
    assert await path.rename(first, "c.md") == first.with_name("c.md") and not await path.has(first)

    for name in ("../up.md", "a/b", "..", "", "x" * 200): await refused(path.rename(moved, name), "fs.escape", Code.FORBIDDEN)

    hard, soft = tmp_path / "links" / "hard", tmp_path / "links" / "soft"

    assert await path.link(moved, hard, hard=True) == hard and (await path.get(moved)).links == 2 and await path.same(moved, hard)
    assert await path.link(tmp_path / "x", soft) == soft and await dir.has(soft) and await path.kind(soft) == "link"
    assert await path.remove(soft) and await dir.has(tmp_path / "x") and await file.has(first.with_name("c.md"))
    assert await path.remove(hard) and await file.read_text(moved) == "a" and (await path.get(moved)).links == 1

    await refused(path.link(moved, moved), "fs.failed", Code.INTERNAL)

    kept = await path.backup(moved)

    assert kept.parent == moved.parent and kept.name.startswith("moved.") and kept.suffix == ".txt" and await file.read(kept) == b"a"

    await file.write(moved, "changed")

    assert await path.restore(moved) == kept and await file.read_text(moved) == "a"

    vault = await path.backup(tmp_path / "x", tmp_path / "vault")

    assert vault.parent == tmp_path / "vault" and await path.hash(vault) == await path.hash(tmp_path / "x")

    await file.write(tmp_path / "x" / "y" / "noise.txt", "n")

    assert await path.restore(tmp_path / "x", tmp_path / "vault") == vault and not await path.has(tmp_path / "x" / "y" / "noise.txt")

    await refused(path.restore(tmp_path / "never.txt"), "fs.missing", Code.NOT_FOUND)

    made = await path.temp(".bin", near=tmp_path)

    assert made.is_file() and made.suffix == ".bin" and made.parent == tmp_path and made.name.startswith("engine-")
    assert (await dir.temp(near=tmp_path)).is_dir() and (await file.temp(near=tmp_path)).is_file()
    assert (await path.temp(near=tmp_path, folder=True)).is_dir() and (await dir.temp(near=tmp_path, folder=False)).is_file()
    assert (await path.temp(prefix="lab-")).parent == path.temp_root()
    assert await path.remove(tmp_path / "x") and not await path.has(tmp_path / "x") and not await path.remove(tmp_path / "x")

async def test_file_and_dir_refuse_the_other_kind ( tmp_path: Path ) -> None:

    doc, folder, spare = tmp_path / "doc.txt", tmp_path / "folder", tmp_path / "spare"

    await file.write(doc, "x")
    await file.write(folder / "inner.txt", "y")

    assert await file.has(doc) and not await file.has(folder) and await dir.has(folder) and not await dir.has(doc)
    assert not await file.can(folder) and not await dir.can(doc) and await dir.can(folder, "rwx") and await file.can(doc, "rw")

    wrong = (
        file.read(folder), file.read_text(folder), file.write(folder, "x"), file.append(folder, "x"), file.prepend(folder, "x"),
        file.get(folder), file.set(folder, mode=0o600), file.size(folder), file.modified(folder), file.age(folder),
        file.remove(folder), file.hash(folder), file.head(folder), file.tail(folder), file.range(folder, 1, 2),
        file.media(folder), file.is_text(folder), file.truncate(folder, 0), file.clear(folder), file.make(folder),
        file.copy(folder, spare), file.move(folder, spare), file.backup(folder), file.link(folder, spare),
        file.contains(folder, "x"), file.starts(folder, "x"), file.ends(folder, "x"), file.find(folder, "x"),
        file.rotate(folder), file.take(folder), file.count(folder), anext(file.stream(folder)), file.fill(folder, print),
        dir.make(doc), dir.files(doc), dir.dirs(doc), dir.list(doc), dir.walk(doc), dir.glob(doc, "*"), dir.find(doc),
        dir.count(doc), dir.tree(doc), dir.levels(doc), dir.snapshot(doc), dir.snapshot(doc, recursive=False), dir.empty(doc),
        dir.clear(doc), dir.sync(doc, spare), dir.clean(doc, 1), dir.newest(doc), dir.oldest(doc), dir.largest(doc),
        dir.remove(doc), dir.size(doc), dir.get(doc), dir.hash(doc), dir.copy(doc, spare), dir.move(doc, spare),
        anext(watch.changes(doc)),
    )

    for job in wrong:

        fault = await refused(job, "fs.kind", Code.CONFLICT)

        assert (fault.errors or {}).get("kind") in (["file"], ["dir"])

    assert await file.read_text(doc) == "x" and await file.read_text(folder / "inner.txt") == "y" and not await path.has(spare)
    assert not await file.put(folder, "x") and held(tmp_path) == ["doc.txt", "folder"]

async def test_file_writes_atomically_and_reads_bounded ( tmp_path: Path ) -> None:

    target, ghost = tmp_path / "deep" / "file.txt", tmp_path / "ghost"

    assert await file.write(target, "hello") == 5 and await file.read_text(target) == "hello" and await file.size(target) == 5
    assert await file.write(target, b"\x00\x01", durable=False) == 2 and await file.read(target) == b"\x00\x01"
    assert oct(target.stat().st_mode & 0o777) == "0o600" and held(target.parent) == ["file.txt"]

    await file.set(target, mode=0o640)

    assert await file.write(target, "kept") == 4 and oct(target.stat().st_mode & 0o777) == "0o640"
    assert await file.write(target, "x", mode=0o600) == 1 and oct(target.stat().st_mode & 0o777) == "0o600"
    assert await file.write(target, "") == 0 and await file.empty(target) and await file.read(target) == b""
    assert await file.append(target, b"\x02") == 1 and await file.append(target, "é") == 2 and await file.read(target) == b"\x02\xc3\xa9"
    assert await file.prepend(target, b"\x01") == 4 and await file.read(target) == b"\x01\x02\xc3\xa9"
    assert await file.prepend(tmp_path / "pre.txt", "new") == 3 and await file.append(tmp_path / "deep" / "er" / "app.txt", "new") == 3
    assert await file.put(tmp_path / "once", "first") and not await file.put(tmp_path / "once", "second")
    assert await file.read_text(tmp_path / "once") == "first" and await file.take(tmp_path / "once") == b"first"
    assert not await file.has(tmp_path / "once")

    made = await file.make(tmp_path / "made" / "empty")

    assert made == tmp_path / "made" / "empty" and await file.empty(made) and oct(made.stat().st_mode & 0o777) == "0o600"
    assert await file.write(made, "keep") and await file.make(made) == made and await file.read_text(made) == "keep"
    assert await file.truncate(made, 2) == made and await file.read_text(made) == "ke" and await file.truncate(made, -5) == made
    assert await file.empty(made) and await file.write(made, "again") and await file.clear(made) == made and await file.size(made) == 0

    def pieces ( out: BinaryIO ) -> None:

        out.writelines((b"one", b"two", b"three"))

    assert await file.fill(tmp_path / "filled.bin", pieces) == 11 and await file.read(tmp_path / "filled.bin") == b"onetwothree"

    def broken ( out: BinaryIO ) -> None:

        out.write(b"half")

        raise RuntimeError("stop")

    with pytest.raises(RuntimeError): await file.fill(tmp_path / "filled.bin", broken)

    assert await file.read(tmp_path / "filled.bin") == b"onetwothree"
    assert held(tmp_path) == ["deep", "filled.bin", "made", "pre.txt"]

    await file.write(target, "hello")

    await refused(file.read(target, limit=4), "fs.size", Code.TOO_LARGE)
    await refused(file.read_text(target, limit=1), "fs.size", Code.TOO_LARGE)
    await refused(file.take(target, limit=1), "fs.size", Code.TOO_LARGE)

    assert await file.read(target, limit=5) == b"hello"

    for job in (file.read(ghost), file.read_text(ghost), file.read_json(ghost), file.size(ghost), file.take(ghost), file.truncate(ghost, 0)):

        await refused(job, "fs.missing", Code.NOT_FOUND)

    await file.write(target, b"\xff\xfe")

    await refused(file.read_text(target), "fs.encoding", Code.BAD_REQUEST)
    await refused(file.read_lines(target), "fs.encoding", Code.BAD_REQUEST)

    doc = tmp_path / "data" / "doc.json"

    assert await file.write_json(doc, { "b": 1, "a": [1, 2] }) > 0 and await file.read_json(doc) == { "b": 1, "a": [1, 2] }
    assert await file.write_json(doc, { "b": 1, "a": 2 }, pretty=True) > 0 and (await file.read_text(doc)).startswith('{\n  "a": 2')
    assert await file.write(tmp_path / "x.toml", 'k = "v"') and await file.read_toml(tmp_path / "x.toml") == { "k": "v" }
    assert await file.read_toml(await file.make(tmp_path / "empty.toml")) == {}

    await file.write(doc, "{nope")

    await refused(file.read_json(doc), "json.decode", Code.BAD_REQUEST)
    await refused(file.read_toml(doc), "parse.toml", Code.BAD_REQUEST)

    sealed = tmp_path / "sealed"

    await dir.make(sealed)
    await file.write(sealed / "held.txt", "held")
    await dir.set(sealed, mode=0o500)

    try:

        for job in (file.write(sealed / "new.txt", "x"), file.write(sealed / "held.txt", "x"), file.append(sealed / "new.txt", "x"), file.put(sealed / "new.txt", "x"), dir.make(sealed / "sub"), file.remove(sealed / "held.txt")):

            await refused(job, "fs.denied", Code.FORBIDDEN)

        assert held(sealed) == ["held.txt"] and await file.read_text(sealed / "held.txt") == "held"

    finally: await dir.set(sealed, mode=0o700)

async def test_file_pours_a_stream_atomically ( tmp_path: Path ) -> None:

    goal = tmp_path / "deep" / "poured.bin"

    async def pieces ( count: int, size: int = 1000, fail: int = -1, wait: float = 0.0 ) -> AsyncIterator[bytes]:

        for index in range(count):

            if index == fail: raise RuntimeError("upstream died")
            if wait: await asyncio.sleep(wait)

            yield bytes([index % 251]) * size

    assert await file.pour(goal, pieces(50)) == 50_000 and await file.size(goal) == 50_000
    assert await file.hash(goal) == await file.hash(await file_of(tmp_path / "same.bin", b"".join([bytes([i % 251]) * 1000 for i in range(50)])))
    assert oct(goal.stat().st_mode & 0o777) == "0o600" and held(goal.parent) == ["poured.bin"]

    goal.chmod(0o640)

    assert await file.pour(goal, pieces(0)) == 0 and await file.empty(goal) and oct(goal.stat().st_mode & 0o777) == "0o640"
    assert await file.pour(goal, pieces(3), limit=3000, mode=0o600) == 3000 and oct(goal.stat().st_mode & 0o777) == "0o600"

    kept = await file.read(goal)

    assert (await refused(file.pour(goal, pieces(4), limit=3999), "fs.size", Code.TOO_LARGE)).errors == { "path": ["poured.bin"] }

    with pytest.raises(RuntimeError): await file.pour(goal, pieces(9, fail=5))

    slow = asyncio.create_task(file.pour(goal, pieces(1000, wait=0.01)))

    await asyncio.sleep(0.1)

    assert held(goal.parent, ".*.part") != []

    slow.cancel()

    with pytest.raises(asyncio.CancelledError): await slow

    assert await file.read(goal) == kept and held(goal.parent, ".*") == [] and held(goal.parent) == ["poured.bin"]

    await refused(file.pour(tmp_path / "deep", pieces(1)), "fs.kind", Code.CONFLICT)
    await refused(file.pour(tmp_path / "a\0b", pieces(1)), "fs.name", Code.BAD_REQUEST)

    racers = await asyncio.gather(*(file.pour(goal, pieces(20, size=index + 1)) for index in range(16)))

    assert racers == [20 * (index + 1) for index in range(16)] and await file.size(goal) in racers
    assert len(set(await file.read(goal))) == 20 and held(goal.parent, ".*") == []

async def test_file_writers_never_tear ( tmp_path: Path ) -> None:

    target = tmp_path / "hot.bin"
    blobs  = [bytes([n]) * 200_000 for n in range(16)]

    await file.write(target, blobs[0], durable=False)

    async def reader () -> None:

        for _ in range(40):

            held = await file.read(target)

            assert len(held) == 200_000 and held == held[:1] * 200_000

    await asyncio.gather(*(file.write(target, blob, durable=False) for blob in blobs), *(reader() for _ in range(4)))

    assert await file.read(target) in blobs and held(tmp_path) == ["hot.bin"]

    won = await asyncio.gather(*(file.put(tmp_path / "once", str(n)) for n in range(20)))

    assert won.count(True) == 1 and await file.read_text(tmp_path / "once") == str(won.index(True))

async def test_file_text_tools ( tmp_path: Path ) -> None:

    log   = tmp_path / "app.log"
    lines = [f"line {n}" for n in range(1, 101)]

    assert await file.write_lines(log, lines) == sum(len(line) + 1 for line in lines) and await file.read_lines(log) == lines
    assert await file.head(log, 3) == ["line 1", "line 2", "line 3"] and await file.tail(log, 2) == ["line 99", "line 100"]
    assert await file.tail(log, 0) == [] and await file.head(log, 0) == [] and len(await file.tail(log, 1000)) == 100
    assert await file.line(log, 7) == "line 7" and await file.line(log, 101) is None and await file.line(log, 0) is None
    assert await file.range(log, 98, 200) == ["line 98", "line 99", "line 100"] and await file.range(log, 5, 3) == []
    assert await file.range(log, -4, 2) == ["line 1", "line 2"]
    assert await file.count(log) == { "lines": 100, "words": 200, "bytes": await file.size(log) }
    assert len(await file.find(log, "line 9")) == 11 and (await file.find(log, "line 9"))[0] == (9, "line 9")
    assert [number for number, _ in await file.find(log, r"^line \d$", regex=True)] == list(range(1, 10))
    assert len(await file.find(log, "line", limit=5)) == 5 and await file.find(log, "line", limit=0) == [] and await file.find(log, "zzz") == []

    await refused(file.find(log, "(", regex=True), "fs.pattern", Code.BAD_REQUEST)

    for job in (file.head(tmp_path / "zz"), file.tail(tmp_path / "zz"), file.find(tmp_path / "zz", "x"), file.line(tmp_path / "zz", 1)):

        await refused(job, "fs.missing", Code.NOT_FOUND)

    notes = tmp_path / "notes.txt"

    await file.write_lines(notes, ["b", "a", "b", "c"])

    assert await file.insert(notes, 1, "top") > 0 and await file.read_lines(notes) == ["top", "b", "a", "b", "c"]
    assert await file.insert(notes, 99, "end", "last") > 0 and (await file.read_lines(notes))[-2:] == ["end", "last"]
    assert await file.cut(notes, 1) == ["top"] and await file.cut(notes, 4, 6) == ["c", "end", "last"] and await file.cut(notes, 50) == []
    assert await file.read_lines(notes) == ["b", "a", "b"] and await file.dedupe(notes) == 1 and await file.dedupe(notes) == 0
    assert await file.read_lines(notes) == ["b", "a"] and await file.add(notes, "z") and not await file.add(notes, "z")
    assert await file.add(tmp_path / "fresh.txt", "one") and await file.read_text(tmp_path / "fresh.txt") == "one\n"
    assert await file.sort(notes) > 0 and await file.read_lines(notes) == ["a", "b", "z"]
    assert await file.sort(notes, reverse=True) > 0 and await file.read_lines(notes) == ["z", "b", "a"]
    assert await file.add(notes, "x") and await file.insert(notes, 1, "x") and await file.sort(notes, unique=True) > 0
    assert await file.read_lines(notes) == ["a", "b", "x", "z"]
    assert await file.replace(log, "line", "row", 2) == 2 and (await file.head(log, 3))[2] == "line 3"
    assert await file.replace(log, "zzz", "x") == 0 and await file.replace(log, "line", "row") == 98
    assert await file.edit(log, str.upper) > 0 and await file.head(log, 1) == ["ROW 1"]
    assert await file.contains(log, "ROW 100") and not await file.contains(log, "row 100") and await file.contains(log, b"")
    assert await file.starts(log, "ROW 1\n") and await file.ends(log, b"ROW 100\n") and not await file.ends(log, "x" * 10_000)
    assert not await file.starts(log, "row") and await file.starts(log, "") and await file.ends(log, "")

    wide = tmp_path / "wide.bin"

    await file.write(wide, b"a" * (CHUNK - 3) + b"needle" + b"b" * 10, durable=False)

    assert await file.contains(wide, "needle") and await file.contains(wide, b"aneedleb") and not await file.contains(wide, "needles")

    script = tmp_path / "run.sh"

    await file.write(script, "#! /usr/bin/env bash\necho hi\n")

    assert await file.shebang(script) == "/usr/bin/env bash" and await file.shebang(log) is None and await file.shebang(await file.make(tmp_path / "void")) is None

async def test_file_streams_ranges_and_follows ( tmp_path: Path ) -> None:

    blob, ghost = tmp_path / "blob.bin", tmp_path / "ghost"
    data        = bytes(range(256)) * 64

    await file.write(blob, data, durable=False)

    async def pull ( **options: int ) -> bytes:

        return b"".join([piece async for piece in file.stream(blob, **options)])

    assert await pull() == data and await pull(chunk=7) == data and await pull(start=100) == data[100:]
    assert await pull(start=10, end=19) == data[10:20] and await pull(start=5, end=5) == data[5:6]
    assert await pull(start=len(data)) == b"" and await pull(start=10, end=5) == b"" and await pull(chunk=3, start=1, end=10 ** 9) == data[1:]
    assert [len(piece) async for piece in file.stream(blob, 1000)][:2] == [1000, 1000]

    await refused(anext(file.stream(ghost)), "fs.missing", Code.NOT_FOUND)
    await refused(anext(file.follow(ghost)), "fs.missing", Code.NOT_FOUND)

    feed = tmp_path / "feed.log"
    stop = asyncio.Event()
    seen: list[str] = []

    await file.write(feed, "old line that is long enough\n")

    async def collect () -> None:

        async for line in file.follow(feed, poll=0.02, stop=stop):

            seen.append(line)

            if line == "fresh": stop.set()

    task = asyncio.create_task(collect())

    await asyncio.sleep(0.1)
    await file.append(feed, "one\ntwo\npar")
    await asyncio.sleep(0.1)

    assert seen == ["one", "two"]

    await file.append(feed, "tial\n")
    await asyncio.sleep(0.1)
    await file.write(feed, "fresh\n", durable=False)
    await asyncio.wait_for(task, 5)

    assert seen == ["one", "two", "partial", "fresh"]

    whole = asyncio.Event()
    first: list[str] = []

    async for line in file.follow(feed, poll=0.02, stop=whole, tail=False):

        first.append(line)

        whole.set()

    assert first == ["fresh"]

async def test_file_media_rotation_and_comparison ( tmp_path: Path ) -> None:

    samples = {
        "png": (b"\x89PNG\r\n", "image/png"), "jpg": (b"\xff\xd8\xff\xe0", "image/jpeg"), "pdf": (b"%PDF-1.7", "application/pdf"),
        "zip": (b"PK\x03\x04", "application/zip"), "txt": (b"plain text", "text/plain"), "bin": (b"\x00\xff\xfe", "application/octet-stream"),
        "empty": (b"", "application/x-empty"), "zst": (b"\x28\xb5\x2f\xfd", "application/zstd"), "gz": (b"\x1f\x8b\x08", "application/gzip"),
        "sealed": (b"EFS2\x00", "application/x-sealed"), "utf": (("a" + "é" * 300).encode(), "text/plain"), "latin": (b"th\xe9", "application/octet-stream"),
    }

    for name, (head, media) in samples.items():

        await file.write(tmp_path / f"k.{name}", head, durable=False)

        assert await file.media(tmp_path / f"k.{name}") == media, name

    assert await file.is_text(tmp_path / "k.txt") and await file.is_text(tmp_path / "k.utf") and not await file.is_text(tmp_path / "k.bin")

    await refused(file.media(tmp_path / "nothing"), "fs.missing", Code.NOT_FOUND)

    log = tmp_path / "r.log"

    for round_ in range(4):

        await file.write(log, f"gen {round_}")

        assert await file.rotate(log, keep=2) == log and await file.empty(log)

    assert await file.read_text(tmp_path / "r.log.1") == "gen 3" and await file.read_text(tmp_path / "r.log.2") == "gen 2"
    assert not await file.has(tmp_path / "r.log.3") and await file.write(log, "drop") and await file.rotate(log, keep=0) == log
    assert await file.empty(log) and await file.read_text(tmp_path / "r.log.1") == "gen 3"
    assert await file.rotate(tmp_path / "new.log") == tmp_path / "new.log" and await file.empty(tmp_path / "new.log")

    small, other, twin = tmp_path / "small.txt", tmp_path / "other.txt", tmp_path / "twin.txt"

    await file.write(small, b"one\ntwo\n")
    await file.write(other, b"one\nthree\n")
    await file.write(twin, b"one\ntwo\n")

    report = await file.diff(small, other)

    assert "-two" in report and "+three" in report and report.startswith("--- small.txt") and await file.diff(small, twin) == ""
    assert await file.equal(small, twin) and not await file.equal(small, other) and await file.equal(small, small)
    assert await file.write(other, b"one\ntwx\n") and not await file.equal(small, other)

async def test_dir_lists_walks_finds_and_counts ( tmp_path: Path ) -> None:

    base, ghost = tmp_path / "base", tmp_path / "ghost"
    folder      = await dir.make(base / "x" / "y")

    assert folder == base / "x" / "y" and oct(folder.stat().st_mode & 0o777) == "0o700" and await dir.empty(folder)
    assert await dir.make(folder) == folder and await dir.empty(base / "x") is False

    await file.write(folder / "a.md", "a")
    await file.write(folder / "b.txt", "bb")
    await file.make(folder / "c")
    await file.write(base / ".hidden", "h")

    assert [item.name for item in await dir.walk(base)] == [".hidden", "a.md", "b.txt", "c"]
    assert [item.name for item in await dir.walk(base, "md", ".TXT")] == ["a.md", "b.txt"] and await dir.walk(base, "zip") == []
    assert [item.name for item in await dir.files(folder)] == ["a.md", "b.txt", "c"] and await dir.dirs(base / "x") == [folder]
    assert await dir.files(base / "x") == [] and await dir.dirs(folder) == []
    assert [item.name for item in await dir.list(base)] == [".hidden", "x"] and [item.name for item in await dir.list(base, hidden=False)] == ["x"]
    assert [item.name for item in await dir.glob(folder, "*.txt")] == ["b.txt"] and [item.name for item in await dir.glob(base, "**/*.md")] == ["a.md"]
    assert [item.name for item in await dir.find(base, name="*.MD")] == ["a.md"] and [item.name for item in await dir.find(base, contains="b")] == ["b.txt"]
    assert await dir.find(base, larger=1) == [folder / "b.txt"] and await dir.find(base, smaller=1) == [folder / "c"]
    assert await dir.find(base, newer=date.after(60)) == [] and len(await dir.find(base, older=date.after(60))) == 4
    assert len(await dir.find(base, limit=2)) == 2 and await dir.find(base, limit=0) == [] and await dir.find(base, name="*.md", larger=5) == []
    assert await dir.count(base) == { "files": 4, "dirs": 2, "links": 0, "hidden": 1, "bytes": 4 }
    assert await dir.tree(base) == { ".hidden": 1, "x": { "y": { "a.md": 1, "b.txt": 2, "c": 0 } } } and await dir.tree(base, 0) == { ".hidden": 1, "x": {} }
    assert await dir.levels(base) == 2 and await dir.levels(folder) == 0 and await dir.size(base) == 4
    assert sorted(await dir.snapshot(base)) == sorted(await dir.walk(base)) and list(await dir.snapshot(base, recursive=False)) == [base / ".hidden"]
    assert await dir.largest(base) == folder / "b.txt" and await dir.largest(await dir.make(base / "void")) is None

    await file.set(folder / "a.md", modified=date.before(500))
    await file.set(folder / "c", modified=date.after(500))

    assert await dir.oldest(base) == folder / "a.md" and await dir.newest(base) == folder / "c"
    assert await dir.find(base, older=date.before(100)) == [folder / "a.md"] and await dir.find(base, newer=date.after(100)) == [folder / "c"]

    await path.link(folder, base / "loop")
    await path.link(base, folder / "up")

    assert len(await dir.walk(base)) == 4 and (await dir.count(base))["links"] == 2 and await dir.levels(base) == 2

    lost = (
        dir.files(ghost), dir.dirs(ghost), dir.list(ghost), dir.walk(ghost), dir.glob(ghost, "*"), dir.find(ghost), dir.count(ghost),
        dir.tree(ghost), dir.levels(ghost), dir.snapshot(ghost), dir.snapshot(ghost, recursive=False), dir.empty(ghost),
        dir.clear(ghost), dir.sync(ghost, tmp_path / "s"), dir.clean(ghost, 1), dir.newest(ghost), dir.oldest(ghost),
        dir.largest(ghost), dir.size(ghost), dir.hash(ghost), anext(watch.changes(ghost)),
    )

    for job in lost: await refused(job, "fs.missing", Code.NOT_FOUND)

    assert not await path.has(tmp_path / "s") and not await dir.remove(ghost)

async def test_dir_syncs_cleans_and_clears ( tmp_path: Path ) -> None:

    source, mirror = tmp_path / "src", tmp_path / "dst"

    await file.write(source / "a.txt", "a")
    await file.write(source / "sub" / "b.txt", "b")
    await file.write(mirror / "old.txt", "old")

    assert await dir.sync(source, mirror) == 2 and await file.read_text(mirror / "sub" / "b.txt") == "b" and await dir.sync(source, mirror) == 0
    assert await file.has(mirror / "old.txt") and await dir.sync(source, mirror, delete=True) == 0 and not await file.has(mirror / "old.txt")

    await file.write(source / "a.txt", "aa")

    assert await dir.sync(source, mirror) == 1 and await file.read_text(mirror / "a.txt") == "aa"
    assert await dir.hash(source) == await dir.hash(mirror) and await dir.sync(source, tmp_path / "fresh" / "deep") == 2

    logs = tmp_path / "logs"

    for name in ("stale.log", "stale.txt", "fresh.log"): await file.write(logs / "deep" / name, "x")
    for name in ("stale.log", "stale.txt"): await file.set(logs / "deep" / name, modified=date.before(7200))

    assert await dir.clean(logs, 3600, "log") == 1 and not await file.has(logs / "deep" / "stale.log")
    assert await file.has(logs / "deep" / "fresh.log") and await file.has(logs / "deep" / "stale.txt")
    assert await dir.clean(logs, 3600) == 1 and await dir.clean(logs, 3600) == 0 and await dir.has(logs / "deep")

    await path.link(source, mirror / "door")

    assert await dir.clear(mirror) == 3 and await dir.empty(mirror) and await dir.has(mirror) and await file.has(source / "a.txt")
    assert await dir.clear(mirror) == 0 and await dir.remove(mirror) and not await dir.has(mirror)

async def test_pack_archives_round_trip ( tmp_path: Path ) -> None:

    folder = tmp_path / "pack"
    kinds  = {
        ".zip": "application/zip", ".tar": None, ".tar.gz": "application/gzip", ".tgz": "application/gzip",
        ".tar.zst": "application/zstd", ".tar.xz": "application/x-xz", ".tar.bz2": "application/x-bzip2",
    }

    await file.write(folder / "a.txt", "alpha")
    await file.write(folder / "deep" / "b.txt", "beta" * 100)
    await dir.make(folder / "void")

    for suffix, media in kinds.items():

        packed = await pack.archive(tmp_path / "out" / f"pack{suffix}", folder)
        into   = tmp_path / "in" / suffix.strip(".")

        assert media is None or await file.media(packed) == media, suffix
        assert sorted(await pack.names(packed)) == ["pack/a.txt", "pack/deep/b.txt"], suffix
        assert sorted(item.name for item in await pack.extract(packed, into)) == ["a.txt", "b.txt"], suffix
        assert await dir.hash(into / "pack") == await dir.hash(folder), suffix

    rooted = await pack.archive(tmp_path / "out" / "rooted.tar.gz", folder / "a.txt", folder / "deep", root=folder)
    zipped = await pack.archive(tmp_path / "out" / "rooted.ZIP", folder / "a.txt", folder / "deep", root=folder)

    assert sorted(await pack.names(rooted)) == ["a.txt", "deep/b.txt"] == sorted(await pack.names(zipped))
    assert await file.read_text((await pack.extract(rooted, tmp_path / "r"))[0]) == "alpha"

    await refused(pack.archive(tmp_path / "out" / "x.rar", folder), "fs.suffix", Code.BAD_REQUEST)
    await refused(pack.archive(tmp_path / "out" / "x.tar", folder, root=tmp_path / "elsewhere"), "fs.archive", Code.BAD_REQUEST)
    await refused(pack.archive(tmp_path / "out" / "x.zip", folder, root=tmp_path / "elsewhere"), "fs.archive", Code.BAD_REQUEST)
    await refused(pack.archive(tmp_path / "out" / "x.tar", tmp_path / "ghost"), "fs.missing", Code.NOT_FOUND)
    await refused(pack.archive(tmp_path / "out" / "x.zip", tmp_path / "ghost"), "fs.missing", Code.NOT_FOUND)

    assert not await path.has(tmp_path / "out" / "x.tar") and not await path.has(tmp_path / "out" / "x.zip")

    big = tmp_path / "big.bin"

    await file.write(big, b"0123456789" * 100_000, durable=False)

    for algorithm, suffix in (("zstd", ".zst"), ("gzip", ".gz"), ("xz", ".xz"), ("bz2", ".bz2")):

        packed = await pack.compress(big, algorithm=algorithm, level=3 if algorithm != "xz" else None)

        assert packed.name == "big.bin" + suffix and await file.size(packed) < await file.size(big) // 10

        restored = await pack.decompress(packed, tmp_path / f"restored{suffix}.bin")

        assert await file.equal(restored, big), algorithm

    assert await pack.decompress(await pack.compress(big, tmp_path / "copy.bin.zst")) == tmp_path / "copy.bin"

    await refused(pack.decompress(tmp_path / "big.bin.zst", tmp_path / "tiny.bin", limit=100), "fs.bomb", Code.BAD_REQUEST)
    await refused(pack.compress(big, algorithm="rar"), "fs.algorithm", Code.INTERNAL)
    await refused(pack.decompress(big), "fs.suffix", Code.BAD_REQUEST)
    await refused(pack.compress(tmp_path / "ghost"), "fs.missing", Code.NOT_FOUND)
    await refused(pack.decompress(tmp_path / "ghost.gz"), "fs.missing", Code.NOT_FOUND)

    assert not await path.has(tmp_path / "tiny.bin") and not await path.has(tmp_path / "ghost.zst") and not await path.has(tmp_path / "ghost")

    good   = gzip.compress(b"hello world" * 1000)
    broken = { "head": b"\x1f\x8bbroken", "body": good[:10] + b"\xff" * 20 + good[30:], "cut": good[:40], "void": b"" }

    for name, body in broken.items():

        await file.write(tmp_path / f"{name}.gz", body, durable=False)

        await refused(pack.decompress(tmp_path / f"{name}.gz"), "fs.archive", Code.BAD_REQUEST)

        assert not await path.has(tmp_path / name), name

async def test_pack_refuses_slips_bombs_and_junk ( tmp_path: Path, monkeypatch: pytest.MonkeyPatch ) -> None:

    def tar ( name: str, *members: tarfile.TarInfo ) -> Path:

        with tarfile.open(tmp_path / name, "w") as bundle:

            for member in members: bundle.addfile(member, BytesIO(b"x" * member.size))

        return tmp_path / name

    def member ( name: str, size: int = 1, kind: bytes = tarfile.REGTYPE, link: str = "" ) -> tarfile.TarInfo:

        made = tarfile.TarInfo(name)

        made.size, made.type, made.linkname = (size if kind == tarfile.REGTYPE else 0), kind, link

        return made

    def zipped ( name: str, **entries: bytes ) -> Path:

        with zipfile.ZipFile(tmp_path / name, "w", zipfile.ZIP_DEFLATED) as archive:

            for entry, body in entries.items(): archive.writestr(entry.replace("__", "/").replace("UP", ".."), body)

        return tmp_path / name

    slips = (
        zipped("up.zip", ok=b"fine", UP__escape=b"x"), zipped("deep.zip", a__UP__UP__escape=b"x"),
        tar("up.tar", member("ok"), member("../escape")), tar("abs.tar", member(str(tmp_path / "escape"))),
        tar("soft.tar", member("door", kind=tarfile.SYMTYPE, link="/etc"), member("door/passwd")),
        tar("rel.tar", member("door", kind=tarfile.SYMTYPE, link="../..")),
        tar("hard.tar", member("door", kind=tarfile.LNKTYPE, link="../../escape")),
        tar("device.tar", member("null", kind=tarfile.CHRTYPE)),
    )

    with zipfile.ZipFile(tmp_path / "abs.zip", "w") as archive: archive.writestr(str(tmp_path / "escape"), "x")

    for number, evil in enumerate((*slips, tmp_path / "abs.zip")):

        into = tmp_path / "slip" / str(number)

        await refused(pack.extract(evil, into), "fs.slip", Code.BAD_REQUEST)

        assert not (tmp_path / "escape").exists() and not (tmp_path / "slip" / "escape").exists(), evil.name
        assert not (into / "door" / "passwd").exists() and held(tmp_path, "escape*") == [], evil.name

    assert not (tmp_path / "slip" / "0" / "ok").exists()

    flat = zipped("flat.zip", a=b"a" * 100, b=b"b" * 100, c=b"c" * 100)
    roll = tar("flat.tar", member("a", 100), member("b", 100), member("c", 100))

    for number, (evil, limit) in enumerate(((flat, 99), (flat, 250), (roll, 99), (roll, 250))):

        await refused(pack.extract(evil, tmp_path / "bomb" / str(number), limit=limit), "fs.bomb", Code.BAD_REQUEST)

    assert len(await pack.extract(flat, tmp_path / "fit" / "zip", limit=300)) == 3 and len(await pack.extract(roll, tmp_path / "fit" / "tar", limit=300)) == 3

    await refused(pack.extract(zipped("zeros.zip", zeros=b"\x00" * CHUNK), tmp_path / "bomb" / "ratio"), "fs.bomb", Code.BAD_REQUEST)

    assert not (tmp_path / "bomb" / "ratio" / "zeros").exists() and not (tmp_path / "bomb" / "0" / "a").exists()

    monkeypatch.setattr(sys.modules["engine.fs.pack"], "PACK_ITEMS", 2)

    await refused(pack.extract(flat, tmp_path / "bomb" / "many-zip"), "fs.bomb", Code.BAD_REQUEST)
    await refused(pack.extract(roll, tmp_path / "bomb" / "many-tar"), "fs.bomb", Code.BAD_REQUEST)

    monkeypatch.undo()

    whole = await file.read(flat)
    junk  = { "junk.zip": b"not a zip", "void.zip": b"", "cut.zip": whole[: len(whole) // 2], "cut.tar": (await file.read(roll))[:700] }

    for name, body in junk.items():

        await file.write(tmp_path / name, body, durable=False)

        await refused(pack.extract(tmp_path / name, tmp_path / "junk" / name), "fs.archive", Code.BAD_REQUEST)
        await refused(pack.names(tmp_path / name), "fs.archive", Code.BAD_REQUEST)

    await refused(pack.extract(tmp_path / "ghost.zip", tmp_path / "g"), "fs.missing", Code.NOT_FOUND)
    await refused(pack.extract(tmp_path, tmp_path / "g"), "fs.missing", Code.NOT_FOUND)
    await refused(pack.names(tmp_path / "ghost.zip"), "fs.missing", Code.NOT_FOUND)

    assert not await path.has(tmp_path / "g")

async def test_encrypt_seals_and_refuses_tampering ( tmp_path: Path ) -> None:

    crypto.setup([crypto.key("k1")])

    big, ghost = tmp_path / "big.bin", tmp_path / "ghost"

    await file.write(big, os.urandom(CHUNK * 2 + 123), durable=False)

    sealed = await encrypt.seal(big, aad=b"tenant")

    assert sealed.name == "big.bin.sealed" and await file.media(sealed) == "application/x-sealed" and await file.size(sealed) > await file.size(big)
    assert await encrypt.has(sealed) and not await encrypt.has(big) and oct(sealed.stat().st_mode & 0o777) == "0o600"

    opened = await encrypt.open(sealed, tmp_path / "opened.bin", aad=b"tenant")

    assert await file.equal(opened, big) and await encrypt.open(sealed, aad=b"tenant") == big and await file.equal(opened, big)

    raw    = await file.read(sealed)
    frames = []
    cursor = 4

    while cursor < len(raw):

        size = struct.unpack(">I", raw[cursor:cursor + 4])[0]

        frames.append(raw[cursor:cursor + 4 + size])

        cursor += 4 + size

    assert len(frames) == 3 and raw[:4] == b"EFS2"

    middle = len(raw) // 2
    forged = {
        "wrong aad": (raw, b"other", "crypto.tampered"),
        "no aad": (raw, b"", "crypto.tampered"),
        "cut the last frame": (raw[:4] + frames[0] + frames[1], b"tenant", "crypto.tampered"),
        "cut to one frame": (raw[:4] + frames[0], b"tenant", "crypto.tampered"),
        "cut mid frame": (raw[:-10], b"tenant", "fs.sealed"),
        "cut mid head": (raw[: 4 + len(frames[0]) + 2], b"tenant", "fs.sealed"),
        "swapped frames": (raw[:4] + frames[1] + frames[0] + frames[2], b"tenant", "crypto.tampered"),
        "repeated frame": (raw[:4] + frames[0] + frames[0] + frames[1] + frames[2], b"tenant", "crypto.tampered"),
        "dropped frame": (raw[:4] + frames[0] + frames[2], b"tenant", "crypto.tampered"),
        "trailing byte": (raw + b"\x00", b"tenant", "crypto.tampered"),
        "trailing frame": (raw + frames[2], b"tenant", "crypto.tampered"),
        "flipped bit": (raw[:middle] + bytes([raw[middle] ^ 1]) + raw[middle + 1:], b"tenant", "crypto.tampered"),
        "old magic": (b"EFS1" + raw[4:], b"tenant", "fs.sealed"),
        "only magic": (raw[:4], b"tenant", "fs.sealed"),
        "nothing": (b"", b"tenant", "fs.sealed"),
        "huge frame": (raw[:4] + struct.pack(">I", 2 ** 31), b"tenant", "fs.sealed"),
        "plain": (b"just a plain file", b"tenant", "fs.sealed"),
    }

    for name, (body, aad, reason) in forged.items():

        await file.write(tmp_path / "forged.sealed", body, durable=False)

        with pytest.raises(Fault) as caught: await encrypt.open(tmp_path / "forged.sealed", tmp_path / "forged.bin", aad=aad)

        assert caught.value.reason == reason, name
        assert not (tmp_path / "forged.bin").exists() and held(tmp_path, ".*") == [], name

        with pytest.raises(Fault) as read: await encrypt.read(tmp_path / "forged.sealed", aad=aad)

        assert read.value.reason == reason, name

    void = await file.make(tmp_path / "void.bin")

    assert await file.empty(await encrypt.open(await encrypt.seal(void), tmp_path / "void.out")) and await file.size(tmp_path / "void.bin.sealed") > 4
    assert await encrypt.write(tmp_path / "note.sealed", "secret", aad=b"a") > 6 and await encrypt.read(tmp_path / "note.sealed", aad=b"a") == b"secret"
    assert b"secret" not in await file.read(tmp_path / "note.sealed") and await encrypt.has(tmp_path / "note.sealed")
    assert await encrypt.write(tmp_path / "zero.sealed", b"") > 4 and await encrypt.read(tmp_path / "zero.sealed") == b""

    await refused(encrypt.read(tmp_path / "note.sealed", aad=b"b"), "crypto.tampered")
    await refused(encrypt.seal(ghost), "fs.missing", Code.NOT_FOUND)
    await refused(encrypt.open(ghost), "fs.missing", Code.NOT_FOUND)
    await refused(encrypt.read(ghost), "fs.missing", Code.NOT_FOUND)
    await refused(encrypt.has(ghost), "fs.missing", Code.NOT_FOUND)

    assert not await path.has(tmp_path / "ghost.sealed") and not await path.has(tmp_path / "plain")

async def test_locks_exclude_and_release ( tmp_path: Path ) -> None:

    lock, counter = tmp_path / "locks" / "job.lock", tmp_path / "counter"

    async with file.lock(lock) as held:

        assert held == lock

        with pytest.raises(Fault) as busy:

            async with file.lock(lock, wait=0.05): pass

        assert busy.value.code is Code.CONFLICT and busy.value.reason == "fs.locked"

    async with file.lock(lock, wait=0.05): pass

    with pytest.raises(RuntimeError):

        async with path.lock(lock): raise RuntimeError("inside")

    async with path.lock(lock, wait=0.05): pass

    await file.write(counter, "0")

    async def bump () -> None:

        async with path.lock(lock, wait=20):

            held = int(await file.read_text(counter))

            await asyncio.sleep(0)
            await file.write(counter, str(held + 1), durable=False)

    await asyncio.gather(*(bump() for _ in range(16)))

    assert await file.read_text(counter) == "16"

async def test_watch_reports_changes ( tmp_path: Path ) -> None:

    watched = await dir.make(tmp_path / "watched")
    stop    = asyncio.Event()
    seen: list[Change] = []

    async def collect () -> None:

        async for changes in watch.changes(watched, debounce=0.05, stop=stop):

            seen.extend(changes)

            if any(change.kind == "deleted" for change in seen): stop.set()

    task = asyncio.create_task(collect())

    await asyncio.sleep(0.3)
    await file.write(watched / ".manual.part", "staged", durable=False)
    await file.write(watched / "__pycache__" / "kept.pyc", "1", durable=False)
    await file.write(watched / "a.txt", "1", durable=False)
    await asyncio.sleep(0.4)
    await file.remove(watched / "a.txt")
    await asyncio.wait_for(task, 5)

    kinds = { change.kind for change in seen if change.path.name == "a.txt" }

    assert "deleted" in kinds and ("added" in kinds or "modified" in kinds)
    assert { change.path.name for change in seen } == { "a.txt", "kept.pyc" }
    assert any(change.dump() == { "kind": "deleted", "path": str(watched / "a.txt") } for change in seen)

    before = { Path("a"): 1.0, Path("b"): 2.0, Path("d"): 4.0 }
    after  = { Path("b"): 3.0, Path("c"): 1.0, Path("d"): 4.0 }

    assert watch.compare(before, after) == [Change("deleted", Path("a")), Change("modified", Path("b")), Change("added", Path("c"))]
    assert watch.compare(before, before) == [] and watch.compare({}, {}) == []

    polled: list[Change] = []
    halt = asyncio.Event()

    async def poll () -> None:

        async for changes in watch.poll(watched, recursive=True, debounce=0.01, stop=halt):

            polled.extend(changes)

            if any(change.path.name == "last.txt" for change in changes): halt.set()

    poller = asyncio.create_task(poll())

    await asyncio.sleep(0.05)

    for number in range(40): await file.write(watched / "deep" / f"p{number}.txt", "p", durable=False)

    await file.write(watched / "deep" / ".manual.part", "staged", durable=False)
    await file.write(watched / "deep" / "last.txt", "p", durable=False)
    await asyncio.wait_for(poller, 5)

    assert { change.path.name for change in polled } == { f"p{number}.txt" for number in range(40) } | { "last.txt" }
    assert all(change.kind == "added" for change in polled) and len(polled) == 41

    flat: list[Change] = []
    done = asyncio.Event()

    async def shallow () -> None:

        async for changes in watch.poll(watched, recursive=False, debounce=0.01, stop=done):

            flat.extend(changes)

            done.set()

    lone = asyncio.create_task(shallow())

    await asyncio.sleep(0.05)
    await file.write(watched / "deep" / "hidden-from-flat.txt", "p", durable=False)
    await file.write(watched / "top.txt", "p", durable=False)
    await asyncio.wait_for(lone, 5)

    assert flat == [Change("added", watched / "top.txt")]

async def test_image_decodes_shapes_and_encodes () -> None:

    data   = picture()
    opened = await image.decode(data)

    assert opened.dump() == { "width": 800, "height": 600, "mode": "RGB", "format": "png" } and opened.pixels() == 480_000
    assert Picture(opened.raw, "png").width == 800 and image.formats() == ("avif", "gif", "jpeg", "png", "webp")
    assert image.sniff(data) == "png" and image.sniff(picture(format_="JPEG")) == "jpeg" and image.sniff(b"nope") is None and image.sniff(b"") is None
    assert image.media("webp") == "image/webp" and image.media("JPG") == "image/jpeg" and image.media("heic") == "image/heic"
    assert image.known("JPG") == "jpeg" and image.known("jpe") == "jpeg" and image.known("WebP") == "webp"

    resized = await image.resize(opened, width=400)
    tall    = await image.resize(opened, height=150)
    exact   = await image.resize(opened, 10, 20)
    fitted  = await image.fit(opened, 100, 100)
    covered = await image.cover(opened, 100, 100)
    cropped = await image.crop(opened, 100, 50, 200, 100)
    clipped = await image.crop(opened, 700, 500, 500, 500)
    turned  = await image.rotate(opened, 90)
    mirror  = await image.flip(opened)
    upside  = await image.flip(opened, vertical=True)

    assert (resized.width, resized.height) == (400, 300) and (tall.width, tall.height) == (200, 150) and (exact.width, exact.height) == (10, 20)
    assert (fitted.width, fitted.height) == (100, 75) and (covered.width, covered.height) == (100, 100)
    assert (cropped.width, cropped.height) == (200, 100) and (clipped.width, clipped.height) == (100, 100)
    assert (turned.width, turned.height) == (600, 800) and turned.raw.getpixel((300, 10)) == BLUE and turned.raw.getpixel((300, 790)) == RED
    assert mirror.raw.getpixel((10, 10)) == RED and mirror.raw.getpixel((790, 10)) == BLUE and upside.raw.getpixel((10, 10)) == BLUE
    assert opened.raw.getpixel((10, 10)) == BLUE and (opened.width, opened.height) == (800, 600) and turned.format == "png"

    for name in image.formats():

        blob = await image.encode(fitted, name)

        assert image.sniff(blob) == name and (await image.decode(blob)).dump() | { "mode": "" } == { "width": 100, "height": 75, "mode": "", "format": name }

    exactly = await image.decode(await image.encode(fitted, "webp", lossless=True))

    assert exactly.raw.tobytes() == fitted.raw.tobytes() and image.sniff(await image.encode(fitted, "jpg", quality=10)) == "jpeg"
    assert len(await image.encode(fitted, "jpeg", quality=10)) < len(await image.encode(fitted, "jpeg", quality=95))
    assert (await image.decode(await image.thumbnail(data, 64))).dump()["width"] == 64
    assert image.sniff(await image.convert(data, "jpeg")) == "jpeg"

    sizes = await image.variants(data, (640, 320, 1280, 320))

    assert sorted(sizes) == [320, 640, 800] and all(image.sniff(blob) == "webp" for blob in sizes.values())
    assert sorted(await image.variants(data, (100,), "png")) == [100] and sorted(await image.variants(data, (5000,))) == [800]

    colors = await image.dominant(opened, 2)

    assert len(colors) == 2 and all(color.startswith("#") and len(color) == 7 for color in colors)
    assert len(await image.dominant(opened, 0)) == 1 and len(await image.dominant(opened, 999)) <= 16
    assert image.stats()["encoded"] >= 8 and image.stats()["decoded"] >= 8 and image.describe()["quality"] == 85

async def test_image_strips_metadata_and_keeps_pixels () -> None:

    exif = Pil.Exif()

    exif[0x0112] = 6
    exif[0x010F] = "secret camera"

    upright = await image.decode(picture(400, 200, "JPEG", exif=exif.tobytes()))

    assert (upright.width, upright.height) == (200, 400) and len(upright.raw.getexif()) == 0 and not upright.raw.info
    assert len(Pil.open(BytesIO(await image.encode(upright, "jpeg"))).getexif()) == 0
    assert b"secret camera" not in await image.encode(upright, "webp") and b"secret camera" not in await image.encode(upright, "png")

    veil = Pil.new("RGBA", (10, 10), (10, 20, 30, 40))
    out  = BytesIO()

    veil.save(out, format="PNG")

    ghost = await image.decode(out.getvalue())

    assert ghost.mode == "RGBA" and ghost.raw.getpixel((5, 5)) == (10, 20, 30, 40)
    assert (await image.decode(await image.encode(ghost, "png"))).raw.getpixel((5, 5)) == (10, 20, 30, 40)
    assert (await image.decode(await image.encode(ghost, "webp", lossless=True))).raw.getpixel((5, 5)) == (10, 20, 30, 40)
    assert (await image.decode(await image.encode(ghost, "jpeg"))).mode == "RGB"

    flat = Pil.new("P", (4, 4), 1)
    out  = BytesIO()

    flat.putpalette([0, 0, 0, 250, 20, 20] + [0, 0, 0] * 254)
    flat.save(out, format="PNG", transparency=0)

    indexed = await image.decode(out.getvalue())

    assert indexed.mode == "P" and indexed.raw.convert("RGB").getpixel((1, 1)) == (250, 20, 20) and indexed.raw.info == { "transparency": 0 }
    assert (await image.decode(await image.encode(indexed, "png"))).raw.convert("RGBA").getpixel((1, 1)) == (250, 20, 20, 255)
    assert image.sniff(await image.encode(indexed, "gif")) == "gif" and image.sniff(await image.encode(indexed, "jpeg")) == "jpeg"

async def test_image_refuses_junk_bombs_and_bad_shapes ( tmp_path: Path ) -> None:

    data   = picture()
    opened = await image.decode(data)

    await refused(image.decode(picture(format_="BMP")), "image.format", Code.UNSUPPORTED_MEDIA)
    await refused(image.decode(picture(format_="TIFF")), "image.format", Code.UNSUPPORTED_MEDIA)
    await refused(image.decode(b"not an image at all"), "image.decode", Code.UNSUPPORTED_MEDIA)
    await refused(image.decode(b""), "image.decode", Code.UNSUPPORTED_MEDIA)
    await refused(image.decode(data[:200]), "image.decode", Code.UNSUPPORTED_MEDIA)
    await refused(image.decode(data[: len(data) // 2]), "image.decode", Code.UNSUPPORTED_MEDIA)
    await refused(image.decode(data[:1000] + b"\xff" * 40 + data[1040:]), "image.decode", Code.UNSUPPORTED_MEDIA)
    await refused(image.decode(forged(8000, 8000)), "image.pixels", Code.TOO_LARGE)
    await refused(image.encode(opened, "tiff"), "image.format", Code.UNSUPPORTED_MEDIA)
    await refused(image.convert(data, "bmp"), "image.format", Code.UNSUPPORTED_MEDIA)
    await refused(image.resize(opened), "image.size", Code.INTERNAL)
    await refused(image.crop(opened, 900, 0, 10, 10), "image.size", Code.INTERNAL)
    await refused(image.crop(opened, -1, 0, 10, 10), "image.size", Code.INTERNAL)
    await refused(image.crop(opened, 0, 0, 0, 10), "image.size", Code.INTERNAL)

    with pytest.raises(Fault) as unknown: image.known("svg")

    assert unknown.value.reason == "image.format" and unknown.value.errors == { "format": ["svg"] }

    small = Image(file)

    small.setup(pixels=10_000, formats=("png", "JPEG"), quality=50)

    assert small.formats() == ("jpeg", "png") and small.describe()["pixels"] == 10_000 and small.describe()["quality"] == 50

    await refused(small.decode(data), "image.pixels", Code.TOO_LARGE)
    await refused(small.encode(opened, "webp"), "image.format", Code.UNSUPPORTED_MEDIA)

    assert (await small.decode(picture(100, 100))).width == 100 and image.describe()["pixels"] == 50_000_000

    for pixels, quality in ((0, 80), (1, 0), (1, 101)):

        with pytest.raises(Fault) as wrong: small.setup(pixels=pixels, quality=quality)

        assert wrong.value.reason == "image.setup"

    shot = tmp_path / "shot.png"

    await file.write(shot, picture(300, 200))

    held = await image.read(shot)

    assert held.width == 300 and await image.write(tmp_path / "out" / "shot.jpg", held) > 0
    assert image.sniff(await file.read(tmp_path / "out" / "shot.jpg")) == "jpeg"
    assert await image.write(tmp_path / "shot.bin", held, "webp") > 0 and image.sniff(await file.read(tmp_path / "shot.bin")) == "webp"

    await refused(image.write(tmp_path / "shot.txt", held), "image.format", Code.UNSUPPORTED_MEDIA)
    await refused(image.read(tmp_path / "ghost.png"), "fs.missing", Code.NOT_FOUND)
    await refused(image.read(shot, limit=10), "fs.size", Code.TOO_LARGE)
    await refused(image.read(tmp_path), "fs.kind", Code.CONFLICT)

    assert not await path.has(tmp_path / "shot.txt")
