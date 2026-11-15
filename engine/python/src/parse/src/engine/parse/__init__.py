lazy from .email import Email
lazy from .mime import Mime
lazy from .url import Url
lazy from .document import Document
from .parse import Parse

parse = Parse()

__all__ = ["Document", "Email", "Mime", "Parse", "Url", "parse"]
