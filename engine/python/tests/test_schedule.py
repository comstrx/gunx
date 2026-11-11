from datetime import UTC, datetime, timedelta

from engine.cache import Cache, Memory
from engine.date import date
from engine.error import Code, Fault
from engine.schedule import Cron, Schedule, Spot
from typing import Any, cast
import asyncio, time, pytest

FLAG: Any = True

def test_cron_parses_and_finds_the_next_moment () -> None:

    every = Cron.parse("*/15 9-17 * * mon-fri")
    noon  = datetime(2026, 1, 5, 12, 0, tzinfo=UTC)

    assert every.minutes == frozenset({ 0, 15, 30, 45 }) and every.hours == frozenset(range(9, 18)) and every.weekdays == frozenset(range(1, 6))
    assert every.matches(noon) and not every.matches(noon.replace(minute=5)) and not every.matches(datetime(2026, 1, 4, 12, 0, tzinfo=UTC))
    assert every.next(noon) == noon.replace(minute=15) and every.next(datetime(2026, 1, 9, 17, 45, tzinfo=UTC)) == datetime(2026, 1, 12, 9, 0, tzinfo=UTC)
    assert Cron.parse("@daily").next(noon) == datetime(2026, 1, 6, 0, 0, tzinfo=UTC)
    assert Cron.parse("0 0 1 jan,jul *").months == frozenset({ 1, 7 })
    assert Cron.parse("0 12 1 * 7").weekdays == frozenset({ 0 }) and Cron.parse("5 4 * * *").describe()["minutes"] == [5]

    both = Cron.parse("0 0 15 * 1")

    assert both.matches(datetime(2026, 1, 15, 0, 0, tzinfo=UTC)) and both.matches(datetime(2026, 1, 12, 0, 0, tzinfo=UTC))

    for bad in ("* * *", "60 * * * *", "* 24 * * *", "*/0 * * * *", "5-1 * * * *", "x * * * *", "0 0 0 * *"):

        with pytest.raises(Fault) as caught: Cron.parse(bad)

        assert caught.value.code is Code.BAD_REQUEST and caught.value.reason == "cron.parse"

    with pytest.raises(Fault) as never: Cron.parse("0 0 30 2 *").next(noon)

    assert never.value.reason == "cron.horizon"

async def test_schedule_runs_due_tasks_once () -> None:

    schedule = Schedule()
    runs: list[str] = []

    schedule.setup(Cache(Memory()), zone="Africa/Cairo", tick=0.01)

    @schedule.every("* * * * *", "beat", timeout=1.0)
    async def beat () -> None: runs.append("beat")

    @schedule.every("0 3 * * *", "nightly")
    async def nightly () -> None: runs.append("nightly")

    async def failing () -> None: raise Fault(Code.UNAVAILABLE, reason="x")

    async def slow () -> None: await asyncio.sleep(1)

    schedule.add("failing", "* * * * *", failing)
    schedule.add("slow", "* * * * *", slow, timeout=0.02)

    assert schedule.names() == ("beat", "failing", "nightly", "slow") and schedule.spot("beat").cron.text == "* * * * *"
    assert date.between(date.now(), schedule.spot("beat").next) <= 60

    moment = schedule.spot("beat").next

    assert sorted(spot.name for spot in schedule.due(moment)) == ["beat", "failing", "slow"]

    assert await schedule.tick(moment) == 1 and runs == ["beat"]
    assert schedule.spot("failing").failures == 1 and schedule.spot("slow").failures == 1 and schedule.spot("beat").runs == 1
    assert await schedule.tick(moment) == 0

    nightly_spot = schedule.spot("nightly")

    assert nightly_spot.next.astimezone(date.zone("Africa/Cairo")).hour == 3
    assert await schedule.trigger("nightly") and runs[-1] == "nightly"

    with pytest.raises(Fault) as duplicate: schedule.add("beat", "* * * * *", failing)

    assert duplicate.value.reason == "schedule.duplicate"

    with pytest.raises(Fault): schedule.spot("nothing")

    assert schedule.forget("slow") and not schedule.forget("slow")

    schedule.start()

    assert schedule.running() and schedule.describe()["zone"] == "Africa/Cairo"

    await asyncio.sleep(0.05)
    await schedule.stop()

    schedule.clear()

    assert schedule.names() == ()

