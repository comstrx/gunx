from engine.json import json
from engine.test import Bench

bench = Bench()

payload = { "id": 1, "name": "عبد الرحمن", "tags": ["a", "b"], "nested": { "x": 1.5, "ok": True, "n": None } }
encoded = json.encode(payload)

bench.measure("json.encode", lambda: json.encode(payload))
bench.measure("json.decode", lambda: json.decode(encoded))
bench.measure("json.equal", lambda: json.equal(payload, payload))
