from email.message import EmailMessage
from typing import override

from engine.adapter import Receipt
from engine.error import Code, Fault
from engine.rand import rand
from .arch import LONGEST, Message, PORT
from .mailer import Mailer
import aiosmtplib

class Smtp(Mailer):

    name = "smtp"

    def __init__ (
        self, host: str, port: int = 587, username: str = "", password: str = "", tls: bool = True, wait: float = 10.0,
    ) -> None:

        self.need(host=host)

        named: tuple[object, ...] = (host, username, password)
        flag: object = tls
        held: object = host
        knob: object = port
        pace: object = wait

        if type(held) is not str or not held.isprintable() or " " in held: raise self._unset_("host")
        if type(knob) is not int or not 0 < knob <= PORT: raise self._unset_("port")
        if not all(type(value) is str for value in named) or type(flag) is not bool: raise self._unset_("login")
        if not isinstance(pace, int | float) or type(pace) is bool or not 0 < pace <= LONGEST:

            raise self._unset_("wait")

        self._host     = host
        self._port     = port
        self._username = username
        self._password = password
        self._tls      = tls
        self._wait     = float(pace)

    @override
    async def send ( self, message: Message ) -> Receipt:

        email = EmailMessage()

        email["From"]    = message.sender or ""
        email["To"]      = ", ".join(message.to)
        email["Subject"] = message.subject

        if message.cc: email["Cc"] = ", ".join(message.cc)
        if message.reply_to: email["Reply-To"] = message.reply_to

        for key, value in message.headers.items(): email[key] = value

        email.set_content(message.text or " ")

        if message.html: email.add_alternative(message.html, subtype="html")

        for name, data, media in message.attachments:

            kind, _, sub = media.partition("/")

            email.add_attachment(data, maintype=kind or "application", subtype=sub or "octet-stream", filename=name)

        try:

            result = await aiosmtplib.send(
                email, hostname=self._host, port=self._port, username=self._username or None,
                password=self._password or None, start_tls=self._tls, timeout=self._wait,
                recipients=list(message.recipients()),
            )

        except (aiosmtplib.SMTPException, OSError) as error:

            raise Fault(Code.UNAVAILABLE, reason="mail.smtp", unknown=True) from error

        return Receipt(str(email["Message-ID"] or rand.hex(6)), "sent", { "reply": str(result[1])[:120] })

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="mail.settings", errors={ "setting": [what] })
