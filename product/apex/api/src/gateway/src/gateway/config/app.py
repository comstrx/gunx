from pathlib import Path
from typing import ClassVar

from engine.config import Settings, env
from engine.validate import field

ROOT = Path(__file__).resolve().parents[1]

env.load(ROOT.parents[1])

class AppSettings(Settings):

    prefix: ClassVar[str] = "GATEWAY"

    name         : str = "gateway"
    version      : str = "0.1.0"
    host         : str = "127.0.0.1"
    port         : int = 8100
    token_secret : str = "token-secret-for-the-local-lab-0000000001"
    issuer       : str = "edge"
    edge_secret  : str = "edge-secret-for-the-local-lab-0001"
    iam_url      : str = "http://127.0.0.1:8101"
    hello_url    : str = "http://127.0.0.1:8102"
    notify_url   : str = "http://127.0.0.1:8103"
    origins      : list[str] = field(default_factory=list)
    log_level    : str = "warning"

settings = AppSettings.load()
