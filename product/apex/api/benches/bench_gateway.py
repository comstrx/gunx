from engine.test import Bench, stage
import aiohttp
import gateway
import hello

bench = Bench()

async def main () -> None:

    stage.wire()

    greet = hello.make()

    async with greet.listen() as hello_url:

        edge = gateway.make({ "iam": hello_url, "hello": hello_url })

        async with edge.listen() as url, aiohttp.ClientSession() as session:

            async def call () -> None:

                async with session.get(f"{url}/api/hello") as reply: await reply.read()

            await bench.measure_async("gateway.hello", call, rounds=500)

Bench.run(main())
