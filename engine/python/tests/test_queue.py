from engine.broker import Broker, Memory, Message
from engine.context import context
from engine.cache import Cache
from engine.database import Database, Migrator, Outbox
from pathlib import Path
from engine.error import Code, Fault
from engine.log import log
from engine.queue import Job, Queue, Work
from typing import Any, ClassVar, cast
import asyncio, pytest

@pytest.fixture
async def jobs () -> Queue:

    bus = Broker()

    bus.setup(Memory())

    made = Queue()

    made.setup(bus, queues=("default", "mail"))

    await made.declare()

    return made

async def test_jobs_round_trip_and_retry_with_backoff () -> None:

    job = Job.make("send", { "to": "a" }, queue="mail", tries=2, backoff=0.0, unique="u1")

    assert job.due() and not job.exhausted() and Job.load(job.dump()) == job and job.again().attempt == 1 and job.again().exhausted()

    delayed = Job.make("send", {}, delay=60)

    assert not delayed.due()

async def test_tasks_run_through_the_broker ( jobs: Queue ) -> None:

    seen: list[str] = []
    dead: list[tuple[str, str]] = []

    @jobs.task("send", queue="mail", tries=2, backoff=0.0)
    async def send ( to: str ) -> None:

        seen.append(f"{to}:{context.get('job') is not None}:{context.request_id()}")

    @jobs.task("broken", tries=2, backoff=0.0)
    async def broken () -> None: raise Fault(Code.UNAVAILABLE, reason="down")

    @jobs.task("slow", timeout=0.05)
    async def slow () -> None: await asyncio.sleep(1)

    @jobs.task("crash")
    async def crash () -> None: raise ValueError("boom")

    jobs.on_failure(lambda job, fault: _record(dead, job.name, fault.reason))

    assert jobs.names() == ("broken", "crash", "send", "slow") and jobs.queues() == ("default", "mail")

    with context.scope(request_id="req-9"): pushed = await jobs.push("send", { "to": "x" }, unique="k1")

    assert pushed.facts == { "request_id": "req-9" } and pushed.unique == "k1"
    assert await jobs.work("mail", wait=0.5) == 1 and seen == ["x:True:req-9"]

    await jobs.push("send", { "to": "dup" }, unique="k1")

    assert await jobs.work("mail", wait=0.2) == 0 and seen == ["x:True:req-9"] and jobs.stats()["skipped"] == 1

    await jobs.push("broken")

    assert await jobs.work(wait=0.5) == 1 and jobs.stats()["failed"] == 1 and dead == []

    await asyncio.sleep(0.05)

    assert await jobs.work(wait=0.5) == 1 and dead == [("broken", "down")] and jobs.stats()["dead"] == 1

    await jobs.push("slow")
    await jobs.push("crash")

    assert await jobs.work(limit=5, wait=0.5) == 2 and jobs.stats()["failed"] == 4

    with pytest.raises(Fault) as unknown: await jobs.push("nothing")

    assert unknown.value.reason == "queue.task"

    late = await jobs.push("send", { "to": "later" }, delay=0.05)

    assert not late.due() and await jobs.work("mail", wait=0.3) == 1 and seen[-1].startswith("later")

    jobs.start(["mail"])

    assert jobs.running()

    await jobs.push("send", { "to": "bg" })

    for _ in range(40):

        if any(item.startswith("bg") for item in seen): break

        await asyncio.sleep(0.05)

    assert any(item.startswith("bg") for item in seen)

    await jobs.stop()

    assert not jobs.running() and jobs.describe()["tasks"]["send"]["queue"] == "mail"

    jobs.clear()

    assert jobs.names() == ()

async def test_inline_mode_runs_at_once () -> None:

    inline = Queue()

    inline.setup(Broker(), inline=True)

    ran: list[int] = []

    @inline.task("add")
    async def add ( n: int ) -> None: ran.append(n)

    await inline.push("add", { "n": 1 })

    assert ran == [1] and inline.stats()["processed"] == 1

async def _record ( dead: list[tuple[str, str]], name: str, reason: str | None ) -> None:

    dead.append((name, reason or ""))

async def test_deferred_work_follows_the_fate_of_its_job ( jobs: Queue ) -> None:

    seen: list[str] = []

    def crash () -> None: raise ValueError("late")

    @jobs.task("ship", tries=2, backoff=0.0)
    async def ship ( fail: bool ) -> None:

        context.defer(lambda: seen.append(f"done:{context.get('job') is not None}"))
        context.defer(crash)
        context.defer(lambda: seen.append("always"), always=True)

        if fail: raise Fault(Code.UNAVAILABLE, reason="down")

    await jobs.push("ship", { "fail": False })

    with log.capture() as events: assert await jobs.work(wait=0.5) == 1

    late = [(event["kind"], event["reason"], bool(event["id"])) for event in events if event["event"] == "queue.deferred"]

    assert seen == ["done:True", "always"] and late == [("ValueError", None, True)] and jobs.stats()["failed"] == 0

    await jobs.push("ship", { "fail": True })

    assert await jobs.work(wait=0.5) == 1 and seen == ["done:True", "always", "always"] and jobs.stats()["failed"] == 1

