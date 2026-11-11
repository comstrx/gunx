from collections.abc import Callable
from typing import Any, ClassVar

from engine.error import Code, Fault
from .arch import REMOTES
import asyncio, contextlib, inspect, threading

class Cluster:

    _address: ClassVar[str] = ""
    _module: ClassVar[Any] = None
    _lock: ClassVar[threading.Lock] = threading.Lock()
    _remotes: ClassVar[dict[Callable[..., Any], Any]] = {}

    def __init__ ( self, module: Any ) -> None:

        self._ray = module

    @classmethod
    async def connect ( cls, address: str | None = None ) -> Cluster:

        if address is not None and (type(address) is not str or not address):

            raise Fault(Code.INTERNAL, reason="thread.address")

        return cls(await asyncio.to_thread(cls._linked_, address))

    async def call ( self, handler: Callable[..., Any], item: Any ) -> Any:

        ref = self._remote_(handler).remote(item)

        try: return await (ref if inspect.isawaitable(ref) else asyncio.to_thread(self._ray.get, ref))
        except asyncio.CancelledError:

            with contextlib.suppress(Exception): self._ray.cancel(ref)

            raise

        except (SystemExit, KeyboardInterrupt) as error: raise Fault.wrap(error, reason="thread.failed") from error

    async def nodes ( self ) -> int:

        found = await asyncio.to_thread(self._ray.nodes)

        return sum(1 for node in found if not isinstance(node, dict) or node.get("Alive", True))

    async def close ( self ) -> None:

        await asyncio.to_thread(self._shut_)

    def _remote_ ( self, handler: Callable[..., Any] ) -> Any:

        remotes = Cluster._remotes

        try: made = remotes.get(handler)
        except TypeError: return self._ray.remote(handler)

        if made is None:

            if len(remotes) >= REMOTES: remotes.clear()

            made = remotes[handler] = self._ray.remote(handler)

        return made

    def _shut_ ( self ) -> None:

        with Cluster._lock:

            if self._ray.is_initialized(): self._ray.shutdown()

            Cluster._address = ""

            Cluster._remotes.clear()

    @classmethod
    def _linked_ ( cls, address: str | None ) -> Any:

        try: import ray
        except ImportError as error:

            raise Fault(Code.INTERNAL, reason="thread.ray", message="ray is required") from error

        with Cluster._lock:

            if ray is not Cluster._module:

                Cluster._module, Cluster._address = ray, ""

                Cluster._remotes.clear()

            if not ray.is_initialized():

                ray.init(address=address, ignore_reinit_error=True, log_to_driver=False)

                Cluster._address = address or "local"

            elif address is not None and Cluster._address and address != Cluster._address:

                raise Fault(Code.CONFLICT, reason="thread.cluster")

        return ray
