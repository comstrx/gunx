from .plural import Plural
from .translate import Translate

plural    = Plural()
translate = Translate(plural)

__all__ = ["Plural", "Translate", "plural", "translate"]
