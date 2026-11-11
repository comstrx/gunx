from collections.abc import Callable
from concurrent.futures import BrokenExecutor, Executor, Future, InterpreterPoolExecutor, ProcessPoolExecutor
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from typing import Any

from engine.error import Code, Fault
from .arch import RECYCLE
import asyncio, inspect, multiprocessing, os, threading

class Pool:

    __slots__ = ("_executor", "_flights", "_lock", "_pid", "mode", "workers")

    def __init__ ( self, mode: str, workers: int ) -> None:

        self.mode     = mode
        self.workers  = workers
        self._lock    = threading.Lock()
        self._pid     = os.getpid()
        self._executor: Executor | None = None
        self._flights: set[Future[Any]] = set()

    def executor ( self ) -> Executor:

        made = self._executor

        if made is not None and self._pid == os.getpid(): return made

        return self._opened_()

    async def submit ( self, handler: Callable[..., Any], item: Any ) -> Any:

        executor = self.executor()

        try: future = self._sent_(executor, handler, item)
        except (BrokenExecutor, RuntimeError) as error: raise self._broken_(executor) from error

        try: made = await future
        except BrokenExecutor as error: raise self._broken_(executor) from error
        except asyncio.CancelledError as error:

            task = asyncio.current_task()

            if task is None or task.cancelling(): raise

            raise Fault(Code.UNAVAILABLE, reason="thread.broken") from error

        except (SystemExit, KeyboardInterrupt) as error: raise Fault.wrap(error, reason="thread.failed") from error

        if inspect.iscoroutine(made):

            made.close()

            raise Fault(Code.INTERNAL, reason="thread.work")

        return made

    def live ( self ) -> bool:

        return self._executor is not None and self._pid == os.getpid()

    def busy ( self ) -> bool:

        return bool(self._flights) and self._pid == os.getpid()

    def resize ( self, workers: int ) -> None:

        if workers == self.workers: return

        self.workers = workers

        self.close()

    def close ( self, kill: bool = False ) -> None:

        executor, self._executor, self._flights = self._executor, None, set()

        if executor is None or self._pid != os.getpid(): return

        if kill and isinstance(executor, ProcessPoolExecutor): executor.kill_workers()
        else: executor.shutdown(wait=False, cancel_futures=kill)

    def describe ( self ) -> dict[str, Any]:

        return { "mode": self.mode, "workers": self.workers, "live": self.live() }

    def _sent_ ( self, executor: Executor, handler: Callable[..., Any], item: Any ) -> asyncio.Future[Any]:

        loop = asyncio.get_running_loop()

        if self.mode == "thread": flight = executor.submit(copy_context().run, handler, item)
        elif self.mode == "process": flight = executor.submit(Pool._guarded_, handler, item)
        else: flight = executor.submit(handler, item)

        flights = self._flights

        flights.add(flight)
        flight.add_done_callback(flights.discard)

        return asyncio.wrap_future(flight, loop=loop)

    def _opened_ ( self ) -> Executor:

        pid = os.getpid()

        if self._pid != pid: self._lock, self._executor, self._flights, self._pid = threading.Lock(), None, set(), pid

        with self._lock:

            made = self._executor

            if made is None: made = self._executor = self._built_()

            return made

    def _built_ ( self ) -> Executor:

        if self.mode == "process":

            context = multiprocessing.get_context("spawn")

            return ProcessPoolExecutor(self.workers, mp_context=context, max_tasks_per_child=RECYCLE)

        if self.mode == "interpreter": return InterpreterPoolExecutor(self.workers, thread_name_prefix="engine-twin")

        return ThreadPoolExecutor(self.workers, thread_name_prefix="engine")

    def _broken_ ( self, executor: Executor ) -> Fault:

        if self._executor is executor: self.close(kill=True)

        return Fault(Code.UNAVAILABLE, reason="thread.broken", unknown=True)

    @staticmethod
    def _guarded_ ( handler: Callable[..., Any], item: Any ) -> Any:

        try: return handler(item)
        except Fault: raise
        except Exception as error: raise Fault.wrap(error, reason="thread.failed") from error
