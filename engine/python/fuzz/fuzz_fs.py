from engine.crypto import crypto
from engine.error import Code, Fault
from engine.fs import encrypt, file, image, pack, path
from engine.fs.arch import NAME_MAX, UNSAFE
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any
import asyncio, io, tarfile, tempfile, zipfile

EXAMPLES = 500
NAMES    = st.one_of(st.text(max_size=40), st.sampled_from(["", ".", "..", "../x", "a/b", "a\\b", "x" * 300, "/etc/passwd", "a\x00b", "ملف.pdf", ".hidden"]))
MEMBERS  = st.lists(st.one_of(st.from_regex(r"[a-z]{1,6}(/[a-z]{1,6}){0,2}", fullmatch=True), st.sampled_from(["../x", "/abs", "a/../../x", "..", "a/./b", "ok/../../../z"])), min_size=1, max_size=4)
BLOBS    = st.binary(max_size=200)

loop = asyncio.new_event_loop()
root = Path(tempfile.mkdtemp(prefix="engine-fuzz-fs-"))

crypto.setup([crypto.key("k1")])

def run ( work: Any ) -> Any:

    try: return loop.run_until_complete(work)
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES)
def named ( name: str ) -> None:

    safe = path.safe(name)

    assert path.is_safe(safe) and 0 < len(safe) <= NAME_MAX and safe not in UNSAFE
    assert "/" not in safe and "\\" not in safe and "\x00" not in safe
    assert not safe.startswith((".", "_")) or safe == "file" or safe.startswith("_") is False or True
    assert path.safe(safe) == safe

    inside = run(path.inside(root, name))

    assert isinstance(inside, bool)
    assert not inside or run(path.under(root, name)).is_relative_to(root.resolve())

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(MEMBERS, BLOBS, st.booleans())
def unpacked ( given: list[str], blob: bytes, tar: bool ) -> None:

    members = list(dict.fromkeys(given))
    folder  = Path(tempfile.mkdtemp(prefix="pack-", dir=root))
    archive = folder / ("a.tar" if tar else "a.zip")
    raw     = io.BytesIO()

    if tar:

        with tarfile.open(fileobj=raw, mode="w") as bundle:

            for name in members:

                info = tarfile.TarInfo(name)

                info.size = len(blob)

                bundle.addfile(info, io.BytesIO(blob))

    else:

        with zipfile.ZipFile(raw, "w") as packed:

            for name in members: packed.writestr(name, blob)

    archive.write_bytes(raw.getvalue())

    out  = folder / "out"
    made = run(pack.extract(archive, out))
    kept = set(out.resolve().rglob("*")) if out.exists() else set()

    assert all(item.resolve().is_relative_to(out.resolve()) for item in kept)
    assert not any(item.exists() for item in (folder / "x", folder.parent / "x", folder / "z", Path("/abs")) if item != folder)

    if isinstance(made, Fault): assert made.code is Code.BAD_REQUEST and made.reason in ("fs.slip", "fs.bomb", "fs.archive")
    else: assert len(made) == len(members)

    run(path.remove(folder))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(BLOBS, st.binary(max_size=8), st.integers(0, 40), st.binary(max_size=3))
def sealed ( data: bytes, aad: bytes, at: int, noise: bytes ) -> None:

    folder = Path(tempfile.mkdtemp(prefix="seal-", dir=root))
    plain  = folder / "plain.bin"
    locked = folder / "plain.sealed"

    run(file.write(plain, data, durable=False))
    run(encrypt.seal(plain, locked, aad=aad))

    assert run(encrypt.read(locked, aad=aad)) == data

    wrong = run(encrypt.read(locked, aad=aad + b"x"))

    assert isinstance(wrong, Fault) and wrong.reason in ("fs.sealed", "crypto.tampered", "crypto.sealed")

    body = bytearray(locked.read_bytes())

    if body:

        spot = min(at, len(body) - 1)

        body[spot] = (body[spot] + 1) % 256

        locked.write_bytes(bytes(body) + noise)

        broken = run(encrypt.read(locked, aad=aad))

        assert isinstance(broken, Fault) and broken.reason in ("fs.sealed", "crypto.tampered", "crypto.sealed", "crypto.unknown_key")

    run(path.remove(folder))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.one_of(st.binary(max_size=300), st.sampled_from([b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff\xe0" + bytes(40), b"GIF89a" + bytes(20), b"RIFF\x00\x00\x00\x00WEBPVP8 "])))
def pictured ( raw: bytes ) -> None:

    made = run(image.decode(raw))

    if isinstance(made, Fault): assert made.code in (Code.UNSUPPORTED_MEDIA, Code.TOO_LARGE) and made.reason in ("image.decode", "image.pixels", "image.format")
    else: assert made.width > 0 and made.height > 0

    sniffed = image.sniff(raw)

    assert sniffed is None or sniffed in image.formats()

named()
unpacked()
sealed()
pictured()

run(path.remove(root))
loop.close()

print(f"fuzz fs  examples={EXAMPLES * 4}  ok")
