from engine.auth import auth
from engine.http import Group, Route

from ..app.controllers import HelloController
from ..app.requests import MeRequest, NameRequest, WorldRequest
from ..app.utils.cycle import api

def routes ( hello: HelloController ) -> Group:

    return api(
        "hello",
        Route.get("/hello", WorldRequest.to(hello.world), "hello.world").throttled("read"),
        Route.get("/hello/me", MeRequest.to(hello.me), "hello.me").guarded(auth.relay.guard("hello.read")),
        Route.get("/hello/<name>", NameRequest.to(hello.someone), "hello.someone").throttled("read"),
    )
