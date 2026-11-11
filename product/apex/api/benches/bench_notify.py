from engine.auth import Actor, auth
from engine.test import Bench, stage
from iam.database.seeders.tenants import ZAIN
from iam.database.seeders.users import SUPER
from notify import make
import aiohttp

bench = Bench()

async def main () -> None:

    stage.wire()

    app = make()

    async with app.listen() as url, aiohttp.ClientSession() as session:

        headers = auth.relay.sign(Actor(SUPER, ("super",), ("devices.write", "notifications.read"), ZAIN), "bench")

        await session.post(f"{url}/devices", json={ "token": "bench-device-token", "platform": "web" }, headers=headers)

        async def mine () -> None:

            async with session.get(f"{url}/notifications", headers=headers) as reply: await reply.read()

        await bench.measure_async("notifications.index", mine, rounds=300)

Bench.run(main())
