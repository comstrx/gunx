from collections.abc import Sequence
from typing import Any

from engine.error import Code, Fault
from .arch import BUCKETS, CEILING, NAME, RESERVED, SERIES, TOTAL, WORD
from .counter import Counter
from .gauge import Gauge
from .histogram import Histogram
from .meter import Meter
import threading

class Metrics:

    def __init__ ( self, prefix: str = "engine", series: int = SERIES ) -> None:

        if type(series) is not int or not 0 < series <= CEILING: raise self._refused_("series", "series")

        self._prefix = self._prefixed_(prefix)
        self._series = series
        self._lock   = threading.Lock()
        self._items  : dict[str, Meter] = {}
        self._claims : dict[str, str]   = {}

    def setup ( self, prefix: str ) -> None:

        self._prefix = self._prefixed_(prefix)

    def counter ( self, name: str, help_: str = "" ) -> Counter:

        key   = self._bare_(name).removesuffix(TOTAL)
        found = self._items.get(key)

        return found if isinstance(found, Counter) else self._kept_(Counter(key, help_, self._series))

    def gauge ( self, name: str, help_: str = "" ) -> Gauge:

        found = self._items.get(self._bare_(name))

        return found if isinstance(found, Gauge) else self._kept_(Gauge(name, help_, self._series))

    def histogram ( self, name: str, help_: str = "", buckets: Sequence[float] | None = None ) -> Histogram:

        found = self._items.get(self._bare_(name))

        if isinstance(found, Histogram) and buckets is None: return found

        return self._kept_(Histogram(name, help_, BUCKETS if buckets is None else buckets, self._series))

    def has ( self, name: str ) -> bool:

        return self._held_(name) is not None

    def forget ( self, name: str ) -> bool:

        with self._lock:

            found = self._held_(name)

            if found is None: return False

            del self._items[found.name]

            self._claims = { claim: owner for claim, owner in self._claims.items() if owner != found.name }

        return True

    def names ( self ) -> tuple[str, ...]:

        return tuple(self._full_(item) for _, item in self._sorted_())

    def render ( self ) -> str:

        prefix = self._prefix
        lines: list[str] = []

        for _, item in self._sorted_(): lines.extend(item.lines(prefix))

        return "\n".join(lines) + "\n" if lines else ""

    def clear ( self ) -> None:

        with self._lock:

            self._items  = {}
            self._claims = {}

    def describe ( self ) -> dict[str, Any]:

        items = self._sorted_()

        return {
            "prefix"  : self._prefix,
            "metrics" : { self._full_(item): item.kind for _, item in items },
            "series"  : sum(item.series() for _, item in items),
            "dropped" : sum(item.dropped() for _, item in items),
        }

    def _sorted_ ( self ) -> list[tuple[str, Meter]]:

        with self._lock: return sorted(self._items.items())

    def _full_ ( self, item: Meter ) -> str:

        return f"{self._prefix}_{item.name}{item.family}" if self._prefix else f"{item.name}{item.family}"

    def _bare_ ( self, name: str ) -> str:

        if type(name) is str: return name

        raise self._refused_("name", type(name).__name__)

    def _held_ ( self, name: str ) -> Meter | None:

        key   = self._bare_(name)
        found = self._items.get(key)

        if found is not None: return found

        found = self._items.get(key.removesuffix(TOTAL))

        return found if isinstance(found, Counter) else None

    def _kept_ [M: Meter] ( self, made: M ) -> M:

        with self._lock:

            held = self._items.get(made.name)

            if held is not None: return self._agreed_(held, made)

            claims = [made.name + suffix for suffix in made.suffixes]
            taken  = [claim for claim in claims if claim in self._claims]

            if taken: raise self._refused_("taken", *taken)

            self._claims.update(dict.fromkeys(claims, made.name))

            self._items[made.name] = made

        return made

    def _agreed_ [M: Meter] ( self, held: Meter, made: M ) -> M:

        if not isinstance(held, type(made)): raise self._refused_("kind", made.name)

        if isinstance(held, Histogram) and isinstance(made, Histogram) and held.buckets() != made.buckets():
            raise self._refused_("buckets", made.name)

        return held

    def _prefixed_ ( self, prefix: str ) -> str:

        if type(prefix) is not str: raise self._refused_("prefix", type(prefix).__name__)
        if len(prefix) > WORD or prefix.startswith(RESERVED): raise self._refused_("prefix", prefix[:WORD])
        if prefix and NAME.fullmatch(prefix) is None: raise self._refused_("prefix", prefix)

        return prefix

    def _refused_ ( self, reason: str, *words: str ) -> Fault:

        return Fault(Code.INTERNAL, reason=f"metric.{reason}", errors={ reason: list(words) })
