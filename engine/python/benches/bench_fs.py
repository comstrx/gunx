from engine.crypto import crypto
from engine.fs import dir, encrypt, file, image, pack, path
from engine.log import log
from engine.test import Bench
from io import BytesIO
from pathlib import Path
from PIL import Image as Pil
from typing import Any
import asyncio, tempfile

bench  = Bench()
loop   = asyncio.new_event_loop()
root   = Path(tempfile.mkdtemp(prefix="engine-bench-fs-"))
blob   = bytes(range(256)) * 256
raster = BytesIO()

Pil.new("RGB", (800, 600), (200, 30, 30)).save(raster, format="PNG")

png = raster.getvalue()

log.setup("error", "json", Path("/dev/null"))
crypto.setup([crypto.key("k1")])

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

async def seed () -> None:

    for at in range(300): await file.write(root / "tree" / f"sub{at % 10}" / f"file-{at}.txt", b"x" * 100, durable=False)

    await file.write(root / "blob.bin", blob, durable=False)
    await pack.archive(root / "tree.zip", root / "tree", root=root)
    await encrypt.seal(root / "blob.bin", root / "blob.sealed")

def safe () -> None: path.safe("../Photo of Me.PNG")

def fixing () -> None: path.fix("~/a/../b/./c.txt")

def ext () -> None: path.ext("archive.tar.gz")

async def writing () -> None: await file.write(root / "w.bin", blob, durable=False)

async def durable () -> None: await file.write(root / "d.bin", blob)

async def reading () -> None: await file.read(root / "blob.bin")

async def walking () -> None: await dir.walk(root / "tree")

async def probing () -> None: await path.get(root / "blob.bin")

async def sealing () -> None: await encrypt.seal(root / "blob.bin", root / "b.sealed")

async def opening () -> None: await encrypt.open(root / "blob.sealed", root / "b.bin")

async def extracting () -> None: await pack.extract(root / "tree.zip", root / "out")

async def decoding () -> None: await image.decode(png)

async def thumbing () -> None: await image.thumbnail(png, 256)

run(seed())

bench.measure("fs.path.safe", safe)
bench.measure("fs.path.fix", fixing)
bench.measure("fs.path.ext", ext)
run(bench.measure_async("fs.file.write.64k", writing, rounds=1000))
run(bench.measure_async("fs.file.write.64k.durable", durable, rounds=200))
run(bench.measure_async("fs.file.read.64k", reading, rounds=2000))
run(bench.measure_async("fs.path.get", probing, rounds=2000))
run(bench.measure_async("fs.dir.walk.300", walking, rounds=200))
run(bench.measure_async("fs.encrypt.seal.64k", sealing, rounds=300))
run(bench.measure_async("fs.encrypt.open.64k", opening, rounds=300))
run(bench.measure_async("fs.pack.extract.300", extracting, rounds=20))
run(bench.measure_async("fs.image.decode.800x600", decoding, rounds=300))
run(bench.measure_async("fs.image.thumbnail.256", thumbing, rounds=200))
run(path.remove(root))
loop.close()
log.close()
