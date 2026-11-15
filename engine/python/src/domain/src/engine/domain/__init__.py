lazy from .arch import Record
lazy from .dns import Dns
from .domains import Domains
lazy from .registrar import Registrar

domains = Domains()

__all__ = ["Dns", "Domains", "Record", "Registrar", "domains"]
