from collections.abc import Mapping
from typing import Any, ClassVar, Self

from engine.error import Code, Fault
from engine.validate import Shape, rules, validator
from .action import Action
from .arch import Call, CARRIED
from .request import Request

class Form(Shape):

    rules   : ClassVar[Mapping[str, str]] = {}
    reason  : ClassVar[str] = "validate.rules"
    carries : ClassVar[tuple[str, ...]] = ()

    @classmethod
    def prepare ( cls, data: dict[str, Any] ) -> dict[str, Any]:

        return { key: value.strip() if type(value) is str else value for key, value in data.items() }

    @classmethod
    def read ( cls, request: Request ) -> Self:

        if request.body and not request.json_body():

            raise Fault(Code.UNSUPPORTED_MEDIA, reason="http.media", errors={ "content-type": ["must be JSON"] })

        data = cls.prepare({ **request.queries(), **request.payload(), **request.params() })

        return validator.shape(cls, rules.check(data, cls.rules, cls.reason) if cls.rules else data)

    @classmethod
    def to ( cls, call: Call ) -> Action:

        unknown = sorted(set(cls.carries) - set(CARRIED))

        if unknown: raise Fault(Code.INTERNAL, reason="http.carries", errors={ cls.__name__: unknown })

        return Action(cls, call)

    def arguments ( self, request: Request ) -> dict[str, Any]:

        given = { member.name: getattr(self, member.name) for member in self.members() }

        for name in self.carries: given[name] = CARRIED[name](request)

        return given
