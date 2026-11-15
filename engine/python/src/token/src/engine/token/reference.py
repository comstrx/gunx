from typing import Any, ClassVar, override

from engine.error import Code, Fault
from engine.rand import rand
from .arch import ENTROPY, OPAQUE_LENGTH, bounded, refused, unpack
from .codec import Codec

class Reference(Codec):

    __slots__ = ()

    name: ClassVar[str] = "opaque"
    capabilities: ClassVar[frozenset[str]] = frozenset({ "issue", "verify", "stored" })

    @override
    def encode ( self, _body: dict[str, Any] ) -> str:

        return rand.token(ENTROPY)

    @override
    def decode ( self, text: str ) -> dict[str, Any]:

        self.check(text)

        raise Fault(Code.INTERNAL, reason="token.store")

    def check ( self, text: str ) -> None:

        bounded(text)

        if len(text) != OPAQUE_LENGTH or len(unpack(text)) != ENTROPY: raise refused()
