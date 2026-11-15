from collections.abc import Iterable, Sequence
from typing import Any, override

from aiokafka.abc import ConsumerRebalanceListener
from engine.error import Code, Fault
from .arch import KAFKA_TAG, Message, STALE

class Cursor(ConsumerRebalanceListener):

    def __init__ ( self ) -> None:

        self._epochs: dict[Any, object] = {}
        self._pending: dict[Any, dict[int, bool]] = {}

    @override
    async def on_partitions_revoked ( self, revoked: Iterable[Any] ) -> None:

        for partition in revoked:

            self._epochs.pop(partition, None)
            self._pending.pop(partition, None)

    @override
    async def on_partitions_assigned ( self, assigned: Iterable[Any] ) -> None:

        for partition in assigned:

            if partition in self._epochs: continue

            self._epochs[partition] = object()
            self._pending[partition] = {}

    def seen ( self, partition: Any, offset: int ) -> tuple[Any, int, object]:

        if partition not in self._epochs: raise Fault(Code.CONFLICT, reason=STALE)

        self._pending[partition][offset] = False

        return partition, offset, self._epochs[partition]

    def count ( self ) -> int:

        return sum(map(len, self._pending.values()))

    def mark ( self, messages: Sequence[Message] ) -> dict[Any, int]:

        for message in messages:

            if not isinstance(message.tag, tuple) or len(message.tag) != KAFKA_TAG:

                raise Fault(Code.CONFLICT, reason=STALE)

            partition, offset, epoch = message.tag

            if self._epochs.get(partition) != epoch or offset not in self._pending.get(partition, {}):

                raise Fault(Code.CONFLICT, reason=STALE)

        for message in messages:

            partition, offset, _ = message.tag

            self._pending[partition][offset] = True

        marks: dict[Any, int] = {}

        for partition, pending in self._pending.items():

            for offset, done in pending.items():

                if not done: break

                marks[partition] = offset + 1

        return marks

    def committed ( self, marks: dict[Any, int] ) -> None:

        for partition, limit in marks.items():

            pending = self._pending.get(partition, {})

            for offset in tuple(pending):

                if offset < limit: del pending[offset]
