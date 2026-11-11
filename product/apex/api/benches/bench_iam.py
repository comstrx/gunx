from engine.test import Bench, stage
from iam import make
import aiohttp

bench = Bench()

async def main () -> None:

    stage.wire()

    app = make()

    async with app.listen() as url, aiohttp.ClientSession() as session:

        await session.post(f"{url}/sessions/code", json={ "email": "admin@apex.test" })

        async with session.post(f"{url}/sessions", json={ "email": "admin@apex.test", "code": "000000" }) as started:

            access = (await started.json())["data"]["access"]

        async def me () -> None:

            headers = { "Authorization": f"Bearer {access}" }

            async with session.get(f"{url}/me", headers=headers) as reply: await reply.read()

        await bench.measure_async("sessions.me", me, rounds=500)

Bench.run(main())
