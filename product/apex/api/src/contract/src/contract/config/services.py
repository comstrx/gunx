from engine.error import Code, Fault

from ..app.models.service import Service

SERVICES: dict[str, Service] = {
    "gateway" : Service("gateway", 0, 8100),
    "iam"     : Service("iam", 1, 8101, ("users", "sessions")),
    "hello"   : Service("hello", 2, 8102),
    "notify"  : Service("notify", 3, 8103, ("devices", "notices")),
}

def layer_of ( name: str ) -> int:

    found = SERVICES.get(name)

    if found is None: raise Fault(Code.INTERNAL, reason="contract.service", errors={ "service": [name] })

    return found.layer

def may_call ( caller: str, callee: str ) -> bool:

    return layer_of(caller) < layer_of(callee)

def may_emit ( producer: str, consumer: str ) -> bool:

    return layer_of(producer) > layer_of(consumer)
