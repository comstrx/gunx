from engine.context import Context, Deferral, Trace, context
from engine.error import Code, Fault
from engine.json import json
from collections import UserDict
from collections.abc import ItemsView, Iterator, Mapping
from typing import Any, cast, override
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

def test_trace_context_accepts_only_supported_valid_wire_ids () -> None:

    valid = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

    assert Trace.clean(valid) == valid

    for value in (None, 0, valid.upper(), valid + "\n", valid + "-extra",
            valid.replace("4bf92f3577b34da6a3ce929d0e0e4736", "0" * 32),
            valid.replace("00f067aa0ba902b7", "0" * 16), "ff" + valid[2:]):

        assert Trace.clean(value) is None

    with context.scope(request_id="r-1", traceparent=valid, actor="private", tenant="private"):

        assert context.headers() == { "X-Request-Id": "r-1", "traceparent": valid }

        context.put(request_id="bad\r\nInjected: x", traceparent="invalid")

        assert context.headers() == {}

async def test_propagated_context_is_task_local () -> None:

    async def read ( identity: str ) -> dict[str, str]:

        with context.scope(request_id=identity):

            await asyncio.sleep(0)

            return context.headers()

    first, second = await asyncio.gather(read("one"), read("two"))

    assert first == { "X-Request-Id": "one" } and second == { "X-Request-Id": "two" }

def test_facts_are_read_only_and_wire_snapshots_own_flat_values () -> None:

    local = Context()
    actor = { "id": 1 }

    with local.scope(actor=actor, request_id="one"):

        held = local.facts()

        with pytest.raises(TypeError): cast("dict[str, Any]", held)["request_id"] = "changed"

        wire = local.dump()

        wire["actor"]["id"] = 2

        assert local.actor() == { "id": 1 }
        local.put(request_id="two")

        assert held["request_id"] == "one" and local.request_id() == "two"

@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_wire_drops_nonfinite_numbers ( value: float ) -> None:

    local = Context()

    local.load({ "trace": value, "actor": { "score": value }, "tenant": 7 })

    assert local.snapshot() == { "tenant": 7 }

async def test_flush_rejects_overlapping_consumers_without_losing_work () -> None:

    deferral = Deferral()
    started = asyncio.Event()
    release = asyncio.Event()
    seen: list[str] = []

    async def blocked () -> None:

        started.set()
        await release.wait()

        seen.append("first")

    deferral.add(blocked)
    deferral.add(lambda: seen.append("second"))
    active = asyncio.create_task(deferral.flush())

    try:

        await started.wait()

        with pytest.raises(Fault) as caught: await deferral.flush()

        assert caught.value.reason == "context.busy" and deferral.pending() == 1

    finally:

        release.set()
        await active

    assert seen == ["first", "second"] and deferral.pending() == 0

async def test_reporter_failure_does_not_drop_later_work () -> None:

    deferral = Deferral()
    seen: list[str] = []

    def failed () -> None: raise ValueError("work")

    def reporter ( _: Exception ) -> None: raise RuntimeError("reporter")

    deferral.add(failed)
    deferral.add(lambda: seen.append("kept"))

    with pytest.raises(ExceptionGroup) as caught: await deferral.flush(reporter)

    assert [type(error) for error in caught.value.exceptions] == [ValueError, RuntimeError]
    assert seen == ["kept"] and deferral.pending() == 0

async def test_flush_limit_includes_wide_followup_batches () -> None:

    deferral = Deferral()
    seen: list[int] = []
    errors: list[Exception] = []

    def grow () -> None:

        seen.append(0)

        for _ in range(1024): deferral.add(lambda: seen.append(1))

    deferral.add(grow)

    assert await deferral.flush(errors.append) == 1024
    assert len(seen) == 1024 and deferral.pending() == 0
    assert len(errors) == 1 and isinstance(errors[0], Fault) and errors[0].reason == "context.loop"