async def test_plans_read_like_sentences () -> None:

    schedule = Schedule()
    runs: list[str] = []
    fails: list[str] = []

    schedule.setup(Cache(Memory()), zone="UTC", tick=0.01)

    async def report () -> None: runs.append("report")

    async def broken () -> None: raise Fault(Code.UNAVAILABLE, reason="down")

    async def failed ( spot: Spot, error: BaseException ) -> None: fails.append(f"{spot.name}:{type(error).__name__}")

    nightly = schedule.job("nightly", report).daily("03:30").timezone("Africa/Cairo").timeout(5).without_overlap()
    weekly  = schedule.job("weekly", report).weekly(5, "08:00").when(lambda: True)
    heart   = schedule.job("heart", report).every(0.05).between("00:00", "23:59")
    hourly  = schedule.job("hourly", report).hourly(15).with_overlap()
    monthly = schedule.job("monthly", report).monthly(2, "01:00").skip(lambda: True)
    yearly  = schedule.job("yearly", report).yearly(6, 15, "12:00")
    office  = schedule.job("office", report).weekdays("09:00").every_minutes(5)
    failing = schedule.job("failing", broken).every_minute().on_failure(failed)

    assert nightly.spot() is schedule.spot("nightly") and nightly.spot().cron.text == "30 3 * * *" and nightly.spot().zone == "Africa/Cairo"
    assert nightly.spot().next.astimezone(date.zone("Africa/Cairo")).hour == 3 and nightly.spot().timeout == 5
    assert weekly.spot().cron.text == "0 8 * * 5" and heart.spot().interval == 0.05 and hourly.spot().cron.text == "15 * * * *"
    assert hourly.spot().overlap and monthly.spot().cron.text == "0 1 2 * *" and yearly.spot().cron.text == "0 12 15 6 *"
    assert office.spot().cron.text == "*/5 * * * *" and failing.spot().cron.text == "* * * * *"
    assert heart.spot().describe()["interval"] == 0.05 and date.between(date.now(), heart.spot().next) <= 0.06

    await asyncio.sleep(0.06)

    assert await schedule.tick() >= 1 and "report" in runs and date.between(date.now(), heart.spot().next) <= 0.06

    moment = failing.spot().next

    assert await schedule.tick(moment) >= 1 and fails == ["failing:Fault"] and monthly.spot().runs == 0

    runs.clear()

    skipped = schedule.job("skipped", report).every(0.01).skip(lambda: True)

    await asyncio.sleep(0.02)

    assert await schedule.tick() == 0 and runs == [] and skipped.spot().runs == 0

    night = schedule.job("night", report).every(0.01).between("22:00", "06:00")
    local = date.local(date.now(), "UTC")

    assert night.spot().allowed(date.now()) == (local.hour >= 22 or local.hour <= 6)

    with pytest.raises(Fault): schedule.job("x", report).daily("25:00")
    with pytest.raises(Fault): schedule.job("y", report).every(0)
    with pytest.raises(Fault): schedule.job("z", report).timezone("Mars")
    with pytest.raises(Fault): schedule.job("w", report).daily("x")

async def test_plans_grew_the_laravel_calendar_and_hooks () -> None:

    schedule = Schedule()

    schedule.setup(Cache(Memory()))

    seen: list[str] = []

    async def work () -> None: seen.append("work")

    async def before ( spot: Spot ) -> None: seen.append(f"before:{spot.name}")

    async def after ( spot: Spot ) -> None: seen.append("after")

    async def success ( spot: Spot ) -> None: seen.append("success")

    plan = schedule.job("lap", work).quarterly(2, "08:30").before(before).after(after).on_success(success)

    assert plan.spot().cron.text == "30 8 2 1,4,7,10 *"
    assert schedule.job("ends", work).weekends("09:00").spot().cron.text == "0 9 * * 0,6"
    assert schedule.job("days", work).days(1, 3, 3).spot().cron.text == "0 0 * * 1,3"
    assert schedule.job("last", work).last_day_of_month("23:00").spot().cron.text == "0 23 28-31 * *"

    with pytest.raises(Fault): schedule.job("bad", work).days(9)

    quiet = schedule.job("quiet", work).hourly().unless_between("22:00", "06:00").spot()

    assert quiet.allowed(datetime(2026, 1, 1, 12, 0, tzinfo=UTC)) and not quiet.allowed(datetime(2026, 1, 1, 23, 0, tzinfo=UTC))
    assert not quiet.allowed(datetime(2026, 1, 1, 3, 0, tzinfo=UTC))

    assert await schedule.run(plan.spot()) and seen == ["before:lap", "work", "success", "after"]

