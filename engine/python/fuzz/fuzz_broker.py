from engine.broker import Broker, Memory, Message
from engine.error import Code, Fault
from engine.log import log
from hypothesis import HealthCheck, given, settings, strategies as st
from pathlib import Path
from typing import Any
import asyncio, fnmatch

EXAMPLES = 800
LABEL    = st.from_regex(r"[a-z]{1,4}", fullmatch=True)
TOPICS   = st.lists(LABEL, min_size=1, max_size=3).map(".".join)
PATTERNS = st.lists(st.one_of(LABEL, st.just("*"), st.just("#")), min_size=1, max_size=3).map(".".join)
LEAVES   = st.one_of(st.none(), st.booleans(), st.integers(-(1 << 62), 1 << 62), st.text(max_size=8))

loop = asyncio.new_event_loop()

log.setup("error", "json", Path("/dev/null"))

def run ( work: Any ) -> Any:

    try: return loop.run_until_complete(work)
    except Fault as fault: return fault

def routed ( topic: str, pattern: str ) -> bool:

    return fnmatch.fnmatchcase(topic, pattern.replace("#", "*"))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.dictionaries(st.from_regex(r"q[a-c]", fullmatch=True), st.lists(PATTERNS, min_size=1, max_size=3), min_size=1, max_size=3), st.lists(TOPICS, min_size=1, max_size=6))
def published ( queues: dict[str, list[str]], topics: list[str] ) -> None:

    driver = Memory()

    for queue, patterns in queues.items(): run(driver.declare(queue, patterns))

    expected = dict.fromkeys(queues, 0)

    for topic in topics:

        matched = [queue for queue, patterns in queues.items() if any(routed(topic, pattern) for pattern in patterns)]
        made    = run(driver.publish(Message.make(topic, { "n": 1 })))

        if matched:

            assert made is None

            for queue in matched: expected[queue] += 1

        else: assert isinstance(made, Fault) and made.reason == "broker.unroutable"

    for queue, count in expected.items():

        assert run(driver.depth(queue)) == count

        taken = run(driver.pull(queue, 100, 0.0))

        assert len(taken) == count and all(message.queue == queue and message.attempts == 1 for message in taken)
        assert driver.inflight() == count

        for message in taken[::2]: run(driver.nack(message))
        for message in taken[1::2]: run(driver.ack(message))

        assert driver.inflight() == 0 and run(driver.depth(queue)) == len(taken[::2])

        again = run(driver.pull(queue, 100, 0.0))

        assert all(message.attempts == 2 for message in again) and len(again) == len(taken[::2])

        run(driver.ack(*again))

        assert driver.inflight() == 0 and run(driver.purge(queue)) == 0

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(TOPICS, st.dictionaries(st.text(max_size=5), LEAVES, max_size=4), st.dictionaries(st.text(max_size=4), st.text(max_size=4), max_size=3), st.integers(1, 3))
def handled ( topic: str, payload: dict[str, Any], headers: dict[str, str], failures: int ) -> None:

    bus    = Broker()
    seen: list[dict[str, Any]] = []
    budget = [failures]

    bus.setup(Memory())
    run(bus.declare("q", "#"))

    async def handle ( message: Message ) -> None:

        seen.append(message.payload)

        if budget[0] > 0:

            budget[0] -= 1

            raise Fault(Code.UNAVAILABLE, reason="flaky")

    run(bus.publish(topic, payload, headers))

    for _ in range(failures + 1): run(bus.consume("q", handle, 1, 0.0, tries=5))

    assert seen == [payload] * (failures + 1)
    assert run(bus.depth("q")) == 0

published()
handled()

loop.close()
log.close()

print(f"fuzz broker  examples={EXAMPLES * 2}  ok")
