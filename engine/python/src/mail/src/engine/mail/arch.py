from dataclasses import dataclass, field
from typing import Any

from engine.error import Code, Fault
from engine.string import string
import re

ADDRESS     = 320
TRIPLE      = 3
SUBJECT     = 998
BODY        = 4 * 1024 * 1024
HEADERS     = 64
HEADER      = 998
FILENAME    = 255
ATTACHMENTS = 25 * 1024 * 1024
RECIPIENTS  = 500
PORT        = 65_535
LONGEST     = 300.0
NAME        = 128
TOKEN       = re.compile(r"[!#$%&'*+.^_`|~0-9A-Za-z-]{1,76}")
MEDIA       = re.compile(r"[A-Za-z0-9!#$&^_.+-]{1,64}/[A-Za-z0-9!#$&^_.+-]{1,64}")
RESERVED    = frozenset({
    "from", "to", "cc", "bcc", "subject", "reply-to", "content-type", "content-transfer-encoding", "mime-version",
})

@dataclass(frozen=True, slots=True)
class Message:

    to          : tuple[str, ...]
    subject     : str
    text        : str = ""
    html        : str = ""
    sender      : str | None = None
    reply_to    : str | None = None
    cc          : tuple[str, ...] = ()
    bcc         : tuple[str, ...] = ()
    headers     : dict[str, str] = field(default_factory=dict)
    attachments : tuple[tuple[str, bytes, str], ...] = ()

    def __post_init__ ( self ) -> None:

        for what in ("to", "cc", "bcc"): object.__setattr__(self, what, self._addresses_(getattr(self, what), what))

        if not self.to: raise self._wrong_("to")
        if len(self.recipients()) > RECIPIENTS: raise self._wrong_("recipients")
        if not self._line_(self.subject, SUBJECT) or not self.subject.strip(): raise self._wrong_("subject")
        if type(self.text) is not str or len(self.text) > BODY: raise self._wrong_("text")
        if type(self.html) is not str or len(self.html) > BODY: raise self._wrong_("html")
        if self.sender is not None and not self._line_(self.sender, ADDRESS): raise self._wrong_("sender")
        if self.reply_to is not None and not self._line_(self.reply_to, ADDRESS): raise self._wrong_("reply_to")

        self._headed_()
        self._attached_()

    def recipients ( self ) -> tuple[str, ...]:

        return (*self.to, *self.cc, *self.bcc)

    def dump ( self ) -> dict[str, Any]:

        return {
            "to": list(self.to), "subject": self.subject, "text": self.text, "html": self.html, "sender": self.sender,
            "reply_to": self.reply_to, "cc": list(self.cc), "bcc": list(self.bcc), "headers": dict(self.headers),
            "attachments": [
                { "name": name, "media": media, "size": len(data), "data": string.base64(data) }
                for name, data, media in self.attachments
            ],
        }

    def _addresses_ ( self, given: object, what: str ) -> tuple[str, ...]:

        if not isinstance(given, list | tuple): raise self._wrong_(what)
        if not all(self._line_(item, ADDRESS) and " " not in item and "@" in item for item in given):

            raise self._wrong_(what)

        return tuple(given)

    def _headed_ ( self ) -> None:

        held: object = self.headers

        if not isinstance(held, dict) or len(held) > HEADERS: raise self._wrong_("headers")

        for name, value in held.items():

            if type(name) is not str or not TOKEN.fullmatch(name) or name.lower() in RESERVED:

                raise self._wrong_("headers")
            if not self._line_(value, HEADER): raise self._wrong_("headers")

    def _attached_ ( self ) -> None:

        held: object = self.attachments
        total = 0

        if not isinstance(held, list | tuple): raise self._wrong_("attachments")

        for item in held:

            if not isinstance(item, tuple) or len(item) != TRIPLE: raise self._wrong_("attachments")

            name, data, media = item

            if not self._line_(name, FILENAME) or set(name) & set("/\\\0"): raise self._wrong_("attachments")
            if not isinstance(data, bytes | bytearray) or type(media) is not str or not MEDIA.fullmatch(media):

                raise self._wrong_("attachments")

            total += len(data)

        if total > ATTACHMENTS: raise self._wrong_("attachments")

        object.__setattr__(self, "attachments", tuple(held))

    @staticmethod
    def _line_ ( value: object, most: int ) -> bool:

        return type(value) is str and 0 < len(value) <= most and value.isprintable()

    @staticmethod
    def _wrong_ ( what: str ) -> Fault:

        return Fault(Code.VALIDATION, reason="mail.message", errors={ what: ["is invalid"] })
