from engine.database import Repository as Base

from .model import Model

class Repository[M: Model](Base[M]): ...
