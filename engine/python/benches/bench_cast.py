from engine.cast import cast
from engine.test import Bench

bench = Bench()
bench.measure("cast.integer", lambda: cast.integer("12345"))
bench.measure("cast.number", lambda: cast.number("123.45"))
bench.measure("cast.boolean", lambda: cast.boolean("false"))
bench.measure("cast.money", lambda: cast.money("123.45", "USD"))
bench.measure("cast.list", lambda: cast.list("1,2,3", using=cast.integer))
bench.measure("cast.dict", lambda: cast.dict('{"a":1,"b":2}'))

large_rows = list(range(10000))
large_fields = {str(index): index for index in range(1000)}
bench.measure("cast.list.large", lambda: cast.list(large_rows), rounds=1000)
bench.measure("cast.dict.large", lambda: cast.dict(large_fields), rounds=1000)
