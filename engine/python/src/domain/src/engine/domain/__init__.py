from .arch import Record
from .dns import Dns
from .domains import Domains
from .registrar import Registrar

domains = Domains()

__all__ = ["Dns", "Domains", "Record", "Registrar", "domains"]
