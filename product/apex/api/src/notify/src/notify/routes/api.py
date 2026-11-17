from engine.auth import auth
from engine.http import Group, Route

from ..app.controllers import InboxController
from ..app.requests import DeviceRequest, IndexRequest, ReadRequest, TestRequest
from ..app.utils.cycle import api

def routes ( inbox: InboxController ) -> Group:

    register = Route.post("/devices", DeviceRequest.to(inbox.register), "devices.register")
    index    = Route.get("/notifications", IndexRequest.to(inbox.index), "notifications.index")
    test     = Route.post("/notifications/test", TestRequest.to(inbox.test), "notifications.test")
    read     = Route.post("/notifications/<notice>/read", ReadRequest.to(inbox.read), "notifications.read")

    return api(
        "notify",
        register.guarded(auth.relay.guard("devices.write")),
        index.guarded(auth.relay.guard("notifications.read")).throttled("read"),
        test.guarded(auth.relay.guard("notifications.read")),
        read.guarded(auth.relay.guard("notifications.read")),
    )
