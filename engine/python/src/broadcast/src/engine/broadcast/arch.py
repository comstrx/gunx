from typing import TypeGuard

from engine.error import Code, Fault

TOPIC   = "engine:broadcast"
NAME    = 128
PAYLOAD = 256 * 1024

def named ( value: object ) -> TypeGuard[str]:

    return type(value) is str and 0 < len(value) <= NAME and value.isprintable()

def unset ( what: str ) -> Fault:

    return Fault(Code.INTERNAL, reason="broadcast.settings", errors={ "setting": [what] })
