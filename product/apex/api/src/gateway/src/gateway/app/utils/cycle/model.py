from engine.database import Model as Base

from ..dna import Dna

class Model(Dna, Base): ...
