from collections.abc import Iterable

from engine.error import Code, Fault
from engine.rand import rand

from ..models import Greeting
from ..utils.cycle import Repository

FALLBACK = "en"

class Greetings(Repository[Greeting]):

    def __init__ ( self, rows: Iterable[Greeting] = () ) -> None:

        super().__init__(Greeting, rows)

    async def match ( self, locale: str, tone: str ) -> Greeting:

        found = await self.first(locale=locale, tone=tone) or await self.first(locale=FALLBACK, tone=tone)

        if found is None: raise Fault(Code.NOT_FOUND, reason="hello.greeting", errors={ "locale": [locale] })

        return found

    def compose ( self, locale: str, text: str, tone: str ) -> Greeting:

        return self.make(id=str(rand.uuid7()), locale=locale, text=text, tone=tone)

    def locales ( self ) -> tuple[str, ...]:

        return tuple(sorted({ row.locale for row in self.snapshot() }))
