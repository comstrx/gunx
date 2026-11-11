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
