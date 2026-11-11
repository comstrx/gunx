from engine.database import Memory

from .model import Model

class Repository[M: Model](Memory[M]): ...
