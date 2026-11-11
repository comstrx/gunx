from engine.ai import Ai, Mock
from engine.log import log
from engine.rag import Hit, Memory, Rag
from engine.test import Bench
from pathlib import Path
import asyncio

bench = Bench()
loop  = asyncio.new_event_loop()
brain = Ai()
rag   = Rag()
store = Memory()
text  = " ".join(f"Sentence number {at} talks about cats, dogs and the weather in Cairo." for at in range(400))
hits  = [Hit("doc.txt", at, f"Passage {at} about the weather in Cairo.", 1 - at / 100) for at in range(50)]

log.setup("error", "json", Path("/dev/null"))
brain.use(Mock(dimensions=16), default=True, tasks=["embed", "chat", "extract"])
rag.setup(brain, store, size=600, overlap=80, dimensions=16)

def chunking () -> None: rag.chunk("docs", "a.txt", text)

def piecing () -> None: rag.pieces(text)

def citing () -> None: rag.cite(hits)

async def indexing () -> None: await rag.index("bench", "a.txt", text)

async def searching () -> None: await rag.search("bench", "weather in Cairo", limit=5)

async def answering () -> None: await rag.answer("bench", "What is the weather in Cairo?", limit=3)

async def seed () -> None:

    for at in range(20): await rag.index("bench", f"doc-{at}.txt", text)

bench.measure("rag.chunk.400sentences", chunking, rounds=2000)
bench.measure("rag.pieces.400sentences", piecing, rounds=2000)
bench.measure("rag.cite.50", citing)
loop.run_until_complete(bench.measure_async("rag.index.memory", indexing, rounds=300))
loop.run_until_complete(seed())
loop.run_until_complete(bench.measure_async("rag.search.memory.1000", searching, rounds=500))
loop.run_until_complete(bench.measure_async("rag.answer.mock", answering, rounds=300))
loop.close()
log.close()
