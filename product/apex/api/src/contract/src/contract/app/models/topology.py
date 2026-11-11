from collections.abc import Iterable
from dataclasses import dataclass
from typing import Self

from ...config.services import SERVICES, may_call
from .boundary import Boundary

METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
UNSAFE  = ("POST", "PATCH")

@dataclass(frozen=True, slots=True)
class Topology:

    boundaries : tuple[Boundary, ...]

    def issues ( self ) -> list[str]:

        found: list[str] = []

        for boundary in self.boundaries:

            if boundary.caller not in SERVICES: found.append(f"{boundary.caller}: unknown caller")
            if boundary.callee not in SERVICES: found.append(f"{boundary.callee}: unknown callee")
            known = boundary.caller in SERVICES and boundary.callee in SERVICES

            if known and not may_call(boundary.caller, boundary.callee):

                found.append(f"{boundary.caller} -> {boundary.callee}: a call must go to a larger layer")

            if boundary.method not in METHODS: found.append(f"{boundary.path}: unknown method {boundary.method}")
            if boundary.method in UNSAFE and boundary.idempotency == "none":

                found.append(f"{boundary.path}: an unsafe call names its idempotency identity")

            if not boundary.path.startswith("/"): found.append(f"{boundary.path}: a path starts with /")
            if boundary.scope == "": found.append(f"{boundary.path}: a boundary states its scope")

        return found

    def of ( self, caller: str ) -> tuple[Boundary, ...]:

        return tuple(boundary for boundary in self.boundaries if boundary.caller == caller)

    def callees ( self ) -> tuple[str, ...]:

        return tuple(sorted({ boundary.callee for boundary in self.boundaries }))

    @classmethod
    def declare ( cls, boundaries: Iterable[Boundary] ) -> Self:

        return cls(tuple(boundaries))
