from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from engine.cache import Cache, cache as shared
from engine.date import date
from engine.error import Code, Fault
from engine.log import log
from engine.thread import thread
from .arch import NAME, timed, Work
from .cron import Cron
from .plan import Plan
from .spot import Spot
import asyncio

class Schedule:

    def __init__ ( self ) -> None:

        self._spots: dict[str, Spot] = {}
        self._cache: Cache = shared
        self._running = False
        self._tick    = 1.0
        self._zone    = "UTC"
        self._task: Any = None

    def setup ( self, cache: Cache | None = None, zone: str = "UTC", tick: float = 1.0 ) -> None:

        held: object = cache

        if held is not None and not isinstance(held, Cache): raise Fault(Code.INTERNAL, reason="schedule.cache")
        if type(zone) is not str: raise Fault(Code.INTERNAL, reason="schedule.zone")

        date.zone(zone)

        self._cache = cache or shared
        self._zone  = zone
        self._tick  = timed(tick, "tick")

    def every ( self, cron: str, name: str, timeout: float = 300.0, overlap: bool = False ) -> Callable[[Work], Spot]:

        def register ( work: Work ) -> Spot:

            return self.add(name, cron, work, timeout, overlap)

        return register

    def add ( self, name: str, cron: str, work: Work, timeout: float = 300.0, overlap: bool = False ) -> Spot:

        if type(name) is not str or not 0 < len(name) <= NAME or not name.isprintable():

            raise Fault(Code.INTERNAL, reason="schedule.name", errors={ "name": [str(name)[:64]] })

        if name in self._spots: raise Fault(Code.INTERNAL, reason="schedule.duplicate", errors={ "name": [name] })
        if not callable(work): raise Fault(Code.INTERNAL, reason="schedule.work", errors={ "name": [name] })

        spot = Spot(name, Cron.parse(cron), work, timed(timeout, "timeout"), bool(overlap))

        self._arm_(spot)

        self._spots[name] = spot

        return spot

    def job ( self, name: str, work: Work ) -> Plan:

        return Plan(self.add(name, "* * * * *", work), self._arm_)

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._spots))

    def spot ( self, name: str ) -> Spot:

        found = self._spots.get(name)

        if found is None: raise Fault(Code.INTERNAL, reason="schedule.unknown", errors={ "name": [name] })

        return found

    def forget ( self, name: str ) -> bool:

        return self._spots.pop(name, None) is not None

    def due ( self, now: datetime | None = None ) -> list[Spot]:

        moment = now or date.now()

        return [spot for spot in self._spots.values() if spot.next <= moment]

    async def tick ( self, now: datetime | None = None ) -> int:

        moment = now or date.now()
        ran    = 0

        for spot in self.due(moment):

            slot      = spot.next
            spot.next = self._next_(spot, moment)

            if not spot.allowed(moment): continue

            if await self.run(spot, moment, slot): ran += 1

        return ran

    async def run ( self, spot: Spot, moment: datetime | None = None, slot: datetime | None = None ) -> bool:

        if spot.busy and not spot.overlap: return False

        stamp = date.iso(slot or moment or date.now())
        token = await self._cache.lock(f"schedule:{spot.name}:{stamp}", ttl=max(60.0, spot.timeout))

        if token is None: return False

        spot.busy = True

        try:

            for hook in spot.starting: await hook(spot)

            async with asyncio.timeout(spot.timeout): await spot.work()

            spot.runs += 1
            spot.last  = moment or date.now()

            for hook in spot.succeeded: await hook(spot)

        except Exception as error:

            spot.failures += 1

            if not isinstance(error, Fault | TimeoutError): log.exception("schedule.crashed", task=spot.name)
            else: log.error("schedule.failed", task=spot.name, error=type(error).__name__)

            for handler in spot.failed: await self._told_(handler, spot, error)

            return False

        finally:

            spot.busy = False

            for hook in spot.finished: await self._told_(hook, spot)

        return True

    async def trigger ( self, name: str ) -> bool:

        return await self.run(self.spot(name))

    def start ( self ) -> None:

        if self._running: return

        self._running = True

        self._task = thread.spawn(self._loop_(), "schedule")

    async def stop ( self ) -> None:

        self._running = False

        task, self._task = self._task, None

        if task is None: return

        await asyncio.wait([task], timeout=self._tick + 1)

        if not task.done(): task.cancel()

        await asyncio.gather(task, return_exceptions=True)

    def running ( self ) -> bool:

        return self._running

    def describe ( self ) -> dict[str, Any]:

        tasks = [spot.describe() for spot in self._spots.values()]

        return { "running": self._running, "zone": self._zone, "tasks": tasks }

    def clear ( self ) -> None:

        self._spots = {}

    async def _loop_ ( self ) -> None:

        while self._running:

            try: await self.tick()
            except Fault as fault: log.warning("schedule.tick", reason=fault.reason)
            except Exception: log.exception("schedule.tick")

            await thread.sleep(self._tick)

    @staticmethod
    async def _told_ ( hook: Any, *args: Any ) -> None:

        try: await hook(*args)
        except Exception: log.exception("schedule.hook")

    def _arm_ ( self, spot: Spot ) -> None:

        spot.next = self._next_(spot, date.now())

    def _next_ ( self, spot: Spot, after: datetime ) -> datetime:

        if spot.interval is not None: return after + timedelta(seconds=spot.interval)

        local = date.local(after, spot.zone or self._zone)

        return spot.cron.next(local).astimezone(date.zone("UTC"))
