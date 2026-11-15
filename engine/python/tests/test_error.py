from http import HTTPStatus
from collections import UserDict
from collections.abc import Callable
from types import MappingProxyType
from typing import cast, Any
from concurrent.futures import ProcessPoolExecutor

from engine.error import Bag, Code, Fault
import copy, json, multiprocessing, pytest

def test_every_code_maps_to_one_status_and_message () -> None:

    assert Code.VALIDATION.status() == HTTPStatus.UNPROCESSABLE_CONTENT
    assert Code.TIMEOUT.status() == HTTPStatus.GATEWAY_TIMEOUT
    assert Code.OK.success() and not Code.OK.client()
    assert Code.NOT_FOUND.client() and not Code.NOT_FOUND.server()
    assert Code.INTERNAL.server()
    assert Code.UNAVAILABLE.transient() and not Code.FORBIDDEN.transient()
    assert all(code.message() for code in Code)
    assert Code.of(404) is Code.NOT_FOUND
    assert Code.of(418) is Code.BAD_REQUEST
    assert Code.of(599) is Code.INTERNAL
    assert Code.of(204) is Code.NO_CONTENT and Code.of(299) is Code.OK and Code.of(405) is Code.METHOD_NOT_ALLOWED
    assert Code.of(415) is Code.UNSUPPORTED_MEDIA and Code.of(502) is Code.BAD_GATEWAY and Code.of(501) is Code.NOT_IMPLEMENTED
    assert len({ code.status() for code in Code }) == len(Code) and all(Code.of(code.status()) is code for code in Code)
    assert Code.BAD_GATEWAY.transient() and Code.REQUEST_TIMEOUT.transient() and not Code.NOT_IMPLEMENTED.transient()
    assert Code.parse(" Too-Many Requests ") is Code.TOO_MANY_REQUESTS
    assert Code.parse("nope") is None
    assert Code.parse("nope", Code.INTERNAL) is Code.INTERNAL
    assert Code.OK not in Code.failures()

def test_fault_carries_code_reason_errors_and_status () -> None:

    fault = Fault(Code.VALIDATION, reason="user.email", errors={ "email": ["is taken"] })

    assert fault.status == HTTPStatus.UNPROCESSABLE_CONTENT
    assert fault.message == "The given data is invalid"
    assert fault.errors == { "email": ["is taken"] }
    assert fault.client() and not fault.server()
    assert str(fault) == fault.message
    assert repr(fault) == "Fault(validation, reason='user.email', status=422)"

def test_fault_copies_and_dumps_without_losing_the_cause () -> None:

    cause = ValueError("x")
    fault = Fault.wrap(cause, Code.UNAVAILABLE, reason="peer")

    assert fault.__cause__ is cause
    assert fault.unknown is True
    assert fault.retryable() and not fault.safe() and fault.safe(idempotent=True)
    assert fault.because("other").reason == "other"
    assert fault.saying("Nope").message == "Nope"
    assert fault.copy(retry_after=2.5).retry_after == 2.5
    assert fault.because("x").__cause__ is cause
    assert Fault.wrap(fault) is fault

    moved = Fault(Code.CONFLICT, reason="r", headers={ "Allow": "GET" }).copy(Code.GONE)

    assert (moved.code, moved.status, moved.message, moved.headers) == (Code.GONE, HTTPStatus.GONE, "The resource is gone", { "Allow": "GET" })
    assert Fault(Code.CONFLICT, "Kept").copy(Code.GONE).message == "Kept"

    loaded = Fault.load(fault.dump())

    assert (loaded.code, loaded.reason, loaded.status) == (Code.UNAVAILABLE, "peer", HTTPStatus.SERVICE_UNAVAILABLE)
    assert Fault.load({ "code": "garbage" }).code is Code.INTERNAL

