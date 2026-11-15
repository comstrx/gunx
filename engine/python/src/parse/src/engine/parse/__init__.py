lazy from .arch import Email, Mime, Url
lazy from .document import Document
from .parse import Parse

parse = Parse()

__all__ = ["Document", "Email", "Mime", "Parse", "Url", "parse"]
