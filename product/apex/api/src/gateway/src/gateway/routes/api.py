from engine.http import Group, Route

from ..app.controllers import DoorsController
from ..app.utils.cycle import api

def routes ( gateway: DoorsController ) -> Group:

    served = [
        Route.match((door["method"],), door["path"], gateway.forward(door["id"]), door["id"]).throttled(door["policy"])
        for door in gateway.table()
    ]

    return api(
        "gateway",
        *served,
        Route.get("/api/doors", gateway.index, "doors").hide(),
        Route.get("/api/openapi.json", gateway.gathered, "gathered").hide(),
    )
