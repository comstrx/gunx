from engine.validate import Resource as Base

from .model import Model

class Resource[M: Model](Base[M]): ...
