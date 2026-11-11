from .arch import Policy, Stored
from .disk import Disk
from .drive import Drive
from .storage import Storage

storage = Storage()

__all__ = ["Disk", "Drive", "Policy", "Storage", "Stored", "storage"]
