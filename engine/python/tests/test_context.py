from engine.context import Deferral, context
from engine.error import Code, Fault
from typing import Any
import asyncio, pytest

def test_facts_are_scoped_and_shared_selectively () -> None:

    context.clear()

    with context.scope(request_id="r1", actor={ "id": 7 }, secret="s"):

        assert context.get("request_id") == "r1" and context.has("actor") and context.need("secret") == "s"
        assert context.request_id() == "r1" and context.actor() == { "id": 7 } and context.locale() == "en"
        assert context.dump() == { "request_id": "r1", "actor": { "id": 7 } }

        context.put(locale="ar")

        assert context.locale() == "ar"
        assert context.forget("secret", "nothing") == 1 and not context.has("secret")

    assert context.snapshot() == {}
    assert context.request_id() is None

    with pytest.raises(Fault) as caught: context.need("request_id")

    assert caught.value.reason == "context.request_id"

def test_load_keeps_only_the_shared_facts () -> None:

    context.load({ "request_id": "r2", "password": "x", "locale": "ar" })

    assert context.snapshot() == { "request_id": "r2", "locale": "ar" }

    context.clear()

def test_load_refuses_what_a_wire_may_not_carry () -> None:

    actor: dict[str, Any] = { "id": 7, "role": "admin", "active": True, "score": 1.5 }

    context.load({ "request_id": "r" * 256, "actor": actor, "tenant": 9, "locale": None, "trace": 0.5 })

    assert context.snapshot() == { "request_id": "r" * 256, "actor": actor, "tenant": 9, "trace": 0.5 }

    actor["id"] = 8

    assert context.actor()["id"] == 7

    hostile: list[Any] = [
        "r" * 257, ["a"], ("a",), { "a", "b" }, b"raw", object(), { "id": { "deep": 1 } }, { "id": [1] }, { 7: "x" },
        { "n" * 65: 1 }, { f"k{at}": at for at in range(17) }, { "id": "v" * 257 }, { "id": None },
    ]

    for value in hostile:

        context.load({ "request_id": value, "actor": value, "tenant": value, "locale": value, "trace": value })

        assert context.snapshot() == {}

    context.load({ "actor": { f"k{at}": at for at in range(16) }, "tenant": "" })

    assert len(context.actor()) == 16 and context.get("tenant") == ""

    context.load({})

    assert context.snapshot() == {}

async def test_deferred_work_runs_at_the_end_of_the_scope () -> None:

    seen: list[str] = []

    async def later () -> None: seen.append("async")

    assert context.defer(lambda: seen.append("lost")) is False

    with context.scope(request_id="r3") as deferral:

        assert context.defer(lambda: seen.append("sync")) is True
        assert context.defer(later) is True
        assert deferral.pending() == 2 and context.deferred() is deferral

        assert await context.flush() == 2

    assert seen == ["sync", "async"]
    assert await context.flush() == 0

async def test_a_failing_item_never_stops_the_rest () -> None:

    seen: list[str] = []
    told: list[Exception] = []

    def crash () -> None: raise ValueError("first")

    async def refuse () -> None: raise Fault(Code.CONFLICT, reason="second")

    deferral = Deferral()

    for work in (crash, lambda: seen.append("a"), refuse, lambda: seen.append("b")): deferral.add(work)

    assert await deferral.flush(told.append) == 4 and seen == ["a", "b"] and deferral.pending() == 0
    assert [type(error) for error in told] == [ValueError, Fault] and str(told[0]) == "first"

    for work in (crash, lambda: seen.append("c"), refuse): deferral.add(work)

    with pytest.raises(ExceptionGroup) as caught: await deferral.flush()

    assert [type(error) for error in caught.value.exceptions] == [ValueError, Fault]
    assert seen == ["a", "b", "c"] and deferral.pending() == 0 and await deferral.flush() == 0

async def test_a_failed_scope_runs_only_what_asked_for_always () -> None:

    seen: list[str] = []

    with context.scope() as deferral:

        assert context.defer(lambda: seen.append("success"))
        assert context.defer(lambda: seen.append("always"), always=True)
        assert context.defer(lambda: seen.append("also"))

        assert await context.flush(failed=True) == 1 and seen == ["always"] and deferral.pending() == 0

        context.defer(lambda: seen.append("success"))
        context.defer(lambda: seen.append("always"), always=True)

        assert await context.flush() == 2 and seen == ["always", "success", "always"]

async def test_work_deferred_while_flushing_runs_and_a_loop_is_cut () -> None:

    seen: list[int] = []

    with context.scope() as deferral:

        def chain ( left: int ) -> None:

            seen.append(left)

            if left: context.defer(lambda: chain(left - 1))

        context.defer(lambda: chain(3))

        assert await context.flush() == 4 and seen == [3, 2, 1, 0] and deferral.pending() == 0

        def forever () -> None:

            seen.append(-1)
            context.defer(forever)

        told: list[Exception] = []

        context.defer(forever)

        ran = await context.flush(told.append)

        assert ran == 1024 and seen.count(-1) == 1024 and deferral.pending() == 0
        assert len(told) == 1 and isinstance(told[0], Fault) and told[0].reason == "context.loop"

async def test_the_list_is_bounded_and_a_cancelled_flush_keeps_what_did_not_run () -> None:

    deferral = Deferral()

    for _ in range(1024): deferral.add(lambda: None)

    with pytest.raises(Fault) as full: deferral.add(lambda: None)

    assert full.value.reason == "context.full" and full.value.code is Code.INTERNAL and deferral.pending() == 1024
    assert deferral.clear() == 1024

    seen: list[str] = []
    gate = asyncio.Event()

    async def wait () -> None:

        seen.append("waiting")

        await gate.wait()

    for work in (lambda: seen.append("first"), wait, lambda: seen.append("third"), lambda: seen.append("fourth")):

        deferral.add(work)

    running = asyncio.ensure_future(deferral.flush())

    await asyncio.sleep(0)

    running.cancel()

    with pytest.raises(asyncio.CancelledError): await running

    assert seen == ["first", "waiting"] and deferral.pending() == 2
    assert await deferral.flush() == 2 and seen == ["first", "waiting", "third", "fourth"]

async def test_deferral_clears_and_isolates_tasks () -> None:

    deferral = Deferral()

    deferral.add(lambda: None)

    assert deferral.clear() == 1 and deferral.pending() == 0

    async def inner ( name: str ) -> str:

        with context.scope(request_id=name):

            await asyncio.sleep(0)

            return str(context.request_id())

    assert tuple(await asyncio.gather(inner("a"), inner("b"))) == ("a", "b")

async def test_open_and_close_frame_a_request_and_a_spawned_flush_keeps_its_facts () -> None:

    context.clear()

    seen: list[object] = []

    with context.scope(tenant="t1") as outer:

        opened = context.open(request_id="r9", locale="ar")
        inner  = context.deferred()

        assert isinstance(inner, Deferral) and inner is not outer and inner.pending() == 0
        assert context.facts()["request_id"] == "r9" and context.facts() is context.facts()
        assert context.get("tenant") == "t1" and context.locale() == "ar"
        assert context.defer(lambda: seen.append((context.request_id(), context.get("tenant"))))

        later = asyncio.ensure_future(inner.flush())

        context.close(opened)

        assert context.deferred() is outer and context.request_id() is None and context.get("tenant") == "t1"
        assert await later == 1 and seen == [("r9", "t1")] and outer.pending() == 0

        with pytest.raises(RuntimeError): context.close(opened)

    assert context.deferred() is None and context.snapshot() == {}

    token = context.put(request_id="r1")

    context.reset(token)

    assert context.get("request_id") is None
