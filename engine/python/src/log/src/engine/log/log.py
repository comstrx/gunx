from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from structlog import configure, get_logger, make_filtering_bound_logger
from structlog.processors import StackInfoRenderer, TimeStamper, add_log_level, format_exc_info
from structlog.typing import EventDict, Processor, WrappedLogger
from engine.context import context
from .arch import Fields, NUMBERS
from .logger import Logger
from .render import Render
from .sink import Sink
import logging, sys

class Log:

    name = "app"

    def __init__ ( self ) -> None:

        self._sink: Sink | None = None
        self._out      = Sink(sys.stderr)
        self._level    = "info"
        self._renderer = "console"
        self._file: Path | None = None
        self._render   = Render()
        self._taps: list[list[EventDict]] = []
        self._floor    = logging.INFO
        self.debugging = False
        self._logger   = Logger(get_logger(self.name))

        self.setup()

    def setup ( self, level: str = "info", renderer: str = "console", file: Path | None = None ) -> None:

        colors = file is None and sys.stderr.isatty()
        processors: list[Processor] = [
            self._render.correlate, StackInfoRenderer(), format_exc_info, self._render.redact, add_log_level,
            TimeStamper(fmt="iso", utc=True), self._tap_, self._render.renderer(renderer, colors=colors),
        ]

        self.close()

        configure(
            processors=processors,
            wrapper_class=make_filtering_bound_logger(self.level_of(level)),
            logger_factory=self._factory_(file),
            cache_logger_on_first_use=False,
        )

        self._level    = level.lower()
        self._renderer = renderer
        self._file     = file
        self._floor    = self.level_of(level)
        self.debugging = self._floor <= logging.DEBUG
        self._logger   = Logger(get_logger(self.name).bind())

    def level_of ( self, level: str ) -> int:

        return NUMBERS.get(level.lower(), logging.INFO)

    def level ( self ) -> str:

        return self._level

    def enabled ( self, level: str ) -> bool:

        return NUMBERS.get(level.lower(), logging.INFO) >= self._floor

    def describe ( self ) -> dict[str, object]:

        return {
            "level": self._level, "renderer": self._renderer, "file": str(self._file) if self._file else None,
            "dropped": self._out.dropped,
        }

    def get ( self, name: str | None = None ) -> Logger:

        return Logger(get_logger(name or self.name))

    def bind ( self, **fields: Any ) -> Logger:

        return self.get().bind(**fields)

    def share ( self, **fields: Any ) -> None:

        context.put(**fields)

    def unshare ( self, *names: str ) -> None:

        context.forget(*names)

    def shared ( self ) -> dict[str, Any]:

        return context.snapshot()

    def debug ( self, event: str, **fields: Any ) -> None:

        if self._floor <= logging.DEBUG: self._logger.debug(event, **fields)

    def info ( self, event: str, **fields: Any ) -> None:

        if self._floor <= logging.INFO: self._logger.info(event, **fields)

    def warning ( self, event: str, **fields: Any ) -> None:

        if self._floor <= logging.WARNING: self._logger.warning(event, **fields)

    def error ( self, event: str, **fields: Any ) -> None:

        if self._floor <= logging.ERROR: self._logger.error(event, **fields)

    def critical ( self, event: str, **fields: Any ) -> None:

        if self._floor <= logging.CRITICAL: self._logger.critical(event, **fields)

    def exception ( self, event: str, **fields: Any ) -> None:

        if self._floor <= logging.ERROR: self._logger.exception(event, **fields)

    def at ( self, level: str, event: str, **fields: Any ) -> None:

        if self.level_of(level) >= self._floor: self._logger.at(level, event, **fields)

    @contextmanager
    def span ( self, event: str, level: str = "info", **fields: Any ) -> Iterator[Fields]:

        with self.get().span(event, level, **fields) as extra: yield extra

    @contextmanager
    def capture ( self ) -> Iterator[list[EventDict]]:

        events: list[EventDict] = []

        self._taps.append(events)

        try: yield events
        finally: self._taps.remove(events)

    def ms ( self, started: float ) -> float:

        return Logger.ms(started)

    def close ( self ) -> None:

        if self._sink is not None: self._sink.close()

        self._sink = None

    def _tap_ ( self, _: WrappedLogger, __: str, event: EventDict ) -> EventDict:

        for tap in self._taps: tap.append(dict(event))

        return event

    def _factory_ ( self, file: Path | None ) -> Any:

        if file is None: self._out = Sink(sys.stderr)

        else:

            file.parent.mkdir(parents=True, exist_ok=True)

            self._out = self._sink = Sink(file.open("a", encoding="utf-8", errors="backslashreplace", buffering=1))

        return self._made_

    def _made_ ( self, *_: object ) -> Sink:

        return self._out
