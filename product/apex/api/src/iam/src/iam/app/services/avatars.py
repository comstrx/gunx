from typing import Any

from engine.error import Code, Fault
from engine.storage import Disk, Policy

MEDIA = { "png": "image/png", "jpg": "image/jpeg", "webp": "image/webp" }

class Avatars:

    def __init__ ( self, disk: Disk, policy: Policy ) -> None:

        self.disk   = disk
        self.policy = policy

    @staticmethod
    def key ( user: str ) -> str:

        return f"avatars/{user}"

    async def store ( self, user: str, data: bytes ) -> dict[str, Any]:

        kind = self.policy.sniff(bytes(data[:8]))

        if kind not in MEDIA:

            raise Fault(Code.UNSUPPORTED_MEDIA, reason="avatar.kind", errors={ "file": ["png, jpg or webp"] })

        self.policy.check(f"avatar.{kind}", len(data), bytes(data[:8]))

        stored = await self.disk.put(self.key(user), data)

        return { "url": self.address(user, stored.size), "size": stored.size, "type": MEDIA[kind] }

    async def show ( self, user: str ) -> tuple[bytes, str]:

        if not await self.disk.exists(self.key(user)): raise Fault(Code.NOT_FOUND, reason="avatar.missing")

        data = await self.disk.get(self.key(user))

        return data, MEDIA.get(self.policy.sniff(bytes(data[:8])) or "", "application/octet-stream")

    async def remove ( self, user: str ) -> bool:

        return await self.disk.delete(self.key(user))

    async def url ( self, user: str ) -> str | None:

        if not await self.disk.exists(self.key(user)): return None

        return self.address(user, await self.disk.size(self.key(user)))

    @staticmethod
    def address ( user: str, size: int ) -> str:

        return f"/api/users/{user}/avatar?v={size}"