FLAG: Any = True

def test_jobs_tasks_and_settings_are_validated () -> None:

    jobs = Queue()

    for what, raw in (
        ("name", { "id": "", "name": "send" }), ("name", { "id": "j", "name": "" }), ("name", { "id": "j", "name": "a b" }), ("name", { "id": "j", "name": "send", "queue": "a b" }),
        ("payload", { "id": "j", "name": "send", "payload": [1] }), ("payload", { "id": "j", "name": "send", "facts": "x" }), ("payload", { "id": "j", "name": "send", "tries": "x" }),
        ("payload", { "id": "j", "name": "send", "backoff": "soon" }), ("tries", { "id": "j", "name": "send", "tries": -1 }), ("tries", { "id": "j", "name": "send", "tries": 101 }),
        ("tries", { "id": "j", "name": "send", "attempt": -1 }), ("timing", { "id": "j", "name": "send", "backoff": -1 }), ("timing", { "id": "j", "name": "send", "backoff": 1e9 }),
        ("timing", { "id": "j", "name": "send", "timeout": -1 }), ("unique", { "id": "j", "name": "send", "unique": "" }), ("unique", { "id": "j", "name": "send", "unique": 7 }),
        ("available", { "id": "j", "name": "send", "available": "soon" }), ("available", { "id": "j", "name": "send", "available": "x" * 65 }),
        ("available", { "id": "j", "name": "send", "available": "3" }), ("available", { "id": "j", "name": "send", "available": 1700000000 }), ("available", { "id": "j", "name": "send", "available": "2026-11-11" }),
    ):

        with pytest.raises(Fault) as refused: Job.load(raw)

        assert refused.value.code is Code.INTERNAL and refused.value.reason == "queue.job" and refused.value.errors == { what: ["is invalid"] }, what

    with pytest.raises(Fault) as odd: Job.load(cast("Any", [1]))

    assert odd.value.reason == "queue.job"

    loaded = Job.load({ "id": "j", "name": "send", "tries": "2", "backoff": 1, "attempt": None, "payload": None, "available": None })

    assert (loaded.tries, loaded.backoff, loaded.attempt, loaded.payload, loaded.available) == (2, 1.0, 0, {}, "") and loaded.due()

    async def work () -> None: return None

    for setting, make in (
        ("broker", lambda: jobs.setup(cast("Any", "bus"))), ("cache", lambda: jobs.setup(cache=cast("Any", "redis"))), ("queues", lambda: jobs.setup(queues=cast("Any", "default"))),
        ("queues", lambda: jobs.setup(queues=("a b",))), ("task", lambda: jobs.task("")), ("task", lambda: jobs.task("send", queue="")), ("task", lambda: jobs.task("send", tries=0)),
        ("task", lambda: jobs.task("send", tries=cast("Any", "3"))), ("task", lambda: jobs.task("send", backoff=-1)), ("task", lambda: jobs.task("send", timeout=FLAG)),
        ("rate", lambda: jobs.task("send", rate="x")), ("rate", lambda: jobs.task("send", rate="0/1m")), ("rate", lambda: jobs.task("send", rate=cast("Any", 5))),
        ("handler", lambda: jobs.task("send")(cast("Any", "work"))),
    ):

        with pytest.raises(Fault) as unset: make()

        assert unset.value.reason == "queue.settings" and unset.value.errors == { "setting": [setting] }, setting

    jobs.task("send", rate="10/1m")(work)

    with pytest.raises(Fault) as twice: jobs.task("send")(work)

    assert twice.value.reason == "queue.duplicate"
    assert jobs.describe()["tasks"]["send"]["rate"] == [10, 60.0]

async def test_pushes_are_validated_and_a_malformed_message_never_stops_the_worker ( jobs: Queue ) -> None:

    seen: list[int] = []

    @jobs.task("add", tries=1)
    async def add ( n: int ) -> None: seen.append(n)

    for what, work in (
        ("payload", jobs.push("add", cast("Any", [1]))), ("delay", jobs.push("add", {}, delay=-1)), ("delay", jobs.push("add", {}, delay=float("inf"))),
        ("delay", jobs.push("add", {}, delay=cast("Any", "5"))), ("unique", jobs.push("add", {}, unique="")), ("unique", jobs.push("add", {}, unique=cast("Any", 7))),
    ):

        with pytest.raises(Fault) as refused: await work

        assert refused.value.reason == "queue.job" and refused.value.errors == { what: ["is invalid"] }, what

    with pytest.raises(Fault) as unknown: await jobs.push(cast("Any", 7))

    assert unknown.value.reason == "queue.task"

    bus = jobs.describe()

    assert bus["queues"] == ["default", "mail"]

    await jobs.push("add", { "n": 1 })

    broker = cast("Any", jobs)._broker  # noqa: SLF001

    await broker.publish("queue.default", { "id": "", "name": "add" })
    await broker.publish("queue.default", { "id": "j2", "name": "add", "payload": { "n": 2 } })

    assert await jobs.work(limit=5, wait=0.3) == 3 and seen == [1, 2] and jobs.stats()["processed"] == 2

