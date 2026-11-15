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

        with self._lock:

            try:

                self._stream.write(f"{message}\n")
                self._stream.flush()

            except (OSError, ValueError): self.dropped += 1

    def close ( self ) -> None:

        with self._lock, suppress(OSError, ValueError): self._stream.close()

    log = debug = info = warn = warning = error = critical = exception = fatal = failure = err = msg
