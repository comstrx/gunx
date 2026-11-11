from .arch import MEDIA
from .counter import Counter
from .gauge import Gauge
from .histogram import Histogram
from .meter import Meter
from .metrics import Metrics

metrics = Metrics()

__all__ = ["MEDIA", "Counter", "Gauge", "Histogram", "Meter", "Metrics", "metrics"]
