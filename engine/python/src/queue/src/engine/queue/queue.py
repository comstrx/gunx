from collections import deque
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from engine.broker import Broker, Message, broker as shared
from engine.cache import Cache, cache as held
from engine.context import context
from engine.database import Outbox
from engine.date import date
from engine.error import Code, Fault
from engine.log import log
from engine.parse import parse
from engine.thread import thread
from .arch import (
    CHAIN, DEAD, DEFAULT, Failure, Handler, KIND, Layer, MAX_BACKOFF, MAX_TIMEOUT, MAX_TRIES, MAX_WAIT, named, Next,
    real, TOPIC, UNIQUE, whole, wrong,
)
from .job import Job
from .task import Task
import asyncio

class Queue:

    def __init__ ( self ) -> None:

        self._broker: Broker = shared
        self._cache: Cache = held
        self._tasks: dict[str, Task] = {}
        self._queues: tuple[str, ...] = (DEFAULT,)
        self._outbox: Outbox | None = None
        self._inline = False
        self._skipped = 0
        self._failures: list[Failure] = []
        self._running: dict[str, bool] = {}
        self._processed = 0
        self._failed    = 0
        self._dead      = 0
        self._timers: list[Any] = []
        self._layers: list[Layer] = []
        self._letters: deque[tuple[Job, str]] = deque(maxlen=DEAD)
        self._deferred = 0

    def setup (
        self, broker: Broker | None = None, queues: Sequence[str] = (DEFAULT,), inline: bool = False,
        cache: Cache | None = None,
    ) -> None:

        given: object = broker
        store: object = cache

        if given is not None and not isinstance(given, Broker): raise self._unset_("broker")
        if store is not None and not isinstance(store, Cache): raise self._unset_("cache")
        if not isinstance(queues, list | tuple) or not all(named(name) for name in queues): raise self._unset_("queues")

        self._broker = broker or shared
        self._cache  = cache or held
        self._queues = tuple(dict.fromkeys(queues)) or (DEFAULT,)
        self._inline = bool(inline)

    def durable ( self, outbox: Outbox ) -> None:

        async def deliver ( payload: Mapping[str, Any] ) -> None: await self._send_(Job.load(payload))

        outbox.kind(KIND, deliver)

        self._outbox = outbox

    async def declare ( self ) -> None:

        for name in self._queues: await self._broker.declare(f"{TOPIC}.{name}", f"{TOPIC}.{name}")

    def task (
        self, name: str, queue: str = DEFAULT, tries: int = 3, backoff: float = 5.0, timeout: float = 0.0,
        rate: str | None = None,
    ) -> Callable[[Handler], Task]:

        if not named(name) or not named(queue): raise self._unset_("task")
        if not whole(tries, 1, MAX_TRIES) or not real(backoff, MAX_BACKOFF) or not real(timeout, MAX_TIMEOUT):

            raise self._unset_("task")

        limit = self._rate_(rate)

        def register ( handler: Handler ) -> Task:

            if not callable(handler): raise self._unset_("handler")
            if name in self._tasks: raise Fault(Code.INTERNAL, reason="queue.duplicate", errors={ "task": [name] })

            made = Task(name, handler, queue, tries, backoff, timeout, limit)

            self._tasks[name] = made

            return made

        return register

    def through ( self, *layers: Layer ) -> None:

        self._layers.extend(layers)

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._tasks))

    def queues ( self ) -> tuple[str, ...]:

        return self._queues

    def on_failure ( self, handler: Failure ) -> None:

        self._failures.append(handler)

    async def later (
        self, delay: float, name: str, payload: Mapping[str, Any] | None = None, unique: str | None = None,
    ) -> Job:

        return await self.push(name, payload, delay, unique)

    async def bulk ( self, name: str, payloads: Sequence[Mapping[str, Any]], delay: float = 0.0 ) -> list[Job]:

        return [await self.push(name, payload, delay) for payload in payloads]

    async def chain ( self, *steps: tuple[str, Mapping[str, Any]], delay: float = 0.0 ) -> Job:

        if not steps: raise Fault(Code.INTERNAL, reason="queue.chain")

        name, payload = steps[0]
        rest = [[step, dict(data)] for step, data in steps[1:]]

        with context.scope(**{ CHAIN: rest }): return await self.push(name, payload, delay)

    def dead_letters ( self ) -> list[dict[str, Any]]:

        return [{ **job.dump(), "failure": reason } for job, reason in self._letters]

    async def retry_dead ( self, id_: str ) -> bool:

        for job, reason in list(self._letters):

            if job.id != id_: continue

            self._letters.remove((job, reason))

            await self._send_(Job.load({ **job.dump(), "attempt": 0, "available": "" }))

            return True

        return False

    async def push (
        self, name: str, payload: Mapping[str, Any] | None = None, delay: float = 0.0, unique: str | None = None,
    ) -> Job:

        task = self._tasks.get(name) if type(name) is str else None

        if task is None: raise Fault(Code.INTERNAL, reason="queue.task", errors={ "task": [str(name)[:64]] })
        if task.queue not in self._queues:

            raise Fault(Code.INTERNAL, reason="queue.queue", errors={ "queue": [task.queue] })

        if payload is not None and not isinstance(payload, Mapping): raise wrong("payload")
        if not real(delay, MAX_WAIT): raise wrong("delay")
        if unique is not None and not named(unique): raise wrong("unique")

        job = task.job(payload or {}, delay, unique)

        if unique and not await self._cache.add(f"queue:unique:{unique}", job.id, UNIQUE):

            self._skipped += 1

            log.debug("queue.duplicate", job=job.name, unique=unique)

            return job

        if self._inline:

            await self.perform(job)

            return job

        durable = self._outbox is not None and (delay > 0 or self._outbox.running())

        if durable and self._outbox is not None: await self._outbox.put(KIND, job.dump(), delay)
        elif delay > 0: self._timers.append(thread.spawn(self._later_(job, delay), f"queue:{job.id}"))
        else: await self._send_(job)

        return job

    async def perform ( self, job: Job ) -> bool:

        task = self._tasks.get(job.name)

        if task is None: raise Fault(Code.INTERNAL, reason="queue.task", errors={ "task": [job.name] })

        context.load(job.facts)

        with context.scope(job=job.id) as deferral:

            failed = True

            try:

                await self._layered_(task, job)

                failed = False

            except TimeoutError as error: raise Fault(Code.TIMEOUT, reason="queue.timeout", unknown=True) from error
            except Fault: raise
            except Exception as error: raise Fault.wrap(error, reason="queue.crash") from error
            finally: await deferral.flush(self._deferred_, failed)

        self._processed += 1

        await self._continue_(job)

        return True

    def _deferred_ ( self, error: Exception ) -> None:

        reason = error.reason if isinstance(error, Fault) else None

        log.error("queue.deferred", id=context.get("job"), kind=type(error).__name__, reason=reason)

    async def _layered_ ( self, task: Task, job: Job ) -> None:

        async def run ( current: Job ) -> None:

            if task.timeout: await asyncio.wait_for(task.handler(**current.payload), task.timeout)
            else: await task.handler(**current.payload)

        call: Next = run

        for layer in reversed(self._layers):

            call = self._wrap_(layer, call)

        await call(job)

    @staticmethod
    def _wrap_ ( layer: Layer, inner: Next ) -> Next:

        async def call ( current: Job ) -> None: await layer(current, inner)

        return call

    async def _continue_ ( self, job: Job ) -> None:

        steps = job.facts.get(CHAIN) or []

        if not steps: return

        name, payload = steps[0]

        with context.scope(**{ CHAIN: steps[1:] }): await self.push(str(name), dict(payload))

    async def handle ( self, message: Message ) -> None:

        try: job = Job.load(message.payload)
        except Fault as fault:

            log.error("queue.malformed", id=message.id, reason=fault.reason)

            return

        task = self._tasks.get(job.name)

        if not job.due():

            await self._later_(job, 0.0)

            return

        if task is not None and task.rate is not None:

            hit = await self._cache.hit(f"queue:rate:{task.name}", task.rate[0], task.rate[1])

            if not hit.allowed:

                self._deferred += 1

                self._timers.append(thread.spawn(self._later_(job, hit.retry_after()), f"queue:{job.id}"))

                return

        try: await self.perform(job)
        except Fault as fault:

            self._failed += 1

            if job.exhausted():

                self._dead += 1

                log.error("queue.dead", job=job.name, id=job.id, attempts=job.attempt + 1, reason=fault.reason)

                self._letters.append((job, fault.reason or fault.code.value))

                for failure in self._failures: await failure(job, fault)

                return

            log.warning("queue.retry", job=job.name, id=job.id, attempt=job.attempt + 1, reason=fault.reason)

            await self._send_(job.again())

    async def work ( self, queue: str = DEFAULT, limit: int = 16, wait: float = 1.0 ) -> int:

        return await self._broker.consume(f"{TOPIC}.{queue}", self.handle, limit, wait, tries=1)

    def start ( self, queues: Sequence[str] | None = None ) -> None:

        for name in queues or self._queues:

            self._running[name] = True
            self._broker.subscribe(f"{TOPIC}.{name}", self.handle, tries=1)

    async def stop ( self ) -> None:

        for name in list(self._running):

            self._broker.unsubscribe(f"{TOPIC}.{name}")

            self._running[name] = False

        await self._broker.drain()

    def running ( self ) -> bool:

        return any(self._running.values())

    async def close ( self ) -> None:

        await self.stop()

    def stats ( self ) -> dict[str, int]:

        return {
            "processed": self._processed, "failed": self._failed, "dead": self._dead, "skipped": self._skipped,
            "deferred": self._deferred, "registered": len(self._tasks), "letters": len(self._letters),
        }

    def describe ( self ) -> dict[str, Any]:

        tasks = { name: task.describe() for name, task in sorted(self._tasks.items()) }

        return { "queues": list(self._queues), "inline": self._inline, "tasks": tasks, **self.stats() }

    def clear ( self ) -> None:

        self._tasks    = {}
        self._failures = []
        self._layers   = []

        self._letters.clear()

    def _rate_ ( self, text: str | None ) -> tuple[int, float] | None:

        if text is None: return None
        if type(text) is not str: raise self._unset_("rate")

        count, _, window = text.partition("/")

        try: made = parse.integer(count, 1), parse.duration(window or "1m")
        except Fault as fault: raise self._unset_("rate") from fault

        if made[1] <= 0: raise self._unset_("rate")

        return made

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="queue.settings", errors={ "setting": [what] })

    async def _send_ ( self, job: Job ) -> None:

        if not job.due():

            wait = max(0.0, date.between(date.now(), date.parse(job.available)))

            self._timers.append(thread.spawn(self._later_(job, wait), f"queue:{job.id}"))

            return

        await self._broker.publish(f"{TOPIC}.{job.queue}", job.dump())

    async def _later_ ( self, job: Job, wait: float ) -> None:

        await thread.sleep(wait)

        due = Job(
            job.id, job.name, job.payload, job.queue, job.tries, job.backoff, job.attempt, job.unique, job.facts,
            job.timeout, "",
        )

        await self._broker.publish(f"{TOPIC}.{due.queue}", due.dump())

queue = Queue()
