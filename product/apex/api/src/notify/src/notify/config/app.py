from pathlib import Path
from typing import ClassVar

from engine.config import Settings, env

ROOT = Path(__file__).resolve().parents[1]

env.load(ROOT.parents[1])

class AppSettings(Settings):

    prefix: ClassVar[str] = "NOTIFY"

    name            : str = "notify"
    version         : str = "0.1.0"
    host            : str = "127.0.0.1"
    port            : int = 8103
    edge_secret     : str = "edge-secret-for-the-local-lab-0001"
    database_url    : str = "postgresql://engine:engine@127.0.0.1:5432/engine_test"
    database_schema : str = "notify"
    database_ssl    : str = ""
    amqp_url        : str = ""
    log_level       : str = "warning"

settings = AppSettings.load()
