from engine.domain import Domains, Record
from engine.domain.arch import HOST, KINDS, NAME, VALUE, WEEK
from engine.error import Code, Fault
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any

EXAMPLES = 1500
WORDS    = st.one_of(st.text(max_size=24), st.sampled_from(["shop.io", "Shop.Example.IO.", "متجر.مصر", "localhost", "a.example.com", "-a.io", "a..b", "x" * 300, "_engine-verify.shop.io", "127.0.0.1", "a.b.c.d.e.f.g.h.io"]))
KINDLY   = st.one_of(st.sampled_from([*sorted(KINDS), *[kind.lower() for kind in KINDS], "PTR", ""]), st.text(max_size=5), st.none())
VALUES   = st.one_of(st.text(max_size=40), st.just("x" * (VALUE + 1)), st.integers(), st.none())
TTLS     = st.one_of(st.integers(-5, WEEK + 5), st.floats(), st.text(max_size=3), st.none(), st.booleans())
domains  = Domains()

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WORDS)
def normalized ( host: Any ) -> None:

    made = tried(lambda: domains.normalize(host))

    if isinstance(made, Fault):

        assert made.code is Code.VALIDATION
        assert made.reason == "domain.host"
        assert made.errors is not None
        assert len(made.errors["host"][0]) <= 64

        return

    assert type(made) is str
    assert made.isascii()
    assert made == made.lower()
    assert HOST.match(made)
    assert domains.normalize(made) == made
    assert domains.apex(made).count(".") == 1
    assert domains.challenge(made).name == f"_engine-verify.{made}"

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WORDS, KINDLY, VALUES, TTLS)
def recorded ( name: Any, kind: Any, value: Any, ttl: Any ) -> None:

    made = tried(lambda: Record(name, kind, value, ttl))

    if isinstance(made, Fault):

        assert made.code is Code.VALIDATION
        assert made.reason == "domain.record"
        assert made.errors is not None
        assert made.errors["record"][0] in ("name", "kind", "value", "ttl")

        return

    assert NAME.match(made.name)
    assert made.kind in KINDS
    assert 0 < len(made.value) <= VALUE
    assert 0 <= made.ttl <= WEEK
    assert made.dump() == { "name": name, "kind": made.kind, "value": value, "ttl": ttl }

normalized()
recorded()

print(f"fuzz domain  examples={EXAMPLES * 2}  ok")
