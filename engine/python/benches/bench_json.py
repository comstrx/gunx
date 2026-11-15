from collections.abc import AsyncIterator
from engine.json import json
from engine.test import Bench
from copy import deepcopy
from typing import Any
from types import MappingProxyType
import tracemalloc, gc

bench = Bench()

payload = { "id": 1, "name": "عبد الرحمن", "tags": ["a", "b"], "nested": { "x": 1.5, "ok": True, "n": None } }
encoded = json.encode(payload)

bench.measure("json.encode", lambda: json.encode(payload))
bench.measure("json.decode", lambda: json.decode(encoded))
bench.measure("json.equal", lambda: json.equal(payload, payload))


nested: dict[str, Any] = { f"k{i}": { "values": list(range(20)), "meta": { "name": "value" } } for i in range(60) }
paths  = tuple(f"k{i}.meta" for i in range(25))

bench.measure("json.omit.nested", lambda: json.omit(nested, *paths), rounds=200)
bench.measure("json.put.root", lambda: json.put(nested, "", {}))


async def rows () -> AsyncIterator[object]:

    for _ in range(1000): yield payload

async def streamed () -> None:

    async for _ in json.encode_stream(rows()): pass

Bench.run(bench.measure_async("json.encode_stream.1000", streamed, rounds=100))

prunable = { str(index): (index if index % 3 else None) for index in range(5000) }
bench.measure("json.prune.wide", lambda: json.prune(prunable), rounds=100)

bench.measure("json.get.nested", lambda: json.get(payload, "nested.x"))
bench.measure("json.pick.25", lambda: json.pick(nested, *paths), rounds=500)
bench.measure("json.put.leaf", lambda: json.put(nested, "k1.meta.name", "new"), rounds=200)
bench.measure("json.flatten", lambda: json.flatten(nested), rounds=500)
bench.measure("json.paths", lambda: json.paths(nested), rounds=500)
bench.measure("json.lines.100", lambda: json.lines([payload] * 100), rounds=500)

changed = deepcopy(nested)
changed["k1"]["meta"]["name"] = "changed"
operations = json.diff(nested, changed)

bench.measure("json.diff.detached", lambda: json.diff(nested, changed), rounds=200)
bench.measure("json.patch", lambda: json.patch(nested, operations), rounds=200)
bench.measure("json.embed", lambda: json.embed({ "text": "</script>&" }))

for name, measure in (
    ("pick.25", lambda: json.pick(nested, *paths)),
    ("flatten", lambda: json.flatten(nested)),
    ("patch", lambda: json.patch(nested, operations)),
):

    gc.collect()
    tracemalloc.start()
    measure()
    retained, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    print(f"json.{name} retained_bytes={retained} peak_bytes={peak}")

frozen = MappingProxyType(payload)
bench.measure("json.encode.mapping", lambda: json.encode(frozen))

line_rows = [payload] * 1000
bench.measure("json.lines.1000", lambda: json.lines(iter(line_rows)), rounds=300)
tracemalloc.start()
json.lines(iter(line_rows))
line_retained, line_peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
print(f"json.lines.1000 retained_bytes={line_retained} peak_bytes={line_peak}")

document = {str(index): index for index in range(1000)}
updates = {str(index): -index for index in range(20)}
bench.measure("json.edit.batch", lambda: json.edit(document, updates), rounds=500)

walk_tree = {f"k{index}": {"value": index} for index in range(200)}
bench.measure("json.walk.keys", lambda: json.walk(walk_tree, lambda item: item, keys=str.upper), rounds=500)
