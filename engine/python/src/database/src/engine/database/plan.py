from dataclasses import dataclass, field
from typing import Any
from .arch import Operation


@dataclass(slots=True)
class Plan:

    operations : list[Operation] = field(default_factory=list)
    drift      : list[str] = field(default_factory=list)

    def add ( self, operation: Operation ) -> None:

        self.operations.append(operation)

    def by ( self, *safeties: str ) -> list[Operation]:

        return [operation for operation in self.operations if operation.safety in safeties]

    def empty ( self ) -> bool:

        return not self.operations

    def dump ( self ) -> dict[str, Any]:

        return { "operations": [operation.dump() for operation in self.operations], "drift": list(self.drift) }
