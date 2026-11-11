from typing import Any

from engine.auth import Actor
from engine.notify import notify

from ..jobs import Push
from ..repositories import Devices, Notices
from ..resources import DeviceResource, NoticeResource
from ..utils.cycle import Service

class Inbox(Service[Notices]):

    resource = NoticeResource

    def __init__ ( self, rows: Notices, devices: Devices ) -> None:

        super().__init__(rows)

        self.devices = devices

    async def register ( self, actor: Actor, token: str, platform: str ) -> dict[str, Any]:

        return DeviceResource.one(await self.devices.register(actor.id, actor.tenant, token, platform))

    async def mine ( self, actor: Actor, page: int, limit: int ) -> tuple[list[dict[str, Any]], int]:

        rows, total = await self.rows.of(actor.id, page, limit)

        return self.resource.many(rows), total

    async def read ( self, actor: Actor, key: str ) -> dict[str, Any]:

        return self.resource.one(await self.rows.read(actor.id, key))

    async def welcome ( self, user: str, tenant: str | None, who: str ) -> dict[str, Any]:

        notice = await self.rows.write(user, tenant, "Welcome back", f"Good to see you, {who}.", kind="welcome")

        await Push(notice=notice.id, user=user).dispatch()

        return self.resource.one(notice)

    async def push ( self, notice: str, user: str ) -> int:

        found   = await self.rows.own(user, notice)
        devices = await self.devices.of(user)

        if not devices: return 0

        made = notify.compose([device.token for device in devices], found.title, found.body, { "notice": found.id })

        await notify.push(made)

        return len(devices)
