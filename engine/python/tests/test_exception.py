from collections.abc import Callable, Iterator, Mapping
from functools import partial
from typing import Any, cast, override

from engine.error import Code, Fault
from engine.exception import Exceptions
from engine.log import log
import asyncio, gc, math, pytest, time

class Declined(Exception): ...

class Expired(Declined): ...

def reason ( work: Callable[[], object] ) -> str | None:

    with pytest.raises(Fault) as caught: work()

    assert caught.value.code is Code.INTERNAL

    return caught.value.reason

def test_defaults_map_only_what_they_can_name_and_everything_else_is_internal () -> None:

    exceptions = Exceptions()

    assert exceptions.fault(TimeoutError()).code is Code.TIMEOUT and exceptions.fault(TimeoutError()).unknown
    assert exceptions.fault(ConnectionRefusedError()).code is Code.UNAVAILABLE
    assert exceptions.fault(NotImplementedError()).code is Code.NOT_IMPLEMENTED
    assert exceptions.fault(KeyError("k")).code is Code.INTERNAL and exceptions.fault(KeyError("k")).reason == "keyerror"
    assert exceptions.fault(PermissionError()).code is Code.INTERNAL
    assert exceptions.fault(asyncio.CancelledError()).code is Code.INTERNAL

    fault = Fault(Code.CONFLICT)

    assert exceptions.fault(fault) is fault and exceptions.fault(ValueError("v")).__cause__ is not None

def test_a_map_follows_the_class_ladder_and_the_nearest_wins () -> None:

    exceptions = Exceptions()

    exceptions.map(Declined, Code.PAYMENT_REQUIRED, "payment.declined")

    assert exceptions.fault(Expired()).reason == "payment.declined" and exceptions.fault(Expired()).status == 402

    exceptions.map(Expired, lambda error: Fault(Code.GONE, reason="payment.expired", errors={ "card": [type(error).__name__] }))

    assert exceptions.fault(Expired()).errors == { "card": ["Expired"] } and exceptions.fault(Declined()).code is Code.PAYMENT_REQUIRED
    assert "Declined" in exceptions.describe()["maps"] and "TimeoutError" in exceptions.describe()["maps"]

    known = Fault(Code.CONFLICT)

    exceptions.map(Exception, Code.LOCKED)

    assert exceptions.fault(known) is known and exceptions.fault(ValueError("v")).reason == "exception"
    assert exceptions.fault(Declined()).code is Code.PAYMENT_REQUIRED and exceptions.fault(TimeoutError()).code is Code.TIMEOUT

def test_handle_reports_once_at_the_level_the_fault_deserves () -> None:

    exceptions = Exceptions()
    seen: list[str] = []

    log.setup("debug", "json")
    exceptions.report(lambda fault, error: seen.append(f"{fault.code.value}:{type(error).__name__}"))
    exceptions.context(lambda: { "tenant": "t1" })

    with log.capture() as events:

        boom  = RuntimeError("boom")
        fault = exceptions.handle(boom)

        assert fault.server() and events[-1]["event"] == "exception" and events[-1]["level"] == "error"
        assert events[-1]["kind"] == "RuntimeError" and events[-1]["tenant"] == "t1" and "exception" in events[-1]

        exceptions.handle(boom)

        assert len(events) == 1 and seen == ["internal:RuntimeError"]

        exceptions.handle(ConnectionResetError())

        assert events[-1]["level"] == "warning" and "exception" not in events[-1]

        exceptions.handle(Fault(Code.NOT_FOUND))

        assert events[-1]["event"] == "fault" and events[-1]["level"] == "debug"

        exceptions.level(Code.NOT_FOUND, "info")
        exceptions.handle(Fault(Code.NOT_FOUND))

        assert events[-1]["level"] == "info"

    assert exceptions.stats() == { "seen": 5, "reported": 4, "muted": 0, "codes": { "internal": 2, "unavailable": 1, "not_found": 2 } }

    shared = Fault(Code.GONE, reason="shared")

    exceptions.map(Declined, lambda _: shared)

    with log.capture() as events:

        assert exceptions.handle(Declined()) is shared and exceptions.handle(Expired()) is shared
        assert exceptions.handle(shared) is shared and [event["reason"] for event in events] == ["shared"]

    assert seen == ["internal:RuntimeError", "unavailable:ConnectionResetError", "not_found:Fault", "not_found:Fault", "gone:Declined"]

