from dataclasses import dataclass, field
from typing import Any

from engine.error import Code, Fault

MAX_TOKENS = 500
TOKEN      = 4_096
TITLE      = 256
BODY       = 4_096
FACTS      = 64
FACT       = 1_024
BADGE      = 99_999
SOUND      = 64

@dataclass(frozen=True, slots=True)
class Notice:

    tokens : tuple[str, ...]
    title  : str
    body   : str
    data   : dict[str, str] = field(default_factory=dict)
    badge  : int | None = None
    sound  : str | None = None
    urgent : bool = False

    def __post_init__ ( self ) -> None:

        self._targeted_()
        self._worded_()

        if self.badge is not None and (type(self.badge) is not int or not 0 <= self.badge <= BADGE):

            raise self._wrong_("badge")
        if self.sound is not None and not self._text_(self.sound, SOUND): raise self._wrong_("sound")
        if type(self.urgent) is not bool: raise self._wrong_("urgent")

    def _targeted_ ( self ) -> None:

        tokens: object = self.tokens

        if not isinstance(tokens, list | tuple) or not 0 < len(tokens) <= MAX_TOKENS: raise self._wrong_("tokens")
        if not all(self._text_(token, TOKEN) and " " not in token for token in tokens): raise self._wrong_("tokens")
        if len(set(tokens)) != len(tokens): raise self._wrong_("tokens")

        object.__setattr__(self, "tokens", tuple(tokens))

    def _worded_ ( self ) -> None:

        facts: object = self.data

        if not self._text_(self.title, TITLE): raise self._wrong_("title")
        if type(self.body) is not str or len(self.body) > BODY: raise self._wrong_("body")
        if not isinstance(facts, dict) or len(facts) > FACTS: raise self._wrong_("data")

        for key, value in facts.items():

            if not self._text_(key, FACT) or type(value) is not str or len(value) > FACT: raise self._wrong_("data")

    def dump ( self ) -> dict[str, Any]:

        return {
            "tokens": list(self.tokens), "title": self.title, "body": self.body, "data": self.data, "badge": self.badge,
            "sound": self.sound, "urgent": self.urgent,
        }

    @staticmethod
    def _text_ ( value: object, most: int ) -> bool:

        return type(value) is str and 0 < len(value) <= most and value.isprintable()

    @staticmethod
    def _wrong_ ( what: str ) -> Fault:

        reason = "notify.tokens" if what == "tokens" else "notify.notice"

        return Fault(Code.VALIDATION, reason=reason, errors={ what: ["is invalid"] })
