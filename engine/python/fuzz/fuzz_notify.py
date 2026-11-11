from engine.error import Code, Fault
from engine.notify import Notice, Notify
from engine.notify.arch import BADGE, BODY, FACT, FACTS, MAX_TOKENS, SOUND, TITLE, TOKEN
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any

EXAMPLES = 1200
TOKENS   = st.one_of(st.lists(st.one_of(st.text(max_size=12), st.just("x" * (TOKEN + 1)), st.just("a b")), max_size=6), st.text(max_size=6), st.none(), st.just(["t"] * (MAX_TOKENS + 1)))
TEXTS    = st.one_of(st.text(max_size=20), st.just("x" * (TITLE + 1)), st.just("x" * (BODY + 1)), st.none(), st.integers())
FACTED   = st.one_of(st.none(), st.dictionaries(st.text(max_size=6), st.one_of(st.text(max_size=6), st.integers()), max_size=4), st.just({ f"k{at}": "v" for at in range(FACTS + 1) }), st.lists(st.integers(), max_size=1))
BADGES   = st.one_of(st.none(), st.integers(-2, BADGE + 2), st.booleans(), st.text(max_size=2))
SOUNDS   = st.one_of(st.none(), st.text(max_size=8), st.just("x" * (SOUND + 1)))
service  = Notify()

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(TOKENS, TEXTS, TEXTS, FACTED, BADGES, SOUNDS, st.booleans())
def noticed ( tokens: Any, title: Any, body: Any, data: Any, badge: Any, sound: Any, urgent: bool ) -> None:

    made = tried(lambda: Notice(tuple(tokens) if isinstance(tokens, list) else tokens, title, body, data if data is not None else {}, badge, sound, urgent))

    if isinstance(made, Fault):

        assert made.code is Code.VALIDATION
        assert made.reason in ("notify.notice", "notify.tokens")
        assert made.errors is not None

        return

    assert 0 < len(made.tokens) <= MAX_TOKENS
    assert len(set(made.tokens)) == len(made.tokens)
    assert 0 < len(made.title) <= TITLE
    assert len(made.body) <= BODY
    assert len(made.data) <= FACTS
    assert all(len(key) <= FACT and len(value) <= FACT for key, value in made.data.items())
    assert made.badge is None or 0 <= made.badge <= BADGE
    assert made.dump()["tokens"] == list(made.tokens)

    composed = tried(lambda: service.compose(tokens, title, body, data, badge=badge, sound=sound, urgent=urgent))

    assert not isinstance(composed, Fault) or composed.reason in ("notify.notice", "notify.tokens")

noticed()

print(f"fuzz notify  examples={EXAMPLES}  ok")
