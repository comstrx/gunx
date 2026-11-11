from http import HTTPStatus
from typing import cast

from engine.error import Bag, Code, Fault
import copy, pytest

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

    revive, held = fault.__reduce__()

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