def test_ignored_and_throttled_errors_never_flood_the_log () -> None:

    exceptions = Exceptions()

    log.setup("debug", "json")
    exceptions.ignore(Declined)
    exceptions.throttle(2, 60)

    with log.capture() as events:

        exceptions.handle(Expired())

        assert events == []

        for _ in range(5): exceptions.handle(RuntimeError("same"))

        assert len(events) == 2 and exceptions.stats()["muted"] == 3

        exceptions.throttle(2, 60)
        exceptions.handle(RuntimeError("same"))

        assert len(events) == 3 and exceptions.stats()["muted"] == 3

    def sink ( fault: Fault, error: BaseException ) -> None: raise ValueError("sink")

    exceptions.report(sink)

    with log.capture() as events:

        exceptions.handle(ZeroDivisionError())

        assert events[-1]["event"] == "exception.reporter"

def test_safe_returns_the_fallback_and_clear_restores_the_defaults () -> None:

    exceptions = Exceptions()

    def broken () -> int: raise ValueError("x")

    assert exceptions.safe(7, broken) == 7 and exceptions.safe(7, lambda: 8) == 8
    assert exceptions.stats() == { "seen": 1, "reported": 1, "muted": 0, "codes": { "internal": 1 } }

    exceptions.map(Declined, Code.GONE)
    exceptions.clear()

    assert exceptions.stats()["seen"] == 0 and exceptions.fault(Declined()).code is Code.INTERNAL
    assert exceptions.fault(TimeoutError()).code is Code.TIMEOUT

def test_setup_verbs_refuse_what_they_cannot_hold () -> None:

    exceptions = Exceptions()

    async def late ( *_: object ) -> Any: return {}

    def told ( fault: Fault, error: BaseException ) -> None: del fault, error

    def facts () -> dict[str, Any]: return {}

    for kind in (int, "Declined", Declined(), None):

        assert reason(partial(exceptions.map, cast("Any", kind), Code.GONE)) == "exception.map"
        assert reason(partial(exceptions.ignore, Declined, cast("Any", kind))) == "exception.ignore"

    for target in (5, "gone", None, late):

        assert reason(partial(exceptions.map, Declined, cast("Any", target))) == "exception.map"

    for named in ("", "r" * 65, 5, b"gone"):

        assert reason(partial(exceptions.map, Declined, Code.GONE, cast("Any", named))) == "exception.map"

    for code, level in ((Code.GONE, "loud"), (Code.GONE, 5), (Code.GONE, 10 ** 5000), ("gone", "info"), (None, "info")):

        assert reason(partial(exceptions.level, cast("Any", code), cast("Any", level))) == "exception.level"

    with pytest.raises(Fault) as loud: exceptions.level(Code.GONE, "l" * 500)

    assert loud.value.errors == { "level": ["l" * 64] }

    for work in (5, None, "sink", late):

        assert reason(partial(exceptions.report, cast("Any", work))) == "exception.report"
        assert reason(partial(exceptions.context, cast("Any", work))) == "exception.context"

    spans = ((2, -1), (2, math.nan), (2, math.inf), (2, "60"), (2, None), (2, 10 ** 5000), (2, True))

    for burst, window in ((-1, 1), (True, 1), (1.5, 1), ("2", 1), *spans):

        assert reason(partial(exceptions.throttle, cast("Any", burst), cast("Any", window))) == "exception.throttle"

    assert exceptions.describe()["maps"] == ["ConnectionError", "NotImplementedError", "TimeoutError"]
    assert exceptions.describe()["ignored"] == [] and exceptions.describe()["levels"] == {}
    assert exceptions.describe()["throttle"] == { "burst": 0, "window": 0.0 }

    exceptions.ignore(Declined, Declined)
    exceptions.ignore(Expired)
    exceptions.report(told)
    exceptions.report(told)
    exceptions.context(facts)
    exceptions.context(facts)
    exceptions.level(Code.NOT_FOUND, "info")
    exceptions.level(Code.GONE, "warning")
    exceptions.throttle(3, 5)

    described = exceptions.describe()

    assert described["ignored"] == ["Declined", "Expired"] and described["reporters"] == 1 and described["contexts"] == 1
    assert list(described["levels"].items()) == [("gone", "warning"), ("not_found", "info")]
    assert described["throttle"] == { "burst": 3, "window": 5.0 } and described["seen"] == 0

    exceptions.map(Declined, Code.GONE, "r" * 64)

    assert exceptions.fault(Declined()).reason == "r" * 64

