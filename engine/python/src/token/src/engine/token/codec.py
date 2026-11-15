from abc import ABC, abstractmethod
from collections.abc import Mapping
from typing import Any, ClassVar

from engine.adapter import Adapter
from engine.error import Code, Fault

class Codec(Adapter, ABC):

    __slots__ = ()

    family: ClassVar[str] = "token"

    @abstractmethod
    def encode ( self, body: dict[str, Any] ) -> str: ...

    @abstractmethod
    def decode ( self, text: str ) -> dict[str, Any]: ...

    def peek ( self, _text: str ) -> dict[str, Any]:

        raise Fault(Code.INTERNAL, reason="token.capability", errors={ "capability": ["peek"] })

    def rotate ( self, _keys: Mapping[str, str | bytes], _active: str ) -> Codec:

        raise Fault(Code.INTERNAL, reason="token.capability", errors={ "capability": ["rotate"] })
