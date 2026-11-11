from engine.broadcast import Broadcast
from engine.broadcast.arch import NAME, PAYLOAD
from engine.error import Code, Fault
from engine.json import json
from engine.log import log
from engine.socket import Hub, Socket
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any
import asyncio

EXAMPLES = 800
LEAVES   = st.one_of(st.none(), st.booleans(), st.integers(-(1 << 62), 1 << 62), st.floats(allow_nan=False, allow_infinity=False), st.text(max_size=12))
BODIES   = st.recursive(LEAVES, lambda inner: st.one_of(st.lists(inner, max_size=3), st.dictionaries(st.text(max_size=6), inner, max_size=3)), max_leaves=10)
NAMES    = st.one_of(st.text(max_size=8), st.sampled_from(["room", "", "a\nb", "x" * (NAME + 1), "news"]), st.integers(-(1 << 62), 1 << 62), st.none())
PAYLOADS = st.one_of(
    st.binary(max_size=40),
    st.builds(json.encode, st.fixed_dictionaries({}, optional={ "channel": NAMES, "event": NAMES, "data": BODIES, "worker": st.one_of(st.text(max_size=4), st.none()) })),
    st.builds(json.encode, BODIES),
)

loop  = asyncio.new_event_loop()
hub   = Hub(100)
local = Broadcast()

class Quiet:

    def __init__ ( self ) -> None:

        self.frames: list[dict[str, Any]] = []

    async def send ( self, text: str ) -> None:

        self.frames.append(dict(json.decode(text)))

    async def close ( self, *_: object ) -> None:

        return None

log.setup("error", "json", Path("/dev/null"))
local.setup(hub)

pipe   = Quiet()
member = Socket("s1", pipe, "u1")

hub.add(member)
hub.join(member, "room")

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

def tried ( work: Any ) -> Any:

    try: return run(work)
    except Fault as fault: return fault

def named ( value: object ) -> bool:

    return type(value) is str and 0 < len(value) <= NAME and value.isprintable()

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(PAYLOADS)
def relayed ( raw: bytes ) -> None:

    before = dict(local.stats())
    seen   = len(pipe.frames)
    made   = run(local.relay(raw))
    after  = local.stats()

    try: payload = json.decode(raw) if len(raw) <= PAYLOAD else None
    except Fault: payload = None

    shaped: dict[str, Any] = payload if isinstance(payload, dict) else {}
    sound  = bool(shaped) and named(shaped.get("channel")) and named(shaped.get("event"))
    sound  = sound and (shaped.get("data") is None or isinstance(shaped.get("data"), dict))
    mine   = bool(shaped) and shaped.get("worker") == local.describe()["worker"]

    if mine: assert (made, after) == (False, before)
    elif sound:

        assert made is True
        assert after["relayed"] == before["relayed"] + 1
        assert len(pipe.frames) == seen + (1 if shaped["channel"] == "room" else 0)

    else:

        assert made is False
        assert after["dropped"] == before["dropped"] + 1
        assert len(pipe.frames) == seen

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NAMES, NAMES, st.one_of(st.none(), st.dictionaries(st.text(max_size=4), LEAVES, max_size=3), st.lists(LEAVES, max_size=2), st.text(max_size=4)))
def published ( channel: Any, event: Any, data: Any ) -> None:

    seen = len(pipe.frames)
    made = tried(local.publish(channel, event, data))

    if isinstance(made, Fault):

        assert made.code is Code.VALIDATION
        assert made.reason in ("broadcast.channel", "broadcast.event", "broadcast.data")
        assert not (named(channel) and named(event) and (data is None or isinstance(data, dict)))
        assert len(pipe.frames) == seen

        return

    assert made == (1 if channel == "room" else 0)
    assert len(pipe.frames) == seen + made

relayed()
published()

run(local.close())
loop.close()
log.close()

print(f"fuzz broadcast  examples={EXAMPLES * 2}  ok")
