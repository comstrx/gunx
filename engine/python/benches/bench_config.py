from engine.config import Config, Env, Settings
from engine.test import Bench
from engine.validate import field
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import ClassVar

LAB = "lab-only-value-lab-only-value"

class Service(Settings):

    prefix: ClassVar[str] = "BENCH"

    name         : str = "service"
    host         : str = "127.0.0.1"
    port         : int = 8000
    workers      : int = 4
    debug        : bool = False
    ratio        : float = 0.5
    origins      : list[str] = field(default_factory=list)
    tags         : dict[str, str] = field(default_factory=dict)
    database_url : str = "postgres://app:lab@127.0.0.1:5432/app"
    cache_url    : str = "redis://127.0.0.1:6379/0"
    token_secret : str = LAB
    edge_secret  : str | None = None

bench  = Bench()
env    = Env()
config = Config()
source = {
    "ENGINE_ENV": "production", "BENCH_NAME": "orders", "BENCH_PORT": "9000", "BENCH_WORKERS": "8", "BENCH_DEBUG": "yes",
    "BENCH_RATIO": "0.25", "BENCH_ORIGINS": "https://a.example,https://b.example", "BENCH_TAGS": '{"tier":"gold"}',
    "BENCH_DATABASE_URL": "postgres://app:s3cr3t-s3cr3t-s3cr3t@db.internal:5432/app?sslmode=require",
    "BENCH_CACHE_URL": "redis://cache.internal:6379/0", "BENCH_TOKEN_SECRET": "vault-secret-vault-secret-vault",
    "BENCH_EDGE_SECRET": "edge-secret-edge-secret", "BENCH_TYPO": "1", "PATH": "/usr/bin", "HOME": "/root",
}
loaded = Service.load(source)
folder = TemporaryDirectory()
root   = Path(folder.name)
lines  = [
    "# service settings", "", "BENCH_NAME=orders", "BENCH_HOST=db.internal", "export BENCH_PORT=9000 # the edge port",
    'BENCH_DATABASE_URL="postgres://app:${BENCH_DB_PASSWORD}@${BENCH_HOST}:5432/app"', "BENCH_DB_PASSWORD='s3cr3t $pass'",
    "BENCH_CACHE_URL=redis://${BENCH_HOST}:6379/0", 'BENCH_BANNER="line one\\nline two"', "BENCH_ORIGINS=https://a.example,https://b.example",
    *(f"BENCH_EXTRA_{number}=value-{number}" for number in range(20)),
]

(root / ".env").write_text("\n".join(lines) + "\n")
(root / ".env.local").write_text("BENCH_HOST=127.0.0.1\nBENCH_DEBUG=yes\n")

config.register("service", Service, source)
env.load(root)
env.set("BENCH_COUNT", "42")
env.set("BENCH_LIST", "a, b, c")

def load () -> None: Service.load(source)

def defaults () -> None: Service.load({})

def environ () -> None: Service.load()

def describe () -> None: loaded.describe()

def stray () -> None: Service.stray(source)

def register () -> None: config.register("service", Service, source)

def of () -> None: config.of(Service)

def read () -> None: env.read(root / ".env")

def layered () -> None: env.load(root)

def integer () -> None: env.integer("BENCH_COUNT")

def text () -> None: env.text("BENCH_NAME")

def listed () -> None: env.list("BENCH_LIST")

bench.measure("config.load", load)
bench.measure("config.load.defaults", defaults)
bench.measure("config.load.environ", environ)
bench.measure("config.describe", describe)
bench.measure("config.stray", stray)
bench.measure("config.register", register)
bench.measure("config.of", of)
bench.measure("env.read", read, 4000)
bench.measure("env.load", layered, 4000)
bench.measure("env.integer", integer)
bench.measure("env.text", text)
bench.measure("env.list", listed)

for key in list(env.all("BENCH_")): env.forget(key)

folder.cleanup()
