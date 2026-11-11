from collections.abc import Callable

from engine.date import date
from engine.error import Code, Fault
from .arch import Failure, Filter, Hook, HOURS, MINUTES, timed, WEEKDAYS, WIDEST
from .cron import Cron
from .spot import Spot

class Plan:

    def __init__ ( self, spot: Spot, rearm: Callable[[Spot], None] ) -> None:

        self._spot  = spot
        self._rearm = rearm

    def spot ( self ) -> Spot:

        return self._spot

    def cron ( self, text: str ) -> Plan:

        self._spot.cron     = Cron.parse(text)
        self._spot.interval = None

        return self._armed_()

    def every ( self, seconds: float ) -> Plan:

        self._spot.interval = timed(seconds, "interval")

        return self._armed_()

    def every_minute ( self ) -> Plan:

        return self.cron("* * * * *")

    def every_minutes ( self, count: int ) -> Plan:

        return self.cron(f"*/{count} * * * *")

    def hourly ( self, minute: int = 0 ) -> Plan:

        return self.cron(f"{minute} * * * *")

    def daily ( self, at: str = "00:00" ) -> Plan:

        hour, minute = self._clock_(at)

        return self.cron(f"{minute} {hour} * * *")

    def weekly ( self, day: int = 0, at: str = "00:00" ) -> Plan:

        hour, minute = self._clock_(at)

        return self.cron(f"{minute} {hour} * * {day}")

    def monthly ( self, day: int = 1, at: str = "00:00" ) -> Plan:

        hour, minute = self._clock_(at)

        return self.cron(f"{minute} {hour} {day} * *")

    def yearly ( self, month: int = 1, day: int = 1, at: str = "00:00" ) -> Plan:

        hour, minute = self._clock_(at)

        return self.cron(f"{minute} {hour} {day} {month} *")

    def weekdays ( self, at: str = "00:00" ) -> Plan:

        hour, minute = self._clock_(at)

        return self.cron(f"{minute} {hour} * * 1-5")

    def weekends ( self, at: str = "00:00" ) -> Plan:

        hour, minute = self._clock_(at)

        return self.cron(f"{minute} {hour} * * 0,6")

    def days ( self, *days: int, at: str = "00:00" ) -> Plan:

        hour, minute = self._clock_(at)

        if not days or any(not 0 <= day <= WEEKDAYS for day in days): raise self._refuse_(",".join(map(str, days)))

        return self.cron(f"{minute} {hour} * * {','.join(str(day) for day in sorted(set(days)))}")

    def quarterly ( self, day: int = 1, at: str = "00:00" ) -> Plan:

        hour, minute = self._clock_(at)

        return self.cron(f"{minute} {hour} {day} 1,4,7,10 *")

    def last_day_of_month ( self, at: str = "00:00" ) -> Plan:

        hour, minute = self._clock_(at)

        self.cron(f"{minute} {hour} 28-31 * *")

        return self.when(lambda: date.add(date.now(), days=1).day == 1)

    def timezone ( self, zone: str ) -> Plan:

        date.zone(zone)

        self._spot.zone = zone

        return self._armed_()

    def timeout ( self, seconds: float ) -> Plan:

        self._spot.timeout = timed(seconds, "timeout")

        return self

    def without_overlap ( self ) -> Plan:

        self._spot.overlap = False

        return self

    def with_overlap ( self ) -> Plan:

        self._spot.overlap = True

        return self

    def when ( self, keep: Filter ) -> Plan:

        self._spot.filters.append(self._callable_(keep))

        return self

    def skip ( self, drop: Filter ) -> Plan:

        held = self._callable_(drop)

        self._spot.filters.append(lambda: not held())

        return self

    def between ( self, start: str, end: str ) -> Plan:

        self._spot.window = (self._clock_(start), self._clock_(end))

        return self

    def unless_between ( self, start: str, end: str ) -> Plan:

        self._spot.blackout = (self._clock_(start), self._clock_(end))

        return self

    def before ( self, hook: Hook ) -> Plan:

        self._spot.starting.append(self._callable_(hook))

        return self

    def after ( self, hook: Hook ) -> Plan:

        self._spot.finished.append(self._callable_(hook))

        return self

    def on_success ( self, hook: Hook ) -> Plan:

        self._spot.succeeded.append(self._callable_(hook))

        return self

    def on_failure ( self, handler: Failure ) -> Plan:

        self._spot.failed.append(self._callable_(handler))

        return self

    @staticmethod
    def _callable_ [T] ( hook: T ) -> T:

        if not callable(hook): raise Fault(Code.INTERNAL, reason="schedule.hook")

        return hook

    def _armed_ ( self ) -> Plan:

        self._rearm(self._spot)

        return self

    def _refuse_ ( self, text: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="schedule.clock", errors={ "clock": [text] })

    def _clock_ ( self, text: str ) -> tuple[int, int]:

        if type(text) is not str or len(text) > WIDEST: raise self._refuse_(str(text)[:64])

        hour, _, minute = text.partition(":")

        try: found = int(hour), int(minute or 0)
        except ValueError as error: raise self._refuse_(text) from error

        if not 0 <= found[0] <= HOURS or not 0 <= found[1] <= MINUTES: raise self._refuse_(text)

        return found
