from engine.error import Fault
from engine.schedule import Cron
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress
from datetime import UTC, datetime

EXAMPLES = 2000
field = st.sampled_from(["*", "*/5", "1-10", "0,30", "mon-fri", "jan", "7", "59", "x", "", "1-", "*/0", "100"])

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=40))
def never_crashes_on_text ( text: str ) -> None:

    with suppress(Fault): Cron.parse(text)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(field, field, field, field, field, st.integers(min_value=0, max_value=10**9))
def valid_schedules_always_advance ( a: str, b: str, c: str, d: str, e: str, stamp: int ) -> None:

    with suppress(Fault):

        cron = Cron.parse(f"{a} {b} {c} {d} {e}")
        now  = datetime.fromtimestamp(stamp, UTC)

        with suppress(Fault):

            following = cron.next(now)

            assert following > now
            assert cron.matches(following)

never_crashes_on_text()
valid_schedules_always_advance()

print(f"fuzz schedule  examples={EXAMPLES * 2}  ok")
