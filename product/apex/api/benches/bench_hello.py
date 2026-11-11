from engine.test import Bench, stage
from hello import make
import aiohttp

bench = Bench()

async def main () -> None:

    stage.wire()

    app = make()

    async with app.listen() as url, aiohttp.ClientSession() as session:

        async def call () -> None:

            async with session.get(f"{url}/hello") as reply: await reply.read()

        await bench.measure_async("hello.world", call, rounds=1000)

Bench.run(main())
