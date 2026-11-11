from typing import ClassVar

from engine.validate import Shape
from .job import Job
from .queue import Queue, queue

class Work(Shape):

    name: ClassVar[str] = ""

    async def dispatch ( self, delay: float = 0.0, unique: str | None = None, bus: Queue | None = None ) -> Job:

        return await (bus or queue).push(self.name, self.dump(), delay, unique)
