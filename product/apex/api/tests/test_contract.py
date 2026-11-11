from contract import MESSAGES, ROLES, SCOPES, SERVICES, Boundary, Role, Topology, layer_of, may_call, may_emit
from engine.error import Code, Fault
from engine.json import json
import pytest

def test_services_form_layers_and_calls_go_down_events_go_up () -> None:

    assert [SERVICES[name].layer for name in ("gateway", "iam", "hello", "notify")] == [0, 1, 2, 3]
    assert may_call("gateway", "iam") and may_call("iam", "hello") and not may_call("hello", "iam")
    assert may_emit("hello", "iam") and not may_emit("gateway", "hello")
    assert layer_of("hello") == 2

    with pytest.raises(Fault): layer_of("nope")

def test_roles_scopes_and_shared_messages_speak_both_languages () -> None:

    assert Role.ADMIN in ROLES and SCOPES[Role.SUPER] == ("*",)

    en = json.decode((MESSAGES / "en.json").read_bytes())
    ar = json.decode((MESSAGES / "ar.json").read_bytes())

    assert set(en["reasons"]) == set(ar["reasons"]) and "auth.missing" in en["reasons"]
    assert set(ar["codes"]) == { code.value for code in Code } and ar["reasons"]["relay.signature"] == "توقيع البوابة غير صحيح"

def test_topology_refuses_upward_calls_and_unnamed_idempotency () -> None:

    good = Topology.declare([Boundary("gateway", "iam", "POST", "/sessions", "anonymous", "session.start", "Session", "Pair", idempotency="email")])
    bad  = Topology.declare([
        Boundary("hello", "iam", "GET", "/me", "actor", "users.read", "-", "User"),
        Boundary("gateway", "hello", "POST", "hello", "actor", "", "Name", "Greeting"),
        Boundary("gateway", "nope", "FETCH", "/x", "actor", "x", "-", "-"),
    ])

    assert good.issues() == [] and good.callees() == ("iam",) and len(good.of("gateway")) == 1
    assert bad.issues() == [
        "hello -> iam: a call must go to a larger layer",
        "hello: an unsafe call names its idempotency identity",
        "hello: a path starts with /",
        "hello: a boundary states its scope",
        "nope: unknown callee",
        "/x: unknown method FETCH",
    ]
