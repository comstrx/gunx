lazy from .arch import Hit
from .cache import Cache
lazy from .channel import Channel
lazy from .memory import Memory
lazy from .redis import Redis
lazy from .store import Store
lazy from .tagged import Tagged

cache = Cache()

__all__ = ["Cache", "Channel", "Hit", "Memory", "Redis", "Store", "Tagged", "cache"]
