from engine.auth import auth
from engine.http import Group, Route

from ..app.controllers import SessionsController
from ..app.requests import CodeRequest, EndRequest, MeRequest, RefreshRequest, SessionRequest
from ..app.utils.cycle import api

def routes ( sessions: SessionsController ) -> Group:

    return api(
        "iam",
        Route.post("/sessions/code", CodeRequest.to(sessions.code), "sessions.code").throttled("start"),
        Route.post("/sessions", SessionRequest.to(sessions.store), "sessions.store").throttled("start"),
        Route.post("/sessions/refresh", RefreshRequest.to(sessions.refresh), "sessions.refresh").throttled("refresh"),
        Route.delete("/sessions", EndRequest.to(sessions.destroy), "sessions.destroy").guarded(auth.guard()),
        Route.get("/me", MeRequest.to(sessions.me), "me").guarded(auth.guard()),
    )
