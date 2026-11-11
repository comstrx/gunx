from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from .arch import Fields, LEVELS
import time

class Logger:

    __slots__ = ("_inner",)

    def __init__ ( self, inner: Any ) -> None:

        self._inner = inner

    def bind ( self, **fields: Any ) -> Logger:

        return Logger(self._inner.bind(**fields))

    def unbind ( self, *names: str ) -> Logger:

        return Logger(self._inner.try_unbind(*names))

    def debug ( self, event: str, **fields: Any ) -> None:

        self._inner.debug(event, **fields)

    def info ( self, event: str, **fields: Any ) -> None:

        self._inner.info(event, **fields)

    def warning ( self, event: str, **fields: Any ) -> None:

        self._inner.warning(event, **fields)

    def error ( self, event: str, **fields: Any ) -> None:

        self._inner.error(event, **fields)

    def critical ( self, event: str, **fields: Any ) -> None:

        self._inner.critical(event, **fields)

    def exception ( self, event: str, **fields: Any ) -> None:

        self._inner.exception(event, **fields)

    def at ( self, level: str, event: str, **fields: Any ) -> None:

        chosen = level.lower() if level.lower() in LEVELS else "info"

        getattr(self._inner, chosen)(event, **fields)

    @contextmanager
    def span ( self, event: str, level: str = "info", **fields: Any ) -> Iterator[Fields]:

        started = time.perf_counter()
        extra: dict[str, object] = {}

        try: yield extra
        except BaseException as error:

            self.at("error", f"{event}.failed", ms=Logger.ms(started), error=type(error).__name__, **fields, **extra)

            raise

        self.at(level, event, ms=Logger.ms(started), **fields, **extra)

    @staticmethod
    def ms ( started: float ) -> float:

        return round((time.perf_counter() - started) * 1000, 3)
