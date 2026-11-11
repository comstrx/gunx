from .arch import Email, Mime, Url
from .parse import Parse

parse = Parse()

__all__ = ["Email", "Mime", "Parse", "Url", "parse"]