async def test_the_schedule_survives_a_crashing_job_and_keys_its_lock_by_slot () -> None:

    store    = Memory()
    schedule = Schedule()
    told: list[str] = []

    schedule.setup(Cache(store), tick=0.01)

    async def crashing () -> None: raise ValueError("boom")

    async def hook ( spot: Spot, error: BaseException ) -> None: told.append(f"{spot.name}:{type(error).__name__}")

    async def broken_hook ( spot: Spot ) -> None: raise RuntimeError("hook")

    schedule.job("crash", crashing).every_minute().on_failure(hook).after(broken_hook)

    moment = schedule.spot("crash").next
    slot   = date.iso(moment)

    assert await schedule.tick(moment) == 0 and schedule.spot("crash").failures == 1 and told == ["crash:ValueError"]
    assert await store.get(f"lock:schedule:crash:{slot}") is not None and not schedule.spot("crash").busy
    assert await schedule.tick(moment) == 0 and schedule.spot("crash").failures == 1

    other = Schedule()

    other.setup(Cache(store), tick=0.01)
    other.add("crash", "* * * * *", crashing)

    other.spot("crash").next = moment

    assert await other.tick(moment + timedelta(seconds=5)) == 0 and other.spot("crash").failures == 0

    schedule.start()

    await asyncio.sleep(0.05)

    assert schedule.running()

    await schedule.stop()

    assert not schedule.running()

    for reason, make in (
        ("schedule.cache", lambda: schedule.setup(cast("Any", "redis"))), ("schedule.zone", lambda: schedule.setup(zone=cast("Any", 7))),
        ("date.zone", lambda: schedule.setup(zone="Mars/Olympus")), ("schedule.tick", lambda: schedule.setup(tick=0)), ("schedule.tick", lambda: schedule.setup(tick=cast("Any", "1"))),
        ("schedule.name", lambda: schedule.add("", "* * * * *", crashing)), ("schedule.name", lambda: schedule.add("a\nb", "* * * * *", crashing)),
        ("schedule.name", lambda: schedule.add(cast("Any", 7), "* * * * *", crashing)), ("schedule.work", lambda: schedule.add("w", "* * * * *", cast("Any", "work"))),
        ("schedule.timeout", lambda: schedule.add("t", "* * * * *", crashing, timeout=0)), ("schedule.timeout", lambda: schedule.add("t", "* * * * *", crashing, timeout=FLAG)),
        ("cron.parse", lambda: schedule.add("c", cast("Any", None), crashing)), ("cron.parse", lambda: schedule.add("c", "* " * 200, crashing)),
        ("schedule.interval", lambda: schedule.job("i", crashing).every(0)), ("schedule.interval", lambda: schedule.job("i2", crashing).every(cast("Any", "5"))),
        ("schedule.timeout", lambda: schedule.job("i3", crashing).timeout(-1)), ("schedule.hook", lambda: schedule.job("i4", crashing).when(cast("Any", "yes"))),
        ("schedule.hook", lambda: schedule.job("i5", crashing).on_failure(cast("Any", None))), ("schedule.clock", lambda: schedule.job("i6", crashing).daily(cast("Any", 7))),
        ("cron.moment", lambda: Cron.parse("* * * * *").next(cast("Any", "now"))),
    ):

        with pytest.raises(Fault) as refused: make()

        assert refused.value.reason == reason, reason

    schedule.clear()

def test_the_cron_steps_to_the_next_moment_without_scanning_every_minute () -> None:

    start = datetime(2026, 1, 31, 23, 59, tzinfo=UTC)

    assert Cron.parse("0 0 29 2 *").next(datetime(2027, 12, 31, tzinfo=UTC)) == datetime(2028, 2, 29, 0, 0, tzinfo=UTC)
    assert Cron.parse("30 4 1 * *").next(start) == datetime(2026, 2, 1, 4, 30, tzinfo=UTC)
    assert Cron.parse("*/15 * * * *").next(datetime(2026, 1, 1, 10, 7, tzinfo=UTC)) == datetime(2026, 1, 1, 10, 15, tzinfo=UTC)
    assert Cron.parse("0 9 * * mon-fri").next(datetime(2026, 1, 2, 9, 0, tzinfo=UTC)) == datetime(2026, 1, 5, 9, 0, tzinfo=UTC)
    assert Cron.parse("0 0 1 * 1").next(datetime(2026, 1, 1, 0, 0, tzinfo=UTC)) == datetime(2026, 1, 5, 0, 0, tzinfo=UTC)
    assert Cron.parse("@yearly").next(start) == datetime(2027, 1, 1, 0, 0, tzinfo=UTC)
    assert Cron.parse("59 23 31 12 *").next(datetime(2026, 12, 31, 23, 59, tzinfo=UTC)) == datetime(2027, 12, 31, 23, 59, tzinfo=UTC)

    with pytest.raises(Fault) as never: Cron.parse("0 0 30 2 *").next(start)

    assert never.value.reason == "cron.horizon"

    with pytest.raises(Fault) as far: Cron.parse("0 0 29 2 *").next(start)

    assert far.value.reason == "cron.horizon"

    taken = time.perf_counter()

    for _ in range(200): Cron.parse("0 0 29 2 *").next(datetime(2027, 12, 31, tzinfo=UTC))

    assert time.perf_counter() - taken < 2.0