async def test_cancellation_releases_flush_ownership_and_keeps_fifo () -> None:

    deferral = Deferral()
    entered = asyncio.Event()
    seen: list[str] = []

    async def interrupted () -> None:

        deferral.add(lambda: seen.append("added"))
        entered.set()
        await asyncio.Event().wait()

    deferral.add(interrupted)
    deferral.add(lambda: seen.append("queued"))
    active = asyncio.create_task(deferral.flush())

    await entered.wait()
    active.cancel()

    with pytest.raises(asyncio.CancelledError): await active

    assert deferral.pending() == 2 and await deferral.flush() == 2
    assert seen == ["queued", "added"]

async def test_clear_during_flush_discards_only_pending_work () -> None:

    deferral = Deferral()
    seen: list[str] = []

    def first () -> None:

        assert deferral.clear() == 1

        deferral.add(lambda: seen.append("replacement"))
        seen.append("first")

    deferral.add(first)
    deferral.add(lambda: seen.append("discarded"))

    assert await deferral.flush() == 2 and seen == ["first", "replacement"]

async def test_async_reporter_is_awaited_and_nested_flush_is_refused () -> None:

    deferral = Deferral()
    told: list[str] = []

    async def recursive () -> None: await deferral.flush()

    async def report ( error: Exception ) -> None:

        await asyncio.sleep(0)

        assert isinstance(error, Fault)

        told.append(str(error.reason))

    deferral.add(recursive)

    assert await deferral.flush(report) == 1 and told == ["context.busy"]

async def test_cancelling_a_reporter_preserves_unstarted_work () -> None:

    deferral = Deferral()
    entered = asyncio.Event()
    seen: list[int] = []

    def broken () -> None: raise ValueError("work")

    async def report ( _: Exception ) -> None:

        entered.set()
        await asyncio.Event().wait()

    deferral.add(broken)
    deferral.add(lambda: seen.append(1))
    active = asyncio.create_task(deferral.flush(report))

    await entered.wait()
    active.cancel()

    with pytest.raises(asyncio.CancelledError): await active

    assert deferral.pending() == 1 and await deferral.flush() == 1 and seen == [1]

async def test_pending_bound_counts_unstarted_work_during_flush () -> None:

    deferral = Deferral()

    def replenish () -> None:

        assert deferral.pending() == 1023
        assert deferral.add(lambda: None) == 1024

        with pytest.raises(Fault) as full: deferral.add(lambda: None)

        assert full.value.reason == "context.full"

    deferral.add(replenish)

    for _ in range(1023): deferral.add(lambda: None)

    errors: list[Exception] = []

    assert await deferral.flush(errors.append) == 1024 and deferral.pending() == 0
    assert len(errors) == 1 and isinstance(errors[0], Fault) and errors[0].reason == "context.loop"

def test_context_objects_are_borrowed_and_wire_values_are_copied () -> None:

    local = Context()
    resource = object()
    actor = { "id": 7 }

    with local.scope(resource=resource, actor=actor, tenant=None):

        assert local.get("resource") is resource and local.actor() is actor
        assert local.snapshot()["resource"] is resource
        assert local.dump() == { "actor": actor }
        assert local.dump()["actor"] is not actor

    assert not local.facts()

async def test_child_binding_updates_do_not_change_parent_or_siblings () -> None:

    local = Context()

    async def child ( name: str ) -> str | None:

        token = local.put(request_id=name)

        try:

            await asyncio.sleep(0)

            return local.request_id()

        finally: local.reset(token)

    with local.scope(request_id="parent"):

        assert tuple(await asyncio.gather(child("one"), child("two"))) == ("one", "two")
        assert local.request_id() == "parent"

def test_dump_load_share_the_same_bounded_wire_contract () -> None:

    local = Context()
    target = Context()

    with local.scope(request_id="r", actor={ "deep": {"x": 1} }, tenant=1, trace=float("nan"), secret="private"):

        wire = local.dump()

        assert wire == { "request_id": "r", "tenant": 1 }

        target.load(wire)

        try: assert target.dump() == wire
        finally: target.clear()

async def test_loop_reporter_cannot_leave_new_work_after_budget_exhaustion () -> None:

    deferral = Deferral()
    told: list[str] = []

    def again () -> None: deferral.add(again)

    def report ( error: Exception ) -> None:

        assert isinstance(error, Fault)

        told.append(str(error.reason))
        deferral.add(lambda: None)

    deferral.add(again)

    assert await deferral.flush(report) == 1024 and deferral.pending() == 0 and told == ["context.loop"]

