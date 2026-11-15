from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from structlog import make_filtering_bound_logger, wrap_logger
from structlog.processors import StackInfoRenderer, TimeStamper, add_log_level, format_exc_info
from structlog.typing import EventDict, Processor, WrappedLogger
from engine.context import context
from engine.error import Code, Fault
from .arch import CAPTURES, Capture, Fields, NUMBERS
from .logger import Logger
from .render import Render
from .sink import Sink
import logging, sys

class Log:

    name = "app"

    def __init__ ( self ) -> None:

        self._sink: Sink | None = None
        self._render = Render()

        self.setup()

    def setup ( self, level: str = "info", renderer: str = "console", file: Path | None = None ) -> None:

        colors = file is None and sys.stderr.isatty()
        processors: list[Processor] = [
            self._render.correlate, StackInfoRenderer(), format_exc_info, self._render.redact, add_log_level,
            TimeStamper(fmt="iso", utc=True), self._tap_, self._render.renderer(renderer, colors=colors),
        ]

        floor = self.level_of(level)
        out   = self._open_(file)

        try:

            logger = Logger(wrap_logger(
                out, processors=processors, wrapper_class=make_filtering_bound_logger(floor),
                context_class=dict, cache_logger_on_first_use=True,
            ).bind())

        except BaseException:

            if file is not None: out.close()

            raise

        self.close()

        self._out      = out
        self._sink     = out if file is not None else None
        self._level    = level.lower()
        self._renderer = renderer
        self._file     = file
        self._floor    = floor
        self.debugging = floor <= logging.DEBUG
        self._logger   = logger

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

        return self._logger.bind(logger=name) if name else self._logger

    def bind ( self, **fields: Any ) -> Logger:

        return self._logger.bind(**fields)

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

        with self._logger.span(event, level, **fields) as extra: yield extra

    @contextmanager
    def capture ( self ) -> Iterator[list[EventDict]]:

        captured = Capture(self, [])
        token    = CAPTURES.set((*CAPTURES.get(), captured))

        try: yield captured.events

        finally:

            captured.active = False
            CAPTURES.reset(token)

    def ms ( self, started: float ) -> float:

        return Logger.ms(started)

    def close ( self ) -> None:

        if self._sink is not None: self._sink.close()

        self._sink = None

    def _tap_ ( self, _: WrappedLogger, __: str, event: EventDict ) -> EventDict:

        for captured in CAPTURES.get():

            if captured.active and captured.owner is self: captured.events.append(dict(event))

        return event

    def _open_ ( self, file: Path | None ) -> Sink:

        if file is None: return Sink(sys.stderr)

        try:

            file.parent.mkdir(parents=True, exist_ok=True)

            return Sink(file.open("a", encoding="utf-8", errors="backslashreplace", buffering=1))

        except OSError as error: raise Fault(Code.INTERNAL, reason="log.open") from error
