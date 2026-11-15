from engine.array import array
from engine.test import Bench

bench = Bench()
rows  = [{ "id": index, "team": index % 7, "score": index * 3 % 101 } for index in range(200)]
flat  = [index * 7 % 53 for index in range(200)]
deep  = [[index, [index, [index]]] for index in range(60)]

def group () -> None: array.group(rows, "team")

def index () -> None: array.index(rows, "id")

def pluck () -> None: array.pluck(rows, "score")

def where () -> None: array.where(rows, "score", ">", 50)

def unique () -> None: array.unique(flat)

def sort () -> None: array.sort(rows, "score")

def flatten () -> None: array.flatten(deep, 3)

def chunk () -> None: list(array.chunk(flat, 16))

def median () -> None: array.median(rows, "score")

def paginate () -> None: array.paginate(flat, 3, 20)

bench.measure("array.group", group)
bench.measure("array.index", index)
bench.measure("array.pluck", pluck)
bench.measure("array.where", where)
bench.measure("array.unique", unique)
bench.measure("array.sort", sort)
bench.measure("array.flatten", flatten)
bench.measure("array.chunk", chunk)
bench.measure("array.median", median)
bench.measure("array.paginate", paginate)


rows = [{ "id": i } for i in range(1000)]
sequence = tuple(range(1000))
mapping = { f"k{i}": i for i in range(1000) }
excluded = tuple(f"k{i}" for i in range(300))

bench.measure("array.first_where.early", lambda: array.first_where(rows, "id", 1))
bench.measure("array.after.early", lambda: array.after(sequence, 1))
bench.measure("array.omit.many", lambda: array.omit(mapping, *excluded), rounds=500)

matching_rows = [{"n": n} for n in range(1000)]
bench.measure("array.where.all1000", lambda: array.where(matching_rows, "n", ">=", 0), rounds=1000)

bench.measure("array.sole.filtered2000", lambda: array.sole(range(2000), lambda value: value == 1), rounds=500)

values = list(range(10000))
bench.measure("array.sum.streaming", lambda: array.sum(iter(values)), rounds=500)
bench.measure("array.batches", lambda: list(array.batch(iter(values), 100)), rounds=500)

bench.measure("array.median.stream", lambda: array.median(iter(range(10000))), rounds=300)
bench.measure("array.mode.stream", lambda: array.mode(iter(range(10000))), rounds=300)