def test_noop_bindings_keep_the_read_only_snapshot () -> None:

    owner = Context()
    initial = owner.open(request_id="r1", tenant=7)

    try:

        held = owner.facts()

        assert owner.forget() == 0 and owner.forget("missing") == 0 and owner.facts() is held

        token = owner.put()
        assert owner.facts() is held
        owner.reset(token)

        opened = owner.open()
        assert owner.facts() is held
        owner.close(opened)

        assert owner.forget("tenant", "tenant", "missing") == 1
        assert held["tenant"] == 7 and not owner.has("tenant")
        assert json.decode(json.encode(owner.facts())) == { "request_id": "r1" }

    finally: owner.close(initial)


async def test_context_fault_json_round_trip_isolated_between_tasks () -> None:

    owner = Context()

    async def run ( number: int ) -> dict[str, Any]:

        packets: list[dict[str, Any]] = []

        def fail () -> None:

            raise Fault(Code.UNAVAILABLE, reason="upstream.busy", retry_after=number, unknown=True)

        async def report ( error: Exception ) -> None:

            await asyncio.sleep(0)
            packet = json.decode(json.encode({ "context": owner.dump(), "error": Fault.wrap(error) }))
            loaded = Fault.load(packet["error"])

            assert loaded.retry_after == number and loaded.unknown and not loaded.safe()
            assert loaded.safe(idempotent=True)
            packets.append(packet)

        with owner.scope(request_id=f"r{number}", tenant=number, actor={ "id": number }, private="local"):

            owner.defer(fail)
            await asyncio.sleep(0)
            assert await owner.flush(report) == 1
            assert owner.need("tenant") == number

        return packets[0]

    packets = await asyncio.gather(*(run(number) for number in range(24)))

    for number, packet in enumerate(packets):

        assert packet["context"] == { "request_id": f"r{number}", "tenant": number, "actor": { "id": number } }

    assert owner.snapshot() == {} and owner.deferred() is None


async def test_failed_json_report_preserves_both_faults_and_remaining_work () -> None:

    owner = Context()
    seen: list[str] = []

    def fail () -> None: raise Fault(Code.UNAVAILABLE, reason="upstream.busy")

    def report ( error: Exception ) -> None:

        json.encode({ "error": error, "unsupported": object() })

    with owner.scope(request_id="r1"):

        owner.defer(fail)
        owner.defer(lambda: seen.append(owner.need("request_id")))

        with pytest.raises(ExceptionGroup) as caught: await owner.flush(report)

        faults = caught.value.exceptions

        assert len(faults) == 2 and all(isinstance(error, Fault) for error in faults)
        assert [cast("Fault", error).reason for error in faults] == ["upstream.busy", "json.encode"]
        assert seen == ["r1"] and await owner.flush() == 0

def test_wire_validation_applies_to_the_copied_mapping () -> None:

    class Changing(UserDict[str, Any]):

        @override
        def items ( self ) -> ItemsView[str, Any]:

            held = dict(self.data)
            self.data["id"] = object()

            return held.items()

    owner = Context()

    with owner.scope(actor=Changing({ "id": 7 })):

        dumped = owner.dump()
        assert dumped == { "actor": { "id": 7 } }
        assert json.decode(json.encode(dumped)) == dumped

def test_wire_mapping_cannot_expand_past_its_declared_budget () -> None:

    class Expanding(Mapping[str, int]):

        def __init__ ( self ) -> None:

            self.read = 0

        @override
        def __len__ ( self ) -> int: return 1

        @override
        def __iter__ ( self ) -> Iterator[str]:

            for index in range(100):

                self.read += 1

                if self.read > 17: raise AssertionError("wire snapshot exceeded its budget")

                yield f"k{index}"

        @override
        def __getitem__ ( self, key: str ) -> int: return int(key[1:])

    held = Context()
    value = Expanding()

    held.load({ "actor": value, "tenant": 7 })

    assert held.dump() == { "tenant": 7 } and value.read == 17
