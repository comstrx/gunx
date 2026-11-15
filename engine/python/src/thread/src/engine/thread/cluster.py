from collections.abc import Callable, Mapping
from typing import Any, ClassVar

from engine.error import Code, Fault
from engine.log import log
from .arch import Link, REMOTES, environment, space
import asyncio, contextlib, inspect, sys, threading

class Cluster:

    __slots__ = ("_held",)

    _link: ClassVar[Link | None] = None
    _lock: ClassVar[threading.Lock] = threading.Lock()

    def __init__ ( self, link: Link ) -> None:

        self._held = link

    @classmethod
    async def connect (
        cls, address: str | None = None, *, namespace: str | None = None,
        runtime_env: Mapping[str, Any] | None = None,
    ) -> Cluster:

        if address is not None and (type(address) is not str or not address.strip()):

            raise Fault(Code.INTERNAL, reason="thread.address")

        name = space(namespace)
        env  = environment(runtime_env)

        return cls(await asyncio.to_thread(cls._linked_, address, name, env))

    async def call ( self, handler: Callable[..., Any], item: Any ) -> Any:

        ray = self._live_()
        ref = self._remote_(handler).remote(item)

        pending = asyncio.create_task(self._result_(ray, ref))

        try: return await asyncio.shield(pending)
        except asyncio.CancelledError:

            pending.add_done_callback(self._settled_)

            with contextlib.suppress(Exception): ray.cancel(ref)

            raise

    async def nodes ( self ) -> int:

        ray   = self._live_()
        found = await asyncio.to_thread(ray.nodes)

        return sum(1 for node in found if not isinstance(node, dict) or node.get("Alive", True))

    async def close ( self ) -> None:

        await asyncio.to_thread(self._shut_)

    @staticmethod
    async def _result_ ( ray: Any, ref: Any ) -> Any:

        try: return await ref if inspect.isawaitable(ref) else await asyncio.to_thread(ray.get, ref)
        except (SystemExit, KeyboardInterrupt) as error: raise Fault.wrap(error, reason="thread.failed") from error

    @staticmethod
    def _settled_ ( pending: asyncio.Future[Any] ) -> None:

        if not pending.cancelled(): pending.exception()

    def _live_ ( self ) -> Any:

        held = self._held

        if held is not Cluster._link or not held.module.is_initialized():

            raise Fault(Code.CONFLICT, reason="thread.cluster", message="Ray connection is no longer active")

        return held.module

    def _remote_ ( self, handler: Callable[..., Any] ) -> Any:

        held = self._held
        remotes = held.remotes

        try: made = remotes.get(handler)
        except TypeError: return self._wrapped_(handler)

        if made is None:

            if len(remotes) >= REMOTES: remotes.clear()

            made = remotes[handler] = self._wrapped_(handler)

        return made

    def _wrapped_ ( self, handler: Callable[..., Any] ) -> Any:

        if inspect.isfunction(handler): return self._held.module.remote(handler)

        def call ( item: Any ) -> Any: return handler(item)

        return self._held.module.remote(call)

    def _shut_ ( self ) -> None:

        with Cluster._lock:

            held = self._held

            if held is not Cluster._link: return
            if held.module.is_initialized(): held.module.shutdown()

            held.remotes.clear()

            Cluster._link = None

    @classmethod
    def _linked_ ( cls, address: str | None, namespace: str | None, runtime_env: dict[str, Any] | None ) -> Link:

        try: import ray
        except (ImportError, OSError) as error:

            version = ".".join(str(part) for part in sys.version_info[:3])
            message = (
                f"Ray could not be loaded on Python {version}. Install a Ray build compatible with this interpreter "
                "and use matching Python versions on the driver and cluster. Changing the host format cannot fix this."
            )

            log.warning("thread.ray", python=version, message=message)

            raise Fault(Code.INTERNAL, reason="thread.ray", message=message) from error

        with cls._lock:

            held = cls._link

            if not ray.is_initialized():

                options: dict[str, Any] = {}

                if namespace is not None: options["namespace"] = namespace
                if runtime_env is not None: options["runtime_env"] = environment(runtime_env)

                ray.init(address=address, ignore_reinit_error=True, log_to_driver=False, **options)

                held = cls._link = Link(ray, address or "local", namespace, runtime_env or {})

            elif held is None or held.module is not ray:

                raise Fault(Code.CONFLICT, reason="thread.cluster", message="Ray was initialized outside this owner")

            elif (
                (address is not None and address != held.address)
                or (namespace is not None and namespace != held.namespace)
                or (runtime_env is not None and runtime_env != held.runtime_env)
            ):

                raise Fault(Code.CONFLICT, reason="thread.cluster", message="Ray connection options differ")

            return held
