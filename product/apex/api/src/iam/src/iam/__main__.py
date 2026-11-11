from .bootstrap.app import make
from .config.app import settings

make().serve(host=settings.host, port=settings.port)
