from collections.abc import Awaitable, Callable, Coroutine, Iterable, Iterator, Mapping
from functools import partial
from operator import attrgetter, itemgetter
from typing import Any, cast, overload

from engine.error import Code, Fault
from engine.log import log
from .arch import CEILING, CORES, DRAIN, Flight, GRACE, Hook, ISOLATED, Job, LIMIT, Mode, MODES, Outcome, RETRIES
from .arch import Submit, direct
from .arch import WORD, WORKERS
from .cluster import Cluster
from .lane import Lane
from .pool import Pool
from .run import Run
from .scope import Scope
from .tasks import Tasks
import asyncio, contextlib, inspect, itertools, math, signal, sys, time

class Thread:

    __slots__ = ("_lanes", "_scope", "_stopped", "_tasks", "_threads", "_waiters", "_workers")

    def __init__ ( self ) -> None:

        self._scope: Scope | None = None
        self._workers = WORKERS
        self._tasks   = Tasks("thread")
        self._threads = Pool("thread", WORKERS)
        self._lanes   = { mode: Lane(mode, CORES) for mode in ISOLATED }
        self._stopped = False
        self._waiters: list[tuple[asyncio.AbstractEventLoop, asyncio.Event]] = []

    def mode ( self, mode: str ) -> Thread:

        scope = Scope(mode)
        made = Thread()
        made._scope = scope

        return made

    def options (
        self, workers: int | None = None, provider: str | None = None, host: str | None = None, *,
        namespace: str | None = None, runtime_env: Mapping[str, Any] | None = None,
    ) -> Thread:

        self._scoped_().options(workers, provider, host, namespace=namespace, runtime_env=runtime_env)

        return self

    @overload
    def submit [T] ( self, handler: Callable[..., Awaitable[T]], *args: Any, **kwargs: Any ) -> asyncio.Task[T]: ...

    @overload
    def submit [T] ( self, handler: Callable[..., T], *args: Any, **kwargs: Any ) -> asyncio.Task[T]: ...

    def submit [T] ( self, handler: Callable[..., T | Awaitable[T]], *args: Any, **kwargs: Any ) -> asyncio.Task[T]:

        scope = self._scoped_()
        scope.accept()

        if not self._fits_(handler, scope.mode): raise Fault(Code.INTERNAL, reason="thread.work")

        work = partial(handler, *args, **kwargs) if args or kwargs else handler

        return scope.tasks.spawn(scope.call(Thread._called_, work))

    async def start ( self ) -> Thread:

        await self._scoped_().start()

        return self

    async def join ( self, grace: float = DRAIN ) -> None:

        await self._scoped_().join(grace)

    async def drop ( self, grace: float = GRACE ) -> int:

        return await self._scoped_().drop(grace)

    async def offload [T] ( self, job: Job[T], *args: Any, **kwargs: Any ) -> T:

        if self._scope is not None:

            if self._scope.mode != "thread": self._scope.unsupported("offload")

            return cast("T", await self.submit(job, *args, **kwargs))

        if not callable(job): raise Fault(Code.INTERNAL, reason="thread.work")

        call = partial(job, *args, **kwargs)

        try: made = await self._threads.submit(Thread._called_, call)
        except (SystemExit, KeyboardInterrupt) as error: raise Fault.wrap(error, reason="thread.failed") from error

        if inspect.iscoroutine(made):

            made.close()

            raise Fault(Code.INTERNAL, reason="thread.work")

        return cast("T", made)

    async def gather [T] ( self, *works: Awaitable[T] | Callable[[], T | Awaitable[T]], limit: int = 0 ) -> list[T]:

        made: list[T | None] = [None] * len(works)

        async def keep ( index: int, work: Awaitable[T] ) -> None:

            made[index] = await work

        async def selected ( index: int, work: Awaitable[T] | Callable[[], T | Awaitable[T]] ) -> None:

            if inspect.isawaitable(work): await keep(index, work)
            else: made[index] = await self._scoped_().call(Thread._called_, work)

        try:

            count = self._whole_(limit, 0, "limit")
            scope = self._scope

            if scope is not None:

                scope.accept()
                count = min(count or scope.workers, scope.workers)

            if not all(
                inspect.isawaitable(work) or (scope is not None and self._fits_(work, scope.mode)) for work in works
            ):

                raise Fault(Code.INTERNAL, reason="thread.work")

            if works:

                await self._pulled_(
                    enumerate(works), keep if scope is None else selected, min(count or len(works), len(works)),
                )

        finally: self._unstarted_(works)

        return cast("list[T]", made)

    @overload
    async def map [T, R] (
        self, items: Iterable[T], work: Callable[[T], Awaitable[R]], limit: int | None = None,
    ) -> list[R]: ...

    @overload
    async def map [T, R] (
        self, items: Iterable[T], work: Callable[[T], R], limit: int | None = None,
    ) -> list[R]: ...

    async def map [T, R] (
        self, items: Iterable[T], work: Callable[[T], R | Awaitable[R]], limit: int | None = None,
    ) -> list[R]:

        scope = self._scope
        count = limit if limit is not None else scope.workers if scope is not None else LIMIT
        count = self._whole_(count, 1, "limit", CEILING)
        made: list[R | None] = []

        if scope is not None:

            scope.accept()
            count = min(count, scope.workers)

        if not self._fits_(work, scope.mode if scope is not None else "async"):

            raise Fault(Code.INTERNAL, reason="thread.work")

        call = work if scope is None else partial(scope.call, work)

        async def keep ( index: int, item: T ) -> None:

            held = call(item)

            if not inspect.isawaitable(held): raise Fault(Code.INTERNAL, reason="thread.work")

            made.append(None)
            made[index] = await held

        try: source = enumerate(items)
        except TypeError as error: raise Fault(Code.INTERNAL, reason="thread.items") from error

        await self._pulled_(source, keep, count)

        return cast("list[R]", made)

    async def run (
        self, items: Iterable[Any], handler: Callable[..., Any], mode: Mode | None = None, workers: int | None = None,
        timeout: float | None = None, retries: int = 0, ordered: bool = True, on_result: Hook | None = None,
        on_error: Hook | None = None, address: str | None = None, fail_fast: bool = False, *, idempotent: bool = False,
    ) -> Run:

        mode = self._selected_(mode, address)

        if mode not in MODES: raise Fault(Code.INTERNAL, reason="thread.mode", errors={ "mode": [self._word_(mode)] })
        if not self._fits_(handler, mode): raise Fault(Code.INTERNAL, reason="thread.work")
        if not all(hook is None or self._fits_(hook) for hook in (on_result, on_error)):

            raise Fault(Code.INTERNAL, reason="thread.hook")

        if type(idempotent) is not bool: raise Fault(Code.INTERNAL, reason="thread.idempotent")

        wait  = self._deadline_(timeout)
        tries = self._whole_(retries, 0, "retries", RETRIES)
        count = self._bound_(mode, workers)

        try:

            source = iter(items)
            head = list(itertools.islice(source, count))

        except TypeError as error: raise Fault(Code.INTERNAL, reason="thread.items") from error

        if not head: return Run(mode, (), 0.0, count)

        started = time.perf_counter()
        flight  = Flight(
            await self._lane_(mode, address), handler, wait, tries, bool(fail_fast), on_result, on_error, idempotent,
        )

        await self._pulled_(enumerate(itertools.chain(head, source)), partial(self._one_, flight), len(head), flight)

        found  = sorted(flight.outcomes, key=attrgetter("index")) if ordered else flight.outcomes
        failed = sum(1 for outcome in found if not outcome.ok())

        if failed: log.debug("thread.run", mode=mode, failed=failed)

        return Run(mode, tuple(found), self._ms_(started), count)

    async def compute (
        self, handler: Callable[..., Any], *args: Any, mode: Mode | None = None, timeout: float | None = None,
    ) -> Any:

        mode = mode if mode is not None else cast("Mode", self._scope.mode) if self._scope is not None else "process"

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

    async def cluster (
        self, address: str | None = None, *, namespace: str | None = None,
        runtime_env: Mapping[str, Any] | None = None,
    ) -> Cluster:

        if self._scope is not None: self._scope.unsupported("cluster")

        return await Cluster.connect(address, namespace=namespace, runtime_env=runtime_env)

    def spawn [T] ( self, coroutine: Coroutine[Any, Any, T], name: str | None = None ) -> asyncio.Task[T]:

        if self._scope is not None:

            if self._scope.mode != "async":

                self._unstarted_((coroutine,))
                self._scope.unsupported("spawn")

            try: self._scope.accept()
            except BaseException:

                self._unstarted_((coroutine,))

                raise

            return self._scope.tasks.spawn(coroutine, name)

        return self._tasks.spawn(coroutine, name)

    def tasks ( self ) -> Tasks:

        return self._scope.tasks if self._scope is not None else self._tasks

    async def sleep ( self, seconds: float ) -> None:

        if (type(seconds) is not float and type(seconds) is not int) or math.isnan(seconds):

            raise Fault(Code.INTERNAL, reason="thread.seconds")

        await asyncio.sleep(seconds)

    def stopping ( self ) -> bool:

        return self._scope.stopped if self._scope is not None else self._stopped

    def stop ( self ) -> None:

        if self._scope is not None:

            self._scope.bind()
            self._scope.stopped = True

            return

        self._stopped = True

        for loop, event in tuple(self._waiters):

            with contextlib.suppress(RuntimeError): loop.call_soon_threadsafe(event.set)

    async def forever ( self, signals: tuple[signal.Signals, ...] = (signal.SIGINT, signal.SIGTERM) ) -> None:

        if self._scope is not None: self._scope.unsupported("forever")
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

        if self._scope is not None: return await self.drop(grace)

        closed = await self._tasks.close(grace)

        self._threads.close()

        for lane in self._lanes.values(): lane.close(kill=True)

        self._stopped = False

        return closed

    def describe ( self ) -> dict[str, object]:

        if self._scope is not None: return self._scope.describe()

        pools = [self._threads.mode] if self._threads.live() else []
        pools += [lane.mode for lane in self._lanes.values() if lane.live()]

        return { "tasks": self._tasks.count(), "stopping": self._stopped, "workers": self._workers, "pools": pools }

    async def _pulled_ (
        self, source: Iterator[tuple[int, Any]], work: Callable[[int, Any], Awaitable[None]], limit: int,
        flight: Flight | None = None,
    ) -> None:

        failed: list[tuple[int, Exception]] = []

        async def puller () -> None:

            while flight is None or not flight.stopped:

                try: index, item = next(source)
                except StopIteration: return

                try: await work(index, item)
                except Exception as error:

                    failed.append((index, error))

                    raise

        spawn = asyncio.create_task if self._scope is None else self._scope.tasks.spawn
        tasks: list[asyncio.Task[None]] = []

        try:

            for _ in range(limit):

                pending = puller()

                try: tasks.append(spawn(pending))
                except BaseException:

                    pending.close()

                    raise

            await asyncio.gather(*tasks)

        except BaseException as error:

            pending_tasks = (task for task in tasks if not task.done() and not task.cancelling())

            for task in pending_tasks: task.cancel()

            await asyncio.gather(*tasks, return_exceptions=True)

            if isinstance(error, Exception) and failed and (first := min(failed, key=itemgetter(0))[1]) is not error:

                raise first from error

            raise

    async def _lane_ ( self, mode: str, address: str | None ) -> Submit:

        if self._scope is not None: return self._scope.call
        if mode == "async": return direct
        if mode in {"ray", "remote"}: return (await Cluster.connect(address)).call
        if mode == "thread": return self._threads.submit

        return self._lanes[mode].submit

    async def _one_ ( self, flight: Flight, index: int, item: Any ) -> None:

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
            except Fault as error:

                if left == 0 or not error.safe(flight.idempotent): raise
                if error.retry_after: await asyncio.sleep(error.retry_after)

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

        if self._scope is not None:

            asked = self._scope.workers if workers is None else self._whole_(workers, 1, "workers", CEILING)

            return min(asked, self._scope.workers)

        asked = self._workers if workers is None else self._whole_(workers, 1, "workers", CEILING)

        if mode == "thread": return min(asked, self._workers)
        if mode in ISOLATED: return min(asked, CORES)

        return asked

    def _unstarted_ ( self, works: Iterable[object] ) -> None:

        for work in works:

            if inspect.iscoroutine(work) and inspect.getcoroutinestate(work) == inspect.CORO_CREATED: work.close()

    def _scoped_ ( self ) -> Scope:

        if self._scope is None: raise Fault(Code.CONFLICT, reason="thread.mode_required")

        return self._scope

    def _selected_ ( self, mode: Mode | None, address: str | None ) -> Mode:

        if self._scope is None: return "async" if mode is None else mode

        scope = self._scope
        scope.accept()

        if mode is not None and mode != scope.mode: raise Fault(Code.CONFLICT, reason="thread.mode")
        if address is not None and address != scope.host: raise Fault(Code.CONFLICT, reason="thread.host")

        return cast("Mode", scope.mode)

    @staticmethod
    def _called_ ( work: Callable[[], Any] ) -> Any:

        return work()

    @staticmethod
    def _fits_ ( work: object, mode: str = "async" ) -> bool:

        return callable(work) and (
            mode == "async"
            or not (inspect.iscoroutinefunction(work) or inspect.iscoroutinefunction(type(work).__call__))
        )

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
    async def _hook_ ( hook: Hook, index: int, value: Any ) -> None:

        made = hook(index, value)

        if inspect.isawaitable(made): await made

    @staticmethod
    def _ms_ ( since: float ) -> float:

        return round((time.perf_counter() - since) * 1000, 3)
