from collections.abc import AsyncGenerator, AsyncIterable, AsyncIterator, Callable, Iterable
from itertools import islice
from typing import Any, BinaryIO

from engine.error import Code, Fault
from engine.func import func
from engine.json import json
from engine.log import log
from engine.parse import parse
from engine.string import string
from engine.thread import thread
from .arch import CHUNK, FOLLOW, HEAD, MAGIC, MAX_READ, MODE_FILE, NAME_MAX, Reader, STAGED, Target
from .path import Path
import asyncio, codecs, os, pathlib, re, tempfile

class File(Path):

    _only = "file"

    def __init__ ( self ) -> None:

        self._native: Reader = func.pick("fs.read", "caio", self._caio_, lambda: self._plain_)

    async def make ( self, target: Target, mode: int = MODE_FILE ) -> pathlib.Path:

        path = pathlib.Path(target)

        def go () -> pathlib.Path:

            self._need_(path).parent.mkdir(parents=True, exist_ok=True)
            path.touch(mode)

            return path

        return await self._run_(path, go)

    async def read ( self, target: Target, limit: int = MAX_READ ) -> bytes:

        path = pathlib.Path(target)
        size = await self._run_(path, lambda: self._need_(path).stat().st_size)

        if size > limit: raise Fault(Code.TOO_LARGE, reason="fs.size", errors={ "path": [path.name] })

        try: return await self._native(path, size)
        except (OSError, ValueError) as error: raise self._fault_(path, error) from error

    async def read_text ( self, target: Target, limit: int = MAX_READ ) -> str:

        try: return (await self.read(target, limit)).decode("utf-8")
        except UnicodeDecodeError as error: raise Fault(Code.BAD_REQUEST, reason="fs.encoding") from error

    async def read_lines ( self, target: Target, limit: int = MAX_READ ) -> list[str]:

        return string.lines(await self.read_text(target, limit), keep_blank=True)

    async def read_json ( self, target: Target, limit: int = MAX_READ ) -> Any:

        return json.decode(await self.read(target, limit))

    async def read_toml ( self, target: Target, limit: int = MAX_READ ) -> dict[str, Any]:

        return parse.toml(await self.read_text(target, limit))

    async def head ( self, target: Target, count: int = 10 ) -> list[str]:

        path = pathlib.Path(target)

        def go () -> list[str]:

            with self._need_(path).open("r", encoding="utf-8", errors="replace") as handle:

                return [line.rstrip("\n") for _, line in zip(range(count), handle, strict=False)]

        return await self._run_(path, go)

    async def tail ( self, target: Target, count: int = 10 ) -> list[str]:

        path = pathlib.Path(target)

        def go () -> list[str]:

            with self._need_(path).open("rb") as handle:

                position = handle.seek(0, os.SEEK_END)
                held     = b""

                while position > 0 and held.count(b"\n") <= count:

                    step      = min(CHUNK, position)
                    position -= step

                    handle.seek(position)

                    held = handle.read(step) + held

                return held.decode("utf-8", "replace").splitlines()[-count:] if count > 0 else []

        return await self._run_(path, go)

    async def line ( self, target: Target, number: int ) -> str | None:

        found = await self.range(target, number, number)

        return found[0] if found else None

    async def range ( self, target: Target, first: int, last: int ) -> list[str]:

        path = pathlib.Path(target)

        def go () -> list[str]:

            with self._need_(path).open("r", encoding="utf-8", errors="replace") as handle:

                return [line.rstrip("\n") for line in islice(handle, max(first, 1) - 1, max(last, 0))]

        return await self._run_(path, go)

    async def stream (
        self, target: Target, chunk: int = CHUNK, start: int = 0, end: int | None = None,
    ) -> AsyncGenerator[bytes]:

        path = pathlib.Path(target)
        left = None if end is None else max(0, end - start + 1)

        def opened () -> BinaryIO:

            handle = self._need_(path).open("rb")

            if start: handle.seek(start)

            return handle

        handle = await self._run_(path, opened)

        try:

            while left is None or left > 0:

                piece = await thread.offload(handle.read, chunk if left is None else min(chunk, left))

                if not piece: return
                if left is not None: left -= len(piece)

                yield piece

        finally: await thread.offload(handle.close)

    async def follow (
        self, target: Target, poll: float = FOLLOW, stop: asyncio.Event | None = None, tail: bool = True,
    ) -> AsyncIterator[str]:

        path     = pathlib.Path(target)
        position = await self.size(path) if tail else 0

        def pull ( start: int ) -> tuple[list[str], int]:

            try: handle = self._need_(path).open("rb")
            except FileNotFoundError: return [], 0

            with handle:

                begin = start if start <= os.fstat(handle.fileno()).st_size else 0

                handle.seek(begin)

                held  = handle.read(CHUNK)
                whole = held.rfind(b"\n") + 1 or (len(held) if len(held) == CHUNK else 0)

                return held[:whole].decode("utf-8", "replace").splitlines(), begin + whole

        while stop is None or not stop.is_set():

            lines, position = await self._run_(path, pull, position)

            for line in lines: yield line

            if not lines: await thread.sleep(poll)

    async def write ( self, target: Target, data: bytes | str, mode: int | None = None, durable: bool = True ) -> int:

        raw = self._raw_(data)

        return await self.fill(target, lambda out: out.write(raw), mode, durable)

    async def fill (
        self, target: Target, job: Callable[[BinaryIO], object], mode: int | None = None, durable: bool = True,
    ) -> int:

        path = pathlib.Path(target)

        return await self._run_(path, self._replace_, path, job, mode, durable)

    async def pour (
        self, target: Target, source: AsyncIterable[bytes], limit: int | None = None, mode: int | None = None,
        durable: bool = True,
    ) -> int:

        path = pathlib.Path(target)

        out, staged, kept = await self._run_(path, self._stage_, path, mode)

        try:

            await self._drain_(path, out, source, limit)

            return await self._run_(path, self._commit_, path, out, staged, kept, durable)

        except BaseException:

            await asyncio.shield(thread.offload(self._drop_, out, staged))

            raise

    async def write_lines (
        self, target: Target, lines: Iterable[str], mode: int | None = None, durable: bool = True,
    ) -> int:

        return await self.write(target, "".join(f"{line}\n" for line in lines), mode, durable)

    async def write_json ( self, target: Target, value: object, pretty: bool = False, durable: bool = True ) -> int:

        encoded = json.encode(value, pretty=pretty, stable=pretty) + (b"\n" if pretty else b"")

        return await self.write(target, encoded, durable=durable)

    async def put ( self, target: Target, data: bytes | str, mode: int = MODE_FILE ) -> bool:

        path = pathlib.Path(target)
        raw  = self._raw_(data)

        def go () -> bool:

            path.parent.mkdir(parents=True, exist_ok=True)

            try: handle = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
            except FileExistsError: return False

            with os.fdopen(handle, "wb") as out: out.write(raw)

            return True

        return await self._run_(path, go)

    async def append ( self, target: Target, data: bytes | str ) -> int:

        path = pathlib.Path(target)
        raw  = self._raw_(data)

        def go () -> int:

            self._need_(path).parent.mkdir(parents=True, exist_ok=True)

            with path.open("ab") as handle: return handle.write(raw)

        return await self._run_(path, go)

    async def prepend ( self, target: Target, data: bytes | str, durable: bool = True ) -> int:

        path = pathlib.Path(target)
        held = await self.read(path) if await self.has(path) else b""

        return await self.write(path, self._raw_(data) + held, durable=durable)

    async def add ( self, target: Target, line: str ) -> bool:

        path = pathlib.Path(target)
        held = await self.read_lines(path) if await self.has(path) else []

        if line in held: return False

        await self.write_lines(path, [*held, line])

        return True

    async def insert ( self, target: Target, number: int, *lines: str ) -> int:

        held  = await self.read_lines(target)
        index = max(0, min(number - 1, len(held)))

        return await self.write_lines(target, [*held[:index], *lines, *held[index:]])

    async def cut ( self, target: Target, first: int, last: int | None = None ) -> list[str]:

        held  = await self.read_lines(target)
        start = max(0, first - 1)
        end   = max(start, first if last is None else last)

        if held[start:end]: await self.write_lines(target, [*held[:start], *held[end:]])

        return held[start:end]

    async def sort ( self, target: Target, reverse: bool = False, unique: bool = False ) -> int:

        held = await self.read_lines(target)

        return await self.write_lines(target, sorted(set(held) if unique else held, reverse=reverse))

    async def dedupe ( self, target: Target ) -> int:

        held = await self.read_lines(target)
        kept = list(dict.fromkeys(held))

        if len(kept) != len(held): await self.write_lines(target, kept)

        return len(held) - len(kept)

    async def take ( self, target: Target, limit: int = MAX_READ ) -> bytes:

        held = await self.read(target, limit)

        await self.remove(target)

        return held

    async def clear ( self, target: Target ) -> pathlib.Path:

        return await self.truncate(target, 0)

    async def truncate ( self, target: Target, size: int ) -> pathlib.Path:

        path = pathlib.Path(target)

        def go () -> pathlib.Path:

            with self._need_(path).open("r+b") as handle: handle.truncate(max(0, size))

            return path

        return await self._run_(path, go)

    async def edit ( self, target: Target, change: Callable[[str], str], durable: bool = True ) -> int:

        return await self.write(target, change(await self.read_text(target)), durable=durable)

    async def replace ( self, target: Target, old: str, new: str, count: int = -1 ) -> int:

        text  = await self.read_text(target)
        found = string.count(text, old) if count < 0 else min(count, string.count(text, old))

        if found: await self.write(target, text.replace(old, new, count))

        return found

    async def contains ( self, target: Target, needle: bytes | str ) -> bool:

        path = pathlib.Path(target)
        raw  = self._raw_(needle)

        return await self._run_(path, lambda: self._holds_(self._need_(path), raw))

    async def starts ( self, target: Target, data: bytes | str ) -> bool:

        path = pathlib.Path(target)
        raw  = self._raw_(data)

        def go () -> bool:

            with self._need_(path).open("rb") as handle: return handle.read(len(raw)) == raw

        return await self._run_(path, go)

    async def ends ( self, target: Target, data: bytes | str ) -> bool:

        path = pathlib.Path(target)
        raw  = self._raw_(data)

        def go () -> bool:

            with self._need_(path).open("rb") as handle:

                size = handle.seek(0, os.SEEK_END)

                if size < len(raw): return False

                handle.seek(size - len(raw))

                return handle.read() == raw

        return await self._run_(path, go)

    async def find (
        self, target: Target, needle: str, regex: bool = False, limit: int = 1000,
    ) -> list[tuple[int, str]]:

        path = pathlib.Path(target)

        try: wanted = re.compile(needle) if regex else None
        except re.error as error: raise Fault(Code.BAD_REQUEST, reason="fs.pattern") from error

        def go () -> list[tuple[int, str]]:

            found: list[tuple[int, str]] = []

            with self._need_(path).open("r", encoding="utf-8", errors="replace") as handle:

                for number, line in enumerate(handle, 1):

                    if len(found) >= limit: break

                    if wanted.search(line) if wanted else string.contains(line, needle):

                        found.append((number, line.rstrip("\n")))

            return found

        return await self._run_(path, go)

    async def count ( self, target: Target ) -> dict[str, int]:

        raw  = await self.read(target)
        text = raw.decode("utf-8", "replace")

        lines = len(string.lines(text, keep_blank=True))

        return { "lines": lines, "words": string.word_count(text), "bytes": len(raw) }

    async def media ( self, target: Target ) -> str:

        path = pathlib.Path(target)
        head = await self._run_(path, self._head_, path)

        for magic, media in MAGIC:

            if head.startswith(magic): return media

        if not head: return "application/x-empty"

        return "text/plain" if self._text_(head) else "application/octet-stream"

    async def is_text ( self, target: Target ) -> bool:

        path = pathlib.Path(target)

        return self._text_(await self._run_(path, self._head_, path))

    async def shebang ( self, target: Target ) -> str | None:

        first = (await self.head(target, 1) or [""])[0]

        return string.trim(first[2:]) if string.starts(first, "#!") else None

    async def empty ( self, target: Target ) -> bool:

        return await self.size(target) == 0

    async def equal ( self, left: Target, right: Target ) -> bool:

        if await self.size(left) != await self.size(right): return False

        return await self.hash(left) == await self.hash(right)

    async def diff ( self, left: Target, right: Target, context: int = 3 ) -> str:

        before, after = await self.read_text(left), await self.read_text(right)

        return string.diff(before, after, context, self.name(left), self.name(right))

    async def rotate ( self, target: Target, keep: int = 5 ) -> pathlib.Path:

        path = pathlib.Path(target)

        def go () -> pathlib.Path:

            self._need_(path)

            for number in range(keep, 0, -1):

                aged = path.with_name(f"{path.name}.{number}")

                if not aged.exists(): continue

                if number == keep: aged.unlink()
                else: aged.replace(path.with_name(f"{path.name}.{number + 1}"))

            if keep > 0 and path.exists(): path.replace(path.with_name(f"{path.name}.1"))
            else: path.unlink(missing_ok=True)

            path.touch(MODE_FILE)

            return path

        return await self._run_(path, go)

    def _raw_ ( self, data: bytes | str ) -> bytes:

        return data.encode() if isinstance(data, str) else data

    def _text_ ( self, head: bytes ) -> bool:

        if b"\0" in head: return False

        try: codecs.getincrementaldecoder("utf-8")().decode(head, len(head) < HEAD)
        except UnicodeDecodeError: return False

        return True

    def _replace_ (
        self, path: pathlib.Path, job: Callable[[BinaryIO], object], mode: int | None, durable: bool,
    ) -> int:

        out, staged, kept = self._stage_(path, mode)

        try:

            job(out)

            return self._commit_(path, out, staged, kept, durable)

        except BaseException:

            self._drop_(out, staged)

            raise

    async def _drain_ (
        self, path: pathlib.Path, out: BinaryIO, source: AsyncIterable[bytes], limit: int | None,
    ) -> None:

        size = 0

        async for piece in source:

            size += len(piece)

            if limit is not None and size > limit:

                raise Fault(Code.TOO_LARGE, reason="fs.size", errors={ "path": [path.name[:NAME_MAX]] })

            await self._run_(path, out.write, piece)

    def _stage_ ( self, path: pathlib.Path, mode: int | None ) -> tuple[BinaryIO, pathlib.Path, int]:

        self._need_(path).parent.mkdir(parents=True, exist_ok=True)

        kept = MODE_FILE if mode is None else mode

        if mode is None and path.exists(): kept = path.stat().st_mode & 0o7777

        handle, name = tempfile.mkstemp(STAGED, ".", path.parent)

        return os.fdopen(handle, "wb"), pathlib.Path(name), kept

    def _commit_ ( self, path: pathlib.Path, out: BinaryIO, staged: pathlib.Path, kept: int, durable: bool ) -> int:

        size = out.tell()

        if durable:

            out.flush()
            os.fsync(out.fileno())

        out.close()
        staged.chmod(kept)
        staged.replace(path)

        if durable: self._settle_(path.parent)

        return size

    def _drop_ ( self, out: BinaryIO, staged: pathlib.Path ) -> None:

        try: out.close()
        except OSError: log.debug("fs.close", file=staged.name)

        staged.unlink(missing_ok=True)

    def _settle_ ( self, folder: pathlib.Path ) -> None:

        try: handle = os.open(folder, os.O_RDONLY)
        except OSError: return

        try: os.fsync(handle)
        except OSError: log.debug("fs.dirsync", folder=str(folder))
        finally: os.close(handle)

    def _head_ ( self, path: pathlib.Path ) -> bytes:

        with self._need_(path).open("rb") as handle: return handle.read(HEAD)

    def _caio_ ( self ) -> Reader:

        from caio import AsyncioContext

        contexts: dict[asyncio.AbstractEventLoop, Any] = {}

        async def read ( path: pathlib.Path, size: int ) -> bytes:

            loop    = asyncio.get_running_loop()
            context = contexts.get(loop)

            if context is None:

                for closed in [held for held in contexts if held.is_closed()]: del contexts[closed]

                context = AsyncioContext(loop=loop)

                contexts[loop] = context

            descriptor = os.open(path, os.O_RDONLY)

            try: return bytes(await context.read(size, descriptor, 0)) if size else b""
            finally: os.close(descriptor)

        return read

    async def _plain_ ( self, path: pathlib.Path, size: int ) -> bytes:

        def go () -> bytes:

            handle: BinaryIO

            with path.open("rb") as handle: return handle.read(size)

        return await thread.offload(go)
