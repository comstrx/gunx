from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Any

from obstore.store import S3Store
from engine.error import Code, Fault
from engine.json import json
from .arch import KEY, keyed, NAME, Stored, unkeyed, WEEK
import obstore

class Disk:

    def __init__ ( self, name: str, store: Any, url: str | None = None, public: bool = False ) -> None:

        if type(name) is not str or not 0 < len(name) <= NAME or not name.isprintable(): raise self._unset_("name")
        if url is not None and (type(url) is not str or not url.startswith(("https://", "http://"))):

            raise self._unset_("url")

        self.name    = name
        self._store  = store
        self._url    = url.rstrip("/") if url else None
        self.public  = bool(public)

    async def put ( self, key: str, data: bytes ) -> Stored:

        keyed(key)

        if not isinstance(data, bytes | bytearray): raise Fault(Code.VALIDATION, reason="storage.data")

        try: await obstore.put_async(self._store, key, bytes(data))
        except Exception as error: raise Fault(Code.UNAVAILABLE, reason="storage.put", unknown=True) from error

        return Stored(self.name, key, len(data), self.url(key))

    async def get ( self, key: str ) -> bytes:

        keyed(key)

        try: result = await obstore.get_async(self._store, key)
        except FileNotFoundError as error: raise self._missing_(key) from error
        except Exception as error: raise Fault(Code.UNAVAILABLE, reason="storage.get", unknown=True) from error

        return bytes(await result.bytes_async())

    async def stream ( self, key: str, chunk: int = 1024 * 1024 ) -> AsyncIterator[bytes]:

        keyed(key)

        if type(chunk) is not int or chunk < 1: raise self._unset_("chunk")

        try: result = await obstore.get_async(self._store, key)
        except FileNotFoundError as error: raise self._missing_(key) from error
        except Exception as error: raise Fault(Code.UNAVAILABLE, reason="storage.get", unknown=True) from error

        async for piece in result.stream(min_chunk_size=chunk): yield bytes(piece)

    async def exists ( self, key: str ) -> bool:

        keyed(key)

        try: await obstore.head_async(self._store, key)
        except FileNotFoundError: return False
        except Exception as error: raise Fault(Code.UNAVAILABLE, reason="storage.head", unknown=True) from error

        return True

    async def missing ( self, key: str ) -> bool:

        return not await self.exists(key)

    async def json ( self, key: str ) -> Any:

        return json.decode(await self.get(key))

    async def info ( self, key: str ) -> dict[str, Any]:

        keyed(key)

        try: found = await obstore.head_async(self._store, key)
        except FileNotFoundError as error: raise self._missing_(key) from error
        except Exception as error: raise Fault(Code.UNAVAILABLE, reason="storage.head", unknown=True) from error

        return {
            "key": key, "size": int(found["size"]), "modified": found.get("last_modified"), "etag": found.get("e_tag"),
            "url": self.url(key),
        }

    async def append ( self, key: str, data: bytes ) -> Stored:

        held = await self.get(key) if await self.exists(key) else b""

        return await self.put(key, held + data)

    async def prepend ( self, key: str, data: bytes ) -> Stored:

        held = await self.get(key) if await self.exists(key) else b""

        return await self.put(key, data + held)

    async def move ( self, source: str, target: str ) -> None:

        await self.copy(source, target)
        await self.delete(source)

    async def size ( self, key: str ) -> int:

        return int((await self.info(key))["size"])

    async def delete ( self, key: str ) -> bool:

        if not await self.exists(key): return False

        try: await obstore.delete_async(self._store, key)
        except Exception as error: raise Fault(Code.UNAVAILABLE, reason="storage.delete", unknown=True) from error

        return True

    async def list ( self, prefix: str = "" ) -> list[str]:

        if type(prefix) is not str or len(prefix) > KEY or not prefix.isprintable(): raise unkeyed(prefix)

        found: list[str] = []

        try:

            async for batch in obstore.list(self._store, prefix or None):

                found.extend(str(item["path"]) for item in batch)

        except Exception as error: raise Fault(Code.UNAVAILABLE, reason="storage.list", unknown=True) from error

        return sorted(found)

    async def copy ( self, source: str, target: str ) -> None:

        keyed(source)
        keyed(target)

        try: await obstore.copy_async(self._store, source, target)
        except FileNotFoundError as error: raise self._missing_(source) from error
        except Exception as error: raise Fault(Code.UNAVAILABLE, reason="storage.copy", unknown=True) from error

    def url ( self, key: str ) -> str | None:

        return f"{self._url}/{key}" if self._url and self.public else None

    async def sign ( self, key: str, seconds: int = 900 ) -> str:

        keyed(key)

        if type(seconds) is not int or not 0 < seconds <= WEEK: raise self._unset_("seconds")
        if not isinstance(self._store, S3Store): raise Fault(Code.INTERNAL, reason="storage.sign")

        return str(await obstore.sign_async(self._store, "GET", key, timedelta(seconds=seconds)))

    def _missing_ ( self, key: str ) -> Fault:

        return Fault(Code.NOT_FOUND, reason="storage.missing", errors={ "key": [key] })

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="storage.settings", errors={ "setting": [what] })
