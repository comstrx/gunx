from engine.search import Document, Memory, Query, Schema
from engine.test import Bench

bench = Bench()

async def main () -> None:

    engine = Memory()

    await engine.prepare("docs", Schema(("title", "body"), ("lang",), ("price",)))

    documents = [
        Document(str(n), {
            "title": f"item {n} rust go", "body": " ".join(f"word{(n * k) % 97}" for k in range(40)),
            "lang": "en" if n % 2 else "ar", "price": n,
        })
        for n in range(2000)
    ]

    await engine.index("docs", documents)

    query = Query("rust word5", filters={ "lang": "en" }, limit=10)

    async def search () -> None: await engine.query("docs", query)

    await bench.measure_async("search.memory.query", search, rounds=300)

Bench.run(main())
