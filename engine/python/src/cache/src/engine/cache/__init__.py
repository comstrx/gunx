from .arch import Hit
from .cache import Cache
from .channel import Channel
from .memory import Memory
from .redis import Redis
from .store import Store
from .tagged import Tagged

cache = Cache()

__all__ = ["Cache", "Channel", "Hit", "Memory", "Redis", "Store", "Tagged", "cache"]
