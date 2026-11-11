from datetime import datetime as DateTime
from typing import Any

from engine.date import date
from .arch import MODE_DIR, Target
from .path import Path
import pathlib, shutil

class Dir(Path):

    _only = "dir"

    async def make ( self, target: Target, mode: int = MODE_DIR ) -> pathlib.Path:

        path = pathlib.Path(target)

        def go () -> pathlib.Path:

            self._need_(path).mkdir(mode, parents=True, exist_ok=True)

            return path

        return await self._run_(path, go)

    async def files ( self, base: Target ) -> list[pathlib.Path]:

        path = pathlib.Path(base)

        return await self._run_(path, lambda: sorted(item for item in self._need_(path).iterdir() if item.is_file()))

    async def dirs ( self, base: Target ) -> list[pathlib.Path]:

        path = pathlib.Path(base)

        return await self._run_(path, lambda: sorted(item for item in self._need_(path).iterdir() if item.is_dir()))

    async def walk ( self, base: Target, *exts: str ) -> list[pathlib.Path]:

        path = pathlib.Path(base)

        def go () -> list[pathlib.Path]:

            return [item for item in self._files_(self._held_(path)) if not exts or self.has_ext(item, *exts)]

        return await self._run_(path, go)

    async def glob ( self, base: Target, pattern: str ) -> list[pathlib.Path]:

        path = pathlib.Path(base)

        return await self._run_(path, lambda: sorted(self._held_(path).glob(pattern)))

    async def find (
        self, base: Target, name: str | None = None, newer: DateTime | None = None, older: DateTime | None = None,
        larger: int | None = None, smaller: int | None = None, contains: bytes | str | None = None, limit: int = 10000,
    ) -> list[pathlib.Path]:

        path   = pathlib.Path(base)
        needle = contains.encode() if isinstance(contains, str) else contains
        since  = newer.timestamp() if newer else None
        until  = older.timestamp() if older else None

        def keep ( item: pathlib.Path ) -> bool:

            if name and not self.match(item, name): return False

            found = item.stat()
            sized = (larger is None or found.st_size > larger) and (smaller is None or found.st_size < smaller)
            timed = (since is None or found.st_mtime >= since) and (until is None or found.st_mtime <= until)

            return sized and timed and (needle is None or self._holds_(item, needle))

        def go () -> list[pathlib.Path]:

            matched: list[pathlib.Path] = []

            for item in self._files_(self._held_(path)):

                if len(matched) >= limit: break
                if keep(item): matched.append(item)

            return matched

        return await self._run_(path, go)

    async def count ( self, base: Target ) -> dict[str, int]:

        path = pathlib.Path(base)

        def go () -> dict[str, int]:

            made = { "files": 0, "dirs": 0, "links": 0, "hidden": 0, "bytes": 0 }

            for item in self._held_(path).rglob("*"):

                found = item.lstat()
                kind  = self._kind_(item)

                if kind == "link": made["links"] += 1
                elif kind == "dir": made["dirs"] += 1
                elif kind == "file": made["files"], made["bytes"] = made["files"] + 1, made["bytes"] + found.st_size

                if item.name.startswith("."): made["hidden"] += 1

            return made

        return await self._run_(path, go)

    async def tree ( self, base: Target, depth: int = 2 ) -> dict[str, Any]:

        path = pathlib.Path(base)

        def go ( folder: pathlib.Path, left: int ) -> dict[str, Any]:

            branches: dict[str, Any] = {}

            for item in sorted(folder.iterdir()):

                if item.is_dir(): branches[item.name] = go(item, left - 1) if left > 0 else {}
                else: branches[item.name] = item.lstat().st_size

            return branches

        return await self._run_(path, lambda: go(self._need_(path), depth))

    async def levels ( self, base: Target ) -> int:

        path = pathlib.Path(base)

        def go () -> int:

            real = (item for item in self._held_(path).rglob("*") if item.is_dir() and not item.is_symlink())

            return max((len(item.relative_to(path).parts) for item in real), default=0)

        return await self._run_(path, go)

    async def snapshot ( self, base: Target, recursive: bool = True ) -> dict[pathlib.Path, float]:

        path = pathlib.Path(base)

        def go () -> dict[pathlib.Path, float]:

            found = self._held_(path).rglob("*") if recursive else self._need_(path).iterdir()

            return { item: item.stat().st_mtime for item in found if item.is_file() }

        return await self._run_(path, go)

    async def empty ( self, base: Target ) -> bool:

        path = pathlib.Path(base)

        return await self._run_(path, lambda: not any(self._need_(path).iterdir()))

    async def clear ( self, base: Target ) -> int:

        path = pathlib.Path(base)

        def go () -> int:

            removed = 0

            for item in list(self._need_(path).iterdir()):

                if item.is_dir() and not item.is_symlink(): shutil.rmtree(item)
                else: item.unlink()

                removed += 1

            return removed

        return await self._run_(path, go)

    async def sync ( self, source: Target, target: Target, delete: bool = False ) -> int:

        origin, goal = pathlib.Path(source), pathlib.Path(target)

        def go () -> int:

            copied = 0
            kept: set[pathlib.Path] = set()

            for item in self._files_(self._held_(origin)):

                mirror = goal / item.relative_to(origin)

                kept.add(mirror)

                if not self._stale_(item, mirror): continue

                mirror.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, mirror)

                copied += 1

            if delete and goal.exists():

                for extra in [item for item in self._files_(goal) if item not in kept]: extra.unlink()

            return copied

        return await self._run_(origin, go)

    async def clean ( self, base: Target, older_than: float, *exts: str ) -> int:

        path      = pathlib.Path(base)
        threshold = date.stamp() - older_than

        def go () -> int:

            removed = 0

            for item in self._files_(self._held_(path)):

                if exts and not self.has_ext(item, *exts): continue
                if item.stat().st_mtime >= threshold: continue

                item.unlink()

                removed += 1

            return removed

        return await self._run_(path, go)

    async def newest ( self, base: Target ) -> pathlib.Path | None:

        path = pathlib.Path(base)

        def go () -> pathlib.Path | None:

            return max(self._files_(self._held_(path)), key=lambda item: item.stat().st_mtime, default=None)

        return await self._run_(path, go)

    async def oldest ( self, base: Target ) -> pathlib.Path | None:

        path = pathlib.Path(base)

        def go () -> pathlib.Path | None:

            return min(self._files_(self._held_(path)), key=lambda item: item.stat().st_mtime, default=None)

        return await self._run_(path, go)

    async def largest ( self, base: Target ) -> pathlib.Path | None:

        path = pathlib.Path(base)

        def go () -> pathlib.Path | None:

            return max(self._files_(self._held_(path)), key=lambda item: item.stat().st_size, default=None)

        return await self._run_(path, go)

    def _stale_ ( self, source: pathlib.Path, mirror: pathlib.Path ) -> bool:

        if not mirror.exists(): return True

        theirs, ours = mirror.stat(), source.stat()

        return theirs.st_size != ours.st_size or theirs.st_mtime < ours.st_mtime

    async def list ( self, base: Target, hidden: bool = True ) -> list[pathlib.Path]:

        path = pathlib.Path(base)

        def go () -> list[pathlib.Path]:

            return sorted(item for item in self._need_(path).iterdir() if hidden or not item.name.startswith("."))

        return await self._run_(path, go)
