from typing import override

from engine.adapter import Receipt
from engine.error import Code, Fault
from engine.net import Remote
from .arch import Notice
from .pusher import Pusher

class Http(Pusher):

    name = "http"

    def __init__ ( self, remote: Remote, path: str = "/push" ) -> None:

        held: object = remote

        if not isinstance(held, Remote): raise self._unset_("remote")
        if type(path) is not str or not path.startswith("/") or not path.isprintable() or " " in path:

            raise self._unset_("path")

        self._remote = remote
        self._path   = path

    @override
    async def push ( self, notice: Notice ) -> Receipt:

        return self.receipt(await self.upstream(self._remote.post(self._path, data=notice.dump())))

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="notify.settings", errors={ "setting": [what] })
