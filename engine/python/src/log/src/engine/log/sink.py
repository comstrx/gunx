from contextlib import suppress
from typing import TextIO

import threading

class Sink:

    __slots__ = ("_lock", "_stream", "dropped")

    def __init__ ( self, stream: TextIO ) -> None:

        self._stream = stream
        self._lock   = threading.Lock()
        self.dropped = 0

    def msg ( self, message: str ) -> None:

        try:

            with self._lock:

                self._stream.write(f"{message}\n")
                self._stream.flush()

        except (OSError, ValueError): self.dropped += 1

    def close ( self ) -> None:

        with suppress(OSError, ValueError): self._stream.close()

    log = debug = info = warn = warning = error = critical = exception = fatal = failure = err = msg
