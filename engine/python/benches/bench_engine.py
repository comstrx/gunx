import engine
from engine.json import json
from engine.test import Bench

bench = Bench()
payload = { "active": True, "items": [1, 2, 3] }

def facade () -> bytes:

    return engine.json.json.encode(payload)

bench.measure("engine.facade.json", facade)
bench.measure("engine.direct.json", lambda: json.encode(payload))