class Send(Work):

    name: ClassVar[str] = "send"

    to   : str
    body : str = ""

async def test_work_is_a_typed_job_that_dispatches_itself () -> None:

    inline = Queue()

    inline.setup(Broker(), inline=True)

    sent: list[tuple[str, str]] = []

    @inline.task("send")
    async def send ( to: str, body: str ) -> None: sent.append((to, body))

    job = await Send(to="a@x.io", body="hi").dispatch(bus=inline)

    assert job.name == "send" and job.payload == { "to": "a@x.io", "body": "hi" } and sent == [("a@x.io", "hi")]


async def test_delayed_jobs_release_completed_tasks_and_close_cancels_pending ( jobs: Queue ) -> None:

    @jobs.task("later")
    async def later () -> None: return

    await jobs.push("later", {}, delay=0.01)

    for _ in range(100):

        if not jobs.stats()["delayed"]: break

        await asyncio.sleep(0.01)

    assert not jobs.stats()["delayed"]

    await jobs.push("later", {}, delay=60)

    assert jobs.stats()["delayed"] == 1

    await jobs.close()

    assert not jobs.stats()["delayed"]

async def test_durable_queue_survives_recreation_without_a_running_relay ( tmp_path: Path ) -> None:

    db = Database()

    await db.connect(f"sqlite://{tmp_path / 'queue.db'}")

    table = Outbox.blueprint("jobs_outbox")
    box = Outbox(db, table=table)
    bus = Broker()
    first = Queue()
    first.setup(bus)
    first.durable(box)

    async def broken () -> None: raise Fault(Code.UNAVAILABLE, reason="unavailable")

    first.task("work", tries=1)(broken)

    await Migrator(db, [table]).apply()
    await first.declare()

    try:

        job = await first.push("work", delay=0.01)

        assert first.stats()["delayed"] == 0 and await box.pending() == 1

        await first.close()
        await asyncio.sleep(0.02)

        assert await box.relay() == 1
        assert await first.work(wait=0.01) == 1

        second_box = Outbox(db, table=table)
        second = Queue()
        second.setup(bus)
        second.durable(second_box)
        seen: list[bool] = []

        async def fixed () -> None: seen.append(True)

        second.task("work", tries=1)(fixed)

        assert [row["id"] for row in await second.failed()] == [job.id]
        assert await second_box.claim() == []
        assert await second.retry_dead(job.id)
        assert await second_box.relay() == 1
        assert await second.work(wait=0.01) == 1 and seen == [True]
        assert await second.failed() == []

        await second.close()

    finally:

        await bus.close()
        await db.close()

async def test_early_delivery_waits_without_clearing_requested_availability ( jobs: Queue ) -> None:

    ran = asyncio.Event()

    @jobs.task("future")
    async def future () -> None: ran.set()

    job = Job.make("future", {}, delay=0.1)
    message = Message.make("queue.default", job.dump())
    task = asyncio.create_task(jobs.handle(message))

    try:

        await asyncio.sleep(0.02)

        assert not ran.is_set() and not task.done()

        await task

        assert ran.is_set() and job.due()

    finally:

        task.cancel()

        await asyncio.gather(task, return_exceptions=True)


async def test_unique_reservation_is_released_only_for_definite_publish_failure (
    monkeypatch: pytest.MonkeyPatch,
) -> None:

    bus, store, jobs = Broker(), Cache(), Queue()
    jobs.setup(bus, cache=store)
    seen: list[bool] = []

    @jobs.task("unique")
    async def receive () -> None: seen.append(True)

    await jobs.declare()

    async def definite ( *args: Any, **kwargs: Any ) -> None:

        raise Fault(Code.UNAVAILABLE, reason="publish.failed")

    async def uncertain ( *args: Any, **kwargs: Any ) -> None:

        raise Fault(Code.UNAVAILABLE, reason="publish.unknown", unknown=True)

    try:

        with monkeypatch.context() as patch:

            patch.setattr(bus, "publish", definite)

            with pytest.raises(Fault): await jobs.push("unique", unique="definite")

        await jobs.push("unique", unique="definite")

        assert await jobs.work(wait=0.01) == 1 and seen == [True]

        with monkeypatch.context() as patch:

            patch.setattr(bus, "publish", uncertain)

            with pytest.raises(Fault): await jobs.push("unique", unique="uncertain")

        await jobs.push("unique", unique="uncertain")

        assert jobs.stats()["skipped"] == 1

    finally:

        await jobs.close()
        await bus.close()
        await store.close()
