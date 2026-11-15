from engine.test import Bench
from engine.validate import Resource, Rules, Shape, rules, validator

from typing import ClassVar
import gc, tracemalloc

bench = Bench()

class Signup(Shape):

    email : str
    name  : str
    age   : int = 18

payload = b'{"email": "a@b.co", "name": "Ann", "age": 30}'
spec    = { "email": "required|email", "name": "required|max:64", "age": "integer|between:18,99" }
mapping = { "email": "a@b.co", "name": "Ann", "age": 30 }

bench.measure("validate.shape", lambda: validator.shape(Signup, payload))
bench.measure("validate.rules", lambda: rules.check(mapping, spec))

bench.measure("validate.fields", Signup.fields)
bench.measure("validate.members", Signup.members)
buffer = bytearray(payload)
bench.measure("validate.buffer", lambda: validator.shape(Signup, buffer))

plan = rules.prepare(spec)
rows = {"items": [{"id": index, "name": "item"} for index in range(100)]}
nested = rules.prepare({"items.*.id": "required|integer", "items.*.name": "string"})
conditions = {"kind": "paid", "amount": 12}
conditional = rules.prepare({"kind": "string", "amount": "required_if:kind,paid|integer|min:1"})
made = Signup(email="a@b.co", name="Ann", age=30)

class Private(Shape):

    hidden: ClassVar[tuple[str, ...]] = ("secret",)
    name: str
    secret: str

class Bundle(Shape):

    values: list[Private]

private = Private(name="Ann", secret=made.email)
bundle = Bundle(values=[private] * 100)

bench.measure("validate.prepared", lambda: plan.check(mapping))
bench.measure("validate.plan_facade", lambda: rules.check(mapping, plan))
bench.measure("validate.mapping", lambda: validator.shape(Signup, mapping))
bench.measure("validate.copy", lambda: made.copy(age=31))
bench.measure("validate.dump", made.dump)
bench.measure("validate.hidden", private.dump)
bench.measure("validate.hidden100", bundle.dump, rounds=1000)
bench.measure("validate.nested100", lambda: nested.check(rows), rounds=1000)
bench.measure("validate.conditional", lambda: conditional.check(conditions))
bench.measure("validate.resource100", lambda: Resource.many([made] * 100), rounds=1000)
bench.measure("validate.large_integer", lambda: rules.check({"value": 2 ** 60 + 1}, {"value": f"size:{2 ** 60 + 1}"}))
bench.measure("validate.prepare_cold", lambda: Rules(cache=0).prepare(spec), rounds=1000)

for name, work in (
    ("rules", lambda: rules.check(mapping, spec)), ("prepared", lambda: plan.check(mapping)),
    ("nested100", lambda: nested.check(rows)), ("copy", lambda: made.copy(age=31)), ("hidden100", bundle.dump),
):

    gc.collect()
    tracemalloc.start()
    retained = work()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    print(f"validate.{name} retained_bytes={current} peak_bytes={peak}")

class Rows(Shape):

    rows: list[dict[str, int]]

class Editable(Signup):

    fillable: ClassVar[tuple[str, ...]] = ("age",)

editable = Editable(email="a", name="Ann", age=30)
many_rows = Rows(rows=[{"id": index} for index in range(100)])
patch = plan.partial()
invalid = {"email": "wrong", "name": "Ann", "age": 12}

bench.measure("validate.copy100", many_rows.copy, rounds=1000)
bench.measure("validate.fill", lambda: editable.fill(age=31))
bench.measure("validate.valid100", lambda: nested.valid(rows), rounds=1000)
bench.measure("validate.errors", lambda: plan.errors(invalid))
bench.measure("validate.patch", lambda: patch.check({"age": 31}))
