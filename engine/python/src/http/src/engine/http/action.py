from dataclasses import dataclass
from typing import TYPE_CHECKING

from .arch import Answer, Call
from .request import Request
from .response import Response

if TYPE_CHECKING:

    from .form import Form

@dataclass(frozen=True, slots=True)
class Action:

    form : type[Form]
    call : Call

    async def __call__ ( self, request: Request ) -> Answer:

        found = self.form.read(request)

        return Response.answer(await self.call(**found.arguments(request)))
