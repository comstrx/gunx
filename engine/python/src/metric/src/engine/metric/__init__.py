lazy from .arch import MEDIA
lazy from .counter import Counter
lazy from .gauge import Gauge
lazy from .histogram import Histogram
lazy from .meter import Meter
from .metrics import Metrics

metrics = Metrics()

__all__ = ["MEDIA", "Counter", "Gauge", "Histogram", "Meter", "Metrics", "metrics"]