def test_a_broken_factory_falls_back_to_the_wrapped_fault () -> None:

    exceptions = Exceptions()

    log.setup("debug", "json")

    def raising ( error: BaseException ) -> Fault: raise KeyError(type(error).__name__)

    async def late () -> Fault: return Fault(Code.GONE)

    exceptions.map(Declined, raising)
    exceptions.map(Expired, cast("Any", lambda _: "gone"))
    exceptions.map(LookupError, cast("Any", lambda _: late()))

    with log.capture() as events:

        for error, kind in ((Declined(), "KeyError"), (Expired(), "str"), (KeyError("k"), "coroutine")):

            fault = exceptions.fault(error)

            assert fault.code is Code.INTERNAL and fault.unknown and fault.__cause__ is error
            assert fault.reason == type(error).__name__.lower()
            assert events[-1]["event"] == "exception.factory" and events[-1]["kind"] == kind

        gc.collect()

        assert len(events) == 3 and exceptions.handle(Declined()).reason == "declined"

    root  = Fault(Code.CONFLICT, reason="root")
    known = Fault(Code.GONE, reason="known")
    tied  = Fault(Code.GONE, reason="tied")

    known.__cause__ = root

    def chained () -> Declined:

        try: raise root
        except Fault as cause:

            failed = Declined()

            failed.__cause__ = cause

            return failed

    def give ( made: Fault, _: BaseException ) -> Fault: return made

    for made, cause in ((root, None), (known, root), (tied, "error")):

        error = chained()

        exceptions.map(Declined, partial(give, made))

        assert exceptions.fault(error) is made and made.__cause__ is (error if cause == "error" else cause)

    inner = Fault(Code.CONFLICT, reason="inner")
    outer = Declined()

    outer.__context__ = inner

    exceptions.map(Declined, partial(give, inner))

    assert exceptions.fault(outer) is inner and inner.__cause__ is None

def test_context_fields_never_override_the_report_and_a_broken_provider_is_skipped () -> None:

    exceptions = Exceptions()
    seen: list[str] = []

    log.setup("debug", "json")

    def broken () -> dict[str, Any]: raise RuntimeError("provider")

    async def late () -> dict[str, Any]: return { "late": 1 }

    def stray ( *_: object ) -> object: return late()

    class Crooked(Mapping[str, int]):

        @override
        def __getitem__ ( self, name: str ) -> int: return len(name)

        @override
        def __iter__ ( self ) -> Iterator[str]: raise ZeroDivisionError

        @override
        def __len__ ( self ) -> int: return 1

    exceptions.context(lambda: { "code": "ok", "reason": "fine", "kind": "None", "status": 200, "level": "debug", "event": "x" })
    exceptions.context(lambda: cast("Any", { "exc_info": True, "exception": "x", "tenant": "t1", 5: "five", None: 1, ("a",): 2 }))
    exceptions.context(broken)
    exceptions.context(cast("Any", lambda: ["tenant"]))
    exceptions.context(cast("Any", stray))
    exceptions.context(Crooked)
    exceptions.context(lambda: { "tenant": "t2", "actor": "a1" })
    exceptions.context(lambda: { f"k{index}": index for index in range(200) })
    exceptions.context(lambda: { "tenant": "t3", "fresh": 1, "self": "s", "method_name": "m", "stack_info": True, "exception": "x" })
    exceptions.report(lambda fault, error: seen.append(f"{fault.reason}:{type(error).__name__}"))
    exceptions.report(stray)

    with log.capture() as events:

        fault = exceptions.handle(ValueError("v"))

        gc.collect()

    skipped = [event["kind"] for event in events if event["event"] == "exception.context"]
    report  = next(event for event in events if event["event"] == "exception")

    assert skipped == ["RuntimeError", "list", "coroutine", "ZeroDivisionError"] and seen == ["valueerror:ValueError"]
    assert (report["code"], report["reason"], report["kind"], report["status"]) == ("internal", "valueerror", "ValueError", 500)
    assert report["level"] == "error" and "exception" in report and fault.reason == "valueerror"
    assert report["tenant"] == "t3" and report["actor"] == "a1" and all(type(name) is str for name in report)
    assert not { "fresh", "self", "method_name", "stack_info", "stack" } & set(report) and report["exception"] == "ValueError: v"
    assert [name for name in report if name[1:].isdigit()] == [f"k{index}" for index in range(58)] and "5" not in report
    assert exceptions.stats() == { "seen": 1, "reported": 1, "muted": 0, "codes": { "internal": 1 } }

