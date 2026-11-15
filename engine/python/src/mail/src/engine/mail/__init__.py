lazy from .arch import Message
lazy from .http import Http
lazy from .log import Log
from .mail import Mail
lazy from .mailer import Mailer
lazy from .smtp import Smtp

mail = Mail()

__all__ = ["Http", "Log", "Mail", "Mailer", "Message", "Smtp", "mail"]
