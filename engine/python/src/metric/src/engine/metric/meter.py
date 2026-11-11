from typing import ClassVar, cast

from engine.error import Code, Fault
from engine.log import log
from .arch import CEILING, EXACT, HELP, HELPED, Cell, Key, LABELS, MOST, NAME, QUOTED, RESERVED, SERIES, VALUE, WORD
import math, threading

class Meter:

    kind     : ClassVar[str]             = "meter"
    family   : ClassVar[str]             = ""
    suffixes : ClassVar[tuple[str, ...]] = ("",)
    reserved : ClassVar[frozenset[str]]  = frozenset()

    def __init__ ( self, name: str, help_: str = "", series: int = SERIES ) -> None:

        self.name     = self._named_(name)
        self.help     = self._helped_(help_)
        self._limit   = self._capped_(series)
        self._lock    = threading.Lock()
        self._cells   : dict[Key, Cell] = {}
        self._series  : dict[str, Cell] = {}
        self._dropped = 0
        self._warned  = False

    def series ( self ) -> int:

        return len(self._series)

    def dropped ( self ) -> int:

        return self._dropped

    def forget ( self, **labels: str ) -> bool:

        text = self._labelled_(self._key_(labels))

        with self._lock:

            cell = None if text is None else self._series.pop(text, None)

            if cell is not None: self._cells = { key: held for key, held in self._cells.items() if held is not cell }

        return cell is not None

    def clear ( self ) -> None:

        with self._lock:

            self._cells   = {}
            self._series  = {}
            self._dropped = 0
            self._warned  = False

    def lines ( self, prefix: str = "" ) -> list[str]:

        name = f"{prefix}_{self.name}" if prefix else self.name

        with self._lock: held = [(text, list(cell)) for text, cell in self._series.items()]

        lines = [f"# HELP {name}{self.family} {self.help.translate(HELPED)}"] if self.help else []

        lines.append(f"# TYPE {name}{self.family} {self.kind}")

        for text, cell in sorted(held): lines.extend(self._rows_(name, text, cell))

        return lines

    def _rows_ ( self, name: str, text: str, cell: Cell ) -> list[str]:

        return [self._row_(f"{name}{self.family}", text, cell[0])]

    def _row_ ( self, name: str, text: str, value: float ) -> str:

        return f"{name}{{{text}}} {self._figure_(value)}" if text else f"{name} {self._figure_(value)}"

    def _figure_ ( self, value: float ) -> str:

        if math.isinf(value): return "+Inf" if value > 0 else "-Inf"

        return str(int(value)) if -EXACT <= value <= EXACT and value == int(value) else repr(value)

    def _fresh_ ( self ) -> Cell:

        return [0.0]

    def _number_ ( self, value: float ) -> float:

        if (type(value) is float or type(value) is int) and -MOST <= value <= MOST: return value

        raise self._refused_("value", type(value).__name__)

    def _key_ ( self, labels: dict[str, str] ) -> Key:

        return tuple(sorted(labels.items())) if labels else ()

    def _cell_ ( self, labels: dict[str, str], *, read: bool = False ) -> Cell | None:

        key: Key = tuple(sorted(labels.items())) if labels else ()

        try: cell = self._cells.get(key)
        except TypeError: raise self._refused_("label", "value") from None

        if cell is not None: return cell

        text = self._labelled_(key)

        if text is not None: return self._series.get(text) if read else self._open_(key, text)
        if not read: self._drop_()

        return None

    def _open_ ( self, key: Key, text: str ) -> Cell | None:

        with self._lock:

            cell = self._series.get(text)

            if cell is None and len(self._series) < self._limit: cell = self._series.setdefault(text, self._fresh_())
            if cell is not None and all(value for _, value in key): self._cells[key] = cell

        if cell is None: self._drop_()

        return cell

    def _drop_ ( self ) -> None:

        with self._lock:

            self._dropped += 1

            first, self._warned = not self._warned, True

        if first: log.warning("metric.series", metric=self.name, limit=self._limit)

    def _labelled_ ( self, key: Key ) -> str | None:

        if len(key) > LABELS: raise self._refused_("label", "count")

        for name, value in key:

            if not self._word_(name) or name in self.reserved: raise self._refused_("label", name[:WORD])
            if not isinstance(cast("object", value), str): raise self._refused_("label", name)

        pairs = [(name, str.__str__(value)) for name, value in key]

        if any(len(value) > VALUE or not self._plain_(value) for _, value in pairs): return None

        return ",".join(f'{name}="{value.translate(QUOTED)}"' for name, value in pairs if value)

    def _word_ ( self, name: str ) -> bool:

        if type(name) is not str or len(name) > WORD or name.startswith(RESERVED): return False

        return NAME.fullmatch(name) is not None

    def _plain_ ( self, text: str ) -> bool:

        if text.isascii(): return True

        try: text.encode()
        except UnicodeEncodeError: return False

        return True

    def _named_ ( self, name: str ) -> str:

        if self._word_(name): return name

        raise self._refused_("name", name[:WORD] if type(name) is str else type(name).__name__)

    def _helped_ ( self, help_: str ) -> str:

        if type(help_) is str and len(help_) <= HELP and self._plain_(help_): return help_

        raise self._refused_("help", self.name)

    def _capped_ ( self, series: int ) -> int:

        if type(series) is int and 0 < series <= CEILING: return series

        raise self._refused_("series", self.name)

    def _refused_ ( self, reason: str, word: str ) -> Fault:

        return Fault(Code.INTERNAL, reason=f"metric.{reason}", errors={ reason: [word] })
