from collections.abc import Coroutine
from typing import Any, cast

from engine.error import Code, Fault
from .arch import AsyncWork, QUANTILES, ROUNDS, SHARE, Sample, WARM, WORD, Work
import asyncio, inspect, time

class Bench:

    def __init__ ( self, rounds: int = 20000, warm: int = 200, echo: bool = True ) -> None:

        self._rounds  = self._whole_(rounds, 1, "rounds")
        self._warm    = self._whole_(warm, 0, "warm")
        self._echo    = echo
        self._samples: list[Sample] = []

    def measure ( self, name: str, work: Work, rounds: int | None = None ) -> Sample:

        count = self._count_(name, work, rounds, self._rounds)

        if inspect.iscoroutinefunction(work): raise self._refused_("work", work)

        for _ in range(self._warm): work()

        samples = [0.0] * count
        clock   = time.perf_counter_ns

        for index in range(count):

            started = clock()

            work()

            samples[index] = (clock() - started) / 1000

        return self._record_(name, samples)

    async def measure_async ( self, name: str, work: AsyncWork, rounds: int | None = None ) -> Sample:

        count = self._count_(name, work, rounds, max(1, self._rounds // SHARE))

        for _ in range(min(self._warm, WARM)): await work()

        samples = [0.0] * count
        clock   = time.perf_counter_ns

        for index in range(count):

            started = clock()

            await work()

            samples[index] = (clock() - started) / 1000

        return self._record_(name, samples)

    def samples ( self ) -> list[Sample]:

        return list(self._samples)

    def dump ( self ) -> list[dict[str, Any]]:

        return [sample.dump() for sample in self._samples]

    def print ( self ) -> None:

        for sample in self._samples: print(sample.line())

    def clear ( self ) -> None:

        self._samples = []

    @staticmethod
    def run [T] ( work: Coroutine[Any, Any, T] ) -> T:

        if not inspect.iscoroutine(cast("object", work)): raise Fault(Code.INTERNAL, reason="test.work")

        return asyncio.run(work)

    def _count_ ( self, name: str, work: object, rounds: int | None, default: int ) -> int:

        if type(name) is not str or not 0 < len(name) <= WORD: raise self._refused_("name", name)
        if not callable(work): raise self._refused_("work", work)

        return default if rounds is None else self._whole_(rounds, 1, "rounds")

    def _whole_ ( self, value: int, low: int, reason: str ) -> int:

        if type(value) is not int or not low <= value <= ROUNDS: raise self._refused_(reason, value)

        return value

    def _record_ ( self, name: str, samples: list[float] ) -> Sample:

        ordered = sorted(samples)
        count   = len(ordered)
        p50, p95, p99 = (ordered[min(count - 1, int(count * share))] for share in QUANTILES)
        made    = Sample(name, count, p50, p95, p99, ordered[0], ordered[-1])

        self._samples.append(made)

        if self._echo: print(made.line())

        return made

    def _refused_ ( self, reason: str, asked: object ) -> Fault:

        word = asked[:WORD] if type(asked) is str else type(asked).__name__

        return Fault(Code.INTERNAL, reason=f"test.{reason}", errors={ reason: [word] })