def test_fault_survives_a_copy_and_a_boundary () -> None:

    fault = Fault(
        Code.TOO_MANY_REQUESTS, "Slow down", "edge.busy", { "field": ["a", "b"] }, HTTPStatus.SERVICE_UNAVAILABLE,
        retry_after=1.5, unknown=True, headers={ "Retry-After": "2" },
    )

    for twin in (copy.copy(fault), copy.deepcopy(fault)):

        assert type(twin) is Fault and twin is not fault and str(twin) == "Slow down" and twin.args == ("Slow down",)
        assert (twin.code, twin.message, twin.reason, twin.status) == (
            Code.TOO_MANY_REQUESTS, "Slow down", "edge.busy", HTTPStatus.SERVICE_UNAVAILABLE,
        )
        assert (twin.errors, twin.retry_after, twin.unknown, twin.headers) == (
            { "field": ["a", "b"] }, 1.5, True, { "Retry-After": "2" },
        )
        assert twin.errors is not fault.errors and twin.headers is not fault.headers

    reduced = fault.__reduce__()
    revive, held = reduced[:2]

    assert callable(revive) and revive(*cast("tuple[object, ...]", held)).dump() == fault.dump()

    plain = copy.deepcopy(Fault(Code.NOT_FOUND))

    assert (plain.message, plain.reason, plain.errors, plain.headers) == (Code.NOT_FOUND.message(), None, None, None)
    assert (plain.status, plain.retry_after, plain.unknown) == (HTTPStatus.NOT_FOUND, None, False)

    nested = copy.deepcopy([Fault.wrap(ValueError("x"), reason="deep")])[0]

    assert nested.reason == "deep" and nested.unknown and nested.code is Code.INTERNAL

def test_bag_collects_and_raises () -> None:

    bag = Bag().add("name", "is required").add("name", "is short").extend({ "age": ["is low"] })

    assert bag.has() and bag.has("age") and not bag.has("x")
    assert bag.first("name") == "is required" and bag.first("x") is None
    assert bag.fields() == ("name", "age")
    assert bag.count() == 3 and len(bag) == 2 and bool(bag)
    assert dict(bag) == { "name": ["is required", "is short"], "age": ["is low"] }

    with pytest.raises(Fault) as caught: bag.raise_if_any("signup")

    assert caught.value.reason == "signup" and caught.value.errors == bag.dump()

    Bag().raise_if_any()

    assert bag.text() == "name: is required, is short; age: is low" and Bag().text() == ""

    fault = bag.fault(Code.INTERNAL, "boot")

    assert (fault.code, fault.reason, fault.message, fault.errors) == (Code.INTERNAL, "boot", bag.text(), bag.dump())
    assert Bag().add("a", "b").fault().code is Code.VALIDATION and Bag().fault().message == Code.VALIDATION.message()

@pytest.mark.parametrize("payload", [
    None, [], "error", 42,
    { "errors": { "field": 7 } }, { "errors": { "field": "wrong" } },
    { "errors": { "field": [None] } }, { "errors": { 1: ["wrong"] } },
    { "errors": [] }, { "headers": { "x": 7 } }, { "headers": [] },
    { "message": [] }, { "reason": {} }, { "code": 7 },
    { "status": True }, { "status": "503" }, { "status": 999 },
    { "unknown": 1 }, { "unknown": "false" }, { "unknown": None },
    { "retry_after": -1 }, { "retry_after": True }, { "retry_after": "2" },
    { "retry_after": float("nan") }, { "retry_after": float("inf") }, { "retry_after": 10 ** 400 },
])
def test_loading_malformed_payloads_raises_only_a_typed_fault ( payload: object ) -> None:

    with pytest.raises(Fault) as caught: Fault.load(payload)

    assert caught.value.code is Code.VALIDATION and caught.value.reason == "error.payload"
    assert caught.value.errors and not caught.value.unknown

@pytest.mark.parametrize("code", list(Code))
@pytest.mark.parametrize("unknown", [False, True])
@pytest.mark.parametrize("idempotent", [False, True])
def test_retry_safety_survives_portable_serialization ( code: Code, unknown: bool, idempotent: bool ) -> None:

    made = Fault(code, reason="operation", status=HTTPStatus.SERVICE_UNAVAILABLE, retry_after=0.0, unknown=unknown)
    back = Fault.load(json.loads(json.dumps(made.dump())))

    assert back.dump() == made.dump()
    assert back.safe(idempotent) == (code.transient() and (idempotent or not unknown))
    assert back.status is HTTPStatus.SERVICE_UNAVAILABLE and back.retry_after == 0.0

@pytest.mark.parametrize("payload", [{}, { "code": "unknown" }, { "code": "unavailable" }])
def test_legacy_payloads_do_not_claim_a_known_execution_outcome ( payload: dict[str, object] ) -> None:

    made = Fault.load(payload)

    assert made.unknown and not made.safe()
    assert made.code is (Code.UNAVAILABLE if payload.get("code") == "unavailable" else Code.INTERNAL)

