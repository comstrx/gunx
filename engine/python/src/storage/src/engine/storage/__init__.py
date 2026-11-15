lazy from .arch import Policy, Stored
lazy from .disk import Disk
lazy from .drive import Drive
from .storage import Storage

storage = Storage()

__all__ = ["Disk", "Drive", "Policy", "Storage", "Stored", "storage"]
