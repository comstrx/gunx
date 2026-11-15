lazy from .arch import Sample
lazy from .bench import Bench
lazy from .client import Client
lazy from .reply import Reply
from .stage import Stage

stage = Stage()

__all__ = ["Bench", "Client", "Reply", "Sample", "Stage", "stage"]
