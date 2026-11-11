from collections.abc import AsyncIterator, Iterable

from engine.func import func
from engine.thread import thread
from .arch import Change, EVENTS, STAGED, Target, Watcher
from .dir import Dir
import asyncio, pathlib

class Watch:

    def __init__ ( self, dir_: Dir ) -> None:

        self._dir             = dir_
        self._native: Watcher = func.pick("fs.watch", "watchfiles", self._notify_, lambda: self.poll)

    async def changes (
        self, base: Target, recursive: bool = True, debounce: float = 0.3, stop: asyncio.Event | None = None,
    ) -> AsyncIterator[list[Change]]:

        path = pathlib.Path(base)

        await self._dir.get(path)

        async for found in self._native(path, recursive, debounce, stop): yield found

    async def poll (
        self, base: Target, recursive: bool = True, debounce: float = 0.3, stop: asyncio.Event | None = None,
    ) -> AsyncIterator[list[Change]]:

        before = await self._dir.snapshot(base, recursive)

        while stop is None or not stop.is_set():

            await thread.sleep(debounce)

            after  = await self._dir.snapshot(base, recursive)
            found  = self._real_(self.compare(before, after))
            before = after

            if found: yield found

    def compare ( self, before: dict[pathlib.Path, float], after: dict[pathlib.Path, float] ) -> list[Change]:

        found = [Change("added", path) for path in after if path not in before]

        found += [Change("modified", path) for path, stamp in after.items() if path in before and before[path] != stamp]
        found += [Change("deleted", path) for path in before if path not in after]

        return sorted(found, key=self._order_)

    def _notify_ ( self ) -> Watcher:

        from watchfiles import awatch

        async def watch (
            base: pathlib.Path, recursive: bool, debounce: float, stop: asyncio.Event | None,
        ) -> AsyncIterator[list[Change]]:

            wait  = int(debounce * 1000)
            found = awatch(
                base, watch_filter=None, recursive=recursive, debounce=wait, poll_delay_ms=wait, stop_event=stop,
            )

            async for raw in found:

                kept = await thread.offload(self._files_, raw)

                if kept: yield kept

        return watch

    def _files_ ( self, raw: Iterable[tuple[int, str]] ) -> list[Change]:

        found = (Change(EVENTS.get(int(kind), "modified"), pathlib.Path(name)) for kind, name in raw)

        return self._real_(item for item in found if item.kind == "deleted" or not item.path.is_dir())

    def _real_ ( self, found: Iterable[Change] ) -> list[Change]:

        kept = (item for item in found if not (item.path.name.startswith(".") and item.path.name.endswith(STAGED)))

        return sorted(kept, key=self._order_)

    def _order_ ( self, change: Change ) -> tuple[str, str]:

        return str(change.path), change.kind