@pytest.mark.parametrize("empty", [None, {}])
def test_copy_can_clear_optional_values_without_changing_the_original ( empty: dict[str, list[str]] | None ) -> None:

    made = Fault(
        Code.UNAVAILABLE, "Custom", "operation", { "field": ["wrong"] }, HTTPStatus.BAD_GATEWAY,
        retry_after=3, unknown=True, headers={ "Retry-After": "3" },
    )
    back = made.copy(message=None, reason=None, errors=empty, retry_after=None, status=None, unknown=False, headers=None)

    assert back.message == Code.UNAVAILABLE.message() and back.reason is None and back.errors is None
    assert back.retry_after is None and back.status is HTTPStatus.SERVICE_UNAVAILABLE
    assert not back.unknown and back.headers is None
    assert (made.message, made.reason, made.retry_after, made.status, made.unknown) == (
        "Custom", "operation", 3, HTTPStatus.BAD_GATEWAY, True,
    )
    assert made.errors == { "field": ["wrong"] } and made.headers == { "Retry-After": "3" }

@pytest.mark.parametrize("transfer", ["dump", "copy", "load"])
def test_fault_owns_mutable_details_at_each_boundary ( transfer: str ) -> None:

    errors = { "field": ["wrong"] }
    headers = { "Retry-After": "2" }
    made = Fault(Code.VALIDATION, errors=errors, headers=headers)

    errors["field"].append("input mutation")
    headers["Retry-After"] = "99"

    assert made.errors == { "field": ["wrong"] } and made.headers == { "Retry-After": "2" }

    payload = made.dump()
    back = made.copy() if transfer == "copy" else Fault.load(payload)
    changed = payload if transfer == "dump" else back.dump()

    cast("dict[str, list[str]]", changed["errors"])["field"].append("output mutation")
    cast("dict[str, str]", changed["headers"])["Retry-After"] = "100"

    assert made.errors == back.errors == { "field": ["wrong"] }
    assert made.headers == back.headers == { "Retry-After": "2" }

    if back.errors is not None: back.errors["field"].append("copy mutation")

    assert made.errors == { "field": ["wrong"] }

def test_fault_copy_preserves_debug_context_without_a_traceback () -> None:

    cause = ValueError("private detail")
    made = Fault.wrap(cause, Code.UNAVAILABLE, "peer")

    made.__context__ = RuntimeError("context")
    made.__suppress_context__ = False
    made.add_note("diagnostic note")

    back = made.copy()

    assert back.__cause__ is cause and back.__context__ is made.__context__
    assert not back.__suppress_context__ and back.__traceback__ is None
    assert back.__notes__ == made.__notes__ == ["diagnostic note"]

    back.add_note("another")

    assert made.__notes__ == ["diagnostic note"] and "private detail" not in str(back)

def test_fault_crosses_a_spawn_process_with_operational_state_and_notes () -> None:

    made = Fault(Code.UNAVAILABLE, reason="peer", retry_after=2, unknown=True, headers={ "Retry-After": "2" })

    made.add_note("diagnostic note")

    with ProcessPoolExecutor(max_workers=1, mp_context=multiprocessing.get_context("spawn")) as pool:

        back = pool.submit(copy.copy, made).result(timeout=15)

    assert back.dump() == made.dump() and back.__notes__ == made.__notes__
    assert back.unknown and not back.safe() and back.safe(idempotent=True)

def test_bag_empty_fields_never_create_a_phantom_error () -> None:

    bag = Bag({ "empty": [] }).extend({ "also_empty": [] })

    assert not bag and not bag.has() and bag.count() == len(bag) == 0 and bag.fields() == ()

    bag.raise_if_any()
    bag.add("field", "").extend({ "field": [], "another": ["wrong"] })

    assert bag.has("field") and bag.count() == 2 and len(bag) == 2

def test_bag_snapshots_and_raised_faults_are_independent () -> None:

    source = { "field": ["one"] }
    bag = Bag(source)

    source["field"].append("outside")

    snapshot = bag.dump()
    snapshot["field"].append("outside")
    fault = bag.fault()

    with pytest.raises(Fault) as caught: bag.raise_if_any()

    bag.add("field", "two")

    assert fault.errors == caught.value.errors == { "field": ["one"] }
    assert bag.dump() == { "field": ["one", "two"] }

@pytest.mark.parametrize("duplicate", [copy.copy, copy.deepcopy])
def test_standard_copy_keeps_independent_diagnostic_notes ( duplicate: Callable[[Fault], Fault] ) -> None:

    made = Fault(Code.INTERNAL)

    made.add_note("original")

    twin = duplicate(made)

    twin.add_note("copy")

    assert made.__notes__ == ["original"] and twin.__notes__ == ["original", "copy"]

@pytest.mark.parametrize("status", [-1, 0, 99, 600, 999, True, False, 404.0, float("nan"), "404", None, []])
def test_invalid_status_never_becomes_a_success ( status: object ) -> None:

    assert Code.of(cast("int", status)) is Code.INTERNAL

