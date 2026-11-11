from engine.log import log
from engine.storage import Policy, Storage
from engine.test import Bench
from pathlib import Path
import asyncio, tempfile

bench   = Bench()
loop    = asyncio.new_event_loop()
storage = Storage()
policy  = Policy()
folder  = Path(tempfile.mkdtemp(prefix="engine-bench-"))
png     = b"\x89PNG\r\n\x1a\n" + bytes(64 * 1024)
disk    = storage.local("public", folder, "https://cdn.test", public=True)

log.setup("error", "json", Path("/dev/null"))
storage.setup({ "public": disk }, "public")

def checking () -> None: policy.check("Photo of Me.PNG", len(png), png[:8])

def keying () -> None: storage.key("Photo of Me.PNG", "avatars")

async def putting () -> None: await disk.put("bench/a.png", png)

async def getting () -> None: await disk.get("bench/a.png")

async def heading () -> None: await disk.info("bench/a.png")

async def uploading () -> None: await storage.upload("Photo of Me.PNG", png, "avatars")

async def listing () -> None: await disk.list("avatars/")

bench.measure("storage.policy.check", checking)
bench.measure("storage.key", keying)
loop.run_until_complete(bench.measure_async("storage.local.put.64k", putting, rounds=1000))
loop.run_until_complete(bench.measure_async("storage.local.get.64k", getting, rounds=1000))
loop.run_until_complete(bench.measure_async("storage.local.info", heading, rounds=1000))
loop.run_until_complete(bench.measure_async("storage.upload.64k", uploading, rounds=300))
loop.run_until_complete(bench.measure_async("storage.local.list.300", listing, rounds=100))
loop.run_until_complete(storage.close())
loop.close()
log.close()

for item in folder.rglob("*"):

    if item.is_file(): item.unlink()

for item in sorted(folder.rglob("*"), reverse=True):

    if item.is_dir(): item.rmdir()

folder.rmdir()
