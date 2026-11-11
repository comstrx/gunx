from typing import ClassVar

from engine.database import Table

from ...database.migrations.greetings import greetings
from ..enums import Tone
from ..utils.cycle import Model

class Greeting(Model):

    table    : ClassVar[Table] = greetings
    fillable : ClassVar[tuple[str, ...]] = ("text", "tone")

    id     : str
    locale : str
    text   : str
    tone   : Tone = Tone.PLAIN