def test_status_classes_and_exact_codes_have_predictable_defaults () -> None:

    known = { int(code.status()): code for code in Code }

    for status in range(100, 600):

        expected = Code.INTERNAL if status >= 500 else Code.BAD_REQUEST if status >= 400 else Code.OK

        assert Code.of(status) is known.get(status, expected)

    assert Code.of(HTTPStatus.NOT_FOUND) is Code.NOT_FOUND

@pytest.mark.parametrize("code", list(Code))
def test_code_text_round_trips_with_explicit_fallbacks ( code: Code ) -> None:

    assert Code.parse(code.value) is code
    assert Code.parse(f" {code.value.upper().replace('_', '-')} ") is code
    assert Code.parse("", code) is code and Code.parse("not-a-code", code) is code

@pytest.mark.parametrize("code", [None, Code.NOT_FOUND, Code.UNAVAILABLE])
@pytest.mark.parametrize("message", [None, "", "Custom"])
def test_copy_resolves_code_message_and_status_consistently ( code: Code | None, message: str | None ) -> None:

    original = Fault(Code.NOT_FOUND, message, status=HTTPStatus.GONE)
    copied = original.copy(code)
    chosen = code or Code.NOT_FOUND

    assert copied.code is chosen and copied.status is (chosen.status() if code is not None else HTTPStatus.GONE)
    assert copied.message == ("Custom" if message == "Custom" else chosen.message())
    assert copied.args == (copied.message,) and str(copied) == copied.message
    assert original.status is HTTPStatus.GONE
    assert original.copy(message="").message == Code.NOT_FOUND.message()
    assert original.copy(reason="").reason == ""
    assert original.copy(headers={}).headers is None
    assert original.copy(retry_after=0).retry_after == 0

def test_load_supports_read_only_and_user_mappings_without_aliases () -> None:

    errors = { "field": ["wrong"] }
    headers = { "Retry-After": "2" }
    payload: dict[str, object] = {
        "code": "unavailable", "message": "", "reason": "", "status": HTTPStatus.SERVICE_UNAVAILABLE,
        "errors": UserDict(errors), "headers": MappingProxyType(headers), "retry_after": 0, "unknown": False,
        "future_field": {"ignored": True},
    }

    for wrapped in (payload, UserDict(payload), MappingProxyType(payload)):

        made = Fault.load(wrapped)

        assert made.message == Code.UNAVAILABLE.message() and made.reason == ""
        assert made.status is HTTPStatus.SERVICE_UNAVAILABLE and made.retry_after == 0 and made.safe()
        assert made.errors == errors and made.headers == headers
        assert made.errors is not errors and made.headers is not headers

        if made.errors is not None: made.errors["field"].append("copy")

        assert errors == { "field": ["wrong"] }

@pytest.mark.parametrize(("field", "value"), [
    ("errors", MappingProxyType({"field": "wrong"})),
    ("headers", UserDict({"Retry-After": 1})),
])
def test_load_checks_non_dict_mappings_too ( field: str, value: object ) -> None:

    with pytest.raises(Fault) as caught: Fault.load({ field: value })

    assert caught.value.reason == "error.payload" and caught.value.errors == { field: ["has an invalid value"] }

@pytest.mark.parametrize("delay", [-1, float("nan"), float("inf"), -float("inf"), True, "later", 10**10000], ids=["negative", "nan", "infinity", "negative-infinity", "boolean", "text", "overflow"])
def test_constructor_and_copy_validate_retry_delay ( delay: Any ) -> None:

    with pytest.raises(Fault) as fresh: Fault(Code.UNAVAILABLE, retry_after=delay)
    with pytest.raises(Fault) as copied: Fault(Code.UNAVAILABLE).copy(retry_after=delay)

    assert fresh.value.reason == copied.value.reason == "error.payload"
    assert fresh.value.errors == { "retry_after": ["has an invalid value"] }

@pytest.mark.parametrize("delay", [0, 1, 0.5, 1e100])
def test_retry_delay_is_normalized_consistently ( delay: float ) -> None:

    original = Fault(Code.UNAVAILABLE, retry_after=delay, unknown=True)
    loaded = Fault.load(original.dump())
    copied = original.copy()

    assert original.retry_after == copied.retry_after == loaded.retry_after == delay
    assert type(original.retry_after) is float


def test_copy_rejects_invalid_delay_without_changing_original () -> None:

    original = Fault(Code.UNAVAILABLE, retry_after=1.5)

    with pytest.raises(Fault): original.copy(retry_after=-1)

    assert original.retry_after == 1.5
