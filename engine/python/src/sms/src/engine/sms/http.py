from typing import override

from engine.adapter import Receipt
from engine.error import Code, Fault
from engine.net import Remote
from .arch import Text
from .texter import Texter

class Http(Texter):

    name         = "http"
    capabilities = frozenset({ "sms", "whatsapp" })

    def __init__ ( self, remote: Remote, path: str = "/messages" ) -> None:

        held: object = remote

        if not isinstance(held, Remote): raise self._unset_("remote")
        if type(path) is not str or not path.startswith("/") or not path.isprintable() or " " in path:

            raise self._unset_("path")

        self._remote = remote
        self._path   = path

    @override
    async def send ( self, text: Text ) -> Receipt:

        return self.receipt(await self.upstream(self._remote.post(self._path, data=text.dump())))

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="sms.settings", errors={ "setting": [what] })
