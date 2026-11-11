from .arch import Answer, Next
from .request import Request

class Layer:

    async def handle ( self, request: Request, call: Next ) -> Answer:

        return await call(request)

    async def __call__ ( self, request: Request, call: Next ) -> Answer:

        return await self.handle(request, call)
