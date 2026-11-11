from .arch import Representation, Segment, Served, Upload, Variant
from .dash import Dash
from .hls import Hls
from .pipe import Pipe
from .range import Range
from .stream import Stream
from .tee import Tee
from .uploads import Uploads

stream = Stream()

__all__ = [
    "Dash", "Hls", "Pipe", "Range", "Representation", "Segment", "Served", "Stream", "Tee", "Upload", "Uploads",
    "Variant", "stream",
]
