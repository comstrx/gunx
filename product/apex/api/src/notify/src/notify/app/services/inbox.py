from typing import Any

from engine.auth import Actor
from engine.broadcast import broadcast
from engine.error import Fault
from engine.log import log
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

        return await self._tell_(actor.id, "updated", self.resource.one(await self.rows.read(actor.id, key)))

    async def test ( self, actor: Actor ) -> dict[str, Any]:

        notice = await self.rows.write(actor.id, actor.tenant, "Test notice", "Realtime delivery works.", kind="test")

        return await self._tell_(actor.id, "created", self.resource.one(notice))

    async def welcome ( self, user: str, tenant: str | None, who: str ) -> dict[str, Any]:

        notice = await self.rows.write(user, tenant, "Welcome back", f"Good to see you, {who}.", kind="welcome")

        await Push(notice=notice.id, user=user).dispatch()

        return await self._tell_(user, "created", self.resource.one(notice))

    async def push ( self, notice: str, user: str ) -> int:

        found   = await self.rows.own(user, notice)
        devices = await self.devices.of(user)

        if not devices: return 0

        made = notify.compose([device.token for device in devices], found.title, found.body, { "notice": found.id })

        await notify.push(made)

        return len(devices)

    async def _tell_ ( self, user: str, change: str, notice: dict[str, Any] ) -> dict[str, Any]:

        try: await broadcast.publish(f"notifications.{user}", f"notifications.{change}", notice)
        except Fault as fault: log.warning("notice.unheard", user=user, reason=fault.reason)

        return notice
