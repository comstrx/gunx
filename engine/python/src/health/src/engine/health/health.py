from contextlib import suppress
from typing import Any

from engine.error import Code, Fault
from engine.json import json
from engine.log import log
from engine.thread import thread
from .arch import Check, FACTS, LIMIT, NAME, PROBES, Probe, RESERVED, UNREADY, WEIGHT, WORD
import asyncio, inspect, time

type Swept = tuple[bool, dict[str, bool]]

class Health:

    def __init__ ( self ) -> None:

        self._probes: dict[str, Probe] = {}
        self._facts: dict[str, Any] = {}
        self._failed: dict[str, str] = {}
        self._flight: asyncio.Task[Swept] | None = None
        self._started = time.monotonic()

    def register ( self, name: str, check: Check, critical: bool = True, timeout: float = 2.0 ) -> Probe:

        given: object = check

        if inspect.iscoroutine(given): given.close()

        if type(name) is not str or NAME.fullmatch(name) is None: raise self._refused_("name", name)
        if not callable(given): raise self._refused_("check", name)
        if type(critical) is not bool: raise self._refused_("critical", name)
        if type(timeout) not in (int, float) or not 0 < timeout <= LIMIT: raise self._refused_("timeout", name)
        if name not in self._probes and len(self._probes) >= PROBES: raise self._refused_("full", name)

        made = Probe(name, check, critical, float(timeout))

        self._probes[name] = made
        self._flight       = None

        self._failed.pop(name, None)

        return made

    def fact ( self, **facts: Any ) -> None:

        held = { **self._facts, **{ name: self._plain_(name, value) for name, value in facts.items() } }

        if len(held) > FACTS: raise Fault(Code.INTERNAL, reason="health.facts")

        self._facts = held

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._probes))

    def forget ( self, name: str ) -> bool:

        if type(name) is not str or name not in self._probes: return False

        del self._probes[name]

        self._failed.pop(name, None)

        self._flight = None

        return True

    def live ( self ) -> dict[str, Any]:

        return { "status": "ok", "uptime": round(time.monotonic() - self._started, 1), **self._facts }

    async def ready ( self ) -> tuple[bool, dict[str, Any]]:

        healthy, checks = True, dict[str, bool]()

        if self._probes: healthy, checks = await self._swept_()

        return healthy, { "status": "ok" if healthy else "degraded", "checks": dict(checks), **self._facts }

    def clear ( self ) -> None:

        self._probes = {}
        self._facts  = {}
        self._failed = {}

    def describe ( self ) -> dict[str, Any]:

        probes = sorted(self._probes.items())

        return {
            "probes" : { name: { "critical": probe.critical, "timeout": probe.timeout } for name, probe in probes },
            "facts"  : sorted(self._facts),
            "failed" : dict(sorted(self._failed.items())),
        }

    async def _swept_ ( self ) -> Swept:

        try: return await asyncio.shield(self._flown_())
        except asyncio.CancelledError:

            task = asyncio.current_task()

            if task is not None and task.cancelling(): raise

            return False, {}

    def _flown_ ( self ) -> asyncio.Task[Swept]:

        flight = self._flight

        if flight is None or flight.done() or flight.get_loop() is not asyncio.get_running_loop():

            flight = self._flight = thread.spawn(self._sweep_(tuple(self._probes.values())), "health.sweep")

        return flight

    async def _sweep_ ( self, probes: tuple[Probe, ...] ) -> Swept:

        results = await thread.gather(*(self._run_(probe) for probe in probes))
        checks  = { probe.name: fine for probe, fine in zip(probes, results, strict=True) }

        return all(checks[probe.name] for probe in probes if probe.critical), checks

    async def _run_ ( self, probe: Probe ) -> bool:

        failed = UNREADY

        try:

            async with asyncio.timeout(probe.timeout):

                found = probe.check()

                if inspect.isawaitable(found): found = await found
                if found: failed = ""

        except asyncio.CancelledError:

            task = asyncio.current_task()

            if task is not None and task.cancelling(): raise

            failed = "CancelledError"

        except Exception as error: failed = type(error).__name__

        if self._probes.get(probe.name) is probe: self._noted_(probe.name, failed)

        return not failed

    def _noted_ ( self, name: str, failed: str ) -> None:

        if failed == self._failed.get(name, ""): return

        if failed:

            self._failed[name] = failed

            log.warning("health.failed", probe=name, error=failed)
            return

        del self._failed[name]

        log.info("health.recovered", probe=name)

    def _plain_ ( self, name: str, value: object ) -> Any:

        wire = b""

        if NAME.fullmatch(name) is not None and name not in RESERVED:

            with suppress(Fault): wire = json.encode(value)

        if not 0 < len(wire) <= WEIGHT: raise self._refused_("fact", name, "fact")

        return json.decode(wire)

    def _refused_ ( self, reason: str, name: object, subject: str = "probe" ) -> Fault:

        asked = name[:WORD] if type(name) is str else type(name).__name__

        return Fault(Code.INTERNAL, reason=f"health.{reason}", errors={ subject: [asked] })
