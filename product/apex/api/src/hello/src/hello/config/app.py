from pathlib import Path
from typing import ClassVar

from engine.config import Settings, env

ROOT = Path(__file__).resolve().parents[1]

env.load(ROOT.parents[1])

class AppSettings(Settings):

    prefix: ClassVar[str] = "HELLO"

    name       : str = "hello"
    version    : str = "0.1.0"
    host       : str = "127.0.0.1"
    port       : int = 8102
    edge_secret: str = "edge-secret-for-the-local-lab-0001"
    log_level  : str = "warning"

settings = AppSettings.load()
