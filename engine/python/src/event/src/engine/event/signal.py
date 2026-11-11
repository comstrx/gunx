from typing import ClassVar

from engine.validate import Shape
from .event import Event
from .events import Events, events

class Signal(Shape):

    name: ClassVar[str] = ""

    async def dispatch (
        self, bus: Events | None = None, actor: str | None = None, tenant: str | None = None,
    ) -> Event:

        held = (bus or events).make(self.name, **self.dump())
        made = Event(
            name=held.name, data=held.data, id=held.id, at=held.at, actor=actor or held.actor,
            tenant=tenant or held.tenant, source=held.source, version=held.version,
        )

        return await (bus or events).dispatch(made)
