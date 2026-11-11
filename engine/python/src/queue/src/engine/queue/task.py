from collections.abc import Mapping
from typing import Any

from .arch import BACKOFF, DEFAULT, Handler, TRIES
from .job import Job

class Task:

    def __init__ (
        self, name: str, handler: Handler, queue: str = DEFAULT, tries: int = TRIES, backoff: float = BACKOFF,
        timeout: float = 0.0, rate: tuple[int, float] | None = None,
    ) -> None:

        self.name    = name
        self.handler = handler
        self.queue   = queue
        self.tries   = tries
        self.backoff = backoff
        self.timeout = timeout
        self.rate    = rate

    def job ( self, payload: Mapping[str, Any], delay: float = 0.0, unique: str | None = None ) -> Job:

        return Job.make(self.name, payload, self.queue, self.tries, self.backoff, unique, self.timeout, delay)

    def describe ( self ) -> dict[str, Any]:

        return {
            "name": self.name, "queue": self.queue, "tries": self.tries, "backoff": self.backoff,
            "timeout": self.timeout, "rate": list(self.rate) if self.rate else None,
        }