def test_a_throttle_window_reopens_and_counts_each_kind_apart ( monkeypatch: pytest.MonkeyPatch ) -> None:

    exceptions = Exceptions()
    now        = 100.0

    log.setup("debug", "json")
    monkeypatch.setattr(time, "monotonic", lambda: now)
    exceptions.throttle(2, 10)

    with log.capture() as events:

        for _ in range(4): exceptions.handle(RuntimeError("same"))
        for _ in range(3): exceptions.handle(KeyError("other"))

        exceptions.handle(Fault(Code.INTERNAL, reason="runtimeerror"))

        assert len(events) == 5 and exceptions.stats()["muted"] == 3

        now = 109.9

        exceptions.handle(RuntimeError("same"))

        assert len(events) == 5 and exceptions.stats()["muted"] == 4

        now = 110.0

        for _ in range(3): exceptions.handle(RuntimeError("same"))

        assert len(events) == 7 and exceptions.stats() == { "seen": 12, "reported": 7, "muted": 5, "codes": { "internal": 12 } }

        exceptions.throttle(0, 10)

        for _ in range(3): exceptions.handle(RuntimeError("same"))

        assert len(events) == 10

        exceptions.throttle(1, 0)

        for _ in range(3): exceptions.handle(RuntimeError("same"))

        assert len(events) == 13 and exceptions.stats()["muted"] == 5

        exceptions.throttle(1, 10 ** 300)
        exceptions.handle(Fault(Code.NOT_FOUND, reason="first"))
        exceptions.handle(Fault(Code.NOT_FOUND, reason="first"))

        assert len(events) == 14 and exceptions.stats()["muted"] == 6

        for index in range(1024): exceptions.handle(Fault(Code.NOT_FOUND, reason=f"r{index}"))

        exceptions.handle(Fault(Code.NOT_FOUND, reason="r1023"))
        exceptions.handle(Fault(Code.NOT_FOUND, reason="first"))

        assert len(events) == 14 + 1024 + 1 and exceptions.stats()["muted"] == 7

        for index in range(1022): exceptions.handle(Fault(Code.NOT_FOUND, reason=f"s{index}"))

        exceptions.handle(Fault(Code.NOT_FOUND, reason="s0"))
        exceptions.handle(Fault(Code.NOT_FOUND, reason="s1"))

        assert len(events) == 14 + 1024 + 1 + 1022 and exceptions.stats()["muted"] == 9

def test_a_quiet_level_reports_nothing_and_counts_everything () -> None:

    exceptions = Exceptions()

    log.setup("error", "json")
    exceptions.throttle(1, 60)

    with log.capture() as events:

        for _ in range(3): exceptions.handle(Fault(Code.NOT_FOUND))
        for _ in range(3): exceptions.handle(ConnectionResetError())

        assert events == [] and exceptions.stats() == { "seen": 6, "reported": 0, "muted": 0, "codes": { "not_found": 3, "unavailable": 3 } }

        exceptions.level(Code.NOT_FOUND, "critical")
        exceptions.handle(Fault(Code.NOT_FOUND))
        exceptions.handle(Fault(Code.NOT_FOUND))

        assert [event["level"] for event in events] == ["critical"] and "exception" not in events[0]
        assert exceptions.stats()["muted"] == 1

        told: list[str] = []

        exceptions.report(lambda fault, _: told.append(fault.code.value))
        exceptions.handle(Fault(Code.GONE))
        exceptions.handle(Fault(Code.GONE))

        assert told == ["gone"] and len(events) == 1 and exceptions.stats()["reported"] == 2

        exceptions.level(Code.INTERNAL, "critical")
        exceptions.handle(RuntimeError("deep"))

        assert events[-1]["level"] == "critical" and "exception" in events[-1] and told == ["gone", "internal"]

    log.setup("debug", "json")
