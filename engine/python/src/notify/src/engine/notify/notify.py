from collections.abc import Mapping, Sequence
from typing import Any

from engine.adapter import Manager, Receipt
from engine.error import Code, Fault
from .arch import Notice
from .pusher import Pusher

class Notify:

    def __init__ ( self ) -> None:

        self._manager: Manager[Pusher] = Manager("notify")
        self._sent = 0

    def setup ( self, pusher: Pusher | None = None ) -> None:

        held: object = pusher

        if held is not None and not isinstance(held, Pusher):

            raise Fault(Code.INTERNAL, reason="notify.settings", errors={ "setting": ["pusher"] })

        if pusher is not None: self._manager.use(pusher, default=True)

    def use ( self, pusher: Pusher, default: bool = False ) -> Pusher:

        return self._manager.use(pusher, default)

    def ready ( self ) -> bool:

        return self._manager.ready()

    def compose (
        self, tokens: str | Sequence[str], title: str, body: str, data: Mapping[str, str] | None = None, **options: Any,
    ) -> Notice:

        given: object = tokens

        if isinstance(given, str): targets: tuple[Any, ...] = (given,)
        elif isinstance(given, list | tuple): targets = tuple(dict.fromkeys(given))
        else: raise Fault(Code.VALIDATION, reason="notify.tokens", errors={ "tokens": ["is invalid"] })

        unknown = set(options) - { "badge", "sound", "urgent" }

        if unknown: raise Fault(Code.VALIDATION, reason="notify.notice", errors={ "options": sorted(unknown)[:8] })

        urgent = bool(options.get("urgent", False))

        return Notice(targets, title, body, dict(data or {}), options.get("badge"), options.get("sound"), urgent)

    async def push ( self, notice: Notice, pusher: str | None = None ) -> Receipt:

        if not isinstance(notice, Notice):

            raise Fault(Code.VALIDATION, reason="notify.notice", errors={ "notice": ["is invalid"] })

        receipt = await self._manager.get(pusher).push(notice)

        self._sent += 1

        return receipt

    def stats ( self ) -> dict[str, int]:

        return { "sent": self._sent }

    def describe ( self ) -> dict[str, Any]:

        return { **self._manager.describe(), **self.stats() }

    async def close ( self ) -> None:

        await self._manager.close()
