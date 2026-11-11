from engine.error import Code, Fault
from engine.sms import Sms, Text
from engine.sms.arch import ADDRESS, CHANNELS, MAX_TEXT
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any

EXAMPLES = 1500
PHONES   = st.one_of(st.text(max_size=20), st.sampled_from(["+201099000000", "+1 650 555 0100", "0020 109 900 0000", "12", "+", "", "x" * 33]), st.none(), st.integers())
BODIES   = st.one_of(st.text(max_size=40), st.just("x" * MAX_TEXT), st.just("x" * (MAX_TEXT + 1)), st.just(""), st.none())
CHANNELS_ = st.one_of(st.sampled_from([*sorted(CHANNELS), "fax", "", "SMS"]), st.none())
SENDERS  = st.one_of(st.none(), st.text(max_size=12), st.just("x" * (ADDRESS + 1)), st.integers())
service  = Sms()

def tried ( work: Any ) -> Any:

    try: return work()
    except Fault as fault: return fault

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(PHONES, BODIES, CHANNELS_, SENDERS)
def texted ( to: Any, body: Any, channel: Any, sender: Any ) -> None:

    made = tried(lambda: Text(to, body, channel, sender))

    if isinstance(made, Fault):

        assert made.code is Code.VALIDATION
        assert made.reason in ("sms.text", "sms.channel")

        return

    assert 0 < len(made.to) <= ADDRESS
    assert 0 < len(made.body) <= MAX_TEXT
    assert made.channel in CHANNELS
    assert made.dump() == { "to": to, "body": body, "channel": channel, "sender": sender }

    composed = tried(lambda: service.compose(to, body, channel))

    if isinstance(composed, Fault): assert composed.reason in ("sms.text", "sms.channel")
    else:

        assert composed.to.startswith("+")
        assert composed.body == body

texted()

print(f"fuzz sms  examples={EXAMPLES}  ok")
