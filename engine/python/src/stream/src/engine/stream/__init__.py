lazy from .arch import Representation, Segment, Served, Upload, Variant
lazy from .dash import Dash
lazy from .hls import Hls
lazy from .pipe import Pipe
lazy from .range import Range
from .stream import Stream
lazy from .tee import Tee
lazy from .uploads import Uploads

stream = Stream()

__all__ = [
    "Dash", "Hls", "Pipe", "Range", "Representation", "Segment", "Served", "Stream", "Tee", "Upload", "Uploads",
    "Variant", "stream",
]
