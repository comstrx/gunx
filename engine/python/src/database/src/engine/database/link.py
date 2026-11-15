from typing import override

from .arch import RESET_SESSION
import asyncpg

class Link(asyncpg.Connection):

    @override
    def get_reset_query ( self ) -> str:

        held = getattr(self, "_engine_reset", None)

        if held is None:

            held = super().get_reset_query() + RESET_SESSION
            self._engine_reset = held

        return str(held)
