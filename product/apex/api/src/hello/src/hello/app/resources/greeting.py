from typing import Any, override

from ..models import Greeting
from ..utils.cycle import Resource

class GreetingResource(Resource[Greeting]):

    @classmethod
    @override
    def dump ( cls, item: Greeting ) -> dict[str, Any]:

        return { "message": item.text, "locale": item.locale, "tone": item.tone.value }
