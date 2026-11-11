from collections.abc import Mapping, Sequence
from typing import Any

from engine.adapter import Manager, Receipt
from engine.error import Code, Fault
from engine.log import log
from engine.validate import rules
from engine.view import view
from .arch import Message, NAME
from .mailer import Mailer

RECIPIENTS = {
    "to": "required|list", "to.*": "required|email", "cc": "list", "cc.*": "email", "bcc": "list", "bcc.*": "email",
}

class Mail:

    def __init__ ( self ) -> None:

        self._manager: Manager[Mailer] = Manager("mail")
        self._sender  = "engine@example.test"
        self._name    = "Engine"
        self._sent    = 0

    def setup ( self, sender: str, name: str, mailer: Mailer | None = None ) -> None:

        held: object = mailer

        rules.check({ "sender": sender }, { "sender": "required|email" }, "mail.sender")

        if type(name) is not str or not 0 < len(name) <= NAME or not name.isprintable() or set(name) & set('<>,;"'):

            raise Fault(Code.INTERNAL, reason="mail.settings", errors={ "setting": ["name"] })

        if held is not None and not isinstance(held, Mailer):

            raise Fault(Code.INTERNAL, reason="mail.settings", errors={ "setting": ["mailer"] })

        self._sender = sender
        self._name   = name

        if mailer is not None: self._manager.use(mailer, default=True)

    def use ( self, mailer: Mailer, default: bool = False ) -> Mailer:

        return self._manager.use(mailer, default)

    def mailer ( self, name: str | None = None ) -> Mailer:

        return self._manager.get(name)

    def ready ( self ) -> bool:

        return self._manager.ready()

    def sender ( self ) -> str:

        return f"{self._name} <{self._sender}>"

    def compose (
        self, to: str | Sequence[str], subject: str, text: str = "", html: str = "", **extra: Any,
    ) -> Message:

        given: object = to
        targets = (given,) if isinstance(given, str) else tuple(given) if isinstance(given, list | tuple) else ()
        unknown = set(extra) - { "sender", "reply_to", "cc", "bcc", "headers", "attachments" }

        if not targets or not subject: raise Fault(Code.VALIDATION, reason="mail.message")
        if unknown: raise Fault(Code.VALIDATION, reason="mail.message", errors={ "options": sorted(unknown)[:8] })

        copies = self._listed_(extra.get("cc", ())), self._listed_(extra.get("bcc", ()))

        rules.check({ "to": list(targets), "cc": list(copies[0]), "bcc": list(copies[1]) }, RECIPIENTS, "mail.to")

        return Message(
            targets, subject, text, html, extra.get("sender") or self.sender(), extra.get("reply_to"), copies[0],
            copies[1], dict(extra.get("headers") or {}), tuple(extra.get("attachments") or ()),
        )

    async def render ( self, to: str | Sequence[str], subject: str, template: str, **data: Any ) -> Message:

        html = await view.render(template, **data)

        return self.compose(to, subject, html=html, text=data.get("text", ""))

    async def send ( self, message: Message, mailer: str | None = None ) -> Receipt:

        if not isinstance(message, Message): raise Fault(Code.VALIDATION, reason="mail.message")

        chosen  = self._manager.get(mailer)
        receipt = await chosen.send(message)

        self._sent += 1

        log.info("mail.sent", to=len(message.to), subject=message.subject[:60], mailer=chosen.name, id=receipt.id)

        return receipt

    def stats ( self ) -> dict[str, int]:

        return { "sent": self._sent }

    def describe ( self ) -> dict[str, Any]:

        return { "sender": self.sender(), **self._manager.describe(), **self.stats() }

    async def close ( self ) -> None:

        await self._manager.close()

    @staticmethod
    def _listed_ ( given: object ) -> tuple[Any, ...]:

        if isinstance(given, str): return (given,)
        if isinstance(given, list | tuple): return tuple(given)

        raise Fault(Code.VALIDATION, reason="mail.to")

    def headers ( self, message: Message ) -> Mapping[str, str]:

        base = { "From": message.sender or self.sender(), "To": ", ".join(message.to), "Subject": message.subject }

        return { **base, **message.headers }
