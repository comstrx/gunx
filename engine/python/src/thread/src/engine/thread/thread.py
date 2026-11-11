from collections.abc import Awaitable, Callable, Coroutine, Iterable, Iterator
from contextvars import copy_context
from functools import partial
from operator import attrgetter, itemgetter
from typing import Any, cast

from engine.error import Code, Fault
from engine.log import log
from .arch import CEILING, CORES, Flight, GRACE, Hook, ISOLATED, Job, LIMIT, Mode, MODES, Outcome, RETRIES, Submit
from .arch import WORD, WORKERS
from .cluster import Cluster
from .lane import Lane
from .pool import Pool
from .run import Run
from .tasks import Tasks
import asyncio, contextlib, inspect, itertools, math, signal, sys, time

class Thread:

    def __init__ ( self ) -> None:

        self._workers = WORKERS
        self._tasks   = Tasks("thread")
        self._threads = Pool("thread", WORKERS)
        self._lanes   = { mode: Lane(mode, CORES) for mode in ISOLATED }
        self._stopped = False
        self._waiters: list[tuple[asyncio.AbstractEventLoop, asyncio.Event]] = []

    def setup ( self, workers: int = WORKERS ) -> None:

        self._workers = self._whole_(workers, 1, "workers", CEILING)

        self._threads.resize(self._workers)

    async def offload [T] ( self, job: Job[T], *args: Any, **kwargs: Any ) -> T:

        if not callable(job): raise Fault(Code.INTERNAL, reason="thread.work")

        call = partial(copy_context().run, job, *args, **kwargs)

        try: made = await asyncio.get_running_loop().run_in_executor(self._threads.executor(), call)
        except (SystemExit, KeyboardInterrupt) as error: raise Fault.wrap(error, reason="thread.failed") from error

        if inspect.iscoroutine(made):

            made.close()

            raise Fault(Code.INTERNAL, reason="thread.work")

        return made

    async def gather [T] ( self, *works: Awaitable[T], limit: int = 0 ) -> list[T]:

        made: dict[int, T] = {}

        async def keep ( index: int, work: Awaitable[T] ) -> None:

            made[index] = await work

        try:

            count = self._whole_(limit, 0, "limit")

            if not all(inspect.isawaitable(work) for work in works): raise Fault(Code.INTERNAL, reason="thread.work")

            if works: await self._pulled_(enumerate(works), keep, min(count or len(works), len(works)))

        finally: self._unstarted_(works)

        return [made[index] for index in range(len(works))]

    async def map [T, R] ( self, items: Iterable[T], work: Callable[[T], Awaitable[R]], limit: int = LIMIT ) -> list[R]:

        count = self._whole_(limit, 1, "limit", CEILING)
        made: dict[int, R] = {}

        if not callable(cast("object", work)): raise Fault(Code.INTERNAL, reason="thread.work")

        async def keep ( index: int, item: T ) -> None:

            held = work(item)

            if not inspect.isawaitable(held): raise Fault(Code.INTERNAL, reason="thread.work")

            made[index] = await held

        try: source = enumerate(items)
        except TypeError as error: raise Fault(Code.INTERNAL, reason="thread.items") from error

        await self._pulled_(source, keep, count)

        return [made[index] for index in range(len(made))]

    async def run (
        self, items: Iterable[Any], handler: Callable[..., Any], mode: Mode = "async", workers: int | None = None,
        timeout: float | None = None, retries: int = 0, ordered: bool = True, on_result: Hook | None = None,
        on_error: Hook | None = None, address: str | None = None, fail_fast: bool = False,
    ) -> Run:

        if mode not in MODES: raise Fault(Code.INTERNAL, reason="thread.mode", errors={ "mode": [self._word_(mode)] })
        if not self._fits_(handler, mode): raise Fault(Code.INTERNAL, reason="thread.work")
        if not all(hook is None or self._fits_(hook) for hook in (on_result, on_error)):

            raise Fault(Code.INTERNAL, reason="thread.hook")

        wait  = self._deadline_(timeout)
        tries = self._whole_(retries, 0, "retries", RETRIES)
        count = self._bound_(mode, workers)

        try: sequence = list(items)
        except TypeError as error: raise Fault(Code.INTERNAL, reason="thread.items") from error

        if not sequence: return Run(mode, (), 0.0, count)

        started = time.perf_counter()
        flight  = Flight(await self._lane_(mode, address), handler, wait, tries, bool(fail_fast), on_result, on_error)

        await self._pulled_(enumerate(sequence), partial(self._one_, flight), min(count, len(sequence)))

        found  = sorted(flight.outcomes, key=attrgetter("index")) if ordered else flight.outcomes
        failed = sum(1 for outcome in found if not outcome.ok())

        if failed: log.debug("thread.run", mode=mode, failed=failed)

        return Run(mode, tuple(found), self._ms_(started), count)

    async def compute (
        self, handler: Callable[..., Any], *args: Any, mode: Mode = "process", timeout: float | None = None,
    ) -> Any:

        if not self._fits_(handler, mode): raise Fault(Code.INTERNAL, reason="thread.work")

        made = await self.run([(handler, args)], Thread._applied_, mode, 1, timeout)

        return made.raise_first().outcomes[0].value

    async def race [T] ( self, *works: Awaitable[T] ) -> T:

        if not works or not all(inspect.isawaitable(work) for work in works):

            self._unstarted_(works)

            raise Fault(Code.INTERNAL, reason="thread.race" if not works else "thread.work")

        tasks = [asyncio.ensure_future(work) for work in works]
        done: set[asyncio.Future[T]] = set()

        try: done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:

            for task in tasks:

                if task not in done: task.cancel()

            await asyncio.gather(*tasks, return_exceptions=True)

        return next(task for task in tasks if task in done).result()

    def chunks [T] ( self, items: Iterable[T], size: int ) -> list[list[T]]:

        count = self._whole_(size, 1, "chunk", sys.maxsize)
        made: list[list[T]] = []

        try: source = iter(items)
        except TypeError as error: raise Fault(Code.INTERNAL, reason="thread.items") from error

        while batch := list(itertools.islice(source, count)): made.append(batch)

        return made

    async def cluster ( self, address: str | None = None ) -> Cluster:

        return await Cluster.connect(address)

    def spawn [T] ( self, coroutine: Coroutine[Any, Any, T], name: str | None = None ) -> asyncio.Task[T]:

        return self._tasks.spawn(coroutine, name)

    def tasks ( self ) -> Tasks:

        return self._tasks

    async def sleep ( self, seconds: float ) -> None:

        if (type(seconds) is not float and type(seconds) is not int) or math.isnan(seconds):

            raise Fault(Code.INTERNAL, reason="thread.seconds")

        await asyncio.sleep(seconds)

    def stopping ( self ) -> bool:

        return self._stopped

    def stop ( self ) -> None:

        self._stopped = True

        for loop, event in tuple(self._waiters):

            with contextlib.suppress(RuntimeError): loop.call_soon_threadsafe(event.set)

    async def forever ( self, signals: tuple[signal.Signals, ...] = (signal.SIGINT, signal.SIGTERM) ) -> None:

        if type(signals) is not tuple or not all(isinstance(sig, signal.Signals) for sig in signals):

            raise Fault(Code.INTERNAL, reason="thread.signal")

        loop   = asyncio.get_running_loop()
        waiter = (loop, asyncio.Event())
        hooked: list[signal.Signals] = []

        self._waiters.append(waiter)

        try:

            for sig in signals:

                try: loop.add_signal_handler(sig, self.stop)
                except (NotImplementedError, RuntimeError, ValueError): log.debug("thread.signal", signal=sig.name)
                else: hooked.append(sig)

            if not self._stopped: await waiter[1].wait()

        finally:

            self._waiters.remove(waiter)

            for sig in hooked: loop.remove_signal_handler(sig)

    async def close ( self, grace: float = GRACE ) -> int:

        closed = await self._tasks.close(grace)

        self._threads.close()

        for lane in self._lanes.values(): lane.close(kill=True)

        self._stopped = False

        return closed

    def describe ( self ) -> dict[str, object]:

        pools = [self._threads.mode] if self._threads.live() else []
        pools += [lane.mode for lane in self._lanes.values() if lane.live()]

        return { "tasks": self._tasks.count(), "stopping": self._stopped, "workers": self._workers, "pools": pools }

    async def _pulled_ (
        self, source: Iterator[tuple[int, Any]], work: Callable[[int, Any], Awaitable[None]], limit: int,
    ) -> None:

        failed: list[tuple[int, Exception]] = []

        async def puller () -> None:

            for index, item in source:

                try: await work(index, item)
                except Exception as error:

                    failed.append((index, error))

                    raise

        tasks = [asyncio.ensure_future(puller()) for _ in range(limit)]

        try: await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
        finally:

            for task in tasks: task.cancel()

            await asyncio.gather(*tasks, return_exceptions=True)

        if failed: raise min(failed, key=itemgetter(0))[1]

        for task in tasks:

            error = None if task.cancelled() else task.exception()

            if error is not None: raise error

    async def _lane_ ( self, mode: str, address: str | None ) -> Submit:

        if mode == "async": return self._direct_
        if mode == "ray": return (await Cluster.connect(address)).call
        if mode == "thread": return self._threads.submit

        return self._lanes[mode].submit

    async def _one_ ( self, flight: Flight, index: int, item: Any ) -> None:

        if flight.stopped:

            flight.outcomes.append(Outcome(index, error=Fault(Code.CONFLICT, reason="thread.stopped")))

            return

        began = time.perf_counter()

        try: made = await self._tried_(flight, item)
        except Exception as error:

            fault = Fault.wrap(error, reason="thread.failed")

            if flight.fail_fast: flight.stopped = True

            flight.outcomes.append(Outcome(index, error=fault, ms=self._ms_(began)))

            if flight.on_error is not None: await self._hook_(flight.on_error, index, fault)

            return

        flight.outcomes.append(Outcome(index, made, ms=self._ms_(began)))

        if flight.on_result is not None: await self._hook_(flight.on_result, index, made)

    async def _tried_ ( self, flight: Flight, item: Any ) -> Any:

        for left in range(flight.tries, -1, -1):

            try: return await self._attempt_(flight, item)
            except Exception:

                if left == 0: raise

        raise Fault(Code.INTERNAL, reason="thread.retries")

    async def _attempt_ ( self, flight: Flight, item: Any ) -> Any:

        if flight.wait is None: return await flight.submit(flight.handler, item)

        scope = asyncio.timeout(flight.wait)

        try:

            async with scope: return await flight.submit(flight.handler, item)

        except TimeoutError as error:

            if not scope.expired(): raise

            raise Fault(Code.TIMEOUT, reason="thread.timeout", unknown=True) from error

    def _bound_ ( self, mode: str, workers: int | None ) -> int:

        asked = self._workers if workers is None else self._whole_(workers, 1, "workers", CEILING)

        if mode == "thread": return min(asked, self._workers)
        if mode in ISOLATED: return min(asked, CORES)

        return asked

    def _unstarted_ ( self, works: Iterable[object] ) -> None:

        for work in works:

            if inspect.iscoroutine(work) and inspect.getcoroutinestate(work) == inspect.CORO_CREATED: work.close()

    @staticmethod
    def _fits_ ( work: object, mode: str = "async" ) -> bool:

        return callable(work) and (mode == "async" or not inspect.iscoroutinefunction(work))

    @staticmethod
    def _whole_ ( value: int, low: int, reason: str, high: int | None = None ) -> int:

        if type(value) is not int or value < low or (high is not None and value > high):

            raise Fault(Code.INTERNAL, reason=f"thread.{reason}")

        return value

    @staticmethod
    def _deadline_ ( timeout: float | None ) -> float | None:

        if timeout is None: return None

        if (type(timeout) is not float and type(timeout) is not int) or not timeout > 0:

            raise Fault(Code.INTERNAL, reason="thread.seconds")

        return None if timeout == math.inf else float(timeout)

    @staticmethod
    def _word_ ( asked: object ) -> str:

        return asked[:WORD] if type(asked) is str else type(asked).__name__

    @staticmethod
    def _applied_ ( packed: tuple[Callable[..., Any], tuple[Any, ...]] ) -> Any:

        handler, args = packed

        return handler(*args)

    @staticmethod
    async def _direct_ ( handler: Callable[..., Any], item: Any ) -> Any:

        made = handler(item)

        return await made if inspect.isawaitable(made) else made

    @staticmethod
    async def _hook_ ( hook: Hook, index: int, value: Any ) -> None:

        made = hook(index, value)

        if inspect.isawaitable(made): await made

    @staticmethod
    def _ms_ ( since: float ) -> float:

        return round((time.perf_counter() - since) * 1000, 3)
